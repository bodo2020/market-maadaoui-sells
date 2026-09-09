create or replace function public.get_hr_online_customer_service_performance_v1(
  p_employee_id uuid,
  p_branch_id uuid,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_is_self boolean:=auth.uid()=p_employee_id;
  v_is_super boolean;
  v_result jsonb;
  v_sla_enabled boolean:=false;
  v_first_target integer:=30;
  v_prep_target integer:=60;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_employee_id is null or p_branch_id is null then raise exception 'employee_and_branch_required'; end if;
  if p_from is null or p_to is null or p_from>p_to then raise exception 'invalid_date_range'; end if;
  if (p_to-p_from)>366 then raise exception 'date_range_too_large'; end if;

  v_is_super:=private.staff_is_super_admin(v_uid);
  if not v_is_self and not v_is_super
     and not public.staff_has_permission('hr.view',p_branch_id)
     and not public.staff_has_permission('branch.manage_staff',p_branch_id)
     and not public.staff_has_permission('online_orders.manage',p_branch_id)
     and not public.staff_has_permission('customers.manage',p_branch_id) then
    raise exception 'permission_denied';
  end if;

  if not v_is_self and not v_is_super
     and not exists(
       select 1 from public.user_branch_roles ubr
       where ubr.user_id=p_employee_id and ubr.branch_id=p_branch_id and ubr.active
     ) then
    raise exception 'employee_out_of_scope';
  end if;

  select coalesce(s.enabled,false),coalesce(s.first_response_target_minutes,30),coalesce(s.preparation_target_minutes,60)
    into v_sla_enabled,v_first_target,v_prep_target
  from private.online_order_sla_policies_v1 s
  where s.branch_id=p_branch_id;
  if not found then
    v_sla_enabled:=false; v_first_target:=30; v_prep_target:=60;
  end if;

  with order_events as (
    select h.order_id,h.old_status::text old_status,h.new_status::text new_status,h.created_at,h.notes,
           o.created_at order_created_at,o.return_status,o.total
    from public.order_status_history h
    join public.online_orders o on o.id=h.order_id
    where h.changed_by=p_employee_id
      and o.branch_id=p_branch_id
      and h.created_at>=p_from::timestamptz
      and h.created_at<(p_to+1)::timestamptz
  ), order_stats as (
    select
      count(*)::int status_transitions,
      count(distinct order_id)::int handled_orders,
      count(*) filter(where new_status='confirmed')::int confirmed,
      count(*) filter(where new_status='preparing')::int preparing,
      count(*) filter(where new_status='ready')::int ready,
      count(*) filter(where new_status='shipped')::int shipped,
      count(*) filter(where new_status='delivered')::int delivered,
      count(*) filter(where new_status='cancelled')::int cancelled,
      count(distinct order_id) filter(where coalesce(return_status,'none') in ('partial','full'))::int handled_orders_with_returns
    from order_events
  ), first_responses as (
    select o.id order_id,o.created_at order_created_at,x.created_at response_at,
      extract(epoch from (x.created_at-o.created_at))/60.0 duration_minutes
    from public.online_orders o
    join lateral (
      select h.changed_by,h.created_at
      from public.order_status_history h
      where h.order_id=o.id and h.changed_by is not null
      order by h.created_at asc,h.id asc
      limit 1
    ) x on true
    where o.branch_id=p_branch_id
      and x.changed_by=p_employee_id
      and x.created_at>=p_from::timestamptz
      and x.created_at<(p_to+1)::timestamptz
      and x.created_at>=o.created_at
  ), first_response_stats as (
    select count(*)::int samples,
      round(avg(duration_minutes)::numeric,1) avg_minutes,
      count(*) filter(where duration_minutes<=v_first_target)::int met
    from first_responses
  ), prep_samples as (
    select e.order_id,e.created_at ready_at,p.preparing_at,
      extract(epoch from (e.created_at-p.preparing_at))/60.0 duration_minutes
    from order_events e
    join lateral (
      select h.created_at preparing_at
      from public.order_status_history h
      where h.order_id=e.order_id and h.new_status::text='preparing' and h.created_at<e.created_at
      order by h.created_at desc,h.id desc
      limit 1
    ) p on true
    where e.new_status='ready' and e.created_at>=p.preparing_at
  ), prep_stats as (
    select count(*)::int samples,
      round(avg(duration_minutes)::numeric,1) avg_minutes,
      count(*) filter(where duration_minutes<=v_prep_target)::int met
    from prep_samples
  ), assigned_interactions as (
    select ci.*
    from public.customer_interactions ci
    where ci.branch_id=p_branch_id
      and ci.assigned_to=p_employee_id
      and ci.created_at>=p_from::timestamptz
      and ci.created_at<(p_to+1)::timestamptz
  ), completed_by_employee as (
    select ci.*
    from public.customer_interactions ci
    where ci.branch_id=p_branch_id
      and ci.completed_by=p_employee_id
      and ci.completed_at is not null
      and ci.completed_at>=p_from::timestamptz
      and ci.completed_at<(p_to+1)::timestamptz
  ), scheduled_assigned as (
    select ci.*
    from public.customer_interactions ci
    where ci.branch_id=p_branch_id
      and ci.assigned_to=p_employee_id
      and ci.scheduled_at is not null
      and ci.scheduled_at>=p_from::timestamptz
      and ci.scheduled_at<(p_to+1)::timestamptz
  ), interaction_stats as (
    select
      (select count(*)::int from public.customer_interactions ci where ci.branch_id=p_branch_id and ci.created_by=p_employee_id and ci.created_at>=p_from::timestamptz and ci.created_at<(p_to+1)::timestamptz) created_by_employee,
      (select count(*)::int from assigned_interactions) assigned,
      (select count(*)::int from assigned_interactions where status='completed') assigned_closed,
      (select count(*)::int from assigned_interactions where status='completed' and completed_by=p_employee_id) assigned_closed_by_employee,
      (select count(*)::int from assigned_interactions where status='completed' and completed_by is distinct from p_employee_id) assigned_closed_by_other,
      (select count(*)::int from completed_by_employee) completed_by_employee_count,
      (select count(*)::int from scheduled_assigned) scheduled_due,
      (select count(*)::int from scheduled_assigned where status='completed' and completed_at is not null and completed_at>scheduled_at) completed_late_assigned,
      (select count(*)::int from scheduled_assigned where status<>'completed' and scheduled_at<now()) overdue_open,
      (select round(avg(extract(epoch from (completed_at-created_at))/60.0)::numeric,1) from assigned_interactions where status='completed' and completed_at is not null and completed_at>=created_at) avg_assigned_lifecycle_minutes
  ), outcome_counts as (
    select coalesce(jsonb_object_agg(outcome_key,cnt),'{}'::jsonb) outcomes
    from (
      select coalesce(nullif(trim(outcome_code),''),'unspecified') outcome_key,count(*)::int cnt
      from assigned_interactions
      where status='completed'
      group by 1
    ) q
  )
  select jsonb_build_object(
    'employee',jsonb_build_object('id',u.id,'name',u.name,'role',u.role,'employee_code',ep.employee_code,'department_name',d.name_ar,'job_title_name',jt.name_ar),
    'period',jsonb_build_object('from',p_from,'to',p_to),
    'applicable',(os.status_transitions+isx.created_by_employee+isx.assigned+isx.completed_by_employee_count)>0,
    'orders',jsonb_build_object(
      'status_transitions',os.status_transitions,'handled_orders',os.handled_orders,'confirmed',os.confirmed,'preparing',os.preparing,'ready',os.ready,'shipped',os.shipped,'delivered',os.delivered,'cancelled',os.cancelled,
      'handled_orders_with_returns',os.handled_orders_with_returns,
      'first_response_samples',frs.samples,'avg_first_response_minutes',frs.avg_minutes,
      'preparation_samples',ps.samples,'avg_preparation_minutes',ps.avg_minutes,
      'sla',jsonb_build_object(
        'enabled',v_sla_enabled,
        'first_response_target_minutes',v_first_target,
        'preparation_target_minutes',v_prep_target,
        'first_response_rate',case when v_sla_enabled and frs.samples>0 then round(100.0*frs.met/frs.samples,1) else null end,
        'preparation_rate',case when v_sla_enabled and ps.samples>0 then round(100.0*ps.met/ps.samples,1) else null end,
        'overall_rate',case when v_sla_enabled and (frs.samples+ps.samples)>0 then round(100.0*(frs.met+ps.met)/(frs.samples+ps.samples),1) else null end,
        'evaluated_samples',frs.samples+ps.samples,
        'rate',case when v_sla_enabled and (frs.samples+ps.samples)>0 then round(100.0*(frs.met+ps.met)/(frs.samples+ps.samples),1) else null end,
        'reason',case when v_sla_enabled then null else 'online_order_sla_policy_not_enabled' end
      )
    ),
    'customer_service',jsonb_build_object(
      'created_by_employee',isx.created_by_employee,
      'assigned',isx.assigned,
      'assigned_closed',isx.assigned_closed,
      'assigned_closed_by_employee',isx.assigned_closed_by_employee,
      'assigned_closed_by_other',isx.assigned_closed_by_other,
      'completion_rate',case when isx.assigned=0 then null else round(100.0*isx.assigned_closed/isx.assigned,1) end,
      'completed_by_employee',isx.completed_by_employee_count,
      'scheduled_due',isx.scheduled_due,
      'completed_late_assigned',isx.completed_late_assigned,
      'overdue_open',isx.overdue_open,
      'avg_assigned_lifecycle_minutes',isx.avg_assigned_lifecycle_minutes,
      'outcomes',oc.outcomes
    ),
    'notes',jsonb_build_array(
      'الطلبات القديمة التي لا تحتوي changed_by لا تنسب لأي موظف.',
      'متوسط أول استجابة يحسب فقط عندما يكون الموظف هو أول actor معروف على الطلب.',
      'زمن التجهيز من preparing إلى ready مؤشر للعملية التي أغلقها الموظف على ready، وقد يشارك أكثر من موظف في تجهيز نفس الطلب.',
      'إلغاء الطلب أو وجود مرتجع يعرض كسياق تشغيلي ولا يعد خطأ موظف تلقائيًا.',
      'SLA الطلبات يحسب فقط عندما تكون سياسة الفرع مفعلة، وعلى العينات التي تحمل timestamps موثوقة.',
      'إغلاق متابعة مسندة يحسب كإنجاز للمسؤول الحالي، مع إظهار منفصل إذا أغلقها موظف آخر.',
      'متوسط عمر متابعة العميل هو من إنشاء المتابعة إلى إغلاقها، وليس زمن عمل نشط.'
    )
  ) into v_result
  from public.users u
  left join private.hr_employee_profiles ep on ep.user_id=u.id
  left join private.hr_departments d on d.id=ep.department_id
  left join private.hr_job_titles jt on jt.id=ep.job_title_id
  cross join order_stats os cross join first_response_stats frs cross join prep_stats ps cross join interaction_stats isx cross join outcome_counts oc
  where u.id=p_employee_id;

  if v_result is null then raise exception 'employee_not_found'; end if;
  return v_result;
end;
$function$;

revoke all on function public.get_hr_online_customer_service_performance_v1(uuid,uuid,date,date) from public,anon;
grant execute on function public.get_hr_online_customer_service_performance_v1(uuid,uuid,date,date) to authenticated,service_role;
