/**
 * محیط تست ایزوله — تلگرام ماک + ساعت مجازی + کاربران فیک
 *
 * «محیط ایزوله»: روز و ساعت شمسیِ واقعی (همان todayTehranISO کد اصلی)،
 * ولی زمان با هر فراخوانی advance() جلو می‌رود (معادل سرعت ۲x/۳x یا بیشتر)
 * و کرون هر ۱۰ دقیقه مجازی اجرا می‌شود — دقیقاً مثل ورکر واقعی.
 */
import { vi, beforeEach, afterEach } from "vitest";
import { D1Like } from "./d1";
import { handleUpdate } from "../src/handlers";
import worker from "../src/index";
import type { Env, TaskRow } from "../src/types";

export const ADMIN_USER = "admin";
export const ADMIN_PASS = "sadjad4444family";

/** کاربران فیک صحنه */
export const ASGHAR = { id: 1001, first_name: "اصغر", username: "asghar_admin" }; // ادمین
export const ALI = { id: 1002, first_name: "علی", username: "ali_user" }; // کاربر عادی
export const MOHAMMAD = { id: 1003, first_name: "ممد", username: "mmd_user" }; // کاربر عادی

export interface SentMessage {
  kind: "message" | "document" | "answerCallback" | "editMessage";
  method: string;
  chat_id?: number;
  text?: string;
  caption?: string;
  filename?: string;
  mime?: string;
  size?: number;
  keyboard?: unknown;
  raw?: unknown;
}

const realFetch = globalThis.fetch;

export class Harness {
  env!: Env;
  outbox: SentMessage[] = [];
  aiQueue: Array<Record<string, unknown>> = [];
  private cursor = 0; // زمان مجازی
  private lastTick = 0;

  async init(startReal = true) {
    // اگر ساعتِ صحنه‌ی قبلی فیک بوده، اول واقعی کن تا «امروز» درست محاسبه شود
    vi.useRealTimers();
    const db = new D1Like();
    // ساعت مجازی = الان (روز شمسی واقعی)، ساعت ۱۰ صبح تهران برای قطعیت
    const now = new Date();
    const tehranNow = new Date(now.getTime() + 3.5 * 3600_000);
    const base = Date.UTC(
      tehranNow.getUTCFullYear(),
      tehranNow.getUTCMonth(),
      tehranNow.getUTCDate(),
      6,
      30,
      0
    ); // ۱۰:۰۰ تهران = ۰۶:۳۰ UTC
    this.cursor = startReal ? base : base;
    this.lastTick = this.cursor;

    vi.useFakeTimers({ now: this.cursor, shouldAdvanceTime: false });

    const self = this;
    this.env = {
      DB: db as unknown as Env["DB"],
      AI: {
        run: async (_model: string, _input: unknown) => {
          if (self.aiQueue.length) return { response: self.aiQueue.shift() };
          return { response: "" }; // → مسیر هیوریستیک
        },
      } as unknown as Env["AI"],
      TELEGRAM_BOT_TOKEN: "TEST:TOKEN",
      TELEGRAM_BOT_USERNAME: "ahmagh_agent_bot",
      AI_MODEL: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      ADMIN_USERNAME: ADMIN_USER,
      ADMIN_PASSWORD: ADMIN_PASS,
      CARD_EDIT_DELAY_MS: 0, // بدون تأخیر تا تست‌ها سریع و قطعی باشند
    } as Env;

    // تلگرام ماک
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = String(input);
      if (!url.includes("api.telegram.org")) return realFetch(input, init);
      const method = url.split("/").pop() ?? "";
      const entry: SentMessage = { kind: "message", method };
      if (init?.body instanceof FormData) {
        entry.kind = "document";
        for (const [k, v] of [...(init.body as FormData).entries()]) {
          if (k === "chat_id") entry.chat_id = Number(v);
          else if (k === "caption") entry.caption = String(v);
          else if (k === "document") {
            const blob = v as Blob;
            entry.filename = (v as File).name ?? "file";
            entry.mime = blob.type;
            entry.size = blob.size;
          }
        }
      } else if (init?.body) {
        const p = JSON.parse(init.body);
        entry.chat_id = p.chat_id;
        entry.text = p.text;
        entry.caption = p.caption;
        entry.keyboard = p.reply_markup;
        entry.raw = p;
        entry.kind =
          method === "sendMessage" ? "message" : method === "answerCallbackQuery" ? "answerCallback" : "editMessage";
      }
      self.outbox.push(entry);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1, chat: { id: entry.chat_id } } }), {
        status: 200,
      });
    }) as typeof fetch;

    return this;
  }

  /** پیام متنی از یک کاربر فیک */
  async say(user: { id: number; first_name: string; username: string }, text: string) {
    await handleUpdate(this.env, {
      update_id: Math.floor(Math.random() * 1e9),
      message: {
        message_id: Math.floor(Math.random() * 1e5),
        from: { id: user.id, is_bot: false, first_name: user.first_name, username: user.username },
        chat: { id: user.id, type: "private" },
        date: Math.floor(this.cursor / 1000),
        text,
      },
    });
  }

  /** دکمه شیشه‌ای */
  async callback(user: { id: number; first_name: string; username: string }, data: string) {
    await handleUpdate(this.env, {
      update_id: Math.floor(Math.random() * 1e9),
      callback_query: {
        id: String(Math.floor(Math.random() * 1e9)),
        from: { id: user.id, is_bot: false, first_name: user.first_name, username: user.username },
        message: { message_id: 1, chat: { id: user.id, type: "private" } },
        data,
      },
    });
  }

  /** یک تیک کرون (مثل ورکر واقعی هر ۱۰ دقیقه) */
  async tick() {
    const pending: Promise<unknown>[] = [];
    await worker.scheduled!( {} as never, this.env, { waitUntil: (p: Promise<unknown>) => pending.push(p) } as never);
    await Promise.all(pending);
  }

  /**
   * جلو بردن زمان مجازی + اجرای کرون روی هر مرز ۱۰ دقیقه‌ای.
   * speed: ضریب سرعت (۲ یا ۳) — مثلاً advance(1h, 3) یعنی ۱ ساعت «واقعی» تست که ۳ ساعت مجازی است.
   */
  async advance(durationMs: number, speed = 1, tickEveryMs = 10 * 60_000) {
    const target = this.cursor + durationMs * speed;
    while (this.lastTick + tickEveryMs <= target) {
      this.lastTick += tickEveryMs;
      vi.setSystemTime(this.lastTick);
      await this.tick();
    }
    this.cursor = target;
    vi.setSystemTime(this.cursor);
  }

  /** پرش مستقیم به یک لحظه (بدون تیک) */
  setTime(ms: number) {
    this.cursor = ms;
    vi.setSystemTime(ms);
  }

  now() {
    return this.cursor;
  }

  /** پیام‌های رسیده به یک چت */
  to(chatId: number) {
    return this.outbox.filter((m) => m.chat_id === chatId);
  }
  texts(chatId: number) {
    return this.to(chatId).filter((m) => m.kind === "message").map((m) => m.text ?? "");
  }
  lastText(chatId: number) {
    const t = this.texts(chatId);
    return t[t.length - 1] ?? "";
  }
  documents(chatId: number) {
    return this.to(chatId).filter((m) => m.kind === "document");
  }
  /** پیام‌های ویرایش‌شده (editMessageText — مثلاً تبدیل «تسک ساخته شد» به کارت) */
  edits(chatId: number) {
    return this.to(chatId).filter((m) => m.kind === "editMessage");
  }
  lastEdit(chatId: number) {
    const t = this.edits(chatId).map((m) => m.text ?? "");
    return t[t.length - 1] ?? "";
  }

  /** تسک‌ها (برای assertions) */
  tasks(): TaskRow[] {
    const r = (this.env.DB as unknown as D1Like).raw("SELECT * FROM tasks ORDER BY id").all() as TaskRow[];
    return r;
  }
  task(id: number): TaskRow | null {
    return ((this.env.DB as unknown as D1Like).raw("SELECT * FROM tasks WHERE id = ?").get(id) as TaskRow) ?? null;
  }
  /** تعداد پیام‌های یادآوری‌مانند به یک چت از یک لحظه به بعد */
  countSince(chatId: number, keyword: string) {
    return this.texts(chatId).filter((t) => t.includes(keyword)).length;
  }

  async dispose() {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
  }
}

/** ساخت هارنس + ثبت‌نام سه کاربر صحنه */
export async function createScene(): Promise<Harness> {
  const h = await new Harness().init();
  // ثبت‌نام: اصغر → ادمین؛ علی و ممد → کاربر عادی (با اسم مستعار)
  await h.say(ASGHAR, `/register ${ADMIN_USER} ${ADMIN_PASS} اصغر`);
  await h.say(ALI, "/register ali_user pass1234 علی");
  await h.say(MOHAMMAD, "/register mmd_user pass5678 ممد");
  h.outbox = []; // پیام‌های خوش‌آمد/ثبت‌نام را دور بریز
  return h;
}

export const CLEANUP = { beforeEach, afterEach };
