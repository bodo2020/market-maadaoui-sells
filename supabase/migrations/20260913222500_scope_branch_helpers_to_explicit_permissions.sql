-- Eliminate legacy role fallbacks that could grant cross-branch access.
-- Branch-sensitive helpers now rely on explicit, branch-scoped permissions.

create or replace function private.can_manage_inventory_branch(_branch uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select case
    when (select auth.uid()) is null or _branch is null then false
    when public.is_admin() or public.is_super_admin() then true
    when public.staff_has_permission('inventory.manage', _branch) then true
    when public.staff_has_permission('products.manage', _branch) then true
    else false
  end;
$$;

create or replace function private.can_operate_cash_branch(_branch uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select case
    when (select auth.uid()) is null or _branch is null then false
    when public.is_admin() or public.is_super_admin() then true
    when public.staff_has_permission('pos.use', _branch) then true
    else false
  end;
$$;

revoke all on function private.can_manage_inventory_branch(uuid) from public, anon, authenticated;
revoke all on function private.can_operate_cash_branch(uuid) from public, anon, authenticated;
grant execute on function private.can_manage_inventory_branch(uuid) to service_role;
grant execute on function private.can_operate_cash_branch(uuid) to service_role;
