CREATE TABLE IF NOT EXISTS inventory_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  metal TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_inventory_sessions_user_active
  ON inventory_sessions (user_id, ended_at, started_at DESC);

ALTER TABLE bag_orders ADD COLUMN inventory_session_id TEXT REFERENCES inventory_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bag_orders_inventory_session
  ON bag_orders (inventory_session_id);

CREATE TABLE IF NOT EXISTS inventory_session_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id TEXT NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_session_events_session
  ON inventory_session_events (session_id, created_at DESC);
