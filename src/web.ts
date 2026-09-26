/**
 * وب‌اپ — همان مغزِ بات تلگرام، با رابط JSON.
 *
 * ورود:
 *  POST /api/auth/login    {username, password}   ← همان یوزرنیم/رمز ثبت‌نام در بات
 *  POST /api/auth/webapp   {initData}             ← دکمه‌ی 🌐 داخل تلگرام (بدون رمز)
 *  POST /api/auth/logout
 *  GET  /api/me
 *
 * تسک‌ها:
 *  GET    /api/tasks?scope=mine|all&filter=open|done|all
 *  POST   /api/parse   {text, dueText?}           ← پیش‌نمایشِ ساخت تسک با هوش مصنوعی
 *  POST   /api/tasks   {text, dueText?, assigneeId?}
 *  GET    /api/tasks/:id
 *  PATCH  /api/tasks/:id                          ← وضعیت/عنوان/تاریخ/یادآوری/مسئول
 *  DELETE /api/tasks/:id
 *
 * دیگر:
 *  GET /api/users    (ادمین)   — لیست کاربرها
 *  GET /api/report   (scope=mine|all) — گزارش HTML هفتگی/کلی
 *
 * نشست: توکن تصادفی در کوکی HttpOnly؛ هشِ توکن در جدول web_sessions (D1).
 */
import type { Env, TaskRow, UserRow } from "./types";
import type { NewTask } from "./db";
import { sha256Hex } from "./auth";
import {
  createTask,
  deleteTaskById,
  findUserByLogin,
  getTask,
  getUser,
  listTasks,
  setTaskFields,
  updateTaskStatus,
} from "./db";
import { extractTask } from "./ai";
import { resolveTaskFields } from "./taskparse";
import { todayTehranISO, parseRelativeFaDateTime, parseReminderSpec, reminderSpecText, fmtDate } from "./dates";
import { displayName, truncate } from "./format";
import { escapeHtml, sendMessage } from "./telegram";
import { buildReportModel, buildHtmlReport } from "./exporter";

const SESSION_COOKIE = "ah_session";
const SESSION_DAYS = 30;

// ============================================================
// نشست‌ها
// ============================================================

async function createSession(env: Env, userId: number): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await env.DB.prepare("INSERT INTO web_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, userId, now.toISOString(), expires.toISOString())
    .run();
  // خانه‌تکانی سبک: نشست‌های منقضی‌شده‌ی همین کاربر
  await env.DB.prepare("DELETE FROM web_sessions WHERE user_id = ? AND expires_at < ?")
    .bind(userId, now.toISOString())
    .run();
  return token;
}

async function sessionUser(env: Env, request: Request): Promise<UserRow | null> {
  const cookie = request.headers.get("Cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([A-Za-z0-9]+)`));
  if (!m) return null;
  const tokenHash = await sha256Hex(m[1]);
  const row = await env.DB.prepare(
    `SELECT u.* FROM web_sessions s JOIN users u ON u.user_id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`
  )
    .bind(tokenHash, new Date().toISOString())
    .first<UserRow>();
  return row ?? null;
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}

function clearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function withAuth(token: string, body: unknown): Response {
  return Response.json(body, { headers: { "Set-Cookie": sessionCookie(token) } });
}

// ============================================================
// ورود
// ============================================================

async function apiLogin(env: Env, body: any): Promise<Response> {
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  if (!username || !password) return json({ ok: false, error: "نام کاربری و رمز را وارد کن." }, 400);
  const u = await findUserByLogin(env, username);
  const hash = await sha256Hex(password);
  if (!u || !u.password_hash || u.password_hash !== hash) {
    return json({ ok: false, error: "نام کاربری یا رمز درست نیست." }, 401);
  }
  const token = await createSession(env, u.user_id);
  return withAuth(token, { ok: true, user: publicUser(u) });
}

/** اعتبارسنجی initData تلگرام (Mini App) — HMAC-SHA256 با کلیدِ «WebAppData» */
async function validateInitData(env: Env, initData: string): Promise<number | null> {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    const authDate = Number(params.get("auth_date") ?? 0);
    if (!hash || !authDate) return null;
    // تازگیِ امضا: حداکثر ۲۴ ساعت
    if (Math.abs(Date.now() / 1000 - authDate) > 86_400) return null;
    params.delete("hash");
    const pairs = [...params.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode("WebAppData"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, enc.encode(dataCheckString));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (hex !== hash) return null;
    const tu = JSON.parse(params.get("user") ?? "{}");
    return typeof tu.id === "number" ? tu.id : null;
  } catch {
    return null;
  }
}

async function apiWebappLogin(env: Env, body: any): Promise<Response> {
  const initData = String(body?.initData ?? "");
  const telegramId = await validateInitData(env, initData);
  if (!telegramId) return json({ ok: false, error: "امضای تلگرام معتبر نیست — از داخل بات دوباره باز کن." }, 401);
  const u = await getUser(env, telegramId);
  if (!u) return json({ ok: false, error: "اول یک بار به بات پیام بده تا حسابت ساخته شود." }, 404);
  const token = await createSession(env, u.user_id);
  return withAuth(token, { ok: true, user: publicUser(u) });
}

async function apiLogout(env: Env, request: Request): Promise<Response> {
  const cookie = request.headers.get("Cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([A-Za-z0-9]+)`));
  if (m) {
    const tokenHash = await sha256Hex(m[1]);
    await env.DB.prepare("DELETE FROM web_sessions WHERE token_hash = ?").bind(tokenHash).run();
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Set-Cookie": clearCookie() },
  });
}

// ============================================================
// کمکی‌ها
// ============================================================

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function publicUser(u: UserRow) {
  return {
    id: u.user_id,
    name: displayName(u),
    username: u.username_login,
    role: u.role,
  };
}

function isAdmin(u: UserRow | null): boolean {
  return u?.role === "admin";
}

function taskView(t: TaskRow, names: Map<number, string>): unknown {
  const spec = reminderSpecText(t);
  const dueMs = t.due_at
    ? Date.parse(t.due_at)
    : t.due_date
      ? Date.parse(`${t.due_date}T23:59:59+03:30`)
      : 0;
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    startDate: t.start_date,
    startAt: t.start_at,
    dueDate: t.due_date,
    dueAt: t.due_at,
    dueLabel: t.due_date ? fmtDate(t.due_date) : null,
    overdue: t.status !== "done" && dueMs > 0 && Date.now() > dueMs,
    reminderType: t.reminder_type,
    reminderLabel: spec,
    assigneeId: t.assignee_id,
    assigneeName: names.get(t.assignee_id) ?? "؟",
    creatorId: t.creator_id,
    creatorName: names.get(t.creator_id) ?? "؟",
    createdAt: t.created_at,
  };
}

async function nameMap(env: Env, ids: number[]): Promise<Map<number, string>> {
  const uniq = [...new Set(ids)].filter((x) => x > 0);
  const map = new Map<number, string>();
  for (const id of uniq) {
    const u = await getUser(env, id);
    if (u) map.set(id, displayName(u));
  }
  return map;
}

/** آیا کاربرِ جاری حق دیدن/ویرایش این تسک را دارد؟ */
function canTouch(u: UserRow, t: TaskRow): boolean {
  return isAdmin(u) || t.assignee_id === u.user_id || t.creator_id === u.user_id;
}

// ============================================================
// مسیرها
// ============================================================

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // ---- ورود (بدون نشست) ----
  if (path === "/api/auth/login" && method === "POST") return apiLogin(env, await readBody(request));
  if (path === "/api/auth/webapp" && method === "POST") return apiWebappLogin(env, await readBody(request));
  if (path === "/api/auth/logout" && method === "POST") return apiLogout(env, request);

  const me = await sessionUser(env, request);
  if (!me) return json({ ok: false, error: "unauthorized" }, 401);

  // ---- من ----
  if (path === "/api/me" && method === "GET") return json({ ok: true, user: publicUser(me) });

  // ---- کاربرها (ادمین) ----
  if (path === "/api/users" && method === "GET") {
    if (!isAdmin(me)) return json({ ok: false, error: "forbidden" }, 403);
    const res = await env.DB.prepare(
      "SELECT * FROM users ORDER BY created_at DESC LIMIT 200"
    ).all<UserRow>();
    const users = (res.results ?? []).map(publicUser);
    return json({ ok: true, users });
  }

  // ---- تسک‌ها: فهرست ----
  if (path === "/api/tasks" && method === "GET") {
    const scope = url.searchParams.get("scope") === "all" && isAdmin(me) ? "all" : "mine";
    const filterParam = url.searchParams.get("filter");
    const filter = filterParam === "done" ? "done" : filterParam === "all" ? "all" : "open";
    const tasks = await listTasks(env, {
      involved: scope === "mine" ? me.user_id : undefined,
      status: filter === "open" ? "open" : filter === "done" ? "done" : undefined,
    });
    const names = await nameMap(env, tasks.flatMap((t) => [t.assignee_id, t.creator_id]));
    return json({ ok: true, scope, filter, tasks: tasks.map((t) => taskView(t, names)) });
  }

  // ---- تسک‌ها: پیش‌نمایش ساخت با هوش مصنوعی ----
  if (path === "/api/parse" && method === "POST") {
    const body = await readBody(request);
    const text = String(body?.text ?? "").trim();
    if (!text) return json({ ok: false, error: "متن تسک را بنویس." }, 400);
    const draft = await buildDraft(env, me, text, String(body?.dueText ?? ""));
    if (!draft) return json({ ok: false, error: "نفیهمیدم قراره چی بسازم — عنوان تسک مشخص نیست." }, 422);
    return json({ ok: true, draft });
  }

  // ---- تسک‌ها: ساخت ----
  if (path === "/api/tasks" && method === "POST") {
    const body = await readBody(request);
    const text = String(body?.text ?? "").trim();
    if (!text) return json({ ok: false, error: "متن تسک را بنویس." }, 400);
    const draft = await buildDraft(env, me, text, String(body?.dueText ?? ""), Number(body?.assigneeId ?? 0));
    if (!draft) return json({ ok: false, error: "نفیهمیدم قراره چی بسازم — عنوان تسک مشخص نیست." }, 422);
    if (!draft.dueDate) return json({ ok: false, needDue: true, error: "تاریخ پایان لازم است." }, 400);
    const assigneeId = isAdmin(me) && draft.assigneeId ? draft.assigneeId : me.user_id;
    const task = await createTask(env, {
      title: truncate(draft.title, 200),
      description: draft.description,
      creator_id: me.user_id,
      assignee_id: assigneeId,
      status: (draft.status === "in_progress" ? "in_progress" : draft.status === "done" ? "done" : "not_started") as import("./types").TaskStatus,
      start_date: draft.startDate,
      start_at: draft.startAt,
      due_date: draft.dueDate,
      due_at: draft.dueAt,
      auto_start: draft.startDate > todayTehranISO(),
      reminder: draft.reminder,
    } satisfies NewTask);
    if (!task) return json({ ok: false, error: "ساخت تسک ناموفق بود." }, 500);
    // 📨 یکپارچگی با تلگرام: به مسئول (اگر خودِ سازنده نیست) کارت تسک برود
    await announceWebTask(env, me, task);
    return json({ ok: true, task: taskView(task, await nameMap(env, [task.assignee_id, task.creator_id])) }, 201);
  }

  // ---- تسک: تکی (/api/tasks/:id) ----
  const mTask = path.match(/^\/api\/tasks\/(\d+)$/);
  if (mTask) {
    const id = Number(mTask[1]);
    const task = await getTask(env, id);
    if (!task) return json({ ok: false, error: "not_found" }, 404);
    if (!canTouch(me, task)) return json({ ok: false, error: "forbidden" }, 403);

    if (method === "GET") {
      return json({ ok: true, task: taskView(task, await nameMap(env, [task.assignee_id, task.creator_id])) });
    }

    if (method === "DELETE") {
      await deleteTaskById(env, id);
      return json({ ok: true });
    }

    if (method === "PATCH") {
      const body = await readBody(request);
      const fields: Record<string, string | number | null> = {};
      let taskAfter: TaskRow | null = task;

      // وضعیت
      const status = String(body?.status ?? "");
      if (status === "not_started" || status === "in_progress" || status === "done") {
        taskAfter = await updateTaskStatus(env, id, status);
        // به سازنده خبر بده اگر کسی جز خودش تمومش کرد
        if (status === "done" && task.creator_id !== me.user_id) {
          const creator = await getUser(env, task.creator_id);
          if (creator?.chat_id) {
            await sendMessage(
              env,
              creator.chat_id,
              `✅ ${escapeHtml(displayName(me))} از طریق وب تسک «${escapeHtml(truncate(task.title, 60))}» (شناسه ${task.id}) را تمام کرد.`
            );
          }
        }
      }

      // عنوان و توضیح
      if (typeof body?.title === "string" && body.title.trim()) fields.title = truncate(body.title.trim(), 200);
      if (typeof body?.description === "string") fields.description = truncate(body.description, 1000);

      // تاریخ پایان به زبان طبیعی («تا پنجشنبه») یا ISO
      if (typeof body?.dueText === "string" && body.dueText.trim()) {
        const today = todayTehranISO();
        let dueDate = "";
        let dueTime: string | null = null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(body.dueText.trim())) dueDate = body.dueText.trim();
        else {
          const dt = parseRelativeFaDateTime(body.dueText.trim(), today);
          dueDate = dt.date ?? "";
          dueTime = dt.time;
        }
        if (!dueDate) return json({ ok: false, error: "تاریخ پایان را نفهمیدم." }, 422);
        fields.due_date = dueDate;
        fields.due_at = dueTime ? `${dueDate}T${dueTime}:00+03:30` : null;
        fields.last_reminded_at = new Date().toISOString();
      }

      // یادآوری به زبان طبیعی («هر روز ساعت ۸») — «هیچ» = خاموش
      if (typeof body?.reminderText === "string") {
        const t = body.reminderText.trim();
        if (!t || /^(هیچ|هیچی|ندارم|خاموش|حذف|پاک)$/.test(t)) {
          fields.reminder_type = "none";
          fields.reminder_time = null;
          fields.reminder_interval_hours = null;
          fields.reminder_lead_minutes = null;
          fields.reminder_at = null;
          fields.reminder_done = 0;
        } else {
          const spec = parseReminderSpec(t, todayTehranISO());
          if (!spec) return json({ ok: false, error: "الگوی یادآوری را نفهمیدم. مثال: «هر روز ساعت ۸» یا «هر ۳ ساعت»." }, 422);
          fields.reminder_type = spec.type;
          fields.reminder_time = spec.time;
          fields.reminder_interval_hours = spec.interval_hours;
          fields.reminder_lead_minutes = spec.lead_minutes;
          fields.reminder_at = spec.at;
          fields.reminder_done = 0;
          fields.last_reminded_at = new Date().toISOString();
        }
      }

      // واگذاری (فقط ادمین)
      if (body?.assigneeId != null && isAdmin(me)) {
        const aid = Number(body.assigneeId);
        const target = await getUser(env, aid);
        if (target) fields.assignee_id = aid;
      }

      if (Object.keys(fields).length) taskAfter = await setTaskFields(env, id, fields);
      return json({ ok: true, task: taskView(taskAfter ?? task, await nameMap(env, [task.assignee_id, task.creator_id])) });
    }
  }

  // ---- گزارش (همان موتور خروجی HTML بات) ----
  if (path === "/api/report" && method === "GET") {
    const scope = url.searchParams.get("scope") === "all" && isAdmin(me) ? "all" : "mine";
    const tasks = await listTasks(env, {
      involved: scope === "mine" ? me.user_id : undefined,
    });
    const model = buildReportModel(
      tasks,
      scope === "all" ? "همه‌ی کاربرها" : "تسک‌های من",
      scope === "all" ? await usersInfo(env, tasks) : undefined
    );
    return json({ ok: true, html: buildHtmlReport(model, "report") });
  }

  return json({ ok: false, error: "not_found" }, 404);
}

async function usersInfo(env: Env, tasks: TaskRow[]): Promise<{ id: number; name: string }[]> {
  const names = await nameMap(env, tasks.map((t) => t.assignee_id));
  return [...names.entries()].map(([id, name]) => ({ id, name }));
}

async function readBody(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// ============================================================
// پیش‌نویس تسک از متن طبیعی — همان خط لوله‌ی بات
// ============================================================

interface WebDraft {
  title: string;
  description: string;
  status: string;
  startDate: string;
  startAt: string | null;
  dueDate: string; // "" = نگفته
  dueAt: string | null;
  reminder: import("./types").ReminderSpec | null;
  assigneeId: number;
  assigneeName: string | null;
}

async function buildDraft(
  env: Env,
  me: UserRow,
  text: string,
  dueText: string,
  assigneeId = 0
): Promise<WebDraft | null> {
  const today = todayTehranISO();
  const known = await recentUsersText(env);
  const parsed = await extractTask(env, text, known);
  if (parsed.intent !== "create_task" || !parsed.title) return null;

  const F = resolveTaskFields(text, parsed, today);

  // تاریخِ پایانِ تکمیلی که کاربر جدا گفت (مرحله‌ی «تا کی؟» در UI)
  let dueDate = F.due_date;
  let dueAt = F.due_at;
  if (!dueDate && dueText.trim()) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dueText.trim())) dueDate = dueText.trim();
    else {
      const dt = parseRelativeFaDateTime(dueText.trim(), today);
      dueDate = dt.date ?? "";
      dueAt = dt.time ? `${dueDate}T${dt.time}:00+03:30` : null;
    }
  }

  // مسئول: ادمین می‌تواند انتخاب کند؛ غیر ادمین خودش
  let aid = me.user_id;
  let aname: string | null = null;
  if (isAdmin(me) && assigneeId > 0) {
    const target = await getUser(env, assigneeId);
    if (target) {
      aid = target.user_id;
      aname = displayName(target);
    }
  }

  return {
    title: parsed.title,
    description: parsed.description ?? "",
    status: parsed.status || "not_started",
    startDate: F.start_date,
    startAt: F.start_at,
    dueDate,
    dueAt,
    reminder: F.reminder,
    assigneeId: aid,
    assigneeName: aname,
  };
}

async function recentUsersText(env: Env): Promise<string> {
  const res = await env.DB.prepare(
    "SELECT first_name, username_login, username, alias FROM users ORDER BY updated_at DESC LIMIT 15"
  ).all<any>();
  return (res.results ?? []).map((u) => u.alias || u.username_login || u.first_name || u.username || "").filter(Boolean).join(", ");
}

/** کارتِ کوتاه تسکِ ساخته‌شده در وب → تلگرامِ مسئول */
async function announceWebTask(env: Env, me: UserRow, task: TaskRow): Promise<void> {
  if (task.assignee_id === me.user_id) return;
  const assignee = await getUser(env, task.assignee_id);
  if (!assignee?.chat_id) return;
  const spec = reminderSpecText(task);
  await sendMessage(
    env,
    assignee.chat_id,
    [
      `🆕 ${escapeHtml(displayName(me))} از طریق وب برایت تسک ساخت:`,
      `«${escapeHtml(truncate(task.title, 80))}» — شناسه ${task.id}`,
      task.due_date ? `سررسید: ${fmtDate(task.due_date)}${task.due_at ? ` — ساعت ${task.due_at.slice(11, 16)}` : ""}` : "",
      spec ? `الگوی یادآوری: ${escapeHtml(spec)}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );
}
