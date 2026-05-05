insert into metal_inventory_pool (metal, grams_on_hand, total_cost_on_hand)
values
  ('gold', 0, 0),
  ('silver', 0, 0)
on conflict (metal) do nothing;
