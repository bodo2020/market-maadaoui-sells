do $$ begin
  if not exists(select 1 from pg_constraint where conname='expenses_operating_treatment_only_v3' and conrelid='public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_operating_treatment_only_v3 check(accounting_treatment is null or accounting_treatment='opex') not valid;
    alter table public.expenses validate constraint expenses_operating_treatment_only_v3;
  end if;
end $$;

create or replace function private.reporting_range_snapshot(p_branch_id uuid,p_from timestamptz,p_to timestamptz,p_can_profit boolean,p_can_finance boolean)
returns jsonb language sql stable set search_path='' as $$
with pos_base as (
  select count(*)::bigint invoice_count,coalesce(sum(i.total),0)::numeric gross_sales,coalesce(sum(i.discount),0)::numeric product_discounts,
    coalesce(sum(i.loyalty_voucher_amount),0)::numeric loyalty_discounts,coalesce(sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)),0)::numeric sales_after_loyalty,
    coalesce(sum(coalesce(i.amount_charged,greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0))),0)::numeric amount_charged,
    coalesce(sum(i.customer_payment_fee_amount),0)::numeric customer_fees,coalesce(sum(i.merchant_payment_fee_amount),0)::numeric merchant_fees
  from public.pos_invoices i where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
), pos_cost as (
  select coalesce(sum(coalesce(ii.purchase_price,0)*case when ii.weight is not null then ii.weight else coalesce(ii.quantity,0) end),0)::numeric cogs,
    coalesce(sum(case when ii.weight is null then coalesce(ii.quantity,0) else 0 end),0)::numeric units_sold,coalesce(sum(coalesce(ii.weight,0)),0)::numeric weight_sold,count(ii.id)::bigint line_count
  from public.pos_invoices i join public.pos_invoice_items ii on ii.invoice_id=i.id where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to
), ret_base as (
  select count(*)::bigint return_count,coalesce(sum(ret.total_amount),0)::numeric returned_value,coalesce(sum(ret.refund_loyalty_amount),0)::numeric loyalty_restored,
    coalesce(sum(coalesce(ret.refund_cash_amount,0)+coalesce(ret.refund_card_amount,0)),0)::numeric customer_refunds
  from public.returns ret where ret.branch_id=p_branch_id and ret.source='pos' and ret.status='approved' and coalesce(ret.approved_at,ret.created_at)>=p_from and coalesce(ret.approved_at,ret.created_at)<p_to
), ret_cost as (
  select coalesce(sum(coalesce(ri.purchase_price,0)*coalesce(ri.quantity,0)),0)::numeric returned_cogs,coalesce(sum(coalesce(ri.profit_loss,0)),0)::numeric saved_profit_impact,
    coalesce(sum(coalesce(ri.quantity,0)),0)::numeric returned_measure
  from public.returns ret join public.return_items ri on ri.return_id=ret.id where ret.branch_id=p_branch_id and ret.source='pos' and ret.status='approved'
    and coalesce(ret.approved_at,ret.created_at)>=p_from and coalesce(ret.approved_at,ret.created_at)<p_to
), online_base as (
  select count(*)::bigint order_count,coalesce(sum(o.total),0)::numeric order_total,coalesce(sum(coalesce(o.shipping_cost,0)),0)::numeric shipping_revenue,
    coalesce(sum(greatest(o.total-coalesce(o.shipping_cost,0),0)),0)::numeric merchandise_sales,coalesce(sum(coalesce(o.loyalty_voucher_amount,0)),0)::numeric loyalty_discounts
  from public.online_orders o where o.branch_id=p_branch_id and o.status::text='delivered' and o.payment_status::text='paid' and o.created_at>=p_from and o.created_at<p_to
), expense_base as (
  select coalesce(sum(e.amount),0)::numeric expenses from public.expenses e
  where e.branch_id=p_branch_id and coalesce(e.status,'active')='active' and coalesce(e.accounting_treatment,'opex')='opex' and e.date>=p_from and e.date<p_to
), c as (
  select pb.*,pc.*,rb.*,rc.*,ob.order_count,ob.order_total,ob.shipping_revenue,ob.merchandise_sales,ob.loyalty_discounts online_loyalty_discounts,eb.expenses,
    (pb.sales_after_loyalty-rb.customer_refunds)::numeric pos_net_sales,(pc.cogs-rc.returned_cogs)::numeric pos_net_cogs
  from pos_base pb cross join pos_cost pc cross join ret_base rb cross join ret_cost rc cross join online_base ob cross join expense_base eb
)
select jsonb_build_object(
  'pos_transactions',invoice_count,'online_transactions',order_count,'transactions',invoice_count+order_count,
  'pos_gross_sales',round(gross_sales,2),'online_gross_sales',round(order_total,2),'gross_sales',round(gross_sales+order_total,2),
  'product_discounts',round(product_discounts,2),'loyalty_discounts',round(loyalty_discounts+online_loyalty_discounts,2),'returns',round(customer_refunds,2),'return_count',return_count,
  'pos_net_sales',round(pos_net_sales,2),'online_net_sales',round(order_total,2),'net_sales',round(pos_net_sales+order_total,2),
  'average_ticket',case when invoice_count+order_count>0 then round((pos_net_sales+order_total)/(invoice_count+order_count),2) else 0 end,
  'items_sold',round(units_sold+weight_sold-returned_measure,3),'merchant_payment_fees',round(merchant_fees,2),'customer_payment_fees',round(customer_fees,2),
  'expenses',case when p_can_finance then round(expenses,2) else 0 end,'can_view_profit',p_can_profit,'profit_scope','pos_only','online_profit_complete',false,
  'pos_net_cogs',case when p_can_profit then round(pos_net_cogs,2) else null end,'pos_gross_profit',case when p_can_profit then round(pos_net_sales-pos_net_cogs,2) else null end,
  'pos_profit_after_payment_fees',case when p_can_profit then round(pos_net_sales-pos_net_cogs-merchant_fees,2) else null end,
  'known_operating_result',case when p_can_profit and p_can_finance then round(pos_net_sales-pos_net_cogs-merchant_fees-expenses,2) else null end,
  'return_rate',case when sales_after_loyalty>0 then round((customer_refunds/sales_after_loyalty)*100,2) else 0 end,
  'pos_sales_after_loyalty',round(sales_after_loyalty,2),'pos_customer_amount_charged',round(amount_charged,2),'pos_returned_cogs',case when p_can_profit then round(returned_cogs,2) else null end,
  'online_shipping_revenue',round(shipping_revenue,2),'online_merchandise_sales',round(merchandise_sales,2)
) from c;
$$;

create or replace function public.get_reporting_profitability_v2(p_branch_id uuid,p_from timestamptz,p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_snapshot jsonb; v_daily jsonb:='[]'::jsonb; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.staff_has_permission('reports.profit',p_branch_id) then raise exception using errcode='42501',message='REPORTS_PROFIT_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;
  v_snapshot:=private.reporting_range_snapshot(p_branch_id,p_from,p_to,true,true);
  with report_dates as (
    select generate_series(timezone('Africa/Cairo',p_from)::date,timezone('Africa/Cairo',p_to-interval '1 microsecond')::date,interval '1 day')::date report_date
  ), sales_by_day as (
    select timezone('Africa/Cairo',i.sale_date)::date report_date,sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0))::numeric sales,sum(coalesce(i.merchant_payment_fee_amount,0))::numeric fees
    from public.pos_invoices i where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to group by 1
  ), cogs_by_day as (
    select timezone('Africa/Cairo',i.sale_date)::date report_date,sum(coalesce(ii.purchase_price,0)*case when ii.weight is not null then ii.weight else coalesce(ii.quantity,0) end)::numeric cogs
    from public.pos_invoices i join public.pos_invoice_items ii on ii.invoice_id=i.id where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to group by 1
  ), returns_by_day as (
    select timezone('Africa/Cairo',coalesce(r.approved_at,r.created_at))::date report_date,sum(coalesce(r.refund_cash_amount,0)+coalesce(r.refund_card_amount,0))::numeric refunds
    from public.returns r where r.branch_id=p_branch_id and r.source='pos' and r.status='approved' and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to group by 1
  ), return_cogs_by_day as (
    select timezone('Africa/Cairo',coalesce(r.approved_at,r.created_at))::date report_date,sum(coalesce(ri.purchase_price,0)*coalesce(ri.quantity,0))::numeric returned_cogs
    from public.returns r join public.return_items ri on ri.return_id=r.id where r.branch_id=p_branch_id and r.source='pos' and r.status='approved' and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to group by 1
  ), expenses_by_day as (
    select timezone('Africa/Cairo',e.date)::date report_date,sum(e.amount)::numeric expenses from public.expenses e
    where e.branch_id=p_branch_id and coalesce(e.status,'active')='active' and coalesce(e.accounting_treatment,'opex')='opex' and e.date>=p_from and e.date<p_to group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object('date',d.report_date,'net_sales',round(coalesce(s.sales,0)-coalesce(r.refunds,0),2),'net_cogs',round(coalesce(c.cogs,0)-coalesce(rc.returned_cogs,0),2),
    'gross_profit',round((coalesce(s.sales,0)-coalesce(r.refunds,0))-(coalesce(c.cogs,0)-coalesce(rc.returned_cogs,0)),2),'payment_fees',round(coalesce(s.fees,0),2),'expenses',round(coalesce(e.expenses,0),2),
    'known_operating_result',round((coalesce(s.sales,0)-coalesce(r.refunds,0))-(coalesce(c.cogs,0)-coalesce(rc.returned_cogs,0))-coalesce(s.fees,0)-coalesce(e.expenses,0),2)) order by d.report_date),'[]'::jsonb)
  into v_daily from report_dates d left join sales_by_day s using(report_date) left join cogs_by_day c using(report_date) left join returns_by_day r using(report_date) left join return_cogs_by_day rc using(report_date) left join expenses_by_day e using(report_date);
  return jsonb_build_object('version',2,'branch_id',p_branch_id,'from',p_from,'to',p_to,'summary',v_snapshot,
    'waterfall',jsonb_build_array(jsonb_build_object('key','pos_net_sales','label','صافي مبيعات POS','value',coalesce((v_snapshot->>'pos_net_sales')::numeric,0)),jsonb_build_object('key','cogs','label','تكلفة البضاعة','value',-coalesce((v_snapshot->>'pos_net_cogs')::numeric,0)),jsonb_build_object('key','gross_profit','label','إجمالي الربح','value',coalesce((v_snapshot->>'pos_gross_profit')::numeric,0)),jsonb_build_object('key','payment_fees','label','رسوم وسائل الدفع','value',-coalesce((v_snapshot->>'merchant_payment_fees')::numeric,0)),jsonb_build_object('key','expenses','label','المصروفات','value',-coalesce((v_snapshot->>'expenses')::numeric,0)),jsonb_build_object('key','known_operating_result','label','النتيجة التشغيلية المعروفة','value',coalesce((v_snapshot->>'known_operating_result')::numeric,0))),
    'daily',v_daily,'online_profit_complete',false,'note','Online revenue is excluded from profit until authoritative online item cost snapshots are available.');
end $$;

create or replace function public.get_reporting_costs_v2(p_branch_id uuid,p_from timestamptz,p_to timestamptz,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer:=least(greatest(coalesce(p_limit,100),10),200); v_can_costs boolean:=false; v_summary jsonb:='{}'::jsonb; v_expense_types jsonb:='[]'::jsonb; v_suppliers jsonb:='[]'::jsonb; v_expenses jsonb:='[]'::jsonb; v_purchases jsonb:='[]'::jsonb; v_salaries jsonb:='[]'::jsonb; v_from_date date; v_to_date date; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then raise exception using errcode='42501',message='REPORTS_VIEW_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;
  v_can_costs:=public.staff_has_permission('reports.profit',p_branch_id); v_from_date:=(p_from at time zone 'Africa/Cairo')::date; v_to_date:=((p_to-interval '1 microsecond') at time zone 'Africa/Cairo')::date;
  with ex as (
    select count(*)::bigint records,count(*) filter(where status='active')::bigint active_records,count(*) filter(where status='voided')::bigint voided_records,
      coalesce(sum(amount) filter(where status='active'),0)::numeric active_amount,coalesce(sum(amount) filter(where status='voided'),0)::numeric voided_amount
    from public.expenses where branch_id=p_branch_id and coalesce(accounting_treatment,'opex')='opex' and date>=p_from and date<p_to
  ), expense_cash as (
    select (
      coalesce((select sum(ep.amount) from private.expense_payments_v2 ep join private.expense_documents_v2 d on d.id=ep.expense_document_id where ep.branch_id=p_branch_id and ep.status='active' and d.accounting_treatment='opex' and ep.paid_at>=p_from and ep.paid_at<p_to),0)
      +coalesce((select sum(e.amount) from public.expenses e where e.branch_id=p_branch_id and e.expense_document_id is null and coalesce(e.accounting_treatment,'opex')='opex' and coalesce(e.status,'active')='active' and coalesce(e.payment_method,'')<>'employee_advance_settlement' and e.date>=p_from and e.date<p_to),0)
    )::numeric paid_amount
  ), sal as (
    select count(*) filter(where status='paid' and payment_date between v_from_date and v_to_date)::bigint paid_records,coalesce(sum(amount) filter(where status='paid' and payment_date between v_from_date and v_to_date),0)::numeric paid_amount,
      count(*) filter(where status<>'paid')::bigint pending_records,coalesce(sum(amount) filter(where status<>'paid'),0)::numeric pending_amount from public.salaries where branch_id=p_branch_id
  ), pur as (
    select count(*)::bigint purchase_count,coalesce(sum(total),0)::numeric purchase_total,coalesce(sum(paid),0)::numeric paid_total,coalesce(sum(total-paid),0)::numeric outstanding_created from public.purchases where branch_id=p_branch_id and date>=p_from and date<p_to
  ), life_pur as (
    select count(distinct supplier_id) filter(where supplier_id is not null)::bigint suppliers_with_history,coalesce(sum(total-paid),0)::numeric lifetime_outstanding from public.purchases where branch_id=p_branch_id
  )
  select jsonb_build_object('expense_records',ex.records,'active_expense_records',ex.active_records,'voided_expense_records',ex.voided_records,'active_expense_amount',case when v_can_costs then round(ex.active_amount,2) else null end,
    'voided_expense_amount',case when v_can_costs then round(ex.voided_amount,2) else null end,'expense_cash_paid_in_period',case when v_can_costs then round(ec.paid_amount,2) else null end,
    'salary_paid_records',sal.paid_records,'salary_paid_amount',case when v_can_costs then round(sal.paid_amount,2) else null end,'salary_pending_records',sal.pending_records,'salary_pending_amount',case when v_can_costs then round(sal.pending_amount,2) else null end,
    'purchase_count',pur.purchase_count,'purchase_total',case when v_can_costs then round(pur.purchase_total,2) else null end,'purchase_paid_total',case when v_can_costs then round(pur.paid_total,2) else null end,'purchase_outstanding_created',case when v_can_costs then round(pur.outstanding_created,2) else null end,
    'suppliers_with_branch_history',life_pur.suppliers_with_history,'lifetime_supplier_outstanding',case when v_can_costs then round(life_pur.lifetime_outstanding,2) else null end,
    'operating_cash_out_in_period',case when v_can_costs then round(ec.paid_amount+sal.paid_amount+pur.paid_total,2) else null end)
  into v_summary from ex cross join expense_cash ec cross join sal cross join pur cross join life_pur;
  select coalesce(jsonb_agg(jsonb_build_object('type',type_name,'records',records,'amount',case when v_can_costs then round(amount,2) else null end) order by amount desc,type_name),'[]'::jsonb) into v_expense_types
  from (select coalesce(nullif(btrim(type),''),'غير مصنف') type_name,count(*)::bigint records,coalesce(sum(amount),0)::numeric amount from public.expenses where branch_id=p_branch_id and status='active' and coalesce(accounting_treatment,'opex')='opex' and date>=p_from and date<p_to group by coalesce(nullif(btrim(type),''),'غير مصنف')) x;
  with branch_supplier as (
    select p.supplier_id,count(*)::bigint lifetime_purchase_count,coalesce(sum(p.total),0)::numeric lifetime_purchase_total,coalesce(sum(p.paid),0)::numeric lifetime_paid,coalesce(sum(p.total-p.paid),0)::numeric lifetime_outstanding,max(p.date) last_purchase_at from public.purchases p where p.branch_id=p_branch_id and p.supplier_id is not null group by p.supplier_id
  ), period_supplier as (
    select p.supplier_id,count(*)::bigint purchase_count,coalesce(sum(p.total),0)::numeric purchase_total,coalesce(sum(p.paid),0)::numeric paid_total,coalesce(sum(p.total-p.paid),0)::numeric outstanding_created from public.purchases p where p.branch_id=p_branch_id and p.supplier_id is not null and p.date>=p_from and p.date<p_to group by p.supplier_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('supplier_id',b.supplier_id,'supplier_name',coalesce(nullif(s.name,''),'مورد غير متاح'),'phone',s.phone,'period_purchase_count',coalesce(p.purchase_count,0),'period_purchase_total',case when v_can_costs then round(coalesce(p.purchase_total,0),2) else null end,'period_paid_total',case when v_can_costs then round(coalesce(p.paid_total,0),2) else null end,'period_outstanding_created',case when v_can_costs then round(coalesce(p.outstanding_created,0),2) else null end,'lifetime_purchase_count',b.lifetime_purchase_count,'lifetime_purchase_total',case when v_can_costs then round(b.lifetime_purchase_total,2) else null end,'lifetime_paid',case when v_can_costs then round(b.lifetime_paid,2) else null end,'lifetime_outstanding',case when v_can_costs then round(b.lifetime_outstanding,2) else null end,'last_purchase_at',b.last_purchase_at) order by coalesce(p.purchase_total,0) desc,b.last_purchase_at desc nulls last),'[]'::jsonb) into v_suppliers
  from branch_supplier b left join period_supplier p using(supplier_id) left join public.suppliers s on s.id=b.supplier_id;
  select coalesce(jsonb_agg(jsonb_build_object('expense_id',e.id,'type',e.type,'description',e.description,'date',e.date,'status',e.status,'payment_method',e.payment_method,'amount',case when v_can_costs then round(e.amount,2) else null end,'receipt_url',case when v_can_costs then e.receipt_url else null end) order by e.date desc),'[]'::jsonb) into v_expenses
  from (select * from public.expenses where branch_id=p_branch_id and coalesce(accounting_treatment,'opex')='opex' and date>=p_from and date<p_to order by date desc limit v_limit) e;
  select coalesce(jsonb_agg(jsonb_build_object('purchase_id',p.id,'supplier_id',p.supplier_id,'supplier_name',coalesce(nullif(s.name,''),'مورد غير محدد'),'invoice_number',p.invoice_number,'date',p.date,'total',case when v_can_costs then round(p.total,2) else null end,'paid',case when v_can_costs then round(p.paid,2) else null end,'outstanding',case when v_can_costs then round(p.total-p.paid,2) else null end,'description',p.description) order by p.date desc),'[]'::jsonb) into v_purchases
  from (select * from public.purchases where branch_id=p_branch_id and date>=p_from and date<p_to order by date desc limit v_limit) p left join public.suppliers s on s.id=p.supplier_id;
  select coalesce(jsonb_agg(jsonb_build_object('salary_id',x.id,'employee_id',x.employee_id,'employee_name',x.employee_name,'month',x.month,'year',x.year,'status',x.status,'payment_date',x.payment_date,'amount',case when v_can_costs then round(x.amount,2) else null end,'notes',case when v_can_costs then x.notes else null end) order by x.payment_date desc nulls last,x.year desc,x.month desc),'[]'::jsonb) into v_salaries
  from (select s.*,coalesce(nullif(u.name,''),'موظف غير متاح') employee_name from public.salaries s left join public.users u on u.id=s.employee_id where s.branch_id=p_branch_id and ((s.status='paid' and s.payment_date between v_from_date and v_to_date) or (s.created_at>=p_from and s.created_at<p_to)) order by s.payment_date desc nulls last,s.created_at desc limit v_limit) x;
  return jsonb_build_object('version',3,'branch_id',p_branch_id,'from',p_from,'to',p_to,'permissions',jsonb_build_object('can_view_costs',v_can_costs),'summary',coalesce(v_summary,'{}'::jsonb),'expense_types',coalesce(v_expense_types,'[]'::jsonb),'suppliers',coalesce(v_suppliers,'[]'::jsonb),'expenses',coalesce(v_expenses,'[]'::jsonb),'purchases',coalesce(v_purchases,'[]'::jsonb),'salaries',coalesce(v_salaries,'[]'::jsonb),
    'data_quality',jsonb_build_object('supplier_master_branch_scoped',false,'supplier_balance_used',false,'supplier_balance_reason','suppliers.balance is global and not branch-scoped; branch outstanding is calculated only from purchases.total-paid','purchase_cost_source','purchases snapshot totals','salary_cashflow_semantics','paid salaries are included by Cairo-local payment_date inside selected range','expense_semantics','P&L uses recognized OPEX only; cash-out uses active V2 expense payments plus legacy immediate expense rows and excludes advance settlements'));
end $$;

revoke all on function public.get_reporting_profitability_v2(uuid,timestamptz,timestamptz) from public,anon;
revoke all on function public.get_reporting_costs_v2(uuid,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.get_reporting_profitability_v2(uuid,timestamptz,timestamptz) to authenticated,service_role;
grant execute on function public.get_reporting_costs_v2(uuid,timestamptz,timestamptz,integer) to authenticated,service_role;
