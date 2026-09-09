-- HR Performance V1: cashier-specific metrics from POS Invoice V2 and shift reconciliations.
create or replace function public.get_hr_cashier_performance_v1(p_employee_id uuid,p_branch_id uuid,p_from date,p_to date)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_is_super boolean; v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_employee_id is null or p_branch_id is null then raise exception 'employee_and_branch_required'; end if;
  if p_from is null or p_to is null or p_from>p_to then raise exception 'invalid_date_range'; end if;
  if (p_to-p_from)>366 then raise exception 'date_range_too_large'; end if;
  v_is_super:=private.staff_is_super_admin(v_uid);
  if v_uid<>p_employee_id and not v_is_super and not (public.staff_has_permission('hr.view',p_branch_id) or public.staff_has_permission('branch.manage_staff',p_branch_id)) then raise exception 'permission_denied'; end if;
  if not v_is_super and not exists(select 1 from public.user_branch_roles ubr where ubr.user_id=p_employee_id and ubr.branch_id=p_branch_id and ubr.active) then raise exception 'employee_out_of_scope'; end if;

  with inv as (
    select count(*)::int invoice_count,coalesce(sum(i.total),0)::numeric sales_total,coalesce(avg(i.total),0)::numeric average_ticket,
      coalesce(sum(i.item_count),0)::bigint items_sold,coalesce(sum(i.discount),0)::numeric discounts,
      coalesce(sum(i.loyalty_voucher_amount),0)::numeric loyalty_voucher_amount,coalesce(sum(i.merchant_payment_fee_amount),0)::numeric merchant_payment_fees
    from public.pos_invoices i where i.cashier_id=p_employee_id and i.branch_id=p_branch_id and i.sale_date>=p_from::timestamptz and i.sale_date<(p_to+1)::timestamptz
  ), ret as (
    select count(distinct r.id)::int approved_returns,coalesce(sum(r.total_amount),0)::numeric approved_return_amount
    from public.returns r join public.pos_invoices i on i.sale_id=r.sale_id
    where i.cashier_id=p_employee_id and i.branch_id=p_branch_id and r.status='approved' and r.created_at>=p_from::timestamptz and r.created_at<(p_to+1)::timestamptz
  ), sh as (
    select count(*)::int shift_count,count(*) filter(where s.status='closed')::int closed_shift_count,
      coalesce(sum(abs(coalesce(s.cash_difference,0))),0)::numeric absolute_cash_variance,
      coalesce(sum(abs(coalesce(s.opening_variance,0))),0)::numeric absolute_opening_variance
    from public.pos_shifts s where s.user_id=p_employee_id and s.branch_id=p_branch_id and s.opened_at>=p_from::timestamptz and s.opened_at<(p_to+1)::timestamptz
  ), rec as (
    select count(*)::int reconciliation_lines,count(*) filter(where abs(coalesce(r.variance_amount,0))>0.009)::int variance_lines,
      coalesce(sum(abs(coalesce(r.variance_amount,0))),0)::numeric absolute_payment_variance
    from public.pos_shift_payment_reconciliations r join public.pos_shifts s on s.id=r.shift_id
    where s.user_id=p_employee_id and r.branch_id=p_branch_id and s.opened_at>=p_from::timestamptz and s.opened_at<(p_to+1)::timestamptz
  )
  select jsonb_build_object('applicable',(u.role='cashier' or inv.invoice_count>0 or sh.shift_count>0),'role',u.role,'period',jsonb_build_object('from',p_from,'to',p_to),
    'sales',jsonb_build_object('invoice_count',inv.invoice_count,'sales_total',round(inv.sales_total,2),'average_ticket',round(inv.average_ticket,2),'items_sold',inv.items_sold,
      'items_per_invoice',case when inv.invoice_count>0 then round(inv.items_sold::numeric/inv.invoice_count,2) else null end,'discounts',round(inv.discounts,2),'loyalty_voucher_amount',round(inv.loyalty_voucher_amount,2),'merchant_payment_fees',round(inv.merchant_payment_fees,2)),
    'returns',jsonb_build_object('approved_count',ret.approved_returns,'approved_amount',round(ret.approved_return_amount,2),'return_amount_pct',case when inv.sales_total>0 then round(100.0*ret.approved_return_amount/inv.sales_total,2) else null end),
    'shifts',jsonb_build_object('count',sh.shift_count,'closed_count',sh.closed_shift_count,'absolute_cash_variance',round(sh.absolute_cash_variance,2),'absolute_opening_variance',round(sh.absolute_opening_variance,2),'reconciliation_lines',rec.reconciliation_lines,'variance_lines',rec.variance_lines,'absolute_payment_variance',round(rec.absolute_payment_variance,2)),
    'notes',jsonb_build_array('المبيعات محسوبة من POS Invoice Snapshots وليس من JSON المبيعات القديم.','المرتجعات من المبيعات الأصلية لهذا الكاشير، وليس عدد المرتجعات التي قام الموظف بمعالجتها.','فروق التسوية تعرض القيمة المطلقة للمساعدة في المتابعة، ولا تعتبر وحدها حكمًا على أداء الموظف.')) into v_result
  from public.users u cross join inv cross join ret cross join sh cross join rec where u.id=p_employee_id;
  if v_result is null then raise exception 'employee_not_found'; end if;
  return v_result;
end;$$;
revoke all on function public.get_hr_cashier_performance_v1(uuid,uuid,date,date) from public,anon;
grant execute on function public.get_hr_cashier_performance_v1(uuid,uuid,date,date) to authenticated;
