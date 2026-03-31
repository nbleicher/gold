PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  date TEXT NOT NULL,
  metal TEXT NOT NULL CHECK (metal IN ('gold', 'silver')),
  grams REAL NOT NULL CHECK (grams > 0),
  remaining_grams REAL NOT NULL CHECK (remaining_grams >= 0),
  purchase_spot REAL NOT NULL CHECK (purchase_spot >= 0),
  total_cost REAL NOT NULL CHECK (total_cost >= 0),
  batch_number INTEGER,
  batch_name TEXT,
  sticker_batch_letter TEXT NOT NULL CHECK (length(sticker_batch_letter)=1),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_metal_letter
  ON inventory_batches (metal, sticker_batch_letter);

CREATE TABLE IF NOT EXISTS bag_orders (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  primary_batch_id TEXT NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  metal TEXT NOT NULL CHECK (metal IN ('gold', 'silver', 'mixed')),
  actual_weight_grams REAL NOT NULL CHECK (actual_weight_grams > 0),
  tier_index INTEGER NOT NULL CHECK (tier_index > 0),
  sticker_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bag_order_components (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  bag_order_id TEXT NOT NULL REFERENCES bag_orders(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  metal TEXT NOT NULL CHECK (metal IN ('gold', 'silver')),
  weight_grams REAL NOT NULL CHECK (weight_grams > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS streams (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  gold_batch_id TEXT REFERENCES inventory_batches(id),
  silver_batch_id TEXT REFERENCES inventory_batches(id)
);

CREATE TABLE IF NOT EXISTS stream_items (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  sale_type TEXT NOT NULL CHECK (sale_type IN ('sticker', 'raw')),
  name TEXT NOT NULL,
  metal TEXT NOT NULL CHECK (metal IN ('gold', 'silver', 'mixed')),
  weight_grams REAL NOT NULL CHECK (weight_grams > 0),
  spot_value REAL NOT NULL CHECK (spot_value >= 0),
  spot_price REAL NOT NULL CHECK (spot_price >= 0),
  sticker_code TEXT,
  batch_id TEXT REFERENCES inventory_batches(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stream_items_sticker_unique
  ON stream_items (sticker_code)
  WHERE sale_type = 'sticker' AND sticker_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  streamer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  cost REAL NOT NULL CHECK (cost >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payroll_records (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  rows INTEGER NOT NULL CHECK (rows >= 0),
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS spot_snapshots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  metal TEXT NOT NULL CHECK (metal IN ('gold', 'silver')),
  price REAL NOT NULL CHECK (price > 0),
  source_state TEXT NOT NULL DEFAULT 'primary',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_spot_snapshots_metal_created
  ON spot_snapshots (metal, created_at DESC);
