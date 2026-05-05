create extension if not exists pgcrypto;

create table if not exists users (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  supabase_user_id uuid unique,
  email text not null unique,
  username text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'streamer', 'shipper', 'bagger')),
  display_name text,
  commission_percent double precision not null default 0,
  requires_login integer not null default 1 check (requires_login in (0, 1)),
  is_active integer not null default 1 check (is_active in (0, 1)),
  pay_structure text not null default 'commission' check (pay_structure in ('commission', 'hourly')),
  hourly_rate double precision not null default 0,
  deactivated_at timestamptz,
  deactivated_by text references users(id) on delete set null,
  purged_at timestamptz,
  purged_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists inventory_batches (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  date text not null,
  metal text not null check (metal in ('gold', 'silver')),
  grams double precision not null check (grams > 0),
  remaining_grams double precision not null check (remaining_grams >= 0),
  purchase_spot double precision not null default 0,
  total_cost double precision not null check (total_cost >= 0),
  batch_name text,
  sticker_batch_letter text not null default 'A',
  created_at timestamptz not null default now()
);

create table if not exists bag_orders (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  primary_batch_id text not null references inventory_batches(id) on delete restrict,
  metal text not null check (metal in ('gold', 'silver')),
  actual_weight_grams double precision not null check (actual_weight_grams > 0),
  tier_index integer not null check (tier_index >= 0),
  sticker_code text not null unique,
  sold_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists bag_order_components (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  bag_order_id text not null references bag_orders(id) on delete cascade,
  batch_id text not null references inventory_batches(id) on delete restrict,
  metal text not null check (metal in ('gold', 'silver')),
  weight_grams double precision not null check (weight_grams > 0)
);

create table if not exists streams (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id text not null references users(id) on delete restrict,
  stream_kind text not null default 'break',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  gold_batch_id text references inventory_batches(id) on delete set null,
  silver_batch_id text references inventory_batches(id) on delete set null,
  completed_earnings double precision
);

create table if not exists breaks (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  status text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  name text not null,
  total_spots integer not null default 50 check (total_spots > 0),
  fixed_silver_spots integer not null default 40 check (fixed_silver_spots >= 0),
  sold_prize_spots integer not null default 0 check (sold_prize_spots >= 0),
  total_silver_budget_grams double precision not null default 40 check (total_silver_budget_grams >= 0),
  remaining_silver_grams double precision not null default 40 check (remaining_silver_grams >= 0),
  is_template integer not null default 0 check (is_template in (0, 1)),
  source_template_id text references breaks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stream_breaks (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  stream_id text not null references streams(id) on delete cascade,
  break_id text not null references breaks(id) on delete restrict,
  floor_spots integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_reason text,
  run_total_cost double precision not null default 0,
  run_total_silver_grams double precision not null default 0
);

create table if not exists break_prize_slots (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  break_id text not null references breaks(id) on delete cascade,
  slot_number integer not null check (slot_number > 0),
  slot_type text not null check (slot_type in ('normal', 'mega', 'prize')),
  metal text not null check (metal in ('gold', 'silver')),
  grams double precision not null check (grams >= 0),
  cost double precision not null check (cost >= 0),
  is_consumed integer not null default 0 check (is_consumed in (0, 1)),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (break_id, slot_number)
);

create table if not exists break_spots (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  break_id text not null references breaks(id) on delete cascade,
  spot_number integer not null check (spot_number > 0),
  outcome_type text check (outcome_type in ('silver', 'prize')),
  prize_slot_id text references break_prize_slots(id) on delete set null,
  metal text check (metal in ('gold', 'silver')),
  grams double precision,
  cost double precision,
  processed_at timestamptz,
  unique (break_id, spot_number)
);

create table if not exists stream_items (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  stream_id text not null references streams(id) on delete cascade,
  sale_type text not null check (sale_type in ('raw', 'sticker')),
  name text not null,
  metal text not null check (metal in ('gold', 'silver')),
  weight_grams double precision not null check (weight_grams > 0),
  spot_value double precision not null check (spot_value >= 0),
  spot_price double precision not null check (spot_price >= 0),
  sticker_code text,
  batch_id text references inventory_batches(id) on delete set null,
  break_id text references breaks(id) on delete set null,
  break_spot_id text references break_spots(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_stream_items_sticker_unique
  on stream_items (sticker_code)
  where sale_type = 'sticker' and sticker_code is not null;

create table if not exists schedules (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  date text not null,
  start_time text not null,
  end_time text,
  streamer_id text not null references users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by text references users(id) on delete set null,
  pending_submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text references users(id) on delete set null,
  review_note text,
  entry_type text not null default 'stream' check (entry_type in ('stream', 'labor')),
  hours_worked double precision,
  created_at timestamptz not null default now()
);

create table if not exists expenses (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  date text not null,
  name text not null,
  cost double precision not null check (cost >= 0),
  created_at timestamptz not null default now()
);

create table if not exists payroll_records (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id text not null references users(id) on delete cascade,
  filename text not null,
  rows integer not null default 0,
  storage_path text,
  imported_at timestamptz not null default now()
);

create table if not exists spot_snapshots (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  metal text not null check (metal in ('gold', 'silver')),
  price_per_oz_usd double precision not null check (price_per_oz_usd > 0),
  source text not null default 'fallback',
  created_at timestamptz not null default now()
);

create table if not exists metal_inventory_pool (
  metal text primary key check (metal in ('gold', 'silver')),
  grams_on_hand double precision not null default 0 check (grams_on_hand >= 0),
  total_cost_on_hand double precision not null default 0 check (total_cost_on_hand >= 0),
  updated_at timestamptz not null default now()
);
