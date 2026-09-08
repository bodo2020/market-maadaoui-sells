-- Reporting V2 costs/suppliers baseline. This file contains the final corrected
-- salary-window implementation so clean installs converge to production state.
create or replace function public.get_reporting_costs_v2(
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
  v_can_costs boolean := false;
  v_summary jsonb := '{}'::jsonb;
  v_expense_types jsonb := '[]'::jsonb;
  v_suppliers jsonb := '[]'::jsonb;
  v_expenses jsonb := '[]'::jsonb;
  v_purchases jsonb := '[]'::jsonb;
  v_salaries jsonb := '[]'::jsonb;
  v_from_date date;
  v_to_date date;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then raise exception using errcode='42501',message='REPORTS_VIEW_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;

  v_can_costs := public.staff_has_permission('reports.profit',p_branch_id);
  v_from_date := (p_from at time zone 'Africa/Cairo')::date;
  v_to_date := ((p_to-interval '1 microsecond') at time zone 'Africa/Cairo')::date;

  with ex as (
    select count(*)::bigint records,
      count(*) filter(where status='active')::bigint active_records,
      count(*) filter(where status='voided')::bigint voided_records,
      coalesce(sum(amount) filter(where status='active'),0)::numeric active_amount,
      coalesce(sum(amount) filter(where status='voided'),0)::numeric voided_amount
    from public.expenses where branch_id=p_branch_id and date>=p_from and date<p_to
  ), sal as (
    select count(*) filter(where status='paid' and payment_date between v_from_date and v_to_date)::bigint paid_records,
      coalesce(sum(amount) filter(where status='paid' and payment_date between v_from_date and v_to_date),0)::numeric paid_amount,
      count(*) filter(where status<>'paid')::bigint pending_records,
      coalesce(sum(amount) filter(where status<>'paid'),0)::numeric pending_amount
    from public.salaries where branch_id=p_branch_id
  ), pur as (
    select count(*)::bigint purchase_count,coalesce(sum(total),0)::numeric purchase_total,
      coalesce(sum(paid),0)::numeric paid_total,coalesce(sum(total-paid),0)::numeric outstanding_created
    from public.purchases where branch_id=p_branch_id and date>=p_from and date<p_to
  ), life_pur as (
    select count(distinct supplier_id) filter(where supplier_id is not null)::bigint suppliers_with_history,
      coalesce(sum(total-paid),0)::numeric lifetime_outstanding
    from public.purchases where branch_id=p_branch_id
  )
  select jsonb_build_object(
    'expense_records',ex.records,'active_expense_records',ex.active_records,'voided_expense_records',ex.voided_records,
    'active_expense_amount',case when v_can_costs then round(ex.active_amount,2) else null end,
    'voided_expense_amount',case when v_can_costs then round(ex.voided_amount,2) else null end,
    'salary_paid_records',sal.paid_records,'salary_paid_amount',case when v_can_costs then round(sal.paid_amount,2) else null end,
    'salary_pending_records',sal.pending_records,'salary_pending_amount',case when v_can_costs then round(sal.pending_amount,2) else null end,
    'purchase_count',pur.purchase_count,'purchase_total',case when v_can_costs then round(pur.purchase_total,2) else null end,
    'purchase_paid_total',case when v_can_costs then round(pur.paid_total,2) else null end,
    'purchase_outstanding_created',case when v_can_costs then round(pur.outstanding_created,2) else null end,
    'suppliers_with_branch_history',life_pur.suppliers_with_history,
    'lifetime_supplier_outstanding',case when v_can_costs then round(life_pur.lifetime_outstanding,2) else null end,
    'operating_cash_out_in_period',case when v_can_costs then round(ex.active_amount+sal.paid_amount+pur.paid_total,2) else null end
  ) into v_summary from ex,sal,pur,life_pur;

  select coalesce(jsonb_agg(jsonb_build_object(
    'type',type_name,'records',records,'amount',case when v_can_costs then round(amount,2) else null end
  ) order by amount desc,type_name),'[]'::jsonb)
  into v_expense_types
  from (
    select coalesce(nullif(btrim(type),''),'غير مصنف') type_name,count(*)::bigint records,coalesce(sum(amount),0)::numeric amount
    from public.expenses
    where branch_id=p_branch_id and status='active' and date>=p_from and date<p_to
    group by coalesce(nullif(btrim(type),''),'غير مصنف')
  ) x;

  with branch_supplier as (
    select p.supplier_id,count(*)::bigint lifetime_purchase_count,coalesce(sum(p.total),0)::numeric lifetime_purchase_total,
      coalesce(sum(p.paid),0)::numeric lifetime_paid,coalesce(sum(p.total-p.paid),0)::numeric lifetime_outstanding,max(p.date) last_purchase_at
    from public.purchases p where p.branch_id=p_branch_id and p.supplier_id is not null group by p.supplier_id
  ), period_supplier as (
    select p.supplier_id,count(*)::bigint purchase_count,coalesce(sum(p.total),0)::numeric purchase_total,
      coalesce(sum(p.paid),0)::numeric paid_total,coalesce(sum(p.total-p.paid),0)::numeric outstanding_created
    from public.purchases p where p.branch_id=p_branch_id and p.supplier_id is not null and p.date>=p_from and p.date<p_to group by p.supplier_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'supplier_id',b.supplier_id,'supplier_name',coalesce(nullif(s.name,''),'مورد غير متاح'),'phone',s.phone,
    'period_purchase_count',coalesce(p.purchase_count,0),'period_purchase_total',case when v_can_costs then round(coalesce(p.purchase_total,0),2) else null end,
    'period_paid_total',case when v_can_costs then round(coalesce(p.paid_total,0),2) else null end,
    'period_outstanding_created',case when v_can_costs then round(coalesce(p.outstanding_created,0),2) else null end,
    'lifetime_purchase_count',b.lifetime_purchase_count,'lifetime_purchase_total',case when v_can_costs then round(b.lifetime_purchase_total,2) else null end,
    'lifetime_paid',case when v_can_costs then round(b.lifetime_paid,2) else null end,
    'lifetime_outstanding',case when v_can_costs then round(b.lifetime_outstanding,2) else null end,'last_purchase_at',b.last_purchase_at
  ) order by coalesce(p.purchase_total,0) desc,b.last_purchase_at desc nulls last),'[]'::jsonb)
  into v_suppliers from branch_supplier b left join period_supplier p using(supplier_id) left join public.suppliers s on s.id=b.supplier_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'expense_id',e.id,'type',e.type,'description',e.description,'date',e.date,'status',e.status,'payment_method',e.payment_method,
    'amount',case when v_can_costs then round(e.amount,2) else null end,'receipt_url',case when v_can_costs then e.receipt_url else null end
  ) order by e.date desc),'[]'::jsonb)
  into v_expenses
  from (select * from public.expenses where branch_id=p_branch_id and date>=p_from and date<p_to order by date desc limit v_limit) e;

  select coalesce(jsonb_agg(jsonb_build_object(
    'purchase_id',p.id,'supplier_id',p.supplier_id,'supplier_name',coalesce(nullif(s.name,''),'مورد غير محدد'),'invoice_number',p.invoice_number,'date',p.date,
    'total',case when v_can_costs then round(p.total,2) else null end,'paid',case when v_can_costs then round(p.paid,2) else null end,
    'outstanding',case when v_can_costs then round(p.total-p.paid,2) else null end,'description',p.description
  ) order by p.date desc),'[]'::jsonb)
  into v_purchases
  from (select * from public.purchases where branch_id=p_branch_id and date>=p_from and date<p_to order by date desc limit v_limit) p
  left join public.suppliers s on s.id=p.supplier_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'salary_id',x.id,'employee_id',x.employee_id,'employee_name',x.employee_name,'month',x.month,'year',x.year,'status',x.status,
    'payment_date',x.payment_date,'amount',case when v_can_costs then round(x.amount,2) else null end,'notes',case when v_can_costs then x.notes else null end
  ) order by x.payment_date desc nulls last,x.year desc,x.month desc),'[]'::jsonb)
  into v_salaries
  from (
    select s.*,coalesce(nullif(u.name,''),'موظف غير متاح') employee_name
    from public.salaries s left join public.users u on u.id=s.employee_id
    where s.branch_id=p_branch_id
      and ((s.status='paid' and s.payment_date between v_from_date and v_to_date)
        or (s.created_at>=p_from and s.created_at<p_to))
    order by s.payment_date desc nulls last,s.created_at desc
    limit v_limit
  ) x;

  return jsonb_build_object(
    'version',2,'branch_id',p_branch_id,'from',p_from,'to',p_to,
    'permissions',jsonb_build_object('can_view_costs',v_can_costs),
    'summary',coalesce(v_summary,'{}'::jsonb),'expense_types',coalesce(v_expense_types,'[]'::jsonb),
    'suppliers',coalesce(v_suppliers,'[]'::jsonb),'expenses',coalesce(v_expenses,'[]'::jsonb),
    'purchases',coalesce(v_purchases,'[]'::jsonb),'salaries',coalesce(v_salaries,'[]'::jsonb),
    'data_quality',jsonb_build_object(
      'supplier_master_branch_scoped',false,'supplier_balance_used',false,
      'supplier_balance_reason','suppliers.balance is global and not branch-scoped; branch outstanding is calculated only from purchases.total-paid',
      'purchase_cost_source','purchases snapshot totals',
      'salary_cashflow_semantics','paid salaries are included by Cairo-local payment_date inside selected range',
      'expense_semantics','only status=active contributes to operating expense amount'
    )
  );
end;
$function$;

revoke all on function public.get_reporting_costs_v2(uuid,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.get_reporting_costs_v2(uuid,timestamptz,timestamptz,integer) to authenticated,service_role;
