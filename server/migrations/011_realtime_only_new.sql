ALTER TABLE listings ADD COLUMN age_minutes INTEGER;
ALTER TABLE listings ADD COLUMN age_confidence TEXT DEFAULT 'unknown';
ALTER TABLE listings ADD COLUMN unknown_age INTEGER NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN last_query TEXT;

ALTER TABLE feed_runs ADD COLUMN query_text TEXT;
ALTER TABLE feed_runs ADD COLUMN items_skipped_old INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feed_runs ADD COLUMN items_inserted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feed_runs ADD COLUMN items_unknown_age INTEGER NOT NULL DEFAULT 0;

DROP TABLE IF EXISTS swipe_decisions;

CREATE TABLE IF NOT EXISTS opportunities (
  listing_id INTEGER PRIMARY KEY,
  score REAL NOT NULL,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY(listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_opportunities_score_created_at
  ON opportunities(score DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS notify_candidates (
  listing_id INTEGER PRIMARY KEY,
  score REAL NOT NULL,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  FOREIGN KEY(listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS query_metrics (
  source TEXT NOT NULL,
  query TEXT NOT NULL,
  total_runs INTEGER NOT NULL DEFAULT 0,
  total_found INTEGER NOT NULL DEFAULT 0,
  new_items_found INTEGER NOT NULL DEFAULT 0,
  recommendations_produced INTEGER NOT NULL DEFAULT 0,
  avg_recommendation_score REAL NOT NULL DEFAULT 0,
  noise_ratio REAL NOT NULL DEFAULT 0,
  query_quality_score REAL NOT NULL DEFAULT 50,
  last_success_at TEXT,
  cooldown_until TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, query)
);

CREATE INDEX IF NOT EXISTS idx_query_metrics_source_quality
  ON query_metrics(source, query_quality_score DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS source_health (
  source TEXT PRIMARY KEY,
  last_success_at TEXT,
  last_failure_at TEXT,
  success_rate_last50 REAL NOT NULL DEFAULT 0,
  avg_items_extracted REAL NOT NULL DEFAULT 0,
  avg_new_items_inserted REAL NOT NULL DEFAULT 0,
  avg_run_duration REAL NOT NULL DEFAULT 0,
  current_backoff_level INTEGER NOT NULL DEFAULT 0,
  current_parser_mode TEXT,
  anti_bot_warnings_last24h INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_health (
  source TEXT PRIMARY KEY,
  is_valid INTEGER NOT NULL DEFAULT 1,
  last_success_at TEXT,
  last_403_at TEXT,
  last_captcha_at TEXT,
  last_items_extracted INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proxy_health (
  source TEXT NOT NULL,
  proxy_id TEXT NOT NULL,
  last_success_at TEXT,
  avg_latency REAL NOT NULL DEFAULT 0,
  ban_count INTEGER NOT NULL DEFAULT 0,
  captcha_count INTEGER NOT NULL DEFAULT 0,
  extraction_success_rate REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, proxy_id)
);

CREATE INDEX IF NOT EXISTS idx_listings_age_minutes
  ON listings(age_minutes, first_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_listings_unknown_age
  ON listings(unknown_age, first_seen_at DESC);
