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
language plpgsql
security definer
set search_path=''
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

    if v_staff_device_id is not null then
      update private.hr_staff_devices
      set last_seen_at=now(), updated_at=now()
      where id=v_staff_device_id and user_id=v_uid;
    end if;
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
    last_seen_at=now(),
    updated_at=now();

  select true,b.reason into v_blocked,v_block_reason
  from private.it_session_blocks_v1 b
  where b.session_id=v_sid and (b.expires_at is null or b.expires_at>now());

  return jsonb_build_object(
    'ok',true,'session_id',v_sid,'blocked',coalesce(v_blocked,false),'block_reason',v_block_reason,
    'staff_device_id',v_staff_device_id,'trusted',v_trusted,'branch_id',v_branch_id,'last_seen_at',now()
  );
end;
$$;

revoke all on function public.heartbeat_it_device_v1(uuid,uuid,text,text,text,text,text,text,text,jsonb) from public,anon;
grant execute on function public.heartbeat_it_device_v1(uuid,uuid,text,text,text,text,text,text,text,jsonb) to authenticated;
