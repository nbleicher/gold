-- Break templates: rows with spot_type (floor|prize), metal, grams, quantity.
-- Runtime break_spots gain spot_kind for guided processing.

CREATE TABLE IF NOT EXISTS break_template_rows (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  break_id TEXT NOT NULL REFERENCES breaks(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number >= 1 AND row_number <= 100),
  spot_type TEXT NOT NULL CHECK (spot_type IN ('floor', 'prize')),
  metal TEXT NOT NULL CHECK (metal IN ('gold', 'silver')),
  grams REAL NOT NULL CHECK (grams > 0),
  quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 200),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (break_id, row_number)
);

-- Backfill template rows from legacy floor + prize slot definitions (templates only).
INSERT INTO break_template_rows (break_id, row_number, spot_type, metal, grams, quantity)
SELECT
  b.id,
  1,
  'floor',
  'silver',
  1.0,
  b.fixed_silver_spots
FROM breaks b
WHERE b.is_template = 1
  AND b.fixed_silver_spots > 0;

INSERT INTO break_template_rows (break_id, row_number, spot_type, metal, grams, quantity)
SELECT
  p.break_id,
  (ROW_NUMBER() OVER (PARTITION BY p.break_id ORDER BY p.slot_number))
    + CASE WHEN COALESCE(b.fixed_silver_spots, 0) > 0 THEN 1 ELSE 0 END AS row_number,
  'prize',
  p.metal,
  p.grams,
  1
FROM break_prize_slots p
INNER JOIN breaks b ON b.id = p.break_id AND b.is_template = 1;

ALTER TABLE break_spots ADD COLUMN spot_kind TEXT CHECK (spot_kind IN ('floor', 'prize'));
