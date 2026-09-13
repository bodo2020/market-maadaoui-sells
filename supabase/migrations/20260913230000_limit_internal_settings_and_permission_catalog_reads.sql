-- Least-privilege direct reads for internal settings and authorization metadata.
-- Runtime staff authentication gets effective permissions through SECURITY DEFINER
-- identity/branch RPCs, so cashiers/delivery staff do not need the full RBAC catalog.

drop policy if exists "security_invoice_settings_staff_read" on public.invoice_settings;
create policy "Authorized staff read invoice settings"
on public.invoice_settings for select to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_any_branch_permission('pos.use')
  or public.staff_has_any_branch_permission('branch.manage_settings')
  or public.staff_has_any_branch_permission('finance.view')
  or public.staff_has_any_branch_permission('finance.manage')
);

drop policy if exists "staff_permissions_active_staff_read" on public.staff_permissions;
create policy "Staff managers read permission catalog"
on public.staff_permissions for select to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_any_branch_permission('branch.manage_staff')
  or public.staff_has_any_branch_permission('hr.manage_employees')
  or public.staff_has_any_branch_permission('hr.admin')
);

drop policy if exists "staff_roles_active_staff_read" on public.staff_roles;
create policy "Staff managers read role catalog"
on public.staff_roles for select to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_any_branch_permission('branch.manage_staff')
  or public.staff_has_any_branch_permission('hr.manage_employees')
  or public.staff_has_any_branch_permission('hr.admin')
);

drop policy if exists "staff_role_permissions_active_staff_read" on public.staff_role_permissions;
create policy "Staff managers read role permission map"
on public.staff_role_permissions for select to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_any_branch_permission('branch.manage_staff')
  or public.staff_has_any_branch_permission('hr.manage_employees')
  or public.staff_has_any_branch_permission('hr.admin')
);
