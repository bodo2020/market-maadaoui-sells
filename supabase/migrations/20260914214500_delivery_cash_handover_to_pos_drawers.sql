alter table private.delivery_cash_handovers_v1
  add column if not exists target_shift_id uuid references public.pos_shifts(id) on delete set null,
  add column if not exists target_device_id uuid references public.pos_devices(id) on delete set null,
  add column if not exists target_drawer_account_id uuid references public.cash_accounts(id) on delete set null,
  add column if not exists target_cashier_user_id uuid references public.users(id) on delete set null,
  add column if not exists target_selected_at timestamptz,
  add column if not exists received_amount numeric(12,2),
  add column if not exists variance_amount numeric(12,2),
  add column if not exists cash_transfer_id uuid references public.cash_transfers(id) on delete set null;

create index if not exists delivery_cash_handovers_target_cashier_idx
  on private.delivery_cash_handovers_v1(target_cashier_user_id,status,requested_at desc);
create index if not exists delivery_cash_handovers_target_shift_idx
  on private.delivery_cash_handovers_v1(target_shift_id,status,requested_at desc);

create or replace function public.get_my_delivery_cash_handover_targets_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_branch_id uuid;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists(select 1 from public.users u where u.id=v_uid and u.role='delivery' and coalesce(u.active,true)) then
    raise exception 'delivery_access_required';
  end if;

  select coalesce(
    (select ubr.branch_id from public.user_branch_roles ubr where ubr.user_id=v_uid and ubr.active order by ubr.is_primary desc,ubr.updated_at desc limit 1),
    (select ep.primary_branch_id from private.hr_employee_profiles ep where ep.user_id=v_uid and coalesce(ep.employment_status,'active')<>'terminated' limit 1)
  ) into v_branch_id;
  if v_branch_id is null then raise exception 'delivery_branch_required'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'shift_id',s.id,
      'device_id',d.id,
      'device_code',d.device_code,
      'device_name',d.name,
      'drawer_account_id',coalesce(s.drawer_account_id,ca.id),
      'drawer_account_name',ca.name,
      'cashier_user_id',u.id,
      'cashier_name',u.name,
      'cashier_username',u.username,
      'opened_at',s.opened_at,
      'last_seen_at',d.last_seen_at,
      'online',coalesce(d.last_seen_at,'epoch'::timestamptz)>now()-interval '10 minutes',
      'drawer_balance',private.cash_account_balance(coalesce(s.drawer_account_id,ca.id))
    ) order by
      (coalesce(d.last_seen_at,'epoch'::timestamptz)>now()-interval '10 minutes') desc,
      d.name,u.name)
    from public.pos_shifts s
    join public.pos_devices d on d.id=s.device_id and d.active and d.revoked_at is null
    join public.users u on u.id=s.user_id and coalesce(u.active,true)
    left join public.cash_accounts ca on ca.id=coalesce(s.drawer_account_id,(select ca2.id from public.cash_accounts ca2 where ca2.device_id=d.id and ca2.account_type='pos_drawer' and ca2.active order by ca2.created_at desc limit 1))
    where s.branch_id=v_branch_id and s.status='open'
      and coalesce(s.drawer_account_id,ca.id) is not null
  ),'[]'::jsonb);
end;
$function$;

create or replace function public.assign_my_delivery_cash_handover_target_v1(p_handover_id uuid,p_shift_id uuid)
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
  v_cashier public.users%rowtype;
  v_drawer uuid;
  v_driver_name text;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_h from private.delivery_cash_handovers_v1 where id=p_handover_id for update;
  if v_h.id is null then raise exception 'handover_not_found'; end if;
  if v_h.driver_user_id<>v_uid then raise exception 'handover_not_owned'; end if;
  if v_h.status<>'pending' then raise exception 'handover_not_pending'; end if;

  select * into v_shift from public.pos_shifts where id=p_shift_id for update;
  if v_shift.id is null or v_shift.status<>'open' then raise exception 'target_shift_not_open'; end if;
  if v_shift.branch_id<>v_h.branch_id then raise exception 'target_shift_wrong_branch'; end if;

  select * into v_device from public.pos_devices where id=v_shift.device_id and active and revoked_at is null;
  if v_device.id is null then raise exception 'target_pos_unavailable'; end if;
  select * into v_cashier from public.users where id=v_shift.user_id and coalesce(active,true);
  if v_cashier.id is null then raise exception 'target_cashier_unavailable'; end if;

  v_drawer:=coalesce(v_shift.drawer_account_id,private.ensure_pos_drawer_account(v_device.id));
  select name into v_driver_name from public.users where id=v_uid;

  update private.notification_events_v2
     set status='resolved',resolved_at=coalesce(resolved_at,now()),updated_at=now(),
         metadata=metadata||jsonb_build_object('resolution','retargeted')
   where source_kind='delivery_cash_handover' and source_id=v_h.id and status='active';

  update private.delivery_cash_handovers_v1
     set target_shift_id=v_shift.id,
         target_device_id=v_device.id,
         target_drawer_account_id=v_drawer,
         target_cashier_user_id=v_cashier.id,
         target_selected_at=now()
   where id=v_h.id;

  insert into private.notification_events_v2(
    audience,recipient_user_id,branch_id,event_key,category,severity,title,body,
    source_kind,source_id,action_url,action_label,requires_action,dedupe_key,
    eligible_channels,status,metadata
  ) values(
    'staff',v_cashier.id,v_h.branch_id,'delivery.cash_handover_targeted','finance','high',
    'توريد نقدية من مندوب',
    'المندوب '||coalesce(v_driver_name,'مندوب')||' سيورد '||to_char(v_h.amount,'FM999999990.00')||' ج.م إلى '||v_device.name||'.',
    'delivery_cash_handover',v_h.id,'/pos','استلام التوريد',true,
    'delivery_handover:'||v_h.id::text,
    array['in_app','push']::text[],'active',
    jsonb_build_object('delivery_type','transactional','handover_id',v_h.id,'amount',v_h.amount,'shift_id',v_shift.id,'device_id',v_device.id)
  ) on conflict(recipient_user_id,dedupe_key) do update set
    title=excluded.title,body=excluded.body,status='active',read_at=null,resolved_at=null,updated_at=now(),metadata=excluded.metadata;

  return jsonb_build_object(
    'ok',true,'handover_id',v_h.id,'amount',v_h.amount,
    'shift_id',v_shift.id,'device_id',v_device.id,'device_name',v_device.name,
    'cashier_user_id',v_cashier.id,'cashier_name',v_cashier.name,'drawer_account_id',v_drawer
  );
end;
$function$;

create or replace function public.request_my_delivery_cash_handover_v2(p_target_shift_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_base jsonb;
  v_id uuid;
  v_target jsonb;
begin
  v_base:=public.request_my_delivery_cash_handover_v1();
  v_id:=(v_base->>'handover_id')::uuid;
  if p_target_shift_id is not null then
    v_target:=public.assign_my_delivery_cash_handover_target_v1(v_id,p_target_shift_id);
    return v_base||jsonb_build_object('target',v_target);
  end if;
  return v_base;
end;
$function$;

create or replace function public.get_my_pos_delivery_cash_handovers_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',h.id,'amount',h.amount,'status',h.status,'requested_at',h.requested_at,
      'driver_user_id',h.driver_user_id,'driver_name',du.name,'driver_username',du.username,
      'branch_id',h.branch_id,'shift_id',h.target_shift_id,'device_id',h.target_device_id,
      'device_name',pd.name,'drawer_account_id',h.target_drawer_account_id,
      'cashier_user_id',h.target_cashier_user_id,'cashier_name',cu.name
    ) order by h.requested_at asc)
    from private.delivery_cash_handovers_v1 h
    join public.users du on du.id=h.driver_user_id
    join public.pos_shifts s on s.id=h.target_shift_id and s.status='open'
    left join public.pos_devices pd on pd.id=h.target_device_id
    left join public.users cu on cu.id=h.target_cashier_user_id
    where h.status='pending'
      and h.target_cashier_user_id=v_uid
      and s.user_id=v_uid
  ),'[]'::jsonb);
end;
$function$;

create or replace function public.receive_delivery_cash_handover_v2(
  p_handover_id uuid,
  p_received_amount numeric,
  p_note text default null
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

  return jsonb_build_object(
    'ok',true,'idempotent',false,'status','confirmed','handover_id',v_h.id,
    'received_amount',v_amount,'variance_amount',v_variance,'cash_transfer_id',v_transfer,
    'drawer_balance',private.cash_account_balance(v_h.target_drawer_account_id)
  );
end;
$function$;

create or replace function public.get_delivery_cash_handover_queue_v1(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('delivery.manage',p_branch_id)
     and not public.staff_has_permission('finance.manage',p_branch_id) then
    raise exception 'permission_denied';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',h.id,'driver_user_id',h.driver_user_id,'driver_name',u.name,
      'branch_id',h.branch_id,'amount',h.amount,'status',h.status,
      'requested_at',h.requested_at,'reviewed_at',h.reviewed_at,
      'reviewed_by',h.reviewed_by,'review_note',h.review_note,
      'target_shift_id',h.target_shift_id,'target_device_id',h.target_device_id,
      'target_device_name',pd.name,'target_drawer_account_id',h.target_drawer_account_id,
      'target_cashier_user_id',h.target_cashier_user_id,'target_cashier_name',cu.name,
      'target_selected_at',h.target_selected_at,'received_amount',h.received_amount,
      'variance_amount',h.variance_amount,'cash_transfer_id',h.cash_transfer_id
    ) order by h.requested_at desc)
    from private.delivery_cash_handovers_v1 h
    join public.users u on u.id=h.driver_user_id
    left join public.pos_devices pd on pd.id=h.target_device_id
    left join public.users cu on cu.id=h.target_cashier_user_id
    where h.branch_id=p_branch_id and h.status in ('pending','confirmed','rejected')
      and h.requested_at >= now()-interval '30 days'
  ),'[]'::jsonb);
end;
$function$;

create or replace function public.get_it_device_center_v1(p_branch_id uuid default null::uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_super boolean;
  v_trusted jsonb;
  v_pos jsonb;
  v_sessions jsonb;
  v_peripherals jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super := private.staff_is_super_admin(v_uid);
  if not v_super and not private.it_can_manage_branch_v1(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.online desc,x.approval_status='pending' desc,x.last_seen_at desc nulls last),'[]'::jsonb)
  into v_trusted
  from (
    select d.id,d.user_id,u.name as employee_name,u.username,d.branch_id,b.name as branch_name,d.device_key,d.device_name,d.device_type,d.platform,d.metadata,
           d.active,d.trusted_at,d.last_seen_at,d.revoked_at,d.revoke_reason,d.approval_status,d.requested_at,d.approved_at,d.rejection_reason,
           (d.active and d.approval_status='approved' and d.revoked_at is null and coalesce(d.last_seen_at,'epoch'::timestamptz)>now()-interval '2 minutes') as online
    from private.hr_staff_devices d
    join public.users u on u.id=d.user_id
    left join public.branches b on b.id=d.branch_id
    where p_branch_id is null
       or d.branch_id=p_branch_id
       or (d.branch_id is null and exists(select 1 from public.user_branch_roles ubr where ubr.user_id=d.user_id and ubr.branch_id=p_branch_id and ubr.active))
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.active desc,x.last_seen_at desc nulls last),'[]'::jsonb)
  into v_pos
  from (
    select d.id,d.branch_id,b.name as branch_name,d.device_code,d.name,d.active,d.registered_at,d.last_seen_at,d.revoked_at,d.auto_lock_minutes,d.cash_warning_threshold,
           (d.active and d.revoked_at is null and coalesce(d.last_seen_at,'epoch'::timestamptz)>now()-interval '2 minutes') as online,
           s.id as open_shift_id,s.user_id as open_shift_user_id,s.opened_at as open_shift_opened_at,
           u.name as open_shift_cashier_name,u.username as open_shift_cashier_username,
           coalesce(s.drawer_account_id,ca.id) as drawer_account_id,ca.name as drawer_account_name,
           case when coalesce(s.drawer_account_id,ca.id) is null then null else private.cash_account_balance(coalesce(s.drawer_account_id,ca.id)) end as drawer_balance
    from public.pos_devices d
    left join public.branches b on b.id=d.branch_id
    left join lateral (
      select ps.* from public.pos_shifts ps
      where ps.device_id=d.id and ps.status='open'
      order by ps.opened_at desc limit 1
    ) s on true
    left join public.users u on u.id=s.user_id
    left join public.cash_accounts ca on ca.id=coalesce(s.drawer_account_id,(select ca2.id from public.cash_accounts ca2 where ca2.device_id=d.id and ca2.account_type='pos_drawer' and ca2.active order by ca2.created_at desc limit 1))
    where p_branch_id is null or d.branch_id=p_branch_id
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.online desc,x.last_seen_at desc nulls last,x.refreshed_at desc nulls last),'[]'::jsonb)
  into v_sessions
  from (
    select s.id as session_id,s.user_id,u.name as employee_name,u.username,s.created_at,s.refreshed_at,s.not_after,s.user_agent,
           p.branch_id,b.name as branch_name,p.staff_device_id,p.device_key,p.device_name,p.platform,p.browser,p.app_version,p.current_route,p.visibility_state,p.capabilities,p.first_seen_at,p.last_seen_at,
           coalesce(sd.active and sd.approval_status='approved' and sd.revoked_at is null,false) as trusted,
           exists(select 1 from private.it_session_blocks_v1 blk where blk.session_id=s.id and (blk.expires_at is null or blk.expires_at>now())) as blocked,
           (p.last_seen_at>now()-interval '2 minutes' and not exists(select 1 from private.it_session_blocks_v1 blk where blk.session_id=s.id and (blk.expires_at is null or blk.expires_at>now()))) as online
    from auth.sessions s
    join public.users u on u.id=s.user_id
    left join private.it_device_presence_v1 p on p.session_id=s.id
    left join public.branches b on b.id=p.branch_id
    left join private.hr_staff_devices sd on sd.id=p.staff_device_id
    where (s.not_after is null or s.not_after>now())
      and (p_branch_id is null or p.branch_id=p_branch_id or exists(select 1 from public.user_branch_roles ubr where ubr.user_id=s.user_id and ubr.branch_id=p_branch_id and ubr.active))
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.active desc,x.peripheral_type,x.name),'[]'::jsonb)
  into v_peripherals
  from (
    select p.id,p.branch_id,b.name as branch_name,p.staff_device_id,p.device_key,p.peripheral_type,p.name,p.connection_type,p.vendor_id,p.product_id,p.serial_number,p.config,p.active,p.last_seen_at,p.last_test_at,p.last_test_status,p.last_error,p.created_at,p.updated_at
    from private.it_peripherals_v1 p left join public.branches b on b.id=p.branch_id
    where p_branch_id is null or p.branch_id=p_branch_id
  ) x;

  return jsonb_build_object(
    'trusted_devices',v_trusted,
    'pos_devices',v_pos,
    'sessions',v_sessions,
    'peripherals',v_peripherals,
    'generated_at',now(),
    'scope_branch_id',p_branch_id,
    'is_super_admin',v_super
  );
end;
$function$;

revoke all on function public.get_my_delivery_cash_handover_targets_v1() from public;
revoke all on function public.assign_my_delivery_cash_handover_target_v1(uuid,uuid) from public;
revoke all on function public.request_my_delivery_cash_handover_v2(uuid) from public;
revoke all on function public.get_my_pos_delivery_cash_handovers_v1() from public;
revoke all on function public.receive_delivery_cash_handover_v2(uuid,numeric,text) from public;
grant execute on function public.get_my_delivery_cash_handover_targets_v1() to authenticated;
grant execute on function public.assign_my_delivery_cash_handover_target_v1(uuid,uuid) to authenticated;
grant execute on function public.request_my_delivery_cash_handover_v2(uuid) to authenticated;
grant execute on function public.get_my_pos_delivery_cash_handovers_v1() to authenticated;
grant execute on function public.receive_delivery_cash_handover_v2(uuid,numeric,text) to authenticated;
