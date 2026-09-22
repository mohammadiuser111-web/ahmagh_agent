/**
 * 🧪 محیط ایزوله — ورود/ثبت‌نام دکمه‌ای + کارتِ تعاملی + باگ‌های لایو ۱۱:۴۰
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ALI, ADMIN_PASS, ADMIN_USER, ASGHAR, Harness, createScene } from "./harness";
import { addDaysISO, todayTehranISO } from "../src/dates";

let h: Harness;
const NEWBIE = { id: 2001, first_name: "نوآمده", username: "newbie_user" };

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
});
beforeEach(async () => {
  h = await createScene();
});
afterAll(() => {
  vi.restoreAllMocks();
});

describe("🚪 ورود/ثبت‌نام دکمه‌ای", () => {
  it("کاربر جدید فقط خوش‌آمد + دو دکمه می‌بیند؛ هیچ فیچری نمی‌گیرد", async () => {
    await h.say(NEWBIE, "سلام");
    const last = h.to(NEWBIE.id).filter((m) => m.kind === "message").at(-1)!;
    expect(last.text).toContain("دستیارِ مدیریت کارهای شما");
    const kb = JSON.stringify(last.keyboard ?? {});
    expect(kb).toContain("auth|login");
    expect(kb).toContain("auth|reg");
    expect(h.tasks().length).toBe(0); // چیزی نساخت
  });

  it("/start کاربر جدید → همان دو دکمه", async () => {
    await h.say(NEWBIE, "/start");
    const kb = JSON.stringify(h.to(NEWBIE.id).filter((m) => m.kind === "message").at(-1)!.keyboard ?? {});
    expect(kb).toContain("auth|reg");
  });

  it("جریان کامل ثبت‌نام: دکمه → یوزرنیم → رمز → حساب + منو + دسترسی", async () => {
    await h.callback(NEWBIE, "auth|reg");
    expect(h.lastText(NEWBIE.id)).toContain("یوزرنیم");

    await h.say(NEWBIE, "newbie_user"); // همان یوزرنیمِ تلگرام — باید قبول شود (لاتین)
    expect(h.lastText(NEWBIE.id)).toContain("رمز عبور");

    await h.say(NEWBIE, "secret123");
    const last = h.lastText(NEWBIE.id);
    expect(last).toContain("ثبت‌نام کامل شد");
    expect(JSON.stringify(h.to(NEWBIE.id).filter((m) => m.kind === "message").at(-1)!.keyboard ?? {})).toContain("➕ تسک جدید");

    // حالا بات برایش کار می‌کند
    await h.say(NEWBIE, "یه تسک بساز: اولین کارم، تا فردا");
    expect(h.tasks().length).toBe(1);
    expect(h.tasks()[0].assignee_id).toBe(NEWBIE.id);
  });

  it("جریان ورود: کاربرِ ثبت‌شده با دکمه وارد می‌شود", async () => {
    // علی (ثبت‌شده در صحنه) از مسیر دکمه وارد می‌شود
    await h.say(ALI, "/login");
    expect(h.lastText(ALI.id)).toContain("یوزرنیم");
    await h.say(ALI, "ali_user");
    expect(h.lastText(ALI.id)).toContain("رمز عبور");
    await h.say(ALI, "pass1234");
    expect(h.lastText(ALI.id)).toContain("خوش برگشتی");
  });

  it("ورود با رمز غلط → خطا و تلاش دوباره", async () => {
    await h.say(ALI, "/login");
    await h.say(ALI, "ali_user");
    await h.say(ALI, "wrong_password");
    expect(h.lastText(ALI.id)).toContain("درست نیست");
    await h.say(ALI, "pass1234");
    expect(h.lastText(ALI.id)).toContain("خوش برگشتی");
  });

  it("ورود با مشخصات ادمین → نقش ادمین (اصغر با دکمه وارد می‌شود)", async () => {
    await h.say(ASGHAR, "/login");
    await h.say(ASGHAR, ADMIN_USER);
    await h.say(ASGHAR, ADMIN_PASS);
    expect(h.lastText(ASGHAR.id)).toContain("خوش برگشتی ادمین");
    const kb = JSON.stringify(h.to(ASGHAR.id).filter((m) => m.kind === "message").at(-1)!.keyboard ?? {});
    expect(kb).toContain("👥 کاربرها");
  });

  it("یوزرنیم تکراری → برگرد به گام یوزرنیم", async () => {
    await h.callback(NEWBIE, "auth|reg");
    await h.say(NEWBIE, "ali_user"); // مال علی
    expect(h.lastText(NEWBIE.id)).toContain("گرفته شده");
    await h.say(NEWBIE, "newbie_two");
    expect(h.lastText(NEWBIE.id)).toContain("رمز عبور");
    await h.say(NEWBIE, "pass1234");
    expect(h.lastText(NEWBIE.id)).toContain("ثبت‌نام کامل شد");
  });

  it("لغو با «بی‌خیال»", async () => {
    await h.callback(NEWBIE, "auth|reg");
    await h.say(NEWBIE, "بی‌خیال");
    expect(h.lastText(NEWBIE.id)).toContain("هر وقت خواستی");
    // پیام بعدی → دوباره خوش‌آمد (نه گام رمز)
    await h.say(NEWBIE, "random text");
    expect(h.lastText(NEWBIE.id)).toContain("ثبت‌نام کن");
  });

  it("کاربرِ ثبت‌شده‌ی قدیمی درویزده نمی‌شود (رگرسیون: کل صحنه)", async () => {
    await h.say(ASGHAR, "یه تسک بساز: رگرسیون، تا فردا");
    expect(h.tasks().length).toBe(1);
  });
});

describe("🎴 کارتِ تعاملی (ویرایش/حذف روی کارت)", () => {
  it("کارت تسک دکمه‌های ✏️ ویرایش و 🗑 حذف دارد", async () => {
    await h.say(ALI, "یه تسک بساز: کارت تعاملی، تا فردا");
    const cardMsg = h.to(ALI.id).filter((m) => m.kind === "message").find((m) => (m.text ?? "").includes("تسک ساخته شد"))!;
    const kb = JSON.stringify(cardMsg.keyboard ?? {});
    expect(kb).toContain("edt|");
    expect(kb).toContain("delx|");
  });

  it("✏️ ویرایش روی کارت → «چی عوض بشه؟» → جواب زبانی", async () => {
    await h.say(ALI, "یه تسک بساز: ویرایش کارتی، تا فردا");
    const t = h.tasks().at(-1)!;
    await h.callback(ALI, `edt|${t.id}`);
    expect(h.lastText(ALI.id)).toContain("چی عوض بشه");
    await h.say(ALI, "پایان: فردا ساعت ۱۸");
    const updated = h.task(t.id)!;
    expect(updated.due_date).toBe(addDaysISO(todayTehranISO(), 1));
    expect(updated.due_at).toBe(`${addDaysISO(todayTehranISO(), 1)}T18:00:00+03:30`);
  });

  it("🗑 حذف روی کارت → تأیید → حذف", async () => {
    await h.say(ALI, "یه تسک بساز: حذف کارتی، تا فردا");
    const t = h.tasks().at(-1)!;
    await h.callback(ALI, `delx|${t.id}`);
    const last = h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!;
    expect(JSON.stringify(last.keyboard ?? {})).toContain(`del|${t.id}`);
    await h.callback(ALI, `del|${t.id}`);
    expect(h.tasks().length).toBe(0);
  });

  it("دکمه‌های کارت برای غیرِ صاحب قفل است", async () => {
    await h.say(ALI, "یه تسک بساز: قفل کارتی، تا فردا");
    const t = h.tasks().at(-1)!;
    await h.callback(ASGHAR, `edt|${t.id}`);
    expect(h.outbox.some((m) => (m.text ?? "").includes("مال تو نیست"))).toBe(true);
    expect(h.task(t.id)!.title).toContain("قفل");
  });
});

describe("🐞 باگ‌های لایو ۱۱:۵۷", () => {
  it("«ساعت 11:59 یادآوری کن» → یادآوری ۱۱:۵۹ است نه ۱۲:۱۵ (ساعتِ ددلاین)", async () => {
    // جمله‌ی دقیق کاربر (چندخطی) — دیگر هم سؤال «تا کی؟» نباید بپرسد
    await h.say(ALI, "یه تسک بساز\nطراحی لندنیگ پیچ برای سایت HOMA\nتا ساعت 12:15 باید تمومش کنم ساعت 11:59 یادآوری کن");
    const t = h.tasks().at(-1)!;
    expect(t).toBeTruthy(); // بدون سؤال اضافه ساخته شد
    expect(t.due_at).toBe(`${todayTehranISO()}T12:15:00+03:30`);
    expect(t.reminder_type).toBe("once");
    expect(t.reminder_at).toBe(`${todayTehranISO()}T11:59:00+03:30`);

    // و در زمانِ درست شلیک می‌کند (تیکِ کرونِ بعد از ۱۱:۵۹ = ۱۲:۰۰؛ نه ۱۲:۱۵)
    const before = h.texts(ALI.id).length;
    await h.advance(Date.parse(`${todayTehranISO()}T12:00:30+03:30`) - h.now());
    expect(h.texts(ALI.id).length).toBe(before + 1);
    expect(h.lastText(ALI.id)).toContain("یادآوری‌ای که خواستی");
    expect(h.lastText(ALI.id)).toContain("طراحی لندنیگ پیچ");
  });

  it("«تسک 55» → کارت همان تسک باز می‌شود", async () => {
    await h.say(ALI, "یه تسک بساز: کارت با شناسه، تا فردا");
    const t = h.tasks().at(-1)!;
    await h.say(ALI, `تسک ${t.id}`);
    const last = h.lastText(ALI.id);
    expect(last).toContain("کارت با شناسه");
    expect(last).toContain("وضعیت");
    // و با «شماره»
    await h.say(ALI, `تسک شماره ${t.id} رو نشون بده`);
    expect(h.lastText(ALI.id)).toContain("کارت با شناسه");
    // ولی «تسک X رو ویرایش کن» همچنان ویرایش است نه نمایش
    await h.say(ALI, `تسک ${t.id} رو ویرایش کن`);
    expect(h.lastText(ALI.id)).toContain("چی عوض بشه");
  });

  it("خروج از حساب: /logout → دوباره درگاه ورود", async () => {
    await h.say(ALI, "یه تسک بساز: قبل از خروج، تا فردا");
    await h.say(ALI, "/logout");
    expect(h.lastText(ALI.id)).toContain("خارج شدی");
    // حالا پیام عادی → درگاه ورود
    await h.say(ALI, "یه تسک بساز: بعد از خروج، تا فردا");
    const last = h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!;
    expect(JSON.stringify(last.keyboard ?? {})).toContain("auth|reg");
    expect(h.tasks().length).toBe(1); // تسک جدید ساخته نشد
    // و دوباره ورود → همه‌چیز برمی‌گردد
    await h.say(ALI, "/login");
    await h.say(ALI, "ali_user");
    await h.say(ALI, "pass1234");
    expect(h.lastText(ALI.id)).toContain("خوش برگشتی");
    await h.say(ALI, "یه تسک بساز: بعد از ورود مجدد، تا فردا");
    expect(h.tasks().length).toBe(2);
  });

  it("ادمینِ متعلق به دیگری → رد؛ ولی اولینِ ورود با admin/1234 ادمین می‌شود", async () => {
    // در این صحنه «admin» متعلق به اصغر است → نوآمده نمی‌تواند آن را بگیرد
    await h.say(NEWBIE, "/login");
    await h.say(NEWBIE, ADMIN_USER);
    await h.say(NEWBIE, ADMIN_PASS);
    expect(h.lastText(NEWBIE.id)).toContain("تعلق دارد");
    const u = (h.env.DB as any).raw("SELECT role, logged_in FROM users WHERE user_id=2001").get();
    expect(u.role).toBe("user"); // ادمین نشد
    // و با حساب خودش مشکل ندارد
    await h.say(NEWBIE, "بی‌خیال");
    await h.callback(NEWBIE, "auth|reg");
    await h.say(NEWBIE, "newbie_two");
    await h.say(NEWBIE, "pass1234");
    expect(h.lastText(NEWBIE.id)).toContain("ثبت‌نام کامل شد");
  });
});

describe("🐞 باگ‌های لایو ۱۱:۴۰", () => {
  it("«تسک شماره ۵۵، تاریخ پایان تسک رو تغییر بده به فردا ساعت 12» → مستقیم آپدیت (نه لیست!)", async () => {
    await h.say(ALI, "یه تسک بساز: ساخت ایجنت, تا امروز ساعت ۱۲");
    const t = h.tasks().at(-1)!;
    await h.say(ALI, `تسک شماره ${t.id} ، تاریخ پایان تسک رو تغییر بده به فردا ساعت 12`);
    const updated = h.task(t.id)!;
    expect(updated.due_date).toBe(addDaysISO(todayTehranISO(), 1));
    expect(updated.due_at).toBe(`${addDaysISO(todayTehranISO(), 1)}T12:00:00+03:30`);
    expect(h.lastText(ALI.id)).toContain("زمان پایان آپدیت شد");
  });

  it("کارتِ تسکِ با یادآوری، فقط «یک» خط 🔔 دارد (نه دوبار)", async () => {
    await h.say(ALI, "یه تسک بساز: بدون تکرار، تا فردا — فردا ساعت ۹ صبح یادم بنداز");
    const cardMsg = h.to(ALI.id).filter((m) => m.kind === "message").find((m) => (m.text ?? "").includes("تسک ساخته شد"))!;
    const count = (cardMsg.text ?? "").split("🔔 یادآوری").length - 1;
    expect(count).toBe(1);
  });
});
