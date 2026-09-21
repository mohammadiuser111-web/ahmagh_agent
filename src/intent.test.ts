import { describe, expect, it } from "vitest";
import { detectExportRequest, detectListRequest } from "./intent";

describe("detectListRequest", () => {
  it("درخواست لیست ساده", () => {
    expect(detectListRequest("احمق تسک های منو لیست کن")).toBe("open");
    expect(detectListRequest("احمق تسک‌هام رو نشون بده")).toBe("open");
  });
  it("فیلتر تموم‌شده / همه", () => {
    expect(detectListRequest("احمق تسک های تموم شده منو نشون بده")).toBe("done");
    expect(detectListRequest("احمق همه تسک هامو بگو")).toBe("all");
  });
  it("پیام ساخت تسک → null (نه لیست!)", () => {
    expect(detectListRequest("احمق یه تسک بساز: لیست خرید، تا فردا")).toBeNull();
    expect(detectListRequest("احمق این تسک رو ایجاد کن: تماس با مشتری تا شنبه")).toBeNull();
  });
  it("بدون کلمه تسک → null", () => {
    expect(detectListRequest("احمق لیست کن")).toBeNull();
    expect(detectListRequest("سلام چطوری")).toBeNull();
  });
});

describe("detectExportRequest", () => {
  it("درخواست خروجی", () => {
    expect(detectExportRequest("احمق یه خروجی از تسک های من بده")).toBe(true);
    expect(detectExportRequest("احمق گزارشی از تسک هام بده")).toBe(true);
    expect(detectExportRequest("احمق یه pdf از تسک‌هام بگیر")).toBe(true);
  });
  it("ساخت تسکی که کلمه گزارش دارد → false", () => {
    expect(detectExportRequest("احمق یه تسک بساز: گزارش مالی، تا فردا")).toBe(false);
    expect(detectExportRequest("احمق یه خروجی از تسک بساز تا فردا")).toBe(false);
  });
});
