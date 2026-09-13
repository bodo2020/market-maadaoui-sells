-- A branch assignment proves membership, not authority to change branch settings,
-- delivery coverage or inventory batch/cost data. Replace has_branch_access based
-- management policies with explicit branch permissions.

drop policy if exists "Admins can manage delivery zones" on public.branch_delivery_zones;
create policy "Staff manage delivery zones"
on public.branch_delivery_zones for all to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_permission('branch.manage_settings', branch_id)
  or public.staff_has_permission('pricing.manage', branch_id)
)
with check (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_permission('branch.manage_settings', branch_id)
  or public.staff_has_permission('pricing.manage', branch_id)
);

drop policy if exists "Admins manage branch_neighborhoods" on public.branch_neighborhoods;
create policy "Staff manage branch neighborhoods"
on public.branch_neighborhoods for all to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_permission('branch.manage_settings', branch_id)
  or public.staff_has_permission('pricing.manage', branch_id)
)
with check (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_permission('branch.manage_settings', branch_id)
  or public.staff_has_permission('pricing.manage', branch_id)
);

drop policy if exists "Admins can manage batches for their branch" on public.product_batches;
drop policy if exists "Users can view batches for their branch" on public.product_batches;

create policy "Inventory staff view branch batches"
on public.product_batches for select to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_permission('inventory.manage', branch_id)
  or public.staff_has_permission('products.manage', branch_id)
  or public.staff_has_permission('purchases.manage', branch_id)
);

create policy "Inventory staff manage branch batches"
on public.product_batches for all to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_permission('inventory.manage', branch_id)
  or public.staff_has_permission('products.manage', branch_id)
  or public.staff_has_permission('purchases.manage', branch_id)
)
with check (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_permission('inventory.manage', branch_id)
  or public.staff_has_permission('products.manage', branch_id)
  or public.staff_has_permission('purchases.manage', branch_id)
);
