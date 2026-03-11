ALTER TABLE feeds ADD COLUMN preset_key TEXT;

CREATE TABLE IF NOT EXISTS recommendations (
  listing_id INTEGER PRIMARY KEY,
  score REAL NOT NULL,
  reasons_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recommendations_score_updated_at
  ON recommendations(score DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS listing_likes (
  listing_id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL,
  FOREIGN KEY(listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_listing_likes_created_at
  ON listing_likes(created_at DESC);
