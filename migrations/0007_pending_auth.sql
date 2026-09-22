-- 0007: احراز هویت گام‌به‌گام (دکمه‌ی ورود/ثبت‌نام → یوزرنیم → رمز)
CREATE TABLE IF NOT EXISTS pending_auth (
  user_id INTEGER PRIMARY KEY,
  chat_id INTEGER NOT NULL,
  mode TEXT NOT NULL,        -- register | login
  step TEXT NOT NULL,        -- username | password
  username TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
