create or replace function public.request_my_staff_device_approval_v1(
  p_branch_id uuid,
  p_device_key text,
  p_device_name text default 'هاتف الموظف',
  p_platform text default 'android',
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_device private.hr_staff_devices%rowtype;
  v_token text;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if char_length(trim(coalesce(p_device_key,''))) not between 8 and 200 then raise exception using errcode='22023',message='DEVICE_INVALID'; end if;
  if char_length(trim(coalesce(p_device_name,''))) not between 2 and 120 then raise exception using errcode='22023',message='DEVICE_INVALID'; end if;
  if not exists(select 1 from public.users u where u.id=v_uid and coalesce(u.active,true)) then raise exception using errcode='42501',message='STAFF_INACTIVE'; end if;
  if not exists(select 1 from public.user_branch_roles ubr join public.branches b on b.id=ubr.branch_id and b.active where ubr.user_id=v_uid and ubr.branch_id=p_branch_id and ubr.active)
     and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED'; end if;
  if not exists(select 1 from private.hr_employee_profiles ep where ep.user_id=v_uid and ep.employment_status='active') then raise exception using errcode='42501',message='EMPLOYEE_PROFILE_INACTIVE'; end if;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into private.hr_staff_devices(
    user_id,branch_id,device_key,device_name,device_type,platform,device_token_hash,metadata,
    active,trusted_at,last_seen_at,revoked_at,revoked_by,revoke_reason,updated_at,
    approval_status,requested_at,approved_at,approved_by,rejected_at,rejected_by,rejection_reason
  ) values(
    v_uid,p_branch_id,trim(p_device_key),trim(p_device_name),'personal',nullif(trim(coalesce(p_platform,'')),''),
    encode(extensions.digest(v_token,'sha256'),'hex'),coalesce(p_metadata,'{}'::jsonb),
    false,null,null,null,null,null,now(),
    'pending',now(),null,null,null,null,null
  )
  on conflict(user_id,device_key) do update set
    branch_id=excluded.branch_id,
    device_name=excluded.device_name,
    device_type='personal',
    platform=excluded.platform,
    device_token_hash=excluded.device_token_hash,
    metadata=excluded.metadata,
    active=false,
    trusted_at=null,
    last_seen_at=null,
    revoked_at=null,
    revoked_by=null,
    revoke_reason=null,
    updated_at=now(),
    approval_status='pending',
    requested_at=now(),
    approved_at=null,
    approved_by=null,
    rejected_at=null,
    rejected_by=null,
    rejection_reason=null
  returning * into v_device;

  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data)
  values('staff_device',v_device.id,'self_request_approval',v_uid,p_branch_id,jsonb_build_object('device_name',v_device.device_name,'platform',v_device.platform));

  return jsonb_build_object('ok',true,'code','PENDING_APPROVAL','approval_status','pending','device_id',v_device.id,'device_token',v_token,'device_key',v_device.device_key,'requested_at',v_device.requested_at);
end;
$function$;

revoke all on function public.request_my_staff_device_approval_v1(uuid,text,text,text,jsonb) from public;
grant execute on function public.request_my_staff_device_approval_v1(uuid,text,text,text,jsonb) to authenticated;
