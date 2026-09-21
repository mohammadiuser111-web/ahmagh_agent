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
    start_at: null,
    started_at: null,
    due_date: null,
    due_at: null,
    completed_at: null,
    auto_start: 0,
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

describe("reminderIntervalHours با ساعت دقیق", () => {
  it("ساعت شروع دقیق هنوز نرسیده → بدون یادآوری (حتی اگر روزِ شروع است)", () => {
    expect(
      reminderIntervalHours(
        task({ start_date: "2026-09-21", start_at: "2026-09-21T14:00:00+03:30" }),
        NOW
      )
    ).toBeNull();
  });

  it("ساعت شروع رد شده → یادآوری فعال", () => {
    expect(
      reminderIntervalHours(
        task({ start_date: "2026-09-21", start_at: "2026-09-21T10:00:00+03:30", due_date: "2026-09-25" }),
        NOW
      )
    ).toBe(REMINDER_INTERVALS_HOURS.normal);
  });

  it("سررسیدِ دقیق در آینده‌ی نزدیک → بر اساس فاصله‌ی واقعی", () => {
    // سررسید فردا ساعت ۱۰ صبح → ۲۲ ساعت مانده → بازه‌ی ۲۴ ساعته
    expect(
      reminderIntervalHours(task({ due_date: "2026-09-22", due_at: "2026-09-22T10:00:00+03:30" }), NOW)
    ).toBe(REMINDER_INTERVALS_HOURS.dueSoon24h);
  });

  it("سررسیدِ دقیق گذشته → هر ۲ ساعت", () => {
    expect(
      reminderIntervalHours(task({ due_date: "2026-09-21", due_at: "2026-09-21T11:00:00+03:30" }), NOW)
    ).toBe(REMINDER_INTERVALS_HOURS.overdue);
  });

  it("due_at بر due_date (پایان روز) مقدم است", () => {
    // تنهایی due_date (۵ مهر) → بیش از ۳ روز → ۲۴h؛ اما due_at دقیق ۳۶ ساعت مانده → ۱۲h
    expect(
      reminderIntervalHours(task({ due_date: "2026-10-05", due_at: "2026-09-23T00:00:00+03:30" }), NOW)
    ).toBe(REMINDER_INTERVALS_HOURS.dueSoon72h);
  });
});
