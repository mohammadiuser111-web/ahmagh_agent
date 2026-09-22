-- 0006: ویرایش در انتظار — جوابِ زبانیِ کاربر به سؤال «چی عوض بشه؟»
CREATE TABLE IF NOT EXISTS pending_edits (
  user_id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
