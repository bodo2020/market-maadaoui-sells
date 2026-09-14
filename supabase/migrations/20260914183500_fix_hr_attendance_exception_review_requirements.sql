-- Keep HR attendance exception review permissions and approval requirements aligned
-- with the branch attendance policy.

drop policy if exists "hr attendance verification read" on storage.objects;

create policy "hr attendance verification read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'hr_attendance_verification'
  and array_length(storage.foldername(name), 1) >= 2
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or (
      (
        public.staff_has_permission('hr.attendance.view', ((storage.foldername(name))[1])::uuid)
        or public.staff_has_permission('hr.attendance.approve', ((storage.foldername(name))[1])::uuid)
        or public.staff_has_permission('branch.manage_staff', ((storage.foldername(name))[1])::uuid)
        or private.staff_is_super_admin(auth.uid())
      )
      and private.hr_employee_in_scope_v1(
        auth.uid(),
        ((storage.foldername(name))[2])::uuid,
        ((storage.foldername(name))[1])::uuid
      )
    )
  )
);

create or replace function public.get_attendance_exception_v1(p_exception_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_e private.hr_attendance_exceptions%rowtype;
begin
  if v_uid is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;

  select * into v_e
  from private.hr_attendance_exceptions
  where id = p_exception_id;

  if v_e.id is null then
    return null;
  end if;

  if v_uid <> v_e.user_id
     and not private.staff_is_super_admin(v_uid)
     and not (
       (
         public.staff_has_permission('hr.attendance.approve', v_e.branch_id)
         or public.staff_has_permission('hr.attendance.view', v_e.branch_id)
         or public.staff_has_permission('branch.manage_staff', v_e.branch_id)
       )
       and private.hr_employee_in_scope_v1(v_uid, v_e.user_id, v_e.branch_id)
     ) then
    raise exception using errcode='42501', message='PERMISSION_DENIED';
  end if;

  return (
    select to_jsonb(x)
    from (
      select
        e.id,
        e.user_id,
        u.name employee_name,
        e.branch_id,
        b.name branch_name,
        e.attendance_mode,
        e.requested_at,
        e.latitude,
        e.longitude,
        e.accuracy_m,
        e.distance_m,
        e.reason,
        e.status,
        e.reviewer_user_id,
        ru.name reviewer_name,
        e.reviewed_at,
        e.review_note,
        e.operations_task_id,
        e.attendance_session_id,
        e.verification_photo_path,
        e.verification_photo_sha256,
        e.verification_photo_captured_at,
        e.phone_verified_at,
        e.phone_verification_method,
        e.verification_photo_deleted_at,
        coalesce(p.outside_require_live_photo, true) as requires_live_photo,
        coalesce(p.outside_require_phone_verification, false) as requires_phone_verification
      from private.hr_attendance_exceptions e
      join public.users u on u.id = e.user_id
      join public.branches b on b.id = e.branch_id
      left join public.users ru on ru.id = e.reviewer_user_id
      left join private.hr_attendance_policies p on p.branch_id = e.branch_id and p.active
      where e.id = p_exception_id
    ) x
  );
end
$function$;

create or replace function public.decide_attendance_exception_v1(
  p_exception_id uuid,
  p_decision text,
  p_note text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_e private.hr_attendance_exceptions%rowtype;
  v_profile private.hr_employee_profiles%rowtype;
  v_policy private.hr_attendance_policies%rowtype;
  v_schedule jsonb;
  v_session_id uuid;
  v_late integer := 0;
  v_sched_start timestamptz;
  v_sched_end timestamptz;
  v_dec text := lower(trim(coalesce(p_decision,'')));
begin
  if v_uid is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;

  select * into v_e
  from private.hr_attendance_exceptions
  where id = p_exception_id
  for update;

  if v_e.id is null then
    raise exception using errcode='22023', message='EXCEPTION_NOT_FOUND';
  end if;

  if v_e.status <> 'pending' then
    return jsonb_build_object('ok', false, 'code', 'EXCEPTION_ALREADY_DECIDED', 'status', v_e.status);
  end if;

  if not private.staff_is_super_admin(v_uid)
     and not (
       (
         public.staff_has_permission('hr.attendance.approve', v_e.branch_id)
         or public.staff_has_permission('branch.manage_staff', v_e.branch_id)
       )
       and private.hr_employee_in_scope_v1(v_uid, v_e.user_id, v_e.branch_id)
     ) then
    raise exception using errcode='42501', message='PERMISSION_DENIED';
  end if;

  if v_dec not in ('approved','rejected') then
    raise exception using errcode='22023', message='INVALID_DECISION';
  end if;

  if v_dec = 'approved' then
    select * into v_policy
    from private.hr_attendance_policies
    where branch_id = v_e.branch_id and active;

    if v_policy.branch_id is null then
      return jsonb_build_object('ok', false, 'code', 'ATTENDANCE_POLICY_NOT_CONFIGURED');
    end if;

    if v_policy.outside_require_phone_verification and v_e.phone_verified_at is null then
      return jsonb_build_object('ok', false, 'code', 'PHONE_VERIFICATION_REQUIRED');
    end if;

    if v_policy.outside_require_live_photo then
      if nullif(trim(coalesce(v_e.verification_photo_path,'')), '') is null then
        return jsonb_build_object('ok', false, 'code', 'LIVE_PHOTO_REQUIRED');
      end if;
      if not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'hr_attendance_verification'
          and o.name = v_e.verification_photo_path
      ) then
        return jsonb_build_object('ok', false, 'code', 'LIVE_PHOTO_NOT_FOUND');
      end if;
    end if;

    if exists (
      select 1 from private.hr_attendance_sessions
      where user_id = v_e.user_id and status = 'active'
    ) then
      return jsonb_build_object('ok', false, 'code', 'EMPLOYEE_ALREADY_ACTIVE');
    end if;

    select * into v_profile
    from private.hr_employee_profiles
    where user_id = v_e.user_id;

    v_schedule := private.hr_get_schedule_v1(v_e.user_id, v_e.branch_id, v_e.requested_at);
    if v_schedule is not null then
      v_sched_start := (v_schedule->>'scheduled_start_at')::timestamptz;
      v_sched_end := (v_schedule->>'scheduled_end_at')::timestamptz;
      v_late := greatest(
        0,
        floor(
          extract(epoch from (
            v_e.requested_at - (v_sched_start + make_interval(mins => (v_schedule->>'late_grace_minutes')::int))
          )) / 60
        )::int
      );
    end if;

    insert into private.hr_attendance_sessions(
      user_id, branch_id, device_id, work_date, work_mode, attendance_mode, status,
      shift_template_id, scheduled_start_at, scheduled_end_at, check_in_at,
      check_in_latitude, check_in_longitude, check_in_accuracy_m, check_in_distance_m,
      check_in_location_status, late_minutes, metadata
    )
    values(
      v_e.user_id,
      v_e.branch_id,
      v_e.device_id,
      timezone('Africa/Cairo', v_e.requested_at)::date,
      coalesce(v_profile.work_mode,'onsite'),
      v_e.attendance_mode,
      'active',
      case when v_schedule is null then null else (v_schedule->>'shift_template_id')::uuid end,
      v_sched_start,
      v_sched_end,
      v_e.requested_at,
      v_e.latitude,
      v_e.longitude,
      v_e.accuracy_m,
      v_e.distance_m,
      'approved_exception',
      v_late,
      jsonb_build_object(
        'attendance_exception_id', v_e.id,
        'approved_by', v_uid,
        'phone_verified_at', v_e.phone_verified_at,
        'verification_photo_sha256', v_e.verification_photo_sha256
      )
    )
    returning id into v_session_id;
  end if;

  update private.hr_attendance_exceptions
  set status = v_dec,
      reviewer_user_id = v_uid,
      reviewed_at = now(),
      review_note = nullif(trim(coalesce(p_note,'')),''),
      attendance_session_id = v_session_id,
      updated_at = now()
  where id = v_e.id;

  if v_e.operations_task_id is not null then
    update public.operations_tasks
    set status = 'completed',
        claimed_by = coalesce(claimed_by, v_uid),
        claimed_at = coalesce(claimed_at, now()),
        started_at = coalesce(started_at, now()),
        completed_by = v_uid,
        completed_at = now(),
        metadata = metadata || jsonb_build_object(
          'decision', v_dec,
          'resolution_note', nullif(trim(coalesce(p_note,'')),''),
          'attendance_session_id', v_session_id,
          'verification_photo_cleanup_required', v_e.verification_photo_path is not null
        ),
        updated_at = now()
    where id = v_e.operations_task_id
      and status in ('open','claimed','in_progress','failed');
  end if;

  insert into private.hr_audit_log(
    entity_type, entity_id, action, actor_user_id, branch_id, after_data
  )
  values(
    'attendance_exception',
    v_e.id,
    v_dec,
    v_uid,
    v_e.branch_id,
    jsonb_build_object(
      'note', nullif(trim(coalesce(p_note,'')),''),
      'attendance_session_id', v_session_id,
      'phone_verified_at', v_e.phone_verified_at,
      'phone_verification_method', v_e.phone_verification_method,
      'photo_sha256', v_e.verification_photo_sha256
    )
  );

  return jsonb_build_object(
    'ok', true,
    'code', case when v_dec='approved' then 'EXCEPTION_APPROVED' else 'EXCEPTION_REJECTED' end,
    'exception_id', v_e.id,
    'decision', v_dec,
    'attendance_session_id', v_session_id,
    'verification_photo_path', v_e.verification_photo_path,
    'photo_cleanup_required', v_e.verification_photo_path is not null and v_e.verification_photo_deleted_at is null
  );
end
$function$;

grant execute on function public.get_attendance_exception_v1(uuid) to authenticated;
grant execute on function public.decide_attendance_exception_v1(uuid, text, text) to authenticated;
revoke execute on function public.decide_attendance_exception_v1(uuid, text, text) from anon;
