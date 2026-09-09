-- Batch 4: hide sensitive support tables from anonymous GraphQL/REST discovery.
-- Customer catalog and checkout continue through SECURITY DEFINER customer RPCs.

revoke select on table public.branch_product_pricing from anon;
revoke select on table public.inventory from anon;
revoke select on table public.product_batches from anon;
revoke select on table public.franchise_settings from anon;
revoke select on table public.invoice_settings from anon;
revoke select on table public.payment_settings from anon;
