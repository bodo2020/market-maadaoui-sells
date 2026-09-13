create or replace function public.decline_my_delivery_order_v1(
  p_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_assignment private.delivery_order_assignments_v1%rowtype;
  v_order public.online_orders%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
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

  return jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'assignment_id', v_assignment.id,
    'released', true,
    'reason', v_reason
  );
end;
$function$;

revoke all on function public.decline_my_delivery_order_v1(uuid, text) from public, anon;
grant execute on function public.decline_my_delivery_order_v1(uuid, text) to authenticated, service_role;
