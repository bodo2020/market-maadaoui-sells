create or replace function public.get_reporting_online_v2(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit,100),10),200);
  v_summary jsonb := '{}'::jsonb;
  v_statuses jsonb := '[]'::jsonb;
  v_payments jsonb := '[]'::jsonb;
  v_methods jsonb := '[]'::jsonb;
  v_daily jsonb := '[]'::jsonb;
  v_orders jsonb := '[]'::jsonb;
  v_first_order_at timestamptz;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then raise exception using errcode='42501',message='REPORTS_VIEW_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;

  select min(created_at) into v_first_order_at from public.online_orders where branch_id=p_branch_id;

  select jsonb_build_object(
    'order_count',count(*)::bigint,
    'active_orders',count(*) filter(where status not in ('delivered','cancelled'))::bigint,
    'pending_orders',count(*) filter(where status='pending')::bigint,
    'delivered_orders',count(*) filter(where status='delivered')::bigint,
    'cancelled_orders',count(*) filter(where status='cancelled')::bigint,
    'paid_orders',count(*) filter(where payment_status='paid')::bigint,
    'pending_payment_orders',count(*) filter(where payment_status='pending')::bigint,
    'failed_payment_orders',count(*) filter(where payment_status='failed')::bigint,
    'refunded_orders',count(*) filter(where payment_status='refunded')::bigint,
    'distinct_customers',count(distinct customer_id) filter(where customer_id is not null)::bigint,
    'linked_customer_orders',count(*) filter(where customer_id is not null)::bigint,
    'gross_order_value',round(coalesce(sum(total),0),2),
    'active_order_value',round(coalesce(sum(total) filter(where status not in ('delivered','cancelled')),0),2),
    'delivered_order_value',round(coalesce(sum(total) filter(where status='delivered'),0),2),
    'paid_delivered_value',round(coalesce(sum(total) filter(where status='delivered' and payment_status='paid'),0),2),
    'cancelled_order_value',round(coalesce(sum(total) filter(where status='cancelled'),0),2),
    'shipping_charged',round(coalesce(sum(shipping_cost),0),2),
    'delivered_shipping_charged',round(coalesce(sum(shipping_cost) filter(where status='delivered'),0),2),
    'average_order_value',round(coalesce(avg(total),0),2),
    'average_delivered_order_value',round(coalesce(avg(total) filter(where status='delivered'),0),2),
    'loyalty_voucher_amount',round(coalesce(sum(loyalty_voucher_amount),0),2),
    'loyalty_points_earned',coalesce(sum(loyalty_points_earned),0)::bigint,
    'item_units',coalesce(sum(case when jsonb_typeof(items)='array' then jsonb_array_length(items) else 0 end),0)::bigint,
    'delivery_rate_percent',case when count(*)>0 then round(count(*) filter(where status='delivered')::numeric/count(*)*100,2) else 0 end,
    'cancellation_rate_percent',case when count(*)>0 then round(count(*) filter(where status='cancelled')::numeric/count(*)*100,2) else 0 end
  ) into v_summary
  from public.online_orders
  where branch_id=p_branch_id and created_at>=p_from and created_at<p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
    'status',status_text,'orders',orders,'order_value',round(order_value,2),'shipping_charged',round(shipping_charged,2)
  ) order by sort_order),'[]'::jsonb)
  into v_statuses
  from (
    select status::text status_text,count(*)::bigint orders,coalesce(sum(total),0)::numeric order_value,
      coalesce(sum(shipping_cost),0)::numeric shipping_charged,
      min(case status::text when 'pending' then 1 when 'confirmed' then 2 when 'preparing' then 3 when 'ready' then 4 when 'shipped' then 5 when 'delivered' then 6 when 'cancelled' then 7 else 99 end) sort_order
    from public.online_orders
    where branch_id=p_branch_id and created_at>=p_from and created_at<p_to
    group by status
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'payment_status',payment_status_text,'orders',orders,'order_value',round(order_value,2)
  ) order by sort_order),'[]'::jsonb)
  into v_payments
  from (
    select payment_status::text payment_status_text,count(*)::bigint orders,coalesce(sum(total),0)::numeric order_value,
      min(case payment_status::text when 'pending' then 1 when 'paid' then 2 when 'failed' then 3 when 'refunded' then 4 else 99 end) sort_order
    from public.online_orders
    where branch_id=p_branch_id and created_at>=p_from and created_at<p_to
    group by payment_status
  ) p;

  select coalesce(jsonb_agg(jsonb_build_object(
    'payment_method',payment_method_name,'orders',orders,'order_value',round(order_value,2),
    'delivered_orders',delivered_orders,'delivered_value',round(delivered_value,2)
  ) order by order_value desc,payment_method_name),'[]'::jsonb)
  into v_methods
  from (
    select coalesce(nullif(btrim(payment_method),''),'غير محدد') payment_method_name,
      count(*)::bigint orders,coalesce(sum(total),0)::numeric order_value,
      count(*) filter(where status='delivered')::bigint delivered_orders,
      coalesce(sum(total) filter(where status='delivered'),0)::numeric delivered_value
    from public.online_orders
    where branch_id=p_branch_id and created_at>=p_from and created_at<p_to
    group by coalesce(nullif(btrim(payment_method),''),'غير محدد')
  ) m;

  select coalesce(jsonb_agg(jsonb_build_object(
    'day',day_key,'orders',orders,'order_value',round(order_value,2),'delivered_orders',delivered_orders,
    'cancelled_orders',cancelled_orders,'shipping_charged',round(shipping_charged,2)
  ) order by day_key),'[]'::jsonb)
  into v_daily
  from (
    select (created_at at time zone 'Africa/Cairo')::date day_key,count(*)::bigint orders,
      coalesce(sum(total),0)::numeric order_value,
      count(*) filter(where status='delivered')::bigint delivered_orders,
      count(*) filter(where status='cancelled')::bigint cancelled_orders,
      coalesce(sum(shipping_cost),0)::numeric shipping_charged
    from public.online_orders
    where branch_id=p_branch_id and created_at>=p_from and created_at<p_to
    group by (created_at at time zone 'Africa/Cairo')::date
  ) d;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',o.id,'created_at',o.created_at,'updated_at',o.updated_at,'status',o.status::text,'payment_status',o.payment_status::text,
    'payment_method',o.payment_method,'total',round(coalesce(o.total,0),2),'shipping_cost',round(coalesce(o.shipping_cost,0),2),
    'customer_id',o.customer_id,
    'customer_name',coalesce(nullif(o.customer_snapshot->>'name',''),nullif(c.name,''),'عميل غير مسجل'),
    'customer_phone',coalesce(nullif(o.customer_snapshot->>'phone',''),nullif(c.phone,'')),
    'shipping_address',coalesce(nullif(o.shipping_snapshot->>'address',''),nullif(o.shipping_address,'')),
    'distance_km',case when (o.shipping_snapshot->>'distance_km') ~ '^-?[0-9]+(\.[0-9]+)?$' then (o.shipping_snapshot->>'distance_km')::numeric else null end,
    'delivery_person',o.delivery_person,'tracking_number',o.tracking_number,'source_channel',o.source_channel,
    'item_count',case when jsonb_typeof(o.items)='array' then jsonb_array_length(o.items) else 0 end,
    'loyalty_voucher_amount',round(coalesce(o.loyalty_voucher_amount,0),2),'loyalty_points_earned',coalesce(o.loyalty_points_earned,0)
  ) order by o.created_at desc),'[]'::jsonb)
  into v_orders
  from (
    select * from public.online_orders
    where branch_id=p_branch_id and created_at>=p_from and created_at<p_to
    order by created_at desc
    limit v_limit
  ) o
  left join public.customers c on c.id=o.customer_id;

  return jsonb_build_object(
    'version',2,'branch_id',p_branch_id,'from',p_from,'to',p_to,
    'summary',coalesce(v_summary,'{}'::jsonb),'statuses',coalesce(v_statuses,'[]'::jsonb),
    'payment_statuses',coalesce(v_payments,'[]'::jsonb),'payment_methods',coalesce(v_methods,'[]'::jsonb),
    'daily',coalesce(v_daily,'[]'::jsonb),'orders',coalesce(v_orders,'[]'::jsonb),
    'data_quality',jsonb_build_object(
      'source','online_orders_current_state_by_created_at','first_order_at',v_first_order_at,
      'profit_available',false,'profit_reason','online order item cost snapshots are not normalized yet',
      'delivery_duration_available',false,'delivery_duration_reason','legacy order_status_history contains bulk status rewrites and cannot support trustworthy historical delivery duration',
      'status_semantics','current order status grouped by order created_at cohort'
    )
  );
end;
$function$;

revoke all on function public.get_reporting_online_v2(uuid,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.get_reporting_online_v2(uuid,timestamptz,timestamptz,integer) to authenticated,service_role;
