/**
 * تشخیص نیتِ پیام‌های فارسی بدون دستور (فراتر از ساخت تسک)
 * — لیست کردن / خروجی گرفتن — توابع خالص و قابل تست.
 */

/** فعل‌های ساخت — اگر باشن، پیام «درخواست لیست/گزارش» نیست */
const CREATE_VERB = /بساز|ایجاد|ساخت|ثبت|یادداشت|نوت/;

/** درخواست لیست تسک؟ خروجی: نوع فیلتر یا null */
export function detectListRequest(text: string): "open" | "done" | "all" | null {
  const t = text.replace(/احمق/g, " ").replace(/\u200c/g, " ");
  if (!/تسک|تاسک/.test(t)) return null;
  if (CREATE_VERB.test(t)) return null;
  // «تاریخچه» = تسک‌های تموم‌شده (نه فایل خروجی)
  if (/تاریخچه|هیستوری|انجام\s?دادم\s?ها|تموم\s?کردم/.test(t)) return "done";
  // درخواست فایل (خروجی/گزارش) از مسیر لیست جدا است
  if (/خروجی|گزارش|export|اکسپورت|pdf|پی\s?دی\s?اف/i.test(t)) return null;
  // فعلِ عملیاتی → ویرایش/حذف است، نه لیست («تاریخ پایان تسک رو تغییر بده» — «بده» فعلِ لیست نیست!)
  if (/ویرایش|آپدیت|اپدیت|تغییر|عوض|حذف|پاک|بساز|ایجاد|ساخت|ثبت/.test(t)) return null;
  if (!/لیست|نشون|نمایش|بگو|بین|بده|دارم|داریم|چیه|چی هست|چه/.test(t)) return null;

  if (/تموم|تمام|انجام\s?شده|پایان\s?یافته|تموم\s?شده|all\s?done/.test(t)) return "done";
  if (/همه|کل|تمامی/.test(t)) return "all";
  return "open";
}

/** فعل‌های عملیاتی — اگر باشن، «گزارش/خروجی» در جمله موضوعِ فعل است نه درخواست فایل */
const ACTION_VERB = /ویرایش|آپدیت|اپدیت|تغییر|عوض|حذف|پاک|تموم|بساز|ایجاد|ساخت|ثبت|یادداشت/;

/** درخواست خروجی/گزارش از تسک‌ها؟ */
export function detectExportRequest(text: string): boolean {
  const t = text.replace(/احمق/g, " ").replace(/\u200c/g, " ");
  if (CREATE_VERB.test(t)) return false;
  // «تسک گزارش رو ویرایش کن» — «گزارش» اینجا عنوانِ تسک است، نه درخواست فایل!
  if (ACTION_VERB.test(t)) return false;
  const wantsFile = /خروجی|گزارش|export|اکسپورت|pdf|پی\s?دی\s?اف/i.test(t);
  const aboutTasks = /تسک|تاسک/.test(t);
  const asking = /بده|بگیر|کن|میخوام|می\s?خوام|برام/.test(t);
  return wantsFile && aboutTasks && asking;
}

/** کوئری تسک‌های یک کاربر مشخص — «تسک‌های علی چیا هستن؟»، «ممد چه تسکی داره؟»
 *  خروجی: ارجاع به کاربر (نام یا @یوزرنیم) یا null */
export function detectUserTasksQuery(text: string): string | null {
  const t = text.replace(/احمق/g, " ").replace(/\u200c/g, " ").trim();
  if (CREATE_VERB.test(t)) return null;
  if (!/تسک|تاسک|کار/.test(t)) return null;
  // ضمایر اول‌شخص یعنی «تسک‌های خودم» — کوئریِ کاربرِ دیگر نیست!
  const SELF_RE = /^(من|منو|خودم|خودمم|م|مون|مالم|باقی)$/i;

  // «تسک‌های X» / «تسک های X» — X تا انتهای جمله یا فعل پرسشی
  let m = t.match(/تسک\s*های\s+(?:@?)([\w\u0600-\u06FF]+)(?:\s+(?:چیا|چی|کی|رو|را|هستن|است|داره|داره|بگو|نشون|نمایش))?/);
  if (m && !SELF_RE.test(m[1])) return m[1];
  // «X چه تسکی داره؟» / «X چه کارهایی داره؟»
  m = t.match(/(@?[\w\u0600-\u06FF]+)\s+چه\s*(تسک|تاسک|کار\s*هایی|کارهایی)\s*(ی)?\s*دار/);
  if (m && !SELF_RE.test(m[1].replace(/^@/, ""))) return m[1];
  // «برای X چه تسکی» — فقط وقتی پرسشی است
  m = t.match(/برای\s+(@?[\w\u0600-\u06FF]+)\s+چه\s*(تسک|تاسک|کار)/);
  if (m && !SELF_RE.test(m[1].replace(/^@/, ""))) return m[1];
  return null;
}
