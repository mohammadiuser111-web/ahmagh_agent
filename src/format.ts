/**
 * قالب‌بندی پیام‌ها: کارت تسک، وضعیت‌ها، کیبورد شیشه‌ای
 */
import type { TaskRow, TaskStatus, UserRow } from "./types";
import { escapeHtml } from "./telegram";
import { enDigits, faDigits, fmtDate, fmtDateTime, fmtTimeTehran, reminderSpecText } from "./dates";

export const STATUS_EMOJI: Record<TaskStatus, string> = {
  not_started: "⬜️",
  in_progress: "🔄",
  done: "✅",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "شروع‌نشده",
  in_progress: "در حال انجام",
  done: "تمام‌شده",
};

/** پذیرش وضعیت به انگلیسی و فارسی (با خط تیره یا نیم‌فاصله) */
export function parseStatus(raw: string): TaskStatus | null {
  // فاصله و نیم‌فاصله هر دو به «_» تبدیل می‌شوند تا «در حال انجام» و «درحال‌انجام» یکسان باشند
  const s = enDigits(raw.trim().toLowerCase()).replace(/[ \u200c]/g, "_");
  if (["done", "تمام", "تمام_شده", "تمامشده", "پایان", "پایان_یافته", "تموم", "تموم_شده", "finished", "complete", "completed"].includes(s))
    return "done";
  if (["in_progress", "inprogress", "progress", "doing", "started", "در_حال_انجام", "انجام", "شروع_شده", "شروع_کردم"].includes(s))
    return "in_progress";
  if (["not_started", "notstarted", "todo", "new", "open", "شروع_نشده", "نشده"].includes(s))
    return "not_started";
  return null;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function displayName(u: UserRow | null | undefined, fallback = "ناشناس"): string {
  if (!u) return escapeHtml(fallback);
  const name = (u.first_name && u.first_name.trim()) || (u.username ? `@${u.username}` : "") || `#${u.user_id}`;
  return escapeHtml(name);
}

/** کارت کامل تسک (HTML تلگرام) */
export function taskCard(
  task: TaskRow,
  creator: UserRow | null,
  assignee: UserRow | null,
  note?: string | null
): string {
  const lines: string[] = [
    `🆔 شناسه: <b>${faDigits(task.id)}</b>`,
    `📌 عنوان: <b>${escapeHtml(truncate(task.title, 120))}</b>`,
  ];
  if (task.description) lines.push(`📝 توضیحات: ${escapeHtml(truncate(task.description, 800))}`);
  lines.push(`👤 ایجادکننده: ${displayName(creator)}`);
  lines.push(`👷 مسئول: ${displayName(assignee)}`);
  lines.push(`🚦 وضعیت: ${STATUS_EMOJI[task.status]} ${STATUS_LABEL[task.status]}`);
  lines.push(
    `🚀 تاریخ شروع: ${fmtDate(task.start_date)}${task.start_at ? ` — ساعت ${fmtTimeTehran(task.start_at)}` : ""}`
  );
  lines.push(
    `🏁 تاریخ پایان: ${fmtDate(task.due_date)}${task.due_at ? ` — ساعت ${fmtTimeTehran(task.due_at)}` : ""}`
  );
  lines.push(`🗓 ساخته‌شده: ${fmtDateTime(task.created_at)}`);
  const remText = reminderSpecText(task);
  if (remText) lines.push(`🔔 یادآوری: ${remText}`);
  if (task.status === "not_started" && task.auto_start) {
    lines.push(
      `⏱ شروع خودکار: ${
        task.start_at
          ? `${fmtDate(task.start_date)} — ساعت ${fmtTimeTehran(task.start_at)}`
          : fmtDate(task.start_date)
      }`
    );
  }
  if (task.status === "done" && task.completed_at) lines.push(`🎉 پایان واقعی: ${fmtDateTime(task.completed_at)}`);
  if (task.reminder_count > 0) lines.push(`🔔 یادآوری‌های ارسال‌شده: ${faDigits(task.reminder_count)}`);
  if (note) lines.push(`\nℹ️ ${note}`);
  return lines.join("\n");
}

/** دکمه‌های تغییر وضعیت زیر کارت تسک */
export function statusKeyboard(task: Pick<TaskRow, "id" | "status">) {
  const button = (label: string, status: TaskStatus) => ({
    text: task.status === status ? `✔️ ${label}` : label,
    callback_data: `st|${task.id}|${status}`,
  });
  const rows = [[button("🔄 در حال انجام", "in_progress"), button("✅ تمام شد", "done")]];
  if (task.status !== "not_started") rows.push([button("⬜️ شروع‌نشده کن", "not_started")]);
  return { inline_keyboard: rows };
}

/** نام‌های فارسی/انگلیسی فیلدهای قابل ویرایش در /edit */
const EDIT_FIELD_ALIASES: Record<string, string> = {
  عنوان: "title", عنوانش: "title", تیتر: "title", title: "title", name: "title",
  توضیح: "description", توضیحات: "description", توضیحش: "description", متن: "description",
  desc: "description", description: "description",
  مسئول: "assignee", مسئولش: "assignee", assignee: "assignee",
  شروع: "start", شروعش: "start", از: "start", start: "start",
  پایان: "due", پایانش: "due", سررسید: "due", مهلت: "due", تا: "due",
  due: "due", end: "due", deadline: "due",
  وضعیت: "status", وضعیتش: "status", status: "status",
  یادآوری: "reminder", یادآور: "reminder", یادم: "reminder", یاداوری: "reminder", reminder: "reminder", remind: "reminder",
};

/** نرمال‌سازی نام فیلد در /edit — خروجی: title/description/assignee/start/due/status یا null */
export function normalizeEditField(raw: string): string | null {
  const k = raw.trim().replace(/[:：]/g, "").replace(/\u200c/g, "").toLowerCase();
  return EDIT_FIELD_ALIASES[k] ?? null;
}
