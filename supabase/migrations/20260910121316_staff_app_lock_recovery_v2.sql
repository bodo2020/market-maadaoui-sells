create or replace function public.recover_my_staff_app_pin_v2(p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_session_id uuid;
  v_session_created_at timestamptz;
  v_password_recent boolean := false;
begin
  if v_uid is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;
  if not exists(select 1 from public.users u where u.id=v_uid and coalesce(u.active,true)) then
    raise exception using errcode='42501', message='STAFF_ACCOUNT_INACTIVE';
  end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4,6}$' then
    raise exception using errcode='22023', message='INVALID_APP_PIN';
  end if;

  begin
    v_session_id := nullif(auth.jwt()->>'session_id','')::uuid;
  exception when others then
    v_session_id := null;
  end;

  if v_session_id is null then
    raise exception using errcode='42501', message='PASSWORD_REAUTH_REQUIRED';
  end if;

  select s.created_at into v_session_created_at
  from auth.sessions s
  where s.id=v_session_id and s.user_id=v_uid;

  if v_session_created_at is null or v_session_created_at < now() - interval '2 minutes' then
    raise exception using errcode='42501', message='PASSWORD_REAUTH_REQUIRED';
  end if;

  select exists(
    select 1
    from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) entry
    where entry->>'method'='password'
      and coalesce(entry->>'timestamp','') ~ '^[0-9]+(\.[0-9]+)?$'
      and to_timestamp((entry->>'timestamp')::double precision) >= now() - interval '2 minutes'
  ) into v_password_recent;

  if not v_password_recent then
    raise exception using errcode='42501', message='PASSWORD_REAUTH_REQUIRED';
  end if;

  insert into private.staff_app_pins(user_id,pin_hash,failed_attempts,locked_until,created_at,updated_at,last_verified_at,reset_at,reset_by)
  values(v_uid,extensions.crypt(p_new_pin,extensions.gen_salt('bf',10)),0,null,now(),now(),now(),now(),v_uid)
  on conflict(user_id) do update
  set pin_hash=excluded.pin_hash,
      failed_attempts=0,
      locked_until=null,
      updated_at=now(),
      last_verified_at=now(),
      reset_at=now(),
      reset_by=v_uid;

  insert into public.staff_pos_pins(user_id,branch_id,pin_hash,failed_attempts,locked_until,created_at,updated_at)
  select v_uid,ubr.branch_id,extensions.crypt(p_new_pin,extensions.gen_salt('bf',10)),0,null,now(),now()
  from public.user_branch_roles ubr
  where ubr.user_id=v_uid and ubr.active and coalesce(ubr.pos_enabled,false)
  on conflict(user_id,branch_id) do update
  set pin_hash=excluded.pin_hash,failed_attempts=0,locked_until=null,updated_at=now();

  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,after_data)
  values('staff_app_pin',v_uid,'recovered_with_password',v_uid,jsonb_build_object('changed',true,'method','password_reauth'));

  return jsonb_build_object('ok',true,'changed',true,'verified_at',now());
end;
$$;

create or replace function public.super_admin_set_staff_app_pin_v2(p_user_id uuid,p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;
  if not private.staff_is_super_admin(v_uid) then
    raise exception using errcode='42501', message='SUPER_ADMIN_REQUIRED';
  end if;
  if p_user_id is null or not exists(select 1 from public.users u where u.id=p_user_id and coalesce(u.active,true)) then
    raise exception using errcode='22023', message='TARGET_STAFF_INACTIVE';
  end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4,6}$' then
    raise exception using errcode='22023', message='INVALID_APP_PIN';
  end if;

  insert into private.staff_app_pins(user_id,pin_hash,failed_attempts,locked_until,created_at,updated_at,last_verified_at,reset_at,reset_by)
  values(p_user_id,extensions.crypt(p_new_pin,extensions.gen_salt('bf',10)),0,null,now(),now(),null,now(),v_uid)
  on conflict(user_id) do update
  set pin_hash=excluded.pin_hash,
      failed_attempts=0,
      locked_until=null,
      updated_at=now(),
      last_verified_at=null,
      reset_at=now(),
      reset_by=v_uid;

  insert into public.staff_pos_pins(user_id,branch_id,pin_hash,failed_attempts,locked_until,created_at,updated_at)
  select p_user_id,ubr.branch_id,extensions.crypt(p_new_pin,extensions.gen_salt('bf',10)),0,null,now(),now()
  from public.user_branch_roles ubr
  where ubr.user_id=p_user_id and ubr.active and coalesce(ubr.pos_enabled,false)
  on conflict(user_id,branch_id) do update
  set pin_hash=excluded.pin_hash,failed_attempts=0,locked_until=null,updated_at=now();

  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,after_data)
  values('staff_app_pin',p_user_id,'super_admin_set',v_uid,jsonb_build_object('changed',true,'without_old_pin',true));

  return jsonb_build_object('ok',true,'user_id',p_user_id,'changed',true);
end;
$$;

revoke all on function public.recover_my_staff_app_pin_v2(text) from public, anon;
revoke all on function public.super_admin_set_staff_app_pin_v2(uuid,text) from public, anon;
grant execute on function public.recover_my_staff_app_pin_v2(text) to authenticated;
grant execute on function public.super_admin_set_staff_app_pin_v2(uuid,text) to authenticated;
