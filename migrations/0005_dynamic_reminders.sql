-- فاز ۵: یادآوری داینامیک — کاربر خودش الگوی یادآوری را تعیین می‌کند
-- reminder_type: default (الگوریتم پلکانی قبلی) | none | daily | every_hours | before_deadline | once
ALTER TABLE tasks ADD COLUMN reminder_type TEXT NOT NULL DEFAULT 'default';
ALTER TABLE tasks ADD COLUMN reminder_time TEXT;                -- "HH:MM" برای daily
ALTER TABLE tasks ADD COLUMN reminder_interval_hours INTEGER;   -- برای every_hours
ALTER TABLE tasks ADD COLUMN reminder_lead_minutes INTEGER;     -- برای before_deadline
ALTER TABLE tasks ADD COLUMN reminder_at TEXT;                  -- ISO برای once
ALTER TABLE tasks ADD COLUMN reminder_done INTEGER NOT NULL DEFAULT 0;  -- برای انواع یک‌باره
