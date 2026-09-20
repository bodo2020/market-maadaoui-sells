create or replace function public.get_reporting_staff_coverage_v1(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_summary jsonb := '{}'::jsonb;
  v_hourly jsonb := '[]'::jsonb;
  v_can_attendance boolean := false;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;
  if p_branch_id is null then
    raise exception using errcode='22023', message='BRANCH_REQUIRED';
  end if;
  if not public.has_branch_access(auth.uid(), p_branch_id) then
    raise exception using errcode='42501', message='BRANCH_ACCESS_DENIED';
  end if;
  if not public.staff_has_permission('reports.view', p_branch_id) then
    raise exception using errcode='42501', message='REPORTS_VIEW_DENIED';
  end if;

  v_can_attendance := public.staff_has_permission('hr.attendance.view', p_branch_id)
    or public.staff_has_permission('hr.reports.view', p_branch_id);
  if not v_can_attendance then
    raise exception using errcode='42501', message='HR_ATTENDANCE_VIEW_DENIED';
  end if;

  if p_from is null or p_to is null or p_to <= p_from then
    raise exception using errcode='22023', message='INVALID_REPORT_RANGE';
  end if;
  if p_to - p_from > interval '366 days' then
    raise exception using errcode='22023', message='REPORT_RANGE_TOO_LARGE';
  end if;

  with sessions as (
    select
      s.id,
      s.user_id,
      s.status,
      greatest(s.check_in_at, p_from) as effective_start,
      least(
        case
          when s.check_out_at is not null then s.check_out_at
          when s.status = 'active' then now()
          else s.check_in_at
        end,
        p_to
      ) as effective_end,
      s.check_out_at
    from private.hr_attendance_sessions s
    where s.branch_id = p_branch_id
      and s.work_date >= ((p_from at time zone 'Africa/Cairo')::date - 1)
      and s.work_date <= ((p_to at time zone 'Africa/Cairo')::date + 1)
      and s.check_in_at < p_to
      and (
        s.check_out_at > p_from
        or (s.check_out_at is null and s.status = 'active' and now() > p_from)
      )
  )
  select jsonb_build_object(
    'sessions', count(*)::bigint,
    'employees', count(distinct user_id)::bigint,
    'closed_sessions', count(*) filter (where check_out_at is not null)::bigint,
    'active_sessions', count(*) filter (where check_out_at is null and status = 'active')::bigint,
    'staff_hours', round(coalesce(sum(extract(epoch from greatest(effective_end - effective_start, interval '0')) / 3600.0), 0)::numeric, 2)
  )
  into v_summary
  from sessions
  where effective_end > effective_start;

  with buckets as (
    select gs as bucket_start, gs + interval '1 hour' as bucket_end
    from generate_series(
      date_trunc('hour', p_from),
      date_trunc('hour', p_to - interval '1 microsecond'),
      interval '1 hour'
    ) gs
  ),
  sessions as (
    select
      s.user_id,
      greatest(s.check_in_at, p_from) as effective_start,
      least(
        case
          when s.check_out_at is not null then s.check_out_at
          when s.status = 'active' then now()
          else s.check_in_at
        end,
        p_to
      ) as effective_end
    from private.hr_attendance_sessions s
    where s.branch_id = p_branch_id
      and s.work_date >= ((p_from at time zone 'Africa/Cairo')::date - 1)
      and s.work_date <= ((p_to at time zone 'Africa/Cairo')::date + 1)
      and s.check_in_at < p_to
      and (
        s.check_out_at > p_from
        or (s.check_out_at is null and s.status = 'active' and now() > p_from)
      )
  ),
  bucket_counts as (
    select
      b.bucket_start,
      extract(hour from timezone('Africa/Cairo', b.bucket_start))::int as hour_of_day,
      count(distinct s.user_id)::int as active_staff
    from buckets b
    left join sessions s
      on s.effective_start < b.bucket_end
      and s.effective_end > b.bucket_start
      and s.effective_end > s.effective_start
    group by b.bucket_start
  ),
  hourly as (
    select
      hour_of_day,
      round(avg(active_staff)::numeric, 2) as avg_staff,
      max(active_staff)::int as max_staff,
      sum(active_staff)::bigint as staff_hour_units,
      count(*)::int as samples
    from bucket_counts
    group by hour_of_day
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'hour', h.hour,
        'avg_staff', coalesce(x.avg_staff, 0),
        'max_staff', coalesce(x.max_staff, 0),
        'staff_hour_units', coalesce(x.staff_hour_units, 0),
        'samples', coalesce(x.samples, 0)
      ) order by h.hour
    ),
    '[]'::jsonb
  )
  into v_hourly
  from generate_series(0, 23) h(hour)
  left join hourly x on x.hour_of_day = h.hour;

  return jsonb_build_object(
    'version', 1,
    'branch_id', p_branch_id,
    'from', p_from,
    'to', p_to,
    'summary', coalesce(v_summary, '{}'::jsonb),
    'hourly', coalesce(v_hourly, '[]'::jsonb),
    'data_quality', jsonb_build_object(
      'timezone', 'Africa/Cairo',
      'identity_exposed', false,
      'coverage_source', 'private.hr_attendance_sessions',
      'open_active_sessions_count_until', 'now()',
      'non_active_sessions_without_checkout_excluded', true,
      'required_permissions', jsonb_build_array('reports.view', 'hr.attendance.view OR hr.reports.view')
    )
  );
end;
$function$;

revoke all on function public.get_reporting_staff_coverage_v1(uuid, timestamptz, timestamptz) from public;
revoke all on function public.get_reporting_staff_coverage_v1(uuid, timestamptz, timestamptz) from anon;
grant execute on function public.get_reporting_staff_coverage_v1(uuid, timestamptz, timestamptz) to authenticated;
