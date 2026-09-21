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
const FA_MONTH_TO_NUM: Record<string, number> = {
  فروردین: 1, اردیبهشت: 2, خرداد: 3, تیر: 4, مرداد: 5, شهریور: 6,
  مهر: 7, آبان: 8, آذر: 9, دی: 10, بهمن: 11, اسفند: 12,
};
/** ترتیب مهم: اسم‌های بلندتر اول، تا «شنبه» داخل «یکشنبه» اشتباه نخورد */
const FA_WEEKDAY_TO_JS: [string, number][] = [
  ["یکشنبه", 0], ["دوشنبه", 1], ["سه شنبه", 2], ["چهارشنبه", 3],
  ["پنجشنبه", 4], ["جمعه", 5], ["شنبه", 6],
];

export function faDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

export function enDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function nowTehran(): Date {
  return new Date(Date.now() + TEHRAN_OFFSET_MS);
}

/** امروز به وقت تهران، به شکل YYYY-MM-DD */
export function todayTehranISO(): string {
  return nowTehran().toISOString().slice(0, 10);
}

/** «۳۰ شهریور ۱۴۰۵» برای یک تاریخ ISO (یا امروز) */
export function todayJalaliFa(iso?: string): string {
  const d = iso ?? todayTehranISO();
  const [y, m, dd] = d.split("-").map(Number);
  const [jy, jm, jd] = toJalali(y, m, dd);
  return `${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`;
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

/** جلالی → میلادی (الگوریتم استاندارد) */
export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  jy += 1595;
  let days =
    -355668 +
    365 * jy +
    Math.floor(jy / 33) * 8 +
    Math.floor(((jy % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthDays = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gm < 12 && gd > monthDays[gm]) {
    gd -= monthDays[gm];
    gm++;
  }
  return [gy, gm, gd];
}

/** نرمال‌سازی timestamp های ذخیره‌شده (هر دو فرمت ISO و SQLite) */
function toIsoTs(ts: string): string {
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
  const d = new Date(toIsoTs(ts));
  if (Number.isNaN(d.getTime())) return faDigits(ts);
  const tehran = new Date(d.getTime() + TEHRAN_OFFSET_MS);
  const [jy, jm, jd] = toJalali(tehran.getUTCFullYear(), tehran.getUTCMonth() + 1, tehran.getUTCDate());
  return `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${faDigits(jy)} — ${faDigits(pad2(tehran.getUTCHours()))}:${faDigits(pad2(tehran.getUTCMinutes()))}`;
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

/**
 * استخراج تاریخ از متن فارسی — بدون AI، سریع و رایگان:
 * «فردا»، «پس‌فردا»، «امشب»، «هفته آینده»، «پنجشنبه»، «آخر هفته»، «۳ روز دیگه»، «۱۵ مهر»، …
 * خروجی: YYYY-MM-DD یا "" اگر تاریخی پیدا نشد
 */
export function parseRelativeFaDate(text: string, todayISO: string): string {
  // نرمال‌سازی: ارقام فارسی → لاتین، نیم‌فاصله → فاصله
  const t = enDigits(text).replace(/\u200c/g, " ").trim();
  const today = todayISO;
  const jsDayOfToday = new Date(`${today}T12:00:00Z`).getUTCDay();

  if (/امروز|امشب/.test(t)) return today;
  if (/پس\s*فردا/.test(t)) return addDaysISO(today, 2);
  if (/فردا/.test(t)) return addDaysISO(today, 1);
  if (/هفته\s*(ی\s*)?(آینده|بعد|دیگه)/.test(t)) return addDaysISO(today, 7);
  if (/ماه\s*(ی\s*)?(آینده|بعد|دیگه)/.test(t)) return addDaysISO(today, 30);

  const daysMatch = t.match(/(\d{1,2})\s*روز\s*(دیگه|بعد)/);
  if (daysMatch) return addDaysISO(today, Number(daysMatch[1]));

  // آخر هفته → جمعه‌ی همین هفته
  if (/آخر\s*(این\s*)?هفته/.test(t)) {
    return addDaysISO(today, (5 - jsDayOfToday + 7) % 7);
  }

  for (const [name, jsDay] of FA_WEEKDAY_TO_JS) {
    if (t.includes(name)) {
      let diff = (jsDay - jsDayOfToday + 7) % 7;
      if (diff === 0) diff = 7;
      if (/(آینده|بعدی)/.test(t)) diff += 7;
      return addDaysISO(today, diff);
    }
  }

  // «۱۵ مهر» / «۵ آبان» — روز + ماه شمسی
  const m = t.match(/(\d{1,2})\s*(فروردین|اردیبهشت|خرداد|تیر|مرداد|شهریور|مهر|آبان|آذر|دی|بهمن|اسفند)/);
  if (m) {
    const jd = Number(m[1]);
    const jm = FA_MONTH_TO_NUM[m[2]];
    if (jd >= 1 && jd <= 31 && jm) {
      const [gy, gm, gd] = today.split("-").map(Number);
      const [jyNow] = toJalali(gy, gm, gd);
      const toIsoStr = (jy: number): string => {
        const [Y, M, D] = jalaliToGregorian(jy, jm, jd);
        return `${Y}-${pad2(M)}-${pad2(D)}`;
      };
      let iso = toIsoStr(jyNow);
      if (iso < today) iso = toIsoStr(jyNow + 1); // گذشته بود → سال بعد
      return iso;
    }
  }

  return "";
}
