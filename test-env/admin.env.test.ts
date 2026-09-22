/**
 * 🧪 محیط ایزوله — سناریوهای ادمین:
 * ساخت برای کاربر دیگر، انتخابگر @ناشناس، کوئری زبانی تسک‌های کاربر، منوی ادمین
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

describe("👑 سناریوهای ادمین (محیط ایزوله)", () => {
  it("ادمین برای @یوزرِ شناخته‌شده تسک می‌سازد → مسئولِ درست + خبر به او با نام ادمین", async () => {
    await h.say(ASGHAR, "احمق برای @ali_user یه تسک بساز: جلسه با تیم، تا فردا ساعت ۲۰");
    const t = h.tasks().at(-1)!;
    expect(t.assignee_id).toBe(ALI.id);
    expect(t.creator_id).toBe(ASGHAR.id);
    expect(t.due_at).toBeTruthy();

    // خبر به علی (مسئول) با نام ادمین
    const aliGot = h.texts(ALI.id).join("\n");
    expect(aliGot).toContain("تسک");
    expect(aliGot).toContain("اصغر");
    // کارت هم برای خود ادمین
    expect(h.texts(ASGHAR.id).some((x) => x.includes("جلسه با تیم"))).toBe(true);
  });

  it("ادمین برای @ناشناس → کارت + انتخابگر کاربر؛ انتخاب → واگذاری و خبر", async () => {
    await h.say(ASGHAR, "احمق برای @nobody2000 یه تسک بساز: تست پیکر, تا فردا");
    const t = h.tasks().at(-1)!;
    expect(t.assignee_id).toBe(ASGHAR.id); // فعلاً خودش

    // پیام کارتِ ادمین باید کیبورد انتخاب کاربر داشته باشد (asg|...)
    const withPicker = h.to(ASGHAR.id).filter(
      (m) => m.kind === "message" && JSON.stringify(m.keyboard ?? {}).includes(`asg|${t.id}|`)
    );
    expect(withPicker.length).toBeGreaterThan(0);

    // انتخاب علی از لیست
    await h.callback(ASGHAR, `asg|${t.id}|${ALI.id}`);
    expect(h.task(t.id)!.assignee_id).toBe(ALI.id);
    // علی خبر می‌شود (ادمین ساخت → 👑)
    expect(h.texts(ALI.id).some((x) => x.includes("تست پیکر"))).toBe(true);
    expect(h.texts(ALI.id).some((x) => x.includes("اصغر"))).toBe(true);
  });

  it("کوئری زبانی ادمین: «تسک‌های علی چیا هستن؟» + نزدیک‌ترین ددلاین", async () => {
    // علی دو تسک دارد: نزدیک و دور
    await h.say(ALI, "احمق یه تسک بساز: نزدیک، تا فردا");
    await h.say(ALI, "احمق یه تسک بساز: دور, تا ۵ روز دیگه");
    // یک تسک هم تموم‌شده
    await h.say(ALI, "احمق یه تسک بساز: تمام‌شده، تا امروز");
    const done = h.tasks().find((x) => x.title.includes("تمام"))!;
    await h.callback(ALI, `st|${done.id}|done`);

    await h.say(ASGHAR, "احمق تسک‌های علی چیا هستن؟");
    const ans = h.lastText(ASGHAR.id);
    expect(ans).toContain("علی");
    expect(ans).toContain("نزدیک");
    expect(ans).toContain("نزدیک‌ترین ددلاین");
    expect(ans).toContain("تمام کرده");
  });

  it("کاربر عادی نمی‌تواند تسک‌های بقیه را ببیند", async () => {
    await h.say(MOHAMMAD, "احمق یه تسک بساز: کار ممد، تا فردا");
    await h.say(ALI, "احمق تسک‌های ممد چیا هستن؟");
    expect(h.lastText(ALI.id)).toContain("فقط ادمین");
  });

  it("کاربر عادی نمی‌تواند برای دیگری تسک بسازد", async () => {
    await h.say(ALI, "احمق برای @mmd_user یه تسک بساز: تست غیرمجاز، تا فردا");
    const t = h.tasks().at(-1)!;
    expect(t.assignee_id).toBe(ALI.id); // خودش
    expect(h.texts(ALI.id).some((x) => x.includes("فقط ادمین"))).toBe(true);
  });

  it("منوی ادمین: دکمه‌های ادمین دارد؛ 👥 کاربرها → لیست → تسک‌های علی", async () => {
    await h.say(ASGHAR, "/menu");
    const menu = h.to(ASGHAR.id).filter((m) => m.kind === "message").at(-1)!;
    const kb = JSON.stringify(menu.keyboard ?? {});
    expect(kb).toContain("👥 کاربرها");
    expect(kb).toContain("🌐 تسک‌های همه");
    expect(kb).toContain("➕ تسک جدید");

    // علی تسکی دارد که ادمین ببیند
    await h.say(ALI, "احمق یه تسک بساز: تسک علی برای منو، تا فردا");

    await h.say(ASGHAR, "👥 کاربرها");
    const listMsg = h.to(ASGHAR.id).filter((m) => m.kind === "message").at(-1)!;
    expect(JSON.stringify(listMsg.keyboard ?? {})).toContain(`usr|${ALI.id}`);
    expect(JSON.stringify(listMsg.keyboard ?? {})).toContain("علی");

    await h.callback(ASGHAR, `usr|${ALI.id}`);
    expect(h.lastText(ASGHAR.id)).toContain("تسک علی برای منو");
  });

  it("منوی کاربر عادی: دکمه‌های ادمین ندارد؛ دسترسیش هم قطع", async () => {
    await h.say(ALI, "/menu");
    const menu = h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!;
    const kb = JSON.stringify(menu.keyboard ?? {});
    expect(kb).not.toContain("کاربرها");
    expect(kb).not.toContain("تسک‌های همه");

    await h.say(ALI, "👥 کاربرها");
    expect(h.lastText(ALI.id)).toContain("ادمین");
  });

  it("🌐 تسک‌های همه (ادمین): گروه‌بندی با نام کاربرها", async () => {
    await h.say(ALI, "احمق یه تسک بساز: کار علی، تا فردا");
    await h.say(MOHAMMAD, "احمق یه تسک بساز: کار ممد، تا ۲ روز دیگه");
    await h.say(ASGHAR, "🌐 تسک‌های همه");
    const ans = h.lastText(ASGHAR.id);
    expect(ans).toContain("علی");
    expect(ans).toContain("ممد");
    expect(ans).toContain("کار علی");
    expect(ans).toContain("کار ممد");
  });

  it("ادمین با اسم (بدون @) هم می‌سازد: «برای علی»", async () => {
    await h.say(ASGHAR, "احمق برای علی یه تسک بساز: گزارش مالی، تا ۳ روز دیگه");
    const t = h.tasks().at(-1)!;
    expect(t.assignee_id).toBe(ALI.id);
    expect(h.texts(ALI.id).some((x) => x.includes("گزارش مالی"))).toBe(true);
  });
});
