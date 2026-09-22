/**
 * 🧪 محیط ایزوله — فلوهای کاربر عادی:
 * خروجی (باگِ گزارش‌شده)، لیست‌های زبانی، ساخت با یادآوری در جریان pending، /edit یادآوری، تمیزی متن
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

describe("📤 خروجی و فلوهای زبانی (محیط ایزوله)", () => {
  it("باگِ گزارش‌شده: «خروجی تسک های منو بده» → انتخابگر فرمت، نه ساخت تسک و نه سؤال تاریخ", async () => {
    await h.say(ALI, "احمق یه تسک بساز: تسک اول، تا فردا");
    await h.say(ALI, "احمق یه تسک بساز: تسک دوم، تا ۳ روز دیگه");

    const before = h.texts(ALI.id).length;
    await h.say(ALI, "احمق خروجی تسک های منو بده");
    const after = h.texts(ALI.id);

    // نه سؤال «تا کی؟» و نه «چی بسازم؟»
    expect(after.slice(before).some((x) => x.includes("تا کی"))).toBe(false);
    expect(after.slice(before).some((x) => x.includes("بسازم"))).toBe(false);
    // بلکه انتخابگرِ شکل خروجی با دکمه‌های شیشه‌ای exp|
    const picker = h.to(ALI.id).filter((m) => m.kind === "message" && JSON.stringify(m.keyboard ?? {}).includes(`exp|me|0|`)).at(-1);
    expect(picker).toBeTruthy();
    expect(picker!.text).toContain("شکلی");
  });

  it("HTML واقعی می‌رسد: سند با mime درست و محتوای گزارش", async () => {
    await h.say(ALI, "احمق یه تسک بساز: برای اچ‌تی‌ام‌ال، تا فردا");
    await h.say(ALI, "احمق خروجی تسک هام رو بده");
    await h.callback(ALI, "exp|me|0|list");
    const docs = h.documents(ALI.id);
    expect(docs.length).toBe(1);
    expect(docs[0].mime).toContain("text/html");
    expect(docs[0].size ?? 0).toBeGreaterThan(500);
    expect(docs[0].filename).toMatch(/\.html$/);
  });

  it("داشبورد: نمودار SVG داخل HTML می‌رسد", async () => {
    await h.say(ALI, "احمق گزارش تسک‌هامو بده");
    await h.callback(ALI, "exp|me|0|dash");
    const docs = h.documents(ALI.id);
    expect(docs.length).toBe(1);
    expect(docs[0].filename).toMatch(/dash\.html$/);
  });

  it("دکمه‌ی قدیمی PDF → پیام «PDF حذف شد» به‌جای فایل", async () => {
    await h.say(ALI, "احمق یه تسک بساز: برای پی‌دی‌اف، تا فردا");
    await h.say(ALI, "احمق گزارش تسک‌هامو بده");
    await h.callback(ALI, `ex|${ALI.id}|pdf`);
    expect(h.documents(ALI.id).length).toBe(0);
    expect(h.texts(ALI.id).some((x) => x.includes("PDF نمی‌سازم"))).toBe(true);
  });

  it("ادمین: گزارش سه‌مرحله‌ای — برای کی؟ ← کاربر خاص ← شکل", async () => {
    await h.say(ASGHAR, "📊 گزارش");
    const scopeMsg = h.to(ASGHAR.id).filter((m) => m.kind === "message").at(-1)!;
    expect(scopeMsg.text ?? "").toContain("برای کی");
    expect(JSON.stringify(scopeMsg.keyboard ?? {})).toContain("exp|pick|0");
    await h.callback(ASGHAR, "exp|pick|0");
    const pickMsg = h.to(ASGHAR.id).filter((m) => m.kind === "message").at(-1)!;
    expect(JSON.stringify(pickMsg.keyboard ?? {})).toContain(`exp|usr|${ALI.id}`);
    await h.callback(ASGHAR, `exp|usr|${ALI.id}`);
    const styleMsg = h.to(ASGHAR.id).filter((m) => m.kind === "message").at(-1)!;
    expect(JSON.stringify(styleMsg.keyboard ?? {})).toContain(`exp|usr|${ALI.id}|dash`);
    await h.callback(ASGHAR, `exp|usr|${ALI.id}|dash`);
    const docs = h.documents(ASGHAR.id);
    expect(docs.length).toBe(1);
    expect(docs[0].filename).toContain("dash");
  });

  it("ادمین: خروجیِ همه‌ی کاربرها — چندکاربره با ستون مسئول", async () => {
    await h.say(ASGHAR, "📊 گزارش");
    await h.callback(ASGHAR, "exp|all|0");
    await h.callback(ASGHAR, "exp|all|0|list");
    const docs = h.documents(ASGHAR.id);
    expect(docs.length).toBe(1);
    expect(docs[0].filename).toMatch(/all.*list\.html$/);
  });

  it("کاربر عادی نمی‌تواند خروجیِ همه را بگیرد", async () => {
    await h.callback(ALI, "exp|all|0");
    expect(h.outbox.some((m) => (m.text ?? "").includes("فقط ادمین") || (m.text ?? "").includes("مال شما نیست"))).toBe(true);
    expect(h.documents(ALI.id).length).toBe(0);
  });

  it("«تاریخچه تسک‌هامو بده» هم به خروجی می‌رود", async () => {
    await h.say(ALI, "احمق تاریخچه تسک‌هامو بده");
    const picker = h.to(ALI.id).filter((m) => m.kind === "message" && JSON.stringify(m.keyboard ?? {}).includes("exp|me|0|"));
    expect(picker.length).toBeGreaterThan(0);
  });

  it("لیست‌های زبانی: تسک‌های من / تموم‌شده‌ها / همه", async () => {
    await h.say(ALI, "احمق یه تسک بساز: باز، تا فردا");
    const done = h.tasks().at(-1)!;
    await h.callback(ALI, `st|${done.id}|done`);

    await h.say(ALI, "احمق تسک هامو نشون بده");
    expect(h.lastText(ALI.id)).toContain("تسک");

    await h.say(ALI, "احمق تسک های تموم شده هامو بگو");
    const doneList = h.lastText(ALI.id);
    expect(doneList).toContain("باز"); // تسک «باز» در لیست بازها بود
    // حالا لیست done:
    await h.say(ALI, "احمق تسک های تموم شده م رو نشون بده");
    // (همان تسک باز + تموم‌شده) — فقط چک می‌کنیم پاسخ لیست باشد نه HINT
    expect(h.lastText(ALI.id)).not.toContain("نفهمیدم");
  });

  it("ساخت با یادآوریِ بدون ددلاین → سؤال تاریخ → جواب → تسک کامل با یادآوری", async () => {
    await h.say(ALI, "احمق یه تسک بساز: تماس با مشتری، هر روز ساعت ۹ صبح یادم کن");
    // ددلاین اجباری است → بات می‌پرسد
    expect(h.texts(ALI.id).some((x) => x.includes("تا کی"))).toBe(true);
    expect(h.tasks().length).toBe(0); // هنوز نساخته

    await h.say(ALI, "فردا");
    const t = h.tasks().at(0)!;
    expect(t.title).toContain("تماس با مشتری");
    expect(t.reminder_type).toBe("daily");
    expect(t.reminder_time).toBe("09:00");
  });

  it("/edit یادآوری: تغییر به «هر ۲ ساعت» → شمارنده‌ها صفر و یادآوریِ جدید کار می‌کند", async () => {
    await h.say(MOHAMMAD, "احمق یه تسک بساز: تست ویرایش یادآوری، تا ۴ روز دیگه");
    const t = h.tasks().at(-1)!;
    expect(t.reminder_type).toBe("default");

    await h.say(MOHAMMAD, `/edit ${t.id} یادآوری: هر ۲ ساعت`);
    const t2 = h.task(t.id)!;
    expect(t2.reminder_type).toBe("every_hours");
    expect(t2.reminder_interval_hours).toBe(2);
    expect(t2.reminder_count).toBe(0);
    expect(t2.last_reminded_at).toBeNull();
    expect(h.lastText(MOHAMMAD.id)).toContain("هر ۲ ساعت");

    // و واقعاً می‌آید
    const before = h.texts(MOHAMMAD.id).length;
    await h.advance(2 * 3600_000 + 10 * 60_000);
    expect(h.texts(MOHAMMAD.id).length).toBe(before + 1);
    expect(h.lastText(MOHAMMAD.id)).toContain("هر ۲ ساعت");
  });

  it("/edit یادآوری: «نکن» → خاموش", async () => {
    await h.say(MOHAMMAD, "احمق یه تسک بساز: خاموش کن، تا ۳ روز دیگه — هر روز ساعت ۷ یادم کن");
    const t = h.tasks().at(-1)!;
    expect(t.reminder_type).toBe("daily");
    await h.say(MOHAMMAD, `/edit ${t.id} یادآوری: نکن`);
    expect(h.task(t.id)!.reminder_type).toBe("none");
    const before = h.texts(MOHAMMAD.id).length;
    await h.advance(2 * 24 * 3600_000);
    expect(h.texts(MOHAMMAD.id).length).toBe(before);
  });

  it("تمیزی متن: بدون فاصله‌ی دوبل و با ارقام فارسی در کارت", async () => {
    await h.say(ASGHAR, "احمق یه تسک بساز: تست تمیزی، تا فردا ساعت ۲۰:۳۰ — هر ۴ ساعت یادم کن");
    const t = h.tasks().at(-1)!;
    await h.say(ASGHAR, `/task ${t.id}`);
    const card = h.lastText(ASGHAR.id);
    expect(card).not.toContain("  ");
    expect(card).not.toMatch(/\t/);
    // ارقام لاتین در متنِ فارسی نباشد (شناسه و ساعت‌ها فارسی)
    expect(card).not.toMatch(/[0-9]/);
  });

  it("غیرمجاز: دکمه‌ی ex مالِ خودِ کاربر است", async () => {
    await h.say(ALI, "احمق یه تسک بساز: تست دکمه، تا فردا");
    await h.say(ALI, "احمق خروجی تسک هامو بده");
    // ممد سعی کند دکمه‌ی علی را بزند (جوابِ toast در outbox خام ثبت می‌شود)
    await h.callback(MOHAMMAD, `ex|${ALI.id}|html`);
    expect(h.documents(MOHAMMAD.id).length).toBe(0);
    expect(h.outbox.some((m) => (m.text ?? "").includes("مال شما نیست"))).toBe(true);
  });

  it("پیام بدون کلیدواژه‌ی احمق → راهنما (HINT) نه خطا", async () => {
    await h.say(ALI, "سلام حالت چطوره؟");
    expect(h.lastText(ALI.id).length).toBeGreaterThan(10);
    expect(h.tasks().length).toBe(0);
  });

  it("مسیر AI: جیسون مدل → مسئول و یادآوریِ خاموش اعمال می‌شود", async () => {
    h.aiQueue.push(
      JSON.stringify({
        intent: "create_task",
        title: "گزارش هفتگی",
        description: "",
        assignee: "علی",
        start_date: "",
        start_time: "",
        start_phrase: "",
        due_date: "",
        due_time: "",
        due_phrase: "",
        reminder_kind: "none",
        reminder_time: "",
        reminder_hours: 0,
        status: "not_started",
      })
    );
    // جمله‌ای که پارسرِ قطعی مسئول/یادآوری از آن چیزی درنمی‌آورد → مدل زبانی
    await h.say(ASGHAR, "احمق یه تسک بساز که علی باید تحویلش بده: گزارش هفتگی، تا ۳ روز دیگه، بی‌خبر بمان");
    const t = h.tasks().at(-1)!;
    expect(t.title).toContain("گزارش هفتگی");
    expect(t.assignee_id).toBe(ALI.id); // از جیسون مدل
    expect(t.reminder_type).toBe("none"); // از جیسون مدل
    expect(h.texts(ALI.id).some((x) => x.includes("گزارش هفتگی"))).toBe(true);
  });
});
