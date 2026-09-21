-- ساعت دقیق شروع/پایان + پرچم شروع خودکار
ALTER TABLE tasks ADD COLUMN due_at TEXT;   -- ISO 8601 با offset تهران (وقتی ساعت گفته شده باشد)
ALTER TABLE tasks ADD COLUMN start_at TEXT; -- ISO 8601 با offset تهران
ALTER TABLE tasks ADD COLUMN auto_start INTEGER NOT NULL DEFAULT 0; -- 1 = با رسیدن زمان شروع، خودکار «در حال انجام» شود
