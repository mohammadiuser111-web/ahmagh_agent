/**
 * 🧪 محیط ایزوله — ورود/ثبت‌نام دکمه‌ای + کارتِ تعاملی + باگ‌های لایو ۱۱:۴۰
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ALI, ADMIN_PASS, ADMIN_USER, ASGHAR, Harness, MOHAMMAD, createScene } from "./harness";
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
    // حالا گامِ اسم مستعار (به جای @)
    expect(h.lastText(NEWBIE.id)).toContain("اسم مستعار");
    await h.say(NEWBIE, "نوآمده");
    const last = h.lastText(NEWBIE.id);
    expect(last).toContain("اسم مستعارت شد");
    expect(last).toContain("نوآمده");
    expect(JSON.stringify(h.to(NEWBIE.id).filter((m) => m.kind === "message").at(-1)!.keyboard ?? {})).toContain("🗂 مدیریت تسک");

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
  it("کارت تسک دومرحله‌ای است: «تسک ساخته شد» → کارت کامل با دکمه‌ها", async () => {
    await h.say(ALI, "یه تسک بساز: کارت تعاملی، تا فردا");
    // مرحله‌ی ۱: پیام کوتاه
    const first = h.texts(ALI.id).at(-1)!;
    expect(first).toContain("تسک ساخته شد");
    expect(first).toContain("کارت تعاملی");
    expect(first).toContain("شناسه");
    // مرحله‌ی ۲: همان پیام به کارت کامل تبدیل می‌شود
    const edit = h.edits(ALI.id).at(-1)!;
    expect(edit.text ?? "").toContain("کارت تعاملی");
    expect(edit.text ?? "").toContain("وضعیت");
    expect(edit.text ?? "").toContain("مسئول");
    const kb = JSON.stringify(edit.keyboard ?? {});
    expect(kb).toContain("edt|");
    expect(kb).toContain("delx|");
    expect(kb).toContain("تمام شد");
    expect(kb).toContain("شروع نشده");
    expect(kb).toContain("در حال انجام");
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
    expect(h.lastText(ALI.id)).toContain("یادآوری برای");
    expect(h.lastText(ALI.id)).toContain("طراحی لندنیگ پیچ");
    const rem = h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!;
    expect(JSON.stringify(rem.keyboard ?? {})).toContain(`card|${t.id}`);
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

  it("چند ادمین: هر کس admin/1234 بزند ادمین می‌شود (بدون تصاحب نامِ admin)", async () => {
    // اصغر (ادمینِ موجود) + نوآمده با همان admin/1234 → هر دو ادمین
    await h.say(NEWBIE, "/login");
    await h.say(NEWBIE, ADMIN_USER);
    await h.say(NEWBIE, ADMIN_PASS);
    expect(h.lastText(NEWBIE.id)).toContain("خوش برگشتی ادمین");
    const rows = (h.env.DB as any).raw("SELECT user_id, role, username_login FROM users ORDER BY user_id").all();
    expect(rows.filter((r: any) => r.role === "admin").length).toBe(2); // اصغر + نوآمده
    // نامِ «admin» را کسی تصاحب نکرده (بدون تداخل UNIQUE)
    expect(rows.some((r: any) => r.username_login === "admin")).toBe(false);
    // منوی نوآمده هم دکمه‌های ادمین دارد
    const kb = JSON.stringify(h.to(NEWBIE.id).filter((m) => m.kind === "message").at(-1)!.keyboard ?? {});
    expect(kb).toContain("👥 کاربرها");
  });
});

describe("🐞 باگ‌های لایو ۱۱:۴۰", () => {
  it("ثبت‌نام با «-» → بدون اسم مستعار؛ بعداً /alias", async () => {
    await h.callback(NEWBIE, "auth|reg");
    await h.say(NEWBIE, "n8_user");
    await h.say(NEWBIE, "pass1234");
    await h.say(NEWBIE, "-");
    expect(h.lastText(NEWBIE.id)).toContain("بدون اسم مستعار");
    await h.say(NEWBIE, "/alias ایمان");
    expect(h.lastText(NEWBIE.id)).toContain("ایمان");
    const u = (h.env.DB as any).raw("SELECT alias FROM users WHERE user_id=2001").get();
    expect(u.alias).toBe("ایمان");
  });

  it("ادمین: «برای ممد یه تسک بساز» → با اسم مستعار مستقیم می‌سازد", async () => {
    await h.say(ASGHAR, "برای ممد یه تسک بساز: تست مستعار، تا فردا");
    const t = h.tasks().at(-1)!;
    expect(t).toBeTruthy();
    expect(t.assignee_id).toBe(MOHAMMAD.id);
    expect(t.title).toContain("تست مستعار");
  });

  it("ادمین: دو «ایمان» موجود → ابهام‌زدایی با دکمه، بعد ساخت", async () => {
    // یک کاربر چهارم با همان اسم مستعار
    const REZA = { id: 2002, first_name: "رضا", username: "reza_x" };
    await h.say(REZA, "/register reza_user pass1234 ایمان");
    await h.say(NEWBIE, "/register newbie_user pass1234 ایمان");
    await h.say(ASGHAR, "برای ایمان یه تسک بساز: تست ابهام، تا فردا");
    const pick = h.to(ASGHAR.id).filter((m) => m.kind === "message").at(-1)!;
    expect(pick.text ?? "").toContain("چند تا");
    expect(pick.text ?? "").toContain("ایمان");
    expect(JSON.stringify(pick.keyboard ?? {})).toContain(`asp|${REZA.id}`);
    expect(JSON.stringify(pick.keyboard ?? {})).toContain(`asp|${NEWBIE.id}`);
    expect(h.tasks().length).toBe(0); // هنوز نساخته
    await h.callback(ASGHAR, `asp|${REZA.id}`);
    const t = h.tasks().at(-1)!;
    expect(t).toBeTruthy();
    expect(t.assignee_id).toBe(REZA.id);
    expect(t.title).toContain("تست ابهام");
  });

  it("«ساعت ۱۲ شب امشب یاداوری کن» ظهر گفته شده → نیمه‌شبِ امشب = فردا ۰۰:۰۰ (نه شلیکِ همان لحظه)", async () => {
    await h.say(ALI, "یه تسک جدید بسازم\nباید طراحی لندینگ کنم برای یه سایتی\nتا ساعت 6 فردا وقت دارم\nساعت 12 شب امشب هم یاداوری کن");
    const t = h.tasks().at(-1)!;
    expect(t).toBeTruthy();
    const tmr = new Date(Date.parse(`${todayTehranISO()}T12:00:00+03:30`) + 24 * 3600_000 + 3.5 * 3600_000);
    const tmrISO = tmr.toISOString().slice(0, 10);
    expect(t.due_at).toBe(`${tmrISO}T06:00:00+03:30`);
    expect(t.reminder_type).toBe("once");
    expect(t.reminder_at).toBe(`${tmrISO}T00:00:00+03:30`);
    // و همان لحظه شلیک نمی‌کند
    const before = h.texts(ALI.id).length;
    await h.advance(10 * 60_000);
    expect(h.texts(ALI.id).length).toBe(before);
  });

  it("دکمه‌ی «🎴 باز کردن کارت تسک» روی پیام یادآوری → کارت با دکمه‌ها", async () => {
    await h.say(ALI, "یه تسک بساز: دکمه کارت یادآوری، تا فردا — فردا ساعت ۹ صبح یادم بنداز");
    const t = h.tasks().at(-1)!;
    await h.advance(26 * 3600_000); // فردا ۹ صبح می‌رسد
    const rem = h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!;
    expect(rem.text ?? "").toContain("یادآوری برای");
    expect(JSON.stringify(rem.keyboard ?? {})).toContain(`card|${t.id}`);
    await h.callback(ALI, `card|${t.id}`);
    const edit = h.edits(ALI.id).at(-1)!;
    expect(edit.text ?? "").toContain("دکمه کارت یادآوری");
    expect(edit.text ?? "").toContain("وضعیت");
    expect(JSON.stringify(edit.keyboard ?? {})).toContain("st|");
  });

  it("منو: 🗂 مدیریت تسک ← زیرمنو ← 🔙 بازگشت؛ 📊 گزارش؛ 🚪 خروج با تأیید", async () => {
    await h.say(ALI, "🗂 مدیریت تسک");
    const sub = h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!;
    const kb = JSON.stringify(sub.keyboard ?? {});
    expect(sub.text ?? "").toContain("مدیریت تسک");
    expect(kb).toContain("➕ تسک جدید");
    expect(kb).toContain("🗑 حذف تسک");
    await h.say(ALI, "🔙 بازگشت");
    expect(JSON.stringify(h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!.keyboard ?? {})).toContain("📊 گزارش");
    await h.say(ALI, "📊 گزارش");
    expect(h.lastText(ALI.id)).toContain("شکلی");
    await h.say(ALI, "🚪 خروج");
    const out = h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!;
    expect(JSON.stringify(out.keyboard ?? {})).toContain("out|yes");
    await h.callback(ALI, "out|yes");
    expect(h.texts(ALI.id).some((x) => x.includes("خارج شدی"))).toBe(true);
    await h.say(ALI, "یه تسک بساز: بعد خروج منویی، تا فردا");
    expect(JSON.stringify(h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!.keyboard ?? {})).toContain("auth|reg");
    await h.say(ALI, "/login");
    await h.say(ALI, "ali_user");
    await h.say(ALI, "pass1234");
    expect(h.lastText(ALI.id)).toContain("خوش برگشتی");
  });

  it("منوی کاربر عادی دکمه‌های ادمین ندارد؛ 🗑 حذف کاربر هم بسته است", async () => {
    await h.say(ALI, "/menu");
    const kb = JSON.stringify(h.to(ALI.id).filter((m) => m.kind === "message").at(-1)!.keyboard ?? {});
    expect(kb).toContain("🗂 مدیریت تسک");
    expect(kb).not.toContain("👥 کاربرها");
    expect(kb).not.toContain("🗑 حذف کاربر");
    await h.say(ALI, "🗑 حذف کاربر");
    expect(h.lastText(ALI.id)).toContain("فقط برای ادمین");
  });

  it("ادمین: 🗑 حذف کاربر → تأیید → کاربر و تسک‌هایش می‌روند", async () => {
    await h.say(MOHAMMAD, "یه تسک بساز: تسک ممد پیش از حذف، تا فردا");
    await h.say(ASGHAR, "🗑 حذف کاربر");
    const list = h.to(ASGHAR.id).filter((m) => m.kind === "message").at(-1)!;
    expect(JSON.stringify(list.keyboard ?? {})).toContain(`delu|${MOHAMMAD.id}`);
    await h.callback(ASGHAR, `delu|${MOHAMMAD.id}`);
    const confirm = h.to(ASGHAR.id).filter((m) => m.kind === "message").at(-1)!;
    expect(confirm.text ?? "").toContain("ممد");
    expect(JSON.stringify(confirm.keyboard ?? {})).toContain(`deluok|${MOHAMMAD.id}`);
    await h.callback(ASGHAR, `deluok|${MOHAMMAD.id}`);
    expect(h.lastText(ASGHAR.id)).toContain("حذف شد");
    expect((h.env.DB as any).raw("SELECT COUNT(*) AS n FROM users WHERE user_id = ?").get(MOHAMMAD.id).n).toBe(0);
    expect((h.env.DB as any).raw("SELECT COUNT(*) AS n FROM tasks WHERE assignee_id = ?").get(MOHAMMAD.id).n).toBe(0);
    await h.callback(ASGHAR, `delu|${ASGHAR.id}`);
    expect(h.outbox.some((m) => (m.text ?? "").includes("خودت رو نمی‌تونی حذف کنی"))).toBe(true);
  });

  it("ادمین: «برای @» → لیست کاربرها → انتخاب → «تسک رو بنویس» → ساخت برای او", async () => {
    await h.say(ASGHAR, "یه تسک جدید ایجاد کن برای @");
    const pick = h.to(ASGHAR.id).filter((m) => m.kind === "message").at(-1)!;
    expect(pick.text ?? "").toContain("کدوم کاربر");
    expect(JSON.stringify(pick.keyboard ?? {})).toContain(`asg0|${ALI.id}`);
    await h.callback(ASGHAR, `asg0|${ALI.id}`);
    expect(h.lastText(ASGHAR.id)).toContain("تسک رو بنویس");
    await h.say(ASGHAR, "طراحی لوگو برای سایت، تا جمعه ساعت ۱۸");
    const t = h.tasks().at(-1)!;
    expect(t).toBeTruthy();
    expect(t.title).toContain("طراحی لوگو");
    expect(t.assignee_id).toBe(ALI.id);
    expect(t.creator_id).toBe(ASGHAR.id);
    expect(h.texts(ALI.id).some((x) => x.includes("طراحی لوگو"))).toBe(true);
  });

  it("ادمین: «برای نامِ ناشناس» → تسک ساخته می‌شود + انتخابگرِ واگذاری", async () => {
    await h.say(ASGHAR, "یه تسک بساز: گزارش هفتگی، تا فردا — برای رضاناشناس");
    const t = h.tasks().at(-1)!;
    expect(t).toBeTruthy();
    expect(t.assignee_id).toBe(ASGHAR.id); // فعلاً خودش
    const pick = h.to(ASGHAR.id).filter((m) => m.kind === "message").at(-1)!;
    expect(pick.text ?? "").toContain("یکی از این‌ها");
    expect(JSON.stringify(pick.keyboard ?? {})).toContain(`asg|${t.id}|${ALI.id}`);
    await h.callback(ASGHAR, `asg|${t.id}|${ALI.id}`);
    expect(h.task(t.id)!.assignee_id).toBe(ALI.id);
    expect(h.lastText(ASGHAR.id)).toContain("مسئول");
  });

  it("«تسک شماره ۵۵، تاریخ پایان تسک رو تغییر بده به فردا ساعت 12» → مستقیم آپدیت (نه لیست!)", async () => {
    await h.say(ALI, "یه تسک بساز: ساخت ایجنت, تا امروز ساعت ۱۲");
    const t = h.tasks().at(-1)!;
    await h.say(ALI, `تسک شماره ${t.id} ، تاریخ پایان تسک رو تغییر بده به فردا ساعت 12`);
    const updated = h.task(t.id)!;
    expect(updated.due_date).toBe(addDaysISO(todayTehranISO(), 1));
    expect(updated.due_at).toBe(`${addDaysISO(todayTehranISO(), 1)}T12:00:00+03:30`);
    expect(h.lastText(ALI.id)).toContain("زمان پایان آپدیت شد");
  });

  it("کارتِ تسکِ با یادآوری، فقط «یک» خط یادآوری دارد (نه دوبار)", async () => {
    await h.say(ALI, "یه تسک بساز: بدون تکرار، تا فردا — فردا ساعت ۹ صبح یادم بنداز");
    const edit = h.edits(ALI.id).at(-1)!;
    const count = (edit.text ?? "").split("یادآوری:").length - 1;
    expect(count).toBe(1);
  });
});
