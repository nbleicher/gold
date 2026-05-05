-- Per-day schedule ordering (drag order) and per-stream extra expenses.

ALTER TABLE schedules ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Backfill sort_order within each date from legacy ordering (start_time, then submission/created).
CREATE TEMP TABLE schedule_sort_backfill AS
SELECT
  id,
  ROW_NUMBER() OVER (
    PARTITION BY date
    ORDER BY start_time ASC,
             COALESCE(pending_submitted_at, created_at) ASC,
             created_at ASC
  ) - 1 AS ord
FROM schedules;

UPDATE schedules
SET sort_order = (
  SELECT ord FROM schedule_sort_backfill WHERE schedule_sort_backfill.id = schedules.id
);

DROP TABLE schedule_sort_backfill;

CREATE INDEX IF NOT EXISTS idx_schedules_date_sort_order ON schedules (date, sort_order);

CREATE TABLE IF NOT EXISTS stream_expenses (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price REAL NOT NULL CHECK (price >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stream_expenses_stream_id ON stream_expenses (stream_id);
