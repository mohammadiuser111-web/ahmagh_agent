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
  if (!/لیست|نشون|نمایش|بگو|بین|بده|دارم|داریم|چیه|چی هست|چه/.test(t)) return null;

  if (/تموم|تمام|انجام\s?شده|پایان\s?یافته|تموم\s?شده|all\s?done/.test(t)) return "done";
  if (/همه|کل|تمامی/.test(t)) return "all";
  return "open";
}

/** درخواست خروجی/گزارش از تسک‌ها؟ */
export function detectExportRequest(text: string): boolean {
  const t = text.replace(/احمق/g, " ").replace(/\u200c/g, " ");
  if (CREATE_VERB.test(t)) return false;
  const wantsFile = /خروجی|گزارش|export|اکسپورت|pdf|پی\s?دی\s?اف/i.test(t);
  const aboutTasks = /تسک|تاسک/.test(t);
  const asking = /بده|بگیر|کن|میخوام|می\s?خوام|برام/.test(t);
  return wantsFile && aboutTasks && asking;
}
