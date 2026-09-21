import { describe, expect, it } from "vitest";
import { REMINDER_INTERVALS_HOURS, reminderIntervalHours } from "./reminders";
import type { TaskRow } from "./types";

// ظهرِ ۲۱ شهریور ۱۴۰۵ به وقت تهران
const NOW = Date.parse("2026-09-21T12:00:00+03:30");

function task(p: Partial<TaskRow>): TaskRow {
  return {
    id: 1,
    title: "تست",
    description: "",
    creator_id: 1,
    assignee_id: 1,
    status: "not_started",
    start_date: null,
    started_at: null,
    due_date: null,
    completed_at: null,
    created_at: "2026-09-21T00:00:00.000Z",
    last_reminded_at: null,
    reminder_count: 0,
    ...p,
  };
}

describe("reminderIntervalHours (الگوریتم یادآوری)", () => {
  it("تسک تمام‌شده → بدون یادآوری", () => {
    expect(reminderIntervalHours(task({ status: "done", due_date: "2026-09-20" }), NOW)).toBeNull();
  });

  it("تاریخ شروع نرسیده → بدون یادآوری", () => {
    expect(reminderIntervalHours(task({ start_date: "2026-09-25" }), NOW)).toBeNull();
  });

  it("روز شروع رسیده → یادآوری فعال است", () => {
    expect(reminderIntervalHours(task({ start_date: "2026-09-21", due_date: "2026-09-25" }), NOW)).toBe(
      REMINDER_INTERVALS_HOURS.normal
    );
  });

  it("بدون تاریخ پایان → هر ۴۸ ساعت", () => {
    expect(reminderIntervalHours(task({}), NOW)).toBe(REMINDER_INTERVALS_HOURS.noDueDate);
  });

  it("سررسید گذشته → هر ۲ ساعت", () => {
    expect(reminderIntervalHours(task({ due_date: "2026-09-20" }), NOW)).toBe(REMINDER_INTERVALS_HOURS.overdue);
  });

  it("همین امروز سررسید است (کمتر از ۲۴ ساعت) → هر ۴ ساعت", () => {
    expect(reminderIntervalHours(task({ due_date: "2026-09-21" }), NOW)).toBe(REMINDER_INTERVALS_HOURS.dueSoon24h);
  });

  it("۲ تا ۳ روز مانده → هر ۱۲ ساعت", () => {
    expect(reminderIntervalHours(task({ due_date: "2026-09-23" }), NOW)).toBe(REMINDER_INTERVALS_HOURS.dueSoon72h);
  });

  it("بیش از ۳ روز مانده → هر ۲۴ ساعت", () => {
    expect(reminderIntervalHours(task({ due_date: "2026-10-05" }), NOW)).toBe(REMINDER_INTERVALS_HOURS.normal);
  });
});
