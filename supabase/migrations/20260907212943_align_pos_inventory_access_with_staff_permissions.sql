create or replace function private.can_operate_cash_branch(_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when (select auth.uid()) is null then false
    when private.staff_is_super_admin((select auth.uid())) then true
    when _branch is null then false
    when public.staff_has_permission('pos.use',_branch) then true
    else exists (
      select 1
      from public.users u
      left join public.user_branch_roles ubr
        on ubr.user_id=u.id and ubr.branch_id=_branch
      where u.id=(select auth.uid())
        and coalesce(u.active,true)
        and (
          u.role in ('super_admin','admin')
          or u.role in ('cashier','branch_manager')
          or ubr.role in ('cashier','branch_manager','branch_admin')
        )
    )
  end;
$function$;

create or replace function private.can_manage_inventory_branch(_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when (select auth.uid()) is null or _branch is null then false
    when private.staff_is_super_admin((select auth.uid())) then true
    when public.staff_has_permission('inventory.manage',_branch) then true
    when public.staff_has_permission('products.manage',_branch) then true
    else exists (
      select 1
      from public.users u
      left join public.user_branch_roles ubr
        on ubr.user_id=u.id and ubr.branch_id=_branch
      where u.id=(select auth.uid())
        and coalesce(u.active,true)
        and (
          u.role in ('super_admin','admin')
          or u.role in ('branch_manager','employee')
          or ubr.role in ('branch_manager','branch_admin','employee','inventory','inventory_manager')
        )
    )
  end;
$function$;

revoke all on function private.can_operate_cash_branch(uuid) from public,anon,authenticated;
revoke all on function private.can_manage_inventory_branch(uuid) from public,anon,authenticated;
grant execute on function private.can_operate_cash_branch(uuid) to service_role;
grant execute on function private.can_manage_inventory_branch(uuid) to service_role;
