CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  poll_interval_sec INTEGER NOT NULL DEFAULT 60,
  last_error TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feed_filters (
  feed_id INTEGER PRIMARY KEY,
  include_keywords TEXT NOT NULL DEFAULT '[]',
  exclude_keywords TEXT NOT NULL DEFAULT '[]',
  brands TEXT NOT NULL DEFAULT '[]',
  min_price_value REAL,
  max_price_value REAL,
  seller_type_preference TEXT NOT NULL DEFAULT 'any',
  notes TEXT,
  FOREIGN KEY(feed_id) REFERENCES feeds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  price_text TEXT,
  price_value REAL,
  currency_text TEXT,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  location_text TEXT,
  seller_type TEXT NOT NULL DEFAULT 'unknown',
  image_url_1 TEXT,
  image_url_2 TEXT,
  matched_brand TEXT,
  published_text TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  is_new INTEGER NOT NULL DEFAULT 1,
  is_match INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(feed_id) REFERENCES feeds(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_source_external_id
  ON listings(source, external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_source_canonical_url
  ON listings(source, canonical_url);

CREATE INDEX IF NOT EXISTS idx_listings_feed_id_first_seen_at
  ON listings(feed_id, first_seen_at DESC);

CREATE TABLE IF NOT EXISTS listing_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_listing_events_created_at
  ON listing_events(created_at DESC);

CREATE TABLE IF NOT EXISTS feed_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  listings_parsed INTEGER NOT NULL DEFAULT 0,
  matches_found INTEGER NOT NULL DEFAULT 0,
  new_matches_found INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  FOREIGN KEY(feed_id) REFERENCES feeds(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feed_runs_feed_id_started_at
  ON feed_runs(feed_id, started_at DESC);
