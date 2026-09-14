create or replace function private.auto_confirm_online_order_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_method text:=lower(trim(coalesce(new.payment_method,'cash')));
  v_payment text:=new.payment_status::text;
begin
  if new.status::text <> 'pending' or new.branch_id is null then
    return new;
  end if;

  if not (
    (v_method in ('cash','كاش','cod','cash_on_delivery') and v_payment in ('pending','paid'))
    or v_payment='paid'
  ) then
    return new;
  end if;

  update public.online_orders
  set status='confirmed'::public.order_status,
      updated_at=now()
  where id=new.id
    and status::text='pending';

  return new;
end;
$function$;

drop trigger if exists auto_confirm_online_order_v1 on public.online_orders;
create trigger auto_confirm_online_order_v1
after insert or update of payment_status,branch_id on public.online_orders
for each row
execute function private.auto_confirm_online_order_v1();

create or replace function private.auto_assign_claimed_delivery_order_v1(
  p_order_id uuid,
  p_actor_id uuid,
  p_source text default 'picker_claim_v1'
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.online_orders%rowtype;
  v_rec jsonb;
  v_driver_id uuid;
  v_driver_name text;
  v_assignment_id uuid;
  v_source text:=coalesce(nullif(trim(coalesce(p_source,'')),''),'picker_claim_v1');
begin
  select * into v_order
  from public.online_orders
  where id=p_order_id
  for update;

  if v_order.id is null then
    return jsonb_build_object('ok',false,'reason','order_not_found');
  end if;

  if v_order.branch_id is null
     or v_order.status::text not in ('confirmed','preparing','ready') then
    return jsonb_build_object('ok',false,'reason','order_not_dispatchable');
  end if;

  if exists(
    select 1
    from private.delivery_order_assignments_v1 a
    where a.order_id=p_order_id and a.unassigned_at is null
  ) then
    return jsonb_build_object('ok',true,'idempotent',true,'reason','already_assigned');
  end if;

  if p_actor_id is null or not exists(select 1 from public.users u where u.id=p_actor_id) then
    insert into public.delivery_realtime_signals_v1(branch_id,recipient_user_id,event_type,entity_id)
    values(v_order.branch_id,null,'dispatch_needed',p_order_id);
    return jsonb_build_object('ok',false,'reason','assignment_actor_unavailable');
  end if;

  v_rec:=private.order_dispatch_recommendation_v1(p_order_id);
  v_driver_id:=nullif(v_rec#>>'{recommended_driver,id}','')::uuid;

  if v_driver_id is null then
    insert into public.delivery_realtime_signals_v1(branch_id,recipient_user_id,event_type,entity_id)
    values(v_order.branch_id,null,'dispatch_needed',p_order_id);
    return jsonb_build_object('ok',false,'reason','no_available_driver','recommendation',coalesce(v_rec,'{}'::jsonb));
  end if;

  select u.name into v_driver_name
  from public.users u
  where u.id=v_driver_id and u.role='delivery' and coalesce(u.active,true);

  if v_driver_name is null then
    insert into public.delivery_realtime_signals_v1(branch_id,recipient_user_id,event_type,entity_id)
    values(v_order.branch_id,null,'dispatch_needed',p_order_id);
    return jsonb_build_object('ok',false,'reason','recommended_driver_invalid');
  end if;

  begin
    insert into private.delivery_order_assignments_v1(
      order_id,branch_id,delivery_user_id,assigned_by,tracking_number,metadata
    ) values(
      p_order_id,
      v_order.branch_id,
      v_driver_id,
      p_actor_id,
      v_order.tracking_number,
      jsonb_build_object(
        'assignment_source',v_source,
        'order_status_at_assignment',v_order.status::text,
        'early_dispatch',true,
        'recommendation',coalesce(v_rec,'{}'::jsonb)
      )
    ) returning id into v_assignment_id;
  exception when unique_violation then
    return jsonb_build_object('ok',true,'idempotent',true,'reason','already_assigned_concurrently');
  end;

  update public.online_orders
  set delivery_person=v_driver_name,
      updated_at=now()
  where id=p_order_id;

  return jsonb_build_object(
    'ok',true,
    'idempotent',false,
    'assignment_id',v_assignment_id,
    'delivery_user_id',v_driver_id,
    'delivery_name',v_driver_name,
    'recommendation',v_rec
  );
end;
$function$;

create or replace function public.claim_order_fulfillment_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_state private.order_fulfillment_state_v1%rowtype;
  v_task public.operations_tasks%rowtype;
  v_dispatch jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  perform private.sync_order_fulfillment_v1(p_order_id);
  select * into v_state from private.order_fulfillment_state_v1 where order_id=p_order_id for update;
  if v_state.order_id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  if not private.fulfillment_actor_allowed_v1(v_uid,v_state.branch_id) then raise exception using errcode='42501',message='FULFILLMENT_PERMISSION_DENIED'; end if;
  if v_state.fulfillment_state not in ('queued','picking','packing') then raise exception using errcode='55000',message='FULFILLMENT_NOT_CLAIMABLE'; end if;
  select * into v_task from public.operations_tasks where id=v_state.pick_task_id for update;
  if v_task.id is null then raise exception using errcode='22023',message='FULFILLMENT_TASK_NOT_FOUND'; end if;
  if v_task.claimed_by is not null and v_task.claimed_by<>v_uid and v_task.status in ('claimed','in_progress') then raise exception using errcode='55000',message='FULFILLMENT_ALREADY_CLAIMED'; end if;

  update public.operations_tasks
  set status=case when status='in_progress' then 'in_progress' else 'claimed' end,
      claimed_by=v_uid,
      claimed_at=coalesce(claimed_at,now()),
      failure_reason=null,
      updated_at=now()
  where id=v_task.id
  returning * into v_task;

  update private.order_fulfillment_state_v1
  set picker_user_id=v_uid,updated_at=now()
  where order_id=p_order_id
  returning * into v_state;

  insert into public.operations_task_events(task_id,event_type,actor_id,note)
  values(v_task.id,'claimed',v_uid,'تم استلام مهمة تجهيز الطلب');

  begin
    v_dispatch:=private.auto_assign_claimed_delivery_order_v1(p_order_id,v_uid,'picker_claim_v1');
  exception when others then
    v_dispatch:=jsonb_build_object('ok',false,'reason','early_dispatch_failed');
  end;

  return jsonb_build_object(
    'ok',true,
    'order_id',p_order_id,
    'picker_user_id',v_uid,
    'task_id',v_task.id,
    'state',v_state.fulfillment_state,
    'delivery_dispatch',coalesce(v_dispatch,'{}'::jsonb)
  );
end;
$function$;

create or replace function public.record_my_delivery_location_v1(
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric default null::numeric,
  p_heading numeric default null::numeric,
  p_speed_mps numeric default null::numeric
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_branch_id uuid;
  v_availability text;
  v_order_id uuid;
  v_dispatch jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select role into v_role from public.users where id=v_uid and coalesce(active,true);
  if v_role <> 'delivery' then raise exception 'delivery_access_required'; end if;
  if p_latitude is null or p_latitude < -90 or p_latitude > 90
     or p_longitude is null or p_longitude < -180 or p_longitude > 180 then
    raise exception 'invalid_location';
  end if;
  if p_accuracy_m is not null and (p_accuracy_m < 0 or p_accuracy_m > 5000) then raise exception 'invalid_accuracy'; end if;

  update private.delivery_driver_status_v1
  set last_latitude=p_latitude,last_longitude=p_longitude,last_accuracy_m=p_accuracy_m,
      last_heading=p_heading,last_speed_mps=p_speed_mps,last_location_at=now(),updated_at=now()
  where user_id=v_uid
  returning branch_id,availability into v_branch_id,v_availability;
  if not found then raise exception 'availability_required'; end if;

  if v_branch_id is not null and v_availability='available' then
    select o.id into v_order_id
    from public.online_orders o
    join private.order_fulfillment_state_v1 f on f.order_id=o.id
    where o.branch_id=v_branch_id
      and o.status::text in ('confirmed','preparing','ready')
      and f.picker_user_id is not null
      and not exists(
        select 1 from private.delivery_order_assignments_v1 a
        where a.order_id=o.id and a.unassigned_at is null
      )
      and exists(
        select 1 from private.delivery_candidate_scores_v1(o.id) c
        where c.driver_id=v_uid
      )
    order by
      case o.status::text when 'ready' then 0 when 'preparing' then 1 else 2 end,
      coalesce(f.predicted_ready_at,o.created_at),
      o.created_at
    limit 1;

    if v_order_id is not null then
      begin
        v_dispatch:=private.auto_assign_claimed_delivery_order_v1(v_order_id,v_uid,'driver_location_retry_v1');
      exception when others then
        v_dispatch:=jsonb_build_object('ok',false,'reason','auto_dispatch_retry_failed');
      end;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'recorded_at',now(),
    'auto_dispatch',coalesce(v_dispatch,'{}'::jsonb)
  );
end;
$function$;
