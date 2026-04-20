-- Stream vs labor (hours) schedule entries. Labor uses start_time '00:00' as sentinel (NOT NULL preserved).

ALTER TABLE schedules ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'stream' CHECK (entry_type IN ('stream', 'labor'));
ALTER TABLE schedules ADD COLUMN hours_worked REAL CHECK (hours_worked IS NULL OR hours_worked > 0);
