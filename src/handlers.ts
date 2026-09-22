/**
 * ahmagh_agent — مدیریت پیام‌ها، دستورها و دکمه‌های تلگرام
 */
import type { Env, PendingDraft, ReminderSpec, TaskRow, TaskStatus, UserRow } from "./types";
import {
  assignTask,
  createTask,
  deletePendingEdit,
  deletePendingTask,
  deleteTaskById,
  deleteTasksOwnedBy,
  findUserByLogin,
  findUserByName,
  findUserByUsername,
  findUsersByName,
  getPendingEdit,
  getPendingTask,
  getTask,
  getUser,
  listTasks,
  recentUsers,
  savePendingAuth,
  savePendingEdit,
  savePendingPick,
  getPendingPick,
  deletePendingPick,
  deleteUser,
  setLoggedIn,
  savePendingTask,
  setAlias,
  getPendingAuth,
  deletePendingAuth,
  setTaskFields,
  updateTaskStatus,
  upsertUser,
} from "./db";
import { extractDueDateTime, extractTask } from "./ai";
import type { ParsedTask } from "./types";
import { detectExportRequest, detectListRequest, detectUserTasksQuery } from "./intent";
import { cmdRegister, cmdWhoami, completeAuth, validateAuthUsername } from "./auth";
import { STYLE_LABEL, buildHtmlReport, buildReportModel } from "./exporter";
import type { ExportStyle } from "./exporter";
import { answerCallbackQuery, editMessageText, escapeHtml, sendDocument, sendMessage } from "./telegram";
import {
  STATUS_EMOJI,
  STATUS_LABEL,
  displayName,
  normalizeEditField,
  parseStatus,
  statusKeyboard,
  taskCard,
  userLabel,
  truncate,
} from "./format";
import {
  enDigits,
  faDigits,
  fmtDate,
  fmtTimeTehran,
  parseRelativeFaDateTime,
  parseReminderSpec,
  reminderSpecText,
  todayTehranISO,
} from "./dates";

/** واژه‌ی بیدارکننده‌ی بات 😄 */
const TRIGGER_RE = /احمق|ahmagh/i;

/** تأخیر (در تست ۰ تا قطعی و سریع باشد؛ در پروداکشن ۳ ثانیه برای انیمیشن کارت) */
const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

const WELCOME = `سلام! من <b>احمق‌ایجنت</b> هستم 🤖
ایجنتِ مدیریت تسک شما — اسمم «احمقه» ولی کارم درسته!

برای ساختن تسک، فقط طبیعی با من حرف بزن:
<b>«احمق این تسک رو ایجاد کن: خرید نان، تا فردا»</b>

از حرفت این‌ها رو درمیارم:
📌 عنوان و توضیحات
👷 مسئول (اگه اسمش رو بگی)
📅 تاریخ شروع (اگه نگفی = امروز) و تاریخ پایان (اجباری — اگه نگفی، می‌پرسم!)
🕐 ساعت هم قبوله: «تا فردا ساعت ۱۰:۳۰ عصر» یا «تا شنبه ۱۲ ظهر»
🚦 وضعیت اولیه

با رسیدن تاریخ شروع، تسک خودکار «در حال انجام» می‌شه و تا تمومش نکنی هم یادآوری می‌کنم 😈

👑 /register &lt;نام‌کاربری&gt; &lt;رمز&gt; [اسم مستعار] — ثبت‌نام (با مشخصات ادمین → ادمین!)

از منوی پایین هم می‌تونی استفاده کنی 👇 (/menu)
/help — همه‌ی دستورها`;

const HELP = `🤖 <b>راهنمای احمق‌ایجنت</b>

<b>با زبان طبیعی — لازم نیست «احمق» بگی، هرجور راحتی بگو:</b>
• «یه تسک بساز: تماس با مشتری، تا شنبه — هر روز ساعت ۵ یادم کن»
• «تسک‌هامو نشون بده» · «کدومش به ددلاین نزدیک‌تره؟» · «تسک ۵۵» (کارت همان تسک)
• «تسک گزارش رو ویرایش کن» · «همه تسک‌هامو حذف کن»
• «خروجی تسک‌هامو بده»

<b>دستورها:</b>
/new &lt;متن&gt; — ساخت تسک
/tasks — تسک‌های بازِ من
/tasks done — تسک‌های تمام‌شده‌ی من
/tasks created — تسک‌هایی که خودم ساختم
/tasks all — همه‌ی تسک‌های مرتبط با من
/task &lt;شناسه&gt; — جزئیات یک تسک
/status &lt;شناسه&gt; &lt;وضعیت&gt; — تغییر وضعیت
/done &lt;شناسه&gt; — علامت‌گذاری به‌عنوان تمام‌شده
/assign &lt;شناسه&gt; @یوزرنیم — واگذاری به کس دیگه
/edit &lt;شناسه&gt; &lt;فیلد&gt;: &lt;مقدار&gt; — ویرایش (عنوان/توضیح/مسئول/شروع/پایان/وضعیت)
/delete &lt;شناسه&gt; — حذف تسک
/register &lt;نام‌کاربری&gt; &lt;رمز&gt; [اسم مستعار] — ثبت‌نام 👑 (با مشخصات ادمین → نقش ادمین)
/alias &lt;اسم&gt; — اسم مستعارت (به جای @؛ ادمین با آن برایت تسک می‌سازد)
/whoami — حساب و نقش من
/logout — خروج از حساب 🚪
/export — خروجی گزارشی HTML با سه شکل: 📋 لیستی (جدول) · 📄 گزارش‌طور · 📊 داشبورد
/menu — منوی دکمه‌ای 🎛 (🗂 مدیریت تسک · 📊 گزارش · 🚪 خروج + ادمین: 👥 کاربرها · 🌐 تسک‌های همه · 🗑 حذف کاربر)
/help — همین راهنما

<b>وضعیت‌ها:</b> not_started / in_progress / done
(معادل فارسی هم قبوله: شروع_نشده / در_حال_انجام / تمام)

💡 زیر کارت هر تسک: 🗑 حذف | ✏️ ویرایش و سه دکمه‌ی وضعیت (تمام شد / در حال انجام / شروع نشده).

<b>نکته‌ها:</b>
• تاریخ پایان اجباریه — اگه تو متن نگی، جدا می‌پرسم و فقط جواب می‌دی (مثلاً: فردا / پنجشنبه / فردا ساعت ۵ عصر)
• اگه تاریخ شروع نگفی، امروز حساب می‌شه
• ساعت هم می‌فهمم: «تا فردا ساعت ۱۰:۳۰ عصر» یا «تا شنبه ۱۲ ظهر»
• با رسیدن زمان شروع، وضعیت خودکار «در حال انجام» می‌شه 🚦
• در چت خصوصی بدون هیچ کلیدواژه‌ای همه‌چیز فهمیده می‌شود (در گروه: با «احمق» یا منشن)
• فقط ادمین می‌تونه برای دیگه‌ها تسک بسازه؛ بقیه برای خودشون
• اسم مستعار: هر کاربر یک اسم مستعار دارد (مثل «ایمان») — «برای ایمان یه تسک بساز». اگر چند نفر هم‌نام باشند، می‌پرسم کدوم
• 🔔 یادآوری داینامیک: موقع ساخت بگو چطور یادت بزنیم — «هر روز ساعت ۸ صبح»، «هر ۳ ساعت»، «۱ ساعت قبل از ددلاین»، «فردا ساعت ۱۰ یادم بنداز» یا «یادآوری نکن». با /edit هم عوض می‌شه.
• ادمین: «تسک‌های علی چیا هستن؟» یا /menu ← 👥 کاربرها`;

const HINT = `من دستیارِ تسک‌هاتم — لازم نیست چیزی خاصی بگی، هرجور راحتی بگو:

• «یه تسک بساز: خرید نان، تا فردا — هر روز ساعت ۵ یادم کن»
• «تسک‌هامو نشون بده» · «کدومش نزدیک‌تره؟»
• «تسک گزارش رو ویرایش کن» · «همه تسک‌هامو حذف کن»
• «خروجی تسک‌هامو بده»

راهنمای کامل: /help`;

/** «تسک 55» / «تسک شماره ۵۵» / «تسک ۵۵ رو نشون بده» → شناسه‌ی تسک برای نمایش کارت */
function detectTaskShow(text: string): number | null {
  const t = text.replace(/احمق/g, " ").replace(/\u200c/g, " ").trim();
  const base = /^(?:تسک|تاسک)(?:\s*شماره)?\s*(\d{1,4})(?:\s*(?:رو|را))?\s*(?:نشون|نمایش|باز\s*کن|جزئیات|چیه|چیا|بگو|ده|بده)?[!.؟\s]*$/;
  const m = t.match(base);
  if (!m) return null;
  // اگر فعلِ عملیاتی همراهش بود، نمایش نیست (ویرایش/حذف/ساخت/…)
  if (/بساز|ایجاد|ساخت|ثبت|حذف|پاک|ویرایش|آپدیت|اپدیت|تغییر|عوض|تموم|یادآوری|یادم/.test(t)) return null;
  return Number(enDigits(m[1]));
}

const AUTH_WELCOME = `سلام! من <b>احمق‌ایجنت</b> هستم 🤖
دستیارِ مدیریت کارهای شما.

برای شروع، وارد حسابت شو یا ثبت‌نام کن: 👇`;

function authKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🔑 ورود", callback_data: "auth|login" }, { text: "📝 ثبت‌نام", callback_data: "auth|reg" }],
    ],
  };
}

async function sendAuthWelcome(env: Env, chatId: number): Promise<void> {
  await sendMessage(env, chatId, AUTH_WELCOME, { reply_markup: authKeyboard() });
}

/** حسابِ ثبت‌شده و داخل‌شده؟ (خروج = logged_in صفر؛ ثبت‌نام پابرجا) */
async function isAuthed(env: Env, userId: number): Promise<boolean> {
  const u = await getUser(env, userId);
  return !!(u && (u.username_login || u.password_hash) && u.logged_in !== 0);
}

/** گفت‌وگوی گام‌به‌گام ورود/ثبت‌نام: یوزرنیم → رمز */
async function tryPendingAuthReply(env: Env, msg: any, text: string): Promise<boolean> {
  const pa = await getPendingAuth(env, msg.from.id);
  if (!pa) return false;
  if (Date.now() - Date.parse(pa.created_at) > 15 * 60_000) {
    await deletePendingAuth(env, msg.from.id);
    return false;
  }
  const clean = text.replace(/\u200c/g, " ").trim();
  if (CANCEL_RE.test(clean)) {
    await deletePendingAuth(env, msg.from.id);
    await sendMessage(env, msg.chat.id, "👌 باشه، هر وقت خواستی دوباره: /start");
    return true;
  }
  if (pa.step === "username") {
    const u = clean.split(/\s+/)[0];
    if (!validateAuthUsername(u)) {
      await sendMessage(env, msg.chat.id, "❌ یوزرنیم باید ۳ تا ۳۲ کاراکتر لاتین، عدد یا _ باشد. دوباره بگو:");
      return true;
    }
    if (pa.mode === "register") {
      const existing = await findUserByLogin(env, u.toLowerCase());
      if (existing && existing.user_id !== msg.from.id) {
        await sendMessage(env, msg.chat.id, "❌ این نام کاربری قبلاً گرفته شده. یوزرنیم دیگری بگو:");
        return true; // در همان گام یوزرنیم می‌ماند
      }
    }
    await savePendingAuth(env, msg.from.id, msg.chat.id, pa.mode as "register" | "login", "password", u);
    await sendMessage(env, msg.chat.id, `🔒 حالا <b>رمز عبور</b> خود را وارد کن${pa.mode === "register" ? " (حداقل ۴ کاراکتر)" : ""}:`);
    return true;
  }
  // گامِ اسم مستعار (فقط ثبت‌نام — بعد از ساخته‌شدن حساب)
  if (pa.step === "alias") {
    if (clean.startsWith("/") || isMenuLabel(clean)) {
      await deletePendingAuth(env, msg.from.id);
      return false; // دستور/دکمه‌ی منو بود → مسیر عادی ادامه یابد
    }
    await deletePendingAuth(env, msg.from.id);
    const meA = await getUser(env, msg.from.id);
    if (CANCEL_RE.test(clean) || clean === "-") {
      await sendMessage(
        env,
        msg.chat.id,
        "👌 بدون اسم مستعار. هر وقت خواستی: <code>/alias اسم</code>",
        { reply_markup: mainKeyboard(meA?.role === "admin") }
      );
      return true;
    }
    const alias = clean.slice(0, 40);
    await setAlias(env, msg.from.id, alias);
    await sendMessage(
      env,
      msg.chat.id,
      `🎭 اسم مستعارت شد: <b>${escapeHtml(alias)}</b>\nادمین حالا می‌تونه بگه «برای ${escapeHtml(alias)} یه تسک بساز» 👌`,
      { reply_markup: mainKeyboard(meA?.role === "admin") }
    );
    return true;
  }

  // گامِ رمز
  const pass = clean.split(/\s+/)[0];
  const result = await completeAuth(env, msg.from.id, pa.mode as "register" | "login", pa.username, pass);
  if (!result.startsWith("❌")) {
    await deletePendingAuth(env, msg.from.id);
    await setLoggedIn(env, msg.from.id, true);
    const me = await getUser(env, msg.from.id);
    if (pa.mode === "register") {
      // 🎭 گام بعدی: اسم مستعار (به جای @)
      await savePendingAuth(env, msg.from.id, msg.chat.id, "register", "alias", pa.username);
      await sendMessage(
        env,
        msg.chat.id,
        `${result}\n\n🎭 <b>اسم مستعارت چیه؟</b>\nاین اسم را ادمین به جای @ برای واگذاری تسک به تو می‌بیند (مثلاً: ایمان).\n(اگه فعلاً نمی‌خوای، بفرست: -)`,
        { reply_markup: mainKeyboard(me?.role === "admin") }
      );
    } else {
      await sendMessage(env, msg.chat.id, result, { reply_markup: mainKeyboard(me?.role === "admin") });
    }
  } else {
    await sendMessage(env, msg.chat.id, result);
    if (result.includes("گرفته شده")) {
      // یوزرنیم تکراری → برگرد به گام یوزرنیم
      await savePendingAuth(env, msg.from.id, msg.chat.id, pa.mode as "register" | "login", "username", "");
    }
  }
  return true;
}

export async function handleUpdate(env: Env, update: unknown): Promise<void> {
  const u = update as Record<string, any>;
  try {
    if (u?.callback_query) {
      await onCallbackQuery(env, u.callback_query);
    } else if (u?.message?.text) {
      await onMessage(env, u.message);
    }
  } catch (err) {
    console.error("[bot] failed to handle update:", err);
  }
}

// ============================================================
// پیام‌ها
// ============================================================

/** منوی اصلی — دکمه‌های آماده (کیبورد دائمی تلگرام) */
function mainKeyboard(isAdmin: boolean) {
  const rows: { text: string }[][] = [
    [{ text: "🗂 مدیریت تسک" }, { text: "📊 گزارش" }],
  ];
  if (isAdmin) rows.push([{ text: "👥 کاربرها" }, { text: "🌐 تسک‌های همه" }, { text: "🗑 حذف کاربر" }]);
  rows.push([{ text: "❓ راهنما" }, { text: "🚪 خروج" }]);
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

/** زیرمنوی مدیریت تسک */
function taskMenuKeyboard() {
  return {
    keyboard: [
      [{ text: "➕ تسک جدید" }, { text: "📋 تسک‌های من" }],
      [{ text: "✏️ ویرایش تسک" }, { text: "🗑 حذف تسک" }],
      [{ text: "🕘 تموم‌شده‌ها" }, { text: "🔙 بازگشت" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

/** برچسب دکمه‌های منو → کنش */
const MENU_TEXTS: Record<string, string> = {
  "➕ تسک جدید": "new",
  "📋 تسک‌های من": "mine",
  "🕘 تموم‌شده‌ها": "done",
  "📤 خروجی": "export",
  "👥 کاربرها": "users",
  "🌐 تسک‌های همه": "all",
  "❓ راهنما": "help",
  "🗂 مدیریت تسک": "manage",
  "📊 گزارش": "export",
  "🚪 خروج": "logout",
  "✏️ ویرایش تسک": "edithint",
  "🗑 حذف تسک": "delhint",
  "🔙 بازگشت": "back",
  "🗑 حذف کاربر": "deluser",
};

/** آیا این متن، برچسبِ یک دکمه‌ی منو است؟ (برای مسیریابی پیش‌نویس‌ها) */
function isMenuLabel(text: string): boolean {
  const norm = (x: string) => x.replace(/\u200c/g, " ").replace(/\s+/g, " ").trim();
  return Object.keys(MENU_TEXTS).some((k) => norm(k) === norm(text));
}

/** مسیریابی متنِ دکمه‌های منو */
async function onMenuButton(env: Env, msg: any, text: string): Promise<boolean> {
  const me = await getUser(env, msg.from.id);
  const isAdmin = me?.role === "admin";
  // نرمال‌سازی هر دو طرف (نیم‌فاصله/فاصله‌های چندتایی) تا دکمه‌ها همیشه match شوند
  const norm = (x: string) => x.replace(/‌/g, " ").replace(/\s+/g, " ").trim();
  const t = norm(text);
  const action = Object.entries(MENU_TEXTS).find(([k]) => norm(k) === t)?.[1];
  if (!action) return false;
  if (!isAdmin && (action === "users" || action === "all" || action === "deluser")) {
    await sendMessage(env, msg.chat.id, "این بخش فقط برای ادمین است 👑");
    return true;
  }
  switch (action) {
    case "new":
      await sendMessage(
        env,
        msg.chat.id,
        "بنویسش که بسازم! مثلاً:\n«احمق یه تسک بساز: تماس با مشتری، تا فردا ساعت ۵ عصر — هر روز ساعت ۱۰ صبح یادم کن»"
      );
      return true;
    case "mine":
      await sendTaskList(env, msg, "");
      return true;
    case "done":
      await sendTaskList(env, msg, "done");
      return true;
    case "export":
      await cmdExport(env, msg);
      return true;
    case "users":
      await sendUserList(env, msg);
      return true;
    case "all":
      await sendAllUsersTasks(env, msg);
      return true;
    case "manage":
      await sendMessage(
        env,
        msg.chat.id,
        "🗂 <b>مدیریت تسک</b>\nاز دکمه‌های پایین انتخاب کن — یا مثل همیشه طبیعی حرف بزن:",
        { reply_markup: taskMenuKeyboard() }
      );
      return true;
    case "edithint":
      await sendMessage(
        env,
        msg.chat.id,
        "✏️ کدوم تسک؟ مثلاً:\n• «تسک ۵ رو ویرایش کن»\n• /edit 5 عنوان: عنوان جدید\nیا کارتش رو باز کن (مثلاً «تسک ۵») و ✏️ بزن.",
        { reply_markup: taskMenuKeyboard() }
      );
      return true;
    case "delhint":
      await sendMessage(
        env,
        msg.chat.id,
        "🗑 کدوم تسک؟ مثلاً:\n• «تسک ۵ رو حذف کن»\n• /delete 5\nیا کارتش رو باز کن و 🗑 حذف بزن.",
        { reply_markup: taskMenuKeyboard() }
      );
      return true;
    case "back":
      await sendMessage(env, msg.chat.id, "🎛 منوی اصلی", { reply_markup: mainKeyboard(isAdmin) });
      return true;
    case "logout":
      await sendMessage(env, msg.chat.id, "🚪 مطمئنی که می‌خوای از حسابت خارج بشی؟\n(ثبت‌نامت پاک نمی‌شود؛ با «ورود» برمی‌گردی)", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ آره، خارج شو", callback_data: "out|yes" }, { text: "❌ بی‌خیال", callback_data: "out|no" }],
          ],
        },
      });
      return true;
    case "deluser":
      await sendDeleteUserList(env, msg);
      return true;
    case "help":
      await sendMessage(env, msg.chat.id, HELP, { reply_markup: mainKeyboard(isAdmin) });
      return true;
  }
  return false;
}

/** لیست کاربرها برای حذف (ادمین) */
async function sendDeleteUserList(env: Env, msg: any): Promise<void> {
  const rows = await env.DB.prepare(
    "SELECT user_id, first_name, username, role FROM users WHERE user_id != ? ORDER BY updated_at DESC LIMIT 25"
  )
    .bind(msg.from.id)
    .all<{ user_id: number; first_name: string | null; username: string | null; role: string }>();
  const kb = (rows.results ?? []).map((u) => [
    {
      text: `${u.role === "admin" ? "👑" : "👤"} ${userLabel(u)}`,
      callback_data: `delu|${u.user_id}`,
    },
  ]);
  if (!kb.length) {
    await sendMessage(env, msg.chat.id, "کاربر دیگری جز خودت با بات حرف نزده است.");
    return;
  }
  await sendMessage(env, msg.chat.id, "🗑 کدوم کاربر حذف بشه؟ (تسک‌هاش هم پاک می‌شوند — برنمی‌گرده!)", {
    reply_markup: { inline_keyboard: kb },
  });
}

/** لیست انتخاب کاربر (برای واگذاری/ساخت تسک) */
async function sendUserPickList(env: Env, msg: any, callbackPrefix: string, header: string): Promise<void> {
  const rows = await env.DB.prepare(
    "SELECT user_id, first_name, username, role FROM users WHERE user_id != ? ORDER BY updated_at DESC LIMIT 15"
  )
    .bind(msg.from.id)
    .all<{ user_id: number; first_name: string | null; username: string | null; role: string }>();
  const kb = (rows.results ?? []).map((u) => [
    {
      text: `${u.role === "admin" ? "👑" : "👤"} ${userLabel(u)}`,
      callback_data: `${callbackPrefix}|${u.user_id}`,
    },
  ]);
  if (!kb.length) {
    await sendMessage(env, msg.chat.id, "هنوز کاربر دیگری با بات حرف نزده است.");
    return;
  }
  await sendMessage(env, msg.chat.id, header, { reply_markup: { inline_keyboard: kb } });
}

/** لیست کاربرها برای ادمین (دکمه شیشه‌ای → تسک‌های هر کاربر) */
async function sendUserList(env: Env, msg: any): Promise<void> {
  const users = await recentUsers(env, 50);
  const me = await getUser(env, msg.from.id);
  const rows = await env.DB.prepare(
    "SELECT user_id, first_name, username, role FROM users ORDER BY updated_at DESC LIMIT 25"
  ).all<{ user_id: number; first_name: string | null; username: string | null; role: string }>();
  const list = (rows.results ?? [])
    .map((u) => [
      {
        text: `${u.role === "admin" ? "👑" : "👤"} ${userLabel(u)}`,
        callback_data: `usr|${u.user_id}`,
      },
    ]);
  await sendMessage(
    env,
    msg.chat.id,
    "👥 <b>کاربرهای بات</b>\nروی هر کدام بزن تا تسک‌هاش رو ببینی:",
    { reply_markup: { inline_keyboard: list.length ? list : [[{ text: "کسی نیست 🤷", callback_data: "noop" }]] } }
  );
  void users; void me;
}

/** تسک‌های همه‌ی کاربرها + نزدیک‌ترین ددلاین‌ها (ادمین) */
async function sendAllUsersTasks(env: Env, msg: any): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT t.*, COALESCE(u.alias, u.first_name, u.username, '#' || u.user_id) AS u_name FROM tasks t JOIN users u ON u.user_id = t.assignee_id
     WHERE t.status != 'done' ORDER BY COALESCE(t.due_at, t.due_date || 'T23:59:59+03:30') ASC LIMIT 30`
  ).all<TaskRow & { u_name: string | null }>();
  const tasks = rows.results ?? [];
  if (!tasks.length) {
    await sendMessage(env, msg.chat.id, "هیچ تسک بازی وجود نداره 🎉");
    return;
  }
  const lines = tasks.map((t) => {
    const dueMs = t.due_at ? Date.parse(t.due_at) : t.due_date ? endOfDayMs(t.due_date) : Infinity;
    const left = dueMs === Infinity ? "بدون ددلاین" : humanizeFa(dueMs);
    return `${STATUS_EMOJI[t.status]} <b>${escapeHtml(truncate(t.title, 40))}</b> — ${escapeHtml(t.u_name ?? "?")} (${left})`;
  });
  const nearest = tasks[0];
  await sendMessage(
    env,
    msg.chat.id,
    `🌐 <b>تسک‌های بازِ همه</b> (${faDigits(tasks.length)}):\n\n${lines.join("\n")}\n\n⏰ <b>نزدیک‌ترین ددلاین:</b> «${escapeHtml(truncate(nearest.title, 40))}» — ${escapeHtml(nearest.u_name ?? "?")} (${humanizeFa(nearest.due_at ? Date.parse(nearest.due_at) : endOfDayMs(nearest.due_date ?? ""))})`
  );
}

function endOfDayMs(iso: string): number {
  return Date.parse(`${iso}T23:59:59+03:30`);
}
function humanizeFa(dueMs: number): string {
  const h = (dueMs - Date.now()) / 3_600_000;
  if (h < 0) return "گذشته! ⚠️";
  if (h < 1) return `${faDigits(Math.max(1, Math.round(h * 60)))} دقیقه مونده`;
  if (h < 24) return `${faDigits(Math.max(1, Math.round(h)))} ساعت مونده`;
  return `${faDigits(Math.round(h / 24))} روز مونده`;
}

async function onMessage(env: Env, msg: any): Promise<void> {
  const from = msg?.from;
  if (!from || from.is_bot) return;

  const isPrivate = msg.chat?.type === "private";
  // در گروه، chat_id خصوصی را خراب نکنیم — فقط در چت خصوصی ذخیره می‌شود
  await upsertUser(env, from, isPrivate ? msg.chat.id : null);

  const text = String(msg.text || "").trim();

  // 🚪 درگاه ورود: کاربرِ ثبت‌نشده فقط خوش‌آمد + دکمه‌های ورود/ثبت‌نام می‌بیند
  if (isPrivate && !(await isAuthed(env, from.id))) {
    if (text.startsWith("/")) {
      const c = text.split(/\s+/)[0].split("@")[0].toLowerCase();
      if (["/start", "/register", "/login", "/help", "/whoami"].includes(c)) {
        await onCommand(env, msg, text);
        return;
      }
      await sendAuthWelcome(env, msg.chat.id);
      return;
    }
    if (await tryPendingAuthReply(env, msg, text)) return;
    await sendAuthWelcome(env, msg.chat.id);
    return;
  }

  if (text.startsWith("/")) {
    await onCommand(env, msg, text);
    return;
  }
  // ادامه‌ی گفت‌وگوی ورود (/login برای کاربرِ واردشده هم ممکن است)
  if (isPrivate && (await tryPendingAuthReply(env, msg, text))) return;
  // متنِ تسک برای کاربرِ تازه‌انتخاب‌شده (ادمین: «برای @» ← انتخاب ← حالا متن تسک)
  if (isPrivate && !text.startsWith("/") && !isMenuLabel(text) && (await tryPendingPickReply(env, msg, text))) return;
  // دکمه‌های منو
  if (await onMenuButton(env, msg, text)) return;
  // 👂 در گروه فقط با صدازدن (احمق)؛ در چت خصوصی هر پیامی فهمیده می‌شود
  if (!isPrivate && !TRIGGER_RE.test(text)) return;

  // ۱) نیت‌های قطعی و سریع (بدون AI)
  // (خروجی اول چک می‌شود: «خروجی تسک‌های منو بده» نباید به لیست یا ساخت برسد)
  if (detectExportRequest(text)) {
    await cmdExport(env, msg);
    return;
  }
  const listMode = detectListRequest(text);
  if (listMode) {
    await sendTaskList(env, msg, listMode === "all" ? "all" : listMode === "done" ? "done" : "");
    return;
  }
  const userQuery = detectUserTasksQuery(text);
  if (userQuery) {
    await cmdUserTasksQuery(env, msg, userQuery);
    return;
  }
  // «تسک 55» / «تسک شماره ۵۵ رو نشون بده» → کارتِ همان تسک
  const showId = detectTaskShow(text);
  if (showId) {
    await onCommand(env, msg, `/task ${showId}`);
    return;
  }

  // ۲) شاید این پیام، جوابِ سؤالِ بازِ بات است («تا کی؟» / «چی عوض بشه؟»)
  //    ولی اگر واضحاً دستورِ جدیدی است، سؤالِ قبلی را کنار می‌گذاریم — نه اینکه پیامش را بلعیم!
  if (isPrivate) {
    if (COMMAND_LIKE_RE.test(text)) {
      await deletePendingTask(env, msg.from.id);
      await deletePendingEdit(env, msg.from.id);
    } else {
      if (await tryPendingDeadlineReply(env, msg, text)) return;
      if (await tryPendingEditReply(env, msg, text)) return;
    }
  }

  // ۳) 🧠 هوش مصنوعی ابزار را انتخاب می‌کند: ساخت / حذف / ویرایش / نزدیک‌ترین / …
  const known = await recentUsers(env);
  const parsed = await extractTask(env, text, known);
  switch (parsed.intent) {
    case "create_task":
      await createTaskFromText(env, msg, text, parsed);
      return;
    case "delete_tasks":
      await cmdDeleteTasks(env, msg, parsed);
      return;
    case "update_task":
      await cmdUpdateTask(env, msg, parsed);
      return;
    case "nearest_deadline":
      await cmdNearestDeadline(env, msg);
      return;
    case "list_tasks":
      await sendTaskList(env, msg, parsed.list_filter === "done" ? "done" : parsed.list_filter === "all" ? "all" : "");
      return;
    case "export_report":
      await cmdExport(env, msg);
      return;
    case "user_tasks_query":
      if (parsed.target_user) {
        await cmdUserTasksQuery(env, msg, parsed.target_user);
        return;
      }
      break;
  }
  await sendMessage(env, msg.chat.id, HINT);
}

async function onCommand(env: Env, msg: any, text: string): Promise<void> {
  const chatId = msg.chat.id;
  const parts = text.split(/\s+/);
  const cmd = parts[0].split("@")[0].toLowerCase(); // حذف @botname برای گروه‌ها
  const arg = parts.slice(1).join(" ").trim();

  switch (cmd) {
    case "/start": {
      if (msg.chat?.type === "private" && !(await isAuthed(env, msg.from.id))) {
        await sendAuthWelcome(env, chatId);
        return;
      }
      const me0 = await getUser(env, msg.from.id);
      await sendMessage(env, chatId, WELCOME, { reply_markup: mainKeyboard(me0?.role === "admin") });
      return;
    }
    case "/menu": {
      const me1 = await getUser(env, msg.from.id);
      const isAdmin1 = me1?.role === "admin";
      await sendMessage(
        env,
        chatId,
        `🎛 <b>منوی احمق‌ایجنت</b>\n\n🗂 مدیریت تسک — ساخت، ویرایش، حذف و تسک‌های من\n📊 گزارش — خروجی HTML/PDF از تسک‌ها\n🚪 خروج — خروج از حساب${isAdmin1 ? "\n👥 کاربرها · 🌐 تسک‌های همه · 🗑 حذف کاربر (ادمین)" : ""}\n\nیا مثل همیشه طبیعی حرف بزن!`,
        { reply_markup: mainKeyboard(isAdmin1) }
      );
      return;
    }
    case "/help":
      await sendMessage(env, chatId, HELP);
      return;
    case "/new":
    case "/create":
      if (!arg) {
        await sendMessage(env, chatId, "متن تسک رو بگو؛ مثلاً:\n/new خرید نان، تا فردا");
        return;
      }
      await createTaskFromText(env, msg, arg);
      return;
    case "/tasks":
      await sendTaskList(env, msg, arg);
      return;
    case "/task":
      await sendTaskInfo(env, msg, arg);
      return;
    case "/status":
      await cmdSetStatus(env, msg, arg);
      return;
    case "/done":
      await cmdSetStatus(env, msg, `${arg} done`);
      return;
    case "/assign":
      await cmdAssign(env, msg, arg);
      return;
    case "/edit":
      await cmdEdit(env, msg, arg);
      return;
    case "/register":
    case "/signup": {
      if (arg) {
        await cmdRegister(env, msg, arg); // شکل قدیمی: /register user pass
        return;
      }
      await savePendingAuth(env, msg.from.id, chatId, "register", "username", "");
      await sendMessage(env, chatId, "📝 ثبت‌نام! 👤 <b>یوزرنیم</b> خود را وارد کن (لاتین/عدد، ۳ تا ۳۲ کاراکتر):");
      return;
    }
    case "/login":
    case "/signin": {
      await savePendingAuth(env, msg.from.id, chatId, "login", "username", "");
      await sendMessage(env, chatId, "🔑 ورود! 👤 <b>یوزرنیم</b> خود را وارد کن:");
      return;
    }
    case "/logout":
    case "/signout":
      await setLoggedIn(env, msg.from.id, false);
      await deletePendingTask(env, msg.from.id);
      await deletePendingEdit(env, msg.from.id);
      await sendMessage(
        env,
        chatId,
        "🚪 از حسابت خارج شدی.\nثبت‌نامت پابرجاست — با «ورود» و همان یوزرنیم/رمز برمی‌گردی. هر وقت خواستی: /start"
      );
      return;
    case "/alias": {
      const a = arg.trim().slice(0, 40);
      if (!a) {
        await sendMessage(
          env,
          chatId,
          "🎭 شکل درست: <code>/alias اسم</code>\nاسم مستعار، چیزی است که ادمین به جای @ برای واگذاری تسک به تو می‌بیند."
        );
        return;
      }
      await setAlias(env, msg.from.id, a);
      await sendMessage(env, chatId, `🎭 اسم مستعارت شد: <b>${escapeHtml(a)}</b>`);
      return;
    }
    case "/whoami":
      await cmdWhoami(env, msg);
      return;
    case "/export":
    case "/report":
      await cmdExport(env, msg);
      return;
    case "/delete":
    case "/del":
      await cmdDelete(env, msg, arg);
      return;
    default:
      await sendMessage(env, chatId, "این دستور رو نمی‌شناسم 🤷 روی /help بزن.");
  }
}

// ============================================================
// فاز ۱ — ساخت تسک از زبان طبیعی («احمق این تسک رو ایجاد کن: …»)
// ============================================================

async function createTaskFromText(
  env: Env,
  msg: any,
  text: string,
  pre?: ParsedTask,
  forcedAssigneeId?: number
): Promise<void> {
  const chatId = msg.chat.id;
  const known = await recentUsers(env);
  // نتیجه‌ی extractTask از مسیرِ مسیریابی نیت قبلاً آمده — دوباره AI صدا نزن
  const parsed: ParsedTask = pre && pre.intent === "create_task" ? pre : await extractTask(env, text, known);

  if (parsed.intent !== "create_task" || !parsed.title) {
    await sendMessage(
      env,
      chatId,
      `🤔 راستش نفهمیدم قراره چی بسازم!
یه جوری بگو که بفهمم، مثلاً:
«احمق این تسک رو ایجاد کن: تهیه‌ی گزارش فروش، تا پنجشنبه»

یا با دستور: /new تهیه‌ی گزارش فروش تا پنجشنبه`
    );
    return;
  }

  const me = await getUser(env, msg.from.id);
  const isAdmin = me?.role === "admin";

  // 👑 ادمین «برای @» گفت و متن تمام شد → اول کاربر را از لیست انتخاب کند، بعد متن تسک را می‌پرسیم
  if (
    !forcedAssigneeId &&
    isAdmin &&
    /برای\s*(@\s*)?$/.test(text.replace(/احمق/g, " ").replace(/\u200c/g, " ").trim())
  ) {
    await sendUserPickList(env, msg, "asg0", "👤 کدوم کاربر؟ انتخابش کن تا تسک رو براش بسازم:");
    return;
  }

  let assignee: UserRow;
  let note: string | null = null;
  let showUserPicker = false;
  if (forcedAssigneeId) {
    // مسئول از قبل انتخاب شده (مسیر «برای @» ← دکمه‌ی کاربر ← متن تسک)
    assignee = (await getUser(env, forcedAssigneeId)) ?? me!;
    note = `👷 مسئول: ${displayName(assignee)}`;
  } else {
    // 👷 استخراج قطعی مسئول: «برای @یوزر» یا «برای اسم»
    if (!parsed.assignee_name) {
      const mA = text.match(/برای\s+(@?[\w\u0600-\u06FF]+)/);
      if (mA) {
        const ref = mA[1];
        if (ref.startsWith("@")) {
          const known = await findUserByUsername(env, ref.slice(1).toLowerCase());
          // ناشناس هم عبور می‌دهد تا ادمین لیست انتخاب کاربر را ببیند
          if (known || isAdmin) parsed.assignee_name = ref;
        } else {
          const matches = await findUsersByName(env, ref);
          if (matches.length === 1) {
            parsed.assignee_name = ref;
          } else if (matches.length > 1 && isAdmin && !forcedAssigneeId) {
            // 🤔 چند نفر هم‌نام/هم‌مستعار → ادمین انتخاب می‌کند، بعد همان متن ساخته می‌شود
            await savePendingPick(env, msg.from.id, msg.chat.id, 0, text);
            const kb = matches.slice(0, 10).map((u) => [
              { text: `👤 ${userLabel(u)}`, callback_data: `asp|${u.user_id}` },
            ]);
            await sendMessage(env, msg.chat.id, `🤔 چند تا «${escapeHtml(ref)}» داریم! کدومشون منظورته؟`, {
              reply_markup: { inline_keyboard: kb },
            });
            return;
          } else if (matches.length > 1) {
            parsed.assignee_name = ref; // غیرادمین: به‌هرحال خودش مسئول می‌شود
          } else if (isAdmin) {
            // نامِ ناشناس → انتخابگر همه‌ی کاربرها باز شود
            parsed.assignee_name = ref;
          }
        }
      }
    }

    const { user: resolved, note: assignNote, found } = await resolveAssignee(env, parsed.assignee_name, msg.from.id);
    assignee = resolved;
    note = assignNote;
    if (!isAdmin && found && resolved.user_id !== msg.from.id) {
      // ⛓ فقط ادمین می‌تواند برای دیگری تسک بسازد
      assignee = me ?? resolved;
      note = [assignNote, "⛓ فقط ادمین می‌تونه برای دیگه‌ها تسک بسازه؛ فعلاً خودت مسئولش شدی."]
        .filter(Boolean)
        .join("\n");
    } else if (isAdmin && !found && parsed.assignee_name) {
      // 👑 ادمین @/نامِ ناشناس زد → بعد از ساخت، لیست کاربرها برای انتخاب می‌آید
      showUserPicker = true;
      assignee = me ?? resolved;
    }
  }
  const today = todayTehranISO();

  // 📅 اولویت تاریخ‌ها (مدل‌های زبانی در محاسبه‌ی تاریخ فارسی خطا می‌کنند):
  // ۱) عبارتِ عینی که AI از خودِ متن کاربر کپی کرده (start_phrase/due_phrase)
  //    → با پارسر قطعی محلی تبدیل می‌شود؛ هم معنا درست است هم حساب تاریخ
  // ۲) regex روی خودِ متن اصلی
  // ۳) ISO خودِ مدل (آخرین راه)
  const isoOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
  const timeOk = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || "");

  // ⚠️ مرز کلمه‌ی فارسی: «از» داخل «فاز» یا «تا» داخل «پاستا» نباید حساب شود
  const B = "(?:^|[\\s،,:؛.])";
  // ۱) بندهای «تا/سررسید» و «از/شروع» از خودِ متن؛ اگر چند بند باشد،
  //    آخرینِ قابل‌پارس ملاک است (در جمله‌های واقعی، ددلاین خودِ گوینده آخرین «تا» است،
  //    نه «تا»ی مالِ طرفِ دیگر ماجرا!)
  const collect = (kw: string) => {
    let date: string | null = null;
    let time: string | null = null;
    for (const m of text.matchAll(new RegExp(B + kw + "\\s+((?:\\S+\\s+){0,3}\\S+)", "g"))) {
      const dt = parseRelativeFaDateTime(m[1], today);
      if (dt.date) { date = dt.date; time = dt.time; }
      else if (dt.time) time = dt.time; // «تا ساعت ۱۲:۱۵» بدون تاریخ — فقط ساعت
    }
    return { date, time };
  };
  const fromC = collect("(?:از|شروع)");
  const toC = collect("(?:تا|سررسید)");
  // «تا ساعت ۱۲:۱۵» بدون تاریخ → یعنی امروز (سؤال اضافه نپرس!)
  if (!toC.date && toC.time) toC.date = today;
  let sd: string | null = fromC.date;
  let st: string | null = fromC.time;
  let dd: string | null = toC.date;
  let dtm: string | null = toC.time;

  // ۲) عبارتی که AI عیناً از متن کاربر برداشته (برای جمله‌های بدون «تا»)
  if (!sd && parsed.start_phrase) {
    const dt = parseRelativeFaDateTime(parsed.start_phrase, today);
    if (dt.date) sd = dt.date;
    if (dt.time) st = dt.time;
  }
  if (!dd && parsed.due_phrase) {
    const dt = parseRelativeFaDateTime(parsed.due_phrase, today);
    if (dt.date) dd = dt.date;
    if (dt.time) dtm = dt.time;
  }

  // ۳) ISO خودِ مدل (آخرین راه)
  if (!sd && isoOk(parsed.start_date)) sd = parsed.start_date;
  if (sd && !st && timeOk(parsed.start_time)) st = parsed.start_time;
  if (!dd && isoOk(parsed.due_date)) dd = parsed.due_date;
  if (dd && !dtm && timeOk(parsed.due_time)) dtm = parsed.due_time;

  // 🛡 ضدتوهم: هیچ نشانه‌ی «شروع» در متن نیست اما شروع = پایانِ آینده؟ توهم است → امروز
  const startHint = new RegExp(B + "(?:از|شروع)\\s").test(text) || !!parsed.start_phrase;
  if (!startHint && sd && dd && sd === dd && sd > today) {
    sd = null;
    st = null;
  }

  // 🔔 یادآوری داینامیک — اول قواعد قطعی، بعد پیشنهاد AI
  let reminder: ReminderSpec | null = parseReminderSpec(text, today);
  if (!reminder && parsed.reminder_kind) {
    const rk = parsed.reminder_kind;
    if (rk === "none") reminder = { type: "none", time: null, interval_hours: null, lead_minutes: null, at: null };
    else if (rk === "daily" && parsed.reminder_time)
      reminder = { type: "daily", time: parsed.reminder_time, interval_hours: null, lead_minutes: null, at: null };
    else if (rk === "every_hours" && parsed.reminder_hours > 0)
      reminder = { type: "every_hours", time: null, interval_hours: parsed.reminder_hours, lead_minutes: null, at: null };
    else if (rk === "before_deadline" && parsed.reminder_hours > 0)
      reminder = { type: "before_deadline", time: null, interval_hours: null, lead_minutes: Math.round(parsed.reminder_hours * 60), at: null };
    else if (rk === "once" && parsed.reminder_time)
      reminder = {
        type: "once",
        time: parsed.reminder_time,
        interval_hours: null,
        lead_minutes: null,
        at: `${(sd || today)}T${parsed.reminder_time}:00+03:30`,
      };
  }

  const start_date = sd || today;
  const due_date = dd || "";
  // ⏰ ساعت شروع/پایان اگر گفته شده باشد → timestamp کامل با offset تهران
  const start_at = st ? `${start_date}T${st}:00+03:30` : null;
  const due_at = due_date && dtm ? `${due_date}T${dtm}:00+03:30` : null;

  // 📌 تاریخ پایان اجباری است — اگر نگفته، از کاربر بپرس
  if (!due_date) {
    if (msg.chat?.type === "private") {
      await savePendingTask(env, msg.from.id, msg.chat.id, {
        title: parsed.title,
        description: parsed.description,
        creator_id: msg.from.id,
        assignee_id: assignee.user_id,
        status: parsed.status,
        start_date,
        start_at,
        reminder,
      });
      await sendMessage(
        env,
        chatId,
        `📝 تسک «${escapeHtml(truncate(parsed.title, 60))}» رو یادداشت کردم؛ فقط <b>تاریخ پایان</b> رو نگفتی!\n\n⏳ تا کی باید تموم بشه؟\n(مثلاً: تا فردا / تا پنجشنبه / تا ۱۵ مهر — یا برای لغو: بی‌خیال)`
      );
      return;
    }
    await sendMessage(
      env,
      chatId,
      `⏳ تاریخ پایان رو نگفتی! دوباره همراه با تاریخ بفرست، مثلاً:\n«احمق این تسک رو ایجاد کن: ${escapeHtml(truncate(parsed.title, 40))}، تا فردا»`
    );
    return;
  }

  const task = await createAndAnnounceTask(
    env,
    msg,
    {
      title: parsed.title,
      description: parsed.description,
      creator_id: msg.from.id,
      assignee,
      status: parsed.status,
      start_date,
      start_at,
      due_date,
      due_at,
      reminder,
    },
    note
  );

  // 👑 ادمین @/نامِ ناشناس زد → دکمه‌های انتخاب کاربر
  if (showUserPicker && task) {
    await sendUserPickList(
      env,
      msg,
      `asg|${task.id}`,
      `🤔 «${escapeHtml(parsed.assignee_name)}» بین کاربرهای بات نبود. تسک ساخته شد ولی فعلاً خودت مسئولش هستی — یکی از این‌ها رو انتخاب کن تا واگذارش کنم:`
    );
  }
}

/** ساخت نهایی تسک + ارسال کارت به سازنده و مسئول */
async function createAndAnnounceTask(
  env: Env,
  msg: any,
  fields: {
    title: string;
    description: string;
    creator_id: number;
    assignee: UserRow;
    status: TaskStatus;
    start_date: string | null;
    start_at: string | null;
    due_date: string;
    due_at: string | null;
    reminder: ReminderSpec | null;
  },
  note?: string | null
): Promise<TaskRow | null> {
  // 🚦 اگر شروع در آینده باشد، با رسیدنش خودکار «در حال انجام» می‌شود
  const startInFuture =
    (fields.start_at !== null && Date.parse(fields.start_at) > Date.now()) ||
    (fields.start_date !== null && fields.start_date > todayTehranISO());

  // شروعِ امروز یا گذشته → بلافاصله «در حال انجام» (الزام: انتقال خودکار)
  const effectiveStatus: TaskStatus =
    !startInFuture && fields.status === "not_started" ? "in_progress" : fields.status;
  const task = (await createTask(env, {
    title: fields.title,
    description: fields.description,
    creator_id: fields.creator_id,
    assignee_id: fields.assignee.user_id,
    status: effectiveStatus,
    start_date: fields.start_date,
    start_at: fields.start_at,
    due_date: fields.due_date,
    due_at: fields.due_at,
    auto_start: startInFuture,
    reminder: fields.reminder,
  }))!;
  const creator = await getUser(env, fields.creator_id);

  const notes: string[] = [];
  if (note) notes.push(note);
  if (startInFuture && fields.start_date) {
    notes.push(
      fields.start_at
        ? `از ${fmtDate(fields.start_date)} ساعت ${fmtTimeTehran(fields.start_at)} به‌صورت خودکار «در حال انجام» می‌شه 🚦`
        : `از ${fmtDate(fields.start_date)} به‌صورت خودکار «در حال انجام» می‌شه 🚦`
    );
  }
  // نکته: خط «🔔 یادآوری» در خود کارت هست — اینجا دوباره تکرارش نمی‌کنیم

  // 🎴 دومرحله‌ای: اول «تسک ساخته شد»، چند ثانیه بعد همان پیام به کارتِ کامل تبدیل می‌شود
  const cardText = taskCard(task, creator, fields.assignee, notes.join("\n") || null);
  const cardKb = { reply_markup: statusKeyboard(task) };
  const first = await sendMessage(
    env,
    msg.chat.id,
    `✅ <b>تسک ساخته شد!</b> «${escapeHtml(truncate(task.title, 60))}» — 🆔 <b>${faDigits(task.id)}</b>`
  );
  const msgId = first?.result?.message_id as number | undefined;
  await sleep(env.CARD_EDIT_DELAY_MS ?? 3000);
  if (msgId) {
    const edited = await editMessageText(env, msg.chat.id, msgId, cardText, cardKb);
    if (!edited?.ok) await sendMessage(env, msg.chat.id, cardText, cardKb); // پیام قابل ویرایش نبود → کارت جدا
  } else {
    await sendMessage(env, msg.chat.id, cardText, cardKb);
  }

  // اگر مسئول کس دیگه‌ای است، به خودش هم خبر بده
  if (fields.assignee.user_id !== msg.from.id && fields.assignee.chat_id) {
    await sendMessage(
      env,
      fields.assignee.chat_id,
      `${creator?.role === "admin" ? "👑" : "👷"} <b>${displayName(creator)}</b> یه تسک برایت ساخت:\n\n${taskCard(task, creator, fields.assignee)}`,
      { reply_markup: statusKeyboard(task) }
    );
  }
  return task;
}

const PENDING_TTL_MS = 1 * 3_600_000; // جوابِ سؤال‌های باز («تا کی؟» / «چی عوض بشه؟») تا ۱ ساعت اعتبار دارد
const PICK_TTL_MS = 10 * 60_000; // انتخاب کاربر برای تسک جدید تا ۱۰ دقیقه اعتبار دارد

/** جوابِ «تسک چی براش بسازم؟» بعد از انتخاب کاربر از لیست (ادمین) */
async function tryPendingPickReply(env: Env, msg: any, text: string): Promise<boolean> {
  const pp = await getPendingPick(env, msg.from.id);
  if (!pp) return false;
  if (!pp.assignee_id) {
    // ردیفِ ابهام‌زداییِ مانده (کاربر انتخاب‌نشده) → بی‌اثر
    await deletePendingPick(env, msg.from.id);
    return false;
  }
  if (Date.now() - Date.parse(pp.created_at) > PICK_TTL_MS) {
    await deletePendingPick(env, msg.from.id);
    return false;
  }
  const clean = text.replace(/\u200c/g, " ").trim();
  if (CANCEL_RE.test(clean)) {
    await deletePendingPick(env, msg.from.id);
    await sendMessage(env, msg.chat.id, "👌 باشه، بی‌خیال. هر وقت خواستی دوباره: 🗂 مدیریت تسک ← ➕ تسک جدید");
    return true;
  }
  await deletePendingPick(env, msg.from.id);
  await createTaskFromText(env, msg, text, undefined, pp.assignee_id);
  return true;
}
const CANCEL_RE = /^(بی\s*خیال|بی\s*خیالش|لغو|کنسل|cancel|نه)\s*[!.؟]*$/i;

/** پیامِ «دستورمانند» — جوابِ سؤالِ باز نیست؛ سؤال قبلی را کنار می‌گذارد
 *  (مثل «همه تسک‌هامو حذف کن» وقتی بات منتظرِ «تا کی؟» است) */
const COMMAND_LIKE_RE =
  /حذف|پاک|ویرایش|آپدیت|اپدیت|نزدیک|بساز|ایجاد|ساخت|ثبت|یادداشت|نوت|منو|راهنما|کاربرها|چیا هست|چیا هستن|تغییر|عوض/;

/**
 * اگر تسکی در انتظارِ تاریخ پایان باشد، این پیامِ خصوصی جوابِ همان سؤال است.
 */
async function tryPendingDeadlineReply(env: Env, msg: any, text: string): Promise<boolean> {
  const pending = await getPendingTask(env, msg.from.id);
  if (!pending) return false;

  if (Date.now() - Date.parse(pending.created_at) > PENDING_TTL_MS) {
    await deletePendingTask(env, msg.from.id);
    return false;
  }

  const clean = text.replace(/\u200c/g, " ").trim();
  if (CANCEL_RE.test(clean)) {
    await deletePendingTask(env, msg.from.id);
    await sendMessage(env, msg.chat.id, "🗑 باشه، بی‌خیالش. هر وقت خواستی دوباره بساز!");
    return true;
  }

  // اول تاریخ را سریع و بدون AI دربیار؛ اگر نشد با AI
  const deadline = await resolveDeadlineFromText(env, clean);
  if (!deadline) {
    await sendMessage(
      env,
      msg.chat.id,
      "🤔 تاریخ رو نفهمیدم! ساده‌تر بگو — مثلاً: «فردا»، «پنجشنبه»، «۱۵ مهر» یا «فردا ساعت ۵ عصر».\n(لغو: بی‌خیال)"
    );
    return true;
  }
  const due_at = deadline.time ? `${deadline.date}T${deadline.time}:00+03:30` : null;

  await deletePendingTask(env, msg.from.id);
  const draft = JSON.parse(pending.draft) as PendingDraft;
  const assignee = await getUser(env, draft.assignee_id);
  await createAndAnnounceTask(env, msg, {
    title: draft.title,
    description: draft.description,
    creator_id: draft.creator_id,
    assignee:
      assignee ?? {
        user_id: draft.assignee_id,
        username: null,
        first_name: null,
        username_login: null,
        password_hash: null,
        role: "user",
        chat_id: null,
        created_at: "",
        updated_at: "",
      },
    status: draft.status,
    start_date: draft.start_date,
    start_at: draft.start_at,
    due_date: deadline.date,
    due_at,
    reminder: draft.reminder ?? null,
  });
  return true;
}

/** تبدیل متن جواب کوتاه کاربر به تاریخ + ساعت (اول هیوریستیک، بعد AI) */
async function resolveDeadlineFromText(
  env: Env,
  text: string
): Promise<{ date: string; time: string | null } | null> {
  const today = todayTehranISO();
  const dt = parseRelativeFaDateTime(text, today);
  let date = dt.date || (dt.time ? today : ""); // فقط ساعت گفته؟ → امروز
  let time = dt.time;
  if (!date) {
    const ai = await extractDueDateTime(env, text);
    if (ai.date) date = ai.date;
    if (ai.time && !time) time = ai.time;
  }
  if (!date) return null;
  return { date, time };
}

/** تبدیل نام مسئول (از متن کاربر) به کاربر واقعی ثبت‌شده */
async function resolveAssignee(
  env: Env,
  name: string,
  creatorId: number
): Promise<{ user: UserRow; note: string | null; unknownMention: boolean; found: boolean }> {
  const me = await getUser(env, creatorId);
  const clean = (name || "").trim();
  if (!clean) return { user: me!, note: null, unknownMention: false, found: true };
  const lower = clean.replace(/^@/, "").toLowerCase();
  if (["من", "خودم", "خودمم", "me", "myself", "من خودم"].includes(lower)) return { user: me!, note: null, unknownMention: false, found: true };

  const byUsername = await findUserByUsername(env, lower);
  if (byUsername) return { user: byUsername, note: null, unknownMention: false, found: true };

  const byName = await findUserByName(env, clean);
  if (byName) return { user: byName, note: null, unknownMention: false, found: true };

  return {
    user: me!,
    // اگر با @ شروع می‌شود، یوزرنیمِ ناشناس است
    unknownMention: clean.startsWith("@"),
    found: false,
    note: clean.startsWith("@")
      ? `یوزرنیم «${escapeHtml(clean)}» بین کاربرهای بات پیدا نشد.`
      : `مسئولِ «${escapeHtml(clean)}» بین کاربرهای بات پیدا نشد؛ فعلاً خودت مسئول شدی. وقتی اون هم با بات حرف زد، با /assign می‌تونی تسک رو بهش واگذار کنی.`,
  };
}

// ============================================================
// لیست‌ها و جزئیات
// ============================================================

async function sendTaskList(env: Env, msg: any, arg: string): Promise<void> {
  const mode = arg.toLowerCase();
  const fromId = msg.from.id;
  let rows: TaskRow[] = [];
  let header = "📋 <b>تسک‌های بازِ تو:</b>";

  if (mode.startsWith("creat")) {
    rows = await listTasks(env, { creator: fromId, status: "open" });
    header = "📋 <b>تسک‌هایی که خودت ساختی (باز):</b>";
  } else if (mode.startsWith("done")) {
    rows = await listTasks(env, { assignee: fromId, status: "done" });
    header = "🏆 <b>تسک‌های تمام‌شده‌ی تو:</b>";
  } else if (mode.startsWith("all")) {
    rows = await listTasks(env, { involved: fromId });
    header = "🗂 <b>همه‌ی تسک‌های مرتبط با تو:</b>";
  } else {
    rows = await listTasks(env, { assignee: fromId, status: "open" });
  }

  if (!rows.length) {
    await sendMessage(
      env,
      msg.chat.id,
      "🎉 همین الان تسکی نداری! یا با «احمق این تسک رو ایجاد کن: …» یکی بساز، یا برو از زندگی لذت ببر 😄"
    );
    return;
  }

  const lines = rows.map(
    (t) =>
      `${STATUS_EMOJI[t.status]} <b>${faDigits(t.id)}</b> — ${escapeHtml(truncate(t.title, 60))}` +
      (t.due_date ? ` (تا ${fmtDate(t.due_date)})` : "")
  );
  await sendMessage(env, msg.chat.id, `${header}\n\n${lines.join("\n")}\n\n🔍 جزئیات: /task &lt;شناسه&gt;`);
}

async function sendTaskInfo(env: Env, msg: any, arg: string): Promise<void> {
  const id = Number(enDigits(arg.split(/\s+/)[0] || ""));
  if (!id) {
    await sendMessage(env, msg.chat.id, "بگو کدوم تسک؟ مثلاً: /task 12");
    return;
  }
  const task = await getTask(env, id);
  if (!task) {
    await sendMessage(env, msg.chat.id, `❌ تسکی با شناسه‌ی ${faDigits(id)} پیدا نشد.`);
    return;
  }
  const creator = await getUser(env, task.creator_id);
  const assignee = await getUser(env, task.assignee_id);
  await sendMessage(env, msg.chat.id, taskCard(task, creator, assignee), {
    reply_markup: statusKeyboard(task),
  });
}

// ============================================================
// تغییر وضعیت
// ============================================================

async function cmdSetStatus(env: Env, msg: any, arg: string): Promise<void> {
  // وضعیت می‌تواند چندکلمه‌ای باشد: «در حال انجام»، «شروع نشده»
  const m = enDigits(arg).match(/^(\d+)\s+(.+)$/);
  if (!m) {
    await sendMessage(
      env,
      msg.chat.id,
      `📝 شکل درست: <code>/status &lt;شناسه&gt; &lt;وضعیت&gt;</code>

وضعیت‌های مجاز:
• not_started (شروع نشده)
• in_progress (در حال انجام)
• done (تمام)`
    );
    return;
  }
  const id = Number(m[1]);
  const status = parseStatus(m[2]);
  if (!status) {
    await sendMessage(
      env,
      msg.chat.id,
      "وضعیت رو نفهمیدم! مجازها: not_started / in_progress / done (یا معادل فارسی‌شون)"
    );
    return;
  }
  const task = await getTask(env, id);
  if (!task) {
    await sendMessage(env, msg.chat.id, `❌ تسکی با شناسه‌ی ${faDigits(id)} پیدا نشد.`);
    return;
  }
  if (msg.from.id !== task.assignee_id && msg.from.id !== task.creator_id) {
    await sendMessage(env, msg.chat.id, "این تسک رو فقط مسئولش یا سازنده‌ش می‌تونه تغییر بده 😐");
    return;
  }
  if (status === task.status) {
    await sendMessage(env, msg.chat.id, `وضعیت تسک ${faDigits(id)} همین الان هم «${STATUS_LABEL[status]}» است 🙂`);
    return;
  }
  const updated = await updateTaskStatus(env, id, status);
  await sendMessage(
    env,
    msg.chat.id,
    `🚦 وضعیت تسک ${faDigits(id)} الان «${STATUS_LABEL[status]}» است ${STATUS_EMOJI[status]}`
  );
  await notifyCounterpart(env, updated!, msg.from, status);
}

// ============================================================
// واگذاری و حذف
// ============================================================

async function cmdAssign(env: Env, msg: any, arg: string): Promise<void> {
  const m = arg.match(/^(\S+)\s+(.+)$/);
  if (!m) {
    await sendMessage(env, msg.chat.id, "شکل درست: /assign &lt;شناسه&gt; @یوزرنیم (یا اسم)");
    return;
  }
  const id = Number(enDigits(m[1]));
  const task = await getTask(env, id);
  if (!task) {
    await sendMessage(env, msg.chat.id, `❌ تسکی با شناسه‌ی ${faDigits(id)} پیدا نشد.`);
    return;
  }
  if (msg.from.id !== task.creator_id && msg.from.id !== task.assignee_id) {
    await sendMessage(env, msg.chat.id, "این تسک رو فقط سازنده‌ش یا مسئولش می‌تونه واگذار کنه 😐");
    return;
  }
  const name = m[2].trim();
  const lower = name.replace(/^@/, "").toLowerCase();
  const target = (await findUserByUsername(env, lower)) ?? (await findUserByName(env, name));
  if (!target) {
    await sendMessage(
      env,
      msg.chat.id,
      `«${escapeHtml(name)}» بین کاربرهای بات پیدا نشد.\nاون نفر باید اول یک بار با بات حرف بزنه (مثلاً /start بزنه) تا بشناسمش.`
    );
    return;
  }
  await assignTask(env, id, target.user_id);
  const updated = (await getTask(env, id))!;
  const creator = await getUser(env, updated.creator_id);
  await sendMessage(
    env,
    msg.chat.id,
    `👷 مسئول تسک ${faDigits(id)} الان ${displayName(target)} است ✅\n\n${taskCard(updated, creator, target)}`,
    { reply_markup: statusKeyboard(updated) }
  );
  if (target.chat_id && target.user_id !== msg.from.id) {
    await sendMessage(
      env,
      target.chat_id,
      `👷 تسک «${escapeHtml(truncate(updated.title, 60))}» به تو واگذار شد:\n\n${taskCard(updated, creator, target)}`,
      { reply_markup: statusKeyboard(updated) }
    );
  }
}

async function cmdDelete(env: Env, msg: any, arg: string): Promise<void> {
  const id = Number(enDigits(arg.split(/\s+/)[0] || ""));
  if (!id) {
    await sendMessage(env, msg.chat.id, "شکل درست: /delete &lt;شناسه&gt;");
    return;
  }
  const task = await getTask(env, id);
  if (!task) {
    await sendMessage(env, msg.chat.id, `❌ تسکی با شناسه‌ی ${faDigits(id)} پیدا نشد.`);
    return;
  }
  if (msg.from.id !== task.creator_id && msg.from.id !== task.assignee_id) {
    await sendMessage(env, msg.chat.id, "این تسک رو فقط سازنده‌ش یا مسئولش می‌تونه حذف کنه 😐");
    return;
  }
  await deleteTaskById(env, id);
  await sendMessage(
    env,
    msg.chat.id,
    `🗑 تسک ${faDigits(id)} («${escapeHtml(truncate(task.title, 60))}») حذف شد.`
  );
}


// ============================================================
// کوئری ادمین: «تسک‌های علی چیا هستن؟»
// ============================================================

async function cmdUserTasksQuery(env: Env, msg: any, ref: string): Promise<void> {
  const me = await getUser(env, msg.from.id);
  if (me?.role !== "admin") {
    await sendMessage(env, msg.chat.id, "فقط ادمین می‌تونه تسک‌های بقیه رو ببینه 👑");
    return;
  }
  const clean = ref.replace(/^@/, "").trim();
  let target: UserRow | null = await findUserByUsername(env, clean.toLowerCase());
  if (!target) target = await findUserByName(env, clean);
  if (!target) {
    await sendMessage(env, msg.chat.id, `🤔 کاربری به نام «${escapeHtml(clean)}» پیدا نشد. با /menu ← 👥 کاربرها لیست را ببین.`);
    return;
  }
  await sendUserTasksAdmin(env, msg.chat.id, target.user_id);
}

async function sendUserTasksAdmin(env: Env, chatId: number, userId: number): Promise<void> {
  const target = await getUser(env, userId);
  const rows = await env.DB.prepare(
    "SELECT * FROM tasks WHERE assignee_id = ? ORDER BY id DESC LIMIT 30"
  )
    .bind(userId)
    .all<TaskRow>();
  const tasks = (rows.results ?? []).sort(byNearestDeadline);
  const name = target ? displayName(target) : "؟";
  if (!tasks.length) {
    await sendMessage(env, chatId, `👤 <b>${escapeHtml(name)}</b> هنوز تسکی نداره.`);
    return;
  }
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const lines = open.map((t) => {
    const dueMs = t.due_at ? Date.parse(t.due_at) : t.due_date ? endOfDayMs(t.due_date) : Infinity;
    const left = dueMs === Infinity ? "بدون ددلاین" : humanizeFa(dueMs);
    return `${STATUS_EMOJI[t.status]} ${escapeHtml(truncate(t.title, 40))} — ${left} ${t.due_date ? `(${fmtDate(t.due_date)})` : ""}`;
  });
  const nearest = open[0]
    ? `\n\n⏰ <b>نزدیک‌ترین ددلاین:</b> «${escapeHtml(truncate(open[0].title, 40))}» — ${humanizeFa(open[0].due_at ? Date.parse(open[0].due_at) : endOfDayMs(open[0].due_date ?? ""))}`
    : "";
  await sendMessage(
    env,
    chatId,
    `👤 تسک‌های <b>${escapeHtml(name)}</b>:\n\n${lines.join("\n") || "(باز نداره)"}${
      done.length ? `\n\n✅ ${faDigits(done.length)} تسک هم تمام کرده.` : ""
    }${nearest}`
  );
}

function byNearestDeadline(a: TaskRow, b: TaskRow): number {
  const f = (t: TaskRow) => (t.due_at ? Date.parse(t.due_at) : t.due_date ? endOfDayMs(t.due_date) : Infinity);
  return f(a) - f(b);
}

// ============================================================
// خروجی گزارشی (HTML / PDF)
// ============================================================

async function cmdExport(env: Env, msg: any): Promise<void> {
  const me = await getUser(env, msg.from.id);
  if (me?.role === "admin") {
    // 👑 ادمین: اول بپرس برای کی؟
    await sendMessage(env, msg.chat.id, "📊 گزارش برای کی می‌خوای؟", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🧑 خودم", callback_data: "exp|me|0" }, { text: "👤 کاربر خاص…", callback_data: "exp|pick|0" }],
          [{ text: "👥 همه‌ی کاربرها", callback_data: "exp|all|0" }],
        ],
      },
    });
  } else {
    await sendExportStyleKeyboard(env, msg.chat.id, "me", 0, "📊 گزارشت رو با چه شکلی می‌خوای؟");
  }
}

/** کیبورد انتخاب شکل خروجی: لیستی / گزارش / داشبورد */
async function sendExportStyleKeyboard(env: Env, chatId: number, scope: string, uid: number, header: string): Promise<void> {
  await sendMessage(env, chatId, header, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📋 لیستی (جدول)", callback_data: `exp|${scope}|${uid}|list` },
          { text: "📄 گزارش‌طور", callback_data: `exp|${scope}|${uid}|report` },
          { text: "📊 داشبورد", callback_data: `exp|${scope}|${uid}|dash` },
        ],
      ],
    },
  });
}

async function doExport(env: Env, fromId: number, chatId: number, scope: string, uid: number, style: string): Promise<void> {
  try {
    const me = await getUser(env, fromId);
    const st = (["list", "report", "dash"].includes(style) ? style : "report") as ExportStyle;
    let tasks: TaskRow[];
    let scopeName: string;
    let usersInfo: { id: number; name: string }[] | undefined;
    if (scope === "usr") {
      const target = await getUser(env, uid);
      if (!target) {
        await sendMessage(env, chatId, "کاربر پیدا نشد.");
        return;
      }
      tasks = await listTasks(env, { assignee: uid });
      scopeName = displayName(target);
    } else if (scope === "all") {
      const rows = await env.DB.prepare(
        "SELECT user_id, alias, first_name, username FROM users ORDER BY updated_at DESC LIMIT 100"
      ).all<{ user_id: number; alias: string | null; first_name: string | null; username: string | null }>();
      usersInfo = (rows.results ?? []).map((u) => ({ id: u.user_id, name: userLabel(u) }));
      tasks = await listTasks(env, {});
      scopeName = "همه‌ی کاربرها";
    } else {
      tasks = await listTasks(env, { involved: fromId });
      scopeName = displayName(me);
    }
    const model = buildReportModel(tasks, scopeName, usersInfo);
    const html = buildHtmlReport(model, st);
    const name =
      scope === "all"
        ? "all-users"
        : scopeName.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 24) || `user-${uid}`;
    await sendDocument(
      env,
      chatId,
      html,
      `tasks-${name}-${st}.html`,
      "text/html; charset=utf-8",
      `📊 ${STYLE_LABEL[st]} — ${scopeName} (${faDigits(model.total)} تسک) — تو مرورگر باز کن`
    );
  } catch (err) {
    console.error("[export] failed:", err);
    await sendMessage(env, chatId, "❌ ساخت خروجی با خطا مواجه شد. دوباره امتحان کن.");
  }
}

// ============================================================
// /edit — ویرایش فیلدهای تسک
// ============================================================

const EDIT_USAGE = `<b>✏️ ویرایش تسک</b>

شکل: <code>/edit &lt;شناسه&gt; &lt;فیلد&gt;: &lt;مقدار&gt;</code>

فیلدهای مجاز:
• <b>عنوان</b> — <code>/edit 12 عنوان: خرید نون</code>
• <b>توضیح</b> — <code>/edit 12 توضیح: از نانوایی سر کوچه</code>
• <b>مسئول</b> — <code>/edit 12 مسئول: علی</code> یا <code>/edit 12 مسئول: خودم</code>
• <b>شروع</b> — <code>/edit 12 شروع: شنبه ساعت ۸ صبح</code>
• <b>پایان</b> — <code>/edit 12 پایان: فردا ۱۲ ظهر</code> (یا: ۱۵ مهر)
• <b>وضعیت</b> — <code>/edit 12 وضعیت: در حال انجام</code>`;

async function cmdEdit(env: Env, msg: any, arg: string): Promise<void> {
  const parts = arg.trim().split(/\s+/);
  const id = Number(enDigits(parts[0] || ""));
  const restRaw = arg.trim().slice((parts[0] || "").length).trim();
  if (!id || !restRaw) {
    await sendMessage(env, msg.chat.id, EDIT_USAGE);
    return;
  }

  // «فیلد: مقدار» یا «فیلد مقدار» (بدون دونقطه)
  const colon = restRaw.search(/[:：]/);
  let fieldRaw: string;
  let value: string;
  if (colon >= 0) {
    fieldRaw = restRaw.slice(0, colon);
    value = restRaw.slice(colon + 1).trim();
  } else {
    const vp = restRaw.split(/\s+/);
    fieldRaw = vp[0] || "";
    value = vp.slice(1).join(" ");
  }
  const field = normalizeEditField(fieldRaw);
  if (!field || !value.trim()) {
    await sendMessage(env, msg.chat.id, EDIT_USAGE);
    return;
  }

  const task = await getTask(env, id);
  if (!task) {
    await sendMessage(env, msg.chat.id, `❌ تسکی با شناسه‌ی ${faDigits(id)} پیدا نشد.`);
    return;
  }
  if (msg.from.id !== task.creator_id && msg.from.id !== task.assignee_id) {
    await sendMessage(env, msg.chat.id, "این تسک رو فقط سازنده‌ش یا مسئولش می‌تونه ویرایش کنه 😐");
    return;
  }

  const r = await resolveFieldUpdate(env, task, field, value, msg.from.id);
  if (!r.ok) {
    await sendMessage(env, msg.chat.id, r.error);
    return;
  }

  const updated = await setTaskFields(env, id, r.updates);
  if (!updated) {
    await sendMessage(env, msg.chat.id, "❌ خطا در ذخیره‌ی تغییرات.");
    return;
  }
  const creator = await getUser(env, updated.creator_id);
  const assignee = await getUser(env, updated.assignee_id);
  await sendMessage(
    env,
    msg.chat.id,
    `✏️ ✅ ${r.note}\n\n${taskCard(updated, creator, assignee)}`,
    { reply_markup: statusKeyboard(updated) }
  );
}

/**
 * منطقِ مشترکِ «فیلد + مقدار» — هم /edit استفاده می‌کند هم ویرایشِ زبانی.
 * خروجی: {ok:true, updates, note} یا {ok:false, error}
 */
async function resolveFieldUpdate(
  env: Env,
  task: TaskRow,
  field: string,
  value: string,
  editorId: number
): Promise<{ ok: true; updates: Record<string, string | number | null>; note: string } | { ok: false; error: string }> {
  const updates: Record<string, string | number | null> = {};
  let note = "";
  const today = todayTehranISO();

  switch (field) {
    case "title":
      updates.title = value.trim();
      note = "عنوان عوض شد.";
      break;
    case "description":
      updates.description = value.trim();
      note = "توضیح عوض شد.";
      break;
    case "assignee": {
      const { user, note: assignNote } = await resolveAssignee(env, value, editorId);
      updates.assignee_id = user.user_id;
      note = `مسئول جدید: ${escapeHtml(displayName(user))}`;
      if (assignNote) note += `\n${assignNote}`;
      break;
    }
    case "start": {
      const dt = parseRelativeFaDateTime(value, today);
      const date = dt.date || (dt.time ? task.start_date || today : "");
      if (!date) {
        return { ok: false, error: "🤔 تاریخ شروع رو نفهمیدم! مثلاً: «شنبه»، «۱۵ مهر» یا «فردا ساعت ۸ صبح»." };
      }
      const start_at = dt.time ? `${date}T${dt.time}:00+03:30` : null;
      const future = (start_at !== null && Date.parse(start_at) > Date.now()) || date > today;
      updates.start_date = date;
      updates.start_at = start_at;
      // اگر شروع هنوز نرسیده و تسک شروع‌نشده است، شروعِ خودکار دوباره مسلح می‌شود
      updates.auto_start = future && task.status === "not_started" ? 1 : 0;
      note = "زمان شروع آپدیت شد." + (future && task.status === "not_started" ? " ⏱ شروع خودکار فعال شد." : "");
      break;
    }
    case "due": {
      const deadline = await resolveDeadlineFromText(env, value);
      if (!deadline) {
        return { ok: false, error: "🤔 تاریخ پایان رو نفهمیدم! مثلاً: «فردا»، «پنجشنبه»، «۱۵ مهر» یا «فردا ساعت ۵ عصر»." };
      }
      updates.due_date = deadline.date;
      updates.due_at = deadline.time ? `${deadline.date}T${deadline.time}:00+03:30` : null;
      // یادآوری‌ها از نو شروع بشن (برای الگوی داینامیک null تا قواعد خودش حاکم باشد)
      updates.last_reminded_at =
        task.reminder_type && task.reminder_type !== "default" ? null : new Date().toISOString();
      updates.reminder_count = 0;
      note = "زمان پایان آپدیت شد.";
      break;
    }
    case "status": {
      const st = parseStatus(value.replace(/[\s_]/g, "-"));
      if (!st) {
        return { ok: false, error: "🤔 وضعیت رو نفهمیدم! مجازها: not_started / in_progress / done (یا معادل فارسی‌شون)" };
      }
      updates.status = st;
      if (st === "done") updates.completed_at = new Date().toISOString();
      if (st === "in_progress" && !task.started_at) updates.started_at = new Date().toISOString();
      note = "وضعیت عوض شد.";
      break;
    }
    case "reminder": {
      // «نکن» به‌تنهایی کلمه‌ی کلیدی ندارد — فیلد را کنارش می‌گذاریم تا پارسر بفهمد
      const spec = parseReminderSpec(
        /^(نکن|خاموش|خاموشش\s*کن|none|off|نباش)$/i.test(value.trim()) ? "یادآوری نکن" : value,
        todayTehranISO()
      );
      if (!spec) {
        return {
          ok: false,
          error: "🤔 الگوی یادآوری رو نفهمیدم! مثلاً:\n• هر روز ساعت ۸ صبح\n• هر ۳ ساعت\n• ۱ ساعت قبل از ددلاین\n• نکن",
        };
      }
      updates.reminder_type = spec.type;
      updates.reminder_time = spec.time;
      updates.reminder_interval_hours = spec.interval_hours;
      updates.reminder_lead_minutes = spec.lead_minutes;
      updates.reminder_at = spec.at;
      updates.reminder_done = 0;
      // الگوی داینامیک: قواعد خودش (هرروز/هرNساعت/...) ملاک است نه آخرین ارسال
      updates.last_reminded_at = null;
      updates.reminder_count = 0;
      const rt2 = reminderSpecText({
        reminder_type: spec.type,
        reminder_time: spec.time,
        reminder_interval_hours: spec.interval_hours,
        reminder_lead_minutes: spec.lead_minutes,
        reminder_at: spec.at,
      });
      note = `🔔 یادآوری جدید: ${rt2 ?? "خاموش"}`;
      break;
    }
    default:
      return { ok: false, error: EDIT_USAGE };
  }
  return { ok: true, updates, note };
}

/** اعمال ویرایش زبانی + کارت نتیجه (+ خبر به طرف مقابل برای تغییر وضعیت) */
async function applyTaskFieldEdit(env: Env, msg: any, task: TaskRow, field: string, value: string): Promise<void> {
  const r = await resolveFieldUpdate(env, task, field, value, msg.from.id);
  if (!r.ok) {
    await sendMessage(env, msg.chat.id, r.error);
    return;
  }
  const updated = await setTaskFields(env, task.id, r.updates);
  if (!updated) {
    await sendMessage(env, msg.chat.id, "❌ خطا در ذخیره‌ی تغییرات.");
    return;
  }
  if (field === "status") {
    await notifyCounterpart(env, updated, { id: msg.from.id }, updated.status);
  }
  const creator = await getUser(env, updated.creator_id);
  const assignee = await getUser(env, updated.assignee_id);
  await sendMessage(
    env,
    msg.chat.id,
    `✏️ ✅ ${r.note}\n\n${taskCard(updated, creator, assignee)}`,
    { reply_markup: statusKeyboard(updated) }
  );
}


// ============================================================
// 🗑 حذف · ✏️ ویرایش زبانی · ⏰ نزدیک‌ترین ددلاین
// ============================================================

const isMine = (t: TaskRow, userId: number) => t.creator_id === userId || t.assignee_id === userId;

/** تطبیق ارجاع با عنوان — نیم‌فاصله و فاصله یکسان فرض می‌شوند */
const titleMatches = (title: string, ref: string) => {
  const norm = (x: string) => x.replace(/\u200c/g, "");
  return norm(title).includes(norm(ref)) || title.includes(ref);
};

/** حذف — از مسیر AI یا هیوریستیک: «همه تسک‌هامو حذف کن» / «تسک گزارش رو حذف کن» */
async function cmdDeleteTasks(env: Env, msg: any, parsed: ParsedTask): Promise<void> {
  const ref = (parsed.task_ref || "").trim();
  const idNum = /^\d{1,6}$/.test(enDigits(ref)) ? Number(enDigits(ref)) : null;

  if (idNum || ref) {
    let candidates: TaskRow[] = [];
    if (idNum) {
      const t = await getTask(env, idNum);
      if (t && isMine(t, msg.from.id)) candidates = [t];
    } else {
      const rows = await listTasks(env, { involved: msg.from.id, status: "open" });
      candidates = rows.filter((t) => titleMatches(t.title, ref));
    }
    if (!candidates.length) {
      await sendMessage(env, msg.chat.id, "🤔 تسکی با این مشخصات پیدا نکردم. با «تسک‌هامو نشون بده» لیست رو ببین.");
      return;
    }
    if (candidates.length === 1) {
      const t = candidates[0];
      await sendMessage(env, msg.chat.id, `🗑 تسک «${escapeHtml(truncate(t.title, 60))}» رو حذف کنم؟ برنمی‌گرده!`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "آره، حذفش کن 🗑", callback_data: `del|${t.id}` }, { text: "نه ❌", callback_data: "noop" }],
          ],
        },
      });
      return;
    }
    const kb = candidates.slice(0, 10).map((t) => [{ text: `🗑 ${truncate(t.title, 30)}`, callback_data: `del|${t.id}` }]);
    await sendMessage(env, msg.chat.id, "کدوم‌شون؟", { reply_markup: { inline_keyboard: kb } });
    return;
  }

  // همه‌ی بازها یا فقط تموم‌شده‌ها
  const scope = parsed.delete_scope === "done" ? "done" : "all";
  const rows = await listTasks(env, { involved: msg.from.id, status: scope === "done" ? "done" : "open" });
  if (!rows.length) {
    await sendMessage(env, msg.chat.id, scope === "done" ? "تموم‌شده‌ای نداری 🎉" : "تسکِ بازی نداری که حذف کنم 🎉");
    return;
  }
  await sendMessage(
    env,
    msg.chat.id,
    `🗑 ${faDigits(rows.length)} تا تسک${scope === "done" ? "ِ تموم‌شده" : "ِ باز"}ت رو یکجا حذف کنم؟ این کار برنمی‌گرده!`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: `آره، همه‌شون رو حذف کن 🗑`, callback_data: `delq|${scope}` }, { text: "نه ❌", callback_data: "noop" }],
        ],
      },
    }
  );
}

function askEditValue(env: Env, chatId: number, task: TaskRow): Promise<void> {
  return sendMessage(
    env,
    chatId,
    `✏️ تسک «${escapeHtml(truncate(task.title, 60))}» پیدا شد. <b>چی عوض بشه؟</b> مثلاً:\n• عنوان: …\n• توضیحات: …\n• پایان: فردا ساعت ۵\n• شروع: شنبه\n• وضعیت: تموم\n• یادآوری: هر روز ساعت ۸\n• مسئول: علی\n\n(لغو: بی‌خیال)`
  );
}

/** ویرایش — «تسک گزارش رو ویرایش کن، عنوانش بشه …» */
async function cmdUpdateTask(env: Env, msg: any, parsed: ParsedTask): Promise<void> {
  const ref = (parsed.task_ref || "").trim();
  const field = normalizeEditField(parsed.update_field || "");
  const value = (parsed.update_value || "").trim();
  const idNum = /^\d{1,6}$/.test(enDigits(ref)) ? Number(enDigits(ref)) : null;

  let candidates: TaskRow[] = [];
  if (idNum) {
    const t = await getTask(env, idNum);
    if (t && isMine(t, msg.from.id)) candidates = [t];
  } else if (ref) {
    const rows = await listTasks(env, { involved: msg.from.id, status: "open" });
    candidates = rows.filter((t) => titleMatches(t.title, ref));
  } else {
    candidates = await listTasks(env, { involved: msg.from.id, status: "open" });
  }

  if (!candidates.length) {
    await sendMessage(env, msg.chat.id, "🤔 تسکی برای ویرایش پیدا نکردم. اول بسازش یا لیست رو ببین: «تسک‌هامو نشون بده».");
    return;
  }
  if (candidates.length > 1) {
    const kb = candidates.slice(0, 10).map((t) => [{ text: `✏️ ${truncate(t.title, 30)}`, callback_data: `upd|${t.id}` }]);
    await sendMessage(env, msg.chat.id, "کدوم تسک؟", { reply_markup: { inline_keyboard: kb } });
    return;
  }
  const task = candidates[0];
  if (field && value) {
    await applyTaskFieldEdit(env, msg, task, field, value);
    return;
  }
  await savePendingEdit(env, msg.from.id, task.id, msg.chat.id);
  await askEditValue(env, msg.chat.id, task);
}

/** جوابِ زبانی کاربر به «چی عوض بشه؟» */
async function tryPendingEditReply(env: Env, msg: any, text: string): Promise<boolean> {
  const pe = await getPendingEdit(env, msg.from.id);
  if (!pe) return false;
  if (Date.now() - Date.parse(pe.created_at) > PENDING_TTL_MS) {
    await deletePendingEdit(env, msg.from.id);
    return false;
  }
  const clean = text.replace(/\u200c/g, " ").trim();
  if (CANCEL_RE.test(clean)) {
    await deletePendingEdit(env, msg.from.id);
    await sendMessage(env, msg.chat.id, "👌 باشه، ویرایش بی‌خیال.");
    return true;
  }
  const task = await getTask(env, pe.task_id);
  if (!task || !isMine(task, msg.from.id)) {
    await deletePendingEdit(env, msg.from.id);
    await sendMessage(env, msg.chat.id, "این تسک دیگه در دسترس نیست.");
    return true;
  }
  // «فیلد: مقدار» یا «فیلد مقدار»
  const colon = clean.search(/[:：]/);
  let fieldRaw: string;
  let value: string;
  if (colon >= 0) {
    fieldRaw = clean.slice(0, colon);
    value = clean.slice(colon + 1).trim();
  } else {
    const vp = clean.split(/\s+/);
    fieldRaw = vp[0] || "";
    value = vp.slice(1).join(" ");
  }
  const field = normalizeEditField(fieldRaw);
  if (!field || !value) {
    await sendMessage(
      env,
      msg.chat.id,
      "🤔 نفهمیدم! اینجوری بگو: «عنوان: گزارش جدید» یا «یادآوری: هر روز ساعت ۸»\n(لغو: بی‌خیال)"
    );
    return true;
  }
  await deletePendingEdit(env, msg.from.id);
  await applyTaskFieldEdit(env, msg, task, field, value);
  return true;
}

/** ⏰ «کدوم تسکم به ددلاین نزدیک‌تره؟» */
async function cmdNearestDeadline(env: Env, msg: any): Promise<void> {
  const rows = (await listTasks(env, { involved: msg.from.id, status: "open" })).sort(byNearestDeadline);
  if (!rows.length) {
    await sendMessage(env, msg.chat.id, "تسکِ بازی نداری 🎉");
    return;
  }
  const lines = rows.slice(0, 3).map((t, i) => {
    const dueMs = t.due_at ? Date.parse(t.due_at) : t.due_date ? endOfDayMs(t.due_date) : Infinity;
    const left = dueMs === Infinity ? "بدون ددلاین" : humanizeFa(dueMs);
    const when = t.due_date
      ? ` (${fmtDate(t.due_date)}${t.due_at ? ` ساعت ${faDigits(t.due_at.slice(11, 16))}` : ""})`
      : "";
    const name = `«${escapeHtml(truncate(t.title, 40))}» — ${left}${when}`;
    return i === 0 ? `⏰ <b>${name}</b>` : `• ${name}`;
  });
  const more = rows.length > 3 ? `\n\nو ${faDigits(rows.length - 3)} تسک دیگر…` : "";
  await sendMessage(env, msg.chat.id, `⏰ <b>نزدیک‌ترین ددلاین‌های تو:</b>\n\n${lines.join("\n")}${more}`);
}

// ============================================================
// دکمه‌های شیشه‌ای (تغییر وضعیت از روی کارت تسک)
// ============================================================

async function onCallbackQuery(env: Env, cq: any): Promise<void> {
  const from = cq?.from;
  const msg = cq?.message;
  if (!from || !msg) {
    if (cq?.id) await answerCallbackQuery(env, cq.id, "؟");
    return;
  }
  if (msg.chat?.type === "private") await upsertUser(env, from, msg.chat.id);

  const parts = String(cq.data || "").split("|");

  // 🚪 دکمه‌های ورود/ثبت‌نام
  if (parts[0] === "auth" && parts.length === 2) {
    if (await isAuthed(env, from.id)) {
      await answerCallbackQuery(env, cq.id, "تو که همین الان هم داخل هستی 🙂");
      const meA = await getUser(env, from.id);
      await sendMessage(env, msg.chat.id, "😄", { reply_markup: mainKeyboard(meA?.role === "admin") });
      return;
    }
    const mode = parts[1] === "reg" ? "register" : "login";
    await savePendingAuth(env, from.id, msg.chat.id, mode, "username", "");
    await answerCallbackQuery(env, cq.id, "⏳");
    await sendMessage(
      env,
      msg.chat.id,
      mode === "register"
        ? "📝 👤 <b>یوزرنیم</b> خود را وارد کن (لاتین/عدد، ۳ تا ۳۲ کاراکتر):"
        : "🔑 👤 <b>یوزرنیم</b> خود را وارد کن:"
    );
    return;
  }

  // 🎴 باز کردن کارت تسک از پیام یادآوری
  if (parts[0] === "card" && parts.length === 2) {
    const task = await getTask(env, Number(enDigits(parts[1])));
    if (!task) {
      await answerCallbackQuery(env, cq.id, "این تسک حذف شده ❌");
      return;
    }
    await answerCallbackQuery(env, cq.id, "⏳");
    const creator = await getUser(env, task.creator_id);
    const assignee = await getUser(env, task.assignee_id);
    const edited = await editMessageText(env, msg.chat.id, msg.message_id, taskCard(task, creator, assignee), {
      reply_markup: statusKeyboard(task),
    });
    if (!edited?.ok) {
      // پیامِ یادآوری قابل ویرایش نبود (مثلاً خیلی قدیمی) → کارت جدا ارسال می‌شود
      await sendMessage(env, msg.chat.id, taskCard(task, creator, assignee), {
        reply_markup: statusKeyboard(task),
      });
    }
    return;
  }

  // 🚪 خروج از حساب (تأییدِ دکمه‌ی منو)
  if (parts[0] === "out" && parts.length === 2) {
    if (parts[1] === "yes") {
      await setLoggedIn(env, from.id, false);
      await deletePendingTask(env, from.id);
      await deletePendingEdit(env, from.id);
      await deletePendingPick(env, from.id);
      await answerCallbackQuery(env, cq.id, "🚪 خارج شدی");
      await sendMessage(
        env,
        msg.chat.id,
        "🚪 از حسابت خارج شدی.\nثبت‌نامت پابرجاست — با «ورود» و همان یوزرنیم/رمز برمی‌گردی."
      );
      await sendAuthWelcome(env, msg.chat.id);
    } else {
      await answerCallbackQuery(env, cq.id, "🙂 پس هیچی");
      const me2 = await getUser(env, from.id);
      await sendMessage(env, msg.chat.id, "👌 حسابت باز مونده.", { reply_markup: mainKeyboard(me2?.role === "admin") });
    }
    return;
  }

  // 🗑 حذف کاربر (ادمین): انتخاب → تأیید
  if (parts[0] === "delu" && parts.length === 2) {
    const requester = await getUser(env, from.id);
    if (requester?.role !== "admin") {
      await answerCallbackQuery(env, cq.id, "فقط ادمین 👑");
      return;
    }
    if (Number(parts[1]) === from.id) {
      await answerCallbackQuery(env, cq.id, "خودت رو نمی‌تونی حذف کنی 🙂");
      return;
    }
    const target = await getUser(env, Number(parts[1]));
    if (!target) {
      await answerCallbackQuery(env, cq.id, "کاربر پیدا نشد");
      return;
    }
    await answerCallbackQuery(env, cq.id, "⏳");
    const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM tasks WHERE assignee_id = ? OR creator_id = ?").bind(target.user_id, target.user_id).first<{ n: number }>())?.n ?? 0;
    await sendMessage(
      env,
      msg.chat.id,
      `🗑 کاربر <b>${displayName(target)}</b>${target.role === "admin" ? " (ادمین 👑)" : ""} و <b>${faDigits(n)}</b> تسکِش برای همیشه حذف بشه؟ برنمی‌گرده!`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "آره، حذفش کن 🗑", callback_data: `deluok|${target.user_id}` }, { text: "نه ❌", callback_data: "noop" }],
          ],
        },
      }
    );
    return;
  }
  if (parts[0] === "deluok" && parts.length === 2) {
    const requester = await getUser(env, from.id);
    if (requester?.role !== "admin") {
      await answerCallbackQuery(env, cq.id, "فقط ادمین 👑");
      return;
    }
    if (Number(parts[1]) === from.id) {
      await answerCallbackQuery(env, cq.id, "خودت رو نمی‌تونی حذف کنی 🙂");
      return;
    }
    const target = await getUser(env, Number(parts[1]));
    const n = await deleteUser(env, Number(parts[1]));
    await answerCallbackQuery(env, cq.id, "🗑 حذف شد");
    await sendMessage(
      env,
      msg.chat.id,
      `🗑 کاربر ${target ? `<b>${displayName(target)}</b>` : ""} و ${faDigits(n)} تسکِش حذف شد.`
    );
    return;
  }

  // 🤔 رفع ابهامِ هم‌نام‌ها: asp|<user_id> — متن تسک ذخیره شده، الان می‌سازیم
  if (parts[0] === "asp" && parts.length === 2) {
    const requester = await getUser(env, from.id);
    if (requester?.role !== "admin") {
      await answerCallbackQuery(env, cq.id, "فقط ادمین 👑");
      return;
    }
    const pp = await getPendingPick(env, from.id);
    if (!pp || !pp.text) {
      await answerCallbackQuery(env, cq.id, "دیگه چیزی برای ساخت نمونده 🤷");
      return;
    }
    const target = await getUser(env, Number(parts[1]));
    if (!target) {
      await answerCallbackQuery(env, cq.id, "کاربر پیدا نشد");
      return;
    }
    await deletePendingPick(env, from.id);
    await answerCallbackQuery(env, cq.id, `👤 ${target.first_name ?? "?"}`);
    // پیامِ کال‌بک فاقد from است — یک پیامِ معادل با فرستنده‌ی واقعی می‌سازیم
    const msg2 = { ...msg, from };
    await createTaskFromText(env, msg2, pp.text, undefined, target.user_id);
    return;
  }

  // 👤 انتخاب کاربر برای تسکِ جدید (مسیر «برای @»): asg0|<user_id>
  if (parts[0] === "asg0" && parts.length === 2) {
    const requester = await getUser(env, from.id);
    if (requester?.role !== "admin") {
      await answerCallbackQuery(env, cq.id, "فقط ادمین می‌تونه برای دیگه‌ها تسک بسازه 👑");
      return;
    }
    const target = await getUser(env, Number(parts[1]));
    if (!target) {
      await answerCallbackQuery(env, cq.id, "کاربر پیدا نشد");
      return;
    }
    await savePendingPick(env, from.id, msg.chat.id, target.user_id);
    await answerCallbackQuery(env, cq.id, `👤 ${target.first_name ?? "?"}`);
    await sendMessage(
      env,
      msg.chat.id,
      `👤 <b>${displayName(target)}</b> انتخاب شد.\n✍️ حالا تسک رو بنویس — مثلاً:\n«طراحی لوگو برای سایت، تا جمعه ساعت ۱۸»\n(لغو: بی‌خیال)`,
      { reply_markup: taskMenuKeyboard() }
    );
    return;
  }

  // ✏️ ویرایش از روی کارت تسک
  if (parts[0] === "edt" && parts.length === 2) {
    const task = await getTask(env, Number(enDigits(parts[1])));
    if (!task) {
      await answerCallbackQuery(env, cq.id, "این تسک حذف شده ❌");
      return;
    }
    if (!isMine(task, from.id)) {
      await answerCallbackQuery(env, cq.id, "این تسک مال تو نیست 😐");
      return;
    }
    await answerCallbackQuery(env, cq.id, "⏳");
    await savePendingEdit(env, from.id, task.id, msg.chat.id);
    await askEditValue(env, msg.chat.id, task);
    return;
  }

  // 🗑 حذف از روی کارت تسک → پیام تأیید
  if (parts[0] === "delx" && parts.length === 2) {
    const task = await getTask(env, Number(enDigits(parts[1])));
    if (!task) {
      await answerCallbackQuery(env, cq.id, "این تسک حذف شده ❌");
      return;
    }
    if (!isMine(task, from.id)) {
      await answerCallbackQuery(env, cq.id, "این تسک مال تو نیست 😐");
      return;
    }
    await answerCallbackQuery(env, cq.id, "⏳");
    await sendMessage(env, msg.chat.id, `🗑 تسک «${escapeHtml(truncate(task.title, 60))}» رو حذف کنم؟ برنمی‌گرده!`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "آره، حذفش کن 🗑", callback_data: `del|${task.id}` }, { text: "نه ❌", callback_data: "noop" }],
        ],
      },
    });
    return;
  }

  // 📊 خروجی جدید: exp|<scope>|<uid>[|<style>] — scope: me|usr|pick|all
  if (parts[0] === "exp") {
    const meE = await getUser(env, from.id);
    const isAdminE = meE?.role === "admin";
    const scope = parts[1] ?? "";
    const uid = Number(parts[2]) || 0;

    if (parts.length === 3) {
      if (scope === "pick") {
        if (!isAdminE) {
          await answerCallbackQuery(env, cq.id, "فقط ادمین 👑");
          return;
        }
        const rows = await env.DB.prepare(
          "SELECT user_id, alias, first_name, username FROM users ORDER BY updated_at DESC LIMIT 25"
        ).all<{ user_id: number; alias: string | null; first_name: string | null; username: string | null }>();
        const kb = (rows.results ?? []).map((u) => [
          { text: `👤 ${userLabel(u)}`, callback_data: `exp|usr|${u.user_id}` },
        ]);
        await answerCallbackQuery(env, cq.id, "⏳");
        await sendMessage(env, msg.chat.id, "کدوم کاربر؟", {
          reply_markup: { inline_keyboard: kb.length ? kb : [[{ text: "کاربری نیست", callback_data: "noop" }]] },
        });
        return;
      }
      if (scope === "all") {
        if (!isAdminE) {
          await answerCallbackQuery(env, cq.id, "فقط ادمین 👑");
          return;
        }
        await answerCallbackQuery(env, cq.id, "⏳");
        await sendExportStyleKeyboard(env, msg.chat.id, "all", 0, "📊 خروجیِ همه‌ی کاربرها با چه شکلی باشه؟");
        return;
      }
      if (scope === "usr") {
        if (!isAdminE) {
          await answerCallbackQuery(env, cq.id, "فقط ادمین 👑");
          return;
        }
        const target = await getUser(env, uid);
        await answerCallbackQuery(env, cq.id, "⏳");
        await sendExportStyleKeyboard(env, msg.chat.id, "usr", uid, `📊 گزارشِ ${displayName(target)} با چه شکلی باشه؟`);
        return;
      }
      // me
      await answerCallbackQuery(env, cq.id, "⏳");
      await sendExportStyleKeyboard(env, msg.chat.id, "me", 0, "📊 با چه شکلی می‌خوای؟");
      return;
    }

    if (parts.length === 4) {
      if ((scope === "usr" || scope === "all") && !isAdminE) {
        await answerCallbackQuery(env, cq.id, "فقط ادمین 👑");
        return;
      }
      await answerCallbackQuery(env, cq.id, "⏳ در حال ساخت گزارش...");
      const finalUid = scope === "usr" ? uid : from.id;
      await doExport(env, from.id, msg.chat.id, scope, finalUid, parts[3]);
      return;
    }
  }

  // سازگاری با دکمه‌های قدیمی: ex|<user_id>|<html|pdf>
  if (parts[0] === "ex" && parts.length === 3) {
    if (Number(parts[1]) !== from.id) {
      await answerCallbackQuery(env, cq.id, "این دکمه مال شما نیست 🙂");
      return;
    }
    if (parts[2] === "pdf") {
      await answerCallbackQuery(env, cq.id, "PDF حذف شد — سه شکل HTML داریم 🌐");
      await sendMessage(
        env,
        msg.chat.id,
        "📄 دیگه PDF نمی‌سازم — به‌جاش HTML با سه شکل داریم:\n📋 لیستی (جدول) · 📄 گزارش‌طور · 📊 داشبورد\nدوباره بگیر: 📊 گزارش"
      );
      return;
    }
    await answerCallbackQuery(env, cq.id, "⏳ در حال ساخت گزارش...");
    await doExport(env, from.id, msg.chat.id, "me", from.id, "list");
    return;
  }

  // تسک‌های یک کاربر (ادمین): usr|<user_id>
  if (parts[0] === "usr" && parts.length === 2) {
    const requester = await getUser(env, from.id);
    if (requester?.role !== "admin") {
      await answerCallbackQuery(env, cq.id, "فقط ادمین 👑");
      return;
    }
    await answerCallbackQuery(env, cq.id, "⏳");
    await sendUserTasksAdmin(env, msg.chat.id, Number(parts[1]));
    return;
  }

  // واگذاری مجدد تسک به کاربر انتخابی: asg|<task_id>|<user_id>
  if (parts[0] === "asg" && parts.length === 3) {
    const task = await getTask(env, Number(parts[1]));
    if (!task) {
      await answerCallbackQuery(env, cq.id, "این تسک حذف شده ❌");
      return;
    }
    if (from.id !== task.creator_id) {
      await answerCallbackQuery(env, cq.id, "فقط سازنده‌ی تسک می‌تونه انتخاب کنه");
      return;
    }
    const target = await getUser(env, Number(parts[2]));
    if (!target) {
      await answerCallbackQuery(env, cq.id, "کاربر پیدا نشد");
      return;
    }
    await setTaskFields(env, task.id, { assignee_id: target.user_id });
    await answerCallbackQuery(env, cq.id, `✅ مسئول شد: ${target.first_name ?? "?"}`);
    const creator = await getUser(env, task.creator_id);
    const updated = await getTask(env, task.id);
    if (updated) {
      await sendMessage(env, msg.chat.id, `👷 مسئول تسک ${faDigits(task.id)} الان <b>${escapeHtml(displayName(target))}</b> است.\n\n${taskCard(updated, creator, target)}`);
      if (target.chat_id && target.user_id !== from.id) {
        await sendMessage(
          env,
          target.chat_id,
          `${creator?.role === "admin" ? "👑" : "👷"} <b>${escapeHtml(displayName(creator))}</b> یه تسک برایت ساخت:\n\n${taskCard(updated, creator, target)}`,
          { reply_markup: statusKeyboard(updated) }
        );
      }
    }
    return;
  }

  // 🗑 حذف تک‌تسک: del|<taskId>
  if (parts[0] === "del" && parts.length === 2) {
    const task = await getTask(env, Number(enDigits(parts[1])));
    if (!task) {
      await answerCallbackQuery(env, cq.id, "این تسک حذف شده ❌");
      return;
    }
    if (!isMine(task, from.id)) {
      await answerCallbackQuery(env, cq.id, "این تسک مال تو نیست 😐");
      return;
    }
    await deleteTaskById(env, task.id);
    await answerCallbackQuery(env, cq.id, "🗑 حذف شد");
    await sendMessage(env, msg.chat.id, `🗑 تسک «${escapeHtml(truncate(task.title, 60))}» حذف شد.`);
    return;
  }

  // 🗑 حذف گروهی: delq|<all|done>
  if (parts[0] === "delq" && parts.length === 2) {
    const scope = parts[1] === "done" ? "done" : "all";
    const n = await deleteTasksOwnedBy(env, from.id, scope);
    await answerCallbackQuery(env, cq.id, "🗑 حذف شد");
    await sendMessage(env, msg.chat.id, `🗑 ${faDigits(n)} تسک حذف شد${scope === "done" ? " (تموم‌شده‌ها)" : ""}.`);
    return;
  }

  // ✏️ انتخاب تسک برای ویرایش زبانی: upd|<taskId>
  if (parts[0] === "upd" && parts.length === 2) {
    const task = await getTask(env, Number(enDigits(parts[1])));
    if (!task) {
      await answerCallbackQuery(env, cq.id, "این تسک حذف شده ❌");
      return;
    }
    if (!isMine(task, from.id)) {
      await answerCallbackQuery(env, cq.id, "این تسک مال تو نیست 😐");
      return;
    }
    await answerCallbackQuery(env, cq.id, "⏳");
    await savePendingEdit(env, from.id, task.id, msg.chat.id);
    await askEditValue(env, msg.chat.id, task);
    return;
  }

  if (parts[0] !== "st" || parts.length !== 3) {
    await answerCallbackQuery(env, cq.id, "دکمه نامعتبره 🤷");
    return;
  }
  const id = Number(enDigits(parts[1]));
  const status = parseStatus(parts[2]);

  const task = await getTask(env, id);
  if (!task) {
    await answerCallbackQuery(env, cq.id, "این تسک حذف شده ❌");
    return;
  }
  if (from.id !== task.assignee_id && from.id !== task.creator_id) {
    await answerCallbackQuery(env, cq.id, "فقط مسئول یا سازنده‌ی تسک می‌تونه وضعیتش رو عوض کنه 😐");
    return;
  }
  if (!status) {
    await answerCallbackQuery(env, cq.id, "وضعیت نامعتبره");
    return;
  }
  if (status === task.status) {
    await answerCallbackQuery(env, cq.id, "همین الان هم همینه 🙂");
    return;
  }

  const updated = (await updateTaskStatus(env, id, status))!;
  const creator = await getUser(env, task.creator_id);
  const assignee = await getUser(env, task.assignee_id);
  try {
    await editMessageText(env, msg.chat.id, msg.message_id, taskCard(updated, creator, assignee), {
      reply_markup: statusKeyboard(updated),
    });
  } catch (err) {
    // پیام‌های خیلی قدیمی قابل ویرایش نیستند — مهم نیست
    console.warn("[bot] editMessageText failed:", err);
  }
  await answerCallbackQuery(env, cq.id, `وضعیت شد: ${STATUS_LABEL[status]} ${STATUS_EMOJI[status]}`);
  await notifyCounterpart(env, updated!, from, status);
}

/** خبر دادن به طرف مقابل (اگر تغییردهنده مسئول بود → سازنده و برعکس) */
async function notifyCounterpart(
  env: Env,
  task: TaskRow,
  changedBy: { id: number },
  status: TaskStatus
): Promise<void> {
  const otherId = changedBy.id === task.assignee_id ? task.creator_id : task.assignee_id;
  if (otherId === changedBy.id) return;
  const other = await getUser(env, otherId);
  const changer = await getUser(env, changedBy.id);
  if (!other?.chat_id) return;
  await sendMessage(
    env,
    other.chat_id,
    `🚦 وضعیت تسک «${escapeHtml(truncate(task.title, 60))}» به «${STATUS_LABEL[status]}» ${STATUS_EMOJI[status]} تغییر کرد (توسط ${displayName(changer)}).`
  );
}
