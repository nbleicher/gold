ALTER TABLE schedules ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'));
ALTER TABLE schedules ADD COLUMN submitted_by TEXT REFERENCES users(id);
ALTER TABLE schedules ADD COLUMN pending_submitted_at TEXT;
ALTER TABLE schedules ADD COLUMN reviewed_at TEXT;
ALTER TABLE schedules ADD COLUMN reviewed_by TEXT REFERENCES users(id);
ALTER TABLE schedules ADD COLUMN review_note TEXT;

UPDATE schedules
SET
  status = 'approved',
  submitted_by = COALESCE(submitted_by, streamer_id),
  pending_submitted_at = COALESCE(pending_submitted_at, created_at)
WHERE status IS NULL OR status = '';

CREATE INDEX IF NOT EXISTS idx_schedules_status_date_time ON schedules (status, date, start_time);
CREATE INDEX IF NOT EXISTS idx_schedules_submitted_by ON schedules (submitted_by);
CREATE INDEX IF NOT EXISTS idx_schedules_pending_submitted_at ON schedules (pending_submitted_at);
