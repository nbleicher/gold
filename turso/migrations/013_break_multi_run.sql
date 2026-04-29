-- Multi-run stream breaks, flexible break geometry, prize slot type "prize", break templates vs run instances.

PRAGMA foreign_keys = OFF;

-- ---------------------------------------------------------------------------
-- breaks: relax spot counts; template flag for clone workflow
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS breaks_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  total_spots INTEGER NOT NULL CHECK (total_spots >= 2 AND total_spots <= 200),
  fixed_silver_spots INTEGER NOT NULL CHECK (fixed_silver_spots >= 0 AND fixed_silver_spots <= total_spots),
  sold_spots INTEGER NOT NULL DEFAULT 0 CHECK (sold_spots >= 0),
  sold_prize_spots INTEGER NOT NULL DEFAULT 0 CHECK (sold_prize_spots >= 0 AND sold_prize_spots <= 100),
  total_silver_budget_grams REAL NOT NULL CHECK (total_silver_budget_grams >= 0),
  remaining_silver_grams REAL NOT NULL CHECK (remaining_silver_grams >= 0),
  is_template INTEGER NOT NULL DEFAULT 1 CHECK (is_template IN (0, 1)),
  cloned_from_id TEXT REFERENCES breaks(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO breaks_new (
  id, name, status, total_spots, fixed_silver_spots, sold_spots, sold_prize_spots,
  total_silver_budget_grams, remaining_silver_grams, is_template, cloned_from_id, created_at, updated_at
)
SELECT
  id, name, status, total_spots, fixed_silver_spots, sold_spots, sold_prize_spots,
  total_silver_budget_grams, remaining_silver_grams, 1, NULL, created_at, updated_at
FROM breaks;

DROP TABLE breaks;
ALTER TABLE breaks_new RENAME TO breaks;

-- ---------------------------------------------------------------------------
-- break_prize_slots: slot_type includes prize; more slots per break
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS break_prize_slots_new (
  id TEXT PRIMARY KEY,
  break_id TEXT NOT NULL REFERENCES breaks(id) ON DELETE CASCADE,
  slot_number INTEGER NOT NULL CHECK (slot_number >= 1 AND slot_number <= 100),
  slot_type TEXT NOT NULL CHECK (slot_type IN ('normal', 'mega', 'prize')),
  metal TEXT NOT NULL CHECK (metal IN ('gold', 'silver')),
  grams REAL NOT NULL CHECK (grams > 0),
  cost REAL NOT NULL DEFAULT 0 CHECK (cost >= 0),
  is_consumed INTEGER NOT NULL DEFAULT 0 CHECK (is_consumed IN (0, 1)),
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (break_id, slot_number)
);

INSERT INTO break_prize_slots_new (
  id, break_id, slot_number, slot_type, metal, grams, cost, is_consumed, consumed_at, created_at, updated_at
)
SELECT
  id, break_id, slot_number, slot_type, metal, grams, cost, is_consumed, consumed_at, created_at, updated_at
FROM break_prize_slots;

DROP TABLE break_prize_slots;
ALTER TABLE break_prize_slots_new RENAME TO break_prize_slots;

-- ---------------------------------------------------------------------------
-- break_spots: allow up to 200 spots per break
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS break_spots_new (
  id TEXT PRIMARY KEY,
  break_id TEXT NOT NULL REFERENCES breaks(id) ON DELETE CASCADE,
  spot_number INTEGER NOT NULL CHECK (spot_number >= 1 AND spot_number <= 200),
  outcome_type TEXT CHECK (outcome_type IN ('silver', 'prize')),
  prize_slot_id TEXT REFERENCES break_prize_slots(id) ON DELETE SET NULL,
  metal TEXT CHECK (metal IN ('gold', 'silver')),
  grams REAL,
  cost REAL,
  processed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (break_id, spot_number),
  UNIQUE (prize_slot_id)
);

INSERT INTO break_spots_new (
  id, break_id, spot_number, outcome_type, prize_slot_id, metal, grams, cost, processed_at, created_at
)
SELECT
  id, break_id, spot_number, outcome_type, prize_slot_id, metal, grams, cost, processed_at, created_at
FROM break_spots;

DROP TABLE break_spots;
ALTER TABLE break_spots_new RENAME TO break_spots;

-- ---------------------------------------------------------------------------
-- stream_breaks: multiple rows per stream; per-run floor + rollup columns
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stream_breaks_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  break_id TEXT NOT NULL REFERENCES breaks(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  ended_reason TEXT,
  floor_spots INTEGER NOT NULL DEFAULT 40 CHECK (floor_spots >= 0),
  run_total_cost REAL CHECK (run_total_cost IS NULL OR run_total_cost >= 0),
  run_total_silver_grams REAL CHECK (run_total_silver_grams IS NULL OR run_total_silver_grams >= 0)
);

INSERT INTO stream_breaks_new (id, stream_id, break_id, started_at, ended_at, ended_reason, floor_spots, run_total_cost, run_total_silver_grams)
SELECT id, stream_id, break_id, started_at, ended_at, ended_reason, 40, NULL, NULL
FROM stream_breaks;

DROP TABLE stream_breaks;
ALTER TABLE stream_breaks_new RENAME TO stream_breaks;

CREATE INDEX IF NOT EXISTS idx_stream_breaks_stream_started ON stream_breaks (stream_id, started_at DESC);

PRAGMA foreign_keys = ON;
