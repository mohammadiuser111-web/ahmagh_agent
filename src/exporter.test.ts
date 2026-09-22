import { describe, expect, it } from "vitest";
import { STYLE_LABEL, buildHtmlReport, buildReportModel } from "./exporter";
import type { ExportStyle } from "./exporter";
import type { TaskRow } from "./types";

function task(p: Partial<TaskRow>): TaskRow {
  return {
    id: 44,
    title: "لندینگ پیج رو درست کن",
    description: "برای یک سایت",
    creator_id: 1,
    assignee_id: 1,
    status: "not_started",
    start_date: "2026-09-22",
    start_at: "2026-09-22T08:00:00+03:30",
    started_at: null,
    due_date: "2026-09-23",
    due_at: "2026-09-23T22:00:00+03:30",
    completed_at: null,
    auto_start: 1,
    reminder_type: "default",
    reminder_time: null,
    reminder_interval_hours: null,
    reminder_lead_minutes: null,
    reminder_at: null,
    reminder_done: 0,
    created_at: "2026-09-21T00:00:00.000Z",
    last_reminded_at: null,
    reminder_count: 0,
    ...p,
  };
}

const tasks = [
  task({}),
  task({ id: 45, status: "done", title: "خرید نان" }),
  task({ id: 46, status: "in_progress", title: "تماس با مشتری", assignee_id: 2 }),
];

describe("گزارش HTML — تک‌فایل با سه تب", () => {
  it("سه تب (radio + label) و هر سه بخش داخل یک فایل — بدون اسکریپت", () => {
    const m = buildReportModel(tasks, "Iman");
    const html = buildHtmlReport(m, "list");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("--ink:"); // توکن‌های دیزاین
    expect(html).not.toContain("<script"); // تب‌ها با CSS خالص
    // سه تب
    for (const id of ["t-list", "t-report", "t-dash"]) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`for="${id}"`);
    }
    // و محتوای هر سه شکل در همان فایل
    expect(html).toContain("<table"); // لیستی
    expect(html).toContain('class="summary"'); // گزارش‌طور (جمع‌بندی)
    expect(html).toContain("در حال انجام");
    expect(html).toContain("<svg"); // داشبورد
    expect(html).toContain("لندینگ پیج رو درست کن");
    expect(html).toContain("خرید نان");
    expect(html).toContain("احمق‌ایجنت");
  });
  it("تبِ پیش‌فرض از پارامتر style می‌آید", () => {
    const m = buildReportModel(tasks, "Iman");
    expect(buildHtmlReport(m, "dash")).toMatch(/id="t-dash"[^>]*checked/);
    expect(buildHtmlReport(m, "report")).toMatch(/id="t-report"[^>]*checked/);
    expect(buildHtmlReport(m, "list")).toMatch(/id="t-list"[^>]*checked/);
    // فقط یکی checked است
    expect(buildHtmlReport(m, "dash").match(/ checked/g)!.length).toBe(1);
  });
  it("فونت Vazirmatn embed شده (data:font، بدون CDN)", () => {
    const html = buildHtmlReport(buildReportModel(tasks, "Iman"), "list");
    expect(html).toContain("@font-face");
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).not.toContain("http://"); // هیچ منبع خارجی
    expect(html).not.toContain("https://"); // هیچ منبع خارجی
  });
  it("تم روشن/تیره: کلید CSS-only + پیش‌فرض از سیستم + چاپ همیشه روشن", () => {
    const html = buildHtmlReport(buildReportModel(tasks, "Iman"), "list");
    expect(html).toContain('id="tg"'); // checkbox تم
    expect(html).toContain('for="tg"'); // دکمه‌ی کلید
    expect(html).toContain("prefers-color-scheme: dark"); // پیش‌فرض از سیستم
    expect(html).toContain("color-scheme:dark"); // توکن‌های تم تیره
    expect(html.match(/#tg:checked ~ \.wrap/g)!.length).toBeGreaterThanOrEqual(2); // معکوس‌کردن تم در هر دو حالت سیستم
    // در چاپ تم روشن اعمال می‌شود (بلاک print بعد از قواعد تم)
    expect(html.indexOf("@media print")).toBeGreaterThan(html.indexOf("#tg:checked ~ .wrap{"));
  });
  it("آیکون SVG به جای ایموجی + انیمیشن‌ها", () => {
    const html = buildHtmlReport(buildReportModel(tasks, "Iman"), "list");
    // آیکون‌های خطی SVG با currentColor
    expect((html.match(/<svg class="ic/g) ?? []).length).toBeGreaterThan(15);
    expect(html).toContain('stroke="currentColor"');
    // هیچ ایموجی در خروجی نباشد
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u);
    // انیمیشن‌ها + احترام به reduced-motion
    expect(html).toContain("@keyframes rise");
    expect(html).toContain("@keyframes grow");
    expect(html).toContain("prefers-reduced-motion");
    // افکت stagger با متغیر --i
    expect(html).toContain("--i:");
  });
  it("STYLE_LABEL برای دکمه‌ها موجود است", () => {
    expect(STYLE_LABEL.list).toContain("لیستی");
    expect(STYLE_LABEL.report).toContain("گزارش");
    expect(STYLE_LABEL.dash).toContain("داشبورد");
  });

  it("داشبورد: KPI + دونات + نزدیک‌ترین ددلاین‌ها", () => {
    const html = buildHtmlReport(buildReportModel(tasks, "Iman"), "dash");
    expect(html).toContain("stroke-dasharray"); // دونات SVG
    expect(html).toContain("--c-doing"); // رنگ داده در توکن‌ها
    expect(html).toContain("نزدیک‌ترین ددلاین");
  });

  it("چندکاربره: ستون مسئول و نمودار به ازای کاربر", () => {
    const m = buildReportModel(tasks, "همه‌ی کاربرها", [
      { id: 1, name: "ایمان" },
      { id: 2, name: "سارینا" },
    ]);
    expect(m.users).toHaveLength(2);
    const list = buildHtmlReport(m, "list");
    expect(list).toContain("<th>مسئول</th>");
    expect(list).toContain("سارینا");
    const dash = buildHtmlReport(m, "dash");
    expect(dash).toContain("تسک به ازای هر کاربر");
  });

  it("escape مقادیر کاربر", () => {
    const html = buildHtmlReport(buildReportModel([task({ title: "<b>x</b>" })], "<i>Q</i>"), "list");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("سررسید گذشته با هشدار", () => {
    const m = buildReportModel(
      [task({ status: "in_progress", due_date: "2026-01-01", due_at: "2026-01-01T10:00:00+03:30" })],
      "Iman"
    );
    expect(m.overdue).toHaveLength(1);
    const dash = buildHtmlReport(m, "dash");
    expect(dash).toContain("سررسیدشان گذشته");
  });
});
