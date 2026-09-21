/**
 * ابزارهای تاریخ: تقویم جلالی، ارقام فارسی و منطقه‌ی زمانی تهران (UTC+03:30 ثابت)
 */

const TEHRAN_OFFSET_MS = 3.5 * 3_600_000; // ایران از سال ۲۰۲۲ بدون ساعت تابستانی است

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const JALALI_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

export function faDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

export function enDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

export function nowTehran(): Date {
  return new Date(Date.now() + TEHRAN_OFFSET_MS);
}

/** امروز به وقت تهران، به شکل YYYY-MM-DD */
export function todayTehranISO(): string {
  return nowTehran().toISOString().slice(0, 10);
}

/** میلادی → جلالی (الگوریتم استاندارد) */
export function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const gDaysInMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    gDaysInMonth[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

/** نرمال‌سازی timestamp های ذخیره‌شده (هر دو فرمت ISO و SQLite) */
function toIso(ts: string): string {
  let s = ts.trim();
  if (s.length === 19 && !s.includes("T")) s = s.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !/(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) s += "Z";
  return s;
}

/** تاریخ (YYYY-MM-DD) → «۲۱ شهریور ۱۴۰۵» */
export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const iso = dateStr.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return faDigits(dateStr);
  const [gy, gm, gd] = iso.split("-").map(Number);
  const [jy, jm, jd] = toJalali(gy, gm, gd);
  return `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${faDigits(jy)}`;
}

/** timestamp (ISO 8601) → «۲۱ شهریور ۱۴۰۵ — ۱۴:۳۰» به وقت تهران */
export function fmtDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(toIso(ts));
  if (Number.isNaN(d.getTime())) return faDigits(ts);
  const tehran = new Date(d.getTime() + TEHRAN_OFFSET_MS);
  const [jy, jm, jd] = toJalali(tehran.getUTCFullYear(), tehran.getUTCMonth() + 1, tehran.getUTCDate());
  const hh = String(tehran.getUTCHours()).padStart(2, "0");
  const mm = String(tehran.getUTCMinutes()).padStart(2, "0");
  return `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${faDigits(jy)} — ${faDigits(hh)}:${faDigits(mm)}`;
}

/** شروع روزِ تاریخ داده‌شده به وقت تهران (epoch ms) */
export function startOfDayTehran(dateStr: string): number {
  return Date.parse(`${dateStr}T00:00:00+03:30`);
}

/** پایان روزِ تاریخ داده‌شده به وقت تهران (epoch ms) */
export function endOfDayTehran(dateStr: string): number {
  return Date.parse(`${dateStr}T23:59:59+03:30`);
}

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function humanizeHoursLeft(hours: number): string {
  if (hours <= 1) return "کمتر از یک ساعت";
  if (hours < 24) return `${faDigits(Math.round(hours))} ساعت`;
  return `${faDigits(Math.round(hours / 24))} روز`;
}
