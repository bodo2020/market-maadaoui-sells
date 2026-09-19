create or replace function public.get_reporting_peak_hours_v1(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_hourly jsonb := '[]'::jsonb;
  v_heatmap jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED'; end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then raise exception using errcode='42501',message='REPORTS_VIEW_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;

  with hours as (
    select generate_series(0,23)::int as hour_of_day
  ), pos as (
    select extract(hour from timezone('Africa/Cairo',i.sale_date))::int as hour_of_day,
      count(*)::bigint as transactions,
      coalesce(sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)),0)::numeric as sales
    from public.pos_invoices i
    where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
    group by 1
  ), online as (
    select extract(hour from timezone('Africa/Cairo',o.created_at))::int as hour_of_day,
      count(*)::bigint as orders,
      count(*) filter(where o.status::text='delivered')::bigint as delivered_orders,
      coalesce(sum(o.total),0)::numeric as order_value,
      coalesce(sum(o.total) filter(where o.status::text='delivered'),0)::numeric as delivered_value
    from public.online_orders o
    where o.branch_id=p_branch_id and o.created_at>=p_from and o.created_at<p_to
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'hour',h.hour_of_day,
    'pos_transactions',coalesce(p.transactions,0),
    'pos_sales',round(coalesce(p.sales,0),2),
    'online_orders',coalesce(o.orders,0),
    'online_delivered_orders',coalesce(o.delivered_orders,0),
    'online_order_value',round(coalesce(o.order_value,0),2),
    'online_delivered_value',round(coalesce(o.delivered_value,0),2),
    'combined_activity',coalesce(p.transactions,0)+coalesce(o.orders,0)
  ) order by h.hour_of_day),'[]'::jsonb)
  into v_hourly
  from hours h
  left join pos p on p.hour_of_day=h.hour_of_day
  left join online o on o.hour_of_day=h.hour_of_day;

  with weekdays as (
    select generate_series(1,7)::int as iso_dow
  ), hours as (
    select generate_series(0,23)::int as hour_of_day
  ), pos as (
    select extract(isodow from timezone('Africa/Cairo',i.sale_date))::int as iso_dow,
      extract(hour from timezone('Africa/Cairo',i.sale_date))::int as hour_of_day,
      count(*)::bigint as transactions
    from public.pos_invoices i
    where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
    group by 1,2
  ), online as (
    select extract(isodow from timezone('Africa/Cairo',o.created_at))::int as iso_dow,
      extract(hour from timezone('Africa/Cairo',o.created_at))::int as hour_of_day,
      count(*)::bigint as orders
    from public.online_orders o
    where o.branch_id=p_branch_id and o.created_at>=p_from and o.created_at<p_to
    group by 1,2
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'iso_dow',d.iso_dow,
    'hour',h.hour_of_day,
    'pos_transactions',coalesce(p.transactions,0),
    'online_orders',coalesce(o.orders,0),
    'combined_activity',coalesce(p.transactions,0)+coalesce(o.orders,0)
  ) order by d.iso_dow,h.hour_of_day),'[]'::jsonb)
  into v_heatmap
  from weekdays d cross join hours h
  left join pos p on p.iso_dow=d.iso_dow and p.hour_of_day=h.hour_of_day
  left join online o on o.iso_dow=d.iso_dow and o.hour_of_day=h.hour_of_day;

  with pos_totals as (
    select count(*)::bigint as transactions,
      coalesce(sum(greatest(total-coalesce(loyalty_voucher_amount,0),0)),0)::numeric as sales,
      count(distinct (timezone('Africa/Cairo',sale_date))::date)::int as active_days
    from public.pos_invoices where branch_id=p_branch_id and sale_date>=p_from and sale_date<p_to
  ), online_totals as (
    select count(*)::bigint as orders,
      count(*) filter(where status::text='delivered')::bigint as delivered_orders,
      coalesce(sum(total),0)::numeric as order_value,
      count(distinct (timezone('Africa/Cairo',created_at))::date)::int as active_days
    from public.online_orders where branch_id=p_branch_id and created_at>=p_from and created_at<p_to
  ), hourly_rows as (
    select value as row_data from jsonb_array_elements(v_hourly)
  ), peaks as (
    select
      (select row_data from hourly_rows order by coalesce((row_data->>'pos_transactions')::numeric,0) desc,(row_data->>'hour')::int limit 1) as peak_pos,
      (select row_data from hourly_rows order by coalesce((row_data->>'online_orders')::numeric,0) desc,(row_data->>'hour')::int limit 1) as peak_online,
      (select row_data from hourly_rows order by coalesce((row_data->>'combined_activity')::numeric,0) desc,(row_data->>'hour')::int limit 1) as peak_combined
  )
  select jsonb_build_object(
    'pos_transactions',p.transactions,
    'pos_sales',round(p.sales,2),
    'online_orders',o.orders,
    'online_delivered_orders',o.delivered_orders,
    'online_order_value',round(o.order_value,2),
    'combined_activity',p.transactions+o.orders,
    'pos_active_days',p.active_days,
    'online_active_days',o.active_days,
    'avg_pos_transactions_per_active_day',case when p.active_days>0 then round(p.transactions::numeric/p.active_days,2) else 0 end,
    'avg_online_orders_per_active_day',case when o.active_days>0 then round(o.orders::numeric/o.active_days,2) else 0 end,
    'peak_pos',peaks.peak_pos,
    'peak_online',peaks.peak_online,
    'peak_combined',peaks.peak_combined
  ) into v_summary
  from pos_totals p cross join online_totals o cross join peaks;

  return jsonb_build_object(
    'version',1,'branch_id',p_branch_id,'from',p_from,'to',p_to,
    'summary',coalesce(v_summary,'{}'::jsonb),
    'hourly',coalesce(v_hourly,'[]'::jsonb),
    'weekday_hourly',coalesce(v_heatmap,'[]'::jsonb),
    'data_quality',jsonb_build_object(
      'timezone','Africa/Cairo',
      'pos_workload_source','pos_invoices.sale_date',
      'online_workload_source','online_orders.created_at',
      'online_scope','all orders created in range for workload planning; delivered count is returned separately',
      'delivery_duration_used',false
    )
  );
end;
$function$;

revoke all on function public.get_reporting_peak_hours_v1(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_reporting_peak_hours_v1(uuid,timestamptz,timestamptz) to authenticated,service_role;
