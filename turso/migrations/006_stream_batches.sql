-- Snapshot of all inventory batches at stream start (no per-stream batch UI).
-- Legacy streams with no rows here still use streams.gold_batch_id / silver_batch_id for raw sales.

CREATE TABLE IF NOT EXISTS stream_batches (
  stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  PRIMARY KEY (stream_id, batch_id)
);
