-- M17c — covering indexes for delivery proof foreign keys.

create index if not exists delivery_order_proofs_assignment_v1_idx
  on private.delivery_order_delivery_proofs_v1(assignment_id);

create index if not exists delivery_order_proofs_group_v1_idx
  on private.delivery_order_delivery_proofs_v1(order_group_id);

create index if not exists delivery_order_proofs_route_v1_idx
  on private.delivery_order_delivery_proofs_v1(route_id);

create index if not exists delivery_order_proofs_verification_order_v1_idx
  on private.delivery_order_delivery_proofs_v1(verification_order_id);
