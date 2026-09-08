drop function if exists public.get_reporting_sales_v2(uuid,timestamptz,timestamptz,text,uuid,text);
drop function if exists public.get_sales_report_v2(uuid,timestamptz,timestamptz,text,uuid,text,text,integer,integer);

create function public.get_reporting_sales_v2(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_channel text default 'all',
  p_cashier_id uuid default null,
  p_payment_code text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_channel text:=lower(coalesce(nullif(trim(p_channel),''),'all'));
  v_payment text:=lower(nullif(trim(coalesce(p_payment_code,'')),''));
  v_search text:=nullif(trim(coalesce(p_search,'')),'');
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),200);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_summary jsonb;
  v_hourly jsonb;
  v_cashiers jsonb;
  v_payments jsonb;
  v_rows jsonb;
  v_total bigint:=0;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then raise exception using errcode='42501',message='REPORTS_VIEW_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;
  if v_channel not in ('all','pos','online') then raise exception using errcode='22023',message='INVALID_REPORT_CHANNEL'; end if;

  with pos as (
    select i.*,
      coalesce(nullif(i.payment_method_code,''),i.payment_method,'other') effective_payment_code,
      greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)::numeric recognized_sale
    from public.pos_invoices i
    where v_channel in ('all','pos')
      and i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (v_payment is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=v_payment)
      and (v_search is null or i.invoice_number ilike '%'||v_search||'%' or coalesce(i.customer_name,'') ilike '%'||v_search||'%' or coalesce(i.customer_phone,'') ilike '%'||v_search||'%' or coalesce(i.cashier_name,'') ilike '%'||v_search||'%')
  ),
  online as (
    select o.*,c.name customer_name,c.phone customer_phone,lower(coalesce(nullif(o.payment_method,''),'other')) effective_payment_code
    from public.online_orders o
    left join public.customers c on c.id=o.customer_id
    where v_channel in ('all','online') and p_cashier_id is null
      and o.branch_id=p_branch_id and o.status::text='delivered' and o.payment_status::text='paid'
      and o.created_at>=p_from and o.created_at<p_to
      and (v_payment is null or lower(coalesce(nullif(o.payment_method,''),'other'))=v_payment)
      and (v_search is null or o.id::text ilike '%'||v_search||'%' or coalesce(c.name,'') ilike '%'||v_search||'%' or coalesce(c.phone,'') ilike '%'||v_search||'%')
  ),
  refunds as (
    select r.sale_id,sum(coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0))::numeric amount,count(*)::bigint return_count
    from public.returns r
    join pos p on p.sale_id=r.sale_id
    where r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
    group by r.sale_id
  ),
  totals as (
    select
      (select count(*) from pos)::bigint pos_transactions,
      (select count(*) from online)::bigint online_transactions,
      (select coalesce(sum(total),0) from pos)::numeric pos_sales_before_loyalty,
      (select coalesce(sum(discount),0) from pos)::numeric product_discounts,
      (select coalesce(sum(loyalty_voucher_amount),0) from pos)::numeric loyalty_discounts,
      (select coalesce(sum(recognized_sale),0) from pos)::numeric pos_recognized_sales,
      (select coalesce(sum(total),0) from online)::numeric online_sales,
      (select coalesce(sum(amount),0) from refunds)::numeric refunds,
      (select coalesce(sum(return_count),0) from refunds)::bigint return_count,
      (select coalesce(sum(item_count),0) from pos)::numeric pos_item_lines
  )
  select jsonb_build_object(
    'pos_transactions',pos_transactions,
    'online_transactions',online_transactions,
    'transactions',pos_transactions+online_transactions,
    'pos_sales_before_loyalty',round(pos_sales_before_loyalty,2),
    'online_sales',round(online_sales,2),
    'product_discounts',round(product_discounts,2),
    'loyalty_discounts',round(loyalty_discounts,2),
    'refunds',round(refunds,2),
    'return_count',return_count,
    'net_sales',round(pos_recognized_sales+online_sales-refunds,2),
    'average_ticket',case when pos_transactions+online_transactions>0 then round((pos_recognized_sales+online_sales-refunds)/(pos_transactions+online_transactions),2) else 0 end,
    'pos_item_lines',pos_item_lines
  ) into v_summary from totals;

  with events as (
    select extract(hour from timezone('Africa/Cairo',i.sale_date))::int hr,
      count(*)::bigint transactions,
      sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0))::numeric sales,
      0::numeric refunds
    from public.pos_invoices i
    where v_channel in ('all','pos') and i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (v_payment is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=v_payment)
      and (v_search is null or i.invoice_number ilike '%'||v_search||'%' or coalesce(i.customer_name,'') ilike '%'||v_search||'%' or coalesce(i.customer_phone,'') ilike '%'||v_search||'%' or coalesce(i.cashier_name,'') ilike '%'||v_search||'%')
    group by 1
    union all
    select extract(hour from timezone('Africa/Cairo',o.created_at))::int,
      count(*)::bigint,sum(o.total)::numeric,0::numeric
    from public.online_orders o left join public.customers c on c.id=o.customer_id
    where v_channel in ('all','online') and p_cashier_id is null and o.branch_id=p_branch_id
      and o.status::text='delivered' and o.payment_status::text='paid' and o.created_at>=p_from and o.created_at<p_to
      and (v_payment is null or lower(coalesce(nullif(o.payment_method,''),'other'))=v_payment)
      and (v_search is null or o.id::text ilike '%'||v_search||'%' or coalesce(c.name,'') ilike '%'||v_search||'%' or coalesce(c.phone,'') ilike '%'||v_search||'%')
    group by 1
    union all
    select extract(hour from timezone('Africa/Cairo',coalesce(r.approved_at,r.created_at)))::int,
      0::bigint,0::numeric,sum(coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0))::numeric
    from public.returns r
    join public.pos_invoices i on i.sale_id=r.sale_id
    where v_channel in ('all','pos') and r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (v_payment is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=v_payment)
      and (v_search is null or i.invoice_number ilike '%'||v_search||'%' or coalesce(i.customer_name,'') ilike '%'||v_search||'%' or coalesce(i.customer_phone,'') ilike '%'||v_search||'%' or coalesce(i.cashier_name,'') ilike '%'||v_search||'%')
    group by 1
  ), hours as (select generate_series(0,23) hr), grouped as (
    select hr,sum(transactions)::bigint transactions,sum(sales)::numeric sales,sum(refunds)::numeric refunds from events group by hr
  )
  select coalesce(jsonb_agg(jsonb_build_object('hour',h.hr,'transactions',coalesce(g.transactions,0),'sales',round(coalesce(g.sales,0),2),'refunds',round(coalesce(g.refunds,0),2),'net_sales',round(coalesce(g.sales,0)-coalesce(g.refunds,0),2)) order by h.hr),'[]'::jsonb)
  into v_hourly from hours h left join grouped g using(hr);

  with base as (
    select i.cashier_id,coalesce(i.cashier_name,u.name,'كاشير') cashier_name,
      count(*)::bigint transactions,
      sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0))::numeric sales
    from public.pos_invoices i left join public.users u on u.id=i.cashier_id
    where v_channel in ('all','pos') and i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (v_payment is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=v_payment)
      and (v_search is null or i.invoice_number ilike '%'||v_search||'%' or coalesce(i.customer_name,'') ilike '%'||v_search||'%' or coalesce(i.customer_phone,'') ilike '%'||v_search||'%' or coalesce(i.cashier_name,'') ilike '%'||v_search||'%')
    group by i.cashier_id,coalesce(i.cashier_name,u.name,'كاشير')
  ), ref as (
    select i.cashier_id,sum(coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0))::numeric refunds
    from public.returns r join public.pos_invoices i on i.sale_id=r.sale_id
    where v_channel in ('all','pos') and r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (v_payment is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=v_payment)
    group by i.cashier_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('cashier_id',b.cashier_id,'cashier_name',b.cashier_name,'transactions',b.transactions,'sales',round(b.sales,2),'refunds',round(coalesce(r.refunds,0),2),'net_sales',round(b.sales-coalesce(r.refunds,0),2),'average_ticket',case when b.transactions>0 then round((b.sales-coalesce(r.refunds,0))/b.transactions,2) else 0 end) order by (b.sales-coalesce(r.refunds,0)) desc,b.cashier_name),'[]'::jsonb)
  into v_cashiers from base b left join ref r using(cashier_id);

  with p as (
    select lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other')) code,
      coalesce(nullif(i.payment_method_name,''),case when i.payment_method='cash' then 'نقدي' when i.payment_method='card' then 'بطاقة بنكية' else 'وسيلة دفع' end) name,
      coalesce(i.payment_method_type,case when i.payment_method='cash' then 'cash' when i.payment_method='card' then 'card' else 'other' end) method_type,
      count(*)::bigint transactions,sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0))::numeric sales
    from public.pos_invoices i
    where v_channel in ('all','pos') and i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (v_payment is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=v_payment)
    group by 1,2,3
  ), o as (
    select lower(coalesce(nullif(o.payment_method,''),'other')) code,
      coalesce(nullif(o.payment_method,''),'وسيلة دفع أونلاين') name,'online'::text method_type,
      count(*)::bigint transactions,sum(o.total)::numeric sales
    from public.online_orders o
    where v_channel in ('all','online') and p_cashier_id is null and o.branch_id=p_branch_id and o.status::text='delivered' and o.payment_status::text='paid'
      and o.created_at>=p_from and o.created_at<p_to
      and (v_payment is null or lower(coalesce(nullif(o.payment_method,''),'other'))=v_payment)
    group by 1,2
  ), x as (select * from p union all select * from o), g as (
    select code,max(name) name,max(method_type) method_type,sum(transactions)::bigint transactions,sum(sales)::numeric sales from x group by code
  )
  select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'method_type',method_type,'transactions',transactions,'sales',round(sales,2)) order by sales desc,name),'[]'::jsonb)
  into v_payments from g;

  with pos_refunds as (
    select r.sale_id,sum(coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0))::numeric refunds
    from public.returns r
    where r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
    group by r.sale_id
  ), unified as (
    select 'pos'::text channel,i.sale_id id,i.invoice_number document_number,i.sale_date occurred_at,
      i.cashier_id,i.cashier_name,i.customer_name,i.customer_phone,
      lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other')) payment_code,
      coalesce(nullif(i.payment_method_name,''),case when i.payment_method='cash' then 'نقدي' when i.payment_method='card' then 'بطاقة بنكية' else 'وسيلة دفع' end) payment_name,
      i.total::numeric gross_amount,coalesce(i.discount,0)::numeric product_discount,coalesce(i.loyalty_voucher_amount,0)::numeric loyalty_discount,
      greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)::numeric recognized_sale,coalesce(r.refunds,0)::numeric refunds,
      (greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)-coalesce(r.refunds,0))::numeric net_sale,
      coalesce(i.item_count,0)::int item_count
    from public.pos_invoices i left join pos_refunds r on r.sale_id=i.sale_id
    where v_channel in ('all','pos') and i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
      and (p_cashier_id is null or i.cashier_id=p_cashier_id)
      and (v_payment is null or lower(coalesce(nullif(i.payment_method_code,''),i.payment_method,'other'))=v_payment)
      and (v_search is null or i.invoice_number ilike '%'||v_search||'%' or coalesce(i.customer_name,'') ilike '%'||v_search||'%' or coalesce(i.customer_phone,'') ilike '%'||v_search||'%' or coalesce(i.cashier_name,'') ilike '%'||v_search||'%')
    union all
    select 'online',o.id,o.id::text,o.created_at,null::uuid,null::text,c.name,c.phone,
      lower(coalesce(nullif(o.payment_method,''),'other')),coalesce(nullif(o.payment_method,''),'دفع أونلاين'),
      o.total::numeric,0::numeric,coalesce(o.loyalty_voucher_amount,0)::numeric,o.total::numeric,0::numeric,o.total::numeric,
      case when jsonb_typeof(o.items)='array' then jsonb_array_length(o.items) else 0 end
    from public.online_orders o left join public.customers c on c.id=o.customer_id
    where v_channel in ('all','online') and p_cashier_id is null and o.branch_id=p_branch_id and o.status::text='delivered' and o.payment_status::text='paid'
      and o.created_at>=p_from and o.created_at<p_to
      and (v_payment is null or lower(coalesce(nullif(o.payment_method,''),'other'))=v_payment)
      and (v_search is null or o.id::text ilike '%'||v_search||'%' or coalesce(c.name,'') ilike '%'||v_search||'%' or coalesce(c.phone,'') ilike '%'||v_search||'%')
  ), counted as (select count(*)::bigint n from unified), paged as (
    select * from unified order by occurred_at desc,id desc limit v_limit offset v_offset
  )
  select (select n from counted),coalesce(jsonb_agg(jsonb_build_object(
    'channel',channel,'id',id,'document_number',document_number,'occurred_at',occurred_at,
    'cashier_id',cashier_id,'cashier_name',cashier_name,'customer_name',customer_name,'customer_phone',customer_phone,
    'payment_code',payment_code,'payment_name',payment_name,'gross_amount',round(gross_amount,2),
    'product_discount',round(product_discount,2),'loyalty_discount',round(loyalty_discount,2),
    'recognized_sale',round(recognized_sale,2),'refunds',round(refunds,2),'net_sale',round(net_sale,2),'item_count',item_count
  ) order by occurred_at desc,id desc),'[]'::jsonb)
  into v_total,v_rows from paged;

  return jsonb_build_object(
    'version',2,'branch_id',p_branch_id,'from',p_from,'to',p_to,
    'filters',jsonb_build_object('channel',v_channel,'cashier_id',p_cashier_id,'payment_code',v_payment,'search',v_search),
    'summary',coalesce(v_summary,'{}'::jsonb),'hourly',coalesce(v_hourly,'[]'::jsonb),
    'cashiers',coalesce(v_cashiers,'[]'::jsonb),'payment_methods',coalesce(v_payments,'[]'::jsonb),
    'rows',coalesce(v_rows,'[]'::jsonb),'pagination',jsonb_build_object('total',coalesce(v_total,0),'limit',v_limit,'offset',v_offset,'has_more',v_offset+v_limit<coalesce(v_total,0))
  );
end;
$function$;

revoke all on function public.get_reporting_sales_v2(uuid,timestamptz,timestamptz,text,uuid,text,text,integer,integer) from public,anon;
grant execute on function public.get_reporting_sales_v2(uuid,timestamptz,timestamptz,text,uuid,text,text,integer,integer) to authenticated,service_role;
comment on function public.get_reporting_sales_v2(uuid,timestamptz,timestamptz,text,uuid,text,text,integer,integer) is 'Reporting V2 detailed sales report with server-side channel/cashier/payment/search filters, hourly distribution, cashier performance and normalized POS/online rows.';