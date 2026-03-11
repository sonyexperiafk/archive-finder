ALTER TABLE feeds ADD COLUMN vertical TEXT DEFAULT 'fashion';

ALTER TABLE listings ADD COLUMN vertical TEXT DEFAULT 'fashion';
ALTER TABLE listings ADD COLUMN price_original REAL;
ALTER TABLE listings ADD COLUMN currency_original TEXT;
ALTER TABLE listings ADD COLUMN price_usd REAL;

CREATE INDEX IF NOT EXISTS idx_feeds_vertical ON feeds(vertical);
CREATE INDEX IF NOT EXISTS idx_listings_vertical ON listings(vertical);
CREATE INDEX IF NOT EXISTS idx_listings_price_usd ON listings(price_usd);
