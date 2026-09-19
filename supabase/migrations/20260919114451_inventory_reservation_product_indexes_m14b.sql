-- M14b — reservation lookup/product indexes
create index if not exists inventory_reservation_balances_product_v1_idx
  on private.inventory_reservation_balances_v1(product_id);

create index if not exists inventory_reservations_order_state_v1_idx
  on private.inventory_reservations_v1(order_id,state);

create index if not exists inventory_reservations_product_v1_idx
  on private.inventory_reservations_v1(product_id);

create index if not exists inventory_reservations_stock_state_v1_idx
  on private.inventory_reservations_v1(branch_id,product_id,state);
