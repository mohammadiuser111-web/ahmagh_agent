/**
 * خروجی گزارشی از تسک‌ها: HTML (RTL زیبا) یا PDF فارسی (pdf-lib + Vazir)
 */
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { PersianShaper } from "arabic-persian-reshaper";
import { VAZIR_TTF_B64 } from "./fonts/vazir";
import type { TaskRow } from "./types";
import { STATUS_EMOJI, STATUS_LABEL } from "./format";
import { escapeHtml } from "./telegram";
import { faDigits, fmtDate, fmtTimeTehran, todayTehranISO } from "./dates";

// ============================================================
// دکمه‌ی انتخاب فرمت خروجی
// ============================================================
export function exportKeyboard(userId: number) {
  return {
    inline_keyboard: [
      [
        { text: "🌐 HTML", callback_data: `ex|${userId}|html` },
        { text: "📄 PDF", callback_data: `ex|${userId}|pdf` },
      ],
    ],
  };
}

// ============================================================
// داده‌ی مشترک
// ============================================================
interface ReportModel {
  name: string;
  nowFa: string;
  open: TaskRow[];
  done: TaskRow[];
  total: number;
}

export function buildReportModel(tasks: TaskRow[], name: string): ReportModel {
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  return {
    name,
    nowFa: `${fmtDate(todayTehranISO())} — ${fmtTimeTehran(new Date().toISOString())}`,
    open,
    done,
    total: tasks.length,
  };
}

function taskLine(t: TaskRow): { main: string; meta: string } {
  const time = (iso: string | null) => (iso ? ` ساعت ${fmtTimeTehran(iso)}` : "");
  return {
    main: `${t.title}`,
    meta:
      `شروع: ${fmtDate(t.start_date)}${time(t.start_at)}` +
      ` | پایان: ${fmtDate(t.due_date)}${time(t.due_at)}` +
      ` | وضعیت: ${STATUS_LABEL[t.status]}`,
  };
}

// ============================================================
// HTML — کاملاً self-contained (بدون وابستگی خارجی)
// ============================================================
export function buildHtmlReport(m: ReportModel): string {
  const card = (t: TaskRow) => {
    const { main, meta } = taskLine(t);
    return `    <div class="card ${t.status}">
      <div class="title">${STATUS_EMOJI[t.status]} ${escapeHtml(main)}</div>
      ${t.description ? `<div class="desc">${escapeHtml(t.description)}</div>` : ""}
      <div class="meta">${escapeHtml(meta)} | شناسه: ${faDigits(t.id)}</div>
    </div>`;
  };
  const section = (title: string, rows: TaskRow[]) =>
    rows.length
      ? `  <h2>${title} <span class="badge">${faDigits(rows.length)}</span></h2>\n${rows.map(card).join("\n")}`
      : "";

  const inProgress = m.open.filter((t) => t.status === "in_progress");
  const notStarted = m.open.filter((t) => t.status === "not_started");

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>گزارش تسک‌ها — ${escapeHtml(m.name)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Vazirmatn", "Vazir", Tahoma, "Segoe UI", sans-serif; background: #f4f6f9; color: #1f2937; padding: 24px; line-height: 1.9; }
  .wrap { max-width: 760px; margin: 0 auto; }
  h1 { color: #111827; font-size: 26px; margin-bottom: 4px; }
  .meta { color: #6b7280; font-size: 13px; margin-bottom: 16px; }
  .summary { background: #111827; color: #fff; border-radius: 12px; padding: 12px 18px; font-size: 14px; margin-bottom: 24px; }
  h2 { font-size: 18px; margin: 22px 0 10px; color: #374151; }
  .badge { background: #e5e7eb; color: #374151; border-radius: 999px; font-size: 12px; padding: 1px 10px; vertical-align: middle; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-right: 4px solid #9ca3af; border-radius: 10px; padding: 12px 16px; margin-bottom: 10px; }
  .card.not_started { border-right-color: #94a3b8; }
  .card.in_progress { border-right-color: #f59e0b; }
  .card.done { border-right-color: #10b981; }
  .title { font-weight: 700; font-size: 15px; }
  .desc { color: #4b5563; font-size: 13px; margin-top: 2px; }
  .meta { color: #6b7280; font-size: 12px; margin-top: 6px; }
  footer { margin-top: 28px; text-align: center; color: #9ca3af; font-size: 12px; }
  @media print { body { background: #fff; } .card { break-inside: avoid; } }
</style>
</head>
<body>
<div class="wrap">
  <h1>📋 گزارش تسک‌ها</h1>
  <div class="meta">برای: ${escapeHtml(m.name)} | ${m.nowFa}</div>
  <div class="summary">جمع‌بندی: ${faDigits(m.total)} تسک — ${faDigits(inProgress.length)} در حال انجام، ${faDigits(notStarted.length)} شروع‌نشده، ${faDigits(m.done.length)} تمام‌شده</div>
  ${section("🔓 تسک‌های باز", notStarted)}
  ${section("⏳ در حال انجام", inProgress)}
  ${section("✅ تمام‌شده", m.done)}
  <footer>ساخته‌شده توسط احمق‌ایجنت 🤖 — ${m.nowFa}</footer>
</div>
</body>
</html>`;
}

// ============================================================
// PDF فارسی — شکل‌دهی حروف + bidi ساده + فونت Vazir
// ============================================================

/** آیا کاراکتر در محدوده‌ی خط عربی/فارسی است؟ */
function isArabicChar(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x0600 && c <= 0x06ff) || (c >= 0xfb50 && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfeff);
}

/** رقم (فارسی ۰-۹، عربی ٠-٩ یا لاتین 0-9)؟ — هرگز نباید برعکس شود
 *  ⚠️ PersianShaper ارقام فارسی را به Arabic-Indic (٠-٩) تبدیل می‌کند! */
function isDigitChar(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x30 && c <= 0x39) || (c >= 0x06f0 && c <= 0x06f9) || (c >= 0x0660 && c <= 0x0669);
}

/**
 * تبدیل متن فارسی به رشته‌ی قابل رسم در PDF (که LTR رسم می‌شود):
 * ۱) شکل‌دهی حروف (اتصال‌ها + لام‌الف) با PersianShaper
 * ۲) bidi ساده‌ی سطح-رانی: هر کاراکتر خنثی (فاصله/نقطه‌گذاری) جهتِ همسایه‌اش را می‌گیرد؛
 *    اگر همسایه‌ها مخلوط باشند جهتِ پاراگراف (RTL)؛ ارقام و لاتین هرگز برعکس نمی‌شوند.
 *    در نهایت ترتیب ران‌ها برعکس و حروفِ ران‌های RTL هم برعکس می‌شوند.
 */
type Dir = "R" | "L";

function classifyChar(ch: string): "R" | "L" | "N" {
  if (isDigitChar(ch)) return "L"; // ارقام (فارسی/لاتین) همیشه به‌عنوان قطعه‌ی چپ‌به‌راست
  if (isArabicChar(ch)) return "R";
  if (/[A-Za-z]/.test(ch)) return "L";
  return "N"; // فاصله، دونقطه، خط تیره، | و ...
}

export function faToDrawable(text: string): string {
  const shaped = PersianShaper.convertArabic(text).replace(/\u200c/g, "");
  const chars = [...shaped];
  const cls = chars.map(classifyChar);

  const dirs: Dir[] = cls.map((c, i) => {
    if (c !== "N") return c;
    let prev: "R" | "L" | null = null;
    let next: "R" | "L" | null = null;
    for (let j = i - 1; j >= 0; j--) if (cls[j] !== "N") { prev = cls[j] as "R" | "L"; break; }
    for (let j = i + 1; j < cls.length; j++) if (cls[j] !== "N") { next = cls[j] as "R" | "L"; break; }
    if (prev && next) return prev === next ? prev : "R"; // مخلوط → جهت پاراگراف (RTL)
    return prev ?? next ?? "R";
  });

  const runs: { rtl: boolean; chars: string[] }[] = [];
  chars.forEach((ch, i) => {
    const rtl = dirs[i] === "R";
    const last = runs[runs.length - 1];
    if (last && last.rtl === rtl) last.chars.push(ch);
    else runs.push({ rtl, chars: [ch] });
  });

  const out: string[] = [];
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    out.push(r.rtl ? r.chars.reverse().join("") : r.chars.join(""));
  }
  return out.join("");
}

/**
 * ⚠️ نکته‌ی حیاتی pdf-lib: متد layout فونت‌کیت برای متن‌های دارای حروف عربی/فارسی
 * «کل رشته را برعکس می‌کند». پس ما هم از قبل کل drawable را برعکس می‌دهیم تا
 * خروجی نهایی دقیقاً همان ترتیب بصریِ درست شود.
 */
export function faForPdfLib(text: string): string {
  const d = faToDrawable(text);
  return /[\u0600-\u06FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(d) ? [...d].reverse().join("") : d;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const INK = rgb(0.11, 0.13, 0.17);
const GRAY = rgb(0.45, 0.5, 0.56);
const ACCENT = rgb(0.96, 0.55, 0.11);

export async function buildPdfReport(m: ReportModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(b64ToBytes(VAZIR_TTF_B64), { subset: false });

  const W = 595.28, H = 841.89, M = 48; // A4 + حاشیه
  let page = pdf.addPage([W, H]);
  let y = H - M;

  const draw = (text: string, size: number, xRight: number, color = INK, bold = false) => {
    page.drawText(faForPdfLib(text), { x: xRight, y, size, font, color });
    void bold;
  };
  const width = (text: string, size: number) => font.widthOfTextAtSize(faForPdfLib(text), size);
  const right = (text: string, size: number, color = INK) => draw(text, size, W - M - width(text, size), color);
  const ensureSpace = (need: number) => {
    if (y - need < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };

  // سربرگ
  right("گزارش تسک‌ها", 24);
  y -= 22;
  right(`برای: ${m.name}`, 12, GRAY);
  y -= 16;
  right(m.nowFa, 10, GRAY);
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: ACCENT });
  y -= 22;

  const inProgress = m.open.filter((t) => t.status === "in_progress");
  const notStarted = m.open.filter((t) => t.status === "not_started");
  right(
    `جمع‌بندی: ${m.total} تسک — ${inProgress.length} در حال انجام، ${notStarted.length} شروع‌نشده، ${m.done.length} تمام‌شده`,
    11
  );
  y -= 26;

  const section = (title: string, rows: TaskRow[]) => {
    if (!rows.length) return;
    ensureSpace(40);
    right(title, 15);
    y -= 20;
    for (const t of rows) {
      const { main, meta } = taskLine(t);
      ensureSpace(58);
      right(main, 12);
      y -= 15;
      right(meta, 9, GRAY);
      y -= 15;
      right(`شناسه: ${t.id}`, 9, GRAY);
      y -= 17;
      page.drawLine({
        start: { x: M, y: y + 6 },
        end: { x: W - M, y: y + 6 },
        thickness: 0.4,
        color: rgb(0.85, 0.87, 0.9),
      });
      y -= 8;
    }
    y -= 10;
  };

  section("تسک‌های باز", notStarted);
  section("در حال انجام", inProgress);
  section("تمام‌شده", m.done);

  ensureSpace(30);
  y = M + 8;
  right("ساخته‌شده توسط احمق‌ایجنت", 8, GRAY);

  return pdf.save();
}
