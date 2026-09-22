/**
 * استخراج ساختار تسک از زبان طبیعی فارسی با Workers AI
 * مدل: llama-3.3-70b (رایگان) — قابل تعویض با متغیر AI_MODEL
 * فالبک ۱: مدل جایگزین (AI_FALLBACK_MODEL) — فالبک ۲: پارسر هیوریستیک بدون AI
 */
import type { Env, ParsedTask, TaskStatus } from "./types";
import { addDaysISO, enDigits, parseRelativeFaDateTime, todayJalaliFa, todayTehranISO } from "./dates";

const DEFAULT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const DEFAULT_FALLBACK_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** اسکیمای خروجی (structured outputs — سازگار با JSON Schema) */
const TASK_JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["create_task", "delete_tasks", "update_task", "nearest_deadline", "list_tasks", "export_report", "user_tasks_query", "other"],
    },
    title: { type: "string" },
    description: { type: "string" },
    assignee: { type: "string" },
    start_date: { type: "string" },
    start_time: { type: "string" },
    start_phrase: { type: "string" },
    due_date: { type: "string" },
    due_time: { type: "string" },
    due_phrase: { type: "string" },
    reminder_kind: { type: "string", enum: ["", "none", "daily", "every_hours", "before_deadline", "once"] },
    reminder_time: { type: "string" },
    reminder_hours: { type: "number" },
    status: { type: "string", enum: ["not_started", "in_progress", "done"] },
    delete_scope: { type: "string", enum: ["", "all", "done"] },
    task_ref: { type: "string" },
    update_field: { type: "string", enum: ["", "title", "description", "assignee", "start", "due", "status", "reminder"] },
    update_value: { type: "string" },
    target_user: { type: "string" },
    list_filter: { type: "string", enum: ["", "open", "done", "all"] },
  },
  required: [
    "intent", "title", "description", "assignee",
    "start_date", "start_time", "start_phrase",
    "due_date", "due_time", "due_phrase",
    "reminder_kind", "reminder_time", "reminder_hours", "status",
    "delete_scope", "task_ref", "update_field", "update_value", "target_user", "list_filter",
  ],
  additionalProperties: false,
} as const;

const DATE_JSON_SCHEMA = {
  type: "object",
  properties: { date: { type: "string" }, time: { type: "string" } },
  required: ["date", "time"],
  additionalProperties: false,
} as const;

const WEEKDAYS_FA = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];

/** نام روز هفته‌ی یک تاریخ ISO */
function weekdayFa(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return WEEKDAYS_FA[d.getUTCDay()] ?? "?";
}

function systemPrompt(today: string, todayJalali: string, knownUsers: string): string {
  return [
    "You are the task-extraction brain of a Persian (Farsi) Telegram task-manager bot named احمق‌ایجنت.",
    'Users jokingly address the bot as "احمق" (idiot) — ignore such insults and meta phrases like "این تسک رو ایجاد کن" / "بساز".',
    `Today is ${today} (Gregorian, Tehran time) = ${todayJalali} in the Jalali (Shamsi) calendar.`,
    `Today's weekday: ${weekdayFa(today)}. Weekdays: شنبه=Saturday, یکشنبه=Sunday, دوشنبه=Monday, سه‌شنبه=Tuesday, چهارشنبه=Wednesday, پنجشنبه=Thursday, جمعه=Friday. A weekday in the message means its NEXT occurrence strictly AFTER today.`,
    "",
    "Extract the task and answer ONLY with JSON matching the schema.",
    "",
    "CLASSIFY THE REQUEST FIRST (intent):",
    '- "create_task" — the user clearly wants a task created/recorded.',
    "- \"delete_tasks\" — remove tasks: «تسک‌هامو حذف کن», «همه‌ی تسک‌ها رو پاک کن», «تسک گزارش رو حذف کن».",
    '  • delete_scope: "all" = ALL of the speaker\'s open tasks; "done" = only finished ones; "" = one specific task (put its id or a title fragment in task_ref).',
    "- \"update_task\" — change an existing task: «تسک لندینگ رو ویرایش کن», «عنوانش بشه گزارش نهایی», «تسک ۵ رو تموم کن», «یادآوری تسک گزارش رو هر روز ساعت ۸ کن».",
    '  • task_ref = the task id or a distinctive title fragment. If the user says WHAT to change: update_field is one of title|description|assignee|start|due|status|reminder and update_value is the new value VERBATIM in Persian (keep dates/numbers as written).',
    '- "nearest_deadline" — «کدوم تسکم به ددلاین نزدیک‌تره؟», «چی زودتر باید تموم شه؟».',
    '- "list_tasks" — show the speaker\'s own tasks: «تسک‌هامو نشون بده», «لیست کارهام», «تموم‌شده‌هامو بگو» (list_filter: open|done|all).',
    '- "export_report" — «خروجی/گزارش/تاریخچه‌ی تسک‌هامو بده».',
    '- "user_tasks_query" — asking about ANOTHER user\'s tasks: «تسک‌های علی چیا هستن؟» → target_user = that name/@username. For the speaker\'s OWN tasks always use list_tasks.',
    '- "other" — greetings, smalltalk, or anything not covered.',
    "",
    "FIELD RULES (for create_task):",
    "- title: short imperative task title (max ~90 chars), same language as the task text. Never include insults, meta phrases, dates, or reminder words.",
    '- description: leftover useful details, or "".',
    '- assignee: who must DO the task — a @username (without @) or a first name exactly as written. If it refers to the speaker (من/خودم) or nobody else is mentioned, use "".',
    '- start_date: "YYYY-MM-DD" only if the message clearly says when work BEGINS («از شنبه», «فردا شروع می‌کنم»). Else "".',
    '- due_date: "YYYY-MM-DD" the deadline, only if stated or clearly implied. Do NOT invent deadlines. Else "".',
    '- start_phrase / due_phrase: copy the EXACT verbatim substring expressing the start/deadline (keep Persian words/numbers, e.g. «فردا ساعت ۱۰:۳۰ عصر», «تا پس فردا شب», «۵ مهر»). If several dates appear (e.g. someone else\'s deadline AND the task\'s), pick THIS task\'s one. Use "" if none.',
    '- start_time / due_time: "HH:MM" 24-hour if a specific clock time is given for start/deadline (ساعت ۱۰:۳۰ عصر → "22:30", ۱۲ ظهر → "12:00", ۸ صبح → "08:00"). Else "".',
    "- reminder_kind: the reminder pattern the user asks for:",
    '  • "daily" — «هر روز ساعت ۵ بهم یاد بده» → also set reminder_time="17:00".',
    '  • "every_hours" — «هر ۳ ساعت یادم کن» → reminder_hours=3.',
    '  • "before_deadline" — «۱ ساعت قبل از ددلاین پیام بده» → reminder_hours=1 (hours before the deadline).',
    '  • "once" — «فردا ساعت ۱۰ صبح یادم بنداز» → reminder_time="10:00".',
    '  • "none" — «یادآوری نکن».',
    '  • "" — no reminder wording at all.',
    "- reminder_hours: a number (interval hours OR hours-before-deadline depending on kind), else 0.",
    '- status: "not_started" unless work already started («شروع کردم») or finished («انجام دادم», «تمومه»).',
    "",
    `Known users of this bot (match assignee against them): ${knownUsers || "(none yet)"}.`,
    "",
    "EXAMPLES:",
    '«احمق یه تسک بساز: خرید نان، تا فردا» → {"intent":"create_task","title":"خرید نان","description":"","assignee":"","start_date":"","start_time":"","start_phrase":"","due_date":"' + addDaysISO(today, 1) + '","due_time":"","due_phrase":"تا فردا","reminder_kind":"","reminder_time":"","reminder_hours":0,"status":"not_started"}',
    '«احمق برای علی یه تسک بساز که فردا تا ساعت ۱۰ شب باید لندینگ بزنه، هر روز ساعت ۸ صبح یادش باشه» → {"intent":"create_task","title":"لندینگ بزن","description":"","assignee":"علی","start_date":"","start_time":"","start_phrase":"","due_date":"' + addDaysISO(today, 1) + '","due_time":"22:00","due_phrase":"فردا تا ساعت ۱۰ شب","reminder_kind":"daily","reminder_time":"08:00","reminder_hours":0,"status":"not_started"}',
    '«احمق تمام تسک های منو حذف کن» → {"intent":"delete_tasks","delete_scope":"all","task_ref":""} (other fields empty)',
    '«احمق تسک گزارش رو ویرایش کن، عنوانش بشه گزارش نهایی» → {"intent":"update_task","task_ref":"گزارش","update_field":"title","update_value":"گزارش نهایی"}',
    '«احمق تسک ۵ رو تموم کن» → {"intent":"update_task","task_ref":"5","update_field":"status","update_value":"تموم"}',
    '«احمق کدوم از تسک هام به ددلاین نزدیک تره؟» → {"intent":"nearest_deadline"}',
    '«احمق تسک‌های منو لیست کن» → {"intent":"list_tasks","list_filter":"open"}',
    '«سلام، حالت چطوره؟» → {"intent":"other"}',
  ].join("\n");
}

function tryParseJson(raw: string): any | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * خروجی مدل را به JSON تبدیل می‌کند. binding ورکرز AI بسته به مدل/حالت،
 * قالب‌های متفاوتی برمی‌گرداند — همه پشتیبانی می‌شوند:
 *  1) رشته‌ی خام
 *  2) { response: "رشته‌ی JSON" }          (رایج‌ترین حالت)
 *  3) { response: {آبجکت}}                 (structured output خودش پارس شده)
 *  4) { choices: [{ message: { content } }] } (قالب chat.completion)
 */
function parseMaybeJson(result: unknown): any | null {
  if (!result) return null;
  if (typeof result === "string") return tryParseJson(result);
  const r = result as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  if (r.response && typeof r.response === "object") return r.response;
  let raw: unknown = r.response;
  if (typeof raw !== "string" && Array.isArray(r.choices)) {
    raw = r.choices[0]?.message?.content;
  }
  return typeof raw === "string" && raw ? tryParseJson(raw) : null;
}

async function callModel(env: Env, model: string, input: unknown): Promise<unknown> {
  // ⚠️ حتماً به‌صورت env.AI.run(...) صدا زده شود — جدا کردن متد از this
  // باعث «Cannot set properties of undefined (setting '#options')» می‌شود
  return (env.AI as unknown as { run: (m: string, i: unknown) => Promise<unknown> }).run(model, input);
}

/**
 * اجرای مدل با structured output و زنجیره‌ی فالبک:
 * مدل اصلی (schema) → مدل اصلی (بدون schema) → مدل جایگزین (schema) → مدل جایگزین (بدون schema)
 */
async function runJson(
  env: Env,
  messages: { role: string; content: string }[],
  schema: unknown,
  schemaName: string,
  maxTokens: number
): Promise<any | null> {
  const primary = env.AI_MODEL || DEFAULT_MODEL;
  const fallback = env.AI_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;
  const models = [primary, ...(fallback && fallback !== primary ? [fallback] : [])];

  for (const model of models) {
    // ۱) حالت استاندارد: structured output
    try {
      const parsed = parseMaybeJson(
        await callModel(env, model, {
          messages,
          response_format: { type: "json_schema", json_schema: { name: schemaName, schema, strict: true } },
          max_tokens: maxTokens,
        })
      );
      if (parsed) return parsed;
    } catch (err) {
      console.error(`[ai] ${model} (schema) failed:`, err instanceof Error ? err.message : err);
    }
    // ۲) بعضی مدل‌ها response_format را قبول نمی‌کنند → درخواست JSON ساده
    try {
      const parsed = parseMaybeJson(
        await callModel(env, model, {
          messages: [...messages, { role: "system", content: "Respond with ONLY one valid JSON object. No prose, no markdown." }],
          max_tokens: maxTokens,
        })
      );
      if (parsed) return parsed;
    } catch (err) {
      console.error(`[ai] ${model} (plain) failed:`, err instanceof Error ? err.message : err);
    }
  }
  return null;
}

/** استخراج کامل ساختار تسک از پیام کاربر */
export async function extractTask(env: Env, text: string, knownUsers = ""): Promise<ParsedTask> {
  const userText = text.slice(0, 2000);
  try {
    const parsed = await runJson(
      env,
      [
        { role: "system", content: systemPrompt(todayTehranISO(), todayJalaliFa(), knownUsers) },
        { role: "user", content: userText },
      ],
      TASK_JSON_SCHEMA,
      "extracted_task",
      600
    );
    if (parsed) return normalize(parsed, userText);
    console.error("[ai] all models returned invalid JSON → heuristic fallback");
  } catch (err) {
    console.error("[ai] extraction failed → heuristic fallback:", err);
  }
  return heuristicParse(userText);
}

/** استخراج فقط تاریخ + ساعت پایان از جواب کوتاه کاربر (مثل «تا پنجشنبه ساعت ۵ عصر») */
export async function extractDueDateTime(env: Env, text: string): Promise<{ date: string; time: string | null }> {
  try {
    const parsed = await runJson(
      env,
      [
        {
          role: "system",
          content: [
            `The user is answering the question "تا کی باید این تسک تموم بشه؟" (until when is this task due?) in Persian.`,
            `Today is ${todayTehranISO()} (Gregorian, Tehran) = ${todayJalaliFa()} Jalali.`,
            'Convert their answer to a Gregorian ISO date "YYYY-MM-DD" and a 24-hour time "HH:MM" (ساعت ۱۰:۳۰ عصر → "22:30"). If not determinable, use "".',
          ].join(" "),
        },
        { role: "user", content: text.slice(0, 300) },
      ],
      DATE_JSON_SCHEMA,
      "due_datetime",
      150
    );
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed?.date ?? "")) ? String(parsed.date) : "";
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(parsed?.time ?? "")) ? String(parsed.time) : null;
    return { date, time };
  } catch (err) {
    console.error("[ai] extractDueDateTime failed:", err);
    return { date: "", time: null };
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isTaskStatus(v: unknown): v is TaskStatus {
  return v === "not_started" || v === "in_progress" || v === "done";
}

function isTimeStr(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

const ALL_INTENTS = ["create_task", "delete_tasks", "update_task", "nearest_deadline", "list_tasks", "export_report", "user_tasks_query", "other"] as const;

function normalize(j: any, originalText: string): ParsedTask {
  const intent: ParsedTask["intent"] = ALL_INTENTS.includes(j?.intent) ? j.intent : j?.title ? "create_task" : "other";
  const title = str(j?.title).trim().slice(0, 120);
  const description = str(j?.description).trim().slice(0, 2000);
  let assignee_name = str(j?.assignee).trim().slice(0, 64);
  if (/^(من|خودم|خودمم|من\s*خودم|me|myself|creator|سازنده)$/i.test(assignee_name)) assignee_name = "";
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
  const start_date = isDate(str(j?.start_date)) ? str(j?.start_date).slice(0, 10) : "";
  const due_date = isDate(str(j?.due_date)) ? str(j?.due_date).slice(0, 10) : "";
  const start_time = isTimeStr(str(j?.start_time)) ? str(j?.start_time) : "";
  const due_time = isTimeStr(str(j?.due_time)) ? str(j?.due_time) : "";
  const status: TaskStatus = isTaskStatus(j?.status) ? j.status : "not_started";
  // عینِ عبارت تاریخ/ساعت از متن کاربر — بعداً با پارسر قطعی محلی تبدیل می‌شود
  const start_phrase = str(j?.start_phrase).trim().slice(0, 60);
  const due_phrase = str(j?.due_phrase).trim().slice(0, 60);
  // یادآوری داینامیک
  const R_KINDS = ["", "none", "daily", "every_hours", "before_deadline", "once"];
  const reminder_kind = (R_KINDS.includes(str(j?.reminder_kind)) ? str(j?.reminder_kind) : "") as ParsedTask["reminder_kind"];
  const reminder_time = isTimeStr(str(j?.reminder_time)) ? str(j?.reminder_time) : "";
  const reminder_hours = typeof j?.reminder_hours === "number" && j.reminder_hours > 0 && j.reminder_hours <= 336 ? j.reminder_hours : 0;
  const SCOPES = ["", "all", "done"];
  const FILTERS = ["", "open", "done", "all"];
  const FIELDS = ["", "title", "description", "assignee", "start", "due", "status", "reminder"];
  const out: ParsedTask = {
    intent, title, description, assignee_name, start_date, start_time, start_phrase, due_date, due_time, due_phrase,
    reminder_kind, reminder_time, reminder_hours, reminder_date: "", status,
    delete_scope: (SCOPES.includes(str(j?.delete_scope)) ? str(j?.delete_scope) : "") as ParsedTask["delete_scope"],
    task_ref: str(j?.task_ref).trim().slice(0, 60),
    update_field: (FIELDS.includes(str(j?.update_field)) ? str(j?.update_field) : ""),
    update_value: str(j?.update_value).trim().slice(0, 200),
    target_user: str(j?.target_user).trim().slice(0, 40),
    list_filter: (FILTERS.includes(str(j?.list_filter)) ? str(j?.list_filter) : "") as ParsedTask["list_filter"],
  };
  if (!out.title && out.intent === "create_task") return heuristicParse(originalText);
  return out;
}

/** فالبک بدون AI: جدا کردن عنوان/توضیحات و تشخیص ساده‌ی تاریخ و ساعت‌های رایج فارسی */
const H_BASE: ParsedTask = {
  intent: "other", title: "", description: "", assignee_name: "",
  start_date: "", start_time: "", start_phrase: "", due_date: "", due_time: "", due_phrase: "",
  reminder_kind: "", reminder_time: "", reminder_hours: 0, reminder_date: "", status: "not_started",
  delete_scope: "", task_ref: "", update_field: "", update_value: "", target_user: "", list_filter: "",
};

/** «تسک X رو…» → X (نه ضمیر، نه حرف اضافه) */
function extractTaskRef(t: string): string {
  const m = t.match(/(?:تسک|تاسک|کار)\s+(?:های\s+)?(?:همه\s+|همرو\s+|تمام\s+)?([^،,\s]+)/);
  if (!m) return "";
  const ref = m[1].replace(/\u200c/g, "").replace(/(رو|را)$/, "");
  const STOP = /^(من|منو|خودم|خودمم|های|هایم|هام|هامو|مون|م|شون|همه|همرو|تمام|کل|تسک|تاسک|تسکها|کارها|کارام|کارای)$/i;
  return STOP.test(ref) ? "" : ref;
}

const UPDATE_FIELD_FA: Record<string, string> = {
  عنوان: "title", توضیح: "description", توضیحات: "description",
  مسئول: "assignee", شروع: "start", پایان: "due", سررسید: "due", ددلاین: "due",
  "تاریخ پایان": "due", "تاریخ شروع": "start",
  وضعیت: "status", یادآوری: "reminder", یاداوری: "reminder",
};

export function heuristicParse(text: string): ParsedTask {
  let t = text.replace(/احمق/g, " ");
  const hasTaskWord = /تسک|تاسک|کار/.test(t);
  const createVerb = /بساز|ایجاد|ساخت|ثبت|یادداشت|نوت/.test(t);

  // ۱) اولویت با فعلِ ساخت است: «یه تسک بساز: ویرایش سایت» یعنی ساخت، نه ویرایش!
  if (!createVerb) {
    // 🗑 حذف
    if (/(?:حذف|پاک)(?:ش|شون|شو)?\s*(?:کنند|کنید|کنم|کن)/.test(t) && hasTaskWord) {
      const doneScope = /تموم|انجام\s*شده|پایان\s*یافته/.test(t);
      const idm = t.match(/(?:تسک|تاسک|کار|شماره)\s*(\d{1,4})/);
      if (idm) return { ...H_BASE, intent: "delete_tasks", task_ref: String(Number(enDigits(idm[1]))) };
      let ref = extractTaskRef(t);
      let scope: "all" | "done" | "" = doneScope ? "done" : "all";
      if (/^(تموم|تمام|انجام)/.test(ref)) { ref = ""; scope = "done"; }
      if (ref) scope = "";
      return { ...H_BASE, intent: "delete_tasks", delete_scope: scope, task_ref: ref };
    }
    // ✏️ ویرایش / تغییر وضعیت
    // «تموم کن/تمومش کن» فقط به‌عنوان فعلِ دستوری — نه «باید تمومش کنم» (توصیفِ ددلاین!)
    if (
      /ویرایش|آپدیت|اپدیت|تغییر\s*بده|عوض\s*کن|تموم(?:ش|شون)?\s*(?:کن(?![\u0600-\u06FF])|کنید)|انجامش?\s*دادم|تمومش?\s*کردم/.test(t) &&
      hasTaskWord
    ) {
      const idm = t.match(/(?:تسک|تاسک|کار|شماره)\s*(\d{1,4})/);
      const task_ref = idm ? String(Number(enDigits(idm[1]))) : extractTaskRef(t);
      const fm = t.match(
        /(عنوان|توضیحات?|مسئول|شروع|پایان|سررسید|ددلاین|وضعیت|یادآوری|یاداوری)\S*\s*(?:ش|شو|مون)?\s*(?:بشه|شود|بذار|بزار|کن|گردد)\s*[:،]?\s*(.+)/
      );
      if (fm) {
        const field = UPDATE_FIELD_FA[fm[1].replace(/\u200c/g, " ").trim()] ?? "";
        return { ...H_BASE, intent: "update_task", task_ref, update_field: field, update_value: fm[2].trim() };
      }
      // «تاریخ پایان تسک رو تغییر بده به فردا ساعت ۱۲»
      const fm2 = t.match(
        /(عنوان|توضیحات?|مسئول|شروع|پایان|سررسید|ددلاین|وضعیت|یادآوری|یاداوری|تاریخ\s*پایان|تاریخ\s*شروع)[^،,]{0,25}?(?:تغییر|ویرایش|آپدیت|اپدیت|عوض)\s*(?:بده|بذار|بزار|کن)\s*(?:به\s*)?(.+)/
      );
      if (fm2) {
        const field = UPDATE_FIELD_FA[fm2[1].replace(/\u200c/g, " ").trim()] ?? "";
        if (field) return { ...H_BASE, intent: "update_task", task_ref, update_field: field, update_value: fm2[2].trim() };
      }
      // فقط فعلِ دستوری («تموم کن/تمومش کن/تموم شد») — نه وقتی «تموم» داخل عنوان است
      if (/(?:تموم|انجام)(?:ش|شون)?\s*(?:کن|کنم|کردم|بشه|شود)/.test(t))
        return { ...H_BASE, intent: "update_task", task_ref, update_field: "status", update_value: "تموم" };
      return { ...H_BASE, intent: "update_task", task_ref };
    }
    // ⏰ نزدیک‌ترین ددلاین
    if (/نزدیک/.test(t) && /ددلاین|سررسید|تموم/.test(t)) return { ...H_BASE, intent: "nearest_deadline" };
    // 📤 خروجی / 📋 لیست (پشتیبانِ مسیر قطعی)
    if (/خروجی|گزارش|تاریخچه/.test(t) && hasTaskWord) return { ...H_BASE, intent: "export_report" };
    if (hasTaskWord && /نشون|نمایش|لیست|چیا/.test(t)) return { ...H_BASE, intent: "list_tasks", list_filter: /تموم/.test(t) ? "done" : "open" };
  }

  // ۲) مسیر ساخت (موجود)
  const createSignal = createVerb || /(?:^|\s)(?:تا|سررسید)\s/.test(t) || /تسک|تاسک/.test(t);
  if (!createSignal) return { ...H_BASE };

  t = t.replace(
    /(این|یه)?\s*(تسک|تسکی|تاسک)\s*(رو|را)?\s*(برای\s*من)?\s*(ایجاد\s*کن|ایجاد\s*کنید|بساز|بسازید|ساخت\s*کن|بسازه)/g,
    " "
  );
  t = t.replace(/^[\s:：،,–-]+/, "").trim();

  let due_date = "";
  let due_time: string | null = null;
  let start_phrase = "";
  let due_phrase = "";
  const m = t.match(/(?:تا|سررسید)\s+([^،,.\n؛]+)/);
  if (m) {
    due_phrase = m[1].trim();
    const dt = parseRelativeFaDateTime(due_phrase, todayTehranISO());
    due_date = dt.date;
    due_time = dt.time;
    if (due_date) t = t.replace(m[0], " ").trim(); // تاریخ از توضیحات حذف شود
  }

  const firstClause = t.split(/[.\n،؛!؟]/)[0].trim();
  const title = (firstClause || "تسک بی‌نام").slice(0, 90);
  const description = t
    .slice(firstClause.length)
    .replace(/^[\s،؛:.,\-]+|[\s،؛:.,\-]+$/g, "")
    .slice(0, 1000);
  return {
    ...H_BASE,
    intent: "create_task",
    title,
    description,
    assignee_name: "",
    start_date: "",
    start_time: "",
    start_phrase,
    due_date,
    due_time: due_time ?? "",
    due_phrase,
    reminder_kind: "",
    reminder_time: "",
    reminder_hours: 0,
    reminder_date: "",
    status: "not_started",
  };
}
