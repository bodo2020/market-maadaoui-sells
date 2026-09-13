-- Internal RBAC metadata must not be enumerable by every authenticated account.
-- Customer accounts are authenticated too, so scope these reads to active staff.

drop policy if exists "staff_permissions_authenticated_read" on public.staff_permissions;
drop policy if exists "staff_permissions_active_staff_read" on public.staff_permissions;
create policy "staff_permissions_active_staff_read"
on public.staff_permissions
for select to authenticated
using (private.is_active_staff());

drop policy if exists "staff_role_permissions_authenticated_read" on public.staff_role_permissions;
drop policy if exists "staff_role_permissions_active_staff_read" on public.staff_role_permissions;
create policy "staff_role_permissions_active_staff_read"
on public.staff_role_permissions
for select to authenticated
using (private.is_active_staff());

drop policy if exists "staff_roles_authenticated_read" on public.staff_roles;
drop policy if exists "staff_roles_active_staff_read" on public.staff_roles;
create policy "staff_roles_active_staff_read"
on public.staff_roles
for select to authenticated
using (private.is_active_staff());
