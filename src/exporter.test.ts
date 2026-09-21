import { describe, expect, it } from "vitest";
import { buildHtmlReport, buildPdfReport, buildReportModel, faForPdfLib, faToDrawable } from "./exporter";
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
    created_at: "2026-09-21T00:00:00.000Z",
    last_reminded_at: null,
    reminder_count: 0,
    ...p,
  };
}

describe("faToDrawable (شکل‌دهی + bidi)", () => {
  it("متن فارسی شکل‌دهی می‌شود", () => {
    const out = faToDrawable("سلام");
    expect(out).not.toBe("سلام"); // حروف به فرم اتصالی تبدیل شده‌اند
    expect([...out].length).toBeGreaterThan(0);
  });
  it("ارقام و زمان برعکس نمی‌شوند", () => {
    const out = faToDrawable("ساعت ۱۲:۳۰");
    expect(out).toContain("۱۲:۳۰");
  });
  it("لاتین دست‌نخورده", () => {
    const out = faToDrawable("Task 12");
    expect(out).toContain("Task 12");
  });
});

describe("گزارش HTML", () => {
  it("سند کامل RTL با تسک‌ها", () => {
    const m = buildReportModel([task({}), task({ status: "done", title: "خرید نان" })], "Iman");
    const html = buildHtmlReport(m);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("لندینگ پیج رو درست کن");
    expect(html).toContain("خرید نان");
    expect(html).toContain("تمام‌شده");
    expect(html).not.toContain("<script"); // امن: بدون اسکریپت
  });
  it("escape مقادیر", () => {
    const m = buildReportModel([task({ title: '<b>x</b>"' })], "Iman");
    expect(buildHtmlReport(m)).not.toContain("<b>x</b>");
  });
});

describe("گزارش PDF", () => {
  it("PDF فارسی ساخته می‌شود و هدر دارد", async () => {
    const m = buildReportModel(
      [task({}), task({ status: "in_progress" }), task({ status: "done", title: "تمام شد" })],
      "Iman"
    );
    const pdf = await buildPdfReport(m);
    expect(pdf.length).toBeGreaterThan(2000);
    const head = new TextDecoder().decode(pdf.slice(0, 5));
    expect(head).toBe("%PDF-");
  });
});

describe("faForPdfLib (جبران برعکس‌کنندگی fontkit)", () => {
  it("متنی که حروف فارسی دارد → کل رشته برعکس می‌شود", () => {
    const d = faToDrawable("سلام ۱۲");
    const c = faForPdfLib("سلام ۱۲");
    expect([...c].reverse().join("")).toBe(d); // برعکسِ آن = drawable
  });
  it("متن فقط-لاتین → دست‌نخورده", () => {
    expect(faForPdfLib("Task 44")).toBe("Task 44");
  });
});
