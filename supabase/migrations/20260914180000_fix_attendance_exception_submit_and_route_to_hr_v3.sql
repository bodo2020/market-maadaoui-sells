-- Fix attendance exception submission and route approvals to the HR inbox.
-- Trusted device + live selfie are the active verification controls; the redundant
-- three-minute PIN check previously rejected every mobile submission after upload.

alter table private.hr_attendance_policies
  alter column outside_require_phone_verification set default false;

update private.hr_attendance_policies
set outside_require_phone_verification = false,
    updated_at = now()
where outside_require_phone_verification is true;

create or replace function public.list_my_attendance_verification_orphans_v1(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_paths jsonb;
begin
  if v_uid is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;
  if p_branch_id is null or not public.has_branch_access(v_uid, p_branch_id) then
    raise exception using errcode='42501', message='BRANCH_ACCESS_DENIED';
  end if;

  select coalesce(jsonb_agg(o.name order by o.created_at), '[]'::jsonb)
  into v_paths
  from storage.objects o
  where o.bucket_id = 'hr_attendance_verification'
    and o.name like p_branch_id::text || '/' || v_uid::text || '/%'
    and not exists (
      select 1 from private.hr_attendance_exceptions e
      where e.verification_photo_path = o.name and e.status = 'pending'
    );

  return jsonb_build_object('ok', true, 'paths', v_paths);
end
$function$;

revoke all on function public.list_my_attendance_verification_orphans_v1(uuid) from public;
grant execute on function public.list_my_attendance_verification_orphans_v1(uuid) to authenticated;

create or replace function private.hr_route_attendance_approval_task_v1()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.source_kind = 'attendance_exception' then
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'action_url', '/hr/attendance-approvals',
        'approval_app', 'hr',
        'privacy', 'delete_photo_before_decision'
      );
  end if;
  return new;
end
$function$;

drop trigger if exists trg_hr_route_attendance_approval_task_v1 on public.operations_tasks;
create trigger trg_hr_route_attendance_approval_task_v1
before insert on public.operations_tasks
for each row execute function private.hr_route_attendance_approval_task_v1();

create or replace function private.hr_notify_attendance_approvers_v1()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.source_kind <> 'attendance_exception' then return new; end if;

  insert into private.notification_events_v2(
    audience, recipient_user_id, branch_id, event_key, category, severity,
    title, body, source_kind, source_id, action_url, action_label,
    requires_action, dedupe_key, eligible_channels, status, expires_at, metadata
  )
  select
    'staff', recipients.user_id, new.branch_id,
    'hr.attendance.exception.requested', 'employees', 'high',
    'طلب استثناء حضور جديد', new.description,
    'attendance_exception', new.source_id,
    '/hr/attendance-approvals', 'مراجعة الطلب', true,
    'attendance-exception:' || new.source_id::text,
    array['in_app','push']::text[], 'active', now() + interval '24 hours',
    jsonb_build_object('task_id', new.id, 'approval_app', 'hr')
  from (
    select distinct ubr.user_id
    from public.user_branch_roles ubr
    join public.staff_roles sr on sr.id = ubr.role_id and sr.active
    join public.staff_role_permissions srp on srp.role_id = sr.id
    join public.staff_permissions sp on sp.id = srp.permission_id
    where ubr.branch_id = new.branch_id and ubr.active
      and sp.code in ('hr.attendance.approve','branch.manage_staff')
      and ubr.user_id is distinct from new.created_by
  ) recipients
  on conflict (recipient_user_id, dedupe_key) do nothing;

  return new;
end
$function$;

drop trigger if exists trg_hr_notify_attendance_approvers_v1 on public.operations_tasks;
create trigger trg_hr_notify_attendance_approvers_v1
after insert on public.operations_tasks
for each row execute function private.hr_notify_attendance_approvers_v1();
