CREATE TABLE IF NOT EXISTS pending_captures (
  source TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
