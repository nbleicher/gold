create table if not exists inventory_sessions (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id text not null references users(id) on delete restrict,
  metal text not null check (metal in ('gold', 'silver')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists idx_inventory_sessions_user_active
  on inventory_sessions (user_id, ended_at, started_at desc);

alter table bag_orders
  add column if not exists inventory_session_id text references inventory_sessions(id) on delete set null;

create index if not exists idx_bag_orders_inventory_session
  on bag_orders (inventory_session_id);

create table if not exists inventory_session_events (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  session_id text not null references inventory_sessions(id) on delete cascade,
  user_id text not null references users(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_session_events_session
  on inventory_session_events (session_id, created_at desc);
