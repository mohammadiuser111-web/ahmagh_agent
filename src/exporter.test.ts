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
    expect(html).toContain("جمع‌بندی"); // گزارش‌طور
    expect(html).toContain("<svg"); // داشبورد
    expect(html).toContain("لندینگ پیج رو درست کن");
    expect(html).toContain("خرید نان");
    expect(html).toContain("احمق‌ایجنت");
  });
  it("تبِ پیش‌فرض از پارامتر style می‌آید", () => {
    const m = buildReportModel(tasks, "Iman");
    expect(buildHtmlReport(m, "dash")).toContain('id="t-dash" checked');
    expect(buildHtmlReport(m, "report")).toContain('id="t-report" checked');
    expect(buildHtmlReport(m, "list")).toContain('id="t-list" checked');
  });
  it("فونت Vazirmatn embed شده (data:font، بدون CDN)", () => {
    const html = buildHtmlReport(buildReportModel(tasks, "Iman"), "list");
    expect(html).toContain("@font-face");
    expect(html).toContain("data:font/woff2;base64,");
    expect(html).not.toContain("http://"); // هیچ منبع خارجی
    expect(html).not.toContain("https://"); // هیچ منبع خارجی
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
