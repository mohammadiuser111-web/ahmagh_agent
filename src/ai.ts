/**
 * استخراج ساختار تسک از زبان طبیعی فارسی با Workers AI
 * (+ فالبک هیوریستیک اگر AI در دسترس نبود یا خطا داد)
 */
import type { Env, ParsedTask, TaskStatus } from "./types";
import { addDaysISO, parseRelativeFaDate, todayJalaliFa, todayTehranISO } from "./dates";

const DEFAULT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** اسکیمای خروجی (structured outputs — سازگار با JSON Schema) */
const TASK_JSON_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["create_task", "other"] },
    title: { type: "string" },
    description: { type: "string" },
    assignee: { type: "string" },
    start_date: { type: "string" },
    due_date: { type: "string" },
    status: { type: "string", enum: ["not_started", "in_progress", "done"] },
  },
  required: ["intent", "title", "description", "assignee", "start_date", "due_date", "status"],
  additionalProperties: false,
} as const;

const DATE_JSON_SCHEMA = {
  type: "object",
  properties: { date: { type: "string" } },
  required: ["date"],
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
    '- start_date: the date the work BEGINS, only if the message says or implies it (e.g. «فردا باید X بزنم» → tomorrow). If nothing implies a start date, use "" — the bot will default it to today.',
    '- due_date: the deadline, only if stated or clearly implied (e.g. «تا فردا», «تا ۱۵ مهر», «شنبه تحویل می‌دم»). Do NOT invent or estimate deadlines. If none is given, use "" — the bot will ask the user.',
    "Convert Jalali calendar dates (۱۵ مهر ۱۴۰۵) and relative Persian dates (فردا، پس‌فردا، آخر هفته، شنبه، …) to Gregorian ISO using today's date.",
    '- status: "not_started" unless the message implies work already started ("شروع کردم") or is already finished ("انجام دادم", "تمومه").',
    `Known users of this bot (use for assignee matching): ${knownUsers || "(none yet)"}.`,
  ].join("\n");
}

/** اجرای مدل با structured output — خروجی آبجکت JSON پارس‌شده */
async function runJson(env: Env, messages: { role: string; content: string }[], schema: unknown, schemaName: string, maxTokens: number): Promise<any | null> {
  const model = env.AI_MODEL || DEFAULT_MODEL;
  const run = env.AI.run as unknown as (m: string, i: unknown) => Promise<unknown>;
  const result = (await run(model, {
    messages,
    response_format: { type: "json_schema", json_schema: { name: schemaName, schema, strict: true } },
    max_tokens: maxTokens,
  })) as { response?: string } | string | null;
  const raw = typeof result === "string" ? result : (result?.response ?? "");
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
    console.error("[ai] empty/invalid JSON → heuristic fallback");
  } catch (err) {
    console.error("[ai] extraction failed → heuristic fallback:", err);
  }
  return heuristicParse(userText);
}

/** استخراج فقط تاریخ پایان از جواب کوتاه کاربر (مثل «تا پنجشنبه») */
export async function extractDueDate(env: Env, text: string): Promise<string> {
  try {
    const parsed = await runJson(
      env,
      [
        {
          role: "system",
          content: [
            `The user is answering the question "تا کی باید این تسک تموم بشه؟" (until when is this task due?) in Persian.`,
            `Today is ${todayTehranISO()} (Gregorian, Tehran) = ${todayJalaliFa()} Jalali.`,
            'Convert their answer to a Gregorian ISO date "YYYY-MM-DD". If you cannot determine any date, reply {"date": ""}.',
          ].join(" "),
        },
        { role: "user", content: text.slice(0, 300) },
      ],
      DATE_JSON_SCHEMA,
      "due_date",
      100
    );
    const d = String(parsed?.date ?? "");
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
  } catch (err) {
    console.error("[ai] extractDueDate failed:", err);
    return "";
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isTaskStatus(v: unknown): v is TaskStatus {
  return v === "not_started" || v === "in_progress" || v === "done";
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
  const status: TaskStatus = isTaskStatus(j?.status) ? j.status : "not_started";
  if (!title) return heuristicParse(originalText);
  return { intent, title, description, assignee_name, start_date, due_date, status };
}

/** فالبک بدون AI: جدا کردن عنوان/توضیحات و تشخیص ساده‌ی تاریخ‌های رایج فارسی */
export function heuristicParse(text: string): ParsedTask {
  let t = text.replace(/احمق/g, " ");
  t = t.replace(
    /(این|یه)?\s*(تسک|تسکی|تاسک)\s*(رو|را)?\s*(برای\s*من)?\s*(ایجاد\s*کن|ایجاد\s*کنید|بساز|بسازید|ساخت\s*کن|بسازه)/g,
    " "
  );
  t = t.replace(/^[\s:：،,–-]+/, "").trim();

  let due_date = "";
  const m = t.match(/(?:تا|سررسید)\s+([^،,.\n؛]+)/);
  if (m) {
    due_date = parseRelativeFaDate(m[1], todayTehranISO());
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
    start_date: "", // کد فراخوان‌کننده به‌صورت پیش‌فرض «امروز» می‌گذارد
    due_date,
    status: "not_started",
  };
}
