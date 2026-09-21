/**
 * موتور یادآوری — با Cron Trigger هر ۱۰ دقیقه اجرا می‌شود
 * و برای تسک‌های باز، متناسب با فاصله تا سررسید به «مسئول» پیام می‌دهد.
 */
import type { Env, TaskRow, UserRow } from "./types";
import { getUser } from "./db";
import { escapeHtml, sendMessage } from "./telegram";
import { displayName, truncate } from "./format";
import { endOfDayTehran, faDigits, fmtDate, humanizeHoursLeft, startOfDayTehran } from "./dates";

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
  task: Pick<TaskRow, "status" | "start_date" | "due_date">,
  now: number = Date.now()
): number | null {
  if (task.status === "done") return null;
  if (task.start_date && now < startOfDayTehran(task.start_date)) return null;
  if (!task.due_date) return REMINDER_INTERVALS_HOURS.noDueDate;
  const dueAt = endOfDayTehran(task.due_date);
  if (now > dueAt) return REMINDER_INTERVALS_HOURS.overdue;
  const hoursLeft = (dueAt - now) / 3_600_000;
  if (hoursLeft <= 24) return REMINDER_INTERVALS_HOURS.dueSoon24h;
  if (hoursLeft <= 72) return REMINDER_INTERVALS_HOURS.dueSoon72h;
  return REMINDER_INTERVALS_HOURS.normal;
}

export async function runReminders(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM tasks WHERE status != 'done' ORDER BY id LIMIT 500"
  ).all<TaskRow>();
  if (!results?.length) return;

  let sent = 0;
  for (const task of results) {
    const intervalHours = reminderIntervalHours(task);
    if (intervalHours == null) continue;

    const lastRemindedMs = task.last_reminded_at ? Date.parse(task.last_reminded_at) : 0;
    const elapsedHours = (Date.now() - lastRemindedMs) / 3_600_000;
    if (elapsedHours < intervalHours) continue;

    try {
      const delivered = await sendReminder(env, task);
      if (delivered) sent++;
      await env.DB.prepare(
        "UPDATE tasks SET last_reminded_at = ?, reminder_count = reminder_count + 1 WHERE id = ?"
      )
        .bind(new Date().toISOString(), task.id)
        .run();
    } catch (err) {
      console.error(`[reminders] task ${task.id} failed:`, err);
    }
  }
  console.log(`[reminders] checked=${results.length} sent=${sent}`);
}

async function sendReminder(env: Env, task: TaskRow): Promise<boolean> {
  const assignee = await getUser(env, task.assignee_id);
  const creator = await getUser(env, task.creator_id);
  // یادآوری اول به مسئول می‌رود؛ اگر چتی از او نداریم (هرگز با بات حرف نزده) به ایجادکننده
  const target = assignee?.chat_id ?? creator?.chat_id;
  if (!target) {
    console.log(`[reminders] no chat_id for task ${task.id} (assignee=${task.assignee_id})`);
    return false;
  }
  await sendMessage(env, target, reminderText(task, assignee));
  return true;
}

function reminderText(task: TaskRow, assignee: UserRow | null): string {
  const title = escapeHtml(truncate(task.title, 80));
  const id = task.id;
  const now = Date.now();
  const count = task.reminder_count;

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
