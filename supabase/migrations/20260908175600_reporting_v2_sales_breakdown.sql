create or replace function public.get_reporting_sales_v2(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_channel text default 'all',
  p_cashier_id uuid default null,
  p_payment_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_channel text := lower(coalesce(nullif(trim(p_channel),''),'all'));
  v_hourly jsonb := '[]'::jsonb;
  v_cashiers jsonb := '[]'::jsonb;
  v_payments jsonb := '[]'::jsonb;
  v_recent jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then raise exception using errcode='42501',message='REPORTS_VIEW_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;
  if v_channel not in ('all','pos','online') then raise exception using errcode='22023',message='INVALID_CHANNEL'; end if;

  with pos_filtered as (
    select i.* from public.pos_invoices i
    where v_channel in ('all','pos') and i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (p_payment_code is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=lower(p_payment_code))
  ), pos_returns as (
    select coalesce(sum(coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0)),0)::numeric refunds,count(*)::bigint return_count
    from public.returns r join public.pos_invoices i on i.sale_id=r.sale_id
    where v_channel in ('all','pos') and r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (p_payment_code is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=lower(p_payment_code))
  ), online_filtered as (
    select o.* from public.online_orders o
    where v_channel in ('all','online') and p_cashier_id is null and p_payment_code is null
      and o.branch_id=p_branch_id and o.status::text='delivered' and o.payment_status::text='paid' and o.created_at>=p_from and o.created_at<p_to
  ), totals as (
    select (select count(*) from pos_filtered)::bigint pos_transactions,(select count(*) from online_filtered)::bigint online_transactions,
      coalesce((select sum(greatest(total-coalesce(loyalty_voucher_amount,0),0)) from pos_filtered),0)::numeric pos_sales,
      coalesce((select sum(total) from online_filtered),0)::numeric online_sales,
      coalesce((select sum(discount) from pos_filtered),0)::numeric product_discounts,
      coalesce((select sum(loyalty_voucher_amount) from pos_filtered),0)::numeric loyalty_discounts,
      coalesce((select sum(merchant_payment_fee_amount) from pos_filtered),0)::numeric merchant_fees,
      coalesce((select sum(customer_payment_fee_amount) from pos_filtered),0)::numeric customer_fees,
      (select refunds from pos_returns)::numeric refunds,(select return_count from pos_returns)::bigint return_count
  )
  select jsonb_build_object(
    'pos_transactions',pos_transactions,'online_transactions',online_transactions,'transactions',pos_transactions+online_transactions,
    'pos_sales',round(pos_sales,2),'online_sales',round(online_sales,2),'gross_sales',round(pos_sales+online_sales,2),
    'refunds',round(refunds,2),'net_sales',round(pos_sales+online_sales-refunds,2),'return_count',return_count,
    'product_discounts',round(product_discounts,2),'loyalty_discounts',round(loyalty_discounts,2),
    'merchant_payment_fees',round(merchant_fees,2),'customer_payment_fees',round(customer_fees,2),
    'average_ticket',case when pos_transactions+online_transactions=0 then 0 else round((pos_sales+online_sales-refunds)/(pos_transactions+online_transactions),2) end
  ) into v_summary from totals;

  with hours as (select generate_series(0,23) as hr), events as (
    select extract(hour from timezone('Africa/Cairo',i.sale_date))::int hr,count(*)::bigint transactions,
      sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0))::numeric sales,0::numeric refunds
    from public.pos_invoices i
    where v_channel in ('all','pos') and i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (p_payment_code is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=lower(p_payment_code))
    group by 1
    union all
    select extract(hour from timezone('Africa/Cairo',o.created_at))::int,count(*)::bigint,sum(o.total)::numeric,0::numeric
    from public.online_orders o
    where v_channel in ('all','online') and p_cashier_id is null and p_payment_code is null
      and o.branch_id=p_branch_id and o.status::text='delivered' and o.payment_status::text='paid' and o.created_at>=p_from and o.created_at<p_to group by 1
    union all
    select extract(hour from timezone('Africa/Cairo',coalesce(r.approved_at,r.created_at)))::int,0::bigint,0::numeric,
      sum(coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0))::numeric
    from public.returns r join public.pos_invoices i on i.sale_id=r.sale_id
    where v_channel in ('all','pos') and r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (p_payment_code is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=lower(p_payment_code)) group by 1
  ), grouped as (select hr,sum(transactions)::bigint transactions,sum(sales)::numeric sales,sum(refunds)::numeric refunds from events group by hr)
  select coalesce(jsonb_agg(jsonb_build_object('hour',h.hr,'transactions',coalesce(g.transactions,0),'sales',round(coalesce(g.sales,0),2),
    'refunds',round(coalesce(g.refunds,0),2),'net_sales',round(coalesce(g.sales,0)-coalesce(g.refunds,0),2)) order by h.hr),'[]'::jsonb)
  into v_hourly from hours h left join grouped g using(hr);

  with sold as (
    select i.cashier_id,coalesce(nullif(max(i.cashier_name),''),'غير معروف') cashier_name,count(*)::bigint invoices,
      sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0))::numeric sales,sum(coalesce(i.discount,0))::numeric discounts,
      sum(coalesce(i.loyalty_voucher_amount,0))::numeric loyalty,sum(coalesce(i.merchant_payment_fee_amount,0))::numeric merchant_fees
    from public.pos_invoices i
    where v_channel in ('all','pos') and i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (p_payment_code is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=lower(p_payment_code)) group by i.cashier_id
  ), returned as (
    select i.cashier_id,count(*)::bigint returns,sum(coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0))::numeric refunds
    from public.returns r join public.pos_invoices i on i.sale_id=r.sale_id
    where v_channel in ('all','pos') and r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (p_payment_code is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=lower(p_payment_code)) group by i.cashier_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('cashier_id',s.cashier_id,'cashier_name',s.cashier_name,'invoices',s.invoices,
    'gross_sales',round(s.sales,2),'refunds',round(coalesce(r.refunds,0),2),'net_sales',round(s.sales-coalesce(r.refunds,0),2),
    'returns',coalesce(r.returns,0),'average_ticket',case when s.invoices=0 then 0 else round((s.sales-coalesce(r.refunds,0))/s.invoices,2) end,
    'discounts',round(s.discounts,2),'loyalty_discounts',round(s.loyalty,2),'merchant_fees',round(s.merchant_fees,2))
    order by s.sales-coalesce(r.refunds,0) desc),'[]'::jsonb) into v_cashiers from sold s left join returned r using(cashier_id);

  with methods as (
    select lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other')) code,
      max(coalesce(nullif(i.payment_method_name,''),pm.name,case when i.payment_method='cash' then 'نقدي' when i.payment_method='card' then 'بطاقة بنكية' else 'وسيلة دفع' end)) name,
      max(coalesce(i.payment_method_type,pm.method_type,case when i.payment_method='cash' then 'cash' when i.payment_method='card' then 'card' else 'other' end)) method_type,
      count(*)::bigint transactions,sum(coalesce(i.amount_charged,greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)))::numeric collected,
      sum(coalesce(i.merchant_payment_fee_amount,0))::numeric merchant_fees
    from public.pos_invoices i left join public.pos_payment_methods pm on pm.id=i.payment_method_id
    where v_channel in ('all','pos') and i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (p_payment_code is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=lower(p_payment_code)) group by 1
  ), refund_methods as (
    select lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other')) code,
      sum(case when coalesce(i.payment_method_type,pm.method_type,case when i.payment_method='cash' then 'cash' else 'card' end)='cash'
        then coalesce(r.refund_cash_amount,0) else coalesce(r.refund_card_amount,0) end)::numeric refunds
    from public.returns r join public.pos_invoices i on i.sale_id=r.sale_id left join public.pos_payment_methods pm on pm.id=i.payment_method_id
    where v_channel in ('all','pos') and r.branch_id=p_branch_id and r.source='pos' and r.status='approved' and r.refund_status='completed'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (p_payment_code is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=lower(p_payment_code)) group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('code',m.code,'name',m.name,'method_type',m.method_type,'transactions',m.transactions,
    'gross_collected',round(m.collected,2),'refunds',round(coalesce(r.refunds,0),2),'merchant_fees',round(m.merchant_fees,2),
    'net_collected',round(m.collected-m.merchant_fees-coalesce(r.refunds,0),2)) order by m.collected desc),'[]'::jsonb)
  into v_payments from methods m left join refund_methods r using(code);

  with rows as (
    select 'pos'::text channel,i.sale_id::text entity_id,i.invoice_number::text reference,i.sale_date occurred_at,
      coalesce(i.cashier_name,'غير معروف') actor_name,coalesce(i.payment_method_name,i.payment_method,'وسيلة دفع') payment_name,
      greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)::numeric amount
    from public.pos_invoices i
    where v_channel in ('all','pos') and i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (p_payment_code is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=lower(p_payment_code))
    union all
    select 'online',o.id::text,o.id::text,o.created_at,'أونلاين',coalesce(o.payment_method,'أونلاين'),o.total::numeric
    from public.online_orders o
    where v_channel in ('all','online') and p_cashier_id is null and p_payment_code is null
      and o.branch_id=p_branch_id and o.status::text='delivered' and o.payment_status::text='paid' and o.created_at>=p_from and o.created_at<p_to
  )
  select coalesce(jsonb_agg(jsonb_build_object('channel',channel,'entity_id',entity_id,'reference',reference,'occurred_at',occurred_at,
    'actor_name',actor_name,'payment_name',payment_name,'amount',round(amount,2)) order by occurred_at desc),'[]'::jsonb)
  into v_recent from (select * from rows order by occurred_at desc limit 30) x;

  return jsonb_build_object('version',2,'branch_id',p_branch_id,'from',p_from,'to',p_to,
    'filters',jsonb_build_object('channel',v_channel,'cashier_id',p_cashier_id,'payment_code',p_payment_code),
    'summary',v_summary,'hourly',v_hourly,'cashiers',v_cashiers,'payments',v_payments,'recent',v_recent);
end;
$function$;

revoke all on function public.get_reporting_sales_v2(uuid,timestamptz,timestamptz,text,uuid,text) from public,anon;
grant execute on function public.get_reporting_sales_v2(uuid,timestamptz,timestamptz,text,uuid,text) to authenticated,service_role;
