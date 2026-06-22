-- Align committed Supabase schema with the active API and legacy Turso import shape.

alter table inventory_batches
  add column if not exists batch_number integer;

alter table bag_order_components
  add column if not exists created_at timestamptz not null default now();

alter table breaks
  add column if not exists sold_spots integer not null default 0,
  add column if not exists cloned_from_id text references breaks(id) on delete set null;

alter table break_spots
  add column if not exists created_at timestamptz not null default now();

alter table spot_snapshots
  add column if not exists price double precision,
  add column if not exists source_state text;

alter table spot_snapshots
  alter column price_per_oz_usd drop not null;

update spot_snapshots
set price = coalesce(price, price_per_oz_usd),
    price_per_oz_usd = coalesce(price_per_oz_usd, price),
    source_state = coalesce(source_state, source, 'fallback'),
    source = coalesce(source_state, source, 'fallback');

alter table spot_snapshots
  alter column source_state set default 'fallback';

create index if not exists idx_spot_snapshots_metal_created
  on spot_snapshots (metal, created_at desc);
