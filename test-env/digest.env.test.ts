/**
 * تست‌های گزارش روزانه (Daily Digest) — ۸ صبح و ۸ شب، به‌جز پنجشنبه و جمعه
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ALI, ASGHAR, Harness, MOHAMMAD, createScene } from "./harness";
import { digestWindow, isWeekendTehran, runDigest } from "../src/digest";
import { todayTehranISO } from "../src/dates";

let h: Harness;
beforeEach(async () => {
  h = await createScene();
});

describe("🌅🌙 گزارش روزانه (محیط ایزوله)", () => {
  it("پنجره‌ی زمانی: ۸:۰۰ و ۲۰:۰۰ تهران (دقیقه ۰ تا ۴) — بدون کرونِ اضافه", () => {
    // کرونِ اضافه نداریم (سقف ۵تاییِ پلن Free اکانت پر است)
    const wr = readFileSync("wrangler.jsonc", "utf-8");
    expect(wr).toContain('"crons": ["* * * * *"]');
    // ۰۴:۳۰ و ۰۴:۳۴ UTC = ۰۸:۰۰ و ۰۸:۰۴ تهران
    expect(digestWindow(new Date("2026-09-22T04:30:10Z"))).toBe("morning");
    expect(digestWindow(new Date("2026-09-22T04:34:59Z"))).toBe("morning");
    // ۱۶:۳۱ UTC = ۲۰:۰۱ تهران
    expect(digestWindow(new Date("2026-09-22T16:31:00Z"))).toBe("evening");
    // بیرونِ پنجره
    expect(digestWindow(new Date("2026-09-22T04:35:00Z"))).toBeNull(); // دقیقه‌ی ۵
    expect(digestWindow(new Date("2026-09-22T05:00:00Z"))).toBeNull(); // ساعت ۹ تهران
    expect(digestWindow(new Date("2026-09-22T12:00:00Z"))).toBeNull();
  });

  it("پنجشنبه و جمعه تعطیل است", () => {
    // ۲۰۲۶-۰۹-۲۴ پنجشنبه و ۲۰۲۶-۰۹-۲۵ جمعه (به وقت تهران)
    expect(isWeekendTehran(new Date("2026-09-24T10:00:00Z"))).toBe(true);
    expect(isWeekendTehran(new Date("2026-09-25T10:00:00Z"))).toBe(true);
    // ۲۰۲۶-۰۹-۲۲ دوشنبه → کاری
    expect(isWeekendTehran(new Date("2026-09-22T10:00:00Z"))).toBe(false);
    expect(isWeekendTehran(new Date("2026-09-23T10:00:00Z"))).toBe(false);
  });

  it("صبح: سلام + تاریخ شمسی + وضعیت + ددلاین امروز — فقط به کسی که تسک دارد", async () => {
    const today = todayTehranISO();
    // علی: یک تسک با ددلاینِ امروز + یکی برای فردا
    await h.say(ALI, `احمق یه تسک بساز: تماس با مشتری، تا امروز ساعت ۱۲`);
    await h.say(ALI, "احمق یه تسک بساز: گزارش فروش، تا فردا");
    const before = h.to(ALI.id).length;
    const beforeAsg = h.to(ASGHAR.id).length; // اصغر تسکی ندارد (فقط سازنده) → پیام نمی‌گیرد
    const beforeMmd = h.to(MOHAMMAD.id).length; // ممد هم بی‌تسک

    await runDigest(h.env as any, "morning", new Date(h.now()));

    const msgs = h.to(ALI.id).slice(before);
    expect(msgs.length).toBe(1);
    const text = msgs[0].text ?? "";
    expect(text).toContain("صبح بخیر");
    expect(text).toContain("تماس با مشتری"); // ددلاین امروز
    expect(text).toContain("تسک باز داری");
    expect(text).not.toContain("شب بخیر");
    // تاریخ شمسیِ امروز در پیام است (ماه جاری)
    expect(text).toMatch(/امروز .+ \d+ /);
    // بی‌تسک‌ها ساکت
    expect(h.to(ASGHAR.id).length).toBe(beforeAsg);
    expect(h.to(MOHAMMAD.id).length).toBe(beforeMmd);
    expect(today).toBeTruthy();
  });

  it("شب: انجام‌شده‌های امروز + باقی‌مانده — و آفرین", async () => {
    await h.say(ALI, "احمق یه تسک بساز: خرید نان، تا فردا");
    await h.say(ALI, "احمق یه تسک بساز: تمیزکاری، تا فردا");
    const t1 = h.tasks().at(-2)!;
    await h.callback(ALI, `st|${t1.id}|done`); // امروز تمامش کرد

    const before = h.to(ALI.id).length;
    await runDigest(h.env as any, "evening", new Date(h.now()));
    const text = h.to(ALI.id).slice(before)[0].text ?? "";
    expect(text).toContain("شب بخیر");
    expect(text).toContain("خرید نان");
    expect(text).toContain("آفرین");
    expect(text).toContain("۱ تسک بازی داری"); // تمیزکاری مانده
  });

  it("شبِ بی‌کار: بدون تسکِ تموم‌شده → صادقانه می‌گوید", async () => {
    await h.say(ALI, "احمق یه تسک بساز: کار mañana، تا فردا");
    const before = h.to(ALI.id).length;
    await runDigest(h.env as any, "evening", new Date(h.now()));
    const text = h.to(ALI.id).slice(before)[0].text ?? "";
    expect(text).toContain("امروز تسکی تموم نکردی");
  });

  it("آخر هفته: runDigest هیچ پیامی نمی‌فرستد", async () => {
    await h.say(ALI, "احمق یه تسک بساز: کار پنجشنبه، تا فردا");
    const before = h.to(ALI.id).length;
    // ۲۰۲۶-۰۹-۲۴ پنجشنبه به وقت تهران (۱۰:۰۰ UTC)
    await runDigest(h.env as any, "morning", new Date("2026-09-24T10:00:00Z"));
    await runDigest(h.env as any, "evening", new Date("2026-09-24T16:00:00Z"));
    expect(h.to(ALI.id).length).toBe(before);
  });

  it("dedup: دو بار اجرا در همان روز → فقط یک پیام؛ نوعِ شب جدا است", async () => {
    await h.say(ALI, "احمق یه تسک بساز: بدون تکرار، تا فردا");
    const before = h.to(ALI.id).length;
    await runDigest(h.env as any, "morning", new Date(h.now()));
    expect(h.to(ALI.id).length).toBe(before + 1);
    await runDigest(h.env as any, "morning", new Date(h.now() + 60_000)); // یک دقیقه بعد
    expect(h.to(ALI.id).length).toBe(before + 1); // دوباره نفرستاد
    await runDigest(h.env as any, "evening", new Date(h.now() + 12 * 3600_000));
    expect(h.to(ALI.id).length).toBe(before + 2); // شب جدا شمرده می‌شود
  });
});
