alter table private.delivery_order_assignments_v1
  add column if not exists tracking_number text;

-- Tracking is intentionally kept in the operational assignment record rather
-- than the immutable checkout snapshot in online_orders. Final RPC definitions
-- are installed by the following v3 migration.
