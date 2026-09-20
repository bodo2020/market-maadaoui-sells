-- Online fulfillment simplification + parallel delivery dispatch V2.
-- Keeps the old staging tables for history/backward compatibility, but removes
-- staging/bag creation as a mandatory operational stage for new orders.

-- Existing orders that were left in the legacy packing stage are returned to
-- the unified picking/preparing stage so the new UI can finish them normally.
update private.order_fulfillment_state_v1 f
set fulfillment_state = 'picking',
    packing_started_at = null,
    metadata = coalesce(f.metadata, '{}'::jsonb)
      || jsonb_build_object('legacy_staging_deprecated_at', now()),
    updated_at = now()
from public.online_orders o
where o.id = f.order_id
  and f.fulfillment_state = 'packing'
  and o.status::text = 'preparing';

create or replace function public.mark_order_ready_v1(
  p_order_id uuid,
  p_bags_count integer default 0,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_state private.order_fulfillment_state_v1%rowtype;
  v_order public.online_orders%rowtype;
  v_is_manager boolean := false;
  v_resolved integer := 0;
  v_optional_bags integer := greatest(0, coalesce(p_bags_count, 0));
  v_dispatch jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;

  select * into v_state
  from private.order_fulfillment_state_v1
  where order_id = p_order_id
  for update;

  select * into v_order
  from public.online_orders
  where id = p_order_id
  for update;

  if v_state.order_id is null or v_order.id is null then
    raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND';
  end if;

  v_is_manager :=
    private.staff_is_super_admin(v_uid)
    or public.staff_has_permission('online_orders.manage', v_state.branch_id);

  if not private.fulfillment_actor_allowed_v1(v_uid, v_state.branch_id) then
    raise exception using errcode='42501',message='FULFILLMENT_PERMISSION_DENIED';
  end if;

  if v_state.picker_user_id is distinct from v_uid and not v_is_manager then
    raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER';
  end if;

  if v_state.fulfillment_state = 'ready' and v_order.status::text = 'ready' then
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', p_order_id,
      'state', 'ready',
      'ready_at', v_state.ready_at,
      'bags_count', v_state.bags_count,
      'staging_required', false
    );
  end if;

  if v_order.status::text <> 'preparing'
     or v_state.fulfillment_state not in ('picking','packing') then
    raise exception using errcode='55000',message='ORDER_NOT_IN_PREPARING';
  end if;

  v_resolved :=
    coalesce(v_state.items_picked, 0)
    + coalesce(v_state.shortage_count, 0)
    + coalesce(v_state.substitution_count, 0);

  if coalesce(v_state.items_total, 0) > 0
     and v_resolved < v_state.items_total then
    raise exception using errcode='55000',message='FULFILLMENT_ITEMS_INCOMPLETE';
  end if;

  if v_is_manager then
    perform private.process_online_order(
      p_order_id,
      'status',
      'preparing',
      'ready',
      null,
      null
    );
  else
    update public.online_orders
    set status = 'ready'::public.order_status,
        updated_at = now()
    where id = p_order_id;
  end if;

  update private.order_fulfillment_state_v1
  set fulfillment_state = 'ready',
      items_picked = greatest(
        items_picked,
        items_total - shortage_count - substitution_count
      ),
      picking_completed_at = coalesce(picking_completed_at, now()),
      packing_started_at = null,
      bags_count = v_optional_bags,
      ready_at = coalesce(ready_at, now()),
      predicted_ready_at = now(),
      issue_note = coalesce(
        nullif(trim(coalesce(p_note,'')), ''),
        issue_note
      ),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'staging_required', false,
          'optional_bags_count', v_optional_bags,
          'fulfillment_flow_version', 'parallel-dispatch-v2'
        ),
      updated_at = now()
  where order_id = p_order_id
  returning * into v_state;

  update public.operations_tasks
  set status = 'completed',
      completed_by = v_uid,
      completed_at = coalesce(completed_at, now()),
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'ready_at', now(),
          'staging_required', false,
          'bags_count_optional', v_optional_bags
        )
  where id = v_state.pick_task_id
    and status <> 'completed';

  if v_state.pick_task_id is not null then
    insert into public.operations_task_events(
      task_id,event_type,actor_id,note
    ) values (
      v_state.pick_task_id,
      'ready',
      v_uid,
      coalesce(
        nullif(trim(coalesce(p_note,'')), ''),
        'تم إنهاء التجهيز والطلب جاهز للمندوب'
      )
    );
  end if;

  perform private.recalculate_order_eta_v1(p_order_id, 'order_ready_v2');

  insert into public.order_operations_realtime_signals_v1(
    branch_id, order_id, event_type
  ) values (
    v_state.branch_id, p_order_id, 'order_ready'
  );

  -- Ready is only a fallback. Normally the driver should already have been
  -- assigned when the employee accepted/claimed the order.
  if not exists(
    select 1
    from private.delivery_order_assignments_v1 a
    where a.order_id = p_order_id
      and a.unassigned_at is null
  ) then
    begin
      v_dispatch := private.auto_assign_claimed_delivery_order_v1(
        p_order_id,
        v_uid,
        'ready_fallback_parallel_dispatch_v2'
      );
    exception when others then
      v_dispatch := jsonb_build_object(
        'ok', false,
        'reason', 'ready_fallback_dispatch_failed'
      );
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'order_id', p_order_id,
    'state', 'ready',
    'ready_at', v_state.ready_at,
    'bags_count', v_state.bags_count,
    'staging_required', false,
    'delivery_dispatch', coalesce(v_dispatch, '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.mark_order_ready_v1(uuid,integer,text)
  from public,anon;
grant execute on function public.mark_order_ready_v1(uuid,integer,text)
  to authenticated;

-- Compatibility shim for older staff APKs. "Start packing" now finishes
-- fulfillment directly; there is no separate packing/staging stage.
create or replace function public.start_order_packing_v1(
  p_order_id uuid,
  p_bags_count integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  return public.mark_order_ready_v1(
    p_order_id,
    greatest(0, coalesce(p_bags_count, 0)),
    'تم إنهاء التجهيز عبر مسار التوافق القديم'
  );
end;
$function$;

revoke all on function public.start_order_packing_v1(uuid,integer)
  from public,anon;
grant execute on function public.start_order_packing_v1(uuid,integer)
  to authenticated;

-- Legacy staging finalize remains callable by old clients, but no longer blocks
-- readiness on bag/location records.
create or replace function public.finalize_order_staging_v1(
  p_order_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_total integer := 0;
begin
  select count(*) filter(where status <> 'cancelled')::integer
  into v_total
  from private.order_fulfillment_bags_v1
  where order_id = p_order_id;

  return public.mark_order_ready_v1(
    p_order_id,
    greatest(0, coalesce(v_total, 0)),
    coalesce(
      nullif(trim(coalesce(p_note,'')), ''),
      'تم إنهاء التجهيز عبر مسار التسكين القديم'
    )
  );
end;
$function$;

revoke all on function public.finalize_order_staging_v1(uuid,text)
  from public,anon;
grant execute on function public.finalize_order_staging_v1(uuid,text)
  to authenticated;

-- POS order intake is now the primary parallel-dispatch entry point.
create or replace function public.accept_pos_online_order_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_order public.online_orders%rowtype;
  v_was_confirmed boolean := false;
  v_dispatch jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;

  select * into v_order
  from public.online_orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception using errcode='22023',message='ORDER_NOT_FOUND';
  end if;

  if v_order.branch_id is null then
    raise exception using errcode='22023',message='ORDER_BRANCH_REQUIRED';
  end if;

  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('online_orders.intake',v_order.branch_id)
     and not public.staff_has_permission('online_orders.manage',v_order.branch_id) then
    raise exception using errcode='42501',message='ORDER_INTAKE_PERMISSION_DENIED';
  end if;

  if v_order.status::text = 'pending' then
    update public.online_orders
    set status = 'confirmed'::public.order_status,
        updated_at = now()
    where id = v_order.id
    returning * into v_order;
  elsif v_order.status::text in ('confirmed','preparing','ready') then
    v_was_confirmed := true;
  else
    raise exception using errcode='40001',message='ORDER_STATUS_CHANGED';
  end if;

  perform private.sync_order_fulfillment_v1(p_order_id);

  -- Start driver assignment immediately in parallel with preparation.
  -- The function is idempotent if another path already assigned a driver.
  begin
    v_dispatch := private.auto_assign_claimed_delivery_order_v1(
      p_order_id,
      v_uid,
      'pos_accept_parallel_dispatch_v2'
    );
  exception when others then
    v_dispatch := jsonb_build_object(
      'ok', false,
      'reason', 'parallel_dispatch_failed'
    );
  end;

  insert into public.order_operations_realtime_signals_v1(
    branch_id, order_id, event_type
  ) values (
    v_order.branch_id,
    p_order_id,
    'parallel_dispatch_started'
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', v_was_confirmed,
    'order_id', v_order.id,
    'status', v_order.status::text,
    'confirmed_at', v_order.updated_at,
    'delivery_dispatch', coalesce(v_dispatch, '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.accept_pos_online_order_v1(uuid)
  from public,anon;
grant execute on function public.accept_pos_online_order_v1(uuid)
  to authenticated;

-- Enrich manual assignment workspace so POS can show useful operational cards
-- instead of a plain dropdown.
create or replace function public.get_delivery_assignment_workspace_v1(
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_order public.online_orders%rowtype;
  v_branch public.branches%rowtype;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  select * into v_order
  from public.online_orders
  where id = p_order_id;

  if v_order.id is null then
    raise exception 'order_not_found';
  end if;

  if v_order.branch_id is null then
    raise exception 'order_branch_required';
  end if;

  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('delivery.manage',v_order.branch_id)
     and not public.staff_has_permission('online_orders.manage',v_order.branch_id) then
    raise exception 'permission_denied';
  end if;

  select * into v_branch
  from public.branches
  where id = v_order.branch_id;

  select jsonb_build_object(
    'order_id', v_order.id,
    'branch_id', v_order.branch_id,
    'order_status', v_order.status::text,
    'tracking_number', coalesce((
      select a.tracking_number
      from private.delivery_order_assignments_v1 a
      where a.order_id = v_order.id
        and a.unassigned_at is null
      order by a.assigned_at desc
      limit 1
    ), v_order.tracking_number),
    'legacy_delivery_person', v_order.delivery_person,
    'current', (
      select jsonb_build_object(
        'assignment_id', a.id,
        'delivery_user_id', a.delivery_user_id,
        'name', u.name,
        'assigned_at', a.assigned_at,
        'tracking_number', a.tracking_number,
        'delivery_state', a.delivery_state
      )
      from private.delivery_order_assignments_v1 a
      join public.users u on u.id = a.delivery_user_id
      where a.order_id = v_order.id
        and a.unassigned_at is null
      order by a.assigned_at desc
      limit 1
    ),
    'candidates', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'role', c.role,
          'availability', c.availability,
          'active_orders', c.active_orders,
          'distance_km',
            case when c.distance_km is null then null
                 else round(c.distance_km::numeric, 2) end,
          'travel_minutes',
            case when c.distance_km is null then null
                 else greatest(1, ceil(c.distance_km / 22 * 60)::integer) end,
          'last_location_at', c.last_location_at,
          'dispatch_ready',
            (
              c.availability in ('available','busy')
              and c.last_location_at is not null
              and c.last_location_at >= now() - interval '10 minutes'
              and c.distance_km is not null
              and c.distance_km <= 30
            ),
          'status_reason',
            case
              when c.availability = 'offline' then 'offline'
              when c.last_location_at is null then 'location_missing'
              when c.last_location_at < now() - interval '10 minutes' then 'location_stale'
              when c.distance_km is null then 'distance_unknown'
              when c.distance_km > 30 then 'outside_dispatch_radius'
              when c.availability = 'busy' then 'busy'
              else 'available'
            end
        )
        order by
          case
            when c.availability = 'available'
             and c.last_location_at >= now() - interval '10 minutes'
             and c.distance_km is not null
             and c.distance_km <= 30 then 0
            when c.availability = 'busy' then 1
            else 2
          end,
          c.active_orders asc,
          c.distance_km nulls last,
          c.name
      )
      from (
        select
          u.id,
          u.name,
          u.role,
          coalesce(ds.availability, 'offline') as availability,
          coalesce((
            select count(*)
            from private.delivery_order_assignments_v1 a2
            where a2.delivery_user_id = u.id
              and a2.unassigned_at is null
              and a2.delivery_state not in ('delivered','failed','return_to_branch')
          ), 0)::integer as active_orders,
          ds.last_location_at,
          case
            when ds.last_latitude is not null
             and ds.last_longitude is not null
             and v_branch.latitude is not null
             and v_branch.longitude is not null
            then (
              6371 * 2 * asin(sqrt(
                power(sin(radians(ds.last_latitude-v_branch.latitude)/2),2)
                + cos(radians(v_branch.latitude))*cos(radians(ds.last_latitude))
                * power(sin(radians(ds.last_longitude-v_branch.longitude)/2),2)
              ))
            )
            else null
          end as distance_km
        from public.users u
        left join private.delivery_driver_status_v1 ds
          on ds.user_id = u.id
        where coalesce(u.active,true)
          and u.role = 'delivery'
          and (
            exists(
              select 1
              from public.user_branch_roles ubr
              where ubr.user_id = u.id
                and ubr.branch_id = v_order.branch_id
                and ubr.active
            )
            or exists(
              select 1
              from private.hr_employee_profiles ep
              where ep.user_id = u.id
                and ep.primary_branch_id = v_order.branch_id
                and coalesce(ep.employment_status,'active') <> 'terminated'
            )
          )
      ) c
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_delivery_assignment_workspace_v1(uuid)
  from public,anon;
grant execute on function public.get_delivery_assignment_workspace_v1(uuid)
  to authenticated,service_role;

-- Operations snapshot no longer exposes staging as an active stage.
create or replace function public.get_my_order_operations_snapshot_v1(
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_order public.online_orders%rowtype;
  v_f private.order_fulfillment_state_v1%rowtype;
  v_eta private.order_eta_current_v1%rowtype;
  v_a private.delivery_order_assignments_v1%rowtype;
  v_s private.order_picker_assignment_shadow_v1%rowtype;
  v_picker text;
  v_driver text;
  v_shadow_name text;
  v_rec jsonb;
begin
  if v_uid is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;

  select * into v_order
  from public.online_orders
  where id = p_order_id;

  if v_order.id is null then
    raise exception using errcode='22023',message='ORDER_NOT_FOUND';
  end if;

  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('online_orders.view',v_order.branch_id)
     and not public.staff_has_permission('online_orders.manage',v_order.branch_id) then
    raise exception using errcode='42501',message='ORDER_VIEW_DENIED';
  end if;

  select * into v_f
  from private.order_fulfillment_state_v1
  where order_id = p_order_id;

  select * into v_eta
  from private.order_eta_current_v1
  where order_id = p_order_id;

  select * into v_a
  from private.delivery_order_assignments_v1
  where order_id = p_order_id
    and unassigned_at is null
  order by assigned_at desc
  limit 1;

  select * into v_s
  from private.order_picker_assignment_shadow_v1
  where order_id = p_order_id;

  select name into v_picker
  from public.users
  where id = v_f.picker_user_id;

  select name into v_driver
  from public.users
  where id = v_a.delivery_user_id;

  select name into v_shadow_name
  from public.users
  where id = v_s.recommended_user_id;

  if v_a.id is null then
    v_rec := private.order_dispatch_recommendation_v1(p_order_id);
  end if;

  return jsonb_build_object(
    'order_id', p_order_id,
    'order_status', v_order.status::text,
    'fulfillment',
      case when v_f.order_id is null then null
           else to_jsonb(v_f) || jsonb_build_object('picker_name',v_picker) end,
    'picker_shadow',
      case when v_s.order_id is null then null
           else jsonb_build_object(
             'recommended_user_id',v_s.recommended_user_id,
             'recommended_name',v_shadow_name,
             'score',v_s.recommended_score,
             'reason',v_s.reason,
             'generated_at',v_s.generated_at,
             'outcome',v_s.outcome
           ) end,
    'eta',
      case when v_eta.order_id is null then null
           else to_jsonb(v_eta)-'branch_id' end,
    'delivery_assignment',
      case when v_a.id is null then null
           else jsonb_build_object(
             'id',v_a.id,
             'driver_id',v_a.delivery_user_id,
             'driver_name',v_driver,
             'state',v_a.delivery_state,
             'assigned_at',v_a.assigned_at,
             'accepted_at',v_a.accepted_at,
             'arrived_branch_at',v_a.arrived_branch_at,
             'handover_at',v_a.handover_at,
             'rider_wait_seconds',v_a.rider_wait_seconds,
             'picked_up_at',v_a.picked_up_at
           ) end,
    'dispatch_recommendation', v_rec,
    'dispatch_state',
      case
        when v_a.id is not null then jsonb_build_object(
          'state','assigned',
          'driver_id',v_a.delivery_user_id,
          'driver_name',v_driver
        )
        when v_rec is null then jsonb_build_object(
          'state','not_required'
        )
        when v_rec#>>'{recommended_driver,id}' is null then jsonb_build_object(
          'state','manual_intervention',
          'reason',coalesce(v_rec->>'reason','no_available_driver')
        )
        else jsonb_build_object(
          'state','searching',
          'recommended_driver',v_rec->'recommended_driver',
          'dispatch_now',coalesce((v_rec->>'dispatch_now')::boolean,false)
        )
      end
  );
end;
$function$;

revoke all on function public.get_my_order_operations_snapshot_v1(uuid)
  from public,anon;
grant execute on function public.get_my_order_operations_snapshot_v1(uuid)
  to authenticated;

comment on function public.accept_pos_online_order_v1(uuid)
  is 'Confirms POS online intake and starts delivery assignment in parallel with fulfillment.';
comment on function public.mark_order_ready_v1(uuid,integer,text)
  is 'Marks preparation complete without requiring bag staging. Bag count is optional metadata only.';
