/**
 * ahmagh_agent — انواع و اینترفیس‌های مشترک
 */

export interface Env {
  /** فایل‌های استاتیک وب‌اپ (public/) */
  ASSETS?: Fetcher;
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
  /** «1» = گزارش روزانه‌ی ۸ صبح/شب خاموش (پیش‌فرض: روشن) */
  DIGEST_DISABLED?: string;
  /** گزارش مصرف: توکن کلادفلر با دسترسی خواندنِ آنالیتیکس (secret) */
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  D1_DATABASE_ID?: string;
  /** مدل Workers AI برای استخراج تسک — بدون تغییر کد قابل تعویض است */
  AI_MODEL: string;
  /** مدل جایگزین اگر مدل اصلی خطا داد */
  AI_FALLBACK_MODEL?: string;
  /** مشخصات ادمین (سیکرت) — هر که با این‌ها ثبت‌نام کند ادمین است */
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  /** تأخیر تبدیل «تسک ساخته شد» به کارت کامل (میلی‌ثانیه؛ در تست ۰) */
  CARD_EDIT_DELAY_MS?: number;
}

export type TaskStatus = "not_started" | "in_progress" | "done";

/** ردیف pending_pick — انتخابِ کاربر برای تسکِ جدیدِ ادمین */
export interface PendingPickRow {
  user_id: number;
  chat_id: number;
  assignee_id: number; // 0 = در انتظار ابهام‌زداییِ هم‌نام‌ها (متن در text)
  text: string | null; // متن اصلی تسک (برای ابهام‌زدایی)
  created_at: string;
}

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
  // 🔔 یادآوری داینامیک (فاز ۵) — کاربر خودش الگو را تعیین می‌کند
  reminder_type: string;       // default | none | daily | every_hours | before_deadline | once
  reminder_time: string | null;      // "HH:MM" برای daily
  reminder_interval_hours: number | null; // برای every_hours
  reminder_lead_minutes: number | null;   // برای before_deadline
  reminder_at: string | null;       // ISO برای once
  reminder_done: number;            // 1 = یادآوریِ یک‌باره ارسال شد
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
  logged_in?: number;             // 0 = خروج از حساب (ثبت‌نام پابرجا می‌ماند)
  alias?: string | null;          // اسم مستعار — به جای @ برای ارجاع به کاربر
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
  reminder: ReminderSpec | null;
}

/** الگوی یادآوری استخراج‌شده از حرف کاربر */
export interface ReminderSpec {
  type: "none" | "daily" | "every_hours" | "before_deadline" | "once";
  time: string | null;          // "HH:MM" برای daily / once
  interval_hours: number | null; // every_hours
  lead_minutes: number | null;   // before_deadline
  at: string | null;             // ISO برای once
}

/** ردیف جدول pending_tasks */
export interface PendingTaskRow {
  user_id: number;
  chat_id: number;
  draft: string; // JSON از PendingDraft
  created_at: string;
}

/** ردیفِ «ویرایش در انتظار» — جوابِ زبانی به «چی عوض بشه؟» */
export interface PendingEditRow {
  user_id: number;
  task_id: number;
  chat_id: number;
  created_at: string;
}

/** خروجی استخراج هوشمند تسک از متن کاربر */
export interface ParsedTask {
  intent:
    | "create_task"
    | "delete_tasks"
    | "update_task"
    | "nearest_deadline"
    | "list_tasks"
    | "export_report"
    | "user_tasks_query"
    | "other";
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
  // یادآوری داینامیک — تشخیص از زبان طبیعی
  reminder_kind: "" | "none" | "daily" | "every_hours" | "before_deadline" | "once";
  reminder_time: string;        // "HH:MM" برای daily/once
  reminder_hours: number;       // برای every_hours (بازه) یا before_deadline (فاصله تا ددلاین)
  reminder_date: string;        // YYYY-MM-DD برای once
  status: TaskStatus;
  // —— نیت‌های دیگر ——
  delete_scope: "" | "all" | "done"; // حذف: همه‌ی بازها / فقط تموم‌شده‌ها
  task_ref: string;             // ارجاع به تسک (شناسه یا تکه‌ای از عنوان) برای حذف/ویرایش
  update_field: string;         // title|description|assignee|start|due|status|reminder
  update_value: string;         // مقدار جدید (عین متن کاربر)
  target_user: string;          // برای user_tasks_query
  list_filter: "" | "open" | "done" | "all";
}
