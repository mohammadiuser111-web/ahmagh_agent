/**
 * موتور یادآوری — با Cron Trigger هر ۱۰ دقیقه اجرا می‌شود
 * و برای تسک‌های باز، متناسب با فاصله تا سررسید به «مسئول» پیام می‌دهد.
 */
import type { Env, TaskRow, UserRow } from "./types";
import { getUser, tasksToAutoStart } from "./db";
import { escapeHtml, sendMessage } from "./telegram";
import { displayName, truncate } from "./format";
import { endOfDayTehran, faDigits, fmtDate, humanizeHoursLeft, startOfDayTehran, todayTehranISO } from "./dates";
import { reminderSpecText } from "./dates";

/** بازه‌های یادآوری بر حسب ساعت */
export const REMINDER_INTERVALS_HOURS = {
  overdue: 2,      // سررسید گذشته → هر ۲ ساعت
  dueSoon24h: 4,   // کمتر از ۲۴ ساعت مانده → هر ۴ ساعت
  dueSoon72h: 12,  // ۱ تا ۳ روز مانده → هر ۱۲ ساعت
  normal: 24,      // بیش از ۳ روز مانده → هر ۲۴ ساعت
  noDueDate: 48,   // بدون تاریخ پایان → هر ۴۸ ساعت
} as const;

/**
 * الگوریتم یادآوری:
 * - تسک تمام‌شده → هیچ یادآوری‌ای نیست.
 * - تاریخ شروعِ آینده → قبل از رسیدن روزِ شروع اذیت نمی‌کند.
 * - با نزدیک شدن سررسید، بازه‌ها کوتاه‌تر می‌شوند و بعد از سررسید تند می‌شود.
 */
export function reminderIntervalHours(
  task: Pick<TaskRow, "status" | "start_date" | "start_at" | "due_date" | "due_at">,
  now: number = Date.now()
): number | null {
  if (task.status === "done") return null;
  // قبل از موعدِ شروع اذیت نکن (اگر ساعت دقیق گفته شده، همان لحظه ملاک است)
  if (task.start_at && now < Date.parse(task.start_at)) return null;
  if (task.start_date && now < startOfDayTehran(task.start_date)) return null;

  let dueAt: number;
  if (task.due_at) dueAt = Date.parse(task.due_at);
  else if (task.due_date) dueAt = endOfDayTehran(task.due_date);
  else return REMINDER_INTERVALS_HOURS.noDueDate;

  if (now > dueAt) return REMINDER_INTERVALS_HOURS.overdue;
  const hoursLeft = (dueAt - now) / 3_600_000;
  if (hoursLeft <= 24) return REMINDER_INTERVALS_HOURS.dueSoon24h;
  if (hoursLeft <= 72) return REMINDER_INTERVALS_HOURS.dueSoon72h;
  return REMINDER_INTERVALS_HOURS.normal;
}

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
      return { fire: true, once: true, text: `🔔 یادآوری‌ای که خواستی` };
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
      let fire = false;
      let once = false;
      let head: string | null = null;

      if (task.reminder_type && task.reminder_type !== "default") {
        const d = dynamicDue(task, Date.now());
        fire = d.fire;
        once = d.once;
        head = d.text;
      } else {
        // الگوریتم پلکانی پیش‌فرض
        const intervalHours = reminderIntervalHours(task);
        if (intervalHours == null) continue;
        const lastRemindedMs = task.last_reminded_at ? Date.parse(task.last_reminded_at) : 0;
        const elapsedHours = (Date.now() - lastRemindedMs) / 3_600_000;
        if (elapsedHours < intervalHours) continue;
        fire = true;
      }

      if (!fire) continue;

      const delivered = await sendReminder(env, task, head);
      if (delivered) sent++;
      await env.DB.prepare(
        once
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
  await sendMessage(env, target, reminderText(task, assignee, head));
  return true;
}

function reminderText(task: TaskRow, assignee: UserRow | null, dynamicHead: string | null): string {
  const title = escapeHtml(truncate(task.title, 80));
  const id = task.id;
  const now = Date.now();
  const count = task.reminder_count;

  if (dynamicHead !== null) {
    // 🔔 یادآوری داینامیک — الگویی که خود کاربر خواسته
    const spec = reminderSpecText(task);
    return [
      dynamicHead,
      `تسک «${title}»`,
      task.due_at || task.due_date ? `🏁 سررسید: ${fmtDate(task.due_date)}${task.due_at ? ` — ساعت ${faDigits(task.due_at.slice(11, 16))}` : ""}` : "",
      spec ? `🔔 الگو: ${escapeHtml(spec)}` : "",
      "",
      `✅ تمومش کردی؟ /done ${id}`,
      `🔍 جزئیات: /task ${id}`,
    ]
      .filter((l) => l !== "")
      .join("\n");
  }

  let head: string;
  if (task.due_date && now > endOfDayTehran(task.due_date)) {
    // سررسید گذشته — لحن کم‌کم تند می‌شود
    head =
      count < 3
        ? `⏰ <b>یادآوری</b> — تسک «${title}» زمانش گذشته!`
        : count < 8
          ? `😤 تعارف رو بذار کنار؛ تسک «${title}» هنوز تموم نشده!`
          : `🚨 چقدر قراره فرار کنی؟! تسک «${title}» هنوز اونجاست و منتظرته!`;
  } else if (task.due_date) {
    const hoursLeft = (endOfDayTehran(task.due_date) - now) / 3_600_000;
    head =
      hoursLeft <= 24
        ? `⏳ زمان داره تموم می‌شه! تسک «${title}» ${humanizeHoursLeft(hoursLeft)} دیگه سررسیده.`
        : `🔔 <b>یادآوری تسک</b> «${title}» — سررسید: ${fmtDate(task.due_date)}`;
  } else {
    head = `📌 تسک «${title}» سررسید مشخصی نداره؛ کی می‌خوای دست بگیریش؟`;
  }

  const tail =
    task.status === "not_started"
      ? "هنوز شروعش هم نکردی که! 🐌"
      : "دیدی تا کجا رسوندیش، ادامهش بده 💪";

  const who = assignee ? `${displayName(assignee)}، ` : "";
  return [
    `${who}هوات هست 👀`,
    head,
    "",
    tail,
    "",
    `✅ تمومش کردی؟ /done ${id}`,
    `🔍 جزئیات: /task ${id}`,
  ].join("\n");
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
          `🚦 وقتش رسید! تسک «${escapeHtml(truncate(task.title, 80))}» از امروز <b>در حال انجام</b> است — بزن بریم 💪` +
            `\n\n✅ تمومش کردی؟ /done ${task.id}` +
            `\n🔍 جزئیات: /task ${task.id}`
        );
      }
    } catch (err) {
      console.error(`[auto-start] task ${task.id} failed:`, err);
    }
  }
  console.log(`[auto-start] ${flipped}/${tasks.length} task(s) → in_progress`);
}
