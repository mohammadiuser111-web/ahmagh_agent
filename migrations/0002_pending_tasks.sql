-- تسک‌های در انتظار دریافت تاریخ پایان
-- (وقتی کاربر تاریخ پایان نمی‌دهد، پیش‌نویس تسک اینجا می‌ماند تا جواب بدهد)
CREATE TABLE IF NOT EXISTS pending_tasks (
  user_id    INTEGER PRIMARY KEY,
  chat_id    INTEGER NOT NULL,
  draft      TEXT    NOT NULL,   -- JSON: {title, description, creator_id, assignee_id, status, start_date}
  created_at TEXT    NOT NULL
);
