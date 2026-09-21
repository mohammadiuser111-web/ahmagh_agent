/**
 * ahmagh_agent — مدیریت پیام‌ها، دستورها و دکمه‌های تلگرام
 */
import type { Env, PendingDraft, TaskRow, TaskStatus, UserRow } from "./types";
import {
  assignTask,
  createTask,
  deletePendingTask,
  deleteTaskById,
  findUserByName,
  findUserByUsername,
  getPendingTask,
  getTask,
  getUser,
  listTasks,
  recentUsers,
  savePendingTask,
  setTaskFields,
  updateTaskStatus,
  upsertUser,
} from "./db";
import { extractDueDateTime, extractTask } from "./ai";
import { answerCallbackQuery, editMessageText, escapeHtml, sendMessage } from "./telegram";
import {
  STATUS_EMOJI,
  STATUS_LABEL,
  displayName,
  normalizeEditField,
  parseStatus,
  statusKeyboard,
  taskCard,
  truncate,
} from "./format";
import { enDigits, faDigits, fmtDate, fmtTimeTehran, parseRelativeFaDateTime, todayTehranISO } from "./dates";

/** واژه‌ی بیدارکننده‌ی بات 😄 */
const TRIGGER_RE = /احمق|ahmagh/i;

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

/help — همه‌ی دستورها`;

const HELP = `🤖 <b>راهنمای احمق‌ایجنت</b>

<b>ساخت تسک با زبان طبیعی:</b>
«احمق این تسک رو ایجاد کن: تماس با مشتری، تا شنبه»

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
/help — همین راهنما

<b>وضعیت‌ها:</b> not_started / in_progress / done
(معادل فارسی هم قبوله: شروع_نشده / در_حال_انجام / تمام)

💡 زیر کارت هر تسک، دکمه‌ی تغییر وضعیت هم هست.

<b>نکته‌ها:</b>
• تاریخ پایان اجباریه — اگه تو متن نگی، جدا می‌پرسم و فقط جواب می‌دی (مثلاً: فردا / پنجشنبه / فردا ساعت ۵ عصر)
• اگه تاریخ شروع نگفی، امروز حساب می‌شه
• ساعت هم می‌فهمم: «تا فردا ساعت ۱۰:۳۰ عصر» یا «تا شنبه ۱۲ ظهر»
• با رسیدن زمان شروع، وضعیت خودکار «در حال انجام» می‌شه 🚦`;

const HINT = `من فقط وقتی کامل بیدار می‌شم که صدام کنی «احمق» 😅

مثلاً:
«احمق این تسک رو ایجاد کن: خرید نان، تا فردا»

راهنمای کامل: /help`;

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

async function onMessage(env: Env, msg: any): Promise<void> {
  const from = msg?.from;
  if (!from || from.is_bot) return;

  const isPrivate = msg.chat?.type === "private";
  // در گروه، chat_id خصوصی را خراب نکنیم — فقط در چت خصوصی ذخیره می‌شود
  await upsertUser(env, from, isPrivate ? msg.chat.id : null);

  const text = String(msg.text || "").trim();
  if (text.startsWith("/")) {
    await onCommand(env, msg, text);
    return;
  }
  if (TRIGGER_RE.test(text)) {
    await createTaskFromText(env, msg, text);
    return;
  }
  if (isPrivate) {
    // شاید این پیام، جوابِ سؤالِ «تاریخ پایان» یک تسک در انتظار است
    const handled = await tryPendingDeadlineReply(env, msg, text);
    if (handled) return;
    await sendMessage(env, msg.chat.id, HINT);
  }
}

async function onCommand(env: Env, msg: any, text: string): Promise<void> {
  const chatId = msg.chat.id;
  const parts = text.split(/\s+/);
  const cmd = parts[0].split("@")[0].toLowerCase(); // حذف @botname برای گروه‌ها
  const arg = parts.slice(1).join(" ").trim();

  switch (cmd) {
    case "/start":
      await sendMessage(env, chatId, WELCOME);
      return;
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

async function createTaskFromText(env: Env, msg: any, text: string): Promise<void> {
  const chatId = msg.chat.id;
  const known = await recentUsers(env);
  const parsed = await extractTask(env, text, known);

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

  const { user: assignee, note } = await resolveAssignee(env, parsed.assignee_name, msg.from.id);
  const today = todayTehranISO();
  // 🐛 باگ‌فیکس: تاریخ شروع نگفته شده؟ پیش‌فرض = امروز (نه خالی)
  const start_date = parsed.start_date || today;
  // ⏰ ساعت شروع/پایان اگر گفته شده باشد → timestamp کامل با offset تهران
  const start_at = parsed.start_time ? `${start_date}T${parsed.start_time}:00+03:30` : null;
  const due_at = parsed.due_date && parsed.due_time ? `${parsed.due_date}T${parsed.due_time}:00+03:30` : null;

  // 📌 تاریخ پایان اجباری است — اگر نگفته، از کاربر بپرس
  if (!parsed.due_date) {
    if (msg.chat?.type === "private") {
      await savePendingTask(env, msg.from.id, msg.chat.id, {
        title: parsed.title,
        description: parsed.description,
        creator_id: msg.from.id,
        assignee_id: assignee.user_id,
        status: parsed.status,
        start_date,
        start_at,
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

  await createAndAnnounceTask(
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
      due_date: parsed.due_date,
      due_at,
    },
    note
  );
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
  },
  note?: string | null
): Promise<void> {
  // 🚦 اگر شروع در آینده باشد، با رسیدنش خودکار «در حال انجام» می‌شود
  const startInFuture =
    (fields.start_at !== null && Date.parse(fields.start_at) > Date.now()) ||
    (fields.start_date !== null && fields.start_date > todayTehranISO());

  const task = (await createTask(env, {
    title: fields.title,
    description: fields.description,
    creator_id: fields.creator_id,
    assignee_id: fields.assignee.user_id,
    status: fields.status,
    start_date: fields.start_date,
    start_at: fields.start_at,
    due_date: fields.due_date,
    due_at: fields.due_at,
    auto_start: startInFuture,
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

  await sendMessage(
    env,
    msg.chat.id,
    `✅ <b>تسک ساخته شد!</b>\n\n${taskCard(task, creator, fields.assignee, notes.join("\n") || null)}`,
    { reply_markup: statusKeyboard(task) }
  );

  // اگر مسئول کس دیگه‌ای است، به خودش هم خبر بده
  if (fields.assignee.user_id !== msg.from.id && fields.assignee.chat_id) {
    await sendMessage(
      env,
      fields.assignee.chat_id,
      `👷 ${displayName(creator)} یه تسک برایت ساخت:\n\n${taskCard(task, creator, fields.assignee)}`,
      { reply_markup: statusKeyboard(task) }
    );
  }
}

const PENDING_TTL_MS = 6 * 3_600_000; // جوابِ «تاریخ پایان» تا ۶ ساعت اعتبار دارد
const CANCEL_RE = /^(بی\s*خیال|بی\s*خیالش|لغو|کنسل|cancel|نه)\s*[!.؟]*$/i;

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
        chat_id: null,
        created_at: "",
        updated_at: "",
      },
    status: draft.status,
    start_date: draft.start_date,
    start_at: draft.start_at,
    due_date: deadline.date,
    due_at,
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
): Promise<{ user: UserRow; note: string | null }> {
  const me = await getUser(env, creatorId);
  const clean = (name || "").trim();
  if (!clean) return { user: me!, note: null };
  const lower = clean.replace(/^@/, "").toLowerCase();
  if (["من", "خودم", "خودمم", "me", "myself", "من خودم"].includes(lower)) return { user: me!, note: null };

  const byUsername = await findUserByUsername(env, lower);
  if (byUsername) return { user: byUsername, note: null };

  const byName = await findUserByName(env, clean);
  if (byName) return { user: byName, note: null };

  return {
    user: me!,
    note: `مسئولِ «${escapeHtml(clean)}» بین کاربرهای بات پیدا نشد؛ فعلاً خودت مسئول شدی. وقتی اون هم با بات حرف زد، با /assign می‌تونی تسک رو بهش واگذار کنی.`,
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
  const m = enDigits(arg).match(/^(\d+)\s+(\S+)$/);
  if (!m) {
    await sendMessage(
      env,
      msg.chat.id,
      `📝 شکل درست: <code>/status &lt;شناسه&gt; &lt;وضعیت&gt;</code>

وضعیت‌های مجاز:
• not_started (شروع_نشده)
• in_progress (در_حال_انجام)
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
      const { user, note: assignNote } = await resolveAssignee(env, value, msg.from.id);
      updates.assignee_id = user.user_id;
      note = `مسئول جدید: ${escapeHtml(displayName(user))}`;
      if (assignNote) note += `\n${assignNote}`;
      break;
    }
    case "start": {
      const dt = parseRelativeFaDateTime(value, today);
      const date = dt.date || (dt.time ? task.start_date || today : "");
      if (!date) {
        await sendMessage(
          env,
          msg.chat.id,
          "🤔 تاریخ شروع رو نفهمیدم! مثلاً: «شنبه»، «۱۵ مهر» یا «فردا ساعت ۸ صبح»."
        );
        return;
      }
      const start_at = dt.time ? `${date}T${dt.time}:00+03:30` : null;
      const future = (start_at !== null && Date.parse(start_at) > Date.now()) || date > today;
      updates.start_date = date;
      updates.start_at = start_at;
      // اگر شروع هنوز نرسیده و تسک شروع‌نشده است، شروعِ خودکار دوباره مسلح می‌شود
      updates.auto_start = future && task.status === "not_started" ? 1 : 0;
      note =
        "زمان شروع آپدیت شد." + (future && task.status === "not_started" ? " ⏱ شروع خودکار فعال شد." : "");
      break;
    }
    case "due": {
      const deadline = await resolveDeadlineFromText(env, value);
      if (!deadline) {
        await sendMessage(
          env,
          msg.chat.id,
          "🤔 تاریخ پایان رو نفهمیدم! مثلاً: «فردا»، «پنجشنبه»، «۱۵ مهر» یا «فردا ساعت ۵ عصر»."
        );
        return;
      }
      updates.due_date = deadline.date;
      updates.due_at = deadline.time ? `${deadline.date}T${deadline.time}:00+03:30` : null;
      // یادآوری‌ها از نو شروع بشن
      updates.last_reminded_at = new Date().toISOString();
      updates.reminder_count = 0;
      note = "زمان پایان آپدیت شد.";
      break;
    }
    case "status": {
      const st = parseStatus(value);
      if (!st) {
        await sendMessage(
          env,
          msg.chat.id,
          "وضعیت معتبر نیست. گزینه‌ها: <i>شروع‌نشده</i> / <i>در حال انجام</i> / <i>تمام‌شده</i>"
        );
        return;
      }
      updates.status = st;
      if (st === "done") updates.completed_at = new Date().toISOString();
      if (st === "in_progress" && !task.started_at) updates.started_at = new Date().toISOString();
      note = "وضعیت عوض شد.";
      break;
    }
  }

  const updated = await setTaskFields(env, id, updates);
  if (!updated) {
    await sendMessage(env, msg.chat.id, "❌ خطا در ذخیره‌ی تغییرات.");
    return;
  }
  const creator = await getUser(env, updated.creator_id);
  const assignee = await getUser(env, updated.assignee_id);
  await sendMessage(
    env,
    msg.chat.id,
    `✏️ ✅ ${note}\n\n${taskCard(updated, creator, assignee)}`,
    { reply_markup: statusKeyboard(updated) }
  );
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
