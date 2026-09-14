-- Attendance exception decisions with mandatory server-side photo erasure.
-- A decision is never finalized while the verification image still exists.

alter table private.hr_attendance_exceptions
  add column if not exists decision_intent text,
  add column if not exists decision_note_pending text,
  add column if not exists decision_started_by uuid references public.users(id),
  add column if not exists decision_started_at timestamptz;

create or replace function public.prepare_attendance_exception_decision_v2(
  p_exception_id uuid,
  p_decision text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_e private.hr_attendance_exceptions%rowtype;
  v_dec text := lower(trim(coalesce(p_decision,'')));
  v_note text := nullif(trim(coalesce(p_note,'')),'');
begin
  if v_uid is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;
  if v_dec not in ('approved','rejected') then
    raise exception using errcode='22023', message='INVALID_DECISION';
  end if;
  if char_length(coalesce(v_note,'')) < 3 then
    raise exception using errcode='22023', message='DECISION_NOTE_REQUIRED';
  end if;

  select * into v_e
  from private.hr_attendance_exceptions
  where id=p_exception_id
  for update;

  if v_e.id is null then
    raise exception using errcode='22023', message='EXCEPTION_NOT_FOUND';
  end if;
  if v_uid=v_e.user_id then
    raise exception using errcode='42501', message='SELF_APPROVAL_DENIED';
  end if;
  if not private.staff_is_super_admin(v_uid)
     and not (
       (public.staff_has_permission('hr.attendance.approve',v_e.branch_id)
        or public.staff_has_permission('branch.manage_staff',v_e.branch_id))
       and private.hr_employee_in_scope_v1(v_uid,v_e.user_id,v_e.branch_id)
     ) then
    raise exception using errcode='42501', message='PERMISSION_DENIED';
  end if;

  if v_e.status in ('approved','rejected') then
    return jsonb_build_object(
      'ok',true,'code','EXCEPTION_ALREADY_DECIDED','finalized',true,
      'exception_id',v_e.id,'decision',v_e.status,'photo_path',null
    );
  end if;
  if v_e.status <> 'pending' then
    raise exception using errcode='22023', message='INVALID_EXCEPTION_STATE';
  end if;

  if v_e.decision_started_by is not null
     and v_e.decision_started_by <> v_uid
     and coalesce(v_e.decision_started_at,'epoch'::timestamptz) > now()-interval '5 minutes' then
    return jsonb_build_object('ok',false,'code','DECISION_IN_PROGRESS');
  end if;

  if v_dec='approved'
     and exists(
       select 1 from private.hr_attendance_sessions
       where user_id=v_e.user_id and status='active'
     ) then
    return jsonb_build_object('ok',false,'code','EMPLOYEE_ALREADY_ACTIVE');
  end if;

  update private.hr_attendance_exceptions
  set decision_intent=v_dec,
      decision_note_pending=v_note,
      decision_started_by=v_uid,
      decision_started_at=now(),
      updated_at=now()
  where id=v_e.id;

  return jsonb_build_object(
    'ok',true,'code','DECISION_PREPARED','finalized',false,
    'exception_id',v_e.id,'decision',v_dec,
    'photo_bucket','hr_attendance_verification',
    'photo_path',v_e.verification_photo_path
  );
end
$$;

create or replace function public.finalize_attendance_exception_decision_v2(
  p_exception_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_e private.hr_attendance_exceptions%rowtype;
  v_profile private.hr_employee_profiles%rowtype;
  v_schedule jsonb;
  v_session_id uuid;
  v_late integer := 0;
  v_sched_start timestamptz;
  v_sched_end timestamptz;
  v_dec text;
  v_note text;
begin
  if v_uid is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;

  select * into v_e
  from private.hr_attendance_exceptions
  where id=p_exception_id
  for update;

  if v_e.id is null then
    raise exception using errcode='22023', message='EXCEPTION_NOT_FOUND';
  end if;
  if v_e.status in ('approved','rejected') then
    return jsonb_build_object(
      'ok',true,'code','EXCEPTION_ALREADY_DECIDED',
      'exception_id',v_e.id,'decision',v_e.status,
      'attendance_session_id',v_e.attendance_session_id,
      'photo_deleted',v_e.verification_photo_path is null
    );
  end if;
  if v_e.status <> 'pending'
     or v_e.decision_intent not in ('approved','rejected')
     or v_e.decision_started_by is distinct from v_uid then
    raise exception using errcode='22023', message='DECISION_NOT_PREPARED';
  end if;
  if v_uid=v_e.user_id then
    raise exception using errcode='42501', message='SELF_APPROVAL_DENIED';
  end if;
  if not private.staff_is_super_admin(v_uid)
     and not (
       (public.staff_has_permission('hr.attendance.approve',v_e.branch_id)
        or public.staff_has_permission('branch.manage_staff',v_e.branch_id))
       and private.hr_employee_in_scope_v1(v_uid,v_e.user_id,v_e.branch_id)
     ) then
    raise exception using errcode='42501', message='PERMISSION_DENIED';
  end if;

  -- The authoritative privacy guard: finalization is impossible while the object exists.
  if v_e.verification_photo_path is not null
     and exists(
       select 1 from storage.objects
       where bucket_id='hr_attendance_verification'
         and name=v_e.verification_photo_path
     ) then
    return jsonb_build_object('ok',false,'code','PHOTO_STILL_EXISTS');
  end if;

  v_dec := v_e.decision_intent;
  v_note := v_e.decision_note_pending;

  if v_dec='approved' then
    if exists(
      select 1 from private.hr_attendance_sessions
      where user_id=v_e.user_id and status='active'
    ) then
      return jsonb_build_object('ok',false,'code','EMPLOYEE_ALREADY_ACTIVE');
    end if;

    select * into v_profile
    from private.hr_employee_profiles
    where user_id=v_e.user_id;

    v_schedule:=private.hr_get_schedule_v1(v_e.user_id,v_e.branch_id,v_e.requested_at);
    if v_schedule is not null then
      v_sched_start:=(v_schedule->>'scheduled_start_at')::timestamptz;
      v_sched_end:=(v_schedule->>'scheduled_end_at')::timestamptz;
      v_late:=greatest(
        0,
        floor(extract(epoch from (
          v_e.requested_at-(v_sched_start+make_interval(mins=>(v_schedule->>'late_grace_minutes')::int))
        ))/60)::int
      );
    end if;

    insert into private.hr_attendance_sessions(
      user_id,branch_id,device_id,work_date,work_mode,attendance_mode,status,
      shift_template_id,scheduled_start_at,scheduled_end_at,check_in_at,
      check_in_latitude,check_in_longitude,check_in_accuracy_m,check_in_distance_m,
      check_in_location_status,late_minutes,metadata
    ) values(
      v_e.user_id,v_e.branch_id,v_e.device_id,
      timezone('Africa/Cairo',v_e.requested_at)::date,
      coalesce(v_profile.work_mode,'onsite'),v_e.attendance_mode,'active',
      case when v_schedule is null then null else (v_schedule->>'shift_template_id')::uuid end,
      v_sched_start,v_sched_end,v_e.requested_at,
      v_e.latitude,v_e.longitude,v_e.accuracy_m,v_e.distance_m,
      'approved_exception',v_late,
      jsonb_build_object(
        'attendance_exception_id',v_e.id,
        'approved_by',v_uid,
        'privacy_photo_deleted',true
      )
    ) returning id into v_session_id;
  end if;

  update private.hr_attendance_exceptions
  set status=v_dec,
      reviewer_user_id=v_uid,
      reviewed_at=now(),
      review_note=v_note,
      attendance_session_id=v_session_id,
      verification_photo_path=null,
      verification_photo_sha256=null,
      verification_photo_deleted_at=coalesce(verification_photo_deleted_at,now()),
      decision_intent=null,
      decision_note_pending=null,
      decision_started_by=null,
      decision_started_at=null,
      updated_at=now()
  where id=v_e.id;

  if v_e.operations_task_id is not null then
    update public.operations_tasks
    set status='completed',
        claimed_by=coalesce(claimed_by,v_uid),
        claimed_at=coalesce(claimed_at,now()),
        started_at=coalesce(started_at,now()),
        completed_by=v_uid,
        completed_at=now(),
        metadata=(metadata - 'verification_photo_path' - 'photo_sha256')
          || jsonb_build_object(
            'decision',v_dec,
            'resolution_note',v_note,
            'attendance_session_id',v_session_id,
            'verification_photo_deleted',true
          ),
        updated_at=now()
    where id=v_e.operations_task_id
      and status in ('open','claimed','in_progress','failed');
  end if;

  insert into private.hr_audit_log(
    entity_type,entity_id,action,actor_user_id,branch_id,after_data
  ) values(
    'attendance_exception',v_e.id,v_dec,v_uid,v_e.branch_id,
    jsonb_build_object(
      'note',v_note,
      'attendance_session_id',v_session_id,
      'verification_photo_deleted',true
    )
  );

  insert into private.notification_events_v2(
    audience,recipient_user_id,branch_id,event_key,category,severity,title,body,
    source_kind,source_id,action_url,action_label,requires_action,dedupe_key,
    eligible_channels,status,metadata
  ) values(
    'staff',v_e.user_id,v_e.branch_id,
    'attendance_exception_'||v_dec,'attendance',
    case when v_dec='approved' then 'normal' else 'high' end,
    case when v_dec='approved' then 'تم اعتماد الحضور' else 'تم رفض طلب الحضور' end,
    case when v_dec='approved'
      then 'تم تسجيل حضورك من وقت المحاولة الأصلية.'
      else 'راجع ملاحظة المسؤول في سجل الحضور.' end,
    'attendance_exception',v_e.id,'/attendance','عرض الحضور',false,
    'attendance_exception_decision:'||v_e.id::text,
    array['in_app','push'],'active',
    jsonb_build_object('decision',v_dec,'attendance_session_id',v_session_id)
  ) on conflict do nothing;

  return jsonb_build_object(
    'ok',true,
    'code',case when v_dec='approved' then 'EXCEPTION_APPROVED' else 'EXCEPTION_REJECTED' end,
    'exception_id',v_e.id,'decision',v_dec,
    'attendance_session_id',v_session_id,
    'photo_deleted',true
  );
end
$$;

-- Stale clients must not be able to bypass mandatory erasure.
revoke execute on function public.decide_attendance_exception_v1(uuid,text,text)
  from public, anon, authenticated;

revoke all on function public.prepare_attendance_exception_decision_v2(uuid,text,text) from public;
revoke all on function public.finalize_attendance_exception_decision_v2(uuid) from public;
grant execute on function public.prepare_attendance_exception_decision_v2(uuid,text,text) to authenticated;
grant execute on function public.finalize_attendance_exception_decision_v2(uuid) to authenticated;

comment on function public.prepare_attendance_exception_decision_v2(uuid,text,text)
  is 'Authorizes and records a decision intent without finalizing it or creating attendance.';
comment on function public.finalize_attendance_exception_decision_v2(uuid)
  is 'Finalizes only after the private verification image is absent from Storage; clears all photo references.';
