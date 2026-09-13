-- Supplier records include balances, tax identifiers and internal notes; do not
-- expose them to every active employee. Inventory alerts likewise only belong to
-- staff with inventory visibility.

drop policy if exists "Active staff view suppliers" on public.suppliers;
create policy "Authorized staff view suppliers"
on public.suppliers for select to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or private.can_manage_suppliers()
  or public.staff_has_any_branch_permission('purchases.manage')
);

drop policy if exists "Active staff view inventory alerts" on public.inventory_alerts;
create policy "Inventory staff view inventory alerts"
on public.inventory_alerts for select to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_any_branch_permission('inventory.view')
  or public.staff_has_any_branch_permission('inventory.manage')
);
