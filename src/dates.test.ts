import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  endOfDayTehran,
  enDigits,
  faDigits,
  fmtDate,
  fmtTimeTehran,
  humanizeHoursLeft,
  jalaliToGregorian,
  parseFaTimeOfDay,
  parseRelativeFaDate,
  parseRelativeFaDateTime,
  startOfDayTehran,
  toJalali,
} from "./dates";

describe("toJalali", () => {
  it("نوروز ۱۴۰۵", () => {
    expect(toJalali(2026, 3, 21)).toEqual([1405, 1, 1]);
  });

  it("۲۰۲۶-۰۹-۲۱ = ۳۰ شهریور ۱۴۰۵", () => {
    expect(toJalali(2026, 9, 21)).toEqual([1405, 6, 30]);
  });

  it("۳۰ اسفند سال کبیسه (۱۴۰۳)", () => {
    expect(toJalali(2025, 3, 20)).toEqual([1403, 12, 30]);
  });
});

describe("fmtDate", () => {
  it("نمایش جلالی", () => {
    expect(fmtDate("2026-09-21")).toBe("۳۰ شهریور ۱۴۰۵");
  });

  it("خالی → خط تیره", () => {
    expect(fmtDate(null)).toBe("—");
  });
});

describe("ارقام فارسی/انگلیسی", () => {
  it("fa ↔ en", () => {
    expect(faDigits(12)).toBe("۱۲");
    expect(enDigits("۱۲")).toBe("12");
    expect(enDigits("۴۲")).toBe("42");
  });
});

describe("مرزهای روز به وقت تهران", () => {
  it("endOfDayTehran / startOfDayTehran", () => {
    expect(endOfDayTehran("2026-09-21")).toBe(Date.parse("2026-09-21T23:59:59+03:30"));
    expect(startOfDayTehran("2026-09-21")).toBe(Date.parse("2026-09-21T00:00:00+03:30"));
  });
});

describe("addDaysISO / humanizeHoursLeft", () => {
  it("فردا و بعدی", () => {
    expect(addDaysISO("2026-09-21", 1)).toBe("2026-09-22");
    expect(addDaysISO("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("انسان‌پسند کردن ساعت", () => {
    expect(humanizeHoursLeft(0.5)).toBe("کمتر از یک ساعت");
    expect(humanizeHoursLeft(5)).toBe("۵ ساعت");
    expect(humanizeHoursLeft(50)).toBe("۲ روز");
  });
});

describe("jalaliToGregorian", () => {
  it("رفت و برگشت با toJalali", () => {
    expect(jalaliToGregorian(1405, 6, 30)).toEqual([2026, 9, 21]);
    expect(jalaliToGregorian(1405, 1, 1)).toEqual([2026, 3, 21]);
    expect(jalaliToGregorian(1405, 7, 5)).toEqual([2026, 9, 27]);
    expect(jalaliToGregorian(1403, 12, 30)).toEqual([2025, 3, 20]); // سال کبیسه
  });
});

describe("parseRelativeFaDate", () => {
  // ۲۰۲۶-۰۹-۲۱ = ۳۰ شهریور ۱۴۰۵ = دوشنبه
  const today = "2026-09-21";

  it("فردا / پس‌فردا / امشب", () => {
    expect(parseRelativeFaDate("تا فردا", today)).toBe("2026-09-22");
    expect(parseRelativeFaDate("پس‌فردا", today)).toBe("2026-09-23");
    expect(parseRelativeFaDate("امشب", today)).toBe(today);
  });

  it("روزهای هفته", () => {
    expect(parseRelativeFaDate("جمعه", today)).toBe("2026-09-25");
    expect(parseRelativeFaDate("تا پنجشنبه", today)).toBe("2026-09-24");
    expect(parseRelativeFaDate("شنبه", today)).toBe("2026-09-26");
  });

  it("هفته آینده / آخر هفته", () => {
    expect(parseRelativeFaDate("هفته آینده", today)).toBe("2026-09-28");
    expect(parseRelativeFaDate("آخر هفته", today)).toBe("2026-09-25");
  });

  it("تاریخ شمسی (روز + ماه)", () => {
    expect(parseRelativeFaDate("۵ مهر", today)).toBe("2026-09-27");
    expect(parseRelativeFaDate("تا ۱۵ مهر", today)).toBe("2026-10-07");
  });

  it("N روز دیگه", () => {
    expect(parseRelativeFaDate("۳ روز دیگه", today)).toBe("2026-09-24");
  });

  it("بدون تاریخ → خالی", () => {
    expect(parseRelativeFaDate("خرید نان از نانوایی", today)).toBe("");
  });
});

describe("parseFaTimeOfDay", () => {
  const h = (n: number) => n * 60;

  it("فرمت HH:MM", () => {
    expect(parseFaTimeOfDay("تا فردا ساعت 10:30")).toBe(h(10) + 30);
    expect(parseFaTimeOfDay("۱۰:۳۰ صبح")).toBe(h(10) + 30);
  });

  it("HH:MM + بخش روز", () => {
    expect(parseFaTimeOfDay("ساعت 10:30 عصر")).toBe(h(22) + 30);
    expect(parseFaTimeOfDay("10:45 بعد از ظهر")).toBe(h(22) + 45);
  });

  it("«ساعت H» ساده", () => {
    expect(parseFaTimeOfDay("ساعت 8")).toBe(h(8));
    expect(parseFaTimeOfDay("ساعت ۸ صبح")).toBe(h(8));
  });

  it("«ساعت H» + بخش روز", () => {
    expect(parseFaTimeOfDay("ساعت 8 شب")).toBe(h(20));
    expect(parseFaTimeOfDay("ساعت 5 عصر")).toBe(h(17));
    expect(parseFaTimeOfDay("ساعت 3 بعد از ظهر")).toBe(h(15));
  });

  it("«H ظهر»", () => {
    expect(parseFaTimeOfDay("12 ظهر")).toBe(h(12));
    expect(parseFaTimeOfDay("۱۲ ظهر")).toBe(h(12));
    expect(parseFaTimeOfDay("2 ظهر")).toBe(h(14)); // «۲ ظهر» = بعدازظهر
  });

  it("«H عصر / H شب»", () => {
    expect(parseFaTimeOfDay("5 عصر")).toBe(h(17));
    expect(parseFaTimeOfDay("10 شب")).toBe(h(22));
    expect(parseFaTimeOfDay("11 شب")).toBe(h(23));
    expect(parseFaTimeOfDay("2 شب")).toBe(h(2)); // «۲ شب» = بامداد؛ تغییر نکند
  });

  it("نیمه‌شب", () => {
    expect(parseFaTimeOfDay("تا نیمه‌شب")).toBe(0);
  });

  it("بدون ساعت → null (نه صفر!)", () => {
    expect(parseFaTimeOfDay("۳ روز دیگه")).toBeNull();
    expect(parseFaTimeOfDay("۱۵ مهر")).toBeNull();
    expect(parseFaTimeOfDay("خرید نان")).toBeNull();
  });

  it("اعداد فارسی", () => {
    expect(parseFaTimeOfDay("ساعت ۱۰:۳۰ عصر")).toBe(h(22) + 30);
  });
});

describe("parseRelativeFaDateTime", () => {
  const today = "2026-09-21"; // ۳۰ شهریور ۱۴۰۵ دوشنبه

  it("تاریخ + ساعت", () => {
    expect(parseRelativeFaDateTime("تا فردا ساعت 10:30 عصر", today)).toEqual({
      date: "2026-09-22",
      time: "22:30",
    });
  });

  it("فقط تاریخ", () => {
    expect(parseRelativeFaDateTime("تا پنجشنبه", today)).toEqual({ date: "2026-09-24", time: null });
  });

  it("فقط ساعت → تاریخ خالی", () => {
    expect(parseRelativeFaDateTime("ساعت 5 عصر", today)).toEqual({ date: "", time: "17:00" });
  });

  it("هیچ‌کدام", () => {
    expect(parseRelativeFaDateTime("خرید نان", today)).toEqual({ date: "", time: null });
  });
});

describe("fmtTimeTehran", () => {
  it("ISO با offset تهران", () => {
    expect(fmtTimeTehran("2026-09-22T22:30:00+03:30")).toBe("۲۲:۳۰");
  });
  it("ISO بدون offset (UTC) → تبدیل به تهران", () => {
    expect(fmtTimeTehran("2026-09-22T18:00:00.000Z")).toBe("۲۱:۳۰");
  });
  it("null → خالی", () => {
    expect(fmtTimeTehran(null)).toBe("");
  });
});
