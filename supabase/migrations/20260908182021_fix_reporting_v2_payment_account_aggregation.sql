-- Final Reporting V2 payment contract. This definition supersedes the
-- intermediate payment aggregation created on production immediately before it.

create or replace function public.get_reporting_payments_v2(
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
  v_can_finance boolean;
  v_methods jsonb := '[]'::jsonb;
  v_daily jsonb := '[]'::jsonb;
  v_recent_settlements jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501', message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023', message='BRANCH_REQUIRED'; end if;
  if not public.staff_has_permission('reports.view', p_branch_id) then raise exception using errcode='42501', message='REPORTS_VIEW_DENIED'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception using errcode='22023', message='INVALID_REPORT_RANGE'; end if;
  if p_to - p_from > interval '732 days' then raise exception using errcode='22023', message='REPORT_RANGE_TOO_LARGE'; end if;

  v_can_finance := public.staff_has_permission('finance.view', p_branch_id);

  with configured as (
    select lower(pm.code) as code,
      max(pm.name) as name,
      max(pm.method_type) as method_type,
      bool_or(pm.active) as active,
      max(pm.fee_type) as fee_type,
      max(pm.fee_value) as fee_value,
      max(pm.fee_bearer) as fee_bearer,
      min(pm.settlement_account_id::text)::uuid as settlement_account_id
    from public.pos_payment_methods pm
    where pm.branch_id = p_branch_id
    group by lower(pm.code)
  ),
  pos_sales as (
    select lower(coalesce(nullif(i.payment_method_code,''), i.payment_method, 'other')) as code,
      max(coalesce(nullif(i.payment_method_name,''), case when i.payment_method='cash' then 'نقدي' when i.payment_method='card' then 'بطاقة بنكية' else 'وسيلة دفع' end)) as name,
      max(coalesce(i.payment_method_type, case when i.payment_method='cash' then 'cash' when i.payment_method='card' then 'card' else 'other' end)) as method_type,
      count(*)::bigint as transactions,
      coalesce(sum(coalesce(i.amount_charged, greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0))),0)::numeric as gross_collected,
      coalesce(sum(i.payment_fee_amount),0)::numeric as payment_fees,
      coalesce(sum(i.customer_payment_fee_amount),0)::numeric as customer_fees,
      coalesce(sum(i.merchant_payment_fee_amount),0)::numeric as merchant_fees
    from public.pos_invoices i
    where i.branch_id = p_branch_id and i.sale_date >= p_from and i.sale_date < p_to
    group by lower(coalesce(nullif(i.payment_method_code,''), i.payment_method, 'other'))
  ),
  online_sales as (
    select lower(coalesce(nullif(o.payment_method,''),'other')) as code,
      max(coalesce(nullif(o.payment_method,''),'دفع أونلاين')) as name,
      'online'::text as method_type,
      count(*)::bigint as transactions,
      coalesce(sum(o.total),0)::numeric as gross_collected,
      0::numeric as payment_fees,0::numeric as customer_fees,0::numeric as merchant_fees
    from public.online_orders o
    where o.branch_id = p_branch_id and o.status::text='delivered' and o.payment_status::text='paid'
      and o.created_at>=p_from and o.created_at<p_to
    group by lower(coalesce(nullif(o.payment_method,''),'other'))
  ),
  sales_union as (select * from pos_sales union all select * from online_sales),
  sales as (
    select code,max(name) name,max(method_type) method_type,
      sum(transactions)::bigint transactions,sum(gross_collected)::numeric gross_collected,
      sum(payment_fees)::numeric payment_fees,sum(customer_fees)::numeric customer_fees,sum(merchant_fees)::numeric merchant_fees
    from sales_union group by code
  ),
  pos_refunds as (
    select lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other')) code,
      count(*)::bigint refund_count,
      coalesce(sum(case when coalesce(i.payment_method_type,case when i.payment_method='cash' then 'cash' else 'card' end)='cash'
        then coalesce(r.refund_cash_amount,0) else coalesce(r.refund_card_amount,0) end),0)::numeric refunds
    from public.returns r join public.pos_invoices i on i.sale_id=r.sale_id
    where r.branch_id=p_branch_id and r.source='pos' and r.status='approved' and r.refund_status='completed'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
    group by 1
  ),
  online_refunds as (
    select lower(coalesce(nullif(o.payment_method,''),'other')) code,
      count(*)::bigint refund_count,
      coalesce(sum(coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0)),0)::numeric refunds
    from public.returns r join public.online_orders o on o.id=r.order_id
    where r.branch_id=p_branch_id and r.source<>'pos' and r.status='approved' and r.refund_status='completed'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
    group by 1
  ),
  refunds_union as (select * from pos_refunds union all select * from online_refunds),
  refunds as (select code,sum(refund_count)::bigint refund_count,sum(refunds)::numeric refunds from refunds_union group by code),
  pending_refunds as (
    select lower(coalesce(nullif(t.payment_method_code,''),'other')) code,count(*)::bigint pending_count,coalesce(sum(t.amount),0)::numeric pending_amount
    from public.operations_tasks t
    where t.branch_id=p_branch_id and t.task_type='refund_transfer' and t.status not in ('completed','cancelled')
    group by 1
  ),
  settlements as (
    select lower(coalesce(nullif(s.payment_method,''),'other')) code,count(*)::bigint settlement_count,
      coalesce(sum(s.gross_amount),0)::numeric settled_gross,coalesce(sum(s.fee_amount),0)::numeric settlement_fees,
      coalesce(sum(s.net_amount),0)::numeric settled_net,max(s.settled_at) latest_settlement_at
    from public.payment_settlements s
    where s.branch_id=p_branch_id and s.settled_at>=p_from and s.settled_at<p_to
    group by 1
  ),
  balances as (
    select c.code,coalesce(sum(l.signed_amount),0)::numeric live_account_balance
    from configured c left join public.payment_ledger l on l.account_id=c.settlement_account_id
    where c.settlement_account_id is not null group by c.code
  ),
  all_codes as (
    select code from configured union select code from sales union select code from refunds union select code from pending_refunds union select code from settlements
  ),
  rows as (
    select ac.code,
      coalesce(c.name,s.name,case when ac.code='cash' then 'نقدي' when ac.code='card' then 'بطاقة بنكية' else ac.code end) name,
      coalesce(c.method_type,s.method_type,'other') method_type,
      coalesce(c.active,false) active,c.fee_type,c.fee_value,c.fee_bearer,
      coalesce(s.transactions,0)::bigint transactions,coalesce(s.gross_collected,0)::numeric gross_collected,
      coalesce(s.payment_fees,0)::numeric payment_fees,coalesce(s.customer_fees,0)::numeric customer_fees,coalesce(s.merchant_fees,0)::numeric merchant_fees,
      coalesce(r.refund_count,0)::bigint refund_count,coalesce(r.refunds,0)::numeric refunds,
      coalesce(pr.pending_count,0)::bigint pending_refund_count,coalesce(pr.pending_amount,0)::numeric pending_refund_amount,
      (coalesce(s.gross_collected,0)-coalesce(s.payment_fees,0)-coalesce(r.refunds,0))::numeric net_period_movement,
      case when v_can_finance then coalesce(st.settlement_count,0) else null end settlement_count,
      case when v_can_finance then round(coalesce(st.settled_gross,0),2) else null end settled_gross,
      case when v_can_finance then round(coalesce(st.settlement_fees,0),2) else null end settlement_fees,
      case when v_can_finance then round(coalesce(st.settled_net,0),2) else null end settled_net,
      case when v_can_finance then st.latest_settlement_at else null end latest_settlement_at,
      case when v_can_finance and c.settlement_account_id is not null then round(coalesce(b.live_account_balance,0),2) else null end live_account_balance,
      case when v_can_finance and c.settlement_account_id is not null then round(coalesce(b.live_account_balance,0),2) else null end unsettled_balance
    from all_codes ac
    left join configured c using(code) left join sales s using(code) left join refunds r using(code)
    left join pending_refunds pr using(code) left join settlements st using(code) left join balances b using(code)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'code',code,'name',name,'method_type',method_type,'active',active,'fee_type',fee_type,'fee_value',fee_value,'fee_bearer',fee_bearer,
    'transactions',transactions,'gross_collected',round(gross_collected,2),'payment_fees',round(payment_fees,2),
    'customer_fees',round(customer_fees,2),'merchant_fees',round(merchant_fees,2),'refund_count',refund_count,'refunds',round(refunds,2),
    'pending_refund_count',pending_refund_count,'pending_refund_amount',round(pending_refund_amount,2),'net_period_movement',round(net_period_movement,2),
    'settlement_count',settlement_count,'settled_gross',settled_gross,'settlement_fees',settlement_fees,'settled_net',settled_net,
    'latest_settlement_at',latest_settlement_at,'live_account_balance',live_account_balance,'unsettled_balance',unsettled_balance
  ) order by case when method_type='cash' then 0 else 1 end,gross_collected desc,name),'[]'::jsonb)
  into v_methods from rows;

  with dates as (
    select generate_series(timezone('Africa/Cairo',p_from)::date,timezone('Africa/Cairo',p_to-interval '1 microsecond')::date,interval '1 day')::date report_date
  ),
  sales as (
    select timezone('Africa/Cairo',i.sale_date)::date report_date,
      sum(coalesce(i.amount_charged,greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)))::numeric gross,
      sum(coalesce(i.payment_fee_amount,0))::numeric fees
    from public.pos_invoices i where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to group by 1
    union all
    select timezone('Africa/Cairo',o.created_at)::date,sum(o.total)::numeric,0::numeric
    from public.online_orders o where o.branch_id=p_branch_id and o.status::text='delivered' and o.payment_status::text='paid'
      and o.created_at>=p_from and o.created_at<p_to group by 1
  ),
  sales_grouped as (select report_date,sum(gross)::numeric gross,sum(fees)::numeric fees from sales group by report_date),
  refunds as (
    select timezone('Africa/Cairo',coalesce(r.approved_at,r.created_at))::date report_date,
      sum(coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0))::numeric refunds
    from public.returns r where r.branch_id=p_branch_id and r.status='approved' and r.refund_status='completed'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('date',d.report_date,'gross_collected',round(coalesce(s.gross,0),2),
    'payment_fees',round(coalesce(s.fees,0),2),'refunds',round(coalesce(r.refunds,0),2),
    'net_movement',round(coalesce(s.gross,0)-coalesce(s.fees,0)-coalesce(r.refunds,0),2)) order by d.report_date),'[]'::jsonb)
  into v_daily from dates d left join sales_grouped s using(report_date) left join refunds r using(report_date);

  if v_can_finance then
    select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'payment_method',x.payment_method,'gross_amount',round(x.gross_amount,2),
      'fee_amount',round(x.fee_amount,2),'net_amount',round(x.net_amount,2),'provider_reference',x.provider_reference,
      'settled_at',x.settled_at,'note',x.note) order by x.settled_at desc),'[]'::jsonb)
    into v_recent_settlements
    from (select s.* from public.payment_settlements s where s.branch_id=p_branch_id and s.settled_at>=p_from and s.settled_at<p_to order by s.settled_at desc limit 30) x;
  end if;

  with m as (
    select * from jsonb_to_recordset(v_methods) as x(
      code text,name text,method_type text,active boolean,fee_type text,fee_value numeric,fee_bearer text,
      transactions bigint,gross_collected numeric,payment_fees numeric,customer_fees numeric,merchant_fees numeric,
      refund_count bigint,refunds numeric,pending_refund_count bigint,pending_refund_amount numeric,net_period_movement numeric,
      settlement_count bigint,settled_gross numeric,settlement_fees numeric,settled_net numeric,latest_settlement_at timestamptz,
      live_account_balance numeric,unsettled_balance numeric
    )
  )
  select jsonb_build_object(
    'transactions',coalesce(sum(transactions),0),'gross_collected',round(coalesce(sum(gross_collected),0),2),
    'payment_fees',round(coalesce(sum(payment_fees),0),2),'customer_fees',round(coalesce(sum(customer_fees),0),2),
    'merchant_fees',round(coalesce(sum(merchant_fees),0),2),'refund_count',coalesce(sum(refund_count),0),
    'refunds',round(coalesce(sum(refunds),0),2),'pending_refund_count',coalesce(sum(pending_refund_count),0),
    'pending_refund_amount',round(coalesce(sum(pending_refund_amount),0),2),'net_period_movement',round(coalesce(sum(net_period_movement),0),2),
    'settled_net',case when v_can_finance then round(coalesce(sum(settled_net),0),2) else null end,
    'live_electronic_balance',case when v_can_finance then round(coalesce(sum(live_account_balance),0),2) else null end
  ) into v_summary from m;

  return jsonb_build_object('version',2,'branch_id',p_branch_id,'from',p_from,'to',p_to,
    'permissions',jsonb_build_object('can_view_finance',v_can_finance),'summary',coalesce(v_summary,'{}'::jsonb),
    'methods',coalesce(v_methods,'[]'::jsonb),'daily',coalesce(v_daily,'[]'::jsonb),'recent_settlements',coalesce(v_recent_settlements,'[]'::jsonb),
    'data_quality',jsonb_build_object('sales_source','pos_invoices_v2_plus_delivered_paid_online_orders','refund_source','approved_completed_returns',
      'balance_source','payment_ledger','settlement_source','payment_settlements'));
end;
$function$;

revoke all on function public.get_reporting_payments_v2(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.get_reporting_payments_v2(uuid,timestamptz,timestamptz) to authenticated, service_role;
