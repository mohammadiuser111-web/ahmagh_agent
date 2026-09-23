-- گزارش روزانه: ثبتِ «امروز فرستادم» برای هر نوع (morning/evening) — dedup در برابر اجرای چندباره‌ی کرونِ هر دقیقه
CREATE TABLE IF NOT EXISTS digest_sent (
  kind    TEXT NOT NULL,             -- morning | evening
  day     TEXT NOT NULL,             -- تاریخ تهران YYYY-MM-DD
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, day)
);
