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

describe("گزارش HTML — سه شکل", () => {
  const TITLES: Record<ExportStyle, string> = {
    list: "فهرست تسک‌ها",
    report: "گزارش تسک‌ها",
    dash: "داشبورد تسک‌ها",
  };
  for (const style of ["list", "report", "dash"] as ExportStyle[]) {
    it(`شکل ${style}: سند کامل RTL با توکن‌های CSS و بدون اسکریپت`, () => {
      const m = buildReportModel(tasks, "Iman");
      const html = buildHtmlReport(m, style);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain('dir="rtl"');
      expect(html).toContain("--ink:"); // توکن‌های دیزاین
      expect(html).not.toContain("<script"); // امن: بدون اسکریپت
      expect(html).toContain(TITLES[style]);
      expect(html).toContain("احمق‌ایجنت");
      if (style !== "dash") {
        expect(html).toContain("لندینگ پیج رو درست کن");
        expect(html).toContain("خرید نان");
      }
    });
  }
  it("STYLE_LABEL برای دکمه‌ها موجود است", () => {
    expect(STYLE_LABEL.list).toContain("لیستی");
    expect(STYLE_LABEL.report).toContain("گزارش");
    expect(STYLE_LABEL.dash).toContain("داشبورد");
  });

  it("لیستی: جدول واقعی با ستون وضعیت", () => {
    const html = buildHtmlReport(buildReportModel(tasks, "Iman"), "list");
    expect(html).toContain("<table");
    expect(html).toContain("<th>وضعیت</th>");
    expect(html).toContain("تمام‌شده");
  });

  it("گزارش‌طور: بخش‌ها و شماره‌گذاری", () => {
    const html = buildHtmlReport(buildReportModel(tasks, "Iman"), "report");
    expect(html).toContain("در حال انجام");
    expect(html).toContain("جمع‌بندی");
  });

  it("داشبورد: KPI + نمودار SVG رنگی", () => {
    const html = buildHtmlReport(buildReportModel(tasks, "Iman"), "dash");
    expect(html).toContain("<svg");
    expect(html).toContain("stroke-dasharray"); // دونات
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
