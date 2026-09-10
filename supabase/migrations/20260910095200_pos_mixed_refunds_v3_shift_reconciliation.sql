create or replace function private.pos_shift_reconciliation_preview(p_shift_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_shift public.pos_shifts%rowtype;
  v_cash_method_id uuid;
  v_cash_name text := 'نقدي';
  v_cash_expected numeric := 0;
  v_cash_sales_count bigint := 0;
  v_cash_base numeric := 0;
  v_methods jsonb := '[]'::jsonb;
begin
  select * into v_shift from public.pos_shifts where id=p_shift_id;
  if v_shift.id is null then raise exception using errcode='22023',message='SHIFT_NOT_FOUND'; end if;

  v_cash_expected := round(private.cash_account_balance(v_shift.drawer_account_id),2);
  select pm.id,pm.name into v_cash_method_id,v_cash_name
  from public.pos_payment_methods pm
  where pm.branch_id=v_shift.branch_id and pm.code='cash'
  order by pm.active desc,pm.updated_at desc limit 1;

  select count(*) filter(where coalesce(s.cash_amount,0)>0 or s.payment_method_code='cash'),
         coalesce(sum(case when coalesce(s.cash_amount,0)>0 then s.cash_amount when s.payment_method_code='cash' then greatest(coalesce(s.total,0)-coalesce(s.loyalty_voucher_amount,0),0) else 0 end),0)
  into v_cash_sales_count,v_cash_base
  from public.sales s where s.shift_id=v_shift.id;

  v_methods := jsonb_build_array(jsonb_build_object(
    'payment_method_id',v_cash_method_id,'code','cash','name',coalesce(nullif(v_cash_name,''),'نقدي'),'method_type','cash',
    'settlement_account_id',null,'expected_source','cash_drawer_balance','sale_count',coalesce(v_cash_sales_count,0),
    'base_amount',round(coalesce(v_cash_base,0),2),'charged_amount',round(coalesce(v_cash_base,0),2),
    'customer_fee_amount',0,'merchant_fee_amount',0,'confirmed_refund_amount',0,'pending_refund_amount',0,
    'expected_amount',v_cash_expected,'account_balance',v_cash_expected
  ));

  with payment_rows as (
    select p.payment_method_id,p.method_code_snapshot code,p.method_name_snapshot name,p.method_type_snapshot method_type,
      p.settlement_account_id_snapshot settlement_account_id,1::bigint sale_count,p.base_amount,p.charged_amount,
      p.customer_fee_amount,p.merchant_fee_amount,p.estimated_net_settlement net_settlement
    from private.pos_sale_payment_parts_v3 p
    join public.sales s on s.id=p.sale_id
    where s.shift_id=v_shift.id and p.method_type_snapshot<>'cash'

    union all

    select pm.id,coalesce(nullif(s.payment_method_code,''),pm.code,'other'),coalesce(nullif(s.payment_method_name,''),pm.name,'وسيلة دفع'),
      coalesce(pm.method_type,case when s.payment_method='card' then 'card' when s.payment_method='cash' then 'cash' else 'other' end),
      pm.settlement_account_id,1::bigint,
      coalesce(psp.base_amount,greatest(coalesce(s.total,0)-coalesce(s.loyalty_voucher_amount,0),0)),
      coalesce(psp.charged_amount,nullif(s.amount_charged,0),greatest(coalesce(s.total,0)-coalesce(s.loyalty_voucher_amount,0),0)),
      coalesce(psp.customer_fee_amount,s.customer_payment_fee_amount,0),coalesce(psp.merchant_fee_amount,s.merchant_payment_fee_amount,0),
      coalesce(psp.estimated_net_settlement,greatest(coalesce(nullif(s.amount_charged,0),coalesce(s.total,0))-coalesce(s.payment_fee_amount,0),0))
    from public.sales s
    left join public.pos_payment_methods pm on pm.id=s.payment_method_id
    left join public.pos_sale_payments psp on psp.sale_id=s.id
    where s.shift_id=v_shift.id and s.payment_method_id is not null
      and coalesce(pm.method_type,case when s.payment_method='cash' then 'cash' else 'other' end)<>'cash'
      and not exists(select 1 from private.pos_sale_payment_parts_v3 pp where pp.sale_id=s.id)

    union all

    select null::uuid,'legacy_card','بطاقة بنكية (سجل قديم)','card',null::uuid,1::bigint,
      coalesce(s.card_amount,0),coalesce(s.card_amount,0),0::numeric,0::numeric,coalesce(s.card_amount,0)
    from public.sales s
    where s.shift_id=v_shift.id and s.payment_method_id is null and coalesce(s.card_amount,0)>0
      and not exists(select 1 from private.pos_sale_payment_parts_v3 pp where pp.sale_id=s.id)

    union all

    select null::uuid,'legacy_wallet','محفظة رقمية (سجل قديم)','digital_wallet',null::uuid,1::bigint,
      coalesce(s.digital_wallet_amount,0),coalesce(s.digital_wallet_amount,0),0::numeric,0::numeric,coalesce(s.digital_wallet_amount,0)
    from public.sales s
    where s.shift_id=v_shift.id and s.payment_method_id is null and coalesce(s.digital_wallet_amount,0)>0
      and not exists(select 1 from private.pos_sale_payment_parts_v3 pp where pp.sale_id=s.id)
  ), payment_agg as (
    select code,(array_agg(payment_method_id) filter(where payment_method_id is not null))[1] payment_method_id,
      (array_agg(name order by name))[1] name,(array_agg(method_type order by method_type))[1] method_type,
      (array_agg(settlement_account_id) filter(where settlement_account_id is not null))[1] settlement_account_id,
      sum(sale_count)::bigint sale_count,sum(base_amount)::numeric base_amount,sum(charged_amount)::numeric charged_amount,
      sum(customer_fee_amount)::numeric customer_fee_amount,sum(merchant_fee_amount)::numeric merchant_fee_amount,
      sum(net_settlement)::numeric net_settlement
    from payment_rows group by code
  ), refund_rows as (
    select p.method_code_snapshot code,p.payment_method_id,p.method_name_snapshot name,p.method_type_snapshot method_type,
      p.settlement_account_id_snapshot settlement_account_id,
      coalesce(sum(p.base_refund_amount) filter(where p.status in ('confirmed','completed')),0)::numeric confirmed_refund_amount,
      coalesce(sum(p.base_refund_amount) filter(where p.status='pending'),0)::numeric pending_refund_amount
    from private.pos_return_payment_parts_v3 p
    where p.shift_id=v_shift.id and p.method_type_snapshot<>'cash'
    group by p.method_code_snapshot,p.payment_method_id,p.method_name_snapshot,p.method_type_snapshot,p.settlement_account_id_snapshot

    union all

    select coalesce(case when s.payment_method_id is not null then coalesce(nullif(s.payment_method_code,''),pm.code) end,
      case when coalesce(s.card_amount,0)>0 then 'legacy_card' end,case when coalesce(s.digital_wallet_amount,0)>0 then 'legacy_wallet' end,'legacy_other') code,
      pm.id payment_method_id,coalesce(nullif(s.payment_method_name,''),pm.name,'وسيلة دفع') name,
      coalesce(pm.method_type,case when coalesce(s.card_amount,0)>0 then 'card' when coalesce(s.digital_wallet_amount,0)>0 then 'digital_wallet' else 'other' end) method_type,
      pm.settlement_account_id,
      coalesce(sum(r.amount) filter(where r.status='confirmed'),0)::numeric confirmed_refund_amount,
      coalesce(sum(r.amount) filter(where r.status='pending'),0)::numeric pending_refund_amount
    from public.pos_card_refunds r
    join public.sales s on s.id=r.sale_id
    left join public.pos_payment_methods pm on pm.id=s.payment_method_id
    where r.shift_id=v_shift.id and not exists(select 1 from private.pos_sale_payment_parts_v3 pp where pp.sale_id=s.id)
    group by 1,pm.id,3,4,pm.settlement_account_id
  ), refund_agg as (
    select code,(array_agg(payment_method_id) filter(where payment_method_id is not null))[1] payment_method_id,
      (array_agg(name order by name))[1] name,(array_agg(method_type order by method_type))[1] method_type,
      (array_agg(settlement_account_id) filter(where settlement_account_id is not null))[1] settlement_account_id,
      sum(confirmed_refund_amount)::numeric confirmed_refund_amount,sum(pending_refund_amount)::numeric pending_refund_amount
    from refund_rows group by code
  ), candidates as (
    select p.code,p.payment_method_id,p.name,p.method_type,p.settlement_account_id,1 priority from payment_agg p
    union all select r.code,r.payment_method_id,r.name,r.method_type,r.settlement_account_id,1 from refund_agg r
    union all select pm.code,pm.id,pm.name,pm.method_type,pm.settlement_account_id,2 from public.pos_payment_methods pm
      where pm.branch_id=v_shift.branch_id and pm.active and pm.method_type<>'cash'
  ), method_keys as (
    select distinct on(code) code,payment_method_id,name,method_type,settlement_account_id from candidates
    where code is not null and code<>'' and method_type<>'cash'
    order by code,priority,payment_method_id nulls last
  ), electronic as (
    select k.*,coalesce(p.sale_count,0)::bigint sale_count,coalesce(p.base_amount,0)::numeric base_amount,
      coalesce(p.charged_amount,0)::numeric charged_amount,coalesce(p.customer_fee_amount,0)::numeric customer_fee_amount,
      coalesce(p.merchant_fee_amount,0)::numeric merchant_fee_amount,coalesce(p.net_settlement,0)::numeric net_settlement,
      coalesce(r.confirmed_refund_amount,0)::numeric confirmed_refund_amount,coalesce(r.pending_refund_amount,0)::numeric pending_refund_amount
    from method_keys k left join payment_agg p using(code) left join refund_agg r using(code)
  )
  select v_methods||coalesce(jsonb_agg(jsonb_build_object(
    'payment_method_id',e.payment_method_id,'code',e.code,'name',e.name,'method_type',e.method_type,
    'settlement_account_id',e.settlement_account_id,'expected_source','payment_parts_v3_net_shift',
    'sale_count',e.sale_count,'base_amount',round(e.base_amount,2),'charged_amount',round(e.charged_amount,2),
    'customer_fee_amount',round(e.customer_fee_amount,2),'merchant_fee_amount',round(e.merchant_fee_amount,2),
    'confirmed_refund_amount',round(e.confirmed_refund_amount,2),'pending_refund_amount',round(e.pending_refund_amount,2),
    'expected_amount',round(e.net_settlement-e.confirmed_refund_amount,2),
    'account_balance',case when e.settlement_account_id is null then null else round(private.payment_account_balance(e.settlement_account_id),2) end
  ) order by e.name),'[]'::jsonb) into v_methods from electronic e;

  return jsonb_build_object('version',3,'shift_id',v_shift.id,'branch_id',v_shift.branch_id,'device_id',v_shift.device_id,
    'cashier_id',v_shift.user_id,'status',v_shift.status,'opened_at',v_shift.opened_at,'methods',v_methods,'generated_at',now());
end;
$$;

revoke all on function private.pos_shift_reconciliation_preview(uuid) from public,anon,authenticated;
grant execute on function private.pos_shift_reconciliation_preview(uuid) to postgres,service_role;
