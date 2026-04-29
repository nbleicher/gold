-- =============================================================================
-- BREAK SCHEMA (single file) — run after 012_breaks_and_pool.sql
-- =============================================================================
--
-- Turso / sqlite3:
--   turso db shell YOUR_DB < turso/migrations/013_break_multi_run.sql
--
-- This script DROPS and RECREATES: breaks, break_prize_slots, break_spots, stream_breaks.
-- All break templates, spots, prize slots, and stream↔break links are removed.
-- stream_items.break_id / break_spot_id are cleared first so FKs allow drops.
--
-- Optional: only clear rows without dropping (keeps table shell) — usually not enough
-- if you see "no such table: break_prize_slots"; then you need this full script.
--   UPDATE stream_items SET break_id = NULL, break_spot_id = NULL;
--   DELETE FROM stream_breaks;
--   DELETE FROM break_spots;
--   DELETE FROM break_prize_slots;
--   DELETE FROM breaks;
--
-- =============================================================================

PRAGMA foreign_keys = OFF;

-- Staging tables from failed partial runs
DROP TABLE IF EXISTS stream_breaks_new;
DROP TABLE IF EXISTS break_spots_new;
DROP TABLE IF EXISTS break_prize_slots_new;
DROP TABLE IF EXISTS breaks_new;

-- Clear line items pointing at break rows, then drop in child → parent order
UPDATE stream_items SET break_id = NULL, break_spot_id = NULL
WHERE break_id IS NOT NULL OR break_spot_id IS NOT NULL;

DROP TABLE IF EXISTS stream_breaks;
DROP TABLE IF EXISTS break_spots;
DROP TABLE IF EXISTS break_prize_slots;
DROP TABLE IF EXISTS breaks;

-- ---------------------------------------------------------------------------
-- breaks
-- ---------------------------------------------------------------------------
CREATE TABLE breaks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- break_prize_slots
-- ---------------------------------------------------------------------------
CREATE TABLE break_prize_slots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  break_id TEXT NOT NULL REFERENCES breaks(id) ON DELETE CASCADE,
  slot_number INTEGER NOT NULL CHECK (slot_number >= 1 AND slot_number <= 100),
  slot_type TEXT NOT NULL CHECK (slot_type IN ('normal', 'mega', 'prize')),
  metal TEXT NOT NULL CHECK (metal IN ('gold', 'silver')),
  grams REAL NOT NULL CHECK (grams > 0),
  cost REAL NOT NULL DEFAULT 0 CHECK (cost >= 0),
  is_consumed INTEGER NOT NULL DEFAULT 0 CHECK (is_consumed IN (0, 1)),
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (break_id, slot_number)
);

-- ---------------------------------------------------------------------------
-- break_spots
-- ---------------------------------------------------------------------------
CREATE TABLE break_spots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  break_id TEXT NOT NULL REFERENCES breaks(id) ON DELETE CASCADE,
  spot_number INTEGER NOT NULL CHECK (spot_number >= 1 AND spot_number <= 200),
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

-- ---------------------------------------------------------------------------
-- stream_breaks (multiple runs per stream; no UNIQUE(stream_id))
-- ---------------------------------------------------------------------------
CREATE TABLE stream_breaks (
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

CREATE INDEX IF NOT EXISTS idx_stream_breaks_stream_started ON stream_breaks (stream_id, started_at DESC);

PRAGMA foreign_keys = ON;
