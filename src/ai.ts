/**
 * استخراج ساختار تسک از زبان طبیعی فارسی با Workers AI
 * (+ فالبک هیوریستیک اگر AI در دسترس نبود یا خطا داد)
 */
import type { Env, ParsedTask, TaskStatus } from "./types";
import { addDaysISO, todayTehranISO } from "./dates";

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

function systemPrompt(today: string, knownUsers: string): string {
  return [
    "You are the task-extraction brain of a Persian (Farsi) Telegram task-manager bot.",
    'Users jokingly address the bot as "احمق" (idiot) — ignore such insults and any meta phrases like "این تسک رو ایجاد کن" / "بساز".',
    `Today's date (Gregorian, Tehran time) is ${today}.`,
    "Extract the task from the user's message and answer ONLY with JSON matching the schema.",
    "Rules:",
    '- intent: "create_task" only if the user clearly wants a task created; otherwise "other".',
    "- title: short imperative task title (max ~90 characters), written in the SAME language as the task text (usually Persian). Never include insults or meta phrases in it.",
    '- description: remaining details, or "" if none.',
    '- assignee: who must do the task — a username (without @) or a first name exactly as written. If it refers to the speaker (من/خودم) or nobody else is mentioned, use "".',
    '- start_date / due_date: Gregorian ISO "YYYY-MM-DD" or "". Resolve relative Persian dates (فردا، پس‌فردا، امشب، آخر هفته، شنبه، ۱۵ مرداد، …) using today\'s date. due_date is the deadline (تاریخ پایان). If only a deadline is given, leave start_date empty.',
    '- status: "not_started" unless the message implies work already started ("شروع کردم") or is already finished ("انجام دادم", "تمومه").',
    `Known users of this bot (use for assignee matching): ${knownUsers || "(none yet)"}.`,
  ].join("\n");
}

export async function extractTask(env: Env, text: string, knownUsers = ""): Promise<ParsedTask> {
  const model = env.AI_MODEL || DEFAULT_MODEL;
  const userText = text.slice(0, 2000);
  try {
    const run = env.AI.run as unknown as (m: string, i: unknown) => Promise<unknown>;
    const result = (await run(model, {
      messages: [
        { role: "system", content: systemPrompt(todayTehranISO(), knownUsers) },
        { role: "user", content: userText },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "extracted_task", schema: TASK_JSON_SCHEMA, strict: true },
      },
      max_tokens: 600,
    })) as { response?: string } | string | null;

    const raw = typeof result === "string" ? result : (result?.response ?? "");
    const parsed = JSON.parse(raw);
    return normalize(parsed, userText);
  } catch (err) {
    console.error("[ai] extraction failed → heuristic fallback:", err);
    return heuristicParse(userText);
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

/** فالبک بدون AI: جدا کردن عنوان/توضیحات و تشخیص ساده‌ی «تا فردا» و مشابه آن */
export function heuristicParse(text: string): ParsedTask {
  let t = text.replace(/احمق/g, " ");
  t = t.replace(
    /(این|یه)?\s*(تسک|تسکی|تاسک)\s*(رو|را)?\s*(برای\s*من)?\s*(ایجاد\s*کن|ایجاد\s*کنید|بساز|بسازید|ساخت\s*کن|بسازه)/g,
    " "
  );
  t = t.replace(/^[\s:：،,–-]+/, "").trim();

  let due_date = "";
  const m = t.match(/تا\s+(فردا|پس\s*فردا|پسفردا|امشب|هفته\s*آینده|آینده)/);
  if (m) {
    const w = m[1];
    if (w.includes("پس")) due_date = addDaysISO(todayTehranISO(), 2);
    else if (w === "فردا") due_date = addDaysISO(todayTehranISO(), 1);
    else if (w === "امشب") due_date = todayTehranISO();
    else due_date = addDaysISO(todayTehranISO(), 7);
    // عبارت تاریخ را از متن حذف کن تا داخل توضیحات نیاید
    t = t.replace(m[0], " ").trim();
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
    due_date,
    status: "not_started",
  };
}
