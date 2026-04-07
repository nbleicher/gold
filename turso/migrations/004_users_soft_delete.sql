ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
ALTER TABLE users ADD COLUMN deactivated_at TEXT;
ALTER TABLE users ADD COLUMN deactivated_by TEXT REFERENCES users(id);

UPDATE users SET is_active = 1 WHERE is_active IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);
