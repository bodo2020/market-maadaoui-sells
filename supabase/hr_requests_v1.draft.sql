-- DRAFT ONLY — NOT A MIGRATION AND NOT APPLIED TO PRODUCTION.
-- Move to supabase/migrations only after Supabase connectivity returns, the SQL is
-- tested transactionally, advisors are reviewed, and an official migration name
-- is generated. This file intentionally cannot be picked up by db push as a migration.
--
-- HR Requests V1 goals:
--   employee self-service -> manager/HR approval -> explicit downstream action
--   request types: leave, salary_advance, attendance_correction
--   salary advance approval NEVER means cash was paid; it creates a finance task.
--   direct table access remains closed; frontend uses RPCs only.

create table if not exists private.hr_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id),
  branch_id uuid not null references public.branches(id),
  request_type text not null check (request_type in ('leave','salary_advance','attendance_correction')),
  status text not null default 'pending' check (status in ('pending','in_review','approved','rejected','cancelled','fulfilled')),
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  approved_payload jsonb,
  review_task_id uuid references public.operations_tasks(id),
  downstream_task_id uuid references public.operations_tasks(id),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  decision_note text,
  requested_at timestamptz not null default now(),
  cancelled_at timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.hr_requests enable row level security;
revoke all on table private.hr_requests from public, anon, authenticated;
grant all on table private.hr_requests to service_role;

create index if not exists hr_requests_employee_requested_idx
  on private.hr_requests(employee_id, requested_at desc);
create index if not exists hr_requests_branch_status_idx
  on private.hr_requests(branch_id, status, requested_at desc);
create index if not exists hr_requests_review_task_idx
  on private.hr_requests(review_task_id) where review_task_id is not null;
create index if not exists hr_requests_downstream_task_idx
  on private.hr_requests(downstream_task_id) where downstream_task_id is not null;

create or replace function private.hr_request_title_v1(p_request_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_request_type
    when 'leave' then 'طلب إجازة'
    when 'salary_advance' then 'طلب سلفة راتب'
    when 'attendance_correction' then 'طلب تصحيح حضور'
    else 'طلب موارد بشرية'
  end;
$$;

create or replace function private.hr_request_validate_payload_v1(p_type text, p_payload jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_from date;
  v_to date;
  v_amount numeric;
  v_months integer;
begin
  if p_type = 'leave' then
    v_from := nullif(p_payload->>'start_date','')::date;
    v_to := nullif(p_payload->>'end_date','')::date;
    if v_from is null or v_to is null or v_to < v_from then
      raise exception using errcode='22023', message='HR_INVALID_LEAVE_DATES';
    end if;
    if coalesce(p_payload->>'leave_type','') not in ('annual','casual','sick','unpaid','other') then
      raise exception using errcode='22023', message='HR_INVALID_LEAVE_TYPE';
    end if;
  elsif p_type = 'salary_advance' then
    v_amount := nullif(p_payload->>'amount','')::numeric;
    v_months := coalesce(nullif(p_payload->>'repayment_months','')::integer,1);
    if v_amount is null or v_amount <= 0 then
      raise exception using errcode='22023', message='HR_INVALID_ADVANCE_AMOUNT';
    end if;
    if v_months not between 1 and 12 then
      raise exception using errcode='22023', message='HR_INVALID_REPAYMENT_MONTHS';
    end if;
  elsif p_type = 'attendance_correction' then
    if nullif(p_payload->>'attendance_date','') is null then
      raise exception using errcode='22023', message='HR_ATTENDANCE_DATE_REQUIRED';
    end if;
    perform (p_payload->>'attendance_date')::date;
    if coalesce(p_payload->>'correction_type','') not in ('missed_check_in','missed_check_out','time_correction','other') then
      raise exception using errcode='22023', message='HR_INVALID_CORRECTION_TYPE';
    end if;
  else
    raise exception using errcode='22023', message='HR_INVALID_REQUEST_TYPE';
  end if;
end;
$$;

create or replace function public.submit_my_hr_request_v1(
  p_branch_id uuid,
  p_request_type text,
  p_payload jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_request private.hr_requests%rowtype;
  v_task_id uuid;
  v_title text;
  v_priority text := 'normal';
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='HR_BRANCH_ACCESS_DENIED';
  end if;
  if not exists(select 1 from public.users u where u.id=v_uid and coalesce(u.active,true)) then
    raise exception using errcode='42501',message='HR_ACTIVE_STAFF_REQUIRED';
  end if;
  if length(trim(coalesce(p_reason,''))) < 5 then
    raise exception using errcode='22023',message='HR_REASON_REQUIRED';
  end if;

  perform private.hr_request_validate_payload_v1(p_request_type,coalesce(p_payload,'{}'::jsonb));

  if exists(
    select 1 from private.hr_requests r
    where r.employee_id=v_uid and r.branch_id=p_branch_id and r.request_type=p_request_type
      and r.status in ('pending','in_review')
  ) then
    raise exception using errcode='23505',message='HR_PENDING_REQUEST_EXISTS';
  end if;

  insert into private.hr_requests(employee_id,branch_id,request_type,reason,payload)
  values(v_uid,p_branch_id,p_request_type,trim(p_reason),coalesce(p_payload,'{}'::jsonb))
  returning * into v_request;

  v_title := private.hr_request_title_v1(p_request_type);
  if p_request_type='attendance_correction' then v_priority := 'high'; end if;

  insert into public.operations_tasks(
    branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,metadata,created_by,due_at
  ) values (
    p_branch_id,'hr_request_review','hr_request',v_request.id,
    case when p_request_type='salary_advance' then coalesce((p_payload->>'amount')::numeric,0) else 0 end,
    v_priority,'open',v_title,
    trim(p_reason),
    jsonb_build_object('employee_id',v_uid,'request_type',p_request_type),
    v_uid,
    now()+interval '24 hours'
  ) returning id into v_task_id;

  update private.hr_requests set review_task_id=v_task_id,updated_at=now() where id=v_request.id;

  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data)
  values('hr_request',v_request.id,'submitted',v_uid,p_branch_id,jsonb_build_object('request_type',p_request_type,'task_id',v_task_id));

  return jsonb_build_object('ok',true,'request_id',v_request.id,'review_task_id',v_task_id,'status','pending');
end;
$$;

create or replace function public.get_my_hr_requests_v1(p_branch_id uuid default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_rows jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.requested_at desc),'[]'::jsonb) into v_rows
  from (
    select r.id,r.branch_id,b.name branch_name,r.request_type,r.status,r.reason,r.payload,r.approved_payload,
           r.requested_at,r.reviewed_at,r.decision_note,r.cancelled_at,r.fulfilled_at
    from private.hr_requests r
    join public.branches b on b.id=r.branch_id
    where r.employee_id=v_uid and (p_branch_id is null or r.branch_id=p_branch_id)
    order by r.requested_at desc
    limit least(greatest(coalesce(p_limit,50),1),100)
  ) x;
  return jsonb_build_object('items',v_rows);
end;
$$;

create or replace function public.cancel_my_hr_request_v1(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_row private.hr_requests%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_row from private.hr_requests where id=p_request_id for update;
  if v_row.id is null or v_row.employee_id<>v_uid then raise exception using errcode='42501',message='HR_REQUEST_ACCESS_DENIED'; end if;
  if v_row.status not in ('pending','in_review') then raise exception using errcode='22023',message='HR_REQUEST_NOT_CANCELLABLE'; end if;

  update private.hr_requests set status='cancelled',cancelled_at=now(),updated_at=now() where id=p_request_id;
  if v_row.review_task_id is not null then
    update public.operations_tasks set status='cancelled',updated_at=now(),failure_reason='employee_cancelled'
    where id=v_row.review_task_id and status in ('open','claimed','in_progress','failed');
  end if;
  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id)
  values('hr_request',p_request_id,'cancelled_by_employee',v_uid,v_row.branch_id);
  return jsonb_build_object('ok',true,'request_id',p_request_id,'status','cancelled');
end;
$$;

-- Reviewer functions and operations_task routing are intentionally left for the
-- apply/test pass. They must update private.operations_task_can_claim and the
-- Approval Center helper functions atomically so HR requests cannot appear in a
-- queue that nobody is authorized to claim.

revoke execute on function public.submit_my_hr_request_v1(uuid,text,jsonb,text) from public,anon;
revoke execute on function public.get_my_hr_requests_v1(uuid,integer) from public,anon;
revoke execute on function public.cancel_my_hr_request_v1(uuid) from public,anon;
grant execute on function public.submit_my_hr_request_v1(uuid,text,jsonb,text) to authenticated,service_role;
grant execute on function public.get_my_hr_requests_v1(uuid,integer) to authenticated,service_role;
grant execute on function public.cancel_my_hr_request_v1(uuid) to authenticated,service_role;
