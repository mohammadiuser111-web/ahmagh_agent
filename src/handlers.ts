/**
 * ahmagh_agent — مدیریت پیام‌ها، دستورها و دکمه‌های تلگرام
 */
import type { Env, TaskRow, TaskStatus, UserRow } from "./types";
import {
  assignTask,
  createTask,
  deleteTaskById,
  findUserByName,
  findUserByUsername,
  getTask,
  getUser,
  listTasks,
  recentUsers,
  updateTaskStatus,
  upsertUser,
} from "./db";
import { extractTask } from "./ai";
import { answerCallbackQuery, editMessageText, escapeHtml, sendMessage } from "./telegram";
import {
  STATUS_EMOJI,
  STATUS_LABEL,
  displayName,
  parseStatus,
  statusKeyboard,
  taskCard,
  truncate,
} from "./format";
import { enDigits, faDigits, fmtDate } from "./dates";

/** واژه‌ی بیدارکننده‌ی بات 😄 */
const TRIGGER_RE = /احمق|ahmagh/i;

const WELCOME = `سلام! من <b>احمق‌ایجنت</b> هستم 🤖
ایجنتِ مدیریت تسک شما — اسمم «احمقه» ولی کارم درسته!

برای ساختن تسک، فقط طبیعی با من حرف بزن:
<b>«احمق این تسک رو ایجاد کن: خرید نان، تا فردا»</b>

از حرفت این‌ها رو درمیارم:
📌 عنوان و توضیحات
👷 مسئول (اگه اسمش رو بگی)
📅 تاریخ شروع و پایان (فردا، شنبه، ۱۵ مرداد…)
🚦 وضعیت اولیه

بعدش هم تا وقتی تسک رو تموم نکنی، یادآوری می‌کنم 😈

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
/delete &lt;شناسه&gt; — حذف تسک
/help — همین راهنما

<b>وضعیت‌ها:</b> not_started / in_progress / done
(معادل فارسی هم قبوله: شروع_نشده / در_حال_انجام / تمام)

💡 زیر کارت هر تسک، دکمه‌ی تغییر وضعیت هم هست.`;

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
  if (isPrivate) await sendMessage(env, msg.chat.id, HINT);
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
  // تازه INSERT شده؛ نال نیست
  const task = (await createTask(env, {
    title: parsed.title,
    description: parsed.description,
    creator_id: msg.from.id,
    assignee_id: assignee.user_id,
    status: parsed.status,
    start_date: parsed.start_date || null,
    due_date: parsed.due_date || null,
  }))!;
  const creator = await getUser(env, msg.from.id);

  await sendMessage(env, chatId, `✅ <b>تسک ساخته شد!</b>\n\n${taskCard(task, creator, assignee, note)}`, {
    reply_markup: statusKeyboard(task),
  });

  // اگر مسئول کس دیگه‌ای است، به خودش هم خبر بده
  if (assignee.user_id !== msg.from.id && assignee.chat_id) {
    await sendMessage(
      env,
      assignee.chat_id,
      `👷 ${displayName(creator)} یه تسک برایت ساخت:\n\n${taskCard(task, creator, assignee)}`,
      { reply_markup: statusKeyboard(task) }
    );
  }
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
