-- Trigger functions are invoked by PostgreSQL triggers, not by browser RPC calls.
-- Remove the default PUBLIC EXECUTE grant so anon/authenticated clients cannot
-- expose or invoke internal trigger helpers through the API surface.

revoke all on function public.create_default_inventory_alert() from public, anon, authenticated;
revoke all on function public.update_branch_delivery_zones_updated_at() from public, anon, authenticated;
revoke all on function public.update_damaged_products_updated_at() from public, anon, authenticated;
revoke all on function public.update_inventory_alerts_updated_at() from public, anon, authenticated;
revoke all on function public.update_inventory_session_stats() from public, anon, authenticated;
revoke all on function public.update_inventory_transfers_updated_at() from public, anon, authenticated;
revoke all on function public.update_inventory_updated_at() from public, anon, authenticated;
revoke all on function public.update_product_variants_updated_at() from public, anon, authenticated;
revoke all on function public.update_tenant_updated_at() from public, anon, authenticated;
