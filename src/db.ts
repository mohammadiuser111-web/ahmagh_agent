/**
 * لایه‌ی دیتابیس — همه‌ی کوئری‌های D1
 */
import type { Env, TaskRow, TaskStatus, UserRow } from "./types";

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
  due_date: string | null;
}

export async function createTask(env: Env, t: NewTask): Promise<TaskRow | null> {
  const now = new Date().toISOString();
  const res = await env.DB.prepare(
    `INSERT INTO tasks (title, description, creator_id, assignee_id, status, start_date, due_date, created_at, last_reminded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      t.title,
      t.description,
      t.creator_id,
      t.assignee_id,
      t.status,
      t.start_date,
      t.due_date,
      now,
      // اولین یادآوری بعد از یک بازه‌ی کامل بیاید، نه بلافاصله بعد از ساخت
      now
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
