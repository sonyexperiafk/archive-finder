DELETE FROM feeds
WHERE source IN ('depop', 'surugaya', 'poshmark', 'yahoo_fleamarket')
   OR vertical = 'figures';

DELETE FROM listings
WHERE source IN ('depop', 'surugaya', 'poshmark', 'yahoo_fleamarket')
   OR vertical = 'figures';

UPDATE feeds
SET vertical = 'fashion'
WHERE vertical NOT IN ('fashion', 'electronics') OR vertical IS NULL;

UPDATE listings
SET vertical = 'fashion'
WHERE vertical NOT IN ('fashion', 'electronics') OR vertical IS NULL;

ALTER TABLE listings ADD COLUMN gender TEXT DEFAULT 'unisex';

CREATE INDEX IF NOT EXISTS idx_listings_gender ON listings(gender);
