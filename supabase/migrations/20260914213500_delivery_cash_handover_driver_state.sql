create or replace function public.get_my_delivery_cash_handover_state_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_pending jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists(
    select 1 from public.users u
    where u.id=v_uid and u.role='delivery' and coalesce(u.active,true)
  ) then
    raise exception 'delivery_access_required';
  end if;

  select jsonb_build_object(
    'id',h.id,
    'amount',h.amount,
    'status',h.status,
    'requested_at',h.requested_at,
    'target_shift_id',h.target_shift_id,
    'target_device_id',h.target_device_id,
    'target_device_name',d.name,
    'target_drawer_account_id',h.target_drawer_account_id,
    'target_drawer_account_name',ca.name,
    'target_cashier_user_id',h.target_cashier_user_id,
    'target_cashier_name',cu.name,
    'target_cashier_username',cu.username,
    'target_selected_at',h.target_selected_at,
    'target_shift_open',coalesce(s.status='open',false),
    'target_pos_online',coalesce(d.last_seen_at,'epoch'::timestamptz)>now()-interval '10 minutes',
    'received_amount',h.received_amount,
    'variance_amount',h.variance_amount
  ) into v_pending
  from private.delivery_cash_handovers_v1 h
  left join public.pos_shifts s on s.id=h.target_shift_id
  left join public.pos_devices d on d.id=h.target_device_id
  left join public.cash_accounts ca on ca.id=h.target_drawer_account_id
  left join public.users cu on cu.id=h.target_cashier_user_id
  where h.driver_user_id=v_uid and h.status='pending'
  order by h.requested_at desc
  limit 1;

  return jsonb_build_object(
    'pending',v_pending,
    'has_pending',v_pending is not null,
    'generated_at',now()
  );
end;
$function$;

revoke all on function public.get_my_delivery_cash_handover_state_v1() from public;
revoke all on function public.get_my_delivery_cash_handover_state_v1() from anon;
grant execute on function public.get_my_delivery_cash_handover_state_v1() to authenticated;

revoke all on function public.get_my_delivery_cash_handover_targets_v1() from public;
revoke all on function public.get_my_delivery_cash_handover_targets_v1() from anon;
grant execute on function public.get_my_delivery_cash_handover_targets_v1() to authenticated;

revoke all on function public.request_my_delivery_cash_handover_v2(uuid) from public;
revoke all on function public.request_my_delivery_cash_handover_v2(uuid) from anon;
grant execute on function public.request_my_delivery_cash_handover_v2(uuid) to authenticated;

revoke all on function public.assign_my_delivery_cash_handover_target_v1(uuid,uuid) from public;
revoke all on function public.assign_my_delivery_cash_handover_target_v1(uuid,uuid) from anon;
grant execute on function public.assign_my_delivery_cash_handover_target_v1(uuid,uuid) to authenticated;
