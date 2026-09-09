-- HR Performance V1: branch/team metrics with schedule-aware attendance.
-- Absence is only a scheduled workday with no check-in and no approved full-day leave.
create or replace function public.get_hr_employee_performance_v1(p_branch_id uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or p_from is null or p_to is null or p_from>p_to then raise exception using errcode='22023',message='INVALID_RANGE'; end if;
  if (p_to-p_from)>366 then raise exception using errcode='22023',message='RANGE_TOO_LARGE'; end if;
  if not private.staff_is_super_admin(v_uid) and not public.staff_has_permission('hr.view',p_branch_id) and not public.staff_has_permission('branch.manage_staff',p_branch_id) then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  with employees as (
    select distinct u.id user_id,u.name,ep.employee_code,ep.work_mode,ep.employment_status,d.name_ar department_name,j.name_ar job_title_name
    from public.users u left join private.hr_employee_profiles ep on ep.user_id=u.id left join private.hr_departments d on d.id=ep.department_id left join private.hr_job_titles j on j.id=ep.job_title_id
    where coalesce(u.active,true) and u.role<>'super_admin' and coalesce(ep.employment_status,'active')<>'terminated'
      and (ep.primary_branch_id=p_branch_id or exists(select 1 from public.user_branch_roles ubr where ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active))
  ), scheduled_dates as (
    select distinct a.user_id,gs.day::date work_date
    from private.hr_employee_shift_assignments a
    cross join lateral generate_series(greatest(a.effective_from,p_from)::timestamp,least(coalesce(a.effective_to,p_to),p_to)::timestamp,interval '1 day') gs(day)
    where a.branch_id=p_branch_id and a.active and a.effective_from<=p_to and coalesce(a.effective_to,p_to)>=p_from and extract(dow from gs.day)::smallint=any(a.weekdays)
  ), attendance_dates as (
    select distinct s.user_id,s.work_date from private.hr_attendance_sessions s where s.branch_id=p_branch_id and s.work_date between p_from and p_to and s.check_in_at is not null
  ), full_leave_dates as (
    select distinct l.employee_id user_id,gs.day::date work_date
    from private.hr_leave_periods l
    cross join lateral generate_series(greatest(l.start_date,p_from)::timestamp,least(l.end_date,p_to)::timestamp,interval '1 day') gs(day)
    where l.branch_id=p_branch_id and l.status='approved' and coalesce(l.partial_day,'none')='none' and l.end_date>=p_from and l.start_date<=p_to
  ), schedule_stats as (
    select e.user_id,count(sd.work_date)::int scheduled_days,
      count(sd.work_date) filter(where fld.work_date is not null)::int approved_leave_days,
      count(sd.work_date) filter(where ad.work_date is not null and fld.work_date is null)::int attended_scheduled_days,
      count(sd.work_date) filter(where ad.work_date is null and fld.work_date is null)::int absence_days
    from employees e left join scheduled_dates sd on sd.user_id=e.user_id left join attendance_dates ad on ad.user_id=e.user_id and ad.work_date=sd.work_date left join full_leave_dates fld on fld.user_id=e.user_id and fld.work_date=sd.work_date group by e.user_id
  ), att as (
    select a.user_id,count(distinct a.work_date)::int attendance_days,count(*) filter(where coalesce(a.late_minutes,0)>0)::int late_days,coalesce(sum(a.late_minutes),0)::int late_minutes,
      count(*) filter(where coalesce(a.early_departure_minutes,0)>0)::int early_departure_days,coalesce(sum(a.early_departure_minutes),0)::int early_departure_minutes,coalesce(sum(a.worked_minutes),0)::int worked_minutes,
      count(*) filter(where a.attendance_mode='remote')::int remote_sessions,count(*) filter(where a.attendance_mode='onsite')::int onsite_sessions
    from private.hr_attendance_sessions a where a.branch_id=p_branch_id and a.work_date between p_from and p_to group by a.user_id
  ), task_stats as (
    select coalesce(t.completed_by,t.claimed_by) user_id,count(*) filter(where t.status='completed')::int completed_tasks,count(*) filter(where t.status='failed')::int failed_tasks,
      count(*) filter(where t.status in ('open','claimed','in_progress','failed') and t.due_at is not null and t.due_at<now())::int overdue_open_tasks,
      count(*) filter(where t.status='completed' and t.due_at is not null and t.completed_at<=t.due_at)::int completed_on_time,
      count(*) filter(where t.status='completed' and t.due_at is not null and t.completed_at>t.due_at)::int completed_late,
      count(*) filter(where t.status='completed' and t.task_type in ('inventory_daily_count','inventory_variance_recount'))::int inventory_tasks_completed,
      round(coalesce(avg(extract(epoch from (t.completed_at-coalesce(t.started_at,t.claimed_at,t.created_at)))/60.0) filter(where t.status='completed' and t.completed_at is not null),0)::numeric,1) avg_task_minutes
    from public.operations_tasks t where t.branch_id=p_branch_id and t.created_at<(p_to+1)::timestamp and coalesce(t.completed_at,t.updated_at,t.created_at)>=p_from::timestamp and coalesce(t.completed_by,t.claimed_by) is not null group by coalesce(t.completed_by,t.claimed_by)
  ), rows as (
    select e.*,coalesce(a.attendance_days,0) attendance_days,coalesce(ss.scheduled_days,0) scheduled_days,coalesce(ss.approved_leave_days,0) approved_leave_days,
      coalesce(ss.attended_scheduled_days,0) attended_scheduled_days,coalesce(ss.absence_days,0) absence_days,
      case when coalesce(ss.scheduled_days,0)-coalesce(ss.approved_leave_days,0)>0 then round(100.0*coalesce(ss.attended_scheduled_days,0)/(ss.scheduled_days-ss.approved_leave_days),1) else null end attendance_rate,
      coalesce(a.late_days,0) late_days,coalesce(a.late_minutes,0) late_minutes,coalesce(a.early_departure_days,0) early_departure_days,coalesce(a.early_departure_minutes,0) early_departure_minutes,
      coalesce(a.worked_minutes,0) worked_minutes,round(coalesce(a.worked_minutes,0)/60.0,2) worked_hours,coalesce(a.onsite_sessions,0) onsite_sessions,coalesce(a.remote_sessions,0) remote_sessions,
      coalesce(ts.completed_tasks,0) completed_tasks,coalesce(ts.failed_tasks,0) failed_tasks,coalesce(ts.overdue_open_tasks,0) overdue_open_tasks,coalesce(ts.completed_on_time,0) completed_on_time,coalesce(ts.completed_late,0) completed_late,
      case when coalesce(ts.completed_on_time,0)+coalesce(ts.completed_late,0)>0 then round(100.0*coalesce(ts.completed_on_time,0)/(coalesce(ts.completed_on_time,0)+coalesce(ts.completed_late,0)),1) else null end sla_on_time_pct,
      coalesce(ts.inventory_tasks_completed,0) inventory_tasks_completed,coalesce(ts.avg_task_minutes,0) avg_task_minutes
    from employees e left join schedule_stats ss on ss.user_id=e.user_id left join att a on a.user_id=e.user_id left join task_stats ts on ts.user_id=e.user_id
  )
  select jsonb_build_object('from',p_from,'to',p_to,'branch_id',p_branch_id,
    'summary',jsonb_build_object('employees',count(*),'employees_with_schedule',count(*) filter(where scheduled_days>0),'attendance_days',coalesce(sum(attendance_days),0),'scheduled_days',coalesce(sum(scheduled_days),0),'approved_leave_days',coalesce(sum(approved_leave_days),0),'absence_days',coalesce(sum(absence_days),0),
      'attendance_rate',case when coalesce(sum(scheduled_days-approved_leave_days),0)>0 then round(100.0*sum(attended_scheduled_days)/sum(scheduled_days-approved_leave_days),1) else null end,'worked_hours',round(coalesce(sum(worked_minutes),0)/60.0,2),'late_minutes',coalesce(sum(late_minutes),0),'completed_tasks',coalesce(sum(completed_tasks),0),'overdue_open_tasks',coalesce(sum(overdue_open_tasks),0),'inventory_tasks_completed',coalesce(sum(inventory_tasks_completed),0)),
    'employees_data',coalesce(jsonb_agg(to_jsonb(rows) order by absence_days desc,overdue_open_tasks desc,late_minutes desc,name),'[]'::jsonb)) into v_result from rows;
  return v_result;
end;$$;
revoke all on function public.get_hr_employee_performance_v1(uuid,date,date) from public,anon;
grant execute on function public.get_hr_employee_performance_v1(uuid,date,date) to authenticated;
