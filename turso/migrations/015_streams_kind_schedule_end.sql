-- Stream sessions: break (default) vs sticker (legacy bag/sticker sales).
-- Schedule stream slots: optional end_time (HH:MM).

ALTER TABLE streams ADD COLUMN stream_kind TEXT NOT NULL DEFAULT 'break';

ALTER TABLE schedules ADD COLUMN end_time TEXT;
