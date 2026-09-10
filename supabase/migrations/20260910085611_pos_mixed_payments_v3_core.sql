alter table public.sales add column if not exists payment_breakdown jsonb not null default '[]'::jsonb;
alter table public.pos_invoices add column if not exists payment_breakdown jsonb not null default '[]'::jsonb;

create table if not exists private.pos_sale_payment_parts_v3 (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  part_order integer not null,
  payment_method_id uuid not null references public.pos_payment_methods(id) on delete restrict,
  method_code_snapshot text not null,
  method_name_snapshot text not null,
  method_type_snapshot text not null,
  settlement_account_id_snapshot uuid references public.payment_accounts(id) on delete restrict,
  base_amount numeric(12,2) not null,
  fee_amount numeric(12,2) not null default 0,
  customer_fee_amount numeric(12,2) not null default 0,
  merchant_fee_amount numeric(12,2) not null default 0,
  charged_amount numeric(12,2) not null,
  estimated_net_settlement numeric(12,2) not null,
  reference text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pos_sale_payment_parts_v3_sale_order_unique unique(sale_id,part_order),
  constraint pos_sale_payment_parts_v3_sale_method_unique unique(sale_id,payment_method_id),
  constraint pos_sale_payment_parts_v3_method_type_check check(method_type_snapshot in ('cash','card','digital_wallet','bank_transfer','other')),
  constraint pos_sale_payment_parts_v3_amounts_check check(
    base_amount > 0 and fee_amount >= 0 and customer_fee_amount >= 0 and merchant_fee_amount >= 0 and charged_amount > 0 and estimated_net_settlement >= 0
  )
);

create index if not exists pos_sale_payment_parts_v3_sale_idx on private.pos_sale_payment_parts_v3(sale_id,part_order);
create index if not exists pos_sale_payment_parts_v3_branch_created_idx on private.pos_sale_payment_parts_v3(branch_id,created_at desc);
create index if not exists pos_sale_payment_parts_v3_method_idx on private.pos_sale_payment_parts_v3(payment_method_id,created_at desc);
create index if not exists pos_sale_payment_parts_v3_settlement_idx on private.pos_sale_payment_parts_v3(settlement_account_id_snapshot) where settlement_account_id_snapshot is not null;
create index if not exists pos_sale_payment_parts_v3_created_by_idx on private.pos_sale_payment_parts_v3(created_by) where created_by is not null;

alter table private.pos_sale_payment_parts_v3 enable row level security;
revoke all on private.pos_sale_payment_parts_v3 from public,anon,authenticated;

create or replace function private.pos_sale_payment_breakdown_v3(p_sale_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'part_order',p.part_order,
    'payment_method_id',p.payment_method_id,
    'code',p.method_code_snapshot,
    'name',p.method_name_snapshot,
    'method_type',p.method_type_snapshot,
    'settlement_account_id',p.settlement_account_id_snapshot,
    'base_amount',p.base_amount,
    'fee_amount',p.fee_amount,
    'customer_fee_amount',p.customer_fee_amount,
    'merchant_fee_amount',p.merchant_fee_amount,
    'charged_amount',p.charged_amount,
    'estimated_net_settlement',p.estimated_net_settlement,
    'reference',p.reference
  ) order by p.part_order),'[]'::jsonb)
  from private.pos_sale_payment_parts_v3 p
  where p.sale_id=p_sale_id;
$$;
revoke all on function private.pos_sale_payment_breakdown_v3(uuid) from public,anon,authenticated;

create or replace function public.create_pos_sale_v3(p_request_id uuid,p_branch_id uuid,p_sale jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_sale public.sales%rowtype;
  v_existing_breakdown jsonb;
  v_requested_device_id uuid;
  v_splits jsonb;
  v_split jsonb;
  v_method public.pos_payment_methods%rowtype;
  v_method_id uuid;
  v_seen_methods uuid[] := array[]::uuid[];
  v_reference text;
  v_base numeric(12,2);
  v_fee numeric(12,2);
  v_customer_fee numeric(12,2);
  v_merchant_fee numeric(12,2);
  v_charged numeric(12,2);
  v_net numeric(12,2);
  v_base_due numeric(12,2);
  v_total numeric(12,2);
  v_voucher numeric(12,2);
  v_base_sum numeric(12,2) := 0;
  v_cash_base numeric(12,2) := 0;
  v_cash_charged numeric(12,2) := 0;
  v_noncash_base numeric(12,2) := 0;
  v_noncash_charged numeric(12,2) := 0;
  v_total_fee numeric(12,2) := 0;
  v_total_customer_fee numeric(12,2) := 0;
  v_total_merchant_fee numeric(12,2) := 0;
  v_total_charged numeric(12,2) := 0;
  v_total_net numeric(12,2) := 0;
  v_wallet_charged numeric(12,2) := 0;
  v_breakdown jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_part_order integer := 0;
  v_primary_method_id uuid;
  v_primary_code text;
  v_primary_name text;
  v_primary_type text;
  v_primary_reference text;
  v_legacy_payment text := 'mixed';
  v_saved jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_request_id is null or p_branch_id is null or jsonb_typeof(p_sale->'items') is distinct from 'array' then
    raise exception using errcode='22023',message='INVALID_SALE';
  end if;

  select * into v_sale from public.sales where id=p_request_id;
  if v_sale.id is not null then
    begin v_requested_device_id:=nullif(p_sale->>'device_id','')::uuid; exception when others then v_requested_device_id:=null; end;
    if v_sale.cashier_id is distinct from auth.uid()
       or v_sale.branch_id is distinct from p_branch_id
       or (v_sale.device_id is not null and v_requested_device_id is distinct from v_sale.device_id) then
      raise exception using errcode='42501',message='REQUEST_CONFLICT';
    end if;
    v_existing_breakdown:=coalesce(v_sale.payment_breakdown,private.pos_sale_payment_breakdown_v3(v_sale.id),'[]'::jsonb);
    return to_jsonb(v_sale)||jsonb_build_object(
      'payment_breakdown',v_existing_breakdown,
      'amount_due',coalesce(v_sale.amount_charged,v_sale.total),
      'payment_base_due',greatest(round(coalesce(v_sale.total,0)-coalesce(v_sale.loyalty_voucher_amount,0),2),0),
      'request_replayed',true
    );
  end if;

  begin
    v_total:=round(coalesce((p_sale->>'total')::numeric,0),2);
    v_voucher:=round(coalesce((p_sale->>'voucher_amount')::numeric,0),2);
  exception when others then
    raise exception using errcode='22023',message='INVALID_PAYMENT_SPLIT';
  end;
  v_base_due:=greatest(round(v_total-v_voucher,2),0);
  v_splits:=coalesce(p_sale->'payment_splits','[]'::jsonb);
  if jsonb_typeof(v_splits) is distinct from 'array' then raise exception using errcode='22023',message='INVALID_PAYMENT_SPLIT'; end if;
  v_count:=jsonb_array_length(v_splits);

  if v_base_due>0 and (v_count<1 or v_count>6) then raise exception using errcode='22023',message='PAYMENT_SPLITS_REQUIRED'; end if;
  if v_base_due<=0 and v_count>0 then raise exception using errcode='22023',message='ZERO_DUE_SPLITS_NOT_ALLOWED'; end if;

  for v_split in select value from jsonb_array_elements(v_splits) loop
    v_part_order:=v_part_order+1;
    begin
      v_method_id:=nullif(v_split->>'payment_method_id','')::uuid;
      v_base:=round(coalesce((v_split->>'base_amount')::numeric,0),2);
    exception when others then
      raise exception using errcode='22023',message='INVALID_PAYMENT_SPLIT';
    end;
    if v_method_id is null or v_base<=0 then raise exception using errcode='22023',message='INVALID_PAYMENT_SPLIT'; end if;
    if v_method_id=any(v_seen_methods) then raise exception using errcode='22023',message='DUPLICATE_PAYMENT_METHOD'; end if;
    v_seen_methods:=array_append(v_seen_methods,v_method_id);

    select * into v_method from public.pos_payment_methods
    where id=v_method_id and branch_id=p_branch_id and active;
    if v_method.id is null then raise exception using errcode='22023',message='PAYMENT_METHOD_UNAVAILABLE'; end if;

    v_reference:=nullif(btrim(coalesce(v_split->>'reference','')),'');
    if v_method.require_reference and v_reference is null then raise exception using errcode='22023',message='PAYMENT_REFERENCE_REQUIRED'; end if;

    v_fee:=case v_method.fee_type
      when 'percent' then round(v_base*coalesce(v_method.fee_value,0)/100,2)
      when 'fixed' then round(coalesce(v_method.fee_value,0),2)
      else 0 end;
    if v_method.method_type='cash' and v_fee>0 then raise exception using errcode='22023',message='CASH_SPLIT_FEE_UNSUPPORTED'; end if;
    v_customer_fee:=case when v_method.fee_bearer='customer' then v_fee else 0 end;
    v_merchant_fee:=case when v_method.fee_bearer='business' then v_fee else 0 end;
    v_charged:=round(v_base+v_customer_fee,2);
    v_net:=greatest(round(v_charged-v_fee,2),0);

    if v_part_order=1 then
      v_primary_method_id:=v_method.id;
      v_primary_code:=v_method.code;
      v_primary_name:=v_method.name;
      v_primary_type:=v_method.method_type;
      v_primary_reference:=v_reference;
    end if;

    v_base_sum:=round(v_base_sum+v_base,2);
    v_total_fee:=round(v_total_fee+v_fee,2);
    v_total_customer_fee:=round(v_total_customer_fee+v_customer_fee,2);
    v_total_merchant_fee:=round(v_total_merchant_fee+v_merchant_fee,2);
    v_total_charged:=round(v_total_charged+v_charged,2);
    v_total_net:=round(v_total_net+v_net,2);
    if v_method.method_type='cash' then
      v_cash_base:=round(v_cash_base+v_base,2);
      v_cash_charged:=round(v_cash_charged+v_charged,2);
    else
      v_noncash_base:=round(v_noncash_base+v_base,2);
      v_noncash_charged:=round(v_noncash_charged+v_charged,2);
      if v_method.method_type='digital_wallet' then v_wallet_charged:=round(v_wallet_charged+v_charged,2); end if;
    end if;

    v_breakdown:=v_breakdown||jsonb_build_array(jsonb_build_object(
      'part_order',v_part_order,'payment_method_id',v_method.id,'code',v_method.code,'name',v_method.name,
      'method_type',v_method.method_type,'settlement_account_id',v_method.settlement_account_id,
      'base_amount',v_base,'fee_amount',v_fee,'customer_fee_amount',v_customer_fee,
      'merchant_fee_amount',v_merchant_fee,'charged_amount',v_charged,'estimated_net_settlement',v_net,
      'reference',v_reference
    ));
  end loop;

  if abs(v_base_sum-v_base_due)>0.009 then
    raise exception using errcode='22023',message='INVALID_PAYMENT_SPLIT',detail=jsonb_build_object('expected_base',v_base_due,'split_base',v_base_sum)::text;
  end if;

  if v_base_due<=0 then
    v_total_charged:=0; v_total_net:=0; v_legacy_payment:='cash';
  elsif v_count=1 then
    v_legacy_payment:=case when v_primary_type='cash' then 'cash' else 'card' end;
  else
    v_legacy_payment:='mixed';
  end if;

  v_saved:=public.create_pos_sale(
    p_request_id,p_branch_id,
    (p_sale-array['payment_method_id','payment_reference','payment_splits'])||jsonb_build_object(
      'payment_method',v_legacy_payment,
      'cash_amount',v_cash_base,
      'card_amount',v_noncash_base
    )
  );

  select * into v_sale from public.sales where id=p_request_id for update;
  if v_sale.id is null then raise exception using errcode='55000',message='SALE_NOT_CONFIRMED'; end if;

  if v_base_due>0 then
    insert into public.pos_sale_payments(
      sale_id,branch_id,payment_method_id,base_amount,fee_amount,customer_fee_amount,merchant_fee_amount,
      charged_amount,estimated_net_settlement,reference,created_by
    ) values(
      v_sale.id,p_branch_id,v_primary_method_id,v_base_due,v_total_fee,v_total_customer_fee,v_total_merchant_fee,
      v_total_charged,v_total_net,case when v_count=1 then v_primary_reference else null end,auth.uid()
    );
  end if;

  v_part_order:=0;
  for v_split in select value from jsonb_array_elements(v_breakdown) loop
    v_part_order:=v_part_order+1;
    insert into private.pos_sale_payment_parts_v3(
      sale_id,branch_id,part_order,payment_method_id,method_code_snapshot,method_name_snapshot,method_type_snapshot,
      settlement_account_id_snapshot,base_amount,fee_amount,customer_fee_amount,merchant_fee_amount,charged_amount,
      estimated_net_settlement,reference,created_by
    ) values(
      v_sale.id,p_branch_id,v_part_order,(v_split->>'payment_method_id')::uuid,v_split->>'code',v_split->>'name',v_split->>'method_type',
      nullif(v_split->>'settlement_account_id','')::uuid,(v_split->>'base_amount')::numeric,(v_split->>'fee_amount')::numeric,
      (v_split->>'customer_fee_amount')::numeric,(v_split->>'merchant_fee_amount')::numeric,(v_split->>'charged_amount')::numeric,
      (v_split->>'estimated_net_settlement')::numeric,nullif(v_split->>'reference',''),auth.uid()
    );

    if v_split->>'method_type'<>'cash'
       and nullif(v_split->>'settlement_account_id','') is not null
       and (v_split->>'estimated_net_settlement')::numeric>0 then
      insert into public.payment_ledger(account_id,branch_id,sale_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
      values(
        (v_split->>'settlement_account_id')::uuid,p_branch_id,v_sale.id,'pos_sale_payment',
        (v_split->>'estimated_net_settlement')::numeric,v_split->>'code',nullif(v_split->>'reference',''),
        'تحصيل POS - فاتورة '||v_sale.invoice_number,
        jsonb_build_object('sale_id',v_sale.id,'split_payment',true,'part_order',v_part_order,
          'charged_amount',(v_split->>'charged_amount')::numeric,'base_amount',(v_split->>'base_amount')::numeric,
          'fee_amount',(v_split->>'fee_amount')::numeric,'fee_bearer',case when (v_split->>'customer_fee_amount')::numeric>0 then 'customer' else 'business' end),
        auth.uid()
      );
    end if;
  end loop;

  update public.sales set
    payment_method=v_legacy_payment,
    payment_method_id=case when v_count=1 then v_primary_method_id else null end,
    payment_method_code=case when v_count=1 then v_primary_code when v_count>1 then 'mixed' else 'voucher' end,
    payment_method_name=case when v_count=1 then v_primary_name when v_count>1 then 'دفع مختلط' else 'مغطاة بالكامل بالكوبون' end,
    payment_fee_amount=v_total_fee,
    payment_fee_bearer=case when v_total_customer_fee>0 and v_total_merchant_fee>0 then 'mixed' when v_total_customer_fee>0 then 'customer' when v_total_merchant_fee>0 then 'business' else null end,
    customer_payment_fee_amount=v_total_customer_fee,
    merchant_payment_fee_amount=v_total_merchant_fee,
    amount_charged=v_total_charged,
    cash_amount=v_cash_charged,
    card_amount=v_noncash_charged,
    net_profit_after_payment_fee=round(coalesce(profit,0)-v_total_merchant_fee,2),
    payment_reference=case when v_count=1 then v_primary_reference else null end,
    payment_breakdown=v_breakdown
  where id=v_sale.id;

  if v_count>1 then
    update public.sales set digital_wallet_amount=0 where id=v_sale.id;
  elsif v_count=1 and v_primary_type='digital_wallet' then
    update public.sales set digital_wallet_amount=v_wallet_charged where id=v_sale.id;
  else
    update public.sales set digital_wallet_amount=0 where id=v_sale.id;
  end if;

  select * into v_sale from public.sales where id=v_sale.id;

  update public.pos_invoices set
    customer_id=v_sale.customer_id,customer_name=v_sale.customer_name,customer_phone=v_sale.customer_phone,
    cash_amount=v_sale.cash_amount,card_amount=v_sale.card_amount,payment_method=v_sale.payment_method,
    payment_method_id=v_sale.payment_method_id,payment_method_code=v_sale.payment_method_code,payment_method_name=v_sale.payment_method_name,
    payment_method_type=case when v_count=1 then v_primary_type when v_count>1 then 'mixed' else 'voucher' end,
    payment_fee_amount=v_sale.payment_fee_amount,payment_fee_bearer=v_sale.payment_fee_bearer,
    customer_payment_fee_amount=v_sale.customer_payment_fee_amount,merchant_payment_fee_amount=v_sale.merchant_payment_fee_amount,
    amount_charged=v_sale.amount_charged,digital_wallet_amount=v_sale.digital_wallet_amount,
    net_profit_after_payment_fee=v_sale.net_profit_after_payment_fee,payment_reference=v_sale.payment_reference,
    payment_breakdown=v_breakdown
  where sale_id=v_sale.id;

  return to_jsonb(v_sale)||jsonb_build_object(
    'payment_breakdown',v_breakdown,'payment_base_due',v_base_due,'amount_due',v_total_charged,
    'payment_fee_amount',v_total_fee,'customer_payment_fee_amount',v_total_customer_fee,
    'merchant_payment_fee_amount',v_total_merchant_fee,'estimated_net_settlement',v_total_net,'request_replayed',false
  );
end;
$$;

revoke all on function public.create_pos_sale_v3(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_pos_sale_v3(uuid,uuid,jsonb) to authenticated;
