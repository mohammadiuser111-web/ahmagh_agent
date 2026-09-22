-- 0009: انتخاب کاربر برای تسک جدید («برای @» ادمین → بعد از انتخاب، متن تسک منتظر می‌ماند)
CREATE TABLE IF NOT EXISTS pending_pick (
  user_id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  assignee_id INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
