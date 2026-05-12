-- Virtual pool primaries + bag-level DCA cost snapshots.

alter table bag_orders
  add column if not exists cost_basis_method text not null default 'batch_components',
  add column if not exists cost_basis_usd double precision,
  add column if not exists cost_basis_per_gram double precision;

alter table inventory_batches
  add column if not exists is_virtual_pool boolean not null default false;

insert into inventory_batches (
  id,
  date,
  metal,
  grams,
  remaining_grams,
  purchase_spot,
  total_cost,
  batch_name,
  sticker_batch_letter,
  is_virtual_pool
)
values
  (
    '00000000000000000000000000000001',
    current_date::text,
    'gold',
    0.0001,
    0,
    0,
    0,
    'Metal Pool (Gold)',
    'P',
    true
  ),
  (
    '00000000000000000000000000000002',
    current_date::text,
    'silver',
    0.0001,
    0,
    0,
    0,
    'Metal Pool (Silver)',
    'Q',
    true
  )
on conflict (id) do nothing;
