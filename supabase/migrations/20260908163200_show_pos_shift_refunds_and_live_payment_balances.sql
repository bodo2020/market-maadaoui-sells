create or replace function public.get_my_pos_cash_summary(p_device_id uuid, p_device_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_device public.pos_devices%rowtype;
  v_shift public.pos_shifts%rowtype;
  v_account uuid;
  v_balance numeric;
  v_sales numeric;
  v_refunds numeric;
  v_expenses numeric;
  v_in numeric;
  v_out numeric;
  v_adjustments numeric;
  v_sales_count bigint := 0;
  v_sales_total numeric := 0;
  v_card_sales numeric := 0;
  v_cash_paid numeric := 0;
  v_amount_charged numeric := 0;
  v_loyalty_voucher_total numeric := 0;
  v_customer_fees numeric := 0;
  v_merchant_fees numeric := 0;
  v_pending_electronic_refunds numeric := 0;
  v_confirmed_electronic_refunds numeric := 0;
  v_payment_breakdown jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());

  select id into v_account
  from public.cash_accounts
  where device_id=v_device.id and account_type='pos_drawer' and active
  limit 1;
  if v_account is null then raise exception using errcode='55000',message='DRAWER_ACCOUNT_MISSING'; end if;

  select * into v_shift
  from public.pos_shifts
  where user_id=auth.uid()
    and device_id=v_device.id
    and branch_id=v_device.branch_id
    and status='open'
  order by opened_at desc
  limit 1;

  v_balance:=private.cash_account_balance(v_account);

  select
    coalesce(sum(signed_amount) filter(where entry_type='sale_cash'),0),
    coalesce(sum(signed_amount) filter(where entry_type='refund_cash'),0),
    coalesce(sum(signed_amount) filter(where entry_type='expense_cash'),0),
    coalesce(sum(signed_amount) filter(where entry_type='transfer_in'),0),
    coalesce(-sum(signed_amount) filter(where entry_type='transfer_out'),0),
    coalesce(sum(signed_amount) filter(where entry_type in ('shift_open_reconciliation','shift_close_variance')),0)
  into v_sales,v_refunds,v_expenses,v_in,v_out,v_adjustments
  from public.cash_ledger
  where shift_id=v_shift.id;

  if v_shift.id is not null then
    select
      count(*),
      coalesce(sum(total),0),
      coalesce(sum(card_amount),0),
      coalesce(sum(cash_amount),0),
      coalesce(sum(amount_charged),0),
      coalesce(sum(loyalty_voucher_amount),0),
      coalesce(sum(customer_payment_fee_amount),0),
      coalesce(sum(merchant_payment_fee_amount),0)
    into v_sales_count,v_sales_total,v_card_sales,v_cash_paid,v_amount_charged,v_loyalty_voucher_total,v_customer_fees,v_merchant_fees
    from public.sales
    where shift_id=v_shift.id;

    with payment_rows as (
      select
        coalesce(nullif(s.payment_method_code,''),pm.code,'other') as code,
        coalesce(nullif(s.payment_method_name,''),pm.name,
          case coalesce(pm.method_type,s.payment_method)
            when 'cash' then 'نقدي'
            when 'card' then 'بطاقة بنكية'
            when 'digital_wallet' then 'محفظة رقمية'
            when 'bank_transfer' then 'تحويل بنكي'
            else 'دفع إلكتروني'
          end) as name,
        coalesce(pm.method_type,case when s.payment_method='cash' then 'cash' when s.payment_method='card' then 'card' else 'other' end) as method_type,
        pm.settlement_account_id,
        1::bigint as sale_count,
        coalesce(psp.base_amount,greatest(coalesce(s.total,0)-coalesce(s.loyalty_voucher_amount,0),0)) as base_amount,
        coalesce(psp.charged_amount,s.amount_charged,s.total,0) as charged_amount,
        coalesce(psp.fee_amount,s.payment_fee_amount,0) as fee_amount,
        coalesce(psp.customer_fee_amount,s.customer_payment_fee_amount,0) as customer_fee_amount,
        coalesce(psp.merchant_fee_amount,s.merchant_payment_fee_amount,0) as merchant_fee_amount
      from public.sales s
      left join public.pos_payment_methods pm on pm.id=s.payment_method_id
      left join public.pos_sale_payments psp on psp.sale_id=s.id
      where s.shift_id=v_shift.id and s.payment_method_id is not null

      union all

      select legacy.code,legacy.name,legacy.method_type,null::uuid,1::bigint,legacy.amount,legacy.amount,0::numeric,0::numeric,0::numeric
      from public.sales s
      cross join lateral (
        select 'cash'::text code,'نقدي'::text name,'cash'::text method_type,coalesce(s.cash_amount,0)::numeric amount where coalesce(s.cash_amount,0)>0
        union all
        select 'card'::text,'بطاقة بنكية'::text,'card'::text,coalesce(s.card_amount,0)::numeric where coalesce(s.card_amount,0)>0
        union all
        select coalesce(nullif(s.payment_method,''),'other')::text,
               case coalesce(s.payment_method,'other') when 'cash' then 'نقدي' when 'card' then 'بطاقة بنكية' when 'mixed' then 'دفع مختلط' else 'وسيلة دفع' end::text,
               case when s.payment_method='cash' then 'cash' when s.payment_method='card' then 'card' else 'other' end::text,
               greatest(coalesce(s.total,0)-coalesce(s.loyalty_voucher_amount,0),0)::numeric
        where coalesce(s.cash_amount,0)<=0 and coalesce(s.card_amount,0)<=0
      ) legacy
      where s.shift_id=v_shift.id and s.payment_method_id is null
    ), grouped_payments as (
      select code,name,method_type,settlement_account_id,
             sum(sale_count)::bigint sale_count,sum(base_amount)::numeric base_amount,
             sum(charged_amount)::numeric charged_amount,sum(fee_amount)::numeric fee_amount,
             sum(customer_fee_amount)::numeric customer_fee_amount,sum(merchant_fee_amount)::numeric merchant_fee_amount
      from payment_rows
      group by code,name,method_type,settlement_account_id
    ), refund_rows as (
      select
        coalesce(nullif(s.payment_method_code,''),pm.code,s.payment_method,'other') as code,
        coalesce(pm.method_type,case when s.payment_method='cash' then 'cash' when s.payment_method='card' then 'card' else 'other' end) as method_type,
        pm.settlement_account_id,
        coalesce(sum(r.amount) filter(where r.status='pending'),0)::numeric as pending_refund_amount,
        coalesce(sum(r.amount) filter(where r.status='confirmed'),0)::numeric as confirmed_refund_amount
      from public.pos_card_refunds r
      join public.sales s on s.id=r.sale_id
      left join public.pos_payment_methods pm on pm.id=s.payment_method_id
      where r.shift_id=v_shift.id
      group by coalesce(nullif(s.payment_method_code,''),pm.code,s.payment_method,'other'),
               coalesce(pm.method_type,case when s.payment_method='cash' then 'cash' when s.payment_method='card' then 'card' else 'other' end),
               pm.settlement_account_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'code',p.code,
      'name',p.name,
      'method_type',p.method_type,
      'settlement_account_id',p.settlement_account_id,
      'sale_count',p.sale_count,
      'base_amount',round(p.base_amount,2),
      'charged_amount',round(p.charged_amount,2),
      'fee_amount',round(p.fee_amount,2),
      'customer_fee_amount',round(p.customer_fee_amount,2),
      'merchant_fee_amount',round(p.merchant_fee_amount,2),
      'pending_refund_amount',round(coalesce(r.pending_refund_amount,0),2),
      'confirmed_refund_amount',round(coalesce(r.confirmed_refund_amount,0),2),
      'net_shift_amount',round(p.charged_amount-p.fee_amount-coalesce(r.confirmed_refund_amount,0),2),
      'account_balance',case when p.settlement_account_id is null then null else round(coalesce((select sum(l.signed_amount) from public.payment_ledger l where l.account_id=p.settlement_account_id),0),2) end
    ) order by case when p.method_type='cash' then 0 else 1 end,p.name),'[]'::jsonb)
    into v_payment_breakdown
    from grouped_payments p
    left join refund_rows r
      on r.code=p.code
     and r.method_type=p.method_type
     and r.settlement_account_id is not distinct from p.settlement_account_id;

    select
      coalesce(sum(amount) filter(where status='pending'),0),
      coalesce(sum(amount) filter(where status='confirmed'),0)
    into v_pending_electronic_refunds,v_confirmed_electronic_refunds
    from public.pos_card_refunds
    where shift_id=v_shift.id;
  end if;

  return jsonb_build_object(
    'drawer_account_id',v_account,
    'drawer_balance',v_balance,
    'branch_id',v_device.branch_id,
    'device_id',v_device.id,
    'device_name',v_device.name,
    'shift_id',v_shift.id,
    'shift_opened_at',v_shift.opened_at,
    'opening_cash',v_shift.opening_cash,
    'cash_sales',v_sales,
    'cash_refunds',v_refunds,
    'cash_expenses',v_expenses,
    'transfers_in',v_in,
    'transfers_out',v_out,
    'adjustments',v_adjustments,
    'sales_count',v_sales_count,
    'sales_total',v_sales_total,
    'card_sales',v_card_sales,
    'cash_paid_total',v_cash_paid,
    'amount_charged_total',v_amount_charged,
    'loyalty_voucher_total',v_loyalty_voucher_total,
    'customer_payment_fees',v_customer_fees,
    'merchant_payment_fees',v_merchant_fees,
    'electronic_refunds_pending',v_pending_electronic_refunds,
    'electronic_refunds_confirmed',v_confirmed_electronic_refunds,
    'payment_breakdown',v_payment_breakdown
  );
end;
$function$;

revoke all on function public.get_my_pos_cash_summary(uuid,text) from public,anon;
grant execute on function public.get_my_pos_cash_summary(uuid,text) to authenticated;
