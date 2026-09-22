/**
 * لایه‌ی دیتابیس — همه‌ی کوئری‌های D1
 */
import type { Env, PendingDraft, PendingTaskRow, ReminderSpec, TaskRow, TaskStatus, UserRow } from "./types";

/** ثبت/به‌روزرسانی کاربر (هر بار که حرف بزند) */
export async function upsertUser(
  env: Env,
  from: { id: number; username?: string; first_name?: string; last_name?: string },
  chatId: number | null
): Promise<void> {
  const name = [from.first_name, from.last_name].filter((p): p is string => !!p).join(" ").trim() || null;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO users (user_id, username, first_name, chat_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       username   = COALESCE(excluded.username, users.username),
       first_name = COALESCE(excluded.first_name, users.first_name),
       chat_id    = COALESCE(users.chat_id, excluded.chat_id),
       updated_at = excluded.updated_at`
  )
    .bind(from.id, from.username ?? null, name, chatId, now, now)
    .run();
}

/** ثبت/به‌روزرسانی حساب ثبت‌نام (نام کاربری + هش رمز + نقش) */
export async function setUserCredentials(
  env: Env,
  userId: number,
  usernameLogin: string,
  passwordHash: string,
  role: string
): Promise<void> {
  await env.DB.prepare(
    "UPDATE users SET username_login = ?, password_hash = ?, role = ? WHERE user_id = ?"
  )
    .bind(usernameLogin, passwordHash, role, userId)
    .run();
}

/** جستجوی کاربر با نام کاربریِ ثبت‌نام */
export async function findUserByLogin(env: Env, usernameLogin: string): Promise<UserRow | null> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM users WHERE username_login = ? LIMIT 1"
  )
    .bind(usernameLogin)
    .all<UserRow>();
  return results?.[0] ?? null;
}

export async function getUser(env: Env, id: number): Promise<UserRow | null> {
  return (await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(id).first<UserRow>()) ?? null;
}

export async function findUserByUsername(env: Env, username: string): Promise<UserRow | null> {
  return (
    (await env.DB
      .prepare("SELECT * FROM users WHERE LOWER(username) = ? LIMIT 1")
      .bind(username.toLowerCase())
      .first<UserRow>()) ?? null
  );
}

export async function findUserByName(env: Env, name: string): Promise<UserRow | null> {
  return (
    (await env.DB
      .prepare("SELECT * FROM users WHERE first_name IS NOT NULL AND INSTR(LOWER(first_name), ?) > 0 LIMIT 1")
      .bind(name.toLowerCase())
      .first<UserRow>()) ?? null
  );
}

/** فهرست کاربرهای اخیر برای کمک به AI در تشخیص مسئول */
export async function recentUsers(env: Env, limit = 25): Promise<string> {
  const res = await env.DB.prepare(
    "SELECT first_name, username FROM users ORDER BY updated_at DESC LIMIT ?"
  )
    .bind(limit)
    .all<{ first_name: string | null; username: string | null }>();
  return (res.results ?? [])
    .map((u) => [u.first_name, u.username ? `@${u.username}` : null].filter(Boolean).join(" "))
    .join(", ");
}

export interface NewTask {
  title: string;
  description: string;
  creator_id: number;
  assignee_id: number;
  status: TaskStatus;
  start_date: string | null;
  start_at: string | null;
  due_date: string | null;
  due_at: string | null;
  auto_start: boolean;
  reminder: ReminderSpec | null;
}

export async function createTask(env: Env, t: NewTask): Promise<TaskRow | null> {
  const now = new Date().toISOString();
  const r = t.reminder;
  const res = await env.DB.prepare(
    `INSERT INTO tasks (title, description, creator_id, assignee_id, status, start_date, start_at, due_date, due_at, auto_start,
                        reminder_type, reminder_time, reminder_interval_hours, reminder_lead_minutes, reminder_at,
                        created_at, last_reminded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      t.title,
      t.description,
      t.creator_id,
      t.assignee_id,
      t.status,
      t.start_date,
      t.start_at,
      t.due_date,
      t.due_at,
      t.auto_start ? 1 : 0,
      r ? r.type : "default",
      r ? r.time : null,
      r ? r.interval_hours : null,
      r ? r.lead_minutes : null,
      r ? r.at : null,
      now,
      // الگوریتم پیش‌فرض: اولین یادآوری بعد از یک بازه‌ی کامل، نه بلافاصله.
      // یادآوری داینامیک: null شروع می‌شود تا قواعد خودش حاکم باشد.
      r ? null : now
    )
    .run();
  return getTask(env, res.meta.last_row_id);
}

export async function getTask(env: Env, id: number): Promise<TaskRow | null> {
  return (await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<TaskRow>()) ?? null;
}

/** تغییر وضعیت + مدیریت خودکار started_at / completed_at */
export async function updateTaskStatus(env: Env, id: number, status: TaskStatus): Promise<TaskRow | null> {
  const now = new Date().toISOString();
  if (status === "in_progress") {
    await env.DB.prepare(
      `UPDATE tasks
       SET status = 'in_progress', started_at = COALESCE(started_at, ?), completed_at = NULL
       WHERE id = ?`
    )
      .bind(now, id)
      .run();
  } else if (status === "done") {
    await env.DB.prepare(
      `UPDATE tasks
       SET status = 'done', completed_at = ?, started_at = COALESCE(started_at, ?)
       WHERE id = ?`
    )
      .bind(now, now, id)
      .run();
  } else {
    // برگشت به «شروع‌نشده» → چرخه‌ی یادآوری از نو شروع می‌شود (از الان، نه بلافاصله)
    await env.DB.prepare(
      `UPDATE tasks
       SET status = 'not_started', started_at = NULL, completed_at = NULL,
           last_reminded_at = ?, reminder_count = 0
       WHERE id = ?`
    )
      .bind(new Date().toISOString(), id)
      .run();
  }
  return getTask(env, id);
}

export async function assignTask(env: Env, id: number, assigneeId: number): Promise<void> {
  await env.DB.prepare("UPDATE tasks SET assignee_id = ? WHERE id = ?").bind(assigneeId, id).run();
}

export async function deleteTaskById(env: Env, id: number): Promise<void> {
  await env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();
}

export interface ListTasksOptions {
  assignee?: number;
  creator?: number;
  involved?: number; // مسئول یا ایجادکننده
  status?: "open" | TaskStatus;
}

export async function listTasks(env: Env, o: ListTasksOptions): Promise<TaskRow[]> {
  const conds: string[] = [];
  const params: (string | number)[] = [];
  if (o.involved != null) {
    conds.push("(assignee_id = ? OR creator_id = ?)");
    params.push(o.involved, o.involved);
  } else {
    if (o.assignee != null) {
      conds.push("assignee_id = ?");
      params.push(o.assignee);
    }
    if (o.creator != null) {
      conds.push("creator_id = ?");
      params.push(o.creator);
    }
  }
  if (o.status === "open") conds.push("status != 'done'");
  else if (o.status) {
    conds.push("status = ?");
    params.push(o.status);
  }
  const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
  const res = await env.DB.prepare(
    `SELECT * FROM tasks ${where}
     ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'not_started' THEN 1 ELSE 2 END,
              (due_date IS NULL), due_date, id DESC
     LIMIT 50`
  )
    .bind(...params)
    .all<TaskRow>();
  return res.results ?? [];
}

// ============================================================
// تسک‌های در انتظار تاریخ پایان
// (وقتی کاربر تاریخ پایان نمی‌دهد، پیش‌نویس می‌ماند تا جواب بدهد)
// ============================================================

export async function savePendingTask(env: Env, userId: number, chatId: number, draft: PendingDraft): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO pending_tasks (user_id, chat_id, draft, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       chat_id = excluded.chat_id, draft = excluded.draft, created_at = excluded.created_at`
  )
    .bind(userId, chatId, JSON.stringify(draft), now)
    .run();
}

export async function getPendingTask(env: Env, userId: number): Promise<PendingTaskRow | null> {
  return (await env.DB.prepare("SELECT * FROM pending_tasks WHERE user_id = ?").bind(userId).first<PendingTaskRow>()) ?? null;
}

export async function deletePendingTask(env: Env, userId: number): Promise<void> {
  await env.DB.prepare("DELETE FROM pending_tasks WHERE user_id = ?").bind(userId).run();
}

/** پاک‌سازی پیش‌نویس‌های بی‌جواب (از داخل کرون) */
export async function cleanupPendingTasks(env: Env, olderThanHours = 6): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanHours * 3_600_000).toISOString();
  await env.DB.prepare("DELETE FROM pending_tasks WHERE created_at < ?").bind(cutoff).run();
}

/** تسک‌های «شروع‌نشده» با پرچم شروعِ خودکار که روزِ شروعشان رسیده */
export async function tasksToAutoStart(env: Env, todayISO: string): Promise<TaskRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM tasks WHERE status = 'not_started' AND auto_start = 1 AND start_date IS NOT NULL AND start_date <= ? LIMIT 100"
  )
    .bind(todayISO)
    .all<TaskRow>();
  return results ?? [];
}

/** آپدیت امن فیلدهای مجاز تسک (ستون‌ها whitelist می‌شوند) */
const TASK_EDITABLE_COLUMNS = new Set([
  "title", "description", "assignee_id", "status",
  "start_date", "start_at", "due_date", "due_at", "auto_start",
  "started_at", "completed_at", "last_reminded_at", "reminder_count",
  "reminder_type", "reminder_time", "reminder_interval_hours", "reminder_lead_minutes", "reminder_at", "reminder_done",
]);

export async function setTaskFields(
  env: Env,
  id: number,
  fields: Record<string, string | number | null>
): Promise<TaskRow | null> {
  const keys = Object.keys(fields).filter((k) => TASK_EDITABLE_COLUMNS.has(k));
  if (keys.length) {
    const sets = keys.map((k) => `${k} = ?`).join(", ");
    const values = keys.map((k) => fields[k]);
    await env.DB.prepare(`UPDATE tasks SET ${sets} WHERE id = ?`).bind(...values, id).run();
  }
  return getTask(env, id);
}
