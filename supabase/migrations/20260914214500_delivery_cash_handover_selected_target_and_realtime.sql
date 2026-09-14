create or replace function public.request_my_delivery_cash_handover_v2(p_target_shift_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_branch_id uuid;
  v_balance numeric(12,2);
  v_handover private.delivery_cash_handovers_v1%rowtype;
  v_target jsonb;
begin
  if p_target_shift_id is null then
    return public.request_my_delivery_cash_handover_v1();
  end if;

  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists(
    select 1 from public.users u
    where u.id=v_uid and u.role='delivery' and coalesce(u.active,true)
  ) then
    raise exception 'delivery_access_required';
  end if;

  select coalesce(sum(amount),0)
    into v_balance
  from private.delivery_cash_ledger_v1
  where driver_user_id=v_uid;

  if v_balance<=0 then raise exception 'no_cash_to_handover'; end if;
  if exists(
    select 1 from private.delivery_cash_handovers_v1
    where driver_user_id=v_uid and status='pending'
  ) then
    raise exception 'cash_handover_already_pending';
  end if;

  select coalesce(
    (select ubr.branch_id from public.user_branch_roles ubr
      where ubr.user_id=v_uid and ubr.active
      order by ubr.is_primary desc,ubr.updated_at desc limit 1),
    (select ep.primary_branch_id from private.hr_employee_profiles ep
      where ep.user_id=v_uid and coalesce(ep.employment_status,'active')<>'terminated' limit 1)
  ) into v_branch_id;
  if v_branch_id is null then raise exception 'delivery_branch_required'; end if;

  insert into private.delivery_cash_handovers_v1(driver_user_id,branch_id,amount)
  values(v_uid,v_branch_id,v_balance)
  returning * into v_handover;

  v_target:=public.assign_my_delivery_cash_handover_target_v1(v_handover.id,p_target_shift_id);

  return jsonb_build_object(
    'ok',true,
    'handover_id',v_handover.id,
    'amount',v_handover.amount,
    'status',v_handover.status,
    'target',v_target
  );
end;
$function$;

create or replace function public.receive_delivery_cash_handover_v2(
  p_handover_id uuid,
  p_received_amount numeric,
  p_note text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_h private.delivery_cash_handovers_v1%rowtype;
  v_shift public.pos_shifts%rowtype;
  v_device public.pos_devices%rowtype;
  v_amount numeric(12,2);
  v_variance numeric(12,2);
  v_transfer uuid;
  v_note text:=nullif(trim(coalesce(p_note,'')),'');
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_h from private.delivery_cash_handovers_v1 where id=p_handover_id for update;
  if v_h.id is null then raise exception 'handover_not_found'; end if;
  if v_h.status<>'pending' then
    return jsonb_build_object('ok',true,'idempotent',true,'status',v_h.status,'amount',v_h.received_amount);
  end if;
  if v_h.target_cashier_user_id is null or v_h.target_shift_id is null or v_h.target_drawer_account_id is null then
    raise exception 'handover_target_required';
  end if;
  if v_h.target_cashier_user_id<>v_uid then raise exception 'handover_target_cashier_required'; end if;

  select * into v_shift from public.pos_shifts where id=v_h.target_shift_id for update;
  if v_shift.id is null or v_shift.status<>'open' or v_shift.user_id<>v_uid then raise exception 'target_shift_not_open'; end if;
  select * into v_device from public.pos_devices where id=v_h.target_device_id and active and revoked_at is null;
  if v_device.id is null then raise exception 'target_pos_unavailable'; end if;

  if p_received_amount is null or p_received_amount<=0 or p_received_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'invalid_received_amount'; end if;
  v_amount:=round(p_received_amount,2);
  if v_amount>round(v_h.amount,2) then raise exception 'received_amount_exceeds_handover'; end if;
  v_variance:=v_amount-round(v_h.amount,2);
  if v_variance<>0 and char_length(coalesce(v_note,''))<5 then raise exception 'handover_variance_reason_required'; end if;

  insert into public.cash_transfers(
    branch_id,amount,from_register,to_register,notes,created_by,from_account_id,to_account_id,status,shift_id
  ) values(
    v_h.branch_id,v_amount,'delivery','store',coalesce(v_note,'توريد نقدية من مندوب التوصيل'),v_uid,
    null,v_h.target_drawer_account_id,'completed',v_shift.id
  ) returning id into v_transfer;

  insert into public.cash_ledger(
    account_id,branch_id,shift_id,device_id,user_id,entry_type,signed_amount,
    reference_type,reference_id,transfer_id,description,metadata,created_by
  ) values(
    v_h.target_drawer_account_id,v_h.branch_id,v_shift.id,v_device.id,v_uid,'transfer_in',v_amount,
    'delivery_cash_handover',v_h.id,v_transfer,
    'توريد نقدية من مندوب التوصيل',
    jsonb_build_object('driver_user_id',v_h.driver_user_id,'handover_id',v_h.id,'requested_amount',v_h.amount,'variance',v_variance),
    v_uid
  );

  insert into private.delivery_cash_ledger_v1(
    driver_user_id,branch_id,entry_type,amount,payment_method,reference,note,created_by
  ) values(
    v_h.driver_user_id,v_h.branch_id,'handover',-v_amount,'cash',v_h.id::text,
    'توريد نقدية إلى '||v_device.name,v_uid
  );

  update private.delivery_cash_handovers_v1
     set status='confirmed',reviewed_at=now(),reviewed_by=v_uid,review_note=v_note,
         received_amount=v_amount,variance_amount=v_variance,cash_transfer_id=v_transfer
   where id=v_h.id;

  update private.notification_events_v2
     set status='resolved',resolved_at=now(),actioned_at=now(),read_at=coalesce(read_at,now()),updated_at=now(),
         metadata=metadata||jsonb_build_object('resolution','received','received_amount',v_amount,'variance_amount',v_variance,'cash_transfer_id',v_transfer)
   where source_kind='delivery_cash_handover' and source_id=v_h.id and recipient_user_id=v_uid and status='active';

  insert into public.delivery_realtime_signals_v1(branch_id,recipient_user_id,event_type,entity_id)
  values(v_h.branch_id,v_h.driver_user_id,'cash_handover_confirmed',v_h.id);

  return jsonb_build_object(
    'ok',true,'idempotent',false,'status','confirmed','handover_id',v_h.id,
    'received_amount',v_amount,'variance_amount',v_variance,'cash_transfer_id',v_transfer,
    'drawer_balance',private.cash_account_balance(v_h.target_drawer_account_id)
  );
end;
$function$;

revoke all on function public.request_my_delivery_cash_handover_v2(uuid) from public;
revoke all on function public.request_my_delivery_cash_handover_v2(uuid) from anon;
grant execute on function public.request_my_delivery_cash_handover_v2(uuid) to authenticated;
