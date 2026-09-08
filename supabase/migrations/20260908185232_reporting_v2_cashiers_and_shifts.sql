-- Reporting V2: cashier and shift operations.
-- Sales/returns are limited to the requested range while overlapping shifts
-- remain visible. Cash variance is counted only on shifts closed in-range.
-- Historical electronic counted amounts are intentionally not fabricated.

create index if not exists pos_invoices_shift_date_idx
  on public.pos_invoices(shift_id, sale_date desc)
  where shift_id is not null;

create index if not exists returns_shift_approved_idx
  on public.returns(shift_id, approved_at desc)
  where shift_id is not null;

create index if not exists pos_card_refunds_shift_status_idx
  on public.pos_card_refunds(shift_id, status)
  where shift_id is not null;

create or replace function public.get_reporting_shifts_v2(
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
  v_can_cash_control boolean := false;
  v_summary jsonb := '{}'::jsonb;
  v_shifts jsonb := '[]'::jsonb;
  v_cashiers jsonb := '[]'::jsonb;
  v_methods jsonb := '[]'::jsonb;
  v_first_shift_at timestamptz;
  v_unassigned_count bigint := 0;
  v_unassigned_amount numeric := 0;
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;
  if p_branch_id is null then
    raise exception using errcode='22023',message='BRANCH_REQUIRED';
  end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then
    raise exception using errcode='42501',message='REPORTS_VIEW_DENIED';
  end if;
  if p_from is null or p_to is null or p_to<=p_from then
    raise exception using errcode='22023',message='INVALID_REPORT_RANGE';
  end if;
  if p_to-p_from>interval '732 days' then
    raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE';
  end if;

  v_can_cash_control := public.staff_has_permission('pos.manage_shifts',p_branch_id)
    or private.can_manage_financial_branch(p_branch_id);

  select min(opened_at) into v_first_shift_at
  from public.pos_shifts
  where branch_id=p_branch_id;

  select count(*),coalesce(sum(greatest(total-coalesce(loyalty_voucher_amount,0),0)),0)
  into v_unassigned_count,v_unassigned_amount
  from public.pos_invoices
  where branch_id=p_branch_id
    and sale_date>=p_from and sale_date<p_to
    and shift_id is null;

  with selected as (
    select s.*,
      greatest(s.opened_at,p_from) overlap_from,
      least(coalesce(s.closed_at,p_to),p_to) overlap_to,
      (s.opened_at>=p_from and s.opened_at<p_to) opened_in_range,
      (s.closed_at is not null and s.closed_at>=p_from and s.closed_at<p_to) closed_in_range
    from public.pos_shifts s
    where s.branch_id=p_branch_id
      and s.opened_at<p_to
      and coalesce(s.closed_at,p_to)>=p_from
  ), inv as (
    select i.shift_id,
      count(*)::bigint invoice_count,
      coalesce(sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)),0)::numeric recognized_sales,
      coalesce(sum(psp.base_amount),0)::numeric recorded_payment_base,
      count(*) filter(where psp.id is not null)::bigint payment_recorded_invoice_count,
      coalesce(sum(coalesce(psp.customer_fee_amount,i.customer_payment_fee_amount,0)),0)::numeric customer_fees,
      coalesce(sum(coalesce(psp.merchant_fee_amount,i.merchant_payment_fee_amount,0)),0)::numeric merchant_fees
    from public.pos_invoices i
    join selected s on s.id=i.shift_id
    left join public.pos_sale_payments psp on psp.sale_id=i.sale_id
    where i.sale_date>=p_from and i.sale_date<p_to
    group by i.shift_id
  ), ret as (
    select r.shift_id,
      count(*)::bigint return_count,
      coalesce(sum(r.total_amount),0)::numeric approved_returns,
      coalesce(sum(r.refund_cash_amount),0)::numeric cash_refunds,
      coalesce(sum(r.refund_card_amount),0)::numeric electronic_refunds,
      coalesce(sum(r.refund_loyalty_amount),0)::numeric loyalty_refunds
    from public.returns r
    join selected s on s.id=r.shift_id
    where r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from
      and coalesce(r.approved_at,r.created_at)<p_to
    group by r.shift_id
  ), eref as (
    select r.shift_id,
      coalesce(sum(r.amount) filter(where r.status='pending'),0)::numeric pending_electronic_refunds,
      coalesce(sum(r.amount) filter(where r.status='confirmed'),0)::numeric confirmed_electronic_refunds
    from public.pos_card_refunds r
    join selected s on s.id=r.shift_id
    where r.created_at<p_to
      and coalesce(r.confirmed_at,r.failed_at,p_to)>=p_from
    group by r.shift_id
  ), rows as (
    select s.id shift_id,s.user_id,c.name cashier_name,s.device_id,d.name device_name,d.device_code,s.status,
      s.opened_at,s.closed_at,s.opened_in_range,s.closed_in_range,
      greatest(extract(epoch from greatest(s.overlap_to-s.overlap_from,interval '0 seconds'))/60.0,0)::numeric duration_minutes,
      s.opening_cash,s.opening_system_balance,s.opening_variance,s.closing_cash,s.expected_cash,s.cash_difference,s.closing_notes,
      s.closed_by,cu.name closed_by_name,s.drawer_account_id,
      coalesce(i.invoice_count,0)::bigint invoice_count,coalesce(i.recognized_sales,0)::numeric recognized_sales,
      coalesce(i.recorded_payment_base,0)::numeric recorded_payment_base,coalesce(i.payment_recorded_invoice_count,0)::bigint payment_recorded_invoice_count,
      coalesce(i.customer_fees,0)::numeric customer_fees,coalesce(i.merchant_fees,0)::numeric merchant_fees,
      coalesce(r.return_count,0)::bigint return_count,coalesce(r.approved_returns,0)::numeric approved_returns,
      coalesce(r.cash_refunds,0)::numeric cash_refunds,coalesce(r.electronic_refunds,0)::numeric electronic_refunds,coalesce(r.loyalty_refunds,0)::numeric loyalty_refunds,
      coalesce(er.pending_electronic_refunds,0)::numeric pending_electronic_refunds,
      coalesce(er.confirmed_electronic_refunds,0)::numeric confirmed_electronic_refunds
    from selected s
    left join public.users c on c.id=s.user_id
    left join public.pos_devices d on d.id=s.device_id
    left join public.users cu on cu.id=s.closed_by
    left join inv i on i.shift_id=s.id
    left join ret r on r.shift_id=s.id
    left join eref er on er.shift_id=s.id
  )
  select jsonb_build_object(
    'overlapping_shifts',count(*)::bigint,
    'shifts_opened_in_range',count(*) filter(where opened_in_range)::bigint,
    'shifts_closed_in_range',count(*) filter(where closed_in_range)::bigint,
    'open_now',count(*) filter(where status='open')::bigint,
    'cashiers',count(distinct user_id)::bigint,
    'devices',count(distinct device_id)::bigint,
    'duration_minutes',round(coalesce(sum(duration_minutes),0),1),
    'invoice_count',coalesce(sum(invoice_count),0)::bigint,
    'recognized_sales',round(coalesce(sum(recognized_sales),0),2),
    'approved_returns',round(coalesce(sum(approved_returns),0),2),
    'net_sales',round(coalesce(sum(recognized_sales-approved_returns),0),2),
    'average_ticket',case when coalesce(sum(invoice_count),0)>0 then round(sum(recognized_sales)/sum(invoice_count),2) else 0 end,
    'recorded_payment_base',round(coalesce(sum(recorded_payment_base),0),2),
    'payment_legacy_gap',round(coalesce(sum(recognized_sales-recorded_payment_base),0),2),
    'payment_coverage_percent',case when coalesce(sum(recognized_sales),0)>0 then round(sum(recorded_payment_base)/sum(recognized_sales)*100,2) else 100 end,
    'payment_recorded_invoice_count',coalesce(sum(payment_recorded_invoice_count),0)::bigint,
    'customer_payment_fees',round(coalesce(sum(customer_fees),0),2),
    'merchant_payment_fees',round(coalesce(sum(merchant_fees),0),2),
    'cash_refunds',round(coalesce(sum(cash_refunds),0),2),
    'electronic_refunds',round(coalesce(sum(electronic_refunds),0),2),
    'loyalty_refunds',round(coalesce(sum(loyalty_refunds),0),2),
    'pending_electronic_refunds',round(coalesce(sum(pending_electronic_refunds),0),2),
    'confirmed_electronic_refunds',round(coalesce(sum(confirmed_electronic_refunds),0),2),
    'closed_reconciliations',count(*) filter(where closed_in_range and closing_cash is not null)::bigint,
    'variance_shifts',case when v_can_cash_control then count(*) filter(where closed_in_range and cash_difference is not null and abs(cash_difference)>0.005)::bigint else null end,
    'cash_variance_signed',case when v_can_cash_control then round(coalesce(sum(cash_difference) filter(where closed_in_range),0),2) else null end,
    'cash_variance_absolute',case when v_can_cash_control then round(coalesce(sum(abs(cash_difference)) filter(where closed_in_range),0),2) else null end,
    'opening_variance_absolute',case when v_can_cash_control then round(coalesce(sum(abs(opening_variance)) filter(where opened_in_range),0),2) else null end
  ) into v_summary
  from rows;

  with selected as (
    select s.*,
      greatest(s.opened_at,p_from) overlap_from,
      least(coalesce(s.closed_at,p_to),p_to) overlap_to,
      (s.opened_at>=p_from and s.opened_at<p_to) opened_in_range,
      (s.closed_at is not null and s.closed_at>=p_from and s.closed_at<p_to) closed_in_range
    from public.pos_shifts s
    where s.branch_id=p_branch_id and s.opened_at<p_to and coalesce(s.closed_at,p_to)>=p_from
    order by case when s.status='open' then 0 else 1 end,coalesce(s.closed_at,s.opened_at) desc
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'shift_id',s.id,'cashier_id',s.user_id,'cashier_name',coalesce(u.name,'موظف غير متاح'),
    'device_id',s.device_id,'device_name',coalesce(d.name,'جهاز غير متاح'),'device_code',d.device_code,
    'status',s.status,'opened_at',s.opened_at,'closed_at',s.closed_at,'opened_in_range',s.opened_in_range,'closed_in_range',s.closed_in_range,
    'duration_minutes_in_range',round(greatest(extract(epoch from greatest(s.overlap_to-s.overlap_from,interval '0 seconds'))/60.0,0)::numeric,1),
    'invoice_count',coalesce(im.invoice_count,0),'recognized_sales',round(coalesce(im.recognized_sales,0),2),
    'approved_returns',round(coalesce(rm.approved_returns,0),2),'return_count',coalesce(rm.return_count,0),
    'net_sales',round(coalesce(im.recognized_sales,0)-coalesce(rm.approved_returns,0),2),
    'average_ticket',case when coalesce(im.invoice_count,0)>0 then round(im.recognized_sales/im.invoice_count,2) else 0 end,
    'recorded_payment_base',round(coalesce(im.recorded_payment_base,0),2),
    'payment_legacy_gap',round(coalesce(im.recognized_sales,0)-coalesce(im.recorded_payment_base,0),2),
    'payment_coverage_percent',case when coalesce(im.recognized_sales,0)>0 then round(coalesce(im.recorded_payment_base,0)/im.recognized_sales*100,2) else 100 end,
    'customer_payment_fees',round(coalesce(im.customer_fees,0),2),'merchant_payment_fees',round(coalesce(im.merchant_fees,0),2),
    'cash_refunds',round(coalesce(rm.cash_refunds,0),2),'electronic_refunds',round(coalesce(rm.electronic_refunds,0),2),'loyalty_refunds',round(coalesce(rm.loyalty_refunds,0),2),
    'pending_electronic_refunds',round(coalesce(er.pending_electronic_refunds,0),2),'confirmed_electronic_refunds',round(coalesce(er.confirmed_electronic_refunds,0),2),
    'opening_cash',case when v_can_cash_control then s.opening_cash else null end,
    'opening_system_balance',case when v_can_cash_control then s.opening_system_balance else null end,
    'opening_variance',case when v_can_cash_control then s.opening_variance else null end,
    'expected_cash',case when v_can_cash_control then (case when s.status='open' then private.cash_account_balance(s.drawer_account_id) else s.expected_cash end) else null end,
    'closing_cash',case when v_can_cash_control then s.closing_cash else null end,
    'cash_difference',case when v_can_cash_control then s.cash_difference else null end,
    'closing_notes',case when v_can_cash_control then s.closing_notes else null end,
    'closed_by',case when v_can_cash_control then s.closed_by else null end,
    'closed_by_name',case when v_can_cash_control then cu.name else null end,
    'payment_breakdown',coalesce(pb.breakdown,'[]'::jsonb)
  ) order by case when s.status='open' then 0 else 1 end,coalesce(s.closed_at,s.opened_at) desc),'[]'::jsonb)
  into v_shifts
  from selected s
  left join public.users u on u.id=s.user_id
  left join public.pos_devices d on d.id=s.device_id
  left join public.users cu on cu.id=s.closed_by
  left join lateral (
    select count(*)::bigint invoice_count,
      coalesce(sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)),0)::numeric recognized_sales,
      coalesce(sum(psp.base_amount),0)::numeric recorded_payment_base,
      coalesce(sum(coalesce(psp.customer_fee_amount,i.customer_payment_fee_amount,0)),0)::numeric customer_fees,
      coalesce(sum(coalesce(psp.merchant_fee_amount,i.merchant_payment_fee_amount,0)),0)::numeric merchant_fees
    from public.pos_invoices i
    left join public.pos_sale_payments psp on psp.sale_id=i.sale_id
    where i.shift_id=s.id and i.sale_date>=p_from and i.sale_date<p_to
  ) im on true
  left join lateral (
    select count(*)::bigint return_count,coalesce(sum(r.total_amount),0)::numeric approved_returns,
      coalesce(sum(r.refund_cash_amount),0)::numeric cash_refunds,coalesce(sum(r.refund_card_amount),0)::numeric electronic_refunds,
      coalesce(sum(r.refund_loyalty_amount),0)::numeric loyalty_refunds
    from public.returns r
    where r.shift_id=s.id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
  ) rm on true
  left join lateral (
    select coalesce(sum(r.amount) filter(where r.status='pending'),0)::numeric pending_electronic_refunds,
      coalesce(sum(r.amount) filter(where r.status='confirmed'),0)::numeric confirmed_electronic_refunds
    from public.pos_card_refunds r
    where r.shift_id=s.id and r.created_at<p_to and coalesce(r.confirmed_at,r.failed_at,p_to)>=p_from
  ) er on true
  left join lateral (
    with payment_rows as (
      select
        coalesce(nullif(i.payment_method_code,''),pm.code,
          case when coalesce(i.cash_amount,0)>0 then 'legacy_cash'
               when coalesce(i.digital_wallet_amount,0)>0 then 'legacy_wallet'
               when coalesce(i.card_amount,0)>0 then 'legacy_card' else 'legacy_other' end) method_code,
        coalesce(nullif(i.payment_method_name,''),pm.name,
          case when coalesce(i.cash_amount,0)>0 then 'نقدي قديم'
               when coalesce(i.digital_wallet_amount,0)>0 then 'محفظة رقمية قديمة'
               when coalesce(i.card_amount,0)>0 then 'بطاقة قديمة' else 'وسيلة قديمة' end) method_name,
        coalesce(nullif(i.payment_method_type,''),pm.method_type,
          case when coalesce(i.cash_amount,0)>0 then 'cash'
               when coalesce(i.digital_wallet_amount,0)>0 then 'digital_wallet'
               when coalesce(i.card_amount,0)>0 then 'card' else 'other' end) method_type,
        i.payment_method_id,
        greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)::numeric invoice_amount,
        coalesce(psp.base_amount,0)::numeric recorded_base,
        coalesce(psp.customer_fee_amount,i.customer_payment_fee_amount,0)::numeric customer_fee,
        coalesce(psp.merchant_fee_amount,i.merchant_payment_fee_amount,0)::numeric merchant_fee,
        coalesce(psp.charged_amount,i.amount_charged,greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0))::numeric charged_amount,
        psp.estimated_net_settlement,
        (psp.id is not null) has_payment_record
      from public.pos_invoices i
      left join public.pos_payment_methods pm on pm.id=i.payment_method_id
      left join public.pos_sale_payments psp on psp.sale_id=i.sale_id
      where i.shift_id=s.id and i.sale_date>=p_from and i.sale_date<p_to
    ), grouped as (
      select method_code,method_name,method_type,payment_method_id,count(*)::bigint invoice_count,
        sum(invoice_amount)::numeric invoice_amount,sum(recorded_base)::numeric recorded_base,
        sum(customer_fee)::numeric customer_fee,sum(merchant_fee)::numeric merchant_fee,sum(charged_amount)::numeric charged_amount,
        sum(estimated_net_settlement) filter(where has_payment_record)::numeric recorded_net_settlement,
        count(*) filter(where has_payment_record)::bigint recorded_invoice_count
      from payment_rows group by method_code,method_name,method_type,payment_method_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'payment_method_id',payment_method_id,'code',method_code,'name',method_name,'method_type',method_type,
      'invoice_count',invoice_count,'invoice_amount',round(invoice_amount,2),'recorded_payment_base',round(recorded_base,2),
      'legacy_gap',round(invoice_amount-recorded_base,2),
      'coverage_percent',case when invoice_amount>0 then round(recorded_base/invoice_amount*100,2) else 100 end,
      'recorded_invoice_count',recorded_invoice_count,'charged_amount',round(charged_amount,2),
      'customer_fee_amount',round(customer_fee,2),'merchant_fee_amount',round(merchant_fee,2),
      'recorded_net_settlement',case when recorded_invoice_count>0 then round(coalesce(recorded_net_settlement,0),2) else null end,
      'actual_counted_amount',null,'actual_available',false
    ) order by case when method_type='cash' then 0 else 1 end,method_name),'[]'::jsonb) breakdown
    from grouped
  ) pb on true;

  with selected as (
    select s.*,
      greatest(s.opened_at,p_from) overlap_from,
      least(coalesce(s.closed_at,p_to),p_to) overlap_to,
      (s.closed_at is not null and s.closed_at>=p_from and s.closed_at<p_to) closed_in_range
    from public.pos_shifts s
    where s.branch_id=p_branch_id and s.opened_at<p_to and coalesce(s.closed_at,p_to)>=p_from
  ), inv as (
    select i.shift_id,count(*)::bigint invoice_count,
      coalesce(sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)),0)::numeric recognized_sales,
      coalesce(sum(psp.base_amount),0)::numeric recorded_payment_base
    from public.pos_invoices i join selected s on s.id=i.shift_id
    left join public.pos_sale_payments psp on psp.sale_id=i.sale_id
    where i.sale_date>=p_from and i.sale_date<p_to group by i.shift_id
  ), ret as (
    select r.shift_id,count(*)::bigint return_count,coalesce(sum(r.total_amount),0)::numeric approved_returns
    from public.returns r join selected s on s.id=r.shift_id
    where r.source='pos' and r.status='approved' and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to
    group by r.shift_id
  ), rows as (
    select s.user_id,coalesce(u.name,'موظف غير متاح') cashier_name,count(*)::bigint shift_count,
      count(*) filter(where s.status='open')::bigint open_shifts,count(*) filter(where s.closed_in_range)::bigint closed_shifts,
      sum(greatest(extract(epoch from greatest(s.overlap_to-s.overlap_from,interval '0 seconds'))/60.0,0))::numeric duration_minutes,
      coalesce(sum(i.invoice_count),0)::bigint invoice_count,coalesce(sum(i.recognized_sales),0)::numeric recognized_sales,
      coalesce(sum(r.return_count),0)::bigint return_count,coalesce(sum(r.approved_returns),0)::numeric approved_returns,
      coalesce(sum(i.recorded_payment_base),0)::numeric recorded_payment_base,
      count(*) filter(where s.closed_in_range and s.cash_difference is not null and abs(s.cash_difference)>0.005)::bigint variance_shifts,
      coalesce(sum(s.cash_difference) filter(where s.closed_in_range),0)::numeric cash_variance_signed,
      coalesce(sum(abs(s.cash_difference)) filter(where s.closed_in_range),0)::numeric cash_variance_absolute
    from selected s left join public.users u on u.id=s.user_id left join inv i on i.shift_id=s.id left join ret r on r.shift_id=s.id
    group by s.user_id,u.name
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'cashier_id',user_id,'cashier_name',cashier_name,'shift_count',shift_count,'open_shifts',open_shifts,'closed_shifts',closed_shifts,
    'duration_minutes',round(duration_minutes,1),'invoice_count',invoice_count,'recognized_sales',round(recognized_sales,2),
    'return_count',return_count,'approved_returns',round(approved_returns,2),'net_sales',round(recognized_sales-approved_returns,2),
    'average_ticket',case when invoice_count>0 then round(recognized_sales/invoice_count,2) else 0 end,
    'sales_per_hour',case when duration_minutes>0 then round((recognized_sales-approved_returns)/(duration_minutes/60.0),2) else 0 end,
    'recorded_payment_base',round(recorded_payment_base,2),'payment_legacy_gap',round(recognized_sales-recorded_payment_base,2),
    'payment_coverage_percent',case when recognized_sales>0 then round(recorded_payment_base/recognized_sales*100,2) else 100 end,
    'variance_shifts',case when v_can_cash_control then variance_shifts else null end,
    'cash_variance_signed',case when v_can_cash_control then round(cash_variance_signed,2) else null end,
    'cash_variance_absolute',case when v_can_cash_control then round(cash_variance_absolute,2) else null end
  ) order by recognized_sales-approved_returns desc,cashier_name),'[]'::jsonb)
  into v_cashiers from rows;

  with selected as (
    select id from public.pos_shifts
    where branch_id=p_branch_id and opened_at<p_to and coalesce(closed_at,p_to)>=p_from
  ), payment_rows as (
    select coalesce(nullif(i.payment_method_code,''),pm.code,
      case when coalesce(i.cash_amount,0)>0 then 'legacy_cash' when coalesce(i.digital_wallet_amount,0)>0 then 'legacy_wallet' when coalesce(i.card_amount,0)>0 then 'legacy_card' else 'legacy_other' end) method_code,
      coalesce(nullif(i.payment_method_name,''),pm.name,
      case when coalesce(i.cash_amount,0)>0 then 'نقدي قديم' when coalesce(i.digital_wallet_amount,0)>0 then 'محفظة رقمية قديمة' when coalesce(i.card_amount,0)>0 then 'بطاقة قديمة' else 'وسيلة قديمة' end) method_name,
      coalesce(nullif(i.payment_method_type,''),pm.method_type,
      case when coalesce(i.cash_amount,0)>0 then 'cash' when coalesce(i.digital_wallet_amount,0)>0 then 'digital_wallet' when coalesce(i.card_amount,0)>0 then 'card' else 'other' end) method_type,
      i.payment_method_id,greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)::numeric invoice_amount,
      coalesce(psp.base_amount,0)::numeric recorded_base,coalesce(psp.customer_fee_amount,i.customer_payment_fee_amount,0)::numeric customer_fee,
      coalesce(psp.merchant_fee_amount,i.merchant_payment_fee_amount,0)::numeric merchant_fee,
      psp.estimated_net_settlement,(psp.id is not null) has_payment_record
    from public.pos_invoices i join selected s on s.id=i.shift_id
    left join public.pos_payment_methods pm on pm.id=i.payment_method_id
    left join public.pos_sale_payments psp on psp.sale_id=i.sale_id
    where i.sale_date>=p_from and i.sale_date<p_to
  ), grouped as (
    select method_code,method_name,method_type,payment_method_id,count(*)::bigint invoice_count,sum(invoice_amount)::numeric invoice_amount,
      sum(recorded_base)::numeric recorded_base,sum(customer_fee)::numeric customer_fee,sum(merchant_fee)::numeric merchant_fee,
      sum(estimated_net_settlement) filter(where has_payment_record)::numeric recorded_net_settlement,
      count(*) filter(where has_payment_record)::bigint recorded_invoice_count
    from payment_rows group by method_code,method_name,method_type,payment_method_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'payment_method_id',payment_method_id,'code',method_code,'name',method_name,'method_type',method_type,'invoice_count',invoice_count,
    'invoice_amount',round(invoice_amount,2),'recorded_payment_base',round(recorded_base,2),'legacy_gap',round(invoice_amount-recorded_base,2),
    'coverage_percent',case when invoice_amount>0 then round(recorded_base/invoice_amount*100,2) else 100 end,
    'recorded_invoice_count',recorded_invoice_count,'customer_fee_amount',round(customer_fee,2),'merchant_fee_amount',round(merchant_fee,2),
    'recorded_net_settlement',case when recorded_invoice_count>0 then round(coalesce(recorded_net_settlement,0),2) else null end,
    'actual_counted_amount',null,'actual_available',false
  ) order by case when method_type='cash' then 0 else 1 end,method_name),'[]'::jsonb)
  into v_methods from grouped;

  return jsonb_build_object(
    'version',2,'branch_id',p_branch_id,'from',p_from,'to',p_to,
    'permissions',jsonb_build_object('can_view_cash_control',v_can_cash_control),
    'summary',coalesce(v_summary,'{}'::jsonb),
    'shifts',coalesce(v_shifts,'[]'::jsonb),
    'cashiers',coalesce(v_cashiers,'[]'::jsonb),
    'payment_methods',coalesce(v_methods,'[]'::jsonb),
    'data_quality',jsonb_build_object(
      'shift_source','pos_shifts','sales_source','pos_invoices_v2','payment_record_source','pos_sale_payments_with_invoice_fallback_gap',
      'returns_source','approved_pos_returns_by_refund_shift','cash_actual_source','stored_shift_closing_cash',
      'electronic_actual_available',false,'electronic_actual_reason','per_method_counted_amounts_are_not_yet_stored_for_historical_shifts',
      'first_shift_at',v_first_shift_at,'unassigned_invoice_count',v_unassigned_count,'unassigned_invoice_amount',round(v_unassigned_amount,2),
      'range_semantics','overlapping_shifts_with_sales_and_returns_limited_to_selected_range; cash variance counted only when shift closed in range'
    )
  );
end;
$function$;

revoke all on function public.get_reporting_shifts_v2(uuid,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.get_reporting_shifts_v2(uuid,timestamptz,timestamptz,integer) to authenticated,service_role;
