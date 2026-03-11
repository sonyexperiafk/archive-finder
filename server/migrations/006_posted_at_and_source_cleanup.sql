ALTER TABLE listings ADD COLUMN posted_at TEXT;
ALTER TABLE recommendations ADD COLUMN score_breakdown_json TEXT NOT NULL DEFAULT '{}';

UPDATE feeds
SET enabled = 0,
    source_status = 'paused',
    last_backoff_reason = 'Источник выведен из активной разработки.'
WHERE source NOT IN ('mercari_jp', 'kufar', 'vinted');
