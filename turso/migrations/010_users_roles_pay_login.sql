-- Expand user roles, pay structure, and optional login. Rebuild `users` to replace role CHECK.
-- Preserves primary keys so FKs from streams, schedules, payroll_records, etc. remain valid.

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE users_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'streamer', 'shipper', 'bagger')),
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  deactivated_at TEXT,
  deactivated_by TEXT REFERENCES users_new(id),
  purged_at TEXT,
  purged_by TEXT REFERENCES users_new(id),
  commission_percent REAL NOT NULL DEFAULT 0 CHECK (commission_percent >= 0 AND commission_percent <= 100),
  requires_login INTEGER NOT NULL DEFAULT 1 CHECK (requires_login IN (0, 1)),
  pay_structure TEXT NOT NULL DEFAULT 'commission' CHECK (pay_structure IN ('commission', 'hourly')),
  hourly_rate REAL NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0)
);

INSERT INTO users_new (
  id,
  email,
  password_hash,
  role,
  display_name,
  created_at,
  is_active,
  deactivated_at,
  deactivated_by,
  purged_at,
  purged_by,
  commission_percent,
  requires_login,
  pay_structure,
  hourly_rate
)
SELECT
  id,
  email,
  password_hash,
  CASE
    WHEN role = 'user' THEN 'streamer'
    WHEN role = 'admin' THEN 'admin'
    ELSE 'streamer'
  END,
  display_name,
  created_at,
  is_active,
  deactivated_at,
  deactivated_by,
  purged_at,
  purged_by,
  commission_percent,
  1,
  'commission',
  0
FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);

COMMIT;

PRAGMA foreign_keys = ON;
