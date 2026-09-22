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

/** تبدیل بخشِ روز: «۵ عصر» → ۱۷ ، «۳ ظهر» → ۱۵ ، «۱۰ شب» → ۲۲ (ورودی/خروجی ۲۴تایی) */
function applyDayPart(h: number, part: string | undefined): number {
  if (!part) return h;
  if (part === "ظهر") return h === 12 ? 12 : h < 12 ? h + 12 : h;
  if (part === "عصر") return h < 12 ? h + 12 : h;
  if (part === "شب") return h === 12 ? 0 : h >= 5 && h < 12 ? h + 12 : h; // «۱۲ شب» = نیمه‌شب
  return h; // صبح / بامداد
}

/**
 * استخراج ساعت از متن فارسی — «ساعت ۱۰:۳۰ عصر» → ۲۲:۳۰ ، «۱۲ ظهر» → ۱۲:۰۰ ، «۸ صبح» → ۰۸:۰۰
 * فقط وقتی ساعت واقعاً گفته شده (کلیدواژه‌ی «ساعت»، فرمت HH:MM یا بخشِ روز)؛ وگرنه null.
 * خروجی: دقیقه از نیمه‌شب، یا null
 */
export function parseFaTimeOfDay(text: string): number | null {
  const t = enDigits(text)
    .replace(/\u200c/g, " ")
    .replace(/بعد\s*از\s*ظهر/g, "عصر")
    .replace(/بعدازظهر/g, "عصر");
  if (/نیمه\s*شب/.test(t)) return 0;

  let m = t.match(/(\d{1,2}):(\d{2})\s*(صبح|ظهر|عصر|شب|بامداد)?/); // فرمت HH:MM
  if (m) {
    const h = applyDayPart(Number(m[1]), m[3]);
    const min = Number(m[2]);
    return h <= 23 && min <= 59 ? h * 60 + min : null;
  }
  m = t.match(/ساعت\s*(\d{1,2})(?::(\d{2}))?\s*(صبح|ظهر|عصر|شب|بامداد)?/); // «ساعت ۸» / «ساعت ۸ صبح»
  if (m) {
    const h = applyDayPart(Number(m[1]), m[3]);
    const min = Number(m[2] ?? 0);
    return h <= 23 && min <= 59 ? h * 60 + min : null;
  }
  m = t.match(/(\d{1,2})\s*(صبح|ظهر|عصر|شب|بامداد)/); // «۵ عصر»
  if (m) {
    const h = applyDayPart(Number(m[1]), m[2]);
    return h <= 23 ? h * 60 : null;
  }
  return null;
}

export interface FaDateTime {
  date: string;        // YYYY-MM-DD یا ""
  time: string | null; // "HH:MM" یا null
}

/** تاریخ + ساعت از متن فارسی (بدون AI) */
export function parseRelativeFaDateTime(text: string, todayISO: string): FaDateTime {
  const date = parseRelativeFaDate(text, todayISO);
  const minutes = parseFaTimeOfDay(text);
  return {
    date,
    time: minutes === null ? null : `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`,
  };
}

/** «۲۲:۳۰» از یک timestamp (به وقت تهران) */
export function fmtTimeTehran(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(toIsoTs(ts));
  if (Number.isNaN(d.getTime())) return "";
  const tehran = new Date(d.getTime() + TEHRAN_OFFSET_MS);
  return faDigits(`${pad2(tehran.getUTCHours())}:${pad2(tehran.getUTCMinutes())}`);
}


// ============================================================
// یادآوری داینامیک — استخراج الگو از زبان فارسی
// ============================================================

export interface ReminderSpecFa {
  type: "none" | "daily" | "every_hours" | "before_deadline" | "once";
  time: string | null;
  interval_hours: number | null;
  lead_minutes: number | null;
  at: string | null;
}

/**
 * الگوی یادآوری از متن فارسی:
 * «هر روز ساعت ۵ بهم یاد بده» → daily 17:00
 * «هر ۳ ساعت یادم کن» → every_hours 3
 * «۱ ساعت قبل از ددلاین پیام بده» → before_deadline lead 60min
 * «فردا ساعت ۱۰ صبح یادم بنداز» → once فردا 10:00
 * «یادآوری نکن» → none
 * خروجی null یعنی چیزی نگفته → الگوریتم پیش‌فرض (پلکانی)
 */
export function parseReminderSpec(text: string, todayISO: string): ReminderSpecFa | null {
  const t = enDigits(text).replace(/\u200c/g, " ");
  const isTime = (m: number | null) => (m === null ? null : `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);

  // خاموش
  if (/یادآوری\s*نکن|یادم\s*نکن|یادم\s*نیفته|بدون\s*یادآوری|اعلان\s*نکن|اسپم\s*نکن/.test(t)) {
    return { type: "none", time: null, interval_hours: null, lead_minutes: null, at: null };
  }

  // هر روز ساعت H[:MM] [صبح/عصر/...]
  let m = t.match(/هر\s*روز\s*(?:ساعت\s*)?(\d{1,2})(?::(\d{2}))?\s*(صبح|ظهر|عصر|شب|بامداد)?/);
  if (m) {
    const dayMin = parseFaTimeOfDay(`ساعت ${m[1]}${m[2] ? ":" + m[2] : ""} ${m[3] ?? ""}`);
    if (dayMin !== null) {
      return { type: "daily", time: isTime(dayMin), interval_hours: null, lead_minutes: null, at: null };
    }
  }
  // ساعت H هر روز (ترتیب برعکس)
  m = t.match(/ساعت\s*(\d{1,2})(?::(\d{2}))?\s*(صبح|ظهر|عصر|شب|بامداد)?\s*هر\s*روز/);
  if (m) {
    const dayMin = parseFaTimeOfDay(`ساعت ${m[1]}${m[2] ? ":" + m[2] : ""} ${m[3] ?? ""}`);
    if (dayMin !== null) {
      return { type: "daily", time: isTime(dayMin), interval_hours: null, lead_minutes: null, at: null };
    }
  }

  // هر N ساعت
  m = t.match(/هر\s*(\d{1,2})\s*ساعت/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 168) {
    return { type: "every_hours", time: null, interval_hours: Number(m[1]), lead_minutes: null, at: null };
  }

  // N ساعت/دقیقه/روز قبل از ددلاین (یا «به ددلاین مونده»)
  m = t.match(
    /(\d{1,3})\s*(ساعت|دقیقه|روز)\s*(?:(?:به|از|تا)\s*ددلاین\s*)?(?:قبل|مونده|مانده|باقی)/
  );
  if (m) {
    const n = Number(m[1]);
    const mins = m[2] === "ساعت" ? n * 60 : m[2] === "روز" ? n * 1440 : n;
    if (mins >= 1 && mins <= 30 * 1440) {
      return { type: "before_deadline", time: null, interval_hours: null, lead_minutes: mins, at: null };
    }
  }

  // یک‌باره: تاریخ/فردا/امروز + ساعت + فعل یادآوری
  const wantsReminder = /یادم|یادآوری|یاداوری|اعلان|بیدارم|بیدار\s*کن/.test(t);
  if (wantsReminder) {
    // ⚠️ ساعتِ «یادآوری» ملاک است، نه اولین ساعتِ متن (ممکن است ساعتِ ددلاین باشد!)
    const pickTime = (h: string, mm?: string, part?: string) => {
      const dayMin = parseFaTimeOfDay(`ساعت ${h}${mm ? ":" + mm : ""} ${part ?? ""}`);
      return dayMin === null ? null : isTime(dayMin);
    };
    let time: string | null = null;
    let near = ""; // پنجره‌ی متنِ کنارِ فعل — تاریخِ یادآوری از همین‌جا درمی‌آید، نه از تاریخِ ددلاین!
    // ۱) «ساعت ۱۱:۵۹ یادآوری کن» / «۱۰ صبح بیدارم کن» / «۱۲ شب امشب هم یاداوری کن»
    let m = t.match(
      /(\d{1,2})(?::(\d{2}))?\s*(صبح|ظهر|عصر|شب|بامداد)?\s*(?:(?:امشب|امروز|فردا|هم)\s+)*(?:رو\s+|را\s+)?(?:یادم|یادآوری|یاداوری|اعلان|بیدارم)/
    );
    if (m) {
      time = pickTime(m[1], m[2], m[3]);
      near = t.slice(Math.max(0, (m.index ?? 0) - 30), (m.index ?? 0) + m[0].length + 10);
    }
    // ۲) «یادم بنداز ساعت ۹ صبح» — فقط تا قبلِ بندِ «تا/سررسید» بعدی
    if (!time) {
      const vm = t.match(/(?:یادم|یادآوری|یاداوری|اعلان|بیدارم|بیدار\s*کن)(.*)$/);
      if (vm) {
        const after = vm[1].split(/تا|سررسید/)[0];
        const am = after.match(/(?:ساعت\s*)?(\d{1,2})(?::(\d{2}))?\s*(صبح|ظهر|عصر|شب|بامداد)?/);
        if (am) {
          time = pickTime(am[1], am[2], am[3]);
          near = after;
        }
      }
    }
    // ۳) فقط وقتی در کل متن یک ساعت هست (اگر چندتاست، احتمالاً یکی‌شان ددلاین است — دست نمی‌زنیم)
    if (!time) {
      const times = t.match(/\d{1,2}:\d{2}|ساعت\s*\d{1,2}|\d{1,2}\s*(?:صبح|ظهر|عصر|شب)/g);
      if (times && times.length === 1) {
        const dt = parseRelativeFaDateTime(t, todayISO);
        time = dt.time;
        if (time) {
          const date = dt.date || todayISO;
          return { type: "once", time, interval_hours: null, lead_minutes: null, at: rollOnceForward(`${date}T${time}:00+03:30`) };
        }
      }
      return null; // مبهم — الگوریتم پیش‌فرض
    }
    // تاریخ از پنجره‌ی کنارِ فعل (اگر بود) وگرنه از کل متن
    const dt2 = parseRelativeFaDateTime(near || t, todayISO);
    const date2 = dt2.date || todayISO;
    return { type: "once", time, interval_hours: null, lead_minutes: null, at: rollOnceForward(`${date2}T${time}:00+03:30`) };
  }

  return null;
}

/**
 * یادآوریِ یک‌باره در گذشته؟ → همان ساعتِ فردا.
 * مثال واقعی: «ساعت ۱۲ شب امشب یادآوری کن» ظهر گفته شده → ۰۰:۰۰ِ امروز گذشته است
 * ولی منظور «نیمه‌شبِ امشب» = فردا ساعت ۰۰:۰۰ است (نه شلیکِ همان لحظه!).
 */
export function rollOnceForward(at: string): string {
  const ms = Date.parse(at);
  if (Number.isNaN(ms) || ms > Date.now()) return at;
  const d = new Date(ms + TEHRAN_OFFSET_MS + 24 * 3_600_000);
  const day = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return `${day}T${at.slice(11, 16)}:00+03:30`;
}

/** متن فارسی الگوی یادآوری برای کارت تسک */
export function reminderSpecText(spec: {
  reminder_type: string;
  reminder_time: string | null;
  reminder_interval_hours: number | null;
  reminder_lead_minutes: number | null;
  reminder_at: string | null;
}): string | null {
  switch (spec.reminder_type) {
    case "none":
      return "خاموش (بدون یادآوری)";
    case "daily":
      return `هر روز ساعت ${faDigits(spec.reminder_time ?? "")}`;
    case "every_hours":
      return spec.reminder_interval_hours
        ? `هر ${faDigits(spec.reminder_interval_hours)} ساعت`
        : null;
    case "before_deadline": {
      if (!spec.reminder_lead_minutes) return null;
      const h = spec.reminder_lead_minutes;
      if (h % 1440 === 0) return `${faDigits(h / 1440)} روز قبل از ددلاین`;
      if (h % 60 === 0) return `${faDigits(h / 60)} ساعت قبل از ددلاین`;
      return `${faDigits(h)} دقیقه قبل از ددلاین`;
    }
    case "once":
      return spec.reminder_at ? `یک‌بار — ${fmtDateTimeFa(spec.reminder_at)}` : null;
    default:
      return null; // default → روی کارت نمایش نمی‌دهیم
  }
}

/** «۱ مهر ۱۴۰۵ — ۱۰:۳۰» برای ISO */
export function fmtDateTimeFa(iso: string): string {
  const d = new Date(toIsoTs(iso));
  if (Number.isNaN(d.getTime())) return "";
  const tehran = new Date(d.getTime() + TEHRAN_OFFSET_MS);
  const [jy, jm, jd] = toJalali(tehran.getUTCFullYear(), tehran.getUTCMonth() + 1, tehran.getUTCDate());
  return `${faDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${faDigits(jy)} — ساعت ${faDigits(
    `${pad2(tehran.getUTCHours())}:${pad2(tehran.getUTCMinutes())}`
  )}`;
}
