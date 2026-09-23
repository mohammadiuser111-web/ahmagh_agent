/**
 * تست‌های یونیتی parseReminderSpec / reminderSpecText — پارسر الگوی یادآوری فارسی
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseReminderSpec, reminderSpecText } from "../src/dates";

const T = "2026-09-22";

describe("parseReminderSpec", () => {
  it("خاموش: «یادآوری نکن» و مترادف‌ها", () => {
    expect(parseReminderSpec("احمق یه تسک بساز: خرید، تا فردا — یادآوری نکن", T)?.type).toBe("none");
    expect(parseReminderSpec("... یادم نیفته", T)?.type).toBe("none");
    expect(parseReminderSpec("... بدون یادآوری", T)?.type).toBe("none");
  });

  it("هر روز: «هر روز ساعت ۵ یاداوری کن» (مثال خود کاربر)", () => {
    const s = parseReminderSpec("این تسک رو هر روز ساعت 5 یاداوری کن", T);
    expect(s?.type).toBe("daily");
    expect(s?.time).toBe("05:00");
  });

  it("هر روز با عصر: «هر روز ساعت ۵ عصر»", () => {
    const s = parseReminderSpec("هر روز ساعت 5 عصر یادم کن", T);
    expect(s?.type).toBe("daily");
    expect(s?.time).toBe("17:00");
  });

  it("ترتیب برعکس: «ساعت ۸ صبح هر روز»", () => {
    const s = parseReminderSpec("ساعت 8 صبح هر روز بگو", T);
    expect(s?.type).toBe("daily");
    expect(s?.time).toBe("08:00");
  });

  it("هر N ساعت: «هرموقع هر ۲ ساعت» و ارقام فارسی «هر ۳ ساعت»", () => {
    expect(parseReminderSpec("هر 2 ساعت یادم کن", T)).toMatchObject({ type: "every_hours", interval_hours: 2 });
    expect(parseReminderSpec("هر ۳ ساعت یادم کن", T)).toMatchObject({ type: "every_hours", interval_hours: 3 });
  });

  it("قبل از ددلاین: عبارت دقیق کاربر «هرموقع 1 ساعت به ددلاین مونده بود پیام بده»", () => {
    const s = parseReminderSpec("هرموقع 1 ساعت به ددلاین مونده بود پیام بده", T);
    expect(s?.type).toBe("before_deadline");
    expect(s?.lead_minutes).toBe(60);
  });

  it("قبل از ددلاین: روز و دقیقه", () => {
    expect(parseReminderSpec("۳ روز قبل از ددلاین یادم کن", T)).toMatchObject({ type: "before_deadline", lead_minutes: 4320 });
    expect(parseReminderSpec("۴۵ دقیقه قبلش زنگ بزن", T)).toMatchObject({ type: "before_deadline", lead_minutes: 45 });
  });

  // این دو تست به «اکنونِ» واقعی حساس‌اند (اگر ساعتِ درخواستی گذشته باشد، پارسر به جلو می‌غلتد)
  // → ساعت سیستم را فریز می‌کنیم تا همیشه قطعی باشند
  afterEach(() => vi.useRealTimers());

  it("یک‌باره: «فردا ساعت ۱۰ صبح یادم بنداز»", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00Z")); // ۱۵:۳۰ تهران — قبل از ۲۱:۰۰
    const s = parseReminderSpec("فردا ساعت 10 صبح یادم بنداز", T);
    expect(s?.type).toBe("once");
    expect(s?.at).toBe("2026-09-23T10:00:00+03:30");
  });

  it("یک‌باره بدون تاریخ → امروز", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00Z")); // ۱۵:۳۰ تهران — ۲۱:۰۰ هنوز نرسیده
    const s = parseReminderSpec("ساعت 21 یادآوری کن", T);
    expect(s?.type).toBe("once");
    expect(s?.at).toBe(`${T}T21:00:00+03:30`);
  });

  it("بدون هیچ چیزی → null (الگوریتم پیش‌فرض)", () => {
    expect(parseReminderSpec("یه تسک بساز: خرید نان، تا فردا", T)).toBeNull();
  });

  it("اولویت: daily بر before_deadline وقتی هر دو گفته شده", () => {
    const s = parseReminderSpec("هر روز ساعت 8 یادم کن و 1 ساعت قبل از ددلاین هم بگو", T);
    expect(s?.type).toBe("daily");
  });

  it("daily بر every_hours اولویت دارد", () => {
    const s = parseReminderSpec("هر روز ساعت 8 صبح و هر 6 ساعت یادم کن", T);
    expect(s?.type).toBe("daily");
  });
});

describe("reminderSpecText", () => {
  const spec = (o: Partial<Parameters<typeof reminderSpecText>[0]>) => ({
    reminder_type: "none",
    reminder_time: null,
    reminder_interval_hours: null,
    reminder_lead_minutes: null,
    reminder_at: null,
    ...o,
  });

  it("none → خاموش", () => {
    expect(reminderSpecText(spec({}))).toBe("خاموش (بدون یادآوری)");
  });

  it("daily → «هر روز ساعت ۰۸:۰۰»", () => {
    expect(reminderSpecText(spec({ reminder_type: "daily", reminder_time: "08:00" }))).toBe("هر روز ساعت ۰۸:۰۰");
  });

  it("every_hours → «هر ۳ ساعت»", () => {
    expect(reminderSpecText(spec({ reminder_type: "every_hours", reminder_interval_hours: 3 }))).toBe("هر ۳ ساعت");
  });

  it("before_deadline → ساعت/روز فارسی", () => {
    expect(reminderSpecText(spec({ reminder_type: "before_deadline", reminder_lead_minutes: 60 }))).toBe("۱ ساعت قبل از ددلاین");
    expect(reminderSpecText(spec({ reminder_type: "before_deadline", reminder_lead_minutes: 1440 }))).toBe("۱ روز قبل از ددلاین");
    expect(reminderSpecText(spec({ reminder_type: "before_deadline", reminder_lead_minutes: 45 }))).toBe("۴۵ دقیقه قبل از ددلاین");
  });

  it("once → تاریخ شمسی", () => {
    const txt = reminderSpecText(spec({ reminder_type: "once", reminder_at: "2026-09-23T10:00:00+03:30" }));
    expect(txt).toContain("یک‌بار");
    expect(txt).toContain("۱ مهر");
  });
});
