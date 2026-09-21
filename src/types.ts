/**
 * ahmagh_agent — انواع و اینترفیس‌های مشترک
 */

export interface Env {
  /** اتصال D1 — دیتابیس تسک‌ها و کاربرها */
  DB: D1Database;
  /** اتصال Workers AI — استخراج ساختار تسک از زبان طبیعی */
  AI: Ai;
  /** توکن بات تلگرام — فقط از طریق `wrangler secret put` */
  TELEGRAM_BOT_TOKEN: string;
  /** رمز وبهوک — هم هدر X-Telegram-Bot-Api-Secret-Token را چک می‌کند و هم مسیر /set-webhook را */
  WEBHOOK_SECRET: string;
  /** یوزرنیم بات (متغیر عمومی) */
  TELEGRAM_BOT_USERNAME: string;
  /** مدل Workers AI برای استخراج تسک — بدون تغییر کد قابل تعویض است */
  AI_MODEL: string;
  /** مدل جایگزین اگر مدل اصلی خطا داد */
  AI_FALLBACK_MODEL?: string;
  /** مشخصات ادمین (سیکرت) — هر که با این‌ها ثبت‌نام کند ادمین است */
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}

export type TaskStatus = "not_started" | "in_progress" | "done";

/** ردیف جدول tasks */
export interface TaskRow {
  id: number;
  title: string;
  description: string;
  creator_id: number;
  assignee_id: number;
  status: TaskStatus;
  start_date: string | null;   // تاریخ شروع برنامه‌ای (YYYY-MM-DD)
  start_at: string | null;     // زمان شروع دقیق اگر ساعت گفته شده باشد (ISO 8601 +03:30)
  started_at: string | null;   // لحظه‌ی واقعی شروع (ISO 8601)
  due_date: string | null;     // تاریخ پایان / سررسید (YYYY-MM-DD)
  due_at: string | null;       // زمان سررسید دقیق اگر ساعت گفته شده باشد (ISO 8601 +03:30)
  completed_at: string | null; // لحظه‌ی واقعی اتمام (ISO 8601)
  auto_start: number;          // 1 = با رسیدن زمان شروع، خودکار «در حال انجام» شود
  created_at: string;
  last_reminded_at: string | null;
  reminder_count: number;
}

/** ردیف جدول users */
export interface UserRow {
  user_id: number;
  username: string | null;
  first_name: string | null;
  username_login: string | null;  // نام کاربری ثبت‌نام (اختیاری)
  password_hash: string | null;   // sha256 رمز ثبت‌نام
  role: string;                   // 'admin' | 'user'

  chat_id: number | null;
  created_at: string;
  updated_at: string;
}

/** پیش‌نویس تسک در انتظار دریافت تاریخ پایان از کاربر */
export interface PendingDraft {
  title: string;
  description: string;
  creator_id: number;
  assignee_id: number;
  status: TaskStatus;
  start_date: string | null;
  start_at: string | null;
}

/** ردیف جدول pending_tasks */
export interface PendingTaskRow {
  user_id: number;
  chat_id: number;
  draft: string; // JSON از PendingDraft
  created_at: string;
}

/** خروجی استخراج هوشمند تسک از متن کاربر */
export interface ParsedTask {
  intent: "create_task" | "other";
  title: string;
  description: string;
  /** نام/یوزرنیم مسئول؛ "" یعنی خودِ گوینده */
  assignee_name: string;
  start_date: string;   // "" اگر نگفته باشد
  start_time: string;   // "HH:MM" یا "" اگر ساعت نگفته باشد
  start_phrase: string; // عین عبارت تاریخ/ساعت شروع از متن کاربر (اگر AI کپی کرده)
  due_date: string;     // "" اگر نگفته باشد
  due_time: string;     // "HH:MM" یا "" اگر ساعت نگفته باشد
  due_phrase: string;   // عین عبارت تاریخ/ساعت پایان از متن کاربر
  status: TaskStatus;
}
