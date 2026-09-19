-- M14h — keep the 5-minute watchdog lookup bounded as reservation volume grows.
create index if not exists inventory_reservations_active_watchdog_v1_idx
  on private.inventory_reservations_v1(reserved_at,order_id)
  where state='reserved';
