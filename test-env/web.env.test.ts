/**
 * وب‌اپ — تست API (src/web.ts)
 * ورود با رمز، نشست‌ها، ساخت تسک با همان مغز بات، ویرایش، گزارش و ورود تلگرامی.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Harness, ALI } from "./harness";
import worker from "../src/index";
import { sha256Hex } from "../src/auth";

let h: Harness;

async function req(method: string, path: string, body?: unknown, cookie?: string): Promise<{ status: number; data: any; cookie: string | null }> {
  const res = await worker.fetch!(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    h.env as never,
    { waitUntil: () => {} } as never
  );
  let data: any = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data, cookie: res.headers.get("Set-Cookie") };
}

/** ساخت initData معتبر تلگرام (Mini App) با همان الگوریتم بات */
async function signedInitData(telegramId: number): Promise<string> {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: "AAF1",
    user: JSON.stringify({ id: telegramId, first_name: "علی", username: "ali_user" }),
  });
  const pairs = [...params.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(dataCheckString));
  const hash = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${params.toString()}&hash=${hash}`;
}

beforeEach(async () => {
  h = new Harness();
  await h.init();
  // کاربر علی از قبل با بات حرف زده و ثبت‌نامِ وب دارد
  await h.say(ALI, "سلام");
  const hash = await sha256Hex("pass123");
  (h.env.DB as any).raw("UPDATE users SET username_login = 'ali', password_hash = ?, role = 'user' WHERE user_id = ?").run(hash, ALI.id);
});

afterEach(() => {
  vi.restoreAllMocks?.();
});

describe("ورود و نشست", () => {
  it("بدون کوکی → 401", async () => {
    const r = await req("GET", "/api/me");
    expect(r.status).toBe(401);
  });

  it("رمز غلط → 401", async () => {
    const r = await req("POST", "/api/auth/login", { username: "ali", password: "wrong" });
    expect(r.status).toBe(401);
  });

  it("رمز درست → نشست + پروفایل", async () => {
    const r = await req("POST", "/api/auth/login", { username: "ali", password: "pass123" });
    expect(r.status).toBe(200);
    expect(r.data.ok).toBe(true);
    expect(r.cookie).toContain("ah_session=");
    const me = await req("GET", "/api/me", undefined, r.cookie!.split(";")[0]);
    expect(me.status).toBe(200);
    expect(me.data.user.name).toContain("علی");
  });

  it("ورود تلگرامی (initData معتبر) — همان کاربر، بدون رمز", async () => {
    const initData = await signedInitData(ALI.id);
    const r = await req("POST", "/api/auth/webapp", { initData });
    expect(r.status).toBe(200);
    expect(r.data.user.name).toContain("علی");
    const me = await req("GET", "/api/me", undefined, r.cookie!.split(";")[0]);
    expect(me.status).toBe(200);
  });

  it("initData دستکاری‌شده → 401", async () => {
    const initData = (await signedInitData(ALI.id)).replace(/ali_user/, "hacker");
    const r = await req("POST", "/api/auth/webapp", { initData });
    expect(r.status).toBe(401);
  });

  it("خروج → کوکی پاک و 401 بعدش", async () => {
    const login = await req("POST", "/api/auth/login", { username: "ali", password: "pass123" });
    const cookie = login.cookie!.split(";")[0];
    const out = await req("POST", "/api/auth/logout", {}, cookie);
    expect(out.status).toBe(200);
    const me = await req("GET", "/api/me", undefined, cookie);
    expect(me.status).toBe(401);
  });
});

describe("تسک‌ها — همان مغز بات", () => {
  let cookie = "";

  beforeEach(async () => {
    const login = await req("POST", "/api/auth/login", { username: "ali", password: "pass123" });
    cookie = login.cookie!.split(";")[0];
  });

  it("پیش‌نمایش ساخت: تاریخ و عنوان از متن فارسی", async () => {
    const r = await req("POST", "/api/parse", { text: "احمق یه تسک بساز: خرید نان، تا فردا" }, cookie);
    expect(r.status).toBe(200);
    expect(r.data.draft.title).toContain("نان");
    expect(r.data.draft.dueDate).toBeTruthy(); // «تا فردا» حل شده
    expect(r.data.draft.reminder).toBeNull(); // سکوت پیش‌فرض
  });

  it("بدون تاریخ پایان → needDue؛ با dueText → ساخته می‌شود", async () => {
    const noDue = await req("POST", "/api/tasks", { text: "احمق یه تسک بساز: تماس با مشتری" }, cookie);
    expect(noDue.status).toBe(400);
    expect(noDue.data.needDue).toBe(true);

    const r = await req("POST", "/api/tasks", { text: "احمق یه تسک بساز: تماس با مشتری", dueText: "پس‌فردا" }, cookie);
    expect(r.status).toBe(201);
    expect(r.data.task.title).toContain("تماس");
    expect(r.data.task.dueDate).toBeTruthy();
    expect(r.data.task.reminderType).toBe("none"); // قانون سکوت مطلق
    expect(r.data.task.assigneeName).toContain("علی");
  });

  it("یادآوریِ خواسته‌شده از متن → daily", async () => {
    const r = await req(
      "POST",
      "/api/tasks",
      { text: "احمق یه تسک بساز: مرور شبانه، تا فردا، هر روز ساعت ۸ یادم بنداز" },
      cookie
    );
    expect(r.status).toBe(201);
    expect(r.data.task.reminderType).toBe("daily");
    expect(r.data.task.reminderLabel).toContain("هر روز");
  });

  it("فهرست → تسک دیده می‌شود؛ ویرایش وضعیت/یادآوری/تاریخ؛ حذف", async () => {
    const created = await req("POST", "/api/tasks", { text: "احمق یه تسک بساز: جواب ایمیل", dueText: "فردا" }, cookie);
    const id = created.data.task.id;

    const list = await req("GET", "/api/tasks?scope=mine&filter=open", undefined, cookie);
    expect(list.data.tasks.some((t: any) => t.id === id)).toBe(true);

    const done = await req("PATCH", `/api/tasks/${id}`, { status: "done" }, cookie);
    expect(done.data.task.status).toBe("done");

    const rem = await req("PATCH", `/api/tasks/${id}`, { reminderText: "هر ۳ ساعت" }, cookie);
    expect(rem.data.task.reminderType).toBe("every_hours");
    expect(rem.data.task.reminderLabel).toContain("۳");

    const due = await req("PATCH", `/api/tasks/${id}`, { dueText: "پنجشنبه" }, cookie);
    expect(due.data.task.dueDate).toBeTruthy();

    const del = await req("DELETE", `/api/tasks/${id}`, undefined, cookie);
    expect(del.status).toBe(200);
    const after = await req("GET", `/api/tasks/${id}`, undefined, cookie);
    expect(after.status).toBe(404);
  });

  it("گزارش HTML همان موتور خروجی بات", async () => {
    await req("POST", "/api/tasks", { text: "احمق یه تسک بساز: گزارش تست", dueText: "فردا" }, cookie);
    const r = await req("GET", "/api/report?scope=mine", undefined, cookie);
    expect(r.status).toBe(200);
    expect(r.data.html).toContain("گزارش");
  });

  it("کاربرها فقط برای ادمین", async () => {
    const forbidden = await req("GET", "/api/users", undefined, cookie);
    expect(forbidden.status).toBe(403);

    (h.env.DB as any).raw("UPDATE users SET role = 'admin' WHERE user_id = ?").run(ALI.id);
    const ok = await req("GET", "/api/users", undefined, cookie);
    expect(ok.status).toBe(200);
    expect(ok.data.users.length).toBeGreaterThan(0);
  });
});
