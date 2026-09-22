-- 0008: نشست — خروج از حساب بدون پاک‌شدن ثبت‌نام
ALTER TABLE users ADD COLUMN logged_in INTEGER NOT NULL DEFAULT 1;
