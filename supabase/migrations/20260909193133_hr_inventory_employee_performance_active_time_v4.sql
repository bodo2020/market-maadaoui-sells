create or replace function public.get_hr_inventory_performance_v1(
  p_employee_id uuid,
  p_branch_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_self boolean := auth.uid() = p_employee_id;
  v_is_super boolean;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_employee_id is null or p_branch_id is null then raise exception 'employee_and_branch_required'; end if;
  if p_from is null or p_to is null or p_from > p_to then raise exception 'invalid_date_range'; end if;
  if (p_to - p_from) > 366 then raise exception 'date_range_too_large'; end if;

  v_is_super := private.staff_is_super_admin(v_uid);
  if not v_is_self
     and not v_is_super
     and not public.staff_has_permission('hr.view', p_branch_id)
     and not public.staff_has_permission('branch.manage_staff', p_branch_id) then
    raise exception 'permission_denied';
  end if;

  if not v_is_super
     and not exists (
       select 1 from public.user_branch_roles ubr
       where ubr.user_id = p_employee_id and ubr.branch_id = p_branch_id and ubr.active
     ) then
    raise exception 'employee_out_of_scope';
  end if;

  with count_rows as (
    select c.*, t.started_at, t.completed_at, t.due_at, t.status as task_status
    from private.inventory_audit_counts_v2 c
    left join public.operations_tasks t on t.id = c.task_id
    where c.assigned_to = p_employee_id
      and c.branch_id = p_branch_id
      and c.audit_date between p_from and p_to
      and c.status <> 'cancelled'
  ), count_stats as (
    select
      count(*)::int assigned,
      count(*) filter (where submitted_at is not null)::int submitted,
      count(*) filter (where submitted_at is not null and abs(coalesce(variance,0)) <= 0.001)::int matched,
      count(*) filter (where submitted_at is not null and abs(coalesce(variance,0)) > 0.001)::int discrepancy,
      coalesce(sum(abs(variance)) filter (where submitted_at is not null), 0)::numeric abs_variance_units,
      coalesce(sum(abs(variance_value)) filter (where submitted_at is not null), 0)::numeric abs_variance_value,
      round(avg(extract(epoch from (coalesce(completed_at, submitted_at) - started_at)) / 60.0) filter (where submitted_at is not null and started_at is not null)::numeric, 1) avg_active_minutes,
      count(*) filter (where submitted_at is not null and due_at is not null and coalesce(completed_at, submitted_at) <= due_at)::int completed_on_time,
      count(*) filter (where submitted_at is null and due_at is not null and due_at < now() and coalesce(task_status, 'open') not in ('completed','cancelled'))::int overdue_open
    from count_rows
  ), recount_rows as (
    select r.*, t.started_at, t.completed_at, t.due_at, t.status as task_status
    from private.inventory_audit_recounts_v2 r
    left join public.operations_tasks t on t.id = r.task_id
    where r.assigned_to = p_employee_id
      and r.branch_id = p_branch_id
      and r.assigned_at::date between p_from and p_to
      and r.status <> 'cancelled'
  ), recount_stats as (
    select
      count(*)::int assigned,
      count(*) filter (where submitted_at is not null)::int submitted,
      count(*) filter (where status = 'matched_system')::int matched_system,
      count(*) filter (where status = 'confirmed_variance')::int confirmed_variance,
      count(*) filter (where status = 'conflicting')::int conflicting,
      coalesce(sum(abs(variance)) filter (where submitted_at is not null), 0)::numeric abs_variance_units,
      coalesce(sum(abs(variance_value)) filter (where submitted_at is not null), 0)::numeric abs_variance_value,
      round(avg(extract(epoch from (coalesce(completed_at, submitted_at) - started_at)) / 60.0) filter (where submitted_at is not null and started_at is not null)::numeric, 1) avg_active_minutes,
      count(*) filter (where submitted_at is null and due_at is not null and due_at < now() and coalesce(task_status, 'open') not in ('completed','cancelled'))::int overdue_open
    from recount_rows
  ), peer_review as (
    select
      count(*) filter (where r.submitted_at is not null)::int reviewed,
      count(*) filter (where r.submitted_at is not null and r.actual_count is not distinct from c.actual_count)::int confirmed,
      count(*) filter (where r.submitted_at is not null and r.actual_count is distinct from c.actual_count)::int disagreed
    from private.inventory_audit_counts_v2 c
    left join private.inventory_audit_recounts_v2 r
      on r.original_count_id = c.id and r.status <> 'cancelled'
    where c.assigned_to = p_employee_id
      and c.branch_id = p_branch_id
      and c.audit_date between p_from and p_to
      and c.submitted_at is not null
      and abs(coalesce(c.variance,0)) > 0.001
      and c.status <> 'cancelled'
  )
  select jsonb_build_object(
    'employee', jsonb_build_object('id', u.id, 'name', u.name, 'role', u.role, 'employee_code', ep.employee_code, 'department_name', d.name_ar, 'job_title_name', jt.name_ar),
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'applicable', (cs.assigned + rs.assigned) > 0,
    'counts', jsonb_build_object(
      'assigned', cs.assigned,
      'submitted', cs.submitted,
      'completion_rate', case when cs.assigned = 0 then null else round(100.0 * cs.submitted / cs.assigned, 1) end,
      'matched', cs.matched,
      'discrepancy', cs.discrepancy,
      'match_rate', case when cs.submitted = 0 then null else round(100.0 * cs.matched / cs.submitted, 1) end,
      'abs_variance_units', round(cs.abs_variance_units, 3),
      'abs_variance_value', round(cs.abs_variance_value, 2),
      'avg_active_minutes', cs.avg_active_minutes,
      'completed_on_time', cs.completed_on_time,
      'overdue_open', cs.overdue_open
    ),
    'recounts', jsonb_build_object(
      'assigned', rs.assigned,
      'submitted', rs.submitted,
      'completion_rate', case when rs.assigned = 0 then null else round(100.0 * rs.submitted / rs.assigned, 1) end,
      'matched_system', rs.matched_system,
      'confirmed_variance', rs.confirmed_variance,
      'conflicting', rs.conflicting,
      'abs_variance_units', round(rs.abs_variance_units, 3),
      'abs_variance_value', round(rs.abs_variance_value, 2),
      'avg_active_minutes', rs.avg_active_minutes,
      'overdue_open', rs.overdue_open
    ),
    'peer_review', jsonb_build_object(
      'reviewed', pr.reviewed,
      'confirmed', pr.confirmed,
      'disagreed', pr.disagreed,
      'confirmation_rate', case when pr.reviewed = 0 then null else round(100.0 * pr.confirmed / pr.reviewed, 1) end
    ),
    'notes', jsonb_build_array(
      'نتيجة العد الأول محفوظة من قيمة variance حتى لو تغير status لاحقًا بسبب Peer Recount أو مراجعة التسوية.',
      'متوسط زمن التنفيذ لا يحسب إلا للمهام التي لها started_at فعلي؛ وقت الانتظار قبل بدء المهمة لا يدخل في المؤشر.',
      'اكتشاف فرق في الجرد لا يعد خطأ أداء تلقائيًا؛ قد يكون نتيجة مراجعة دقيقة كشفت فرقًا حقيقيًا في المخزون.',
      'حالات إعادة العد هي: مطابق للنظام، تأكيد الفرق، أو تعارض مع العد الأول.'
    )
  ) into v_result
  from public.users u
  left join private.hr_employee_profiles ep on ep.user_id = u.id
  left join private.hr_departments d on d.id = ep.department_id
  left join private.hr_job_titles jt on jt.id = ep.job_title_id
  cross join count_stats cs
  cross join recount_stats rs
  cross join peer_review pr
  where u.id = p_employee_id;

  if v_result is null then raise exception 'employee_not_found'; end if;
  return v_result;
end;
$function$;

revoke all on function public.get_hr_inventory_performance_v1(uuid,uuid,date,date) from public;
revoke all on function public.get_hr_inventory_performance_v1(uuid,uuid,date,date) from anon;
grant execute on function public.get_hr_inventory_performance_v1(uuid,uuid,date,date) to authenticated, service_role;
