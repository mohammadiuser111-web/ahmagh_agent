/**
 * تست‌های گزارش مصرف و هزینه — /usage، منو، مسیریابی زبانی، تجمیع و رندر
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ALI, ASGHAR, Harness, createScene } from "./harness";
import {
  FREE_LIMITS,
  renderUsageReport,
  sumRange,
  type DayRow,
} from "../src/usage";

const day = (date: string, p: Partial<DayRow>): DayRow => ({
  date,
  neurons: 0,
  inTokens: 0,
  outTokens: 0,
  requests: 0,
  errors: 0,
  cpuTimeUs: 0,
  rowsRead: 0,
  rowsWritten: 0,
  ...p,
});

let h: Harness;
beforeEach(async () => {
  h = await createScene();
});

describe("📈 مصرف و هزینه (محیط ایزوله)", () => {
  it("دکمه‌ی منو فقط برای ادمین + /usage زبانی «هزینه‌ها چطوره؟»", async () => {
    // کیبورد ادمین دکمه را دارد
    const kbA = JSON.stringify(h.to(ASGHAR.id).at(-1)?.keyboard ?? h.lastText(ASGHAR.id));
    // منوی اصغر بعد از ثبت‌نام با mainKeyboard می‌آید — از مسیر /menu می‌گیریم:
    await h.say(ASGHAR, "/menu");
    const menuMsg = h.to(ASGHAR.id).filter((m) => m.kind === "message").at(-1)!;
    expect(JSON.stringify(menuMsg.keyboard ?? {})).toContain("📈 مصرف و هزینه");
    await h.say(ALI, "/menu");
    const menuAli = h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!;
    expect(JSON.stringify(menuAli.keyboard ?? {})).not.toContain("📈 مصرف و هزینه");

    // ادمین: گزارش می‌آید (بدون توکن → fallback محلی)
    await h.say(ASGHAR, "هزینه‌ها چطوره؟");
    const t1 = h.lastText(ASGHAR.id);
    expect(t1).toContain("مصرف و هزینه");
    expect(t1).toContain("$۰");
    expect(t1).toContain("در دسترس نیست");
    expect(t1).toContain("کاربر");

    // کاربر عادی: رد
    await h.say(ALI, "/usage");
    expect(h.lastText(ALI.id)).toContain("فقط برای ادمین");
    expect(kbA).toBeTruthy();
  });

  it("«گزارش هزینه بده» → مصرف (نه فایل خروجی)؛ «بساز: هزینه‌کردن» → تسک", async () => {
    await h.say(ASGHAR, "گزارش هزینه بده");
    expect(h.lastText(ASGHAR.id)).toContain("مصرف و هزینه");
    // و خروجی همچنان فایل است (ادمین: انتخابگر دامنه با exp|)
    await h.say(ASGHAR, "خروجی تسک‌هامو بده");
    const picker = h.to(ASGHAR.id).filter((m) => m.kind === "message" && JSON.stringify(m.keyboard ?? {}).includes("exp|"));
    expect(picker.length).toBeGreaterThan(0);
    // کلمه‌ی «هزینه» داخل تسک → مثبت کاذب نیست
    await h.say(ALI, "یه تسک بساز: مرجوعی هزینه‌کردن، تا فردا");
    expect(h.tasks().at(-1)!.title).toContain("هزینه");
  });

  it("دکمه‌ی منو «📈 مصرف و هزینه» → گزارش", async () => {
    await h.say(ASGHAR, "/menu");
    await h.say(ASGHAR, "📈 مصرف و هزینه");
    const last = h.lastText(ASGHAR.id);
    expect(last).toContain("مصرف و هزینه");
    expect(last).toContain("پلن رایگان");
  });
});

describe("ترکیب و رندر گزارش مصرف", () => {
  const today = new Date().toISOString().slice(0, 10);
  const d6 = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const d10 = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  const days = [
    day(today, { neurons: 900, requests: 600, rowsRead: 5000, inTokens: 9000, outTokens: 700 }),
    day(d6, { neurons: 1500, requests: 800, rowsWritten: 40 }),
    day(d10, { neurons: 2000, requests: 400 }),
  ];

  it("sumRange: امروز فقط امروز؛ ۷ روز شامل امروز و d6؛ کل همه", () => {
    const t = sumRange(days, today);
    expect(t.neurons).toBe(900);
    const w = sumRange(days, new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10));
    expect(w.neurons).toBe(2400); // 900 + 1500
    expect(w.requests).toBe(1400);
    const all = sumRange(days, "0000-00-00");
    expect(all.neurons).toBe(4400);
    expect(all.rowsWritten).toBe(40);
  });

  it("رندر: همه‌ی بخش‌ها + درصد سهم رایگان + فضای دیتابیس", () => {
    const text = renderUsageReport(
      { days, storageBytes: 68 * 1024, firstDate: d10 },
      { users: 3, tasks: 12, openTasks: 5, doneTasks: 7 }
    );
    expect(text).toContain("هزینه‌ی واقعی تا الان: <b>$۰</b>");
    expect(text).toContain("<b>امروز</b>");
    expect(text).toContain("۹۰۰ نورون");
    expect(text).toContain("۶۰۰ درخواست");
    expect(text).toContain("۵٬۰۰۰ خواندن");
    expect(text).toContain("۷ روز اخیر");
    expect(text).toContain("از شروع");
    expect(text).toContain("پرمصرف‌ترین روز: ۲٬۰۰۰ نورون");
    expect(text).toContain("فضای دیتابیس");
    expect(text).toContain("۶۸ کیلوبایت از ۵ گیگابایت");
    expect(text).toContain("باقی‌مانده");
    expect(text).toContain("۳ کاربر · ۱۲ تسک");
    // درصد امروز نسبت به سهم رایگان
    const pct = (900 / FREE_LIMITS.neuronsPerDay) * 100;
    expect(text).toContain("نورون ۹٪");
    expect(pct).toBeGreaterThan(0);
  });

  it("رندر بدون آنالیتیکس → fallback محلی", () => {
    const text = renderUsageReport(null, { users: 2, tasks: 4, openTasks: 1, doneTasks: 3 });
    expect(text).toContain("در دسترس نیست");
    expect(text).toContain("۲ کاربر · ۴ تسک");
    expect(text).not.toContain("۷ روز اخیر");
  });
});
