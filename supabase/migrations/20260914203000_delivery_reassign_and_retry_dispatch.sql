create or replace function private.delivery_candidate_scores_v1(p_order_id uuid)
returns table(
  driver_id uuid,
  driver_name text,
  availability text,
  active_orders integer,
  distance_km numeric,
  travel_minutes integer,
  score numeric,
  last_location_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
with ctx as (
  select o.branch_id, b.latitude branch_lat, b.longitude branch_lng
  from public.online_orders o
  join public.branches b on b.id = o.branch_id
  where o.id = p_order_id
), raw as (
  select
    u.id driver_id,
    u.name driver_name,
    coalesce(ds.availability,'offline') availability,
    coalesce((
      select count(*)
      from private.delivery_order_assignments_v1 a
      where a.delivery_user_id = u.id
        and a.unassigned_at is null
        and a.delivery_state not in ('delivered','failed','return_to_branch')
    ),0)::integer active_orders,
    ds.last_location_at,
    case
      when ds.last_latitude is not null
       and ds.last_longitude is not null
       and c.branch_lat is not null
       and c.branch_lng is not null
      then (
        6371 * 2 * asin(sqrt(
          power(sin(radians(ds.last_latitude-c.branch_lat)/2),2)
          + cos(radians(c.branch_lat))*cos(radians(ds.last_latitude))
          * power(sin(radians(ds.last_longitude-c.branch_lng)/2),2)
        ))
      )::numeric
      else null::numeric
    end distance_km
  from ctx c
  join public.users u
    on u.role = 'delivery'
   and coalesce(u.active,true)
  left join private.delivery_driver_status_v1 ds
    on ds.user_id = u.id
  where coalesce(ds.availability,'offline') in ('available','busy')
    and (
      exists(
        select 1
        from public.user_branch_roles ubr
        where ubr.user_id = u.id
          and ubr.branch_id = c.branch_id
          and ubr.active
      )
      or exists(
        select 1
        from private.hr_employee_profiles ep
        where ep.user_id = u.id
          and ep.primary_branch_id = c.branch_id
          and coalesce(ep.employment_status,'active') <> 'terminated'
      )
    )
    and not exists(
      select 1
      from private.delivery_order_events_v1 ev
      where ev.order_id=p_order_id
        and ev.driver_user_id=u.id
        and ev.event_type='decline'
    )
), ranked as (
  select
    r.*,
    greatest(1, ceil(r.distance_km/22*60)::integer) travel_minutes,
    round((
      100
      + case when r.availability='available' then 25 else -10 end
      - r.active_orders*25
      - r.distance_km*6
    )::numeric,2) score
  from raw r
  where r.distance_km is not null
    and r.distance_km <= 30
    and r.last_location_at is not null
    and r.last_location_at >= now() - interval '10 minutes'
)
select
  driver_id,
  driver_name,
  availability,
  active_orders,
  distance_km,
  travel_minutes,
  score,
  last_location_at
from ranked
order by score desc, travel_minutes asc, driver_name;
$function$;

create or replace function public.decline_my_delivery_order_v1(p_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_assignment private.delivery_order_assignments_v1%rowtype;
  v_order public.online_orders%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
  v_redispatch jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  if not exists (
    select 1 from public.users u
    where u.id = v_uid and u.role = 'delivery' and coalesce(u.active, true)
  ) then raise exception 'delivery_access_required'; end if;

  if length(v_reason) < 5 then raise exception 'decline_reason_required'; end if;

  select * into v_assignment
  from private.delivery_order_assignments_v1
  where order_id = p_order_id
    and delivery_user_id = v_uid
    and unassigned_at is null
  order by assigned_at desc
  limit 1
  for update;

  if v_assignment.id is null then raise exception 'delivery_assignment_not_found'; end if;
  if v_assignment.delivery_state <> 'assigned' then raise exception 'assignment_already_started'; end if;

  select * into v_order
  from public.online_orders
  where id = p_order_id
  for update;

  if v_order.id is null then raise exception 'order_not_found'; end if;

  if v_order.delivery_person is not null then
    update public.online_orders
    set delivery_person = null,
        updated_at = now()
    where id = p_order_id;
  end if;

  update private.delivery_order_assignments_v1
  set delivery_state = 'failed',
      failed_at = now(),
      failure_reason = v_reason,
      unassigned_at = now(),
      unassigned_by = v_uid,
      unassign_reason = v_reason,
      updated_at = now()
  where id = v_assignment.id;

  update private.delivery_driver_status_v1
  set availability = 'available',
      updated_at = now()
  where user_id = v_uid;

  insert into private.delivery_order_events_v1(
    order_id, assignment_id, driver_user_id, event_type, from_state, to_state, note, metadata
  ) values (
    p_order_id, v_assignment.id, v_uid, 'decline', 'assigned', 'failed', v_reason,
    jsonb_build_object('assignment_released', true)
  );

  if v_order.status::text='ready' then
    begin
      v_redispatch := private.auto_assign_ready_delivery_order_v1(p_order_id,v_uid);
    exception when others then
      v_redispatch := jsonb_build_object('ok',false,'reason','redispatch_failed');
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'assignment_id', v_assignment.id,
    'released', true,
    'reason', v_reason,
    'redispatch', coalesce(v_redispatch,'{}'::jsonb)
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
  v_ready_order_id uuid;
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
    select o.id into v_ready_order_id
    from public.online_orders o
    where o.branch_id=v_branch_id
      and o.status::text='ready'
      and not exists(
        select 1 from private.delivery_order_assignments_v1 a
        where a.order_id=o.id and a.unassigned_at is null
      )
      and exists(
        select 1 from private.delivery_candidate_scores_v1(o.id) c
        where c.driver_id=v_uid
      )
    order by o.created_at asc
    limit 1;

    if v_ready_order_id is not null then
      begin
        v_dispatch := private.auto_assign_ready_delivery_order_v1(v_ready_order_id,v_uid);
      exception when others then
        v_dispatch := jsonb_build_object('ok',false,'reason','auto_dispatch_retry_failed');
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
