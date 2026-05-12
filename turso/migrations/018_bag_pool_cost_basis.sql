-- Virtual pool primaries + bag-level DCA cost snapshots.

ALTER TABLE bag_orders ADD COLUMN cost_basis_method TEXT NOT NULL DEFAULT 'batch_components';
ALTER TABLE bag_orders ADD COLUMN cost_basis_usd REAL;
ALTER TABLE bag_orders ADD COLUMN cost_basis_per_gram REAL;

ALTER TABLE inventory_batches ADD COLUMN is_virtual_pool INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO inventory_batches (
  id,
  date,
  metal,
  grams,
  remaining_grams,
  purchase_spot,
  total_cost,
  batch_number,
  batch_name,
  sticker_batch_letter,
  is_virtual_pool
)
VALUES
  (
    '00000000000000000000000000000001',
    date('now'),
    'gold',
    0.0001,
    0,
    0,
    0,
    0,
    'Metal Pool (Gold)',
    'P',
    1
  ),
  (
    '00000000000000000000000000000002',
    date('now'),
    'silver',
    0.0001,
    0,
    0,
    0,
    0,
    'Metal Pool (Silver)',
    'Q',
    1
  );
