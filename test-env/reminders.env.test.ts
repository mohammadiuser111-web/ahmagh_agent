/**
 * 🧪 محیط ایزوله — موتور یادآوری داینامیک + شروع خودکار
 * روز و ساعتِ شمسیِ واقعی، ولی زمان با advance() جلو می‌رود (معادل سرعت ۲x/۳x)
 * و کرونِ هر ۱۰ دقیقه‌ی مجازی دقیقاً مثل ورکر واقعی اجرا می‌شود.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ALI, ASGHAR, Harness, MOHAMMAD, createScene } from "./harness";
import { addDaysISO, todayTehranISO } from "../src/dates";

let h: Harness;
let TODAY = "";

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});
beforeEach(async () => {
  h = await createScene(); // صحنه‌ی تازه برای هر تست (آلودگی صفر)
  TODAY = todayTehranISO();
});
afterAll(() => {
  vi.restoreAllMocks();
});

/** لحظه‌ی ساعت مشخص تهران در یک تاریخ ISO */
function atTehran(dateISO: string, hh: number, mm = 0): number {
  return Date.parse(`${dateISO}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+03:30`);
}

describe("🔔 یادآوری داینامیک (محیط ایزوله)", () => {
  it("هر روز ساعت ۱۱ صبح — دقیقاً یک‌بار در روز، در ساعت درست", async () => {
    await h.say(ALI, "احمق یه تسک بساز: ورزش صبحگاهی، تا ۳ روز دیگه — هر روز ساعت ۱۱ صبح یادم کن");
    const t = h.tasks().at(-1)!;
    expect(t.reminder_type).toBe("daily");
    expect(t.reminder_time).toBe("11:00");
    expect(t.assignee_id).toBe(ALI.id);
    expect(t.last_reminded_at).toBeNull(); // قواعد داینامیک از اول خودش حاکم است

    // صحنه ساعت ۱۰:۰۰ است → امروز ۱۱:۰۰ اولین یادآوری (همان روز)
    await h.advance(atTehran(TODAY, 11, 5) - h.now());
    expect(h.countSince(ALI.id, "یادآوری روزانه")).toBe(1);
    expect(h.lastText(ALI.id)).toContain("۱۱:۰۰");

    // ادامه‌ی همان روز → تکرار نمی‌شود
    await h.advance(6 * 3600_000);
    expect(h.countSince(ALI.id, "یادآوری روزانه")).toBe(1);

    // فردا ۱۱:۰۰ → دوباره
    await h.advance(atTehran(addDaysISO(TODAY, 1), 11, 5) - h.now());
    expect(h.countSince(ALI.id, "یادآوری روزانه")).toBe(2);

    // پس‌فردا ۱۰:۵۹ → هنوز نه؛ ۱۱:۰۰ → سومی
    await h.advance(atTehran(addDaysISO(TODAY, 2), 10, 59) - h.now());
    expect(h.countSince(ALI.id, "یادآوری روزانه")).toBe(2);
    await h.advance(7 * 60_000);
    expect(h.countSince(ALI.id, "یادآوری روزانه")).toBe(3);
  });

  it("۱ ساعت قبل از ددلاین — فقط یک‌بار، در پنجره‌ی درست", async () => {
    await h.say(ALI, "احمق یه تسک بساز: گزارش هیئت مدیره، تا فردا ساعت ۱۸ — ۱ ساعت قبلش بهم یاد بده");
    const t = h.tasks().at(-1)!;
    expect(t.reminder_type).toBe("before_deadline");
    expect(t.reminder_lead_minutes).toBe(60);
    expect(t.due_at).toBe(`${addDaysISO(TODAY, 1)}T18:00:00+03:30`);

    const before = h.texts(ALI.id).length;
    await h.advance(atTehran(addDaysISO(TODAY, 1), 16, 50) - h.now()); // ۱۰ دقیقه زودتر از موعد
    expect(h.texts(ALI.id).length).toBe(before);

    await h.advance(20 * 60_000); // ۱۷:۱۰ → داخل پنجره
    const after = h.texts(ALI.id).length;
    expect(after).toBe(before + 1);
    expect(h.lastText(ALI.id)).toContain("ددلاین نزدیکه");

    await h.advance(3 * 3600_000); // دیگر هرگز (یک‌باره)
    expect(h.texts(ALI.id).length).toBe(after);
  });

  it("هر ۳ ساعت — بازه‌ی دقیق از لحظه‌ی ساخت", async () => {
    await h.say(MOHAMMAD, "احمق یه تسک بساز: تست دیتابیس، تا ۲ روز دیگه، هر ۳ ساعت یادم کن");
    const t = h.tasks().at(-1)!;
    expect(t.reminder_type).toBe("every_hours");
    expect(t.reminder_interval_hours).toBe(3);

    const start = h.texts(MOHAMMAD.id).length;
    await h.advance(2 * 3600_000 + 50 * 60_000); // ۲:۵۰ → نه
    expect(h.texts(MOHAMMAD.id).length).toBe(start);
    await h.advance(20 * 60_000); // ۳:۱۰ → اولین
    expect(h.texts(MOHAMMAD.id).length).toBe(start + 1);
    await h.advance(3 * 3600_000); // ۳ ساعت بعد از آخرین → دومی
    expect(h.texts(MOHAMMAD.id).length).toBe(start + 2);
    expect(h.lastText(MOHAMMAD.id)).toContain("هر ۳ ساعت");
  });

  it("یادآوری نکن — سکوت مطلق حتی سه روز بعد از سررسید", async () => {
    await h.say(MOHAMMAD, "احمق یه تسک بساز: خرید کتب، تا امروز، یادآوری نکن");
    const t = h.tasks().at(-1)!;
    expect(t.reminder_type).toBe("none");
    const before = h.texts(MOHAMMAD.id).length;
    await h.advance(3 * 24 * 3600_000);
    expect(h.texts(MOHAMMAD.id).length).toBe(before);
  });

  it("یک‌باره: «فردا ساعت ۹ صبح یادم بنداز» — فقط همان لحظه", async () => {
    await h.say(MOHAMMAD, "احمق یه تسک بساز: تماس با مشتری، تا هفته آینده — فردا ساعت ۹ صبح یادم بنداز");
    const t = h.tasks().at(-1)!;
    expect(t.reminder_type).toBe("once");
    expect(t.reminder_at).toBe(`${addDaysISO(TODAY, 1)}T09:00:00+03:30`);

    const before = h.texts(MOHAMMAD.id).length;
    await h.advance(atTehran(addDaysISO(TODAY, 1), 9, 5) - h.now());
    expect(h.texts(MOHAMMAD.id).length).toBe(before + 1);
    await h.advance(24 * 3600_000);
    expect(h.texts(MOHAMMAD.id).length).toBe(before + 1); // فقط همان یک‌بار
  });

  it("الگوریتم پلکانی پیش‌فرض (رگرسیون): سررسید ~۳۸ ساعته → هر ۱۲ ساعت", async () => {
    await h.say(ALI, "احمق یه تسک بساز: مرور کدهای قدیمی، تا فردا");
    const t = h.tasks().at(-1)!;
    expect(t.reminder_type).toBe("default");
    const before = h.texts(ALI.id).length;
    await h.advance(12 * 3600_000 + 10 * 60_000);
    expect(h.texts(ALI.id).length).toBe(before + 1);
    expect(h.lastText(ALI.id)).toMatch(/یادآوری|زمان داره|تموم می‌شه/);
  });

  it("تموم‌کردن تسک → همه‌ی یادآوری‌ها خاموش", async () => {
    await h.say(ALI, "احمق یه تسک بساز: تسک موقتی، تا ۵ روز دیگه — هر روز ساعت ۱۵ یادم کن");
    const t = h.tasks().at(-1)!;
    await h.callback(ALI, `st|${t.id}|done`);
    expect(h.task(t.id)!.status).toBe("done");
    expect(h.task(t.id)!.completed_at).toBeTruthy();
    const before = h.texts(ALI.id).length;
    await h.advance(2 * 24 * 3600_000); // دو روز
    expect(h.texts(ALI.id).length).toBe(before);
  });

  it("🚀 شروع خودکار در ساعت دقیق + خبر به مسئول", async () => {
    await h.say(ASGHAR, "احمق از فردا ساعت ۸ صبح یه تسک بساز: بیدارباش، تا ۳ روز دیگه");
    const t = h.tasks().at(-1)!;
    expect(t.auto_start).toBe(1);
    expect(t.status).toBe("not_started");
    expect(t.start_at).toBe(`${addDaysISO(TODAY, 1)}T08:00:00+03:30`);

    const before = h.texts(ASGHAR.id).length;
    await h.advance(atTehran(addDaysISO(TODAY, 1), 8, 5) - h.now());
    const task = h.task(t.id)!;
    expect(task.status).toBe("in_progress");
    expect(task.auto_start).toBe(0);
    expect(h.texts(ASGHAR.id).slice(before).some((x) => x.includes("وقتش رسید"))).toBe(true);
  });

  it("⏩ شبیه‌سازی ۴۸ ساعت با سرعت ۳x — همه با هم، بی‌خطا", async () => {
    await h.say(MOHAMMAD, "احمق یه تسک بساز: مرور شبانه، تا ۴ روز دیگه — هر روز ساعت ۲۲ یادم کن");
    await h.say(ALI, "احمق یه تسک بساز: چک سرور، تا ۴ روز دیگه، هر ۶ ساعت یادم کن");
    const m0 = h.texts(MOHAMMAD.id).length;
    const a0 = h.texts(ALI.id).length;

    // ۱۶ ساعت «واقعی» × سرعت ۳ = ۴۸ ساعت مجازی (تیک کرون هر ۱۰ دقیقه مجازی)
    const start = h.now();
    while (h.now() - start < 48 * 3600_000) {
      await h.advance(4 * 3600_000, 3);
    }
    await h.advance(20 * 60_000); // مرز آخرِ هر-۶-ساعت هم رد شود

    // daily@22:00 در ۴۸ ساعت → دقیقاً ۲ بار
    expect(h.texts(MOHAMMAD.id).slice(m0).filter((x) => x.includes("یادآوری روزانه")).length).toBe(2);
    // هر ۶ ساعت از ~۱۰:۰۰ → ۱۶:۰۰، ۲۲:۰۰، …، ۱۰:۰۰ → دقیقاً ۸ بار
    expect(h.texts(ALI.id).slice(a0).filter((x) => x.includes("هر ۶ ساعت")).length).toBe(8);
  });

  it("/card شمسی: کارتِ تسک، یادآوری و تاریخ‌های شمسی را درست نشان می‌دهد", async () => {
    await h.say(ALI, "احمق یه تسک بساز: تست کارت، تا فردا ساعت ۲۰ — هر روز ساعت ۹ صبح یادم کن");
    const t = h.tasks().at(-1)!;
    await h.say(ALI, `/task ${t.id}`);
    const card = h.lastText(ALI.id);
    expect(card).toContain("یادآوری:");
    expect(card).toContain("هر روز ساعت ۰۹:۰۰");
    expect(card).not.toContain("  "); // بدون فاصله‌ی دوبل
  });
});
