alter table inventory_sessions
  drop constraint if exists inventory_sessions_metal_check;

alter table bag_orders
  drop constraint if exists bag_orders_metal_check;

alter table stream_items
  drop constraint if exists stream_items_metal_check;
