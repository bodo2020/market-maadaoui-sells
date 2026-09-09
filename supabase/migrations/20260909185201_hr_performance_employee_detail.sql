-- HR Performance V1: explainable employee detail metrics.
create or replace function public.get_hr_employee_performance_detail_v1(p_employee_id uuid,p_branch_id uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_is_super boolean; v_is_self boolean:=auth.uid()=p_employee_id; v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_employee_id is null or p_branch_id is null then raise exception 'employee_and_branch_required'; end if;
  if p_from is null or p_to is null or p_from>p_to then raise exception 'invalid_date_range'; end if;
  if (p_to-p_from)>366 then raise exception 'date_range_too_large'; end if;
  v_is_super:=private.staff_is_super_admin(v_uid);
  if not v_is_self and not v_is_super and not (public.staff_has_permission('hr.view',p_branch_id) or public.staff_has_permission('branch.manage_staff',p_branch_id)) then raise exception 'permission_denied'; end if;
  if not v_is_super and not exists(select 1 from public.user_branch_roles ubr where ubr.user_id=p_employee_id and ubr.branch_id=p_branch_id and ubr.active) then raise exception 'employee_out_of_scope'; end if;

  with scheduled_dates as (
    select distinct gs.day::date work_date from private.hr_employee_shift_assignments a
    cross join lateral generate_series(greatest(a.effective_from,p_from)::timestamp,least(coalesce(a.effective_to,p_to),p_to)::timestamp,interval '1 day') gs(day)
    where a.user_id=p_employee_id and a.branch_id=p_branch_id and a.active and a.effective_from<=p_to and coalesce(a.effective_to,p_to)>=p_from and extract(dow from gs.day)::smallint=any(a.weekdays)
  ), attendance_dates as (
    select distinct s.work_date from private.hr_attendance_sessions s where s.user_id=p_employee_id and s.branch_id=p_branch_id and s.work_date between p_from and p_to and s.check_in_at is not null
  ), full_leave_dates as (
    select distinct gs.day::date work_date from private.hr_leave_periods l
    cross join lateral generate_series(greatest(l.start_date,p_from)::timestamp,least(l.end_date,p_to)::timestamp,interval '1 day') gs(day)
    where l.employee_id=p_employee_id and l.branch_id=p_branch_id and l.status='approved' and coalesce(l.partial_day,'none')='none' and l.end_date>=p_from and l.start_date<=p_to
  ), schedule_stats as (
    select count(sd.work_date)::int scheduled_days,count(sd.work_date) filter(where fld.work_date is not null)::int approved_leave_days,
      count(sd.work_date) filter(where ad.work_date is not null and fld.work_date is null)::int attended_scheduled_days,
      count(sd.work_date) filter(where ad.work_date is null and fld.work_date is null)::int absence_days
    from scheduled_dates sd left join attendance_dates ad on ad.work_date=sd.work_date left join full_leave_dates fld on fld.work_date=sd.work_date
  ), attendance as (
    select count(*)::int sessions,count(*) filter(where check_in_at is not null)::int checkins,count(*) filter(where check_out_at is not null)::int completed_sessions,
      coalesce(sum(worked_minutes),0)::int worked_minutes,count(*) filter(where coalesce(late_minutes,0)>0)::int late_sessions,coalesce(sum(late_minutes),0)::int late_minutes,
      count(*) filter(where coalesce(early_departure_minutes,0)>0)::int early_departure_sessions,coalesce(sum(early_departure_minutes),0)::int early_departure_minutes,
      count(*) filter(where coalesce(late_minutes,0)=0)::int on_time_sessions
    from private.hr_attendance_sessions s where s.user_id=p_employee_id and s.branch_id=p_branch_id and s.work_date between p_from and p_to
  ), task_stats as (
    select count(*) filter(where status<>'cancelled')::int assigned_tasks,count(*) filter(where status='completed')::int completed_tasks,
      count(*) filter(where status in ('open','claimed','in_progress','failed') and due_at is not null and due_at<now())::int overdue_open_tasks,
      count(*) filter(where status='completed' and due_at is not null)::int sla_measured_completed,
      count(*) filter(where status='completed' and due_at is not null and completed_at<=due_at)::int sla_met_tasks,
      count(*) filter(where status='completed' and due_at is not null and completed_at>due_at)::int completed_late_tasks,
      round(coalesce(avg(extract(epoch from (completed_at-coalesce(started_at,claimed_at,created_at)))/60.0) filter(where status='completed' and completed_at is not null),0)::numeric,1) avg_task_minutes
    from public.operations_tasks t where t.branch_id=p_branch_id and (t.claimed_by=p_employee_id or t.completed_by=p_employee_id) and t.created_at>=p_from::timestamptz and t.created_at<(p_to+1)::timestamptz
  ), inventory_stats as (
    select count(*) filter(where status='completed' and source_kind='inventory_count')::int counts_completed,
      count(*) filter(where status='completed' and source_kind='inventory_count' and metadata->>'count_result'='matched')::int counts_matched,
      count(*) filter(where status='completed' and source_kind='inventory_count' and metadata->>'count_result'='discrepancy')::int counts_with_variance,
      count(*) filter(where status='completed' and source_kind='inventory_recount')::int recounts_completed
    from public.operations_tasks t where t.branch_id=p_branch_id and (t.claimed_by=p_employee_id or t.completed_by=p_employee_id) and t.created_at>=p_from::timestamptz and t.created_at<(p_to+1)::timestamptz
  )
  select jsonb_build_object(
    'employee',jsonb_build_object('id',u.id,'name',u.name,'employee_code',ep.employee_code,'department_name',d.name_ar,'team_name',tm.name_ar,'job_title_name',jt.name_ar,'work_mode',ep.work_mode),
    'period',jsonb_build_object('from',p_from,'to',p_to,'days',(p_to-p_from+1)),
    'attendance',jsonb_build_object('sessions',a.sessions,'checkins',a.checkins,'completed_sessions',a.completed_sessions,'worked_minutes',a.worked_minutes,
      'scheduled_days',ss.scheduled_days,'approved_leave_days',ss.approved_leave_days,'attended_scheduled_days',ss.attended_scheduled_days,'absence_days',ss.absence_days,
      'attendance_rate',case when ss.scheduled_days-ss.approved_leave_days>0 then round(100.0*ss.attended_scheduled_days/(ss.scheduled_days-ss.approved_leave_days),1) else null end,
      'late_sessions',a.late_sessions,'late_minutes',a.late_minutes,'early_departure_sessions',a.early_departure_sessions,'early_departure_minutes',a.early_departure_minutes,
      'on_time_sessions',a.on_time_sessions,'punctuality_rate',case when a.sessions=0 then null else round((a.on_time_sessions::numeric/a.sessions::numeric)*100,1) end),
    'tasks',jsonb_build_object('assigned',ts.assigned_tasks,'completed',ts.completed_tasks,'completion_rate',case when ts.assigned_tasks=0 then null else round((ts.completed_tasks::numeric/ts.assigned_tasks::numeric)*100,1) end,
      'overdue_open',ts.overdue_open_tasks,'sla_measured_completed',ts.sla_measured_completed,'sla_met',ts.sla_met_tasks,'completed_late',ts.completed_late_tasks,
      'sla_rate',case when ts.sla_measured_completed=0 then null else round((ts.sla_met_tasks::numeric/ts.sla_measured_completed::numeric)*100,1) end,'avg_completion_minutes',ts.avg_task_minutes),
    'inventory',jsonb_build_object('counts_completed',inv.counts_completed,'matched',inv.counts_matched,'with_variance',inv.counts_with_variance,'recounts_completed',inv.recounts_completed,
      'count_accuracy_rate',case when inv.counts_completed=0 then null else round((inv.counts_matched::numeric/inv.counts_completed::numeric)*100,1) end),
    'notes',jsonb_build_array('الغياب يحسب فقط من أيام الورديات المسندة فعليًا، وبعد استبعاد الإجازات الكاملة المعتمدة.','إذا لم توجد ورديات مسندة خلال الفترة فلن يعرض النظام نسبة حضور أو غيابًا افتراضيًا.','مؤشر دقة الجرد يعني تطابق العد مع الرصيد المتوقع، وليس تقييمًا شخصيًا للموظف.')) into v_result
  from public.users u left join private.hr_employee_profiles ep on ep.user_id=u.id left join private.hr_departments d on d.id=ep.department_id left join private.hr_teams tm on tm.id=ep.team_id left join private.hr_job_titles jt on jt.id=ep.job_title_id
  cross join schedule_stats ss cross join attendance a cross join task_stats ts cross join inventory_stats inv where u.id=p_employee_id;
  if v_result is null then raise exception 'employee_not_found'; end if;
  return v_result;
end;$$;
revoke all on function public.get_hr_employee_performance_detail_v1(uuid,uuid,date,date) from public,anon;
grant execute on function public.get_hr_employee_performance_detail_v1(uuid,uuid,date,date) to authenticated;
