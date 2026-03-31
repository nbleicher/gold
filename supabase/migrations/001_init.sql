create extension if not exists pgcrypto;

create type app_role as enum ('admin', 'user');
create type metal_type as enum ('gold', 'silver', 'mixed');
create type sale_type as enum ('sticker', 'raw');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role app_role not null default 'user',
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  metal metal_type not null check (metal in ('gold', 'silver')),
  grams numeric(12,4) not null check (grams > 0),
  remaining_grams numeric(12,4) not null check (remaining_grams >= 0),
  purchase_spot numeric(12,2) not null check (purchase_spot >= 0),
  total_cost numeric(12,2) not null check (total_cost >= 0),
  batch_number integer generated always as identity,
  batch_name text generated always as (
    case when metal = 'gold' then 'Gold Batch #' else 'Silver Batch #' end || batch_number::text
  ) stored,
  sticker_batch_letter text not null default 'A' check (char_length(sticker_batch_letter) = 1),
  created_at timestamptz not null default now()
);

create unique index if not exists inventory_batches_metal_letter_uidx
  on public.inventory_batches (metal, upper(sticker_batch_letter));

create table if not exists public.bag_orders (
  id uuid primary key default gen_random_uuid(),
  primary_batch_id uuid not null references public.inventory_batches(id) on delete cascade,
  metal metal_type not null,
  actual_weight_grams numeric(12,4) not null check (actual_weight_grams > 0),
  tier_index integer not null check (tier_index > 0),
  sticker_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.bag_order_components (
  id uuid primary key default gen_random_uuid(),
  bag_order_id uuid not null references public.bag_orders(id) on delete cascade,
  batch_id uuid not null references public.inventory_batches(id) on delete cascade,
  metal metal_type not null check (metal in ('gold', 'silver')),
  weight_grams numeric(12,4) not null check (weight_grams > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.streams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  gold_batch_id uuid references public.inventory_batches(id),
  silver_batch_id uuid references public.inventory_batches(id)
);

create table if not exists public.stream_items (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams(id) on delete cascade,
  sale_type sale_type not null,
  name text not null,
  metal metal_type not null,
  weight_grams numeric(12,4) not null check (weight_grams > 0),
  spot_value numeric(12,2) not null check (spot_value >= 0),
  spot_price numeric(12,2) not null check (spot_price >= 0),
  sticker_code text,
  batch_id uuid references public.inventory_batches(id),
  created_at timestamptz not null default now()
);

create unique index if not exists stream_items_sticker_unique
  on public.stream_items (upper(sticker_code))
  where sale_type = 'sticker' and sticker_code is not null;

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  streamer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  cost numeric(12,2) not null check (cost >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  filename text not null,
  rows integer not null check (rows >= 0),
  imported_at timestamptz not null default now()
);

create table if not exists public.spot_snapshots (
  id uuid primary key default gen_random_uuid(),
  metal metal_type not null check (metal in ('gold', 'silver')),
  price numeric(12,2) not null check (price > 0),
  source_state text not null default 'primary',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.bag_orders enable row level security;
alter table public.bag_order_components enable row level security;
alter table public.streams enable row level security;
alter table public.stream_items enable row level security;
alter table public.schedules enable row level security;
alter table public.expenses enable row level security;
alter table public.payroll_records enable row level security;
alter table public.spot_snapshots enable row level security;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

create policy "profiles self read"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin(auth.uid()));

create policy "profiles self update"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin(auth.uid()));

create policy "admin all inventory_batches"
  on public.inventory_batches for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "auth read inventory_batches"
  on public.inventory_batches for select
  using (auth.uid() is not null);

create policy "admin all bag_orders"
  on public.bag_orders for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "auth read bag_orders"
  on public.bag_orders for select
  using (auth.uid() is not null);

create policy "admin all bag_order_components"
  on public.bag_order_components for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "auth read bag_order_components"
  on public.bag_order_components for select
  using (auth.uid() is not null);

create policy "stream owner read"
  on public.streams for select
  using (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy "stream owner write"
  on public.streams for all
  using (auth.uid() = user_id or public.is_admin(auth.uid()))
  with check (auth.uid() = user_id or public.is_admin(auth.uid()));

create policy "stream items by stream access"
  on public.stream_items for select
  using (
    exists (
      select 1 from public.streams s
      where s.id = stream_id and (s.user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

create policy "stream items by stream write"
  on public.stream_items for all
  using (
    exists (
      select 1 from public.streams s
      where s.id = stream_id and (s.user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  )
  with check (
    exists (
      select 1 from public.streams s
      where s.id = stream_id and (s.user_id = auth.uid() or public.is_admin(auth.uid()))
    )
  );

create policy "admin all schedules"
  on public.schedules for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "auth read schedules"
  on public.schedules for select
  using (auth.uid() is not null);

create policy "admin all expenses"
  on public.expenses for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "admin all payroll_records"
  on public.payroll_records for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "admin all spot_snapshots"
  on public.spot_snapshots for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create policy "auth read spot_snapshots"
  on public.spot_snapshots for select
  using (auth.uid() is not null);
