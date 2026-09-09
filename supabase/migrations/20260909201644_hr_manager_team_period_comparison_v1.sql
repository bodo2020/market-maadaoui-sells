create or replace function public.get_hr_manager_team_period_comparison_v1(
  p_branch_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_days integer;
  v_prev_to date;
  v_prev_from date;
  v_current_team jsonb;
  v_previous_team jsonb;
  v_current_ops jsonb;
  v_previous_ops jsonb;
  v_cur_sched numeric;
  v_prev_sched numeric;
  v_cur_inv_assigned numeric;
  v_prev_inv_assigned numeric;
  v_cur_follow_assigned numeric;
  v_prev_follow_assigned numeric;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_branch_id is null or p_from is null or p_to is null or p_from>p_to then raise exception 'invalid_date_range'; end if;
  v_days := (p_to-p_from)+1;
  if v_days>366 then raise exception 'date_range_too_large'; end if;
  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('hr.view',p_branch_id)
     and not public.staff_has_permission('branch.manage_staff',p_branch_id) then
    raise exception 'permission_denied';
  end if;

  v_prev_to := p_from-1;
  v_prev_from := v_prev_to-(v_days-1);

  v_current_team := public.get_hr_employee_performance_v1(p_branch_id,p_from,p_to);
  v_previous_team := public.get_hr_employee_performance_v1(p_branch_id,v_prev_from,v_prev_to);
  v_current_ops := public.get_hr_manager_team_operations_v1(p_branch_id,p_from,p_to);
  v_previous_ops := public.get_hr_manager_team_operations_v1(p_branch_id,v_prev_from,v_prev_to);

  v_cur_sched := coalesce((v_current_team#>>'{summary,scheduled_days}')::numeric,0);
  v_prev_sched := coalesce((v_previous_team#>>'{summary,scheduled_days}')::numeric,0);
  v_cur_inv_assigned := coalesce((v_current_ops#>>'{summary,inventory,counts_assigned}')::numeric,0);
  v_prev_inv_assigned := coalesce((v_previous_ops#>>'{summary,inventory,counts_assigned}')::numeric,0);
  v_cur_follow_assigned := coalesce((v_current_ops#>>'{summary,customer_service,assigned}')::numeric,0);
  v_prev_follow_assigned := coalesce((v_previous_ops#>>'{summary,customer_service,assigned}')::numeric,0);

  return jsonb_build_object(
    'branch_id',p_branch_id,
    'current_period',jsonb_build_object('from',p_from,'to',p_to,'days',v_days),
    'previous_period',jsonb_build_object('from',v_prev_from,'to',v_prev_to,'days',v_days),
    'current',jsonb_build_object(
      'employees',coalesce((v_current_team#>>'{summary,employees}')::numeric,0),
      'attendance_rate',case when v_current_team#>>'{summary,attendance_rate}' is null then null else (v_current_team#>>'{summary,attendance_rate}')::numeric end,
      'absence_days',coalesce((v_current_team#>>'{summary,absence_days}')::numeric,0),
      'late_minutes',coalesce((v_current_team#>>'{summary,late_minutes}')::numeric,0),
      'completed_tasks',coalesce((v_current_team#>>'{summary,completed_tasks}')::numeric,0),
      'overdue_open_tasks',coalesce((v_current_team#>>'{summary,overdue_open_tasks}')::numeric,0),
      'cash_variance',coalesce((v_current_ops#>>'{summary,cashier,cash_variance}')::numeric,0),
      'payment_variance',coalesce((v_current_ops#>>'{summary,cashier,payment_variance}')::numeric,0),
      'inventory_completion_rate',case when v_cur_inv_assigned>0 then round(100.0*coalesce((v_current_ops#>>'{summary,inventory,counts_submitted}')::numeric,0)/v_cur_inv_assigned,1) else null end,
      'delivery_delivered',coalesce((v_current_ops#>>'{summary,delivery,delivered}')::numeric,0),
      'online_handled_orders',coalesce((v_current_ops#>>'{summary,online,handled_orders}')::numeric,0),
      'followup_completion_rate',case when v_cur_follow_assigned>0 then round(100.0*coalesce((v_current_ops#>>'{summary,customer_service,closed}')::numeric,0)/v_cur_follow_assigned,1) else null end,
      'followups_overdue_open',coalesce((v_current_ops#>>'{summary,customer_service,overdue_open}')::numeric,0)
    ),
    'previous',jsonb_build_object(
      'employees',coalesce((v_previous_team#>>'{summary,employees}')::numeric,0),
      'attendance_rate',case when v_previous_team#>>'{summary,attendance_rate}' is null then null else (v_previous_team#>>'{summary,attendance_rate}')::numeric end,
      'absence_days',coalesce((v_previous_team#>>'{summary,absence_days}')::numeric,0),
      'late_minutes',coalesce((v_previous_team#>>'{summary,late_minutes}')::numeric,0),
      'completed_tasks',coalesce((v_previous_team#>>'{summary,completed_tasks}')::numeric,0),
      'overdue_open_tasks',coalesce((v_previous_team#>>'{summary,overdue_open_tasks}')::numeric,0),
      'cash_variance',coalesce((v_previous_ops#>>'{summary,cashier,cash_variance}')::numeric,0),
      'payment_variance',coalesce((v_previous_ops#>>'{summary,cashier,payment_variance}')::numeric,0),
      'inventory_completion_rate',case when v_prev_inv_assigned>0 then round(100.0*coalesce((v_previous_ops#>>'{summary,inventory,counts_submitted}')::numeric,0)/v_prev_inv_assigned,1) else null end,
      'delivery_delivered',coalesce((v_previous_ops#>>'{summary,delivery,delivered}')::numeric,0),
      'online_handled_orders',coalesce((v_previous_ops#>>'{summary,online,handled_orders}')::numeric,0),
      'followup_completion_rate',case when v_prev_follow_assigned>0 then round(100.0*coalesce((v_previous_ops#>>'{summary,customer_service,closed}')::numeric,0)/v_prev_follow_assigned,1) else null end,
      'followups_overdue_open',coalesce((v_previous_ops#>>'{summary,customer_service,overdue_open}')::numeric,0)
    ),
    'context',jsonb_build_object(
      'current_scheduled_days',v_cur_sched,
      'previous_scheduled_days',v_prev_sched,
      'same_length_periods',true
    ),
    'notes',jsonb_build_array(
      'المقارنة تستخدم الفترة السابقة مباشرة وبنفس عدد الأيام.',
      'لا يتم إنتاج Score إجمالي؛ كل مؤشر يقارن مستقلًا حسب معناه.',
      'اختلاف عدد الموظفين أو أيام الورديات بين الفترتين يجب أخذه في الاعتبار عند قراءة الأرقام المطلقة.',
      'مؤشرات النسب تظل null عندما لا توجد عينات قابلة للحساب بدل افتراض صفر.'
    )
  );
end;
$$;

revoke all on function public.get_hr_manager_team_period_comparison_v1(uuid,date,date) from public, anon;
grant execute on function public.get_hr_manager_team_period_comparison_v1(uuid,date,date) to authenticated;
grant execute on function public.get_hr_manager_team_period_comparison_v1(uuid,date,date) to service_role;
