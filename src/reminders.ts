/**
 * موتور یادآوری — با Cron Trigger هر دقیقه اجرا می‌شود.
 *
 * اصل طلایی: یادآوری «فقط» وقتی می‌رود که کاربر خودش الگو را خواسته باشد
 * (هر روز ساعت ۸ / هر ۳ ساعت / ۱ ساعت قبل از ددلاین / فردا ساعت ۵ …).
 * بدون درخواستِ صریح → سکوت مطلق (حتی بعد از سررسید).
 * تسک‌های قدیمیِ «default» هم مثل «none» ساکت‌اند.
 */
import type { Env, TaskRow, UserRow } from "./types";
import { getUser, tasksToAutoStart } from "./db";
import { escapeHtml, sendMessage } from "./telegram";
import { displayName, truncate } from "./format";
import { endOfDayTehran, faDigits, fmtDate, humanizeHoursLeft, startOfDayTehran, todayTehranISO } from "./dates";
import { reminderSpecText } from "./dates";

/**
 * لحظه‌ی موعدِ یادآوری برای یک تسک با الگوی داینامیک — یا null اگر هنوز وقتش نرسیده.
 */
function dynamicDue(
  task: TaskRow,
  now: number
): { fire: boolean; once: boolean; text: string | null } {
  const lastMs = task.last_reminded_at ? Date.parse(task.last_reminded_at) : 0;
  switch (task.reminder_type) {
    case "none":
      return { fire: false, once: false, text: null };

    case "daily": {
      if (!task.reminder_time) return { fire: false, once: false, text: null };
      // روزِ شروع نرسیده؟ هنوز اذیت نکن
      if (task.start_at && now < Date.parse(task.start_at)) return { fire: false, once: false, text: null };
      if (task.start_date && now < startOfDayTehran(task.start_date)) return { fire: false, once: false, text: null };
      const [h, m] = task.reminder_time.split(":").map(Number);
      // ساعتِ امروزِ تهران رسیده؟ و امروز هنوز نفرستاده‌ایم؟
      const nowTeh = new Date(now + 3.5 * 3_600_000);
      const todayMin = nowTeh.getUTCHours() * 60 + nowTeh.getUTCMinutes();
      if (todayMin < h * 60 + m) return { fire: false, once: false, text: null };
      const lastDayTeh = new Date(lastMs + 3.5 * 3_600_000).toISOString().slice(0, 10);
      const todayISO = new Date(now + 3.5 * 3_600_000).toISOString().slice(0, 10);
      if (lastMs && lastDayTeh === todayISO) return { fire: false, once: false, text: null };
      return { fire: true, once: false, text: `🔔 <b>یادآوری روزانه</b> (ساعت ${faDigits(task.reminder_time)})` };
    }

    case "every_hours": {
      const n = task.reminder_interval_hours ?? 0;
      if (n < 1) return { fire: false, once: false, text: null };
      if (task.start_at && now < Date.parse(task.start_at)) return { fire: false, once: false, text: null };
      if (task.start_date && now < startOfDayTehran(task.start_date)) return { fire: false, once: false, text: null };
      // اولین یادآوری یک بازه‌ی کامل بعد از ساخت؛ بعدش هر N ساعت از آخرین پیام
      const base = lastMs || (task.created_at ? Date.parse(task.created_at) : 0);
      if (now - base < n * 3_600_000) return { fire: false, once: false, text: null };
      return { fire: true, once: false, text: `🔔 یادآوری هر ${faDigits(n)} ساعت` };
    }

    case "before_deadline": {
      const lead = (task.reminder_lead_minutes ?? 0) * 60_000;
      if (!lead) return { fire: false, once: false, text: null };
      const dueAt = task.due_at ? Date.parse(task.due_at) : task.due_date ? endOfDayTehran(task.due_date) : 0;
      if (!dueAt || now < dueAt - lead || now > dueAt + 6 * 3_600_000) return { fire: false, once: false, text: null };
      if (task.reminder_done) return { fire: false, once: false, text: null };
      const leftH = (dueAt - now) / 3_600_000;
      return {
        fire: true,
        once: true,
        text: `⏰ <b>ددلاین نزدیکه!</b> فقط ${humanizeHoursLeft(Math.max(leftH, 0.01))} مونده`,
      };
    }

    case "once": {
      if (!task.reminder_at || task.reminder_done) return { fire: false, once: false, text: null };
      if (now < Date.parse(task.reminder_at)) return { fire: false, once: false, text: null };
      return {
        fire: true,
        once: true,
        text: `🔔 <b>یادآوری برای</b> «${escapeHtml(truncate(task.title, 60))}» — 🆔 ${faDigits(task.id)}`,
      };
    }

    default:
      return { fire: false, once: false, text: null };
  }
}

export async function runReminders(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM tasks WHERE status != 'done' ORDER BY id LIMIT 500"
  ).all<TaskRow>();
  if (!results?.length) return;

  let sent = 0;
  for (const task of results) {
    try {
      // فقط الگوهای صریحِ کاربر شلیک می‌کنند؛ default/none ساکت‌اند
      const d = dynamicDue(task, Date.now());
      if (!d.fire) continue;

      const delivered = await sendReminder(env, task, d.text);
      if (delivered) sent++;
      await env.DB.prepare(
        d.once
          ? "UPDATE tasks SET last_reminded_at = ?, reminder_count = reminder_count + 1, reminder_done = 1 WHERE id = ?"
          : "UPDATE tasks SET last_reminded_at = ?, reminder_count = reminder_count + 1 WHERE id = ?"
      )
        .bind(new Date().toISOString(), task.id)
        .run();
    } catch (err) {
      console.error(`[reminders] task ${task.id} failed:`, err);
    }
  }
  console.log(`[reminders] checked=${results.length} sent=${sent}`);
}

async function sendReminder(env: Env, task: TaskRow, head: string | null): Promise<boolean> {
  const assignee = await getUser(env, task.assignee_id);
  const creator = await getUser(env, task.creator_id);
  // یادآوری اول به مسئول می‌رود؛ اگر چتی از او نداریم (هرگز با بات حرف نزده) به ایجادکننده
  const target = assignee?.chat_id ?? creator?.chat_id;
  if (!target) {
    console.log(`[reminders] no chat_id for task ${task.id} (assignee=${task.assignee_id})`);
    return false;
  }
  // 🎴 دکمه‌ی باز کردن کارت — به‌جای دستورهای متنی
  await sendMessage(env, target, reminderText(task, assignee, head), {
    reply_markup: {
      inline_keyboard: [[{ text: "🎴 باز کردن کارت تسک", callback_data: `card|${task.id}` }]],
    },
  });
  return true;
}

function reminderText(task: TaskRow, assignee: UserRow | null, dynamicHead: string | null): string {
  const title = escapeHtml(truncate(task.title, 80));
  const id = task.id;
  const who = assignee ? `${displayName(assignee)}، ` : "";
  // یادآوریِ الگویی — همان که کاربر خواسته
  const spec = reminderSpecText(task);
  return [
    dynamicHead ?? "<b>یادآوری</b>",
    `${who}تسک «${title}» — شناسه ${faDigits(id)}`,
    task.due_at || task.due_date
      ? `سررسید: ${fmtDate(task.due_date)}${task.due_at ? ` — ساعت ${faDigits(task.due_at.slice(11, 16))}` : ""}`
      : "",
    spec ? `الگو: ${escapeHtml(spec)}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * شروع خودکار: با رسیدن «تاریخ شروع»، وضعیت تسک به «در حال انجام» می‌رود
 * و به مسئولش پیام می‌رود.
 */
export async function runAutoStart(env: Env): Promise<void> {
  const today = todayTehranISO();
  const tasks = await tasksToAutoStart(env, today);
  if (!tasks.length) return;
  let flipped = 0;
  for (const task of tasks) {
    // اگر ساعتِ دقیق شروع هنوز نرسیده، فعلاً نشود
    if (task.start_at && Date.parse(task.start_at) > Date.now()) continue;
    try {
      await env.DB.prepare(
        "UPDATE tasks SET status = 'in_progress', started_at = COALESCE(started_at, ?), auto_start = 0 WHERE id = ?"
      )
        .bind(new Date().toISOString(), task.id)
        .run();
      flipped++;

      const assignee = await getUser(env, task.assignee_id);
      const creator = await getUser(env, task.creator_id);
      const target = assignee?.chat_id ?? creator?.chat_id;
      if (target) {
        await sendMessage(
          env,
          target,
          `🚦 وقتش رسید! تسک «${escapeHtml(truncate(task.title, 80))}» از امروز <b>در حال انجام</b> است — بزن بریم 💪`,
          { reply_markup: { inline_keyboard: [[{ text: "🎴 باز کردن کارت تسک", callback_data: `card|${task.id}` }]] } }
        );
      }
    } catch (err) {
      console.error(`[auto-start] task ${task.id} failed:`, err);
    }
  }
  console.log(`[auto-start] ${flipped}/${tasks.length} task(s) → in_progress`);
}
