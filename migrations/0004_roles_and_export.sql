-- فاز ۴: ثبت‌نام، نقش‌ها (ادمین/عادی)
ALTER TABLE users ADD COLUMN username_login TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_login ON users(username_login) WHERE username_login IS NOT NULL;
