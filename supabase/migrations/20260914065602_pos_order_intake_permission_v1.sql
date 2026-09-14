insert into public.staff_permissions(code,name_ar,module,description)
values('online_orders.intake','استلام الطلبات الإلكترونية','online_orders','عرض واستلام ومراجعة الطلبات الإلكترونية الواردة للفرع من داخل نقطة البيع بدون صلاحيات الإدارة الكاملة')
on conflict(code) do update set name_ar=excluded.name_ar,module=excluded.module,description=excluded.description;

insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id
from public.staff_roles r cross join public.staff_permissions p
where r.code in ('cashier','branch_admin','branch_manager','online_orders')
  and p.code='online_orders.intake'
on conflict do nothing;

drop policy if exists staff_online_orders_select on public.online_orders;
create policy staff_online_orders_select on public.online_orders
for select to authenticated
using (
  public.staff_has_permission('online_orders.view',branch_id)
  or public.staff_has_permission('online_orders.manage',branch_id)
  or public.staff_has_permission('online_orders.prepare',branch_id)
  or public.staff_has_permission('online_orders.intake',branch_id)
);
