-- 0012 — نشست‌های وب‌اپ (لاگین با یوزرنیم/رمز بات + بازکردن از داخل تلگرام)
CREATE TABLE IF NOT EXISTS web_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_web_sessions_user ON web_sessions(user_id);
