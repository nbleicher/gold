-- Per-day schedule ordering (drag order) and per-stream extra expenses.

alter table schedules add column if not exists sort_order integer not null default 0;

with ranked as (
  select
    id,
    row_number() over (
      partition by date
      order by start_time asc,
               coalesce(pending_submitted_at, created_at) asc,
               created_at asc
    ) - 1 as ord
  from schedules
)
update schedules s
set sort_order = ranked.ord
from ranked
where s.id = ranked.id;

create index if not exists idx_schedules_date_sort_order on schedules (date, sort_order);

create table if not exists stream_expenses (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  stream_id text not null references streams(id) on delete cascade,
  name text not null,
  price double precision not null check (price >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_stream_expenses_stream_id on stream_expenses (stream_id);
