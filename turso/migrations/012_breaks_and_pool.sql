PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS inventory_batches_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  date TEXT NOT NULL,
  metal TEXT NOT NULL CHECK (metal IN ('gold', 'silver')),
  grams REAL NOT NULL CHECK (grams > 0),
  remaining_grams REAL NOT NULL CHECK (remaining_grams >= 0),
  purchase_spot REAL CHECK (purchase_spot >= 0),
  total_cost REAL NOT NULL CHECK (total_cost >= 0),
  batch_number INTEGER,
  batch_name TEXT,
  sticker_batch_letter TEXT NOT NULL CHECK (length(sticker_batch_letter)=1),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO inventory_batches_new (
  id,
  date,
  metal,
  grams,
  remaining_grams,
  purchase_spot,
  total_cost,
  batch_number,
  batch_name,
  sticker_batch_letter,
  created_at
)
SELECT
  id,
  date,
  metal,
  grams,
  remaining_grams,
  purchase_spot,
  total_cost,
  batch_number,
  batch_name,
  sticker_batch_letter,
  created_at
FROM inventory_batches;

DROP TABLE inventory_batches;
ALTER TABLE inventory_batches_new RENAME TO inventory_batches;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_metal_letter
  ON inventory_batches (metal, sticker_batch_letter);

CREATE TABLE IF NOT EXISTS metal_inventory_pool (
  metal TEXT PRIMARY KEY CHECK (metal IN ('gold', 'silver')),
  grams_on_hand REAL NOT NULL DEFAULT 0 CHECK (grams_on_hand >= 0),
  total_cost_on_hand REAL NOT NULL DEFAULT 0 CHECK (total_cost_on_hand >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO metal_inventory_pool (metal, grams_on_hand, total_cost_on_hand)
SELECT
  metal,
  COALESCE(SUM(remaining_grams), 0) AS grams_on_hand,
  COALESCE(SUM((total_cost / NULLIF(grams, 0)) * remaining_grams), 0) AS total_cost_on_hand
FROM inventory_batches
GROUP BY metal
ON CONFLICT(metal) DO UPDATE SET
  grams_on_hand = excluded.grams_on_hand,
  total_cost_on_hand = excluded.total_cost_on_hand,
  updated_at = datetime('now');

INSERT OR IGNORE INTO metal_inventory_pool (metal, grams_on_hand, total_cost_on_hand) VALUES ('gold', 0, 0);
INSERT OR IGNORE INTO metal_inventory_pool (metal, grams_on_hand, total_cost_on_hand) VALUES ('silver', 0, 0);

CREATE TRIGGER IF NOT EXISTS trg_inventory_batches_insert_pool
AFTER INSERT ON inventory_batches
BEGIN
  UPDATE metal_inventory_pool
  SET
    grams_on_hand = grams_on_hand + NEW.remaining_grams,
    total_cost_on_hand = total_cost_on_hand + ((NEW.total_cost / NULLIF(NEW.grams, 0)) * NEW.remaining_grams),
    updated_at = datetime('now')
  WHERE metal = NEW.metal;
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_batches_update_pool
AFTER UPDATE OF remaining_grams ON inventory_batches
BEGIN
  UPDATE metal_inventory_pool
  SET
    grams_on_hand = MAX(0, grams_on_hand + (NEW.remaining_grams - OLD.remaining_grams)),
    total_cost_on_hand = MAX(
      0,
      total_cost_on_hand + ((NEW.total_cost / NULLIF(NEW.grams, 0)) * (NEW.remaining_grams - OLD.remaining_grams))
    ),
    updated_at = datetime('now')
  WHERE metal = NEW.metal;
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_batches_delete_pool
AFTER DELETE ON inventory_batches
BEGIN
  UPDATE metal_inventory_pool
  SET
    grams_on_hand = MAX(0, grams_on_hand - OLD.remaining_grams),
    total_cost_on_hand = MAX(0, total_cost_on_hand - ((OLD.total_cost / NULLIF(OLD.grams, 0)) * OLD.remaining_grams)),
    updated_at = datetime('now')
  WHERE metal = OLD.metal;
END;

CREATE TABLE IF NOT EXISTS breaks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  total_spots INTEGER NOT NULL DEFAULT 50 CHECK (total_spots = 50),
  fixed_silver_spots INTEGER NOT NULL DEFAULT 40 CHECK (fixed_silver_spots = 40),
  sold_spots INTEGER NOT NULL DEFAULT 0 CHECK (sold_spots >= 0),
  sold_prize_spots INTEGER NOT NULL DEFAULT 0 CHECK (sold_prize_spots >= 0 AND sold_prize_spots <= 10),
  total_silver_budget_grams REAL NOT NULL DEFAULT 40 CHECK (total_silver_budget_grams >= 0),
  remaining_silver_grams REAL NOT NULL DEFAULT 40 CHECK (remaining_silver_grams >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS break_prize_slots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  break_id TEXT NOT NULL REFERENCES breaks(id) ON DELETE CASCADE,
  slot_number INTEGER NOT NULL CHECK (slot_number >= 1 AND slot_number <= 10),
  slot_type TEXT NOT NULL CHECK (slot_type IN ('normal', 'mega')),
  metal TEXT NOT NULL CHECK (metal IN ('gold', 'silver')),
  grams REAL NOT NULL CHECK (grams > 0),
  cost REAL NOT NULL DEFAULT 0 CHECK (cost >= 0),
  is_consumed INTEGER NOT NULL DEFAULT 0 CHECK (is_consumed IN (0, 1)),
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (break_id, slot_number)
);

CREATE TABLE IF NOT EXISTS break_spots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  break_id TEXT NOT NULL REFERENCES breaks(id) ON DELETE CASCADE,
  spot_number INTEGER NOT NULL CHECK (spot_number >= 1 AND spot_number <= 50),
  outcome_type TEXT CHECK (outcome_type IN ('silver', 'prize')),
  prize_slot_id TEXT REFERENCES break_prize_slots(id) ON DELETE SET NULL,
  metal TEXT CHECK (metal IN ('gold', 'silver')),
  grams REAL,
  cost REAL,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (break_id, spot_number),
  UNIQUE (prize_slot_id)
);

CREATE TABLE IF NOT EXISTS stream_breaks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  break_id TEXT NOT NULL REFERENCES breaks(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  ended_reason TEXT,
  UNIQUE (stream_id)
);

ALTER TABLE stream_items ADD COLUMN break_id TEXT REFERENCES breaks(id);
ALTER TABLE stream_items ADD COLUMN break_spot_id TEXT REFERENCES break_spots(id);

PRAGMA foreign_keys = ON;
