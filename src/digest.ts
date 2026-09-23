/**
 * گزارش روزانه (Daily Digest)
 *
 * هر روز — به‌جز پنجشنبه و جمعه — دو بار به وقت تهران:
 *   صبح ۸:۰۰ → سلام صبح بخیر + وضعیت کلی تسک‌ها + ددلاین‌های امروز
 *   شب ۲۰:۰۰ → سلام شب بخیر + کارهای انجام‌شده‌ی امروز + باقی‌مانده
 *
 * بدون کرونِ اضافه: همان کرونِ هر دقیقه اجرا می‌شود و digestWindow بررسی می‌کند
 * که ساعتِ تهران ۸:۰۰ (یا ۲۰:۰۰) و دقیقه بین ۰ تا ۴ باشد؛
 * جدول digest_sent تضمین می‌کند همان روز دوباره نفرستد.
 * فقط به کاربرهایی پیام می‌رود که تسکی دارند (مسئولِ حداقل یک تسک باشند).
 */
import type { Env, TaskRow } from "./types";
import { allUsersWithChat, listTasks } from "./db";
import { sendMessage } from "./telegram";
import {
  addDaysISO,
  faDigits,
  fmtDate,
  fmtTimeTehran,
  nowTehran,
  todayJalaliFa,
  todayTehranISO,
} from "./dates";


const WEEKDAYS_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

/** شماره‌ی روزِ هفته به وقت تهران: ۰=یکشنبه … ۴=پنجشنبه، ۵=جمعه، ۶=شنبه */
export function tehranWeekday(d: Date = new Date()): number {
  return new Date(d.getTime() + 3.5 * 3600 * 1000).getUTCDay();
}

/** آخر هفته‌ی ایران: پنجشنبه و جمعه — این روزها گزارشی نمی‌رود */
export function isWeekendTehran(d: Date = new Date()): boolean {
  const day = tehranWeekday(d);
  return day === 4 || day === 5;
}

/**
 * آیا الان پنجره‌ی گزارش روزانه است؟ (ساعتِ تهران ۸:۰۰ یا ۲۰:۰۰، دقیقه ۰ تا ۴)
 * پنجره‌ی چنددقیقه‌ای + ثبتِ digest_sent = حتی با تأخیر/جای‌افتادنِ یک تیک، گزارش می‌رود ولی هیچ‌وقت دوباره.
 */
export function digestWindow(d: Date = new Date()): "morning" | "evening" | null {
  const t = new Date(d.getTime() + 3.5 * 3600 * 1000);
  if (t.getUTCMinutes() > 4) return null;
  const h = t.getUTCHours();
  if (h === 8) return "morning";
  if (h === 20) return "evening";
  return null;
}

/** تاریخِ تهرانِ یک timestamp به شکل YYYY-MM-DD */
const tehranDateOf = (ts: string): string =>
  new Date(new Date(ts).getTime() + 3.5 * 3600 * 1000).toISOString().slice(0, 10);

const dueAtMs = (t: TaskRow): number =>
  t.due_at ? Date.parse(t.due_at) : t.due_date ? Date.parse(`${t.due_date}T23:59:59+03:30`) : Infinity;

const dueTextShort = (t: TaskRow): string =>
  t.due_at ? `— ${fmtTimeTehran(t.due_at)}` : t.due_date ? `— ${fmtDate(t.due_date)}` : "";

/** «امروز سه‌شنبه ۳۱ شهریور ۱۴۰۵» */
const dayLine = (greeting: string, now: Date): string => {
  const shifted = new Date(now.getTime() + 3.5 * 3600 * 1000);
  const wd = WEEKDAYS_FA[shifted.getUTCDay()];
  return `سلام، ${greeting}\n\nامروز ${wd} ${todayJalaliFa()} ${greeting === "شب بخیر" ? "بود" : "است"}.`;
};

const bulletList = (items: string[]): string => items.map((x) => `• ${x}`).join("\n");

/** گزارش صبح: وضعیت کلی + ددلاین امروز + عقب‌افتاده‌ها */
function morningText(tasks: TaskRow[], now: Date): string {
  const today = todayTehranISO();
  const open = tasks.filter((t) => t.status !== "done");
  const doing = open.filter((t) => t.status === "in_progress");
  const overdue = open.filter((t) => t.due_date && t.due_date < today);
  const dueToday = open.filter((t) => t.due_date === today).sort((a, b) => dueAtMs(a) - dueAtMs(b));

  const parts = [dayLine("صبح بخیر", now), ""];

  if (!open.length) {
    parts.push(`همه‌ی ${faDigits(tasks.length)} تسک‌هات را تموم کرده‌ای — دستت درد نکند.`);
    return parts.join("\n");
  }

  parts.push("وضعیت تسک‌هات:");
  parts.push(
    bulletList([
      `${faDigits(open.length)} تسک باز داری (${faDigits(doing.length)} در حال انجام، ${faDigits(open.length - doing.length)} شروع‌نشده)`,
    ])
  );

  if (dueToday.length) {
    parts.push("", "امروز باید این‌ها را تموم کنی:");
    parts.push(bulletList(dueToday.slice(0, 5).map((t) => `${t.title} ${dueTextShort(t)}`.trim())));
  }
  if (overdue.length) {
    parts.push("", `این ${faDigits(overdue.length)} تا هم از موعدشون گذشته:`);
    parts.push(bulletList(overdue.slice(0, 5).map((t) => `${t.title} ${dueTextShort(t)}`.trim())));
  }
  return parts.join("\n");
}

/** گزارش شب: انجام‌شده‌های امروز + باقی‌مانده + ددلاین فردا */
function eveningText(tasks: TaskRow[], now: Date): string {
  const today = todayTehranISO();
  const tomorrow = addDaysISO(today, 1);
  const open = tasks.filter((t) => t.status !== "done");
  const doneToday = tasks
    .filter((t) => t.status === "done" && t.completed_at && tehranDateOf(t.completed_at) === today)
    .sort((a, b) => (a.completed_at ?? "").localeCompare(b.completed_at ?? ""));
  const dueTomorrow = open.filter((t) => t.due_date === tomorrow);

  const parts = [dayLine("شب بخیر", now), ""];

  if (doneToday.length) {
    parts.push(`امروز ${faDigits(doneToday.length)} تسک تموم کردی — آفرین:`);
    parts.push(bulletList(doneToday.slice(0, 6).map((t) => t.title)));
  } else if (open.length) {
    parts.push("امروز تسکی تموم نکردی.");
  }

  if (open.length) {
    parts.push("", `هنوز ${faDigits(open.length)} تسک بازی داری.`);
    if (dueTomorrow.length) {
      parts.push("", "فردا این‌ها ددلاین دارند:");
      parts.push(bulletList(dueTomorrow.slice(0, 5).map((t) => `${t.title} ${dueTextShort(t)}`.trim())));
    }
  } else if (tasks.length) {
    parts.push("همه‌ی تسک‌هات تموم شده — روز خوبی بود.");
  }
  return parts.join("\n");
}

/** اجرای گزارش روزانه — kind از پنجره‌ی زمانی می‌آید؛ آخر هفته کاری نمی‌کند */
export async function runDigest(env: Env, kind: "morning" | "evening", now: Date = new Date()): Promise<void> {
  if (isWeekendTehran(now)) return; // پنجشنبه و جمعه: تعطیل
  // dedup: هر نوع در هر روز فقط یک‌بار (حتی اگر پنجره چند دقیقه اجرا شود)
  const day = tehranDateOf(now.toISOString());
  try {
    const r = await env.DB.prepare("INSERT OR IGNORE INTO digest_sent (kind, day) VALUES (?, ?)")
      .bind(kind, day)
      .run();
    if (r.meta && Number(r.meta.changes) === 0) return; // امروز قبلاً فرستاده شده
  } catch (err) {
    console.warn("[digest] dedup check failed:", err);
  }
  const users = await allUsersWithChat(env);
  for (const u of users) {
    try {
      const tasks = await listTasks(env, { assignee: u.user_id });
      if (!tasks.length) continue; // بی‌تسک → بی‌سروصدا
      const text = kind === "morning" ? morningText(tasks, now) : eveningText(tasks, now);
      await sendMessage(env, u.chat_id!, text);
    } catch (err) {
      console.warn(`[digest] failed for user ${u.user_id}:`, err);
    }
  }
}

/** برای تست‌ها */
export { morningText as _morningText, eveningText as _eveningText, dayLine as _dayLine };
