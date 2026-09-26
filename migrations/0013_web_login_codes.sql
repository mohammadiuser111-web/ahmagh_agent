-- 0013 — کدهای یک‌بارمصرفِ ورود به وب از طریق تلگرام
-- (برای رفقایی که در بات ثبت‌نام کرده‌اند ولی یوزرنیم/رمز را یادشان نیست)
CREATE TABLE IF NOT EXISTS web_login_codes (
  user_id INTEGER PRIMARY KEY,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
