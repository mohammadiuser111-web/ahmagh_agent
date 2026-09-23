/**
 * 🧪 محیط ایزوله — نیت‌های جدید بدون کلیدواژه:
 * حذف (تک/همه/تموم‌شده)، ویرایش زبانی (+جریان «چی عوض بشه؟»)، نزدیک‌ترین ددلاین، بدون «احمق»
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

describe("🗑 حذف زبانی", () => {
  it("باگِ لایو: «احمق تمام تسک های منو حذف کن» → تأیید حذف (نه «فقط ادمین»!)", async () => {
    await h.say(ALI, "احمق یه تسک بساز: الف، تا فردا");
    await h.say(ALI, "احمق یه تسک بساز: ب، تا ۳ روز دیگه");
    expect(h.tasks().length).toBe(2);

    await h.say(ALI, "احمق تمام تسک های منو حذف کن");
    const last = h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!;
    expect(last.text).toContain("حذف");
    expect(last.text).not.toContain("ادمین");
    expect(JSON.stringify(last.keyboard ?? {})).toContain("delq|all");

    await h.callback(ALI, "delq|all");
    expect(h.tasks().length).toBe(0);
    expect(h.lastText(ALI.id)).toContain("حذف شد");
  });

  it("بدون «احمق» هم کار می‌کند: «همه تسک هامو پاک کن»", async () => {
    await h.say(MOHAMMAD, "یه تسک بساز: تست، تا فردا");
    await h.say(MOHAMMAD, "همه تسک هامو پاک کن");
    expect(JSON.stringify(h.to(MOHAMMAD.id).filter((m) => m.kind === "message").at(-1)!.keyboard ?? {})).toContain("delq|");
    await h.callback(MOHAMMAD, "delq|all");
    expect(h.tasks().length).toBe(0);
  });

  it("«تموم‌شده‌هامو حذف کن» → فقط تموم‌شده‌ها", async () => {
    await h.say(ALI, "احمق یه تسک بساز: باز، تا فردا");
    await h.say(ALI, "احمق یه تسک بساز: تموم‌شده، تا امروز");
    const done = h.tasks().find((t) => t.title.includes("تموم"))!;
    await h.callback(ALI, `st|${done.id}|done`);

    await h.say(ALI, "تسک های تموم شده هامو حذف کن");
    await h.callback(ALI, "delq|done");
    const titles = h.tasks().map((t) => t.title);
    expect(titles.some((x) => x.includes("باز"))).toBe(true);
    expect(titles.some((x) => x.includes("تموم"))).toBe(false);
  });

  it("«تسک الف رو حذف کن» → تأیید → فقط همان حذف می‌شود", async () => {
    await h.say(ALI, "احمق یه تسک بساز: الف، تا فردا");
    await h.say(ALI, "احمق یه تسک بساز: ب، تا فردا");
    await h.say(ALI, "تسک الف رو حذف کن");
    await h.callback(ALI, `del|${h.tasks().find((t) => t.title.includes("الف"))!.id}`);
    const titles = h.tasks().map((t) => t.title);
    expect(titles.some((x) => x.includes("الف"))).toBe(false);
    expect(titles.some((x) => x.includes("ب"))).toBe(true);
  });

  it("حذف تسک دیگری ممنوع: دکمه‌ی del مال صاحبش است", async () => {
    await h.say(ALI, "احمق یه تسک بساز: مال علی، تا فردا");
    const t = h.tasks().at(-1)!;
    await h.callback(MOHAMMAD, `del|${t.id}`);
    expect(h.tasks().length).toBe(1);
    expect(h.outbox.some((m) => (m.text ?? "").includes("مال تو نیست"))).toBe(true);
  });
});

describe("✏️ ویرایش زبانی", () => {
  it("«تسک گزارش رو ویرایش کن، عنوانش بشه گزارش نهایی» → مستقیم اعمال", async () => {
    await h.say(ALI, "احمق یه تسک بساز: گزارش فروش، تا فردا");
    await h.say(ALI, "تسک گزارش رو ویرایش کن، عنوانش بشه گزارش نهایی");
    const t = h.tasks().at(-1)!;
    expect(t.title).toBe("گزارش نهایی");
    expect(h.lastText(ALI.id)).toContain("عنوان عوض شد");
  });

  it("بدون گفتنِ تغییر → «چی عوض بشه؟» → جواب زبانی «یادآوری: هر روز ساعت ۸»", async () => {
    await h.say(ALI, "احمق یه تسک بساز: تماس با مشتری، تا ۳ روز دیگه");
    await h.say(ALI, "تسک تماس رو ویرایش کن");
    expect(h.lastText(ALI.id)).toContain("چی عوض بشه");
    await h.say(ALI, "یادآوری: هر روز ساعت ۸");
    const t = h.tasks().at(-1)!;
    expect(t.reminder_type).toBe("daily");
    expect(t.reminder_time).toBe("08:00");
    expect(h.lastText(ALI.id)).toContain("یادآوری جدید");
  });

  it("«تسک X رو تموم کن» → وضعیت done + خبر به طرف مقابل", async () => {
    await h.say(ASGHAR, "احمق برای @ali_user یه تسک بساز: کار مشترک، تا فردا");
    const t = h.tasks().at(-1)!;
    await h.say(ALI, "تسک کار مشترک رو تموم کن");
    expect(h.task(t.id)!.status).toBe("done");
    // خبرِ شاد به سازنده (اصغر): «انجام داد»
    expect(h.texts(ASGHAR.id).some((x) => x.includes("انجام داد"))).toBe(true);
    expect(h.texts(ASGHAR.id).some((x) => x.includes("کار مشترک"))).toBe(true);
  });

  it("«/done و /edit وضعیت» هم برای سازنده‌ی ادمین پیام «انجام داد» می‌فرستند", async () => {
    await h.say(ASGHAR, "احمق برای @ali_user یه تسک بساز: گزارش هفته، تا فردا");
    const t1 = h.tasks().at(-1)!;
    await h.say(ALI, `/done ${t1.id}`);
    expect(h.task(t1.id)!.status).toBe("done");
    expect(h.texts(ASGHAR.id).some((x) => x.includes("انجام داد"))).toBe(true);
    // مسیر /edit با فیلد وضعیت — قبلاً خبر نمی‌داد
    await h.say(ASGHAR, "احمق برای @ali_user یه تسک بساز: بسته‌بندی سفارش، تا شنبه");
    const t2 = h.tasks().at(-1)!;
    await h.say(ALI, `/edit ${t2.id} وضعیت: تمام`);
    expect(h.task(t2.id)!.status).toBe("done");
    const asgharTexts = h.texts(ASGHAR.id);
    expect(asgharTexts.filter((x) => x.includes("انجام داد")).length).toBe(2);
  });

  it("چند تسک هم‌نام → انتخابگر → ویرایش", async () => {
    await h.say(ALI, "احمق یه تسک بساز: گزارش ۱، تا فردا");
    await h.say(ALI, "احمق یه تسک بساز: گزارش ۲، تا ۳ روز دیگه");
    await h.say(ALI, "تسک گزارش رو ویرایش کن");
    const last = h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!;
    expect(last.text).toContain("کدوم تسک");
    expect(JSON.stringify(last.keyboard ?? {})).toContain("upd|");
    await h.callback(ALI, `upd|${h.tasks()[0].id}`);
    expect(h.lastText(ALI.id)).toContain("چی عوض بشه");
    await h.say(ALI, "عنوان: گزارش یک");
    expect(h.tasks()[0].title).toBe("گزارش یک");
  });

  it("لغو ویرایش: «بی‌خیال»", async () => {
    await h.say(ALI, "احمق یه تسک بساز: لغو شدن، تا فردا");
    await h.say(ALI, "تسک لغو شدن رو ویرایش کن");
    await h.say(ALI, "بی‌خیال");
    expect(h.lastText(ALI.id)).toContain("بی‌خیال");
    // پیام بعدی دیگر ویرایش نیست
    await h.say(ALI, "یه تسک بساز: بعد از لغو، تا فردا");
    expect(h.tasks().length).toBe(2);
  });
});

describe("⏰ نزدیک‌ترین ددلاین", () => {
  it("باگِ لایو: «کدوم از تسک هام به ددلاین نزدیک تره؟» → جواب درست (نه ساخت تسک، نه HINT)", async () => {
    await h.say(ALI, "احمق یه تسک بساز: دور، تا ۵ روز دیگه");
    await h.say(ALI, "احمق یه تسک بساز: نزدیک، تا فردا ساعت ۱۲");

    const before = h.texts(ALI.id).length;
    await h.say(ALI, "کدوم از تسک هام به ددلاین نزدیک تره؟");
    const ans = h.lastText(ALI.id);
    expect(ans).toContain("نزدیک");
    expect(ans).toContain("نزدیک‌ترین ددلاین");
    // نه سؤال تاریخ، نه HINT
    expect(h.texts(ALI.id).slice(before).some((x) => x.includes("تا کی"))).toBe(false);
    expect(h.texts(ALI.id).slice(before).some((x) => x.includes("راهنمای کامل"))).toBe(false);
    expect(h.tasks().length).toBe(2); // چیزی نساخت
  });

  it("بدون «احمق» و با فعل فارسی دیگر: «چی زودتر تموم میشه؟» (مسیر AI)", async () => {
    await h.say(ALI, "یه تسک بساز: تنها، تا فردا");
    h.aiQueue.push(
      JSON.stringify({
        intent: "nearest_deadline", title: "", description: "", assignee: "",
        start_date: "", start_time: "", start_phrase: "", due_date: "", due_time: "", due_phrase: "",
        reminder_kind: "", reminder_time: "", reminder_hours: 0, status: "not_started",
        delete_scope: "", task_ref: "", update_field: "", update_value: "", target_user: "", list_filter: "",
      })
    );
    await h.say(ALI, "چی زودتر تموم میشه؟");
    expect(h.lastText(ALI.id)).toContain("نزدیک‌ترین ددلاین");
    expect(h.lastText(ALI.id)).toContain("تنها");
  });
});

describe("🩹 سؤالِ بازِ معلق نباید پیام‌ها را بلعد (باگِ لایو ۱۱:۰۱)", () => {
  it("درافتِ «تا کی؟» معلق است → «تمام تسک های منو حذف کن» → حذف، نه «تاریخ رو نفهمیدم»", async () => {
    // تسکی بدون تاریخ پایان → بات می‌پرسد «تا کی؟» و درافت می‌سازد
    await h.say(ALI, "یه تسک بساز: بی‌تاریخ");
    expect(h.tasks().length).toBe(0);
    expect(h.texts(ALI.id).some((x) => x.includes("تا کی"))).toBe(true);

    // حالا دستور حذف — نباید بلعیده شود
    await h.say(ALI, "احمق یه تسک بساز: واقعی، تا فردا");
    expect(h.tasks().length).toBe(1);
    await h.say(ALI, "تمام تسک های منو حذف کن");
    expect(h.lastText(ALI.id)).not.toContain("نفهمیدم");
    const last = h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!;
    expect(JSON.stringify(last.keyboard ?? {})).toContain("delq|all");
    await h.callback(ALI, "delq|all");
    expect(h.tasks().length).toBe(0);
  });

  it("«تسک شماره ۱ رو میخوام ویرایش کنم» (جمله‌ی دقیق لایو) → «چی عوض بشه؟»", async () => {
    await h.say(ALI, "یه تسک بساز: اول، تا فردا");
    await h.say(ALI, "یه تسک بساز: دوم، تا فردا");
    const t = h.tasks()[0];
    await h.say(ALI, "تسک شماره 1 رو میخوام ویرایش کنم");
    expect(h.lastText(ALI.id)).not.toContain("نفهمیدم");
    expect(h.lastText(ALI.id)).toContain("چی عوض بشه");
    await h.say(ALI, "عنوان: اولِ واقعی");
    expect(h.task(t.id)!.title).toBe("اولِ واقعی");
  });

  it("جوابِ عادیِ «فردا» هنوز به درافتِ «تا کی؟» جواب می‌دهد", async () => {
    await h.say(ALI, "یه تسک بساز: بی‌تاریخ ۲");
    await h.say(ALI, "فردا");
    expect(h.tasks().length).toBe(1);
    expect(h.tasks()[0].due_date).toBeTruthy();
  });

  it("جوابِ ویرایش («وضعیت: تموم») دستورمانند حساب نمی‌شود", async () => {
    await h.say(ALI, "یه تسک بساز: تموم‌کردنی، تا فردا");
    const t = h.tasks().at(-1)!;
    await h.say(ALI, "تسک تموم‌کردنی رو ویرایش کن");
    await h.say(ALI, "وضعیت: تموم");
    expect(h.task(t.id)!.status).toBe("done");
  });
});

describe("👂 بدون کلیدواژه‌ی «احمق»", () => {
  it("ساخت و لیست بدون «احمق» — کارتِ تسک‌های من با دکمه‌ی هر تسک", async () => {
    await h.say(ALI, "یه تسک بساز: خرید نان، تا فردا");
    expect(h.tasks().length).toBe(1);
    await h.say(ALI, "تسک هامو نشون بده");
    const last = h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!;
    expect(last.text).toContain("تسک‌های تو");
    expect(last.text).toContain("علی");
    expect(JSON.stringify(last.keyboard ?? {})).toContain("خرید نان"); // دکمه = خود تسک
    expect(JSON.stringify(last.keyboard ?? {})).toContain(`my|${h.tasks()[0].id}`);
    // و لمس دکمه → کارت همان تسک
    await h.callback(ALI, `my|${h.tasks()[0].id}`);
    expect(h.lastText(ALI.id)).toContain("خرید نان");
    expect(h.lastText(ALI.id)).toContain("وضعیت");
  });

  it("سلام و گپ → HINT دوستانه، نه تسک", async () => {
    await h.say(ALI, "سلام حالت چطوره؟");
    const last = h.lastText(ALI.id);
    expect(last).toContain("دستیار");
    expect(h.tasks().length).toBe(0);
    expect(h.texts(ALI.id).some((x) => x.includes("تا کی"))).toBe(false);
  });

  it("مسیر AI برای حذف: جیسون مدل → دکمه‌ی تأیید", async () => {
    await h.say(MOHAMMAD, "یه تسک بساز: برای حذف دستی، تا فردا");
    h.aiQueue.push(
      JSON.stringify({
        intent: "delete_tasks", title: "", description: "", assignee: "",
        start_date: "", start_time: "", start_phrase: "", due_date: "", due_time: "", due_phrase: "",
        reminder_kind: "", reminder_time: "", reminder_hours: 0, status: "not_started",
        delete_scope: "all", task_ref: "", update_field: "", update_value: "", target_user: "", list_filter: "",
      })
    );
    await h.say(MOHAMMAD, "کارام رو بترکون دیگه");
    const last = h.to(MOHAMMAD.id).filter((m) => m.kind === "message").at(-1)!;
    expect(JSON.stringify(last.keyboard ?? {})).toContain("delq|all");
  });
});
