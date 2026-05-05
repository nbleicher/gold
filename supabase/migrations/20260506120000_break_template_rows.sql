-- Break template rows + spot_kind on break_spots (align with turso 016).

create table if not exists break_template_rows (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  break_id text not null references breaks(id) on delete cascade,
  row_number integer not null check (row_number >= 1 and row_number <= 100),
  spot_type text not null check (spot_type in ('floor', 'prize')),
  metal text not null check (metal in ('gold', 'silver')),
  grams double precision not null check (grams > 0),
  quantity integer not null check (quantity >= 1 and quantity <= 200),
  created_at timestamptz not null default now(),
  unique (break_id, row_number)
);

alter table break_spots add column if not exists spot_kind text
  check (spot_kind is null or spot_kind in ('floor', 'prize'));
