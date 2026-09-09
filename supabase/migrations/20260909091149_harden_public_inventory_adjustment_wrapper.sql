create or replace function public.adjust_branch_inventory(
  p_request_id uuid,
  p_product_id uuid,
  p_branch_id uuid,
  p_delta numeric
)
returns numeric
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then
    raise exception using errcode='42501',message='INVENTORY_BRANCH_ACCESS_DENIED';
  end if;
  if not public.staff_has_permission('inventory.manage',p_branch_id) then
    raise exception using errcode='42501',message='INVENTORY_MANAGE_DENIED';
  end if;
  return private.adjust_branch_inventory(p_request_id,p_product_id,p_branch_id,p_delta);
end;
$function$;

revoke all on function public.adjust_branch_inventory(uuid,uuid,uuid,numeric) from public,anon;
grant execute on function public.adjust_branch_inventory(uuid,uuid,uuid,numeric) to authenticated;
