-- 0010: اسم مستعار کاربر (به جای @ برای ارجاع) + متن تسک در pending_pick (ابهام‌زدایی هم‌نام‌ها)
ALTER TABLE users ADD COLUMN alias TEXT;
ALTER TABLE pending_pick ADD COLUMN text TEXT;
