CREATE TABLE IF NOT EXISTS cookie_pool_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  label TEXT,
  cookies_json TEXT NOT NULL,
  cookie_count INTEGER NOT NULL DEFAULT 0,
  user_agent TEXT,
  notes TEXT,
  is_valid INTEGER NOT NULL DEFAULT 1,
  last_success_at TEXT,
  last_failure_at TEXT,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cookie_pool_entries_source_health
  ON cookie_pool_entries(source, is_valid DESC, consecutive_failures ASC, last_success_at DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS custom_catalog_terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('brand', 'tag')),
  term TEXT NOT NULL,
  normalized_term TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (kind, normalized_term)
);

CREATE INDEX IF NOT EXISTS idx_custom_catalog_terms_kind_enabled
  ON custom_catalog_terms(kind, enabled, normalized_term);
