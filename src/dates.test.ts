import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  endOfDayTehran,
  enDigits,
  faDigits,
  fmtDate,
  humanizeHoursLeft,
  jalaliToGregorian,
  parseRelativeFaDate,
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
