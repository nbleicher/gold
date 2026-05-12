-- Snapshot of inventory batches at stream start (break streams). Mirrors turso/migrations/006_stream_batches.sql.

create table if not exists stream_batches (
  stream_id text not null references streams (id) on delete cascade,
  batch_id text not null references inventory_batches (id) on delete cascade,
  primary key (stream_id, batch_id)
);
