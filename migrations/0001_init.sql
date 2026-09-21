-- ahmagh_agent — اسکیمای اولیه (فاز ۱)
-- اجرا: npx wrangler d1 migrations apply ahmagh_agent --remote

-- کاربرها: هر کسی که حداقل یک بار با بات حرف زده
CREATE TABLE IF NOT EXISTS users (
  user_id    INTEGER PRIMARY KEY,                -- شناسه تلگرام
  username   TEXT,                               -- @username (ممکن است نباشد)
  first_name TEXT,                               -- نام نمایشی
  chat_id    INTEGER,                            -- چت خصوصی برای ارسال یادآوری
  created_at TEXT NOT NULL,                      -- ISO 8601
  updated_at TEXT NOT NULL                       -- ISO 8601
);

-- تسک‌ها
CREATE TABLE IF NOT EXISTS tasks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  title            TEXT    NOT NULL,             -- عنوان تسک
  description      TEXT    NOT NULL DEFAULT '',  -- توضیحات تسک
  creator_id       INTEGER NOT NULL,             -- ایجادکننده (کاربری که تسک را ساخت)
  assignee_id      INTEGER NOT NULL,             -- مسئول (کی قراره انجامش بده)
  status           TEXT    NOT NULL DEFAULT 'not_started'
                   CHECK (status IN ('not_started', 'in_progress', 'done')),
  start_date       TEXT,                         -- تاریخ شروع برنامه‌ای (YYYY-MM-DD)
  started_at       TEXT,                         -- لحظه‌ی واقعی شروع (ISO 8601)
  due_date         TEXT,                         -- تاریخ پایان / سررسید (YYYY-MM-DD)
  completed_at     TEXT,                         -- لحظه‌ی واقعی اتمام (ISO 8601)
  created_at       TEXT    NOT NULL,             -- تاریخ ساخت تسک (ISO 8601)
  last_reminded_at TEXT,                         -- آخرین یادآوری ارسال‌شده
  reminder_count   INTEGER NOT NULL DEFAULT 0,   -- تعداد یادآوری‌های ارسال‌شده
  FOREIGN KEY (creator_id)  REFERENCES users (user_id),
  FOREIGN KEY (assignee_id) REFERENCES users (user_id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON tasks (assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_creator         ON tasks (creator_id);
