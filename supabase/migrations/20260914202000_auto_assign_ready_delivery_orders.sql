create or replace function private.auto_assign_ready_delivery_order_v1(
  p_order_id uuid,
  p_actor_id uuid
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
begin
  select * into v_order
  from public.online_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    return jsonb_build_object('ok',false,'reason','order_not_found');
  end if;

  if v_order.status::text <> 'ready' or v_order.branch_id is null then
    return jsonb_build_object('ok',false,'reason','order_not_ready');
  end if;

  if exists(
    select 1
    from private.delivery_order_assignments_v1 a
    where a.order_id = p_order_id
      and a.unassigned_at is null
  ) then
    return jsonb_build_object('ok',true,'idempotent',true,'reason','already_assigned');
  end if;

  if p_actor_id is null or not exists(select 1 from public.users u where u.id=p_actor_id) then
    insert into public.delivery_realtime_signals_v1(branch_id,recipient_user_id,event_type,entity_id)
    values(v_order.branch_id,null,'dispatch_needed',p_order_id);
    return jsonb_build_object('ok',false,'reason','assignment_actor_unavailable');
  end if;

  v_rec := private.order_dispatch_recommendation_v1(p_order_id);
  v_driver_id := nullif(v_rec#>>'{recommended_driver,id}','')::uuid;

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
        'assignment_source','auto_dispatch_ready_v1',
        'order_status_at_assignment',v_order.status::text,
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

create or replace function private.auto_dispatch_ready_order_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.status::text='ready' and old.status::text is distinct from 'ready' then
    begin
      perform private.auto_assign_ready_delivery_order_v1(new.id,auth.uid());
    exception when others then
      insert into public.delivery_realtime_signals_v1(branch_id,recipient_user_id,event_type,entity_id)
      values(new.branch_id,null,'dispatch_needed',new.id);
    end;
  end if;
  return new;
end;
$function$;

drop trigger if exists auto_dispatch_ready_order_v1 on public.online_orders;
create trigger auto_dispatch_ready_order_v1
after update of status on public.online_orders
for each row
when (new.status::text='ready' and old.status::text is distinct from 'ready')
execute function private.auto_dispatch_ready_order_trigger_v1();
