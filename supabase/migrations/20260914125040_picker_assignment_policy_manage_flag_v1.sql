create or replace function public.get_picker_assignment_policy_v1(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_mode text:='shadow';
  v_ttl integer:=90;
  v_can_manage boolean:=false;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.fulfillment_actor_allowed_v1(v_uid,p_branch_id)
     and not public.staff_has_permission('online_orders.view',p_branch_id) then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  v_can_manage:=private.staff_is_super_admin(v_uid) or public.staff_has_permission('online_orders.manage',p_branch_id);
  select mode,offer_ttl_seconds into v_mode,v_ttl from private.order_picker_assignment_policy_v1 where branch_id=p_branch_id;
  return jsonb_build_object(
    'branch_id',p_branch_id,
    'mode',coalesce(v_mode,'shadow'),
    'offer_ttl_seconds',coalesce(v_ttl,90),
    'can_manage',v_can_manage
  );
end;
$function$;