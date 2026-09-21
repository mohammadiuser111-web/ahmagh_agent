/**
 * استخراج ساختار تسک از زبان طبیعی فارسی با Workers AI
 * مدل اصلی: @cf/zai-org/glm-5.3-flash (نیازمند پلن پولی)
 * فالبک ۱: مدل جایگزین رایگان — فالبک ۲: پارسر هیوریستیک بدون AI
 */
import type { Env, ParsedTask, TaskStatus } from "./types";
import { parseRelativeFaDateTime, todayJalaliFa, todayTehranISO } from "./dates";

const DEFAULT_MODEL = "@cf/zai-org/glm-5.3-flash";
const DEFAULT_FALLBACK_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** اسکیمای خروجی (structured outputs — سازگار با JSON Schema) */
const TASK_JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["create_task", "other"] },
    title: { type: "string" },
    description: { type: "string" },
    assignee: { type: "string" },
    start_date: { type: "string" },
    start_time: { type: "string" },
    due_date: { type: "string" },
    due_time: { type: "string" },
    status: { type: "string", enum: ["not_started", "in_progress", "done"] },
  },
  required: [
    "intent", "title", "description", "assignee",
    "start_date", "start_time", "due_date", "due_time", "status",
  ],
  additionalProperties: false,
} as const;

const DATE_JSON_SCHEMA = {
  type: "object",
  properties: { date: { type: "string" }, time: { type: "string" } },
  required: ["date", "time"],
  additionalProperties: false,
} as const;

function systemPrompt(today: string, todayJalali: string, knownUsers: string): string {
  return [
    "You are the task-extraction brain of a Persian (Farsi) Telegram task-manager bot.",
    'Users jokingly address the bot as "احمق" (idiot) — ignore such insults and any meta phrases like "این تسک رو ایجاد کن" / "بساز".',
    `Today is ${today} (Gregorian, Tehran time) = ${todayJalali} in the Jalali (Shamsi) calendar.`,
    "Extract the task from the user's message and answer ONLY with JSON matching the schema.",
    "Rules:",
    '- intent: "create_task" only if the user clearly wants a task created; otherwise "other".',
    "- title: short imperative task title (max ~90 characters), written in the SAME language as the task text (usually Persian). Never include insults or meta phrases in it.",
    '- description: remaining details, or "" if none.',
    '- assignee: who must do the task — a username (without @) or a first name exactly as written. If it refers to the speaker (من/خودم) or nobody else is mentioned, use "".',
    '- start_date: the date the work BEGINS, only if the message says or implies it (e.g. «فردا باید X بزنم» → tomorrow). If nothing implies a start date, use "" — the bot defaults it to today.',
    '- due_date: the deadline, only if stated or clearly implied (e.g. «تا فردا», «تا ۱۵ مهر», «شنبه تحویل می‌دم»). Do NOT invent or estimate deadlines. If none is given, use "" — the bot will ask the user.',
    '- start_time / due_time: "HH:MM" in 24-hour format if the user mentions a specific clock time for the start or the deadline (ساعت ۱۰:۳۰ عصر → "22:30", ۱۲ ظهر → "12:00", ۸ صبح → "08:00"). Otherwise "".',
    "Convert Jalali calendar dates (۱۵ مهر ۱۴۰۵) and relative Persian dates (فردا، پس‌فردا، آخر هفته، شنبه، …) to Gregorian ISO using today's date.",
    '- status: "not_started" unless the message implies work already started ("شروع کردم") or is already finished ("انجام دادم", "تمومه").',
    `Known users of this bot (use for assignee matching): ${knownUsers || "(none yet)"}.`,
  ].join("\n");
}

/** خروجی مدل را به JSON تبدیل می‌کند (تحمل کدفنس و متن اضافه) */
function parseMaybeJson(result: unknown): any | null {
  const raw = typeof result === "string" ? result : ((result as { response?: string })?.response ?? "");
  if (!raw) return null;
  const cleaned = String(raw)
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
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

function normalize(j: any, originalText: string): ParsedTask {
  const intent: ParsedTask["intent"] = j?.intent === "other" ? "other" : "create_task";
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
  if (!title) return heuristicParse(originalText);
  return { intent, title, description, assignee_name, start_date, start_time, due_date, due_time, status };
}

/** فالبک بدون AI: جدا کردن عنوان/توضیحات و تشخیص ساده‌ی تاریخ و ساعت‌های رایج فارسی */
export function heuristicParse(text: string): ParsedTask {
  let t = text.replace(/احمق/g, " ");
  t = t.replace(
    /(این|یه)?\s*(تسک|تسکی|تاسک)\s*(رو|را)?\s*(برای\s*من)?\s*(ایجاد\s*کن|ایجاد\s*کنید|بساز|بسازید|ساخت\s*کن|بسازه)/g,
    " "
  );
  t = t.replace(/^[\s:：،,–-]+/, "").trim();

  let due_date = "";
  let due_time: string | null = null;
  const m = t.match(/(?:تا|سررسید)\s+([^،,.\n؛]+)/);
  if (m) {
    const dt = parseRelativeFaDateTime(m[1], todayTehranISO());
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
    intent: "create_task",
    title,
    description,
    assignee_name: "",
    start_date: "",
    start_time: "",
    due_date,
    due_time: due_time ?? "",
    status: "not_started",
  };
}
