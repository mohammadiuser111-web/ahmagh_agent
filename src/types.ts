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
  started_at: string | null;   // لحظه‌ی واقعی شروع (ISO 8601)
  due_date: string | null;     // تاریخ پایان / سررسید (YYYY-MM-DD)
  completed_at: string | null; // لحظه‌ی واقعی اتمام (ISO 8601)
  created_at: string;
  last_reminded_at: string | null;
  reminder_count: number;
}

/** ردیف جدول users */
export interface UserRow {
  user_id: number;
  username: string | null;
  first_name: string | null;
  chat_id: number | null;
  created_at: string;
  updated_at: string;
}

/** خروجی استخراج هوشمند تسک از متن کاربر */
export interface ParsedTask {
  intent: "create_task" | "other";
  title: string;
  description: string;
  /** نام/یوزرنیم مسئول؛ "" یعنی خودِ گوینده */
  assignee_name: string;
  start_date: string; // "" اگر نگفته باشد
  due_date: string;   // "" اگر نگفته باشد
  status: TaskStatus;
}
