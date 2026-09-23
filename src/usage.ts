/**
 * گزارش مصرف و هزینه — از GraphQL Analytics کلادفلر (لحظه‌ای، بدون ذخیره‌سازی)
 *
 * چه چیزی می‌خواند:
 *  - Workers AI: نورون‌ها و توکن‌ها (سهم رایگان: ۱۰٬۰۰۰ نورون در روز)
 *  - Workers: تعداد درخواست و CPU (سهم رایگان: ۱۰۰٬۰۰۰ درخواست در روز)
 *  - D1: ردیف‌های خوانده/نوشته‌شده (رایگان: ۵ میلیون خواندن / ۱۰۰ هزار نوشتن در روز)
 *  - D1: حجم دیتابیس (رایگان: ۵ گیگابایت)
 *
 * بازه‌ها: امروز · ۷ روز اخیر · از شروع (پرس‌وجوی زنجیره‌ای ۳۱روزه تا جایی که داده هست)
 * روزها UTC هستند — سهمیه‌های روزانه‌ی کلادفلر هم UTC حساب می‌شوند.
 * اگر CF_API_TOKEN تنظیم نباشد → گزارش محلی (فقط شمارش‌های خودِ دیتابیس).
 */
import type { Env } from "./types";
import { faDigits, fmtDate } from "./dates";

/** سهمیه‌های پلن رایگان */
export const FREE_LIMITS = {
  neuronsPerDay: 10_000,
  workerRequestsPerDay: 100_000,
  d1RowsReadPerDay: 5_000_000,
  d1RowsWrittenPerDay: 100_000,
  d1StorageBytes: 5 * 1024 ** 3,
};

const SCRIPT_NAME = "ahmagh-agent";
const GRAPHQL_URL = "https://api.cloudflare.com/client/v4/graphql";
const CHUNK_DAYS = 31; // سقف پنجره‌ی کوئری: 4w4d (کلادفلر بیشتر نگه نمی‌دارد)

export interface DayRow {
  date: string; // YYYY-MM-DD (UTC)
  neurons: number;
  inTokens: number;
  outTokens: number;
  requests: number;
  errors: number;
  cpuTimeUs: number;
  rowsRead: number;
  rowsWritten: number;
}

export interface UsageSnapshot {
  days: DayRow[];
  storageBytes: number | null;
  firstDate: string | null;
}

const emptyDay = (date: string): DayRow => ({
  date,
  neurons: 0,
  inTokens: 0,
  outTokens: 0,
  requests: 0,
  errors: 0,
  cpuTimeUs: 0,
  rowsRead: 0,
  rowsWritten: 0,
});

/** تجمیع ردیف‌های روزانه در یک بازه (شامل روز پایانی) */
export function sumRange(days: DayRow[], fromDate: string): DayRow {
  const agg = emptyDay(fromDate);
  for (const d of days) if (d.date >= fromDate) {
    agg.neurons += d.neurons;
    agg.inTokens += d.inTokens;
    agg.outTokens += d.outTokens;
    agg.requests += d.requests;
    agg.errors += d.errors;
    agg.cpuTimeUs += d.cpuTimeUs;
    agg.rowsRead += d.rowsRead;
    agg.rowsWritten += d.rowsWritten;
  }
  return agg;
}

/** یک پنجره از آنالیتیکس — خروجی: ردیف‌های روزانه + بیشینه‌ی حجم دیتابیس */
async function fetchChunk(
  env: Env,
  account: string,
  databaseId: string,
  sinceISO: string
): Promise<{ days: Map<string, DayRow>; storage: number } | null> {
  const query = `query {
    viewer {
      accounts(filter: { accountTag: "${account}" }) {
        ai: aiInferenceAdaptiveGroups(limit: 500, filter: { datetimeHour_geq: "${sinceISO}" }) {
          dimensions { date }
          sum { totalNeurons totalInputTokens totalOutputTokens }
        }
        wk: workersInvocationsAdaptive(limit: 500, filter: { datetime_geq: "${sinceISO}", scriptName: "${SCRIPT_NAME}" }) {
          dimensions { date }
          sum { requests errors cpuTimeUs }
        }
        d1: d1AnalyticsAdaptiveGroups(limit: 500, filter: { datetimeHour_geq: "${sinceISO}", databaseId: "${databaseId}" }) {
          dimensions { date }
          sum { rowsRead rowsWritten }
        }
        st: d1StorageAdaptiveGroups(limit: 10, filter: { datetimeHour_geq: "${sinceISO}", databaseId: "${databaseId}" }) {
          max { databaseSizeBytes }
        }
      }
    }
  }`;
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`cloudflare api ${res.status}`);
  const json: any = await res.json();
  if (json.errors?.length) throw new Error(String(json.errors[0]?.message ?? "graphql error"));
  const acc = json?.data?.viewer?.accounts?.[0];
  if (!acc) return null;

  const days = new Map<string, DayRow>();
  const bump = (date: string | null, fn: (d: DayRow) => void) => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const row = days.get(date) ?? emptyDay(date);
    fn(row);
    days.set(date, row);
  };
  for (const g of acc.ai ?? []) {
    const s = g.sum ?? {};
    bump(g.dimensions?.date, (d) => {
      d.neurons += Number(s.totalNeurons ?? 0);
      d.inTokens += Number(s.totalInputTokens ?? 0);
      d.outTokens += Number(s.totalOutputTokens ?? 0);
    });
  }
  for (const g of acc.wk ?? []) {
    const s = g.sum ?? {};
    bump(g.dimensions?.date, (d) => {
      d.requests += Number(s.requests ?? 0);
      d.errors += Number(s.errors ?? 0);
      d.cpuTimeUs += Number(s.cpuTimeUs ?? 0);
    });
  }
  for (const g of acc.d1 ?? []) {
    const s = g.sum ?? {};
    bump(g.dimensions?.date, (d) => {
      d.rowsRead += Number(s.rowsRead ?? 0);
      d.rowsWritten += Number(s.rowsWritten ?? 0);
    });
  }
  let storage = 0;
  for (const g of acc.st ?? []) storage = Math.max(storage, Number(g.max?.databaseSizeBytes ?? 0));
  return { days, storage };
}

/** پرس‌وجوی آنالیتیکس — کلادفلر حداکثر ۳۲ روز داده نگه می‌دارد؛ «از شروع» = قدیمی‌ترین روزِ موجود */
export async function fetchUsage(env: Env): Promise<UsageSnapshot | null> {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID || !env.D1_DATABASE_ID) return null;
  const since = new Date(Date.now() - CHUNK_DAYS * 86_400_000).toISOString().slice(0, 11) + "00:00:00Z";
  const r = await fetchChunk(env, env.CF_ACCOUNT_ID, env.D1_DATABASE_ID, since);
  if (!r) return null;
  const dates = [...r.days.keys()].sort();
  return {
    days: [...r.days.values()].sort((a, b) => a.date.localeCompare(b.date)),
    storageBytes: r.storage || null,
    firstDate: dates.length ? dates[0] : null,
  };
}

// ============================================================
// نمایش
// ============================================================

/** 12345 → «۱۲٬۳۴۵» */
const faNum = (n: number): string => faDigits(Math.round(n).toLocaleString("en-US")).replace(/,/g, "٬");

const faPct = (used: number, limit: number): string => {
  if (limit <= 0) return "—";
  const pct = (used / limit) * 100;
  const v = pct >= 10 ? String(Math.round(pct)) : String(Math.round(pct * 10) / 10);
  return faDigits(v.replace(".", "٫")) + "٪"; // ممیزِ فارسی
};

const faBytes = (b: number): string => {
  if (b >= 1024 ** 3) return `${faDigits(Math.round((b / 1024 ** 3) * 10) / 10)} گیگابایت`;
  if (b >= 1024 ** 2) return `${faDigits(Math.round((b / 1024 ** 2) * 10) / 10)} مگابایت`;
  if (b >= 1024) return `${faDigits(Math.round(b / 1024))} کیلوبایت`;
  return `${faDigits(b)} بایت`;
};

const isoDaysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

function periodBlock(title: string, a: DayRow): string[] {
  const lines = [`<b>${title}</b>`];
  lines.push(`• هوش مصنوعی: ${faNum(a.neurons)} نورون${a.inTokens || a.outTokens ? ` (${faNum(a.inTokens)} توکن ورودی / ${faNum(a.outTokens)} خروجی)` : ""}`);
  lines.push(`• ورکر: ${faNum(a.requests)} درخواست${a.errors ? ` — ${faNum(a.errors)} خطا` : ""}`);
  lines.push(`• دیتابیس: ${faNum(a.rowsRead)} خواندن / ${faNum(a.rowsWritten)} نوشتن`);
  return lines;
}

export interface LocalCounts {
  users: number;
  tasks: number;
  openTasks: number;
  doneTasks: number;
}

/** متن گزارش — snap==null یعنی آنالیتیکس در دسترس نیست (fallback محلی) */
export function renderUsageReport(snap: UsageSnapshot | null, local: LocalCounts): string {
  const L: string[] = ["<b>مصرف و هزینه</b>", "پلن رایگان Cloudflare", ""];
  L.push("هزینه‌ی واقعی تا الان: <b>$۰</b> — همه‌چیز داخل سهمِ رایگان است.");

  if (!snap) {
    L.push("", "آمار لحظه‌ای کلادفلر در دسترس نیست (CF_API_TOKEN تنظیم نشده).");
  } else {
    const today = sumRange(snap.days, isoDaysAgo(0));
    const week = sumRange(snap.days, isoDaysAgo(6));
    const all = sumRange(snap.days, "0000-00-00");

    L.push("");
    L.push(...periodBlock("امروز", today));
    L.splice(
      L.length,
      0,
      `  ↳ از سهم رایگان: نورون ${faPct(today.neurons, FREE_LIMITS.neuronsPerDay)} · درخواست ${faPct(today.requests, FREE_LIMITS.workerRequestsPerDay)}`
    );

    L.push("");
    L.push(...periodBlock("۷ روز اخیر", week));

    const sinceFa = snap.firstDate
      ? `از شروع (${fmtDate(snap.firstDate)} تا کنون)`
      : "کل بازه‌ی موجود (۳۱ روز)";
    L.push("");
    L.push(...periodBlock(sinceFa, all));
    if (snap.days.length) {
      const maxNeurons = Math.max(...snap.days.map((d) => d.neurons));
      L.push(`  ↳ پرمصرف‌ترین روز: ${faNum(maxNeurons)} نورون`);
    }

    if (snap.storageBytes != null) {
      L.push("");
      L.push("<b>فضای دیتابیس</b>");
      L.push(`• مصرف: ${faBytes(snap.storageBytes)} از ${faBytes(FREE_LIMITS.d1StorageBytes)} (${faPct(snap.storageBytes, FREE_LIMITS.d1StorageBytes)})`);
      L.push(`• باقی‌مانده: ${faBytes(Math.max(0, FREE_LIMITS.d1StorageBytes - snap.storageBytes))}`);
    }
  }

  L.push("", "<b>دیتای خودمان</b>");
  L.push(`• ${faNum(local.users)} کاربر · ${faNum(local.tasks)} تسک (${faNum(local.openTasks)} باز، ${faNum(local.doneTasks)} تمام‌شده)`);
  return L.join("\n");
}
