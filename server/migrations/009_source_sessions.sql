CREATE TABLE IF NOT EXISTS source_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL UNIQUE,
  cookies TEXT,
  local_storage TEXT,
  user_agent TEXT,
  logged_in_as TEXT,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  is_valid INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_source_sessions_source ON source_sessions(source);
