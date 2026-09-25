-- Staff self-service V2:
-- 1) persistent approved-device recovery using a native device fingerprint
-- 2) employee self-service snapshot for profile/card/requests/advances/leaves
-- Existing HR request submission remains the source of truth.

create or replace function public.bind_my_staff_device_fingerprint_v2(
  p_device_id uuid,
  p_device_token text,
  p_device_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_device private.hr_staff_devices%rowtype;
  v_conflict private.hr_staff_devices%rowtype;
begin
  if v_uid is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;
  if char_length(trim(coalesce(p_device_key,''))) not between 16 and 200 then
    raise exception using errcode='22023',message='DEVICE_INVALID';
  end if;

  select * into v_device
  from private.hr_staff_devices d
  where d.id=p_device_id and d.user_id=v_uid
  for update;

  if v_device.id is null then
    raise exception using errcode='22023',message='DEVICE_NOT_FOUND';
  end if;
  if encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex') <> v_device.device_token_hash then
    raise exception using errcode='42501',message='DEVICE_TOKEN_INVALID';
  end if;
  if v_device.approval_status <> 'approved'
     or not v_device.active
     or v_device.revoked_at is not null then
    raise exception using errcode='42501',message='DEVICE_NOT_TRUSTED';
  end if;

  select * into v_conflict
  from private.hr_staff_devices d
  where d.user_id=v_uid
    and d.device_key=trim(p_device_key)
    and d.id<>v_device.id
  order by d.updated_at desc
  limit 1
  for update;

  if v_conflict.id is not null then
    if v_conflict.approval_status='approved'
       and v_conflict.active
       and v_conflict.revoked_at is null then
      update private.hr_staff_devices
      set active=false,
          revoked_at=coalesce(revoked_at,now()),
          revoke_reason=coalesce(revoke_reason,'replaced_by_persistent_device_identity'),
          updated_at=now()
      where id=v_device.id;

      return jsonb_build_object(
        'ok',true,
        'device_id',v_conflict.id,
        'device_key',v_conflict.device_key,
        'already_bound',true,
        'requires_recovery',true
      );
    end if;

    delete from private.hr_staff_devices
    where id=v_conflict.id
      and (approval_status<>'approved' or not active or revoked_at is not null);
  end if;

  update private.hr_staff_devices
  set device_key=trim(p_device_key),
      metadata=coalesce(metadata,'{}'::jsonb)
        || coalesce(p_metadata,'{}'::jsonb)
        || jsonb_build_object('persistent_identity_bound_at',now()),
      last_seen_at=now(),
      updated_at=now()
  where id=v_device.id
  returning * into v_device;

  insert into private.hr_audit_log(
    entity_type,entity_id,action,actor_user_id,branch_id,after_data
  ) values (
    'staff_device',v_device.id,'bind_persistent_identity',v_uid,v_device.branch_id,
    jsonb_build_object('platform',v_device.platform,'device_type',v_device.device_type)
  );

  return jsonb_build_object(
    'ok',true,
    'device_id',v_device.id,
    'device_key',v_device.device_key,
    'already_bound',false,
    'requires_recovery',false
  );
end;
$function$;

revoke all on function public.bind_my_staff_device_fingerprint_v2(uuid,text,text,jsonb)
  from public,anon;
grant execute on function public.bind_my_staff_device_fingerprint_v2(uuid,text,text,jsonb)
  to authenticated;

create or replace function public.recover_my_staff_device_v2(
  p_branch_id uuid,
  p_device_key text,
  p_device_name text default 'هاتف الموظف',
  p_platform text default 'android',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_device private.hr_staff_devices%rowtype;
  v_token text;
begin
  if v_uid is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;
  if p_branch_id is null then
    raise exception using errcode='22023',message='BRANCH_REQUIRED';
  end if;
  if char_length(trim(coalesce(p_device_key,''))) not between 16 and 200 then
    raise exception using errcode='22023',message='DEVICE_INVALID';
  end if;
  if not exists(
    select 1
    from public.user_branch_roles ubr
    where ubr.user_id=v_uid and ubr.branch_id=p_branch_id and ubr.active
  ) and not private.staff_is_super_admin(v_uid) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;

  select * into v_device
  from private.hr_staff_devices d
  where d.user_id=v_uid
    and d.device_key=trim(p_device_key)
    and (d.branch_id=p_branch_id or d.branch_id is null)
  order by
    case when d.approval_status='approved' and d.active and d.revoked_at is null then 0 else 1 end,
    d.updated_at desc
  limit 1
  for update;

  if v_device.id is null then
    return jsonb_build_object('trusted',false,'code','DEVICE_NOT_FOUND');
  end if;
  if v_device.approval_status='pending' then
    return jsonb_build_object(
      'trusted',false,'code','DEVICE_PENDING_APPROVAL',
      'device_id',v_device.id,'approval_status','pending'
    );
  end if;
  if v_device.approval_status='rejected' then
    return jsonb_build_object(
      'trusted',false,'code','DEVICE_REJECTED',
      'device_id',v_device.id,'approval_status','rejected',
      'reason',v_device.rejection_reason
    );
  end if;
  if v_device.approval_status<>'approved'
     or not v_device.active
     or v_device.revoked_at is not null then
    return jsonb_build_object('trusted',false,'code','DEVICE_NOT_TRUSTED','device_id',v_device.id);
  end if;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');

  update private.hr_staff_devices
  set branch_id=coalesce(branch_id,p_branch_id),
      device_name=coalesce(nullif(trim(coalesce(p_device_name,'')),''),device_name),
      platform=coalesce(nullif(trim(coalesce(p_platform,'')),''),platform),
      device_token_hash=encode(extensions.digest(v_token,'sha256'),'hex'),
      metadata=coalesce(metadata,'{}'::jsonb)
        || coalesce(p_metadata,'{}'::jsonb)
        || jsonb_build_object('last_recovered_at',now()),
      last_seen_at=now(),
      updated_at=now()
  where id=v_device.id
  returning * into v_device;

  insert into private.hr_audit_log(
    entity_type,entity_id,action,actor_user_id,branch_id,after_data
  ) values (
    'staff_device',v_device.id,'recover_after_reinstall',v_uid,p_branch_id,
    jsonb_build_object('device_name',v_device.device_name,'platform',v_device.platform)
  );

  return jsonb_build_object(
    'trusted',true,
    'code','DEVICE_RECOVERED',
    'device_id',v_device.id,
    'device_token',v_token,
    'approval_status','approved',
    'branch_id',v_device.branch_id,
    'device_name',v_device.device_name
  );
end;
$function$;

revoke all on function public.recover_my_staff_device_v2(uuid,text,text,text,jsonb)
  from public,anon;
grant execute on function public.recover_my_staff_device_v2(uuid,text,text,text,jsonb)
  to authenticated;

create or replace function public.get_my_staff_self_service_v1(
  p_branch_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile private.hr_employee_profiles%rowtype;
  v_user public.users%rowtype;
  v_wallet private.hr_employee_wallet_accounts%rowtype;
  v_seq bigint;
  v_requests jsonb := '[]'::jsonb;
  v_advances jsonb := '[]'::jsonb;
  v_leaves jsonb := '[]'::jsonb;
  v_approved_leave_days_ytd integer := 0;
begin
  if v_uid is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;
  if p_branch_id is null then
    raise exception using errcode='22023',message='BRANCH_REQUIRED';
  end if;

  if not exists(
    select 1
    from public.user_branch_roles ubr
    where ubr.user_id=v_uid and ubr.branch_id=p_branch_id and ubr.active
  ) and not private.staff_is_super_admin(v_uid) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;

  select * into v_user
  from public.users
  where id=v_uid and coalesce(active,true);

  select * into v_profile
  from private.hr_employee_profiles
  where user_id=v_uid;

  if v_user.id is null
     or v_profile.user_id is null
     or v_profile.employment_status<>'active' then
    raise exception using errcode='42501',message='HR_ACTIVE_STAFF_REQUIRED';
  end if;

  insert into private.hr_employee_wallet_accounts(employee_id,branch_id)
  values(v_uid,coalesce(v_profile.primary_branch_id,p_branch_id))
  on conflict(employee_id) do nothing;

  select * into v_wallet
  from private.hr_employee_wallet_accounts
  where employee_id=v_uid
  for update;

  if v_wallet.membership_number is null or v_wallet.barcode_token is null then
    v_seq:=nextval('private.hr_employee_card_seq'::regclass);
    update private.hr_employee_wallet_accounts
    set membership_number=coalesce(membership_number,'EMP'||lpad(v_seq::text,8,'0')),
        barcode_token=coalesce(barcode_token,private.hr_employee_card_ean13(v_seq)),
        updated_at=now()
    where employee_id=v_uid
    returning * into v_wallet;
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.requested_at desc),'[]'::jsonb)
  into v_requests
  from (
    select
      r.id,r.branch_id,b.name as branch_name,r.request_type,r.status,
      r.reason,r.payload,r.approved_payload,r.requested_at,r.reviewed_at,
      r.decision_note,r.cancelled_at,r.fulfilled_at
    from private.hr_requests r
    join public.branches b on b.id=r.branch_id
    where r.employee_id=v_uid
      and (r.branch_id=p_branch_id or p_branch_id is null)
    order by r.requested_at desc
    limit 50
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_advances
  from (
    select
      a.id,a.request_id,a.branch_id,a.principal_amount,a.repayment_months,
      a.monthly_deduction,a.outstanding_amount,a.status,a.paid_at,a.settled_at,
      a.approved_at,a.created_at
    from private.hr_salary_advances a
    where a.employee_id=v_uid
    order by a.created_at desc
    limit 30
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.start_date desc),'[]'::jsonb)
  into v_leaves
  from (
    select
      l.id,l.request_id,l.branch_id,l.leave_type,l.start_date,l.end_date,
      l.partial_day,l.status,l.approved_at
    from private.hr_leave_periods l
    where l.employee_id=v_uid
    order by l.start_date desc
    limit 30
  ) x;

  select coalesce(sum(
    case
      when l.partial_day in ('first_half','second_half') then 1
      else (l.end_date-l.start_date)+1
    end
  ),0)::integer
  into v_approved_leave_days_ytd
  from private.hr_leave_periods l
  where l.employee_id=v_uid
    and l.status='approved'
    and l.start_date>=date_trunc('year',timezone('Africa/Cairo',now()))::date;

  return jsonb_build_object(
    'profile',jsonb_build_object(
      'user_id',v_uid,
      'name',v_user.name,
      'username',v_user.username,
      'phone',v_user.phone,
      'email',v_user.email,
      'employee_code',v_profile.employee_code,
      'employment_status',v_profile.employment_status,
      'work_mode',v_profile.work_mode,
      'contract_type',v_profile.contract_type,
      'hire_date',v_profile.hire_date,
      'primary_branch_id',v_profile.primary_branch_id,
      'department',(
        select case when d.id is null then null else jsonb_build_object(
          'id',d.id,'name_ar',d.name_ar,'code',d.code
        ) end
        from private.hr_departments d
        where d.id=v_profile.department_id
      ),
      'team',(
        select case when t.id is null then null else jsonb_build_object(
          'id',t.id,'name_ar',t.name_ar
        ) end
        from private.hr_teams t
        where t.id=v_profile.team_id
      ),
      'job_title',(
        select case when j.id is null then null else jsonb_build_object(
          'id',j.id,'name_ar',j.name_ar,'grade',j.grade
        ) end
        from private.hr_job_titles j
        where j.id=v_profile.job_title_id
      ),
      'manager',(
        select case when m.id is null then null else jsonb_build_object(
          'id',m.id,'name',m.name
        ) end
        from public.users m
        where m.id=v_profile.direct_manager_id
      )
    ),
    'employee_card',jsonb_build_object(
      'membership_number',v_wallet.membership_number,
      'barcode',v_wallet.barcode_token
    ),
    'wallet',jsonb_build_object(
      'benefit_balance',v_wallet.benefit_balance,
      'benefit_monthly_allowance',v_wallet.benefit_monthly_allowance,
      'credit_limit',v_wallet.credit_limit,
      'receivable_balance',v_wallet.receivable_balance,
      'credit_available',greatest(v_wallet.credit_limit-v_wallet.receivable_balance,0),
      'payroll_deduction_enabled',v_wallet.payroll_deduction_enabled
    ),
    'advance_summary',jsonb_build_object(
      'outstanding_amount',coalesce((
        select sum(a.outstanding_amount)
        from private.hr_salary_advances a
        where a.employee_id=v_uid
          and a.status not in ('settled','cancelled','rejected')
      ),0),
      'active_count',coalesce((
        select count(*)
        from private.hr_salary_advances a
        where a.employee_id=v_uid
          and a.status not in ('settled','cancelled','rejected')
      ),0)
    ),
    'leave_summary',jsonb_build_object(
      'approved_days_ytd',v_approved_leave_days_ytd
    ),
    'requests',v_requests,
    'advances',v_advances,
    'leaves',v_leaves
  );
end;
$function$;

revoke all on function public.get_my_staff_self_service_v1(uuid)
  from public,anon;
grant execute on function public.get_my_staff_self_service_v1(uuid)
  to authenticated;

comment on function public.recover_my_staff_device_v2(uuid,text,text,text,jsonb)
  is 'Reissues a staff device token after app reinstall only for the same authenticated user and an already-approved persistent device fingerprint.';
comment on function public.bind_my_staff_device_fingerprint_v2(uuid,text,text,jsonb)
  is 'Migrates an already-approved staff device from a local random key to the persistent native device fingerprint.';
comment on function public.get_my_staff_self_service_v1(uuid)
  is 'Returns only the authenticated employee self-service profile/card/HR request/advance/leave data.';
