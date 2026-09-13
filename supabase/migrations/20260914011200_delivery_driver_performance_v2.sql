create or replace function public.get_my_delivery_performance_v1(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_days integer := greatest(1, least(coalesce(p_days,7),90));
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days,7),90)));
  v_assigned integer := 0;
  v_delivered integer := 0;
  v_failed integer := 0;
  v_returned integer := 0;
  v_avg_delivery numeric := null;
  v_avg_total numeric := null;
  v_cash numeric := 0;
  v_worked_hours numeric := 0;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.users u
    where u.id=v_uid and u.role='delivery' and coalesce(u.active,true)
  ) then raise exception 'delivery_access_required'; end if;

  select
    count(*)::integer,
    count(*) filter (where a.delivered_at is not null)::integer,
    count(*) filter (where a.delivery_state='failed' or (a.failed_at is not null and a.delivery_state <> 'return_to_branch'))::integer,
    count(*) filter (where a.delivery_state='return_to_branch')::integer,
    round(avg(extract(epoch from (a.delivered_at-a.departed_at))/60.0) filter (where a.delivered_at is not null and a.departed_at is not null)::numeric,1),
    round(avg(extract(epoch from (a.delivered_at-a.assigned_at))/60.0) filter (where a.delivered_at is not null)::numeric,1)
  into v_assigned,v_delivered,v_failed,v_returned,v_avg_delivery,v_avg_total
  from private.delivery_order_assignments_v1 a
  where a.delivery_user_id=v_uid and a.assigned_at >= v_since;

  select coalesce(sum(l.amount),0)
  into v_cash
  from private.delivery_cash_ledger_v1 l
  where l.driver_user_id=v_uid
    and l.entry_type='collection'
    and l.created_at >= v_since;

  select coalesce(sum(extract(epoch from (coalesce(s.end_time,now())-s.start_time))/3600.0),0)
  into v_worked_hours
  from public.shifts s
  where s.employee_id=v_uid
    and s.start_time >= v_since;

  return jsonb_build_object(
    'period_days',v_days,
    'assigned',v_assigned,
    'delivered',v_delivered,
    'failed',v_failed,
    'returned',v_returned,
    'completion_rate',case when (v_delivered+v_failed+v_returned)>0 then round((v_delivered::numeric/(v_delivered+v_failed+v_returned))*100,1) else null end,
    'avg_delivery_minutes',v_avg_delivery,
    'avg_total_minutes',v_avg_total,
    'cash_collected',round(v_cash,2),
    'worked_hours',round(v_worked_hours,2)
  );
end;
$function$;

revoke all on function public.get_my_delivery_performance_v1(integer) from public, anon;
grant execute on function public.get_my_delivery_performance_v1(integer) to authenticated, service_role;
