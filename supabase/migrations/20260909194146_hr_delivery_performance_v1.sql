create or replace function public.get_hr_delivery_performance_v1(
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
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_employee_id is null or p_branch_id is null then raise exception 'employee_and_branch_required'; end if;
  if p_from is null or p_to is null or p_from>p_to then raise exception 'invalid_date_range'; end if;
  if (p_to-p_from)>366 then raise exception 'date_range_too_large'; end if;

  v_is_super:=private.staff_is_super_admin(v_uid);
  if not v_is_self and not v_is_super
     and not public.staff_has_permission('hr.view',p_branch_id)
     and not public.staff_has_permission('branch.manage_staff',p_branch_id)
     and not public.staff_has_permission('delivery.manage',p_branch_id) then
    raise exception 'permission_denied';
  end if;

  if not v_is_self and not v_is_super
     and not exists(select 1 from public.user_branch_roles ubr where ubr.user_id=p_employee_id and ubr.branch_id=p_branch_id and ubr.active) then
    raise exception 'employee_out_of_scope';
  end if;

  with assignments as (
    select a.*,o.total,o.return_status,o.status::text order_status
    from private.delivery_order_assignments_v1 a
    join public.online_orders o on o.id=a.order_id
    where a.delivery_user_id=p_employee_id
      and a.branch_id=p_branch_id
      and a.assigned_at < (p_to+1)::timestamptz
      and coalesce(a.unassigned_at,'infinity'::timestamptz) >= p_from::timestamptz
  ), event_windows as (
    select a.*,ev.ready_at,ev.shipped_at,ev.delivered_at,ev.cancelled_at
    from assignments a
    left join lateral (
      select
        min(h.created_at) filter(where h.new_status::text='ready') as ready_at,
        min(h.created_at) filter(where h.new_status::text='shipped') as shipped_at,
        min(h.created_at) filter(where h.new_status::text='delivered') as delivered_at,
        min(h.created_at) filter(where h.new_status::text='cancelled') as cancelled_at
      from public.order_status_history h
      where h.order_id=a.order_id
        and h.created_at>=a.assigned_at
        and h.created_at<coalesce(a.unassigned_at,'infinity'::timestamptz)
    ) ev on true
  ), stats as (
    select
      count(*)::int assignment_records,
      count(*) filter(where assigned_at>=p_from::timestamptz and assigned_at<(p_to+1)::timestamptz)::int assigned_in_period,
      count(*) filter(where unassigned_at>=p_from::timestamptz and unassigned_at<(p_to+1)::timestamptz)::int reassigned_away_in_period,
      count(*) filter(where unassigned_at is null and order_status not in ('delivered','cancelled'))::int active_open_orders,
      count(*) filter(where shipped_at>=p_from::timestamptz and shipped_at<(p_to+1)::timestamptz)::int shipped_orders,
      count(*) filter(where delivered_at>=p_from::timestamptz and delivered_at<(p_to+1)::timestamptz)::int delivered_orders,
      count(*) filter(where cancelled_at>=p_from::timestamptz and cancelled_at<(p_to+1)::timestamptz)::int cancelled_orders,
      coalesce(sum(total) filter(where delivered_at>=p_from::timestamptz and delivered_at<(p_to+1)::timestamptz),0)::numeric delivered_value,
      count(*) filter(where delivered_at>=p_from::timestamptz and delivered_at<(p_to+1)::timestamptz and coalesce(return_status,'none') in ('partial','full'))::int delivered_orders_with_returns,
      count(*) filter(where shipped_at is not null and delivered_at is not null and delivered_at>=shipped_at and delivered_at>=p_from::timestamptz and delivered_at<(p_to+1)::timestamptz)::int delivery_duration_samples,
      round(avg(extract(epoch from (delivered_at-shipped_at))/60.0) filter(where shipped_at is not null and delivered_at is not null and delivered_at>=shipped_at and delivered_at>=p_from::timestamptz and delivered_at<(p_to+1)::timestamptz)::numeric,1) avg_delivery_minutes,
      count(*) filter(where ready_at is not null and shipped_at is not null and shipped_at>=greatest(ready_at,assigned_at) and shipped_at>=p_from::timestamptz and shipped_at<(p_to+1)::timestamptz)::int pickup_duration_samples,
      round(avg(extract(epoch from (shipped_at-greatest(ready_at,assigned_at)))/60.0) filter(where ready_at is not null and shipped_at is not null and shipped_at>=greatest(ready_at,assigned_at) and shipped_at>=p_from::timestamptz and shipped_at<(p_to+1)::timestamptz)::numeric,1) avg_pickup_minutes
    from event_windows
  )
  select jsonb_build_object(
    'employee',jsonb_build_object('id',u.id,'name',u.name,'role',u.role,'employee_code',ep.employee_code,'department_name',d.name_ar,'job_title_name',jt.name_ar),
    'period',jsonb_build_object('from',p_from,'to',p_to),
    'applicable',s.assignment_records>0,
    'assignments',jsonb_build_object(
      'records',s.assignment_records,
      'assigned_in_period',s.assigned_in_period,
      'reassigned_away_in_period',s.reassigned_away_in_period,
      'active_open_orders',s.active_open_orders
    ),
    'delivery',jsonb_build_object(
      'shipped_orders',s.shipped_orders,
      'delivered_orders',s.delivered_orders,
      'cancelled_orders',s.cancelled_orders,
      'delivered_value',round(s.delivered_value,2),
      'delivered_orders_with_returns',s.delivered_orders_with_returns,
      'delivery_duration_samples',s.delivery_duration_samples,
      'avg_delivery_minutes',s.avg_delivery_minutes,
      'pickup_duration_samples',s.pickup_duration_samples,
      'avg_pickup_minutes',s.avg_pickup_minutes
    ),
    'notes',jsonb_build_array(
      'لا يتم حساب On-time Delivery حتى يتوفر موعد تسليم متوقع موثوق لكل طلب.',
      'زمن التوصيل يحسب فقط عندما توجد حالتا shipped وdelivered داخل فترة مسؤولية نفس السائق.',
      'زمن الاستلام يحسب من الأحدث بين ready ووقت إسناد الطلب إلى shipped، حتى لا نحاسب السائق على انتظار سبق إسناد الطلب له.',
      'الإلغاءات والمرتجعات تعرض كسياق تشغيلي ولا تعتبر تلقائيًا خطأ على السائق.'
    )
  ) into v_result
  from public.users u
  left join private.hr_employee_profiles ep on ep.user_id=u.id
  left join private.hr_departments d on d.id=ep.department_id
  left join private.hr_job_titles jt on jt.id=ep.job_title_id
  cross join stats s
  where u.id=p_employee_id;

  if v_result is null then raise exception 'employee_not_found'; end if;
  return v_result;
end;
$function$;

revoke all on function public.get_hr_delivery_performance_v1(uuid,uuid,date,date) from public,anon;
grant execute on function public.get_hr_delivery_performance_v1(uuid,uuid,date,date) to authenticated,service_role;
