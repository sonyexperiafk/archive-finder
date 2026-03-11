ALTER TABLE feeds ADD COLUMN effective_poll_interval_sec INTEGER NOT NULL DEFAULT 60;
ALTER TABLE feeds ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feeds ADD COLUMN consecutive_successes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feeds ADD COLUMN source_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE feeds ADD COLUMN last_backoff_reason TEXT;

UPDATE feeds
SET effective_poll_interval_sec = COALESCE(effective_poll_interval_sec, poll_interval_sec);

ALTER TABLE listings ADD COLUMN matched_category TEXT;
ALTER TABLE listings ADD COLUMN matched_tags_json TEXT NOT NULL DEFAULT '[]';
