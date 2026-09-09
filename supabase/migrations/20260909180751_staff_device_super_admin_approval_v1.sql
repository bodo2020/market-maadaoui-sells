alter table private.hr_staff_devices
  add column if not exists approval_status text not null default 'approved',
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid,
  add column if not exists rejection_reason text;

alter table private.hr_staff_devices drop constraint if exists hr_staff_devices_approval_status_check;
alter table private.hr_staff_devices add constraint hr_staff_devices_approval_status_check check (approval_status in ('pending','approved','rejected'));
alter table private.hr_staff_devices alter column trusted_at drop not null;

update private.hr_staff_devices
set approval_status='approved',
    requested_at=coalesce(requested_at,created_at),
    approved_at=coalesce(approved_at,trusted_at,created_at)
where approval_status is distinct from 'approved' and active=true and revoked_at is null;

create or replace function public.redeem_staff_device_pairing_v1(
  p_pairing_token text,
  p_pairing_code text,
  p_device_key text,
  p_device_name text,
  p_platform text default null,
  p_device_type text default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_pair private.hr_device_pairings%rowtype;
  v_device private.hr_staff_devices%rowtype;
  v_device_token text;
  v_employee_name text;
  v_branch_name text;
  v_type text;
begin
  if char_length(coalesce(p_pairing_token,'')) < 32 or p_pairing_code !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok',false,'code','PAIRING_INVALID');
  end if;
  if char_length(trim(coalesce(p_device_key,''))) not between 8 and 200 or char_length(trim(coalesce(p_device_name,''))) not between 2 and 120 then
    return jsonb_build_object('ok',false,'code','DEVICE_INVALID');
  end if;

  select * into v_pair
  from private.hr_device_pairings p
  where p.pairing_token_hash=encode(extensions.digest(p_pairing_token,'sha256'),'hex')
  for update;

  if v_pair.id is null then return jsonb_build_object('ok',false,'code','PAIRING_INVALID'); end if;
  if v_pair.status<>'pending' then return jsonb_build_object('ok',false,'code','PAIRING_UNAVAILABLE'); end if;
  if v_pair.expires_at<=now() then
    update private.hr_device_pairings set status='expired' where id=v_pair.id;
    return jsonb_build_object('ok',false,'code','PAIRING_EXPIRED');
  end if;
  if v_pair.attempts>=v_pair.max_attempts then
    update private.hr_device_pairings set status='revoked',revoked_at=now() where id=v_pair.id;
    return jsonb_build_object('ok',false,'code','PAIRING_LOCKED');
  end if;

  if extensions.crypt(p_pairing_code,v_pair.code_hash)<>v_pair.code_hash then
    update private.hr_device_pairings
    set attempts=attempts+1,
        status=case when attempts+1>=max_attempts then 'revoked' else status end,
        revoked_at=case when attempts+1>=max_attempts then now() else revoked_at end
    where id=v_pair.id;
    return jsonb_build_object('ok',false,'code','PAIRING_INVALID');
  end if;

  v_type:=coalesce(nullif(p_device_type,''),v_pair.device_type);
  if v_type not in ('personal','shared','remote') then return jsonb_build_object('ok',false,'code','DEVICE_TYPE_INVALID'); end if;

  v_device_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into private.hr_staff_devices(
    user_id,branch_id,device_key,device_name,device_type,platform,device_token_hash,metadata,
    active,trusted_at,last_seen_at,revoked_at,revoked_by,revoke_reason,updated_at,
    approval_status,requested_at,approved_at,approved_by,rejected_at,rejected_by,rejection_reason
  ) values(
    v_pair.user_id,v_pair.branch_id,trim(p_device_key),trim(p_device_name),v_type,
    nullif(trim(coalesce(p_platform,'')),''),encode(extensions.digest(v_device_token,'sha256'),'hex'),coalesce(p_metadata,'{}'::jsonb),
    false,null,null,null,null,null,now(),
    'pending',now(),null,null,null,null,null
  )
  on conflict(user_id,device_key) do update
    set branch_id=excluded.branch_id,
        device_name=excluded.device_name,
        device_type=excluded.device_type,
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

  update private.hr_device_pairings set status='used',used_at=now() where id=v_pair.id;
  select u.name into v_employee_name from public.users u where u.id=v_pair.user_id;
  select b.name into v_branch_name from public.branches b where b.id=v_pair.branch_id;

  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data)
  values('staff_device',v_device.id,'request_trust',v_pair.user_id,v_pair.branch_id,
    jsonb_build_object('device_name',v_device.device_name,'device_type',v_device.device_type,'platform',v_device.platform,'pairing_id',v_pair.id));

  return jsonb_build_object(
    'ok',true,'code','PENDING_APPROVAL','approval_status','pending',
    'device_id',v_device.id,'device_token',v_device_token,'device_key',v_device.device_key,
    'device_name',v_device.device_name,'device_type',v_device.device_type,
    'employee_id',v_pair.user_id,'employee_name',v_employee_name,
    'branch_id',v_pair.branch_id,'branch_name',v_branch_name,'requested_at',v_device.requested_at
  );
end;
$$;

create or replace function public.validate_my_staff_device_v1(p_device_id uuid,p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_device private.hr_staff_devices%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_device from private.hr_staff_devices d where d.id=p_device_id and d.user_id=v_uid;
  if v_device.id is null then return jsonb_build_object('trusted',false,'code','DEVICE_NOT_FOUND'); end if;
  if encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex')<>v_device.device_token_hash then
    return jsonb_build_object('trusted',false,'code','DEVICE_TOKEN_INVALID');
  end if;
  if v_device.approval_status='pending' then return jsonb_build_object('trusted',false,'code','DEVICE_PENDING_APPROVAL','device_id',v_device.id); end if;
  if v_device.approval_status='rejected' then return jsonb_build_object('trusted',false,'code','DEVICE_REJECTED','device_id',v_device.id,'reason',v_device.rejection_reason); end if;
  if not v_device.active or v_device.revoked_at is not null then return jsonb_build_object('trusted',false,'code','DEVICE_NOT_TRUSTED'); end if;
  update private.hr_staff_devices set last_seen_at=now(),updated_at=now() where id=v_device.id;
  return jsonb_build_object('trusted',true,'device_id',v_device.id,'employee_id',v_device.user_id,'branch_id',v_device.branch_id,'device_type',v_device.device_type,'device_name',v_device.device_name,'last_seen_at',now());
end;
$$;

create or replace function public.get_employee_staff_devices_v1(p_employee_id uuid,p_branch_id uuid default null)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if v_uid<>p_employee_id and not private.staff_is_super_admin(v_uid) then
    if p_branch_id is null or not (public.staff_has_permission('hr.manage_devices',p_branch_id) or public.staff_has_permission('branch.manage_staff',p_branch_id)) then
      raise exception using errcode='42501',message='PERMISSION_DENIED';
    end if;
    if not exists(select 1 from public.user_branch_roles ubr where ubr.user_id=p_employee_id and ubr.branch_id=p_branch_id and ubr.active) then
      raise exception using errcode='42501',message='EMPLOYEE_OUT_OF_SCOPE';
    end if;
  end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by (x.approval_status='pending') desc,x.active desc,x.requested_at desc) from (
    select d.id,d.user_id,d.branch_id,b.name branch_name,d.device_key,d.device_name,d.device_type,d.platform,d.metadata,d.active,
           d.trusted_at,d.last_seen_at,d.revoked_at,d.revoke_reason,d.approval_status,d.requested_at,d.approved_at,d.approved_by,
           d.rejected_at,d.rejected_by,d.rejection_reason
    from private.hr_staff_devices d
    left join public.branches b on b.id=d.branch_id
    where d.user_id=p_employee_id and (p_branch_id is null or d.branch_id is null or d.branch_id=p_branch_id)
  ) x),'[]'::jsonb);
end;
$$;

create or replace function public.list_pending_staff_device_approvals_v1(p_limit integer default 100)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.requested_at asc) from (
    select d.id as device_id,d.user_id,u.name as employee_name,u.username,d.branch_id,b.name as branch_name,d.device_name,d.device_type,d.platform,d.metadata,d.requested_at
    from private.hr_staff_devices d
    join public.users u on u.id=d.user_id
    left join public.branches b on b.id=d.branch_id
    where d.approval_status='pending' and d.revoked_at is null
    order by d.requested_at asc
    limit greatest(1,least(coalesce(p_limit,100),250))
  ) x),'[]'::jsonb);
end;
$$;

create or replace function public.approve_staff_device_v1(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_device private.hr_staff_devices%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED'; end if;
  select * into v_device from private.hr_staff_devices where id=p_device_id for update;
  if v_device.id is null then raise exception using errcode='22023',message='DEVICE_NOT_FOUND'; end if;
  if v_device.approval_status<>'pending' then raise exception using errcode='22023',message='DEVICE_NOT_PENDING'; end if;
  update private.hr_staff_devices
  set approval_status='approved',active=true,trusted_at=now(),approved_at=now(),approved_by=v_uid,
      rejected_at=null,rejected_by=null,rejection_reason=null,updated_at=now()
  where id=p_device_id;
  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data)
  values('staff_device',p_device_id,'approve_trust',v_uid,v_device.branch_id,jsonb_build_object('employee_id',v_device.user_id,'device_name',v_device.device_name));
  return jsonb_build_object('ok',true,'device_id',p_device_id,'approval_status','approved','trusted_at',now());
end;
$$;

create or replace function public.reject_staff_device_v1(p_device_id uuid,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_device private.hr_staff_devices%rowtype; v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED'; end if;
  if v_reason is null then raise exception using errcode='22023',message='REJECTION_REASON_REQUIRED'; end if;
  select * into v_device from private.hr_staff_devices where id=p_device_id for update;
  if v_device.id is null then raise exception using errcode='22023',message='DEVICE_NOT_FOUND'; end if;
  if v_device.approval_status<>'pending' then raise exception using errcode='22023',message='DEVICE_NOT_PENDING'; end if;
  update private.hr_staff_devices
  set approval_status='rejected',active=false,trusted_at=null,rejected_at=now(),rejected_by=v_uid,rejection_reason=v_reason,updated_at=now()
  where id=p_device_id;
  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data)
  values('staff_device',p_device_id,'reject_trust',v_uid,v_device.branch_id,jsonb_build_object('employee_id',v_device.user_id,'device_name',v_device.device_name,'reason',v_reason));
  return jsonb_build_object('ok',true,'device_id',p_device_id,'approval_status','rejected');
end;
$$;

revoke all on function public.list_pending_staff_device_approvals_v1(integer) from public,anon;
revoke all on function public.approve_staff_device_v1(uuid) from public,anon;
revoke all on function public.reject_staff_device_v1(uuid,text) from public,anon;
grant execute on function public.list_pending_staff_device_approvals_v1(integer) to authenticated;
grant execute on function public.approve_staff_device_v1(uuid) to authenticated;
grant execute on function public.reject_staff_device_v1(uuid,text) to authenticated;
