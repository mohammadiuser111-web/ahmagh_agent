/**
 * 🧪 ماراتن: ۷ روز مجازی با سرعت ۷x — همه‌ی انواع یادآوری همزمان + شروع خودکار
 * هدف: هیچ کرشی نیست، تعداد پیام‌ها دقیقاً طبق الگوهاست.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ALI, ASGHAR, Harness, MOHAMMAD, createScene } from "./harness";

let h: Harness;

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});
beforeEach(async () => {
  h = await createScene();
});
afterAll(() => {
  vi.restoreAllMocks();
});

describe("🏁 ماراتن ۷ روزه (محیط ایزوله)", () => {
  it("همه‌ی الگوها با هم، ۷ روز، بی‌خطا و با شمار دقیق", async () => {
    // 🧑 کاربرها تسک می‌سازند
    await h.say(ALI, "احمق یه تسک بساز: مرور شبانه، تا ۱۰ روز دیگه — هر روز ساعت ۲۲ یادم کن");
    await h.say(ALI, "احمق یه تسک بساز: پیش‌فرض، تا ۲ روز دیگه"); // بدون یادآوریِ خواسته‌شده → ساکت
    await h.say(MOHAMMAD, "احمق یه تسک بساز: چک سرور، تا ۱۰ روز دیگه، هر ۵ ساعت یادم کن");
    await h.say(MOHAMMAD, "احمق یه تسک بساز: ساکت، تا امروز، یادآوری نکن");
    await h.say(ALI, "احمق یه تسک بساز: یک‌بارگی، تا هفته آینده — فردا ساعت ۹ صبح یادم بنداز");
    // 👑 ادمین برای علی + ددلاین‌محور
    await h.say(ASGHAR, "احمق برای @ali_user یه تسک بساز: گزارش ادمینی، تا ۳ روز دیگه ساعت ۱۸ — ۲ ساعت قبلش یادش باشه");
    // 🚀 شروع خودکار
    await h.say(MOHAMMAD, "احمق از ۲ روز دیگه یه تسک بساز: پروژه جدید، تا ۹ روز دیگه");

    const aliDaily = h.texts(ALI.id).length;
    const aliDefault = h.texts(ALI.id).length; // همان مبنای شمارش
    const mmdEvery = h.texts(MOHAMMAD.id).length;

    // ⏩ ۷ روز مجازی (هر گام: ۳ ساعت واقعی × سرعت ۷ = ۲۱ ساعت مجازی)
    const start = h.now();
    while (h.now() - start < 7 * 24 * 3600_000) {
      await h.advance(3 * 3600_000, 7);
    }

    const aliTexts = h.texts(ALI.id).slice(aliDaily);
    const mmdTexts = h.texts(MOHAMMAD.id).slice(mmdEvery);

    // daily@22:00 → هفت شب (شب ۱ تا شب ۷)
    expect(aliTexts.filter((x) => x.includes("یادآوری روزانه")).length).toBe(7);
    // هر ۵ ساعت در ۱۶۸ ساعت → ۳۳ بار (۵، ۱۰، …، ۱۶۵)
    expect(mmdTexts.filter((x) => x.includes("هر ۵ ساعت")).length).toBe(33);
    // ددلاین‌محور: فقط یک‌بار
    expect(aliTexts.filter((x) => x.includes("ددلاین نزدیکه")).length).toBe(1);
    // یک‌باره: فقط یک‌بار
    expect(aliTexts.filter((x) => x.includes("یادآوری برای")).length).toBe(1);
    // خاموش: تسکِ «ساکت» هرگز یادآوری نمی‌گیرد
    expect(mmdTexts.some((x) => x.includes("ساکت"))).toBe(false);
    // پیش‌فرض (بدون یادآوریِ خواسته‌شده): هرگز اذیت نمی‌کند — حتی بعد از سررسید
    const aliAll = h.texts(ALI.id).slice(aliDefault);
    expect(aliAll.filter((x) => x.includes("پیش‌فرض")).length).toBe(0);
    // 🚀 شروع خودکار: یک «وقتش رسید»
    expect(mmdTexts.filter((x) => x.includes("وقتش رسید"))).toHaveLength(1);

    // هیچ تسکی گم نشده
    expect(h.tasks().length).toBe(7);
  });
});
