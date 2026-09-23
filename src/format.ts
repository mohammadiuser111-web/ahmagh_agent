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
  // اسم مستعار ملاک است — به جای @ (اگه نبود: نام تلگرام، بعد @یوزرنیم)
  const name =
    (u.alias && u.alias.trim()) ||
    (u.first_name && u.first_name.trim()) ||
    (u.username ? `@${u.username}` : "") ||
    `#${u.user_id}`;
  return escapeHtml(name);
}

/** برچسب خام (بدون escape) برای دکمه‌ها — alias اول */
export function userLabel(u: Pick<UserRow, "alias" | "first_name" | "username" | "user_id">): string {
  return (
    (u.alias && u.alias.trim()) ||
    (u.first_name && u.first_name.trim()) ||
    (u.username ? `@${u.username}` : "") ||
    `#${u.user_id}`
  );
}

/** کارت کامل تسک (HTML تلگرام) — دیزاین دومرحله‌ای: پس از «تسک ساخته شد» همین کارت جایگزین پیام می‌شود */
export function taskCard(
  task: TaskRow,
  creator: UserRow | null,
  assignee: UserRow | null,
  note?: string | null
): string {
  // کارت تمیز: عنوان درشت، بلوک‌های جدا با خط خالی، بدون شلوغیِ ایموجی
  const lines: string[] = [`<b>${escapeHtml(truncate(task.title, 120))}</b>`, ""];
  lines.push(`وضعیت: ${STATUS_EMOJI[task.status]} <b>${STATUS_LABEL[task.status]}</b>`);
  lines.push(`شناسه: <b>${faDigits(task.id)}</b>`);
  if (task.description) lines.push("", escapeHtml(truncate(task.description, 800)));
  lines.push("");
  lines.push(`مسئول: ${displayName(assignee)}`);
  lines.push(`سازنده: ${displayName(creator)}`);
  lines.push(
    `شروع: ${fmtDate(task.start_date)}${task.start_at ? ` — ${fmtTimeTehran(task.start_at)}` : ""}`
  );
  lines.push(
    `پایان: ${fmtDate(task.due_date)}${task.due_at ? ` — ${fmtTimeTehran(task.due_at)}` : ""}`
  );
  const remText = reminderSpecText(task);
  if (remText) lines.push(`یادآوری: ${remText}`);
  if (task.status === "not_started" && task.auto_start) {
    lines.push(
      `شروع خودکار: ${
        task.start_at
          ? `${fmtDate(task.start_date)} — ساعت ${fmtTimeTehran(task.start_at)}`
          : fmtDate(task.start_date)
      }`
    );
  }
  if (task.status === "done" && task.completed_at) lines.push(`تمام‌شده در: ${fmtDateTime(task.completed_at)}`);
  if (note) lines.push("", `— ${note}`);
  return lines.join("\n");
}

/** دکمه‌های زیر کارت تسک: ردیف اول حذف/ویرایش، ردیف دوم وضعیت‌ها */
export function statusKeyboard(task: Pick<TaskRow, "id" | "status">) {
  const button = (label: string, status: TaskStatus) => ({
    text: task.status === status ? `✔️ ${label}` : label,
    callback_data: `st|${task.id}|${status}`,
  });
  return {
    inline_keyboard: [
      [
        { text: "🗑 حذف", callback_data: `delx|${task.id}` },
        { text: "✏️ ویرایش", callback_data: `edt|${task.id}` },
      ],
      [
        button("✅ تمام شد", "done"),
        button("🔄 در حال انجام", "in_progress"),
        button("⬜️ شروع نشده", "not_started"),
      ],
    ],
  };
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
