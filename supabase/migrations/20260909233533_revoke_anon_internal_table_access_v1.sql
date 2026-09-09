-- Batch 3: remove anonymous direct access from internal tables.
-- Preserve authenticated compatibility; customer/public catalog tables are intentionally untouched.

revoke all privileges on table public.admin_notifications from anon;
revoke all privileges on table public.coupon_usage from anon;
revoke all privileges on table public.customer_interactions from anon;
revoke all privileges on table public.leads from anon;
revoke select on table public.loyalty_vouchers from anon;
revoke select on table public.loyalty_voucher_usages from anon;
revoke all privileges on table public.online_orders from anon;
revoke all privileges on table public.order_routing_log from anon;
revoke all privileges on table public.pos_workspace_backups from anon;
revoke select on table public.staff_permissions from anon;
revoke select on table public.staff_role_permissions from anon;
revoke select on table public.staff_roles from anon;
revoke all privileges on table public.tenant_analytics from anon;
revoke all privileges on table public.tenant_applications from anon;
revoke all privileges on table public.tenant_subscriptions from anon;
revoke all privileges on table public.tenant_users from anon;
revoke all privileges on table public.tenants from anon;

-- Remove legacy temporary routing-log policies that bypass authenticated admin policies.
drop policy if exists "Temporary public manage order_routing_log" on public.order_routing_log;
drop policy if exists "System can insert routing logs" on public.order_routing_log;
