drop policy if exists order_management on public.online_orders;
drop policy if exists staff_online_orders_select on public.online_orders;
drop policy if exists staff_online_orders_insert on public.online_orders;
drop policy if exists staff_online_orders_update on public.online_orders;
drop policy if exists staff_online_orders_delete on public.online_orders;

create policy staff_online_orders_select
on public.online_orders
for select
to authenticated
using (
  public.staff_has_permission('online_orders.view', branch_id)
  or public.staff_has_permission('online_orders.manage', branch_id)
);

create policy staff_online_orders_insert
on public.online_orders
for insert
to authenticated
with check (
  public.staff_has_permission('online_orders.manage', branch_id)
);

create policy staff_online_orders_update
on public.online_orders
for update
to authenticated
using (
  public.staff_has_permission('online_orders.manage', branch_id)
)
with check (
  public.staff_has_permission('online_orders.manage', branch_id)
);

create policy staff_online_orders_delete
on public.online_orders
for delete
to authenticated
using (
  public.staff_has_permission('online_orders.manage', branch_id)
);
