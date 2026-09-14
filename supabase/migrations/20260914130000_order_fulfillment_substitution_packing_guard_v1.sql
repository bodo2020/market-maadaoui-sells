create or replace function public.start_order_packing_v1(
  p_order_id uuid,
  p_bags_count integer default 0
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_state private.order_fulfillment_state_v1%rowtype;
  v_unresolved integer;
  v_pending integer;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_state from private.order_fulfillment_state_v1 where order_id=p_order_id for update;
  if v_state.order_id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  if not private.fulfillment_actor_allowed_v1(v_uid,v_state.branch_id) then raise exception using errcode='42501',message='FULFILLMENT_PERMISSION_DENIED'; end if;
  if v_state.picker_user_id is distinct from v_uid and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if p_bags_count<0 then raise exception using errcode='22023',message='INVALID_BAGS_COUNT'; end if;
  if v_state.fulfillment_state<>'picking' then raise exception using errcode='55000',message='PICKING_NOT_ACTIVE'; end if;

  select count(*) into v_pending
  from private.order_fulfillment_substitutions_v1
  where order_id=p_order_id and status='pending';
  if v_pending>0 then raise exception using errcode='55000',message='PENDING_SUBSTITUTIONS_EXIST'; end if;

  select count(*) into v_unresolved
  from private.order_fulfillment_items_v1
  where order_id=p_order_id
    and required_quantity-picked_quantity-shortage_quantity-substitution_quantity>0.0005;
  if v_unresolved>0 then raise exception using errcode='55000',message='PICKING_ITEMS_UNRESOLVED'; end if;

  update private.order_fulfillment_state_v1
  set fulfillment_state='packing',
      picking_completed_at=coalesce(picking_completed_at,now()),
      packing_started_at=coalesce(packing_started_at,now()),
      items_picked=greatest(items_picked,items_total-shortage_count),
      bags_count=greatest(bags_count,p_bags_count),
      updated_at=now()
  where order_id=p_order_id
  returning * into v_state;

  insert into public.operations_task_events(task_id,event_type,actor_id,note)
  values(v_state.pick_task_id,'packing_started',v_uid,'بدأت تعبئة الطلب');

  return jsonb_build_object(
    'ok',true,
    'order_id',p_order_id,
    'state','packing',
    'bags_count',v_state.bags_count
  );
end;
$$;
