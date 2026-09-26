/**
 * مغز مشترکِ «بات تلگرام» و «وب‌اپ» — تبدیل متن فارسیِ آزاد به فیلدهای قطعی تسک.
 *
 * همین تابع در createTaskFromText تلگرام استفاده می‌شود و وب‌اپ هم از همان
 * استفاده می‌کند تا رفتار دو رابط کاربری هیچ‌وقت از هم جدا نشود.
 */
import type { ParsedTask, ReminderSpec } from "./types";
import { parseRelativeFaDateTime, parseReminderSpec } from "./dates";

export interface ResolvedTaskFields {
  start_date: string;
  due_date: string; // "" = نگفته
  start_at: string | null;
  due_at: string | null;
  reminder: ReminderSpec | null;
}

export function resolveTaskFields(text: string, parsed: ParsedTask, today: string): ResolvedTaskFields {
  // 📅 اولویت تاریخ‌ها (مدل‌های زبانی در محاسبه‌ی تاریخ فارسی خطا می‌کنند):
  // ۱) عبارتِ عینی که AI از خودِ متن کاربر کپی کرده (start_phrase/due_phrase)
  //    → با پارسر قطعی محلی تبدیل می‌شود؛ هم معنا درست است هم حساب تاریخ
  // ۲) regex روی خودِ متن اصلی
  // ۳) ISO خودِ مدل (آخرین راه)
  const isoOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
  const timeOk = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || "");

  // ⚠️ مرز کلمه‌ی فارسی: «از» داخل «فاز» یا «تا» داخل «پاستا» نباید حساب شود
  const B = "(?:^|[\\s،,:؛.])";
  // ۱) بندهای «تا/سررسید» و «از/شروع» از خودِ متن؛ اگر چند بند باشد،
  //    آخرینِ قابل‌پارس ملاک است (در جمله‌های واقعی، ددلاین خودِ گوینده آخرین «تا» است،
  //    نه «تا»ی مالِ طرفِ دیگر ماجرا!)
  const collect = (kw: string) => {
    let date: string | null = null;
    let time: string | null = null;
    for (const m of text.matchAll(new RegExp(B + kw + "\\s+((?:\\S+\\s+){0,3}\\S+)", "g"))) {
      const dt = parseRelativeFaDateTime(m[1], today);
      if (dt.date) { date = dt.date; time = dt.time; }
      else if (dt.time) time = dt.time; // «تا ساعت ۱۲:۱۵» بدون تاریخ — فقط ساعت
    }
    return { date, time };
  };
  const fromC = collect("(?:از|شروع)");
  const toC = collect("(?:تا|سررسید)");
  // «تا ساعت ۱۲:۱۵» بدون تاریخ → یعنی امروز (سؤال اضافه نپرس!)
  if (!toC.date && toC.time) toC.date = today;
  let sd: string | null = fromC.date;
  let st: string | null = fromC.time;
  let dd: string | null = toC.date;
  let dtm: string | null = toC.time;

  // ۲) عبارتی که AI عیناً از متن برداشته (برای جمله‌های بدون «تا»)
  if (!sd && parsed.start_phrase) {
    const dt = parseRelativeFaDateTime(parsed.start_phrase, today);
    if (dt.date) sd = dt.date;
    if (dt.time) st = dt.time;
  }
  if (!dd && parsed.due_phrase) {
    const dt = parseRelativeFaDateTime(parsed.due_phrase, today);
    if (dt.date) dd = dt.date;
    if (dt.time) dtm = dt.time;
  }

  // ۳) ISO خودِ مدل (آخرین راه)
  if (!sd && isoOk(parsed.start_date)) sd = parsed.start_date;
  if (sd && !st && timeOk(parsed.start_time)) st = parsed.start_time;
  if (!dd && isoOk(parsed.due_date)) dd = parsed.due_date;
  if (dd && !dtm && timeOk(parsed.due_time)) dtm = parsed.due_time;

  // 🛡 ضدتوهم: هیچ نشانه‌ی «شروع» در متن نیست اما شروع = پایانِ آینده؟ توهم است → امروز
  const startHint = new RegExp(B + "(?:از|شروع)\\s").test(text) || !!parsed.start_phrase;
  if (!startHint && sd && dd && sd === dd && sd > today) {
    sd = null;
    st = null;
  }

  // 🔔 یادآوری داینامیک — اول قواعد قطعی، بعد پیشنهاد AI
  let reminder: ReminderSpec | null = parseReminderSpec(text, today);
  if (!reminder && parsed.reminder_kind) {
    const rk = parsed.reminder_kind;
    if (rk === "none") reminder = { type: "none", time: null, interval_hours: null, lead_minutes: null, at: null };
    else if (rk === "daily" && parsed.reminder_time)
      reminder = { type: "daily", time: parsed.reminder_time, interval_hours: null, lead_minutes: null, at: null };
    else if (rk === "every_hours" && parsed.reminder_hours > 0)
      reminder = { type: "every_hours", time: null, interval_hours: parsed.reminder_hours, lead_minutes: null, at: null };
    else if (rk === "before_deadline" && parsed.reminder_hours > 0)
      reminder = { type: "before_deadline", time: null, interval_hours: null, lead_minutes: Math.round(parsed.reminder_hours * 60), at: null };
    else if (rk === "once" && parsed.reminder_time)
      reminder = {
        type: "once",
        time: parsed.reminder_time,
        interval_hours: null,
        lead_minutes: null,
        at: `${(sd || today)}T${parsed.reminder_time}:00+03:30`,
      };
  }

  const start_date = sd || today;
  const due_date = dd || "";
  // ⏰ ساعت شروع/پایان اگر گفته شده باشد → timestamp کامل با offset تهران
  const start_at = st ? `${start_date}T${st}:00+03:30` : null;
  const due_at = due_date && dtm ? `${due_date}T${dtm}:00+03:30` : null;

  return { start_date, due_date, start_at, due_at, reminder };
}
