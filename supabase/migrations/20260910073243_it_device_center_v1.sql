create table if not exists private.it_device_presence_v1 (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  staff_device_id uuid null references private.hr_staff_devices(id) on delete set null,
  branch_id uuid null references public.branches(id) on delete set null,
  device_key text null,
  device_name text not null default 'جهاز',
  platform text null,
  browser text null,
  app_version text null,
  current_route text null,
  visibility_state text null,
  capabilities jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint it_device_presence_device_name_len check (char_length(device_name) between 1 and 120),
  constraint it_device_presence_visibility_check check (visibility_state is null or visibility_state in ('visible','hidden','prerender'))
);

create table if not exists private.it_session_blocks_v1 (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  branch_id uuid null references public.branches(id) on delete set null,
  reason text null,
  blocked_by uuid not null references auth.users(id),
  blocked_at timestamptz not null default now(),
  expires_at timestamptz null
);

create table if not exists private.it_peripherals_v1 (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  staff_device_id uuid null references private.hr_staff_devices(id) on delete set null,
  device_key text null,
  peripheral_type text not null,
  name text not null,
  connection_type text not null,
  vendor_id integer null,
  product_id integer null,
  serial_number text null,
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  last_seen_at timestamptz null,
  last_test_at timestamptz null,
  last_test_status text null,
  last_error text null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint it_peripherals_type_check check (peripheral_type in ('printer','barcode_scanner','scale','cash_drawer','customer_display','other')),
  constraint it_peripherals_connection_check check (connection_type in ('bluetooth','usb','serial','hid_keyboard','camera','system_print','network','manual','other')),
  constraint it_peripherals_name_len check (char_length(name) between 2 and 120),
  constraint it_peripherals_test_status_check check (last_test_status is null or last_test_status in ('success','warning','failed'))
);

alter table private.it_device_presence_v1 enable row level security;
alter table private.it_session_blocks_v1 enable row level security;
alter table private.it_peripherals_v1 enable row level security;
revoke all on table private.it_device_presence_v1 from public, anon, authenticated;
revoke all on table private.it_session_blocks_v1 from public, anon, authenticated;
revoke all on table private.it_peripherals_v1 from public, anon, authenticated;

create index if not exists idx_it_presence_user_last_seen on private.it_device_presence_v1(user_id,last_seen_at desc);
create index if not exists idx_it_presence_branch_last_seen on private.it_device_presence_v1(branch_id,last_seen_at desc);
create index if not exists idx_it_presence_staff_device on private.it_device_presence_v1(staff_device_id) where staff_device_id is not null;
create index if not exists idx_it_session_blocks_branch on private.it_session_blocks_v1(branch_id,blocked_at desc);
create index if not exists idx_it_peripherals_branch_active on private.it_peripherals_v1(branch_id,active,peripheral_type);
create index if not exists idx_it_peripherals_staff_device on private.it_peripherals_v1(staff_device_id) where staff_device_id is not null;

create or replace function private.it_can_manage_branch_v1(p_uid uuid, p_branch_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select p_uid is not null and (
    private.staff_is_super_admin(p_uid)
    or (p_branch_id is not null and (
      public.staff_has_permission('hr.manage_devices',p_branch_id)
      or public.staff_has_permission('pos.manage_devices',p_branch_id)
    ))
  );
$$;
revoke all on function private.it_can_manage_branch_v1(uuid,uuid) from public,anon,authenticated;

create or replace function public.heartbeat_it_device_v1(
  p_branch_id uuid default null,
  p_staff_device_id uuid default null,
  p_device_key text default null,
  p_device_name text default null,
  p_platform text default null,
  p_browser text default null,
  p_app_version text default null,
  p_current_route text default null,
  p_visibility_state text default null,
  p_capabilities jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid;
  v_staff_device_id uuid;
  v_branch_id uuid;
  v_trusted boolean := false;
  v_blocked boolean := false;
  v_block_reason text;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  begin v_sid := nullif(auth.jwt()->>'session_id','')::uuid; exception when others then v_sid := null; end;
  if v_sid is null then raise exception using errcode='42501',message='SESSION_REQUIRED'; end if;

  if p_staff_device_id is not null then
    select d.id,d.branch_id,(d.active and d.revoked_at is null and d.approval_status='approved')
    into v_staff_device_id,v_branch_id,v_trusted
    from private.hr_staff_devices d
    where d.id=p_staff_device_id and d.user_id=v_uid;
  end if;

  if v_branch_id is null and p_branch_id is not null then
    if private.staff_is_super_admin(v_uid)
       or exists(select 1 from public.user_branch_roles ubr where ubr.user_id=v_uid and ubr.branch_id=p_branch_id and ubr.active)
    then v_branch_id := p_branch_id;
    end if;
  end if;

  insert into private.it_device_presence_v1(
    session_id,user_id,staff_device_id,branch_id,device_key,device_name,platform,browser,app_version,current_route,visibility_state,capabilities,first_seen_at,last_seen_at,updated_at
  ) values(
    v_sid,v_uid,v_staff_device_id,v_branch_id,
    nullif(left(trim(coalesce(p_device_key,'')),200),''),
    coalesce(nullif(left(trim(coalesce(p_device_name,'')),120),''),'جهاز'),
    nullif(left(trim(coalesce(p_platform,'')),120),''),
    nullif(left(trim(coalesce(p_browser,'')),120),''),
    nullif(left(trim(coalesce(p_app_version,'')),80),''),
    nullif(left(trim(coalesce(p_current_route,'')),240),''),
    case when p_visibility_state in ('visible','hidden','prerender') then p_visibility_state else null end,
    case when jsonb_typeof(coalesce(p_capabilities,'{}'::jsonb))='object' then coalesce(p_capabilities,'{}'::jsonb) else '{}'::jsonb end,
    now(),now(),now()
  )
  on conflict(session_id) do update set
    user_id=excluded.user_id,
    staff_device_id=coalesce(excluded.staff_device_id,private.it_device_presence_v1.staff_device_id),
    branch_id=coalesce(excluded.branch_id,private.it_device_presence_v1.branch_id),
    device_key=coalesce(excluded.device_key,private.it_device_presence_v1.device_key),
    device_name=excluded.device_name,
    platform=excluded.platform,
    browser=excluded.browser,
    app_version=excluded.app_version,
    current_route=excluded.current_route,
    visibility_state=excluded.visibility_state,
    capabilities=excluded.capabilities,
    last_seen_at=now(),updated_at=now();

  select true,b.reason into v_blocked,v_block_reason
  from private.it_session_blocks_v1 b
  where b.session_id=v_sid and (b.expires_at is null or b.expires_at>now());

  return jsonb_build_object('ok',true,'session_id',v_sid,'blocked',coalesce(v_blocked,false),'block_reason',v_block_reason,'staff_device_id',v_staff_device_id,'trusted',v_trusted,'branch_id',v_branch_id,'last_seen_at',now());
end;
$$;

create or replace function public.check_my_it_session_v1()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_sid uuid; v_reason text;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  begin v_sid := nullif(auth.jwt()->>'session_id','')::uuid; exception when others then v_sid := null; end;
  if v_sid is null then return jsonb_build_object('blocked',false,'session_id',null); end if;
  select reason into v_reason from private.it_session_blocks_v1 where session_id=v_sid and (expires_at is null or expires_at>now());
  return jsonb_build_object('blocked',v_reason is not null or exists(select 1 from private.it_session_blocks_v1 where session_id=v_sid and (expires_at is null or expires_at>now())),'reason',v_reason,'session_id',v_sid);
end;
$$;

create or replace function public.get_it_device_center_v1(p_branch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid(); v_super boolean; v_trusted jsonb; v_pos jsonb; v_sessions jsonb; v_peripherals jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super := private.staff_is_super_admin(v_uid);
  if not v_super and not private.it_can_manage_branch_v1(v_uid,p_branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.online desc,x.approval_status='pending' desc,x.last_seen_at desc nulls last),'[]'::jsonb) into v_trusted
  from (
    select d.id,d.user_id,u.name as employee_name,u.username,d.branch_id,b.name as branch_name,d.device_key,d.device_name,d.device_type,d.platform,d.metadata,
           d.active,d.trusted_at,d.last_seen_at,d.revoked_at,d.revoke_reason,d.approval_status,d.requested_at,d.approved_at,d.rejection_reason,
           (d.active and d.approval_status='approved' and d.revoked_at is null and coalesce(d.last_seen_at,'epoch'::timestamptz)>now()-interval '2 minutes') as online
    from private.hr_staff_devices d join public.users u on u.id=d.user_id left join public.branches b on b.id=d.branch_id
    where p_branch_id is null or d.branch_id=p_branch_id or (d.branch_id is null and exists(select 1 from public.user_branch_roles ubr where ubr.user_id=d.user_id and ubr.branch_id=p_branch_id and ubr.active))
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.active desc,x.last_seen_at desc nulls last),'[]'::jsonb) into v_pos
  from (
    select d.id,d.branch_id,b.name as branch_name,d.device_code,d.name,d.active,d.registered_at,d.last_seen_at,d.revoked_at,d.auto_lock_minutes,d.cash_warning_threshold,
           (d.active and d.revoked_at is null and coalesce(d.last_seen_at,'epoch'::timestamptz)>now()-interval '2 minutes') as online
    from public.pos_devices d left join public.branches b on b.id=d.branch_id where p_branch_id is null or d.branch_id=p_branch_id
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.online desc,x.last_seen_at desc nulls last,x.refreshed_at desc nulls last),'[]'::jsonb) into v_sessions
  from (
    select s.id as session_id,s.user_id,u.name as employee_name,u.username,s.created_at,s.refreshed_at,s.not_after,s.user_agent,
           p.branch_id,b.name as branch_name,p.staff_device_id,p.device_key,p.device_name,p.platform,p.browser,p.app_version,p.current_route,p.visibility_state,p.capabilities,p.first_seen_at,p.last_seen_at,
           coalesce(sd.active and sd.approval_status='approved' and sd.revoked_at is null,false) as trusted,
           exists(select 1 from private.it_session_blocks_v1 blk where blk.session_id=s.id and (blk.expires_at is null or blk.expires_at>now())) as blocked,
           (p.last_seen_at>now()-interval '2 minutes' and not exists(select 1 from private.it_session_blocks_v1 blk where blk.session_id=s.id and (blk.expires_at is null or blk.expires_at>now()))) as online
    from auth.sessions s join public.users u on u.id=s.user_id
    left join private.it_device_presence_v1 p on p.session_id=s.id left join public.branches b on b.id=p.branch_id left join private.hr_staff_devices sd on sd.id=p.staff_device_id
    where (s.not_after is null or s.not_after>now()) and (p_branch_id is null or p.branch_id=p_branch_id or exists(select 1 from public.user_branch_roles ubr where ubr.user_id=s.user_id and ubr.branch_id=p_branch_id and ubr.active))
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.active desc,x.peripheral_type,x.name),'[]'::jsonb) into v_peripherals
  from (
    select p.id,p.branch_id,b.name as branch_name,p.staff_device_id,p.device_key,p.peripheral_type,p.name,p.connection_type,p.vendor_id,p.product_id,p.serial_number,p.config,p.active,p.last_seen_at,p.last_test_at,p.last_test_status,p.last_error,p.created_at,p.updated_at
    from private.it_peripherals_v1 p left join public.branches b on b.id=p.branch_id where p_branch_id is null or p.branch_id=p_branch_id
  ) x;

  return jsonb_build_object('trusted_devices',v_trusted,'pos_devices',v_pos,'sessions',v_sessions,'peripherals',v_peripherals,'generated_at',now(),'scope_branch_id',p_branch_id,'is_super_admin',v_super);
end;
$$;

create or replace function public.end_it_session_v1(p_session_id uuid,p_branch_id uuid default null,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_current_sid uuid; v_target_uid uuid; v_presence_branch uuid; v_reason text:=coalesce(nullif(trim(coalesce(p_reason,'')),''),'إنهاء الجلسة من مركز IT');
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  begin v_current_sid := nullif(auth.jwt()->>'session_id','')::uuid; exception when others then v_current_sid := null; end;
  if p_session_id is null then raise exception using errcode='22023',message='SESSION_REQUIRED'; end if;
  if p_session_id=v_current_sid then raise exception using errcode='22023',message='SELF_SESSION_NOT_ALLOWED'; end if;
  select s.user_id into v_target_uid from auth.sessions s where s.id=p_session_id;
  if v_target_uid is null then raise exception using errcode='22023',message='SESSION_NOT_FOUND'; end if;
  select p.branch_id into v_presence_branch from private.it_device_presence_v1 p where p.session_id=p_session_id;
  if not private.staff_is_super_admin(v_uid) then
    if p_branch_id is null or not private.it_can_manage_branch_v1(v_uid,p_branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
    if coalesce(v_presence_branch,p_branch_id)<>p_branch_id and not exists(select 1 from public.user_branch_roles ubr where ubr.user_id=v_target_uid and ubr.branch_id=p_branch_id and ubr.active) then raise exception using errcode='42501',message='SESSION_OUT_OF_SCOPE'; end if;
  end if;
  insert into private.it_session_blocks_v1(session_id,user_id,branch_id,reason,blocked_by,blocked_at)
  values(p_session_id,v_target_uid,coalesce(v_presence_branch,p_branch_id),v_reason,v_uid,now())
  on conflict(session_id) do update set reason=excluded.reason,blocked_by=excluded.blocked_by,blocked_at=now(),expires_at=null,branch_id=coalesce(excluded.branch_id,private.it_session_blocks_v1.branch_id);
  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data)
  values('it_session',p_session_id,'end_session',v_uid,coalesce(v_presence_branch,p_branch_id),jsonb_build_object('target_user_id',v_target_uid,'reason',v_reason));
  return jsonb_build_object('ok',true,'session_id',p_session_id,'blocked',true,'reason',v_reason);
end;
$$;

create or replace function public.unblock_it_session_v1(p_session_id uuid,p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_row private.it_session_blocks_v1%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_row from private.it_session_blocks_v1 where session_id=p_session_id;
  if v_row.session_id is null then return jsonb_build_object('ok',true,'session_id',p_session_id,'blocked',false); end if;
  if not private.staff_is_super_admin(v_uid) then
    if p_branch_id is null or not private.it_can_manage_branch_v1(v_uid,p_branch_id) or (v_row.branch_id is not null and v_row.branch_id<>p_branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  end if;
  delete from private.it_session_blocks_v1 where session_id=p_session_id;
  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data)
  values('it_session',p_session_id,'unblock_session',v_uid,coalesce(v_row.branch_id,p_branch_id),'{}'::jsonb);
  return jsonb_build_object('ok',true,'session_id',p_session_id,'blocked',false);
end;
$$;

create or replace function public.upsert_it_peripheral_v1(
  p_id uuid default null,p_branch_id uuid default null,p_staff_device_id uuid default null,p_device_key text default null,
  p_peripheral_type text default null,p_name text default null,p_connection_type text default null,p_vendor_id integer default null,
  p_product_id integer default null,p_serial_number text default null,p_config jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_row private.it_peripherals_v1%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not private.it_can_manage_branch_v1(v_uid,p_branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  if p_peripheral_type not in ('printer','barcode_scanner','scale','cash_drawer','customer_display','other') then raise exception using errcode='22023',message='PERIPHERAL_TYPE_INVALID'; end if;
  if p_connection_type not in ('bluetooth','usb','serial','hid_keyboard','camera','system_print','network','manual','other') then raise exception using errcode='22023',message='CONNECTION_TYPE_INVALID'; end if;
  if char_length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception using errcode='22023',message='NAME_INVALID'; end if;
  if p_staff_device_id is not null and not exists(select 1 from private.hr_staff_devices d where d.id=p_staff_device_id and (d.branch_id=p_branch_id or d.branch_id is null)) then raise exception using errcode='22023',message='STAFF_DEVICE_OUT_OF_SCOPE'; end if;
  if p_id is null then
    insert into private.it_peripherals_v1(branch_id,staff_device_id,device_key,peripheral_type,name,connection_type,vendor_id,product_id,serial_number,config,created_by,updated_by)
    values(p_branch_id,p_staff_device_id,nullif(left(trim(coalesce(p_device_key,'')),200),''),p_peripheral_type,trim(p_name),p_connection_type,p_vendor_id,p_product_id,nullif(left(trim(coalesce(p_serial_number,'')),200),''),case when jsonb_typeof(coalesce(p_config,'{}'::jsonb))='object' then coalesce(p_config,'{}'::jsonb) else '{}'::jsonb end,v_uid,v_uid)
    returning * into v_row;
  else
    update private.it_peripherals_v1 set staff_device_id=p_staff_device_id,device_key=nullif(left(trim(coalesce(p_device_key,'')),200),''),peripheral_type=p_peripheral_type,name=trim(p_name),connection_type=p_connection_type,vendor_id=p_vendor_id,product_id=p_product_id,serial_number=nullif(left(trim(coalesce(p_serial_number,'')),200),''),config=case when jsonb_typeof(coalesce(p_config,'{}'::jsonb))='object' then coalesce(p_config,'{}'::jsonb) else '{}'::jsonb end,updated_by=v_uid,updated_at=now()
    where id=p_id and branch_id=p_branch_id returning * into v_row;
    if v_row.id is null then raise exception using errcode='22023',message='PERIPHERAL_NOT_FOUND'; end if;
  end if;
  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data)
  values('it_peripheral',v_row.id,case when p_id is null then 'create' else 'update' end,v_uid,p_branch_id,to_jsonb(v_row)-'config');
  return to_jsonb(v_row);
end;
$$;

create or replace function public.set_it_peripheral_active_v1(p_id uuid,p_branch_id uuid,p_active boolean)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_row private.it_peripherals_v1%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not private.it_can_manage_branch_v1(v_uid,p_branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  update private.it_peripherals_v1 set active=coalesce(p_active,false),updated_by=v_uid,updated_at=now() where id=p_id and branch_id=p_branch_id returning * into v_row;
  if v_row.id is null then raise exception using errcode='22023',message='PERIPHERAL_NOT_FOUND'; end if;
  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data)
  values('it_peripheral',v_row.id,case when v_row.active then 'activate' else 'deactivate' end,v_uid,p_branch_id,jsonb_build_object('active',v_row.active));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.record_it_peripheral_test_v1(p_id uuid,p_branch_id uuid,p_status text,p_error text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_row private.it_peripherals_v1%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not private.it_can_manage_branch_v1(v_uid,p_branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  if p_status not in ('success','warning','failed') then raise exception using errcode='22023',message='TEST_STATUS_INVALID'; end if;
  update private.it_peripherals_v1 set last_test_at=now(),last_test_status=p_status,last_error=nullif(left(trim(coalesce(p_error,'')),500),''),last_seen_at=case when p_status='success' then now() else last_seen_at end,updated_by=v_uid,updated_at=now()
  where id=p_id and branch_id=p_branch_id returning * into v_row;
  if v_row.id is null then raise exception using errcode='22023',message='PERIPHERAL_NOT_FOUND'; end if;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.heartbeat_it_device_v1(uuid,uuid,text,text,text,text,text,text,text,jsonb) from public,anon;
revoke all on function public.check_my_it_session_v1() from public,anon;
revoke all on function public.get_it_device_center_v1(uuid) from public,anon;
revoke all on function public.end_it_session_v1(uuid,uuid,text) from public,anon;
revoke all on function public.unblock_it_session_v1(uuid,uuid) from public,anon;
revoke all on function public.upsert_it_peripheral_v1(uuid,uuid,uuid,text,text,text,text,integer,integer,text,jsonb) from public,anon;
revoke all on function public.set_it_peripheral_active_v1(uuid,uuid,boolean) from public,anon;
revoke all on function public.record_it_peripheral_test_v1(uuid,uuid,text,text) from public,anon;
grant execute on function public.heartbeat_it_device_v1(uuid,uuid,text,text,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.check_my_it_session_v1() to authenticated;
grant execute on function public.get_it_device_center_v1(uuid) to authenticated;
grant execute on function public.end_it_session_v1(uuid,uuid,text) to authenticated;
grant execute on function public.unblock_it_session_v1(uuid,uuid) to authenticated;
grant execute on function public.upsert_it_peripheral_v1(uuid,uuid,uuid,text,text,text,text,integer,integer,text,jsonb) to authenticated;
grant execute on function public.set_it_peripheral_active_v1(uuid,uuid,boolean) to authenticated;
grant execute on function public.record_it_peripheral_test_v1(uuid,uuid,text,text) to authenticated;
