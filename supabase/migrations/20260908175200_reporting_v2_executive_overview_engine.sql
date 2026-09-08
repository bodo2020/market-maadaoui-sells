create or replace function private.reporting_range_snapshot(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_can_profit boolean,
  p_can_finance boolean
)
returns jsonb
language sql
stable
set search_path = ''
as $function$
with pos_base as (
  select
    count(*)::bigint invoice_count,
    coalesce(sum(i.total),0)::numeric gross_sales,
    coalesce(sum(i.discount),0)::numeric product_discounts,
    coalesce(sum(i.loyalty_voucher_amount),0)::numeric loyalty_discounts,
    coalesce(sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)),0)::numeric sales_after_loyalty,
    coalesce(sum(coalesce(i.amount_charged,greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0))),0)::numeric amount_charged,
    coalesce(sum(i.customer_payment_fee_amount),0)::numeric customer_fees,
    coalesce(sum(i.merchant_payment_fee_amount),0)::numeric merchant_fees
  from public.pos_invoices i
  where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
),
pos_cost as (
  select
    coalesce(sum(coalesce(ii.purchase_price,0) * case when ii.weight is not null then ii.weight else coalesce(ii.quantity,0) end),0)::numeric cogs,
    coalesce(sum(case when ii.weight is null then coalesce(ii.quantity,0) else 0 end),0)::numeric units_sold,
    coalesce(sum(coalesce(ii.weight,0)),0)::numeric weight_sold,
    count(ii.id)::bigint line_count
  from public.pos_invoices i
  join public.pos_invoice_items ii on ii.invoice_id=i.id
  where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
),
ret_base as (
  select
    count(*)::bigint return_count,
    coalesce(sum(ret.total_amount),0)::numeric returned_value,
    coalesce(sum(ret.refund_loyalty_amount),0)::numeric loyalty_restored,
    coalesce(sum(coalesce(ret.refund_cash_amount,0)+coalesce(ret.refund_card_amount,0)),0)::numeric customer_refunds
  from public.returns ret
  where ret.branch_id=p_branch_id and ret.source='pos' and ret.status='approved'
    and coalesce(ret.approved_at,ret.created_at)>=p_from and coalesce(ret.approved_at,ret.created_at)<p_to
),
ret_cost as (
  select
    coalesce(sum(coalesce(ri.purchase_price,0)*coalesce(ri.quantity,0)),0)::numeric returned_cogs,
    coalesce(sum(coalesce(ri.profit_loss,0)),0)::numeric saved_profit_impact,
    coalesce(sum(coalesce(ri.quantity,0)),0)::numeric returned_measure
  from public.returns ret
  join public.return_items ri on ri.return_id=ret.id
  where ret.branch_id=p_branch_id and ret.source='pos' and ret.status='approved'
    and coalesce(ret.approved_at,ret.created_at)>=p_from and coalesce(ret.approved_at,ret.created_at)<p_to
),
online_base as (
  select
    count(*)::bigint order_count,
    coalesce(sum(o.total),0)::numeric order_total,
    coalesce(sum(coalesce(o.shipping_cost,0)),0)::numeric shipping_revenue,
    coalesce(sum(greatest(o.total-coalesce(o.shipping_cost,0),0)),0)::numeric merchandise_sales,
    coalesce(sum(coalesce(o.loyalty_voucher_amount,0)),0)::numeric loyalty_discounts
  from public.online_orders o
  where o.branch_id=p_branch_id and o.status::text='delivered' and o.payment_status::text='paid'
    and o.created_at>=p_from and o.created_at<p_to
),
expense_base as (
  select coalesce(sum(e.amount),0)::numeric expenses
  from public.expenses e
  where e.branch_id=p_branch_id and coalesce(e.status,'active')='active' and e.date>=p_from and e.date<p_to
),
c as (
  select pb.*,pc.*,rb.*,rc.*,ob.order_count,ob.order_total,ob.shipping_revenue,ob.merchandise_sales,
    ob.loyalty_discounts online_loyalty_discounts,eb.expenses,
    (pb.sales_after_loyalty-rb.customer_refunds)::numeric pos_net_sales,
    (pc.cogs-rc.returned_cogs)::numeric pos_net_cogs
  from pos_base pb cross join pos_cost pc cross join ret_base rb cross join ret_cost rc cross join online_base ob cross join expense_base eb
)
select jsonb_build_object(
  'pos_transactions',invoice_count,
  'online_transactions',order_count,
  'transactions',invoice_count+order_count,
  'pos_gross_sales',round(gross_sales,2),
  'online_gross_sales',round(order_total,2),
  'gross_sales',round(gross_sales+order_total,2),
  'product_discounts',round(product_discounts,2),
  'loyalty_discounts',round(loyalty_discounts+online_loyalty_discounts,2),
  'returns',round(customer_refunds,2),
  'return_count',return_count,
  'pos_net_sales',round(pos_net_sales,2),
  'online_net_sales',round(order_total,2),
  'net_sales',round(pos_net_sales+order_total,2),
  'average_ticket',case when invoice_count+order_count>0 then round((pos_net_sales+order_total)/(invoice_count+order_count),2) else 0 end,
  'items_sold',round(units_sold+weight_sold-returned_measure,3),
  'merchant_payment_fees',round(merchant_fees,2),
  'customer_payment_fees',round(customer_fees,2),
  'expenses',case when p_can_finance then round(expenses,2) else 0 end,
  'can_view_profit',p_can_profit,
  'profit_scope','pos_only',
  'online_profit_complete',false,
  'pos_net_cogs',case when p_can_profit then round(pos_net_cogs,2) else null end,
  'pos_gross_profit',case when p_can_profit then round(pos_net_sales-pos_net_cogs,2) else null end,
  'pos_profit_after_payment_fees',case when p_can_profit then round(pos_net_sales-pos_net_cogs-merchant_fees,2) else null end,
  'known_operating_result',case when p_can_profit and p_can_finance then round(pos_net_sales-pos_net_cogs-merchant_fees-expenses,2) else null end,
  'return_rate',case when sales_after_loyalty>0 then round((customer_refunds/sales_after_loyalty)*100,2) else 0 end,
  'pos_sales_after_loyalty',round(sales_after_loyalty,2),
  'pos_customer_amount_charged',round(amount_charged,2),
  'pos_returned_cogs',case when p_can_profit then round(returned_cogs,2) else null end,
  'online_shipping_revenue',round(shipping_revenue,2),
  'online_merchandise_sales',round(merchandise_sales,2)
)
from c;
$function$;

create or replace function public.get_reporting_overview_v2(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_span interval;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
  v_branch_name text;
  v_can_profit boolean;
  v_can_finance boolean;
  v_current jsonb;
  v_previous jsonb;
  v_daily jsonb;
  v_payments jsonb;
  v_top_products jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then raise exception using errcode='42501',message='REPORTS_VIEW_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;

  select b.name into v_branch_name from public.branches b where b.id=p_branch_id;
  if v_branch_name is null then raise exception using errcode='22023',message='BRANCH_NOT_FOUND'; end if;

  v_can_profit:=public.staff_has_permission('reports.profit',p_branch_id);
  v_can_finance:=public.staff_has_permission('finance.view',p_branch_id) or v_can_profit;
  v_span:=p_to-p_from;
  v_prev_to:=p_from;
  v_prev_from:=p_from-v_span;

  v_current:=private.reporting_range_snapshot(p_branch_id,p_from,p_to,v_can_profit,v_can_finance);
  v_previous:=private.reporting_range_snapshot(p_branch_id,v_prev_from,v_prev_to,v_can_profit,v_can_finance);

  with report_dates as (
    select generate_series(
      date_trunc('day',timezone('Africa/Cairo',p_from))::date,
      date_trunc('day',timezone('Africa/Cairo',p_to-interval '1 microsecond'))::date,
      interval '1 day'
    )::date as report_date
  ),
  pos as (
    select timezone('Africa/Cairo',i.sale_date)::date report_date,
      sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0))::numeric sales
    from public.pos_invoices i
    where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
    group by 1
  ),
  ret as (
    select timezone('Africa/Cairo',coalesce(r.approved_at,r.created_at))::date report_date,
      sum(coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0))::numeric refunds
    from public.returns r
    where r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
    group by 1
  ),
  online as (
    select timezone('Africa/Cairo',o.created_at)::date report_date,sum(o.total)::numeric sales
    from public.online_orders o
    where o.branch_id=p_branch_id and o.status::text='delivered' and o.payment_status::text='paid'
      and o.created_at>=p_from and o.created_at<p_to
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date',d.report_date,
    'pos_sales',round(coalesce(p.sales,0),2),
    'online_sales',round(coalesce(o.sales,0),2),
    'returns',round(coalesce(r.refunds,0),2),
    'net_sales',round(coalesce(p.sales,0)-coalesce(r.refunds,0)+coalesce(o.sales,0),2)
  ) order by d.report_date),'[]'::jsonb)
  into v_daily
  from report_dates d left join pos p using(report_date) left join ret r using(report_date) left join online o using(report_date);

  with raw_methods as (
    select
      coalesce(nullif(i.payment_method_code,''),pm.code,i.payment_method,'other') code,
      coalesce(nullif(i.payment_method_name,''),pm.name,case when i.payment_method='cash' then 'نقدي' when i.payment_method='card' then 'بطاقة بنكية' else 'وسيلة دفع' end) name,
      coalesce(i.payment_method_type,pm.method_type,case when i.payment_method='cash' then 'cash' when i.payment_method='card' then 'card' else 'other' end) method_type,
      coalesce(i.amount_charged,greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0))::numeric charged,
      coalesce(i.payment_fee_amount,0)::numeric fee,
      coalesce(i.customer_payment_fee_amount,0)::numeric customer_fee,
      coalesce(i.merchant_payment_fee_amount,0)::numeric merchant_fee
    from public.pos_invoices i
    left join public.pos_payment_methods pm on pm.id=i.payment_method_id
    where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
  ),
  methods as (
    select code,name,method_type,count(*)::bigint sale_count,
      sum(charged)::numeric charged,sum(fee)::numeric fee,sum(customer_fee)::numeric customer_fee,sum(merchant_fee)::numeric merchant_fee
    from raw_methods group by code,name,method_type
  ),
  refund_by_method as (
    select coalesce(nullif(s.payment_method_code,''),pm.code,s.payment_method,'other') code,
      sum(case when coalesce(pm.method_type,case when s.payment_method='cash' then 'cash' else 'card' end)='cash'
        then coalesce(r.refund_cash_amount,0) else coalesce(r.refund_card_amount,0) end)::numeric refunds
    from public.returns r
    join public.sales s on s.id=r.sale_id
    left join public.pos_payment_methods pm on pm.id=s.payment_method_id
    where r.branch_id=p_branch_id and r.source='pos' and r.status='approved' and r.refund_status='completed'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'code',m.code,'name',m.name,'method_type',m.method_type,'sale_count',m.sale_count,
    'gross_collected',round(m.charged,2),'refunds',round(coalesce(rb.refunds,0),2),
    'net_collected',round(m.charged-m.fee-coalesce(rb.refunds,0),2),
    'customer_fees',round(m.customer_fee,2),'merchant_fees',round(m.merchant_fee,2)
  ) order by case when m.method_type='cash' then 0 else 1 end,m.name),'[]'::jsonb)
  into v_payments
  from methods m left join refund_by_method rb using(code);

  with sold as (
    select ii.product_id,max(ii.product_name) product_name,
      sum(case when ii.weight is not null then ii.weight else coalesce(ii.quantity,0) end)::numeric sold_quantity,
      sum(ii.line_total)::numeric sold_revenue,
      sum(ii.line_total-(coalesce(ii.purchase_price,0)*case when ii.weight is not null then ii.weight else coalesce(ii.quantity,0) end))::numeric sold_profit
    from public.pos_invoices i join public.pos_invoice_items ii on ii.invoice_id=i.id
    where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
    group by ii.product_id
  ), returned as (
    select ri.product_id,
      sum(coalesce(ri.quantity,0))::numeric returned_quantity,
      sum(coalesce(ri.total,0))::numeric returned_revenue,
      sum(coalesce(ri.profit_loss,0))::numeric returned_profit
    from public.returns r join public.return_items ri on ri.return_id=r.id
    where r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
    group by ri.product_id
  ), combined as (
    select coalesce(s.product_id,r.product_id) product_id,
      coalesce(s.product_name,p.name,'منتج') product_name,
      coalesce(s.sold_quantity,0)-coalesce(r.returned_quantity,0) quantity,
      coalesce(s.sold_revenue,0)-coalesce(r.returned_revenue,0) revenue,
      coalesce(s.sold_profit,0)-coalesce(r.returned_profit,0) profit
    from sold s full join returned r on r.product_id=s.product_id
    left join public.products p on p.id=coalesce(s.product_id,r.product_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',product_id,'product_name',product_name,'quantity',round(quantity,3),'revenue',round(revenue,2),
    'profit',case when v_can_profit then round(profit,2) else null end
  ) order by revenue desc,product_name),'[]'::jsonb)
  into v_top_products
  from (select * from combined where revenue<>0 order by revenue desc,product_name limit 8) x;

  return jsonb_build_object(
    'version',2,
    'branch_id',p_branch_id,
    'branch_name',v_branch_name,
    'from',p_from,
    'to',p_to,
    'previous_from',v_prev_from,
    'previous_to',v_prev_to,
    'current',v_current,
    'previous',v_previous,
    'daily',v_daily,
    'payments',v_payments,
    'top_products',v_top_products,
    'data_quality',jsonb_build_object(
      'pos_source','pos_invoices_v2',
      'pos_profit_source','pos_invoice_items.purchase_price_snapshot',
      'returns_source','approved_pos_returns',
      'online_revenue_source','delivered_paid_online_orders',
      'online_profit_complete',false
    )
  );
end;
$function$;

revoke all on function public.get_reporting_overview_v2(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_reporting_overview_v2(uuid,timestamptz,timestamptz) to authenticated;

comment on function public.get_reporting_overview_v2(uuid,timestamptz,timestamptz) is 'Reporting V2 executive overview. Uses POS invoice snapshots, approved POS returns, dynamic payment data, delivered/paid online orders and active expenses. The comparison period has the same duration immediately before the requested range.';
