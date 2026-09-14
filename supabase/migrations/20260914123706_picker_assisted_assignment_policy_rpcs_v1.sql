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
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.fulfillment_actor_allowed_v1(v_uid,p_branch_id)
     and not public.staff_has_permission('online_orders.view',p_branch_id) then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  select mode,offer_ttl_seconds into v_mode,v_ttl from private.order_picker_assignment_policy_v1 where branch_id=p_branch_id;
  return jsonb_build_object('branch_id',p_branch_id,'mode',coalesce(v_mode,'shadow'),'offer_ttl_seconds',coalesce(v_ttl,90));
end;
$function$;

create or replace function public.set_picker_assignment_policy_v1(p_branch_id uuid,p_mode text,p_offer_ttl_seconds integer default 90)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_order record;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.staff_is_super_admin(v_uid) and not public.staff_has_permission('online_orders.manage',p_branch_id) then
    raise exception using errcode='42501',message='ORDER_MANAGER_REQUIRED';
  end if;
  if p_mode not in ('shadow','assisted') then raise exception using errcode='22023',message='INVALID_ASSIGNMENT_MODE'; end if;
  if p_offer_ttl_seconds<30 or p_offer_ttl_seconds>300 then raise exception using errcode='22023',message='INVALID_OFFER_TTL'; end if;

  insert into private.order_picker_assignment_policy_v1(branch_id,mode,offer_ttl_seconds,updated_by,updated_at)
  values(p_branch_id,p_mode,p_offer_ttl_seconds,v_uid,now())
  on conflict(branch_id) do update set mode=excluded.mode,offer_ttl_seconds=excluded.offer_ttl_seconds,updated_by=v_uid,updated_at=now();

  if p_mode='shadow' then
    update private.order_picker_assignment_offers_v1
       set status='cancelled',responded_at=coalesce(responded_at,now()),reason='policy_switched_to_shadow',updated_at=now()
     where branch_id=p_branch_id and status='offered';
  else
    for v_order in
      select f.order_id from private.order_fulfillment_state_v1 f
      join public.online_orders o on o.id=f.order_id
      where f.branch_id=p_branch_id and f.fulfillment_state='queued' and f.picker_user_id is null
        and o.status::text in ('confirmed','preparing')
      order by f.predicted_ready_at nulls last
      limit 50
    loop
      perform private.refresh_order_picker_assignment_shadow_v1(v_order.order_id);
      perform private.sync_order_picker_assignment_offer_v1(v_order.order_id);
    end loop;
  end if;

  return jsonb_build_object('ok',true,'branch_id',p_branch_id,'mode',p_mode,'offer_ttl_seconds',p_offer_ttl_seconds);
end;
$function$;

revoke all on function public.get_picker_assignment_policy_v1(uuid) from public,anon;
revoke all on function public.set_picker_assignment_policy_v1(uuid,text,integer) from public,anon;
grant execute on function public.get_picker_assignment_policy_v1(uuid) to authenticated;
grant execute on function public.set_picker_assignment_policy_v1(uuid,text,integer) to authenticated;