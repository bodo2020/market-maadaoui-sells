create or replace function public.get_hr_manager_team_operations_v1(
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
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_branch_id is null or p_from is null or p_to is null or p_from>p_to then raise exception 'invalid_date_range'; end if;
  if (p_to-p_from)>366 then raise exception 'date_range_too_large'; end if;

  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('hr.view',p_branch_id)
     and not public.staff_has_permission('branch.manage_staff',p_branch_id) then
    raise exception 'permission_denied';
  end if;

  with employees as (
    select distinct u.id user_id,u.name,u.role,ep.employee_code,d.name_ar department_name,j.name_ar job_title_name
    from public.users u
    left join private.hr_employee_profiles ep on ep.user_id=u.id
    left join private.hr_departments d on d.id=ep.department_id
    left join private.hr_job_titles j on j.id=ep.job_title_id
    where coalesce(u.active,true)
      and u.role<>'super_admin'
      and coalesce(ep.employment_status,'active')<>'terminated'
      and (
        ep.primary_branch_id=p_branch_id
        or exists(select 1 from public.user_branch_roles ubr where ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active)
      )
  ), cashier_sales as (
    select i.cashier_id user_id,count(*)::int invoice_count,coalesce(sum(i.total),0)::numeric sales_total
    from public.pos_invoices i
    where i.branch_id=p_branch_id and i.sale_date>=p_from::timestamptz and i.sale_date<(p_to+1)::timestamptz
    group by i.cashier_id
  ), cashier_shifts as (
    select s.user_id,count(*)::int shift_count,
      coalesce(sum(abs(coalesce(s.cash_difference,0))),0)::numeric absolute_cash_variance,
      coalesce(sum(abs(coalesce(s.opening_variance,0))),0)::numeric absolute_opening_variance
    from public.pos_shifts s
    where s.branch_id=p_branch_id and s.opened_at>=p_from::timestamptz and s.opened_at<(p_to+1)::timestamptz
    group by s.user_id
  ), cashier_recon as (
    select s.user_id,
      count(*) filter(where abs(coalesce(r.variance_amount,0))>0.009)::int variance_lines,
      coalesce(sum(abs(coalesce(r.variance_amount,0))),0)::numeric absolute_payment_variance
    from public.pos_shift_payment_reconciliations r
    join public.pos_shifts s on s.id=r.shift_id
    where r.branch_id=p_branch_id and s.opened_at>=p_from::timestamptz and s.opened_at<(p_to+1)::timestamptz
    group by s.user_id
  ), inventory_counts as (
    select c.assigned_to user_id,count(*)::int assigned,
      count(*) filter(where c.submitted_at is not null)::int submitted,
      count(*) filter(where c.submitted_at is not null and abs(coalesce(c.variance,0))>0.001)::int differences_found
    from private.inventory_audit_counts_v2 c
    where c.branch_id=p_branch_id and c.audit_date between p_from and p_to and c.status<>'cancelled'
    group by c.assigned_to
  ), inventory_recounts as (
    select r.assigned_to user_id,count(*)::int assigned,
      count(*) filter(where r.submitted_at is not null)::int submitted,
      count(*) filter(where r.status='conflicting')::int conflicting
    from private.inventory_audit_recounts_v2 r
    where r.branch_id=p_branch_id
      and r.assigned_at>=p_from::timestamptz and r.assigned_at<(p_to+1)::timestamptz
      and r.status<>'cancelled'
    group by r.assigned_to
  ), delivery_windows as (
    select a.delivery_user_id user_id,a.order_id,a.assigned_at,a.unassigned_at,o.status::text order_status,
      ev.shipped_at,ev.delivered_at
    from private.delivery_order_assignments_v1 a
    join public.online_orders o on o.id=a.order_id
    left join lateral (
      select min(h.created_at) filter(where h.new_status::text='shipped') shipped_at,
             min(h.created_at) filter(where h.new_status::text='delivered') delivered_at
      from public.order_status_history h
      where h.order_id=a.order_id
        and h.created_at>=a.assigned_at
        and h.created_at<coalesce(a.unassigned_at,'infinity'::timestamptz)
    ) ev on true
    where a.branch_id=p_branch_id
      and a.assigned_at<(p_to+1)::timestamptz
      and coalesce(a.unassigned_at,'infinity'::timestamptz)>=p_from::timestamptz
  ), delivery_stats as (
    select user_id,
      count(*) filter(where assigned_at>=p_from::timestamptz and assigned_at<(p_to+1)::timestamptz)::int assigned,
      count(*) filter(where unassigned_at is null and order_status not in ('delivered','cancelled'))::int active_open,
      count(*) filter(where delivered_at>=p_from::timestamptz and delivered_at<(p_to+1)::timestamptz)::int delivered,
      round(avg(extract(epoch from (delivered_at-shipped_at))/60.0) filter(where shipped_at is not null and delivered_at is not null and delivered_at>=shipped_at and delivered_at>=p_from::timestamptz and delivered_at<(p_to+1)::timestamptz)::numeric,1) avg_delivery_minutes
    from delivery_windows group by user_id
  ), online_stats as (
    select h.changed_by user_id,count(*)::int transitions,count(distinct h.order_id)::int handled_orders,
      count(*) filter(where h.new_status::text='cancelled')::int cancellations
    from public.order_status_history h
    join public.online_orders o on o.id=h.order_id
    where h.changed_by is not null and o.branch_id=p_branch_id
      and h.created_at>=p_from::timestamptz and h.created_at<(p_to+1)::timestamptz
    group by h.changed_by
  ), followup_stats as (
    select ci.assigned_to user_id,count(*)::int assigned,
      count(*) filter(where ci.status='completed')::int closed,
      count(*) filter(where ci.status<>'completed' and ci.scheduled_at is not null and ci.scheduled_at<now())::int overdue_open
    from public.customer_interactions ci
    where ci.branch_id=p_branch_id and ci.assigned_to is not null
      and ci.created_at>=p_from::timestamptz and ci.created_at<(p_to+1)::timestamptz
    group by ci.assigned_to
  ), rows as (
    select e.*,
      coalesce(cs.invoice_count,0) cashier_invoices,round(coalesce(cs.sales_total,0),2) cashier_sales,
      coalesce(csh.shift_count,0) cashier_shifts,
      round(coalesce(csh.absolute_cash_variance,0),2) cash_variance,
      round(coalesce(csh.absolute_opening_variance,0),2) opening_variance,
      coalesce(cr.variance_lines,0) payment_variance_lines,
      round(coalesce(cr.absolute_payment_variance,0),2) payment_variance,
      coalesce(ic.assigned,0) inventory_counts_assigned,coalesce(ic.submitted,0) inventory_counts_submitted,
      coalesce(ic.differences_found,0) inventory_differences_found,
      coalesce(ir.assigned,0) inventory_recounts_assigned,coalesce(ir.submitted,0) inventory_recounts_submitted,
      coalesce(ir.conflicting,0) inventory_recounts_conflicting,
      coalesce(ds.assigned,0) delivery_assigned,coalesce(ds.active_open,0) delivery_active_open,
      coalesce(ds.delivered,0) delivery_delivered,ds.avg_delivery_minutes,
      coalesce(os.transitions,0) online_transitions,coalesce(os.handled_orders,0) online_handled_orders,
      coalesce(os.cancellations,0) online_cancellations,
      coalesce(fs.assigned,0) followups_assigned,coalesce(fs.closed,0) followups_closed,coalesce(fs.overdue_open,0) followups_overdue_open,
      ((coalesce(csh.absolute_cash_variance,0)+coalesce(cr.absolute_payment_variance,0))>0.009 or coalesce(fs.overdue_open,0)>0) needs_attention
    from employees e
    left join cashier_sales cs on cs.user_id=e.user_id
    left join cashier_shifts csh on csh.user_id=e.user_id
    left join cashier_recon cr on cr.user_id=e.user_id
    left join inventory_counts ic on ic.user_id=e.user_id
    left join inventory_recounts ir on ir.user_id=e.user_id
    left join delivery_stats ds on ds.user_id=e.user_id
    left join online_stats os on os.user_id=e.user_id
    left join followup_stats fs on fs.user_id=e.user_id
  )
  select jsonb_build_object(
    'branch_id',p_branch_id,'period',jsonb_build_object('from',p_from,'to',p_to),
    'summary',jsonb_build_object(
      'employees',count(*),
      'employees_with_specialist_activity',count(*) filter(where cashier_invoices+cashier_shifts+inventory_counts_assigned+inventory_recounts_assigned+delivery_assigned+online_transitions+followups_assigned>0),
      'employees_needing_attention',count(*) filter(where needs_attention),
      'cashier',jsonb_build_object('invoices',coalesce(sum(cashier_invoices),0),'sales',round(coalesce(sum(cashier_sales),0),2),'cash_variance',round(coalesce(sum(cash_variance),0),2),'payment_variance',round(coalesce(sum(payment_variance),0),2)),
      'inventory',jsonb_build_object('counts_assigned',coalesce(sum(inventory_counts_assigned),0),'counts_submitted',coalesce(sum(inventory_counts_submitted),0),'differences_found',coalesce(sum(inventory_differences_found),0),'recounts_submitted',coalesce(sum(inventory_recounts_submitted),0),'recount_conflicts',coalesce(sum(inventory_recounts_conflicting),0)),
      'delivery',jsonb_build_object('assigned',coalesce(sum(delivery_assigned),0),'active_open',coalesce(sum(delivery_active_open),0),'delivered',coalesce(sum(delivery_delivered),0)),
      'online',jsonb_build_object('handled_orders',coalesce(sum(online_handled_orders),0),'transitions',coalesce(sum(online_transitions),0),'cancellations',coalesce(sum(online_cancellations),0)),
      'customer_service',jsonb_build_object('assigned',coalesce(sum(followups_assigned),0),'closed',coalesce(sum(followups_closed),0),'overdue_open',coalesce(sum(followups_overdue_open),0))
    ),
    'employees',coalesce(jsonb_agg(to_jsonb(rows) order by needs_attention desc,followups_overdue_open desc,(cash_variance+payment_variance) desc,name),'[]'::jsonb),
    'notes',jsonb_build_array(
      'هذه لوحة تشغيل للفريق وليست Score موحدًا للموظفين.',
      'فرق الجرد والإلغاءات والمرتجعات لا تتحول تلقائيًا إلى تنبيه أداء لأنها تحتاج تفسير السبب.',
      'needs_attention يقتصر حاليًا على فروق النقد/وسائل الدفع أو Follow-ups متأخرة مفتوحة.',
      'مقاييس التخصص تظهر فقط من السجلات الفعلية المرتبطة بهوية الموظف.'
    )
  ) into v_result from rows;
  return v_result;
end;
$function$;

revoke all on function public.get_hr_manager_team_operations_v1(uuid,date,date) from public,anon;
grant execute on function public.get_hr_manager_team_operations_v1(uuid,date,date) to authenticated,service_role;
