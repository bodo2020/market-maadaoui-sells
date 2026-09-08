-- Reporting V2: returns analytics plus supporting report indexes.
-- The payment report function is finalized in the immediately following
-- 20260908182021 migration to mirror the final production contract.

create index if not exists returns_branch_approved_created_idx
  on public.returns(branch_id, approved_at desc, created_at desc);

create index if not exists payment_settlements_branch_settled_idx
  on public.payment_settlements(branch_id, settled_at desc);

create index if not exists operations_tasks_branch_type_status_idx
  on public.operations_tasks(branch_id, task_type, status, created_at desc);

create or replace function public.get_reporting_returns_v2(
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
  v_can_profit boolean;
  v_summary jsonb := '{}'::jsonb;
  v_daily jsonb := '[]'::jsonb;
  v_reasons jsonb := '[]'::jsonb;
  v_payments jsonb := '[]'::jsonb;
  v_cashiers jsonb := '[]'::jsonb;
  v_top_products jsonb := '[]'::jsonb;
  v_recent jsonb := '[]'::jsonb;
  v_pending_tasks jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;
  if p_branch_id is null then
    raise exception using errcode='22023', message='BRANCH_REQUIRED';
  end if;
  if not public.staff_has_permission('reports.view', p_branch_id) then
    raise exception using errcode='42501', message='REPORTS_VIEW_DENIED';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception using errcode='22023', message='INVALID_REPORT_RANGE';
  end if;
  if p_to - p_from > interval '732 days' then
    raise exception using errcode='22023', message='REPORT_RANGE_TOO_LARGE';
  end if;

  v_can_profit := public.staff_has_permission('reports.profit', p_branch_id);

  with rb as (
    select
      r.*,
      coalesce(r.approved_at,r.created_at) as event_at,
      i.invoice_number,
      i.cashier_id,
      i.cashier_name,
      coalesce(nullif(i.payment_method_code,''), nullif(o.payment_method,''), r.refund_method, 'other') as payment_code,
      coalesce(nullif(i.payment_method_name,''), nullif(o.payment_method,''), r.refund_method, 'غير محدد') as payment_name,
      coalesce(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0), o.total, 0)::numeric as original_value
    from public.returns r
    left join public.pos_invoices i on i.sale_id=r.sale_id
    left join public.online_orders o on o.id=r.order_id
    where r.branch_id=p_branch_id
      and coalesce(r.approved_at,r.created_at)>=p_from
      and coalesce(r.approved_at,r.created_at)<p_to
  ),
  item_totals as (
    select ri.return_id,
      count(*)::bigint as item_lines,
      coalesce(sum(ri.quantity),0)::numeric as returned_quantity,
      coalesce(sum(ri.purchase_price*ri.quantity),0)::numeric as returned_cogs,
      coalesce(sum(ri.profit_loss),0)::numeric as profit_impact
    from public.return_items ri
    join rb on rb.id=ri.return_id
    group by ri.return_id
  ),
  completed_tasks as (
    select t.return_id,
      max(t.completed_at) as completed_at
    from public.operations_tasks t
    where t.branch_id=p_branch_id and t.task_type='refund_transfer' and t.status='completed' and t.return_id is not null
    group by t.return_id
  ),
  pending_current as (
    select count(*)::bigint as pending_count,coalesce(sum(t.amount),0)::numeric as pending_amount
    from public.operations_tasks t
    where t.branch_id=p_branch_id and t.task_type='refund_transfer' and t.status not in ('completed','cancelled')
  )
  select jsonb_build_object(
    'total_requests',count(*)::bigint,
    'approved_count',count(*) filter(where rb.status='approved')::bigint,
    'approved_value',round(coalesce(sum(rb.total_amount) filter(where rb.status='approved'),0),2),
    'completed_refund_value',round(coalesce(sum(coalesce(rb.refund_cash_amount,0)+coalesce(rb.refund_card_amount,0)) filter(where rb.status='approved' and rb.refund_status='completed'),0),2),
    'loyalty_restored',round(coalesce(sum(rb.refund_loyalty_amount) filter(where rb.status='approved'),0),2),
    'rejected_count',count(*) filter(where rb.status='rejected')::bigint,
    'pending_review_count',count(*) filter(where rb.status not in ('approved','rejected'))::bigint,
    'full_return_count',count(*) filter(where rb.status='approved' and rb.original_value>0 and rb.total_amount >= rb.original_value*0.999)::bigint,
    'partial_return_count',count(*) filter(where rb.status='approved' and rb.original_value>0 and rb.total_amount < rb.original_value*0.999)::bigint,
    'returned_cogs',case when v_can_profit then round(coalesce(sum(it.returned_cogs) filter(where rb.status='approved'),0),2) else null end,
    'profit_impact',case when v_can_profit then round(coalesce(sum(it.profit_impact) filter(where rb.status='approved'),0),2) else null end,
    'avg_transfer_minutes',round(coalesce(avg(extract(epoch from (ct.completed_at-coalesce(rb.approved_at,rb.created_at)))/60.0) filter(where ct.completed_at is not null),0),1),
    'pending_refund_tasks',coalesce((select pending_count from pending_current),0),
    'pending_refund_amount',round(coalesce((select pending_amount from pending_current),0),2)
  ) into v_summary
  from rb
  left join item_totals it on it.return_id=rb.id
  left join completed_tasks ct on ct.return_id=rb.id;

  with dates as (
    select generate_series(
      timezone('Africa/Cairo',p_from)::date,
      timezone('Africa/Cairo',p_to-interval '1 microsecond')::date,
      interval '1 day'
    )::date as report_date
  ),
  grouped as (
    select timezone('Africa/Cairo',coalesce(r.approved_at,r.created_at))::date as report_date,
      count(*) filter(where r.status='approved')::bigint as approved_count,
      coalesce(sum(r.total_amount) filter(where r.status='approved'),0)::numeric as returned_value,
      coalesce(sum(coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0)) filter(where r.status='approved' and r.refund_status='completed'),0)::numeric as refunded_value
    from public.returns r
    where r.branch_id=p_branch_id
      and coalesce(r.approved_at,r.created_at)>=p_from
      and coalesce(r.approved_at,r.created_at)<p_to
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date',d.report_date,
    'approved_count',coalesce(g.approved_count,0),
    'returned_value',round(coalesce(g.returned_value,0),2),
    'refunded_value',round(coalesce(g.refunded_value,0),2)
  ) order by d.report_date),'[]'::jsonb)
  into v_daily
  from dates d left join grouped g using(report_date);

  select coalesce(jsonb_agg(jsonb_build_object(
    'reason',x.reason,'returns',x.returns,'value',round(x.value,2)
  ) order by x.value desc,x.returns desc),'[]'::jsonb)
  into v_reasons
  from (
    select coalesce(nullif(trim(r.reason),''),'بدون سبب محدد') as reason,
      count(*)::bigint as returns,coalesce(sum(r.total_amount),0)::numeric as value
    from public.returns r
    where r.branch_id=p_branch_id and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
    group by 1 order by value desc limit 20
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code',x.code,'name',x.name,'returns',x.returns,'value',round(x.value,2),'refund_value',round(x.refund_value,2)
  ) order by x.value desc),'[]'::jsonb)
  into v_payments
  from (
    select lower(coalesce(nullif(i.payment_method_code,''),nullif(o.payment_method,''),r.refund_method,'other')) as code,
      max(coalesce(nullif(i.payment_method_name,''),nullif(o.payment_method,''),r.refund_method,'غير محدد')) as name,
      count(*)::bigint as returns,
      coalesce(sum(r.total_amount),0)::numeric as value,
      coalesce(sum(coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0)),0)::numeric as refund_value
    from public.returns r
    left join public.pos_invoices i on i.sale_id=r.sale_id
    left join public.online_orders o on o.id=r.order_id
    where r.branch_id=p_branch_id and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
    group by 1
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'cashier_id',x.cashier_id,'cashier_name',x.cashier_name,'returns',x.returns,'value',round(x.value,2)
  ) order by x.value desc),'[]'::jsonb)
  into v_cashiers
  from (
    select i.cashier_id,coalesce(nullif(i.cashier_name,''),'غير معروف') as cashier_name,
      count(*)::bigint as returns,coalesce(sum(r.total_amount),0)::numeric as value
    from public.returns r
    join public.pos_invoices i on i.sale_id=r.sale_id
    where r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
    group by i.cashier_id,coalesce(nullif(i.cashier_name,''),'غير معروف')
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',x.product_id,'product_name',x.product_name,
    'quantity',round(x.quantity,3),'value',round(x.value,2),
    'returned_cogs',case when v_can_profit then round(x.returned_cogs,2) else null end,
    'profit_impact',case when v_can_profit then round(x.profit_impact,2) else null end
  ) order by x.value desc),'[]'::jsonb)
  into v_top_products
  from (
    select ri.product_id,coalesce(max(p.name),'منتج غير متاح') as product_name,
      coalesce(sum(ri.quantity),0)::numeric as quantity,
      coalesce(sum(ri.total),0)::numeric as value,
      coalesce(sum(ri.purchase_price*ri.quantity),0)::numeric as returned_cogs,
      coalesce(sum(ri.profit_loss),0)::numeric as profit_impact
    from public.returns r
    join public.return_items ri on ri.return_id=r.id
    left join public.products p on p.id=ri.product_id
    where r.branch_id=p_branch_id and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
    group by ri.product_id
    order by value desc limit 20
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'source',x.source,'document_number',x.document_number,
    'customer_name',x.customer_name,'cashier_name',x.cashier_name,
    'reason',x.reason,'status',x.status,'refund_status',x.refund_status,
    'payment_name',x.payment_name,'return_type',x.return_type,
    'total_amount',round(x.total_amount,2),'money_refund',round(x.money_refund,2),
    'loyalty_refund',round(x.loyalty_refund,2),'item_lines',x.item_lines,
    'profit_impact',case when v_can_profit then round(x.profit_impact,2) else null end,
    'event_at',x.event_at
  ) order by x.event_at desc),'[]'::jsonb)
  into v_recent
  from (
    select r.id,r.source,
      coalesce(i.invoice_number,o.id::text,r.id::text) as document_number,
      coalesce(nullif(r.customer_name,''),c.name) as customer_name,
      i.cashier_name,
      coalesce(nullif(r.reason,''),'بدون سبب محدد') as reason,
      r.status,r.refund_status,
      coalesce(nullif(i.payment_method_name,''),nullif(o.payment_method,''),r.refund_method,'غير محدد') as payment_name,
      case
        when r.status='approved' and coalesce(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0),o.total,0)>0
          and r.total_amount >= coalesce(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0),o.total,0)*0.999 then 'full'
        when r.status='approved' then 'partial'
        else 'n/a'
      end as return_type,
      r.total_amount,
      coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0) as money_refund,
      coalesce(r.refund_loyalty_amount,0) as loyalty_refund,
      coalesce(it.item_lines,0) as item_lines,
      coalesce(it.profit_impact,0) as profit_impact,
      coalesce(r.approved_at,r.created_at) as event_at
    from public.returns r
    left join public.pos_invoices i on i.sale_id=r.sale_id
    left join public.online_orders o on o.id=r.order_id
    left join public.customers c on c.id=r.customer_id
    left join (
      select ri.return_id,count(*)::bigint item_lines,coalesce(sum(ri.profit_loss),0)::numeric profit_impact
      from public.return_items ri group by ri.return_id
    ) it on it.return_id=r.id
    where r.branch_id=p_branch_id
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
    order by coalesce(r.approved_at,r.created_at) desc
    limit 50
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'return_id',x.return_id,'source_kind',x.source_kind,
    'payment_method_code',x.payment_method_code,'payment_method_name',x.payment_method_name,
    'amount',round(x.amount,2),'priority',x.priority,'status',x.status,
    'title',x.title,'due_at',x.due_at,'created_at',x.created_at
  ) order by x.created_at asc),'[]'::jsonb)
  into v_pending_tasks
  from (
    select t.* from public.operations_tasks t
    where t.branch_id=p_branch_id and t.task_type='refund_transfer' and t.status not in ('completed','cancelled')
    order by t.created_at asc limit 50
  ) x;

  return jsonb_build_object(
    'version',2,
    'branch_id',p_branch_id,
    'from',p_from,
    'to',p_to,
    'permissions',jsonb_build_object('can_view_profit',v_can_profit),
    'summary',coalesce(v_summary,'{}'::jsonb),
    'daily',coalesce(v_daily,'[]'::jsonb),
    'reasons',coalesce(v_reasons,'[]'::jsonb),
    'payments',coalesce(v_payments,'[]'::jsonb),
    'cashiers',coalesce(v_cashiers,'[]'::jsonb),
    'top_products',coalesce(v_top_products,'[]'::jsonb),
    'recent',coalesce(v_recent,'[]'::jsonb),
    'pending_tasks',coalesce(v_pending_tasks,'[]'::jsonb),
    'data_quality',jsonb_build_object(
      'returns_source','returns',
      'items_source','return_items',
      'refund_task_source','operations_tasks_refund_transfer',
      'profit_source','return_items.purchase_price_and_profit_loss'
    )
  );
end;
$function$;

revoke all on function public.get_reporting_returns_v2(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.get_reporting_returns_v2(uuid,timestamptz,timestamptz) to authenticated, service_role;
