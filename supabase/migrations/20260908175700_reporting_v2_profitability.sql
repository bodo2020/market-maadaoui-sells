create or replace function public.get_reporting_profitability_v2(
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
  v_snapshot jsonb;
  v_daily jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.staff_has_permission('reports.profit',p_branch_id) then raise exception using errcode='42501',message='REPORTS_PROFIT_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;

  v_snapshot:=private.reporting_range_snapshot(p_branch_id,p_from,p_to,true,true);

  with report_dates as (
    select generate_series(timezone('Africa/Cairo',p_from)::date,timezone('Africa/Cairo',p_to-interval '1 microsecond')::date,interval '1 day')::date report_date
  ), sales_by_day as (
    select timezone('Africa/Cairo',i.sale_date)::date report_date,
      sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0))::numeric sales,
      sum(coalesce(i.merchant_payment_fee_amount,0))::numeric fees
    from public.pos_invoices i
    where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to group by 1
  ), cogs_by_day as (
    select timezone('Africa/Cairo',i.sale_date)::date report_date,
      sum(coalesce(ii.purchase_price,0)*case when ii.weight is not null then ii.weight else coalesce(ii.quantity,0) end)::numeric cogs
    from public.pos_invoices i join public.pos_invoice_items ii on ii.invoice_id=i.id
    where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to group by 1
  ), returns_by_day as (
    select timezone('Africa/Cairo',coalesce(r.approved_at,r.created_at))::date report_date,
      sum(coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0))::numeric refunds
    from public.returns r
    where r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to group by 1
  ), return_cogs_by_day as (
    select timezone('Africa/Cairo',coalesce(r.approved_at,r.created_at))::date report_date,
      sum(coalesce(ri.purchase_price,0)*coalesce(ri.quantity,0))::numeric returned_cogs
    from public.returns r join public.return_items ri on ri.return_id=r.id
    where r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to group by 1
  ), expenses_by_day as (
    select timezone('Africa/Cairo',e.date)::date report_date,sum(e.amount)::numeric expenses
    from public.expenses e
    where e.branch_id=p_branch_id and coalesce(e.status,'active')='active' and e.date>=p_from and e.date<p_to group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date',d.report_date,
    'net_sales',round(coalesce(s.sales,0)-coalesce(r.refunds,0),2),
    'net_cogs',round(coalesce(c.cogs,0)-coalesce(rc.returned_cogs,0),2),
    'gross_profit',round((coalesce(s.sales,0)-coalesce(r.refunds,0))-(coalesce(c.cogs,0)-coalesce(rc.returned_cogs,0)),2),
    'payment_fees',round(coalesce(s.fees,0),2),
    'expenses',round(coalesce(e.expenses,0),2),
    'known_operating_result',round((coalesce(s.sales,0)-coalesce(r.refunds,0))-(coalesce(c.cogs,0)-coalesce(rc.returned_cogs,0))-coalesce(s.fees,0)-coalesce(e.expenses,0),2)
  ) order by d.report_date),'[]'::jsonb) into v_daily
  from report_dates d
  left join sales_by_day s using(report_date)
  left join cogs_by_day c using(report_date)
  left join returns_by_day r using(report_date)
  left join return_cogs_by_day rc using(report_date)
  left join expenses_by_day e using(report_date);

  return jsonb_build_object(
    'version',2,'branch_id',p_branch_id,'from',p_from,'to',p_to,
    'summary',v_snapshot,
    'waterfall',jsonb_build_array(
      jsonb_build_object('key','pos_net_sales','label','صافي مبيعات POS','value',coalesce((v_snapshot->>'pos_net_sales')::numeric,0)),
      jsonb_build_object('key','cogs','label','تكلفة البضاعة','value',-coalesce((v_snapshot->>'pos_net_cogs')::numeric,0)),
      jsonb_build_object('key','gross_profit','label','إجمالي الربح','value',coalesce((v_snapshot->>'pos_gross_profit')::numeric,0)),
      jsonb_build_object('key','payment_fees','label','رسوم وسائل الدفع','value',-coalesce((v_snapshot->>'merchant_payment_fees')::numeric,0)),
      jsonb_build_object('key','expenses','label','المصروفات','value',-coalesce((v_snapshot->>'expenses')::numeric,0)),
      jsonb_build_object('key','known_operating_result','label','النتيجة التشغيلية المعروفة','value',coalesce((v_snapshot->>'known_operating_result')::numeric,0))
    ),
    'daily',v_daily,
    'online_profit_complete',false,
    'note','Online revenue is excluded from profit until authoritative online item cost snapshots are available.'
  );
end;
$function$;

revoke all on function public.get_reporting_profitability_v2(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_reporting_profitability_v2(uuid,timestamptz,timestamptz) to authenticated,service_role;
