-- Immutable per-payment-method reconciliation captured when a POS shift closes.
-- Production migration: 20260908194714 / pos_shift_payment_reconciliation_v2.

create table if not exists public.pos_shift_payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.pos_shifts(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  payment_method_id uuid,
  method_code text not null,
  method_name_snapshot text not null,
  method_type_snapshot text not null,
  settlement_account_id_snapshot uuid,
  expected_source text not null,
  sale_count bigint not null default 0,
  base_amount numeric not null default 0,
  charged_amount numeric not null default 0,
  customer_fee_amount numeric not null default 0,
  merchant_fee_amount numeric not null default 0,
  confirmed_refund_amount numeric not null default 0,
  pending_refund_amount numeric not null default 0,
  expected_amount numeric not null,
  counted_amount numeric not null,
  variance_amount numeric not null,
  variance_reason text,
  confirmed_by uuid,
  confirmed_by_name_snapshot text,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint pos_shift_payment_reconciliations_shift_method_unique unique (shift_id,method_code),
  constraint pos_shift_payment_reconciliations_method_type_check check (method_type_snapshot in ('cash','card','digital_wallet','bank_transfer','other')),
  constraint pos_shift_payment_reconciliations_amounts_finite check (
    expected_amount::text not in ('NaN','Infinity','-Infinity') and
    counted_amount::text not in ('NaN','Infinity','-Infinity') and
    variance_amount::text not in ('NaN','Infinity','-Infinity')
  )
);

create index if not exists pos_shift_payment_recon_shift_idx
  on public.pos_shift_payment_reconciliations(shift_id);
create index if not exists pos_shift_payment_recon_branch_confirmed_idx
  on public.pos_shift_payment_reconciliations(branch_id,confirmed_at desc);

alter table public.pos_shift_payment_reconciliations enable row level security;
revoke all on table public.pos_shift_payment_reconciliations from public,anon,authenticated;
grant all on table public.pos_shift_payment_reconciliations to service_role;

-- Prevent a sale from attaching to a shift while that shift is being closed.
create or replace function private.attach_pos_shift_to_sale()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare v_shift public.pos_shifts%rowtype;
begin
  if new.request_fingerprint is null then return new; end if;
  select * into v_shift
  from public.pos_shifts
  where user_id=new.cashier_id and branch_id=new.branch_id and status='open'
  order by opened_at desc
  limit 1
  for update;
  if v_shift.id is null then raise exception using errcode='55000',message='POS_SHIFT_REQUIRED'; end if;
  new.shift_id:=v_shift.id;
  new.device_id:=v_shift.device_id;
  return new;
end;
$function$;

create or replace function private.pos_shift_reconciliation_preview(p_shift_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
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
  order by pm.active desc,pm.updated_at desc
  limit 1;

  select count(*) filter(where coalesce(s.cash_amount,0)>0 or s.payment_method_code='cash'),
         coalesce(sum(case
           when coalesce(s.cash_amount,0)>0 then s.cash_amount
           when s.payment_method_code='cash' then greatest(coalesce(s.total,0)-coalesce(s.loyalty_voucher_amount,0),0)
           else 0 end),0)
  into v_cash_sales_count,v_cash_base
  from public.sales s
  where s.shift_id=v_shift.id;

  v_methods := jsonb_build_array(jsonb_build_object(
    'payment_method_id',v_cash_method_id,
    'code','cash','name',coalesce(nullif(v_cash_name,''),'نقدي'),'method_type','cash',
    'settlement_account_id',null,'expected_source','cash_drawer_balance',
    'sale_count',coalesce(v_cash_sales_count,0),'base_amount',round(coalesce(v_cash_base,0),2),
    'charged_amount',round(coalesce(v_cash_base,0),2),'customer_fee_amount',0,'merchant_fee_amount',0,
    'confirmed_refund_amount',0,'pending_refund_amount',0,
    'expected_amount',v_cash_expected,'account_balance',v_cash_expected
  ));

  with payment_rows as (
    select
      pm.id payment_method_id,
      coalesce(nullif(s.payment_method_code,''),pm.code,'other') code,
      coalesce(nullif(s.payment_method_name,''),pm.name,'وسيلة دفع') name,
      coalesce(pm.method_type,case when s.payment_method='card' then 'card' when s.payment_method='cash' then 'cash' else 'other' end) method_type,
      pm.settlement_account_id,
      1::bigint sale_count,
      coalesce(psp.base_amount,greatest(coalesce(s.total,0)-coalesce(s.loyalty_voucher_amount,0),0))::numeric base_amount,
      coalesce(psp.charged_amount,nullif(s.amount_charged,0),greatest(coalesce(s.total,0)-coalesce(s.loyalty_voucher_amount,0),0))::numeric charged_amount,
      coalesce(psp.customer_fee_amount,s.customer_payment_fee_amount,0)::numeric customer_fee_amount,
      coalesce(psp.merchant_fee_amount,s.merchant_payment_fee_amount,0)::numeric merchant_fee_amount,
      coalesce(psp.estimated_net_settlement,
        greatest(coalesce(nullif(s.amount_charged,0),coalesce(s.total,0))-coalesce(s.payment_fee_amount,0),0))::numeric net_settlement
    from public.sales s
    left join public.pos_payment_methods pm on pm.id=s.payment_method_id
    left join public.pos_sale_payments psp on psp.sale_id=s.id
    where s.shift_id=v_shift.id
      and s.payment_method_id is not null
      and coalesce(pm.method_type,case when s.payment_method='cash' then 'cash' else 'other' end)<>'cash'

    union all

    select null::uuid,'legacy_card','بطاقة بنكية (سجل قديم)','card',null::uuid,1::bigint,
      coalesce(s.card_amount,0),coalesce(s.card_amount,0),0::numeric,0::numeric,coalesce(s.card_amount,0)
    from public.sales s
    where s.shift_id=v_shift.id and s.payment_method_id is null and coalesce(s.card_amount,0)>0

    union all

    select null::uuid,'legacy_wallet','محفظة رقمية (سجل قديم)','digital_wallet',null::uuid,1::bigint,
      coalesce(s.digital_wallet_amount,0),coalesce(s.digital_wallet_amount,0),0::numeric,0::numeric,coalesce(s.digital_wallet_amount,0)
    from public.sales s
    where s.shift_id=v_shift.id and s.payment_method_id is null and coalesce(s.digital_wallet_amount,0)>0

    union all

    select null::uuid,'legacy_other','وسيلة دفع قديمة','other',null::uuid,1::bigint,
      greatest(coalesce(s.total,0)-coalesce(s.loyalty_voucher_amount,0),0),
      greatest(coalesce(s.total,0)-coalesce(s.loyalty_voucher_amount,0),0),0::numeric,0::numeric,
      greatest(coalesce(s.total,0)-coalesce(s.loyalty_voucher_amount,0),0)
    from public.sales s
    where s.shift_id=v_shift.id and s.payment_method_id is null
      and coalesce(s.cash_amount,0)<=0 and coalesce(s.card_amount,0)<=0 and coalesce(s.digital_wallet_amount,0)<=0
      and coalesce(s.payment_method,'cash')<>'cash'
  ), payment_agg as (
    select code,
      (array_agg(payment_method_id) filter(where payment_method_id is not null))[1] payment_method_id,
      (array_agg(name order by name))[1] name,
      (array_agg(method_type order by method_type))[1] method_type,
      (array_agg(settlement_account_id) filter(where settlement_account_id is not null))[1] settlement_account_id,
      sum(sale_count)::bigint sale_count,sum(base_amount)::numeric base_amount,sum(charged_amount)::numeric charged_amount,
      sum(customer_fee_amount)::numeric customer_fee_amount,sum(merchant_fee_amount)::numeric merchant_fee_amount,
      sum(net_settlement)::numeric net_settlement
    from payment_rows group by code
  ), refund_rows as (
    select
      coalesce(
        case when s.payment_method_id is not null then coalesce(nullif(s.payment_method_code,''),pm.code) end,
        case when coalesce(s.card_amount,0)>0 then 'legacy_card' end,
        case when coalesce(s.digital_wallet_amount,0)>0 then 'legacy_wallet' end,
        'legacy_other') code,
      pm.id payment_method_id,
      coalesce(nullif(s.payment_method_name,''),pm.name,
        case when coalesce(s.card_amount,0)>0 then 'بطاقة بنكية (سجل قديم)'
             when coalesce(s.digital_wallet_amount,0)>0 then 'محفظة رقمية (سجل قديم)' else 'وسيلة دفع قديمة' end) name,
      coalesce(pm.method_type,
        case when coalesce(s.card_amount,0)>0 then 'card'
             when coalesce(s.digital_wallet_amount,0)>0 then 'digital_wallet' else 'other' end) method_type,
      pm.settlement_account_id,
      coalesce(sum(r.amount) filter(where r.status='confirmed'),0)::numeric confirmed_refund_amount,
      coalesce(sum(r.amount) filter(where r.status='pending'),0)::numeric pending_refund_amount
    from public.pos_card_refunds r
    join public.sales s on s.id=r.sale_id
    left join public.pos_payment_methods pm on pm.id=s.payment_method_id
    where r.shift_id=v_shift.id
    group by 1,pm.id,3,4,pm.settlement_account_id
  ), refund_agg as (
    select code,
      (array_agg(payment_method_id) filter(where payment_method_id is not null))[1] payment_method_id,
      (array_agg(name order by name))[1] name,
      (array_agg(method_type order by method_type))[1] method_type,
      (array_agg(settlement_account_id) filter(where settlement_account_id is not null))[1] settlement_account_id,
      sum(confirmed_refund_amount)::numeric confirmed_refund_amount,
      sum(pending_refund_amount)::numeric pending_refund_amount
    from refund_rows group by code
  ), candidates as (
    select p.code,p.payment_method_id,p.name,p.method_type,p.settlement_account_id,1 priority from payment_agg p
    union all
    select r.code,r.payment_method_id,r.name,r.method_type,r.settlement_account_id,1 from refund_agg r
    union all
    select pm.code,pm.id,pm.name,pm.method_type,pm.settlement_account_id,2
    from public.pos_payment_methods pm
    where pm.branch_id=v_shift.branch_id and pm.active and pm.method_type<>'cash'
  ), method_keys as (
    select distinct on(code) code,payment_method_id,name,method_type,settlement_account_id
    from candidates
    where code is not null and code<>'' and method_type<>'cash'
    order by code,priority,payment_method_id nulls last
  ), electronic as (
    select k.*,
      coalesce(p.sale_count,0)::bigint sale_count,coalesce(p.base_amount,0)::numeric base_amount,
      coalesce(p.charged_amount,0)::numeric charged_amount,coalesce(p.customer_fee_amount,0)::numeric customer_fee_amount,
      coalesce(p.merchant_fee_amount,0)::numeric merchant_fee_amount,coalesce(p.net_settlement,0)::numeric net_settlement,
      coalesce(r.confirmed_refund_amount,0)::numeric confirmed_refund_amount,
      coalesce(r.pending_refund_amount,0)::numeric pending_refund_amount
    from method_keys k
    left join payment_agg p using(code)
    left join refund_agg r using(code)
  )
  select v_methods || coalesce(jsonb_agg(jsonb_build_object(
    'payment_method_id',e.payment_method_id,'code',e.code,'name',e.name,'method_type',e.method_type,
    'settlement_account_id',e.settlement_account_id,'expected_source','payment_snapshot_net_shift',
    'sale_count',e.sale_count,'base_amount',round(e.base_amount,2),'charged_amount',round(e.charged_amount,2),
    'customer_fee_amount',round(e.customer_fee_amount,2),'merchant_fee_amount',round(e.merchant_fee_amount,2),
    'confirmed_refund_amount',round(e.confirmed_refund_amount,2),'pending_refund_amount',round(e.pending_refund_amount,2),
    'expected_amount',round(e.net_settlement-e.confirmed_refund_amount,2),
    'account_balance',case when e.settlement_account_id is null then null else round(coalesce((select sum(pl.signed_amount) from public.payment_ledger pl where pl.account_id=e.settlement_account_id),0),2) end
  ) order by e.name),'[]'::jsonb)
  into v_methods
  from electronic e;

  return jsonb_build_object(
    'version',2,'shift_id',v_shift.id,'branch_id',v_shift.branch_id,'device_id',v_shift.device_id,
    'cashier_id',v_shift.user_id,'status',v_shift.status,'opened_at',v_shift.opened_at,
    'methods',v_methods,'generated_at',now()
  );
end;
$function$;

revoke all on function private.pos_shift_reconciliation_preview(uuid) from public,anon,authenticated;
grant execute on function private.pos_shift_reconciliation_preview(uuid) to postgres,service_role;

create or replace function public.get_my_pos_shift_reconciliation_preview(p_device_id uuid,p_device_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_device public.pos_devices%rowtype;
  v_shift public.pos_shifts%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());
  select * into v_shift
  from public.pos_shifts
  where user_id=auth.uid() and device_id=v_device.id and branch_id=v_device.branch_id and status='open'
  order by opened_at desc limit 1;
  if v_shift.id is null then raise exception using errcode='22023',message='SHIFT_NOT_OPEN'; end if;
  return private.pos_shift_reconciliation_preview(v_shift.id);
end;
$function$;

create or replace function public.close_pos_shift_v2(
  p_shift_id uuid,p_device_id uuid,p_device_token text,p_reconciliation jsonb,p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_device public.pos_devices%rowtype;
  v_shift public.pos_shifts%rowtype;
  v_preview jsonb;
  v_method jsonb;
  v_count_row jsonb;
  v_expected numeric;
  v_counted numeric;
  v_variance numeric;
  v_reason text;
  v_cash_counted numeric;
  v_expected_count integer := 0;
  v_payload_count integer := 0;
  v_dup_count integer := 0;
  v_result jsonb;
  v_saved jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if jsonb_typeof(p_reconciliation) is distinct from 'array' then raise exception using errcode='22023',message='INVALID_RECONCILIATION'; end if;

  v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());
  select * into v_shift from public.pos_shifts where id=p_shift_id for update;
  if v_shift.id is null or v_shift.status<>'open' or v_shift.device_id<>v_device.id then raise exception using errcode='22023',message='SHIFT_NOT_OPEN'; end if;
  if auth.uid()<>v_shift.user_id and not public.staff_has_permission('pos.manage_shifts',v_shift.branch_id) then raise exception using errcode='42501',message='SHIFT_ACCESS_DENIED'; end if;

  v_preview:=private.pos_shift_reconciliation_preview(v_shift.id);
  v_expected_count:=jsonb_array_length(v_preview->'methods');
  v_payload_count:=jsonb_array_length(p_reconciliation);
  if v_payload_count<>v_expected_count then raise exception using errcode='22023',message='RECONCILIATION_METHOD_MISMATCH'; end if;

  for v_method in select value from jsonb_array_elements(v_preview->'methods') loop
    select count(*),min(value::text)::jsonb into v_dup_count,v_count_row
    from jsonb_array_elements(p_reconciliation)
    where value->>'code'=v_method->>'code';
    if v_dup_count<>1 or v_count_row is null then raise exception using errcode='22023',message='RECONCILIATION_METHOD_MISMATCH'; end if;
    begin
      v_counted:=(v_count_row->>'counted_amount')::numeric;
    exception when others then
      raise exception using errcode='22023',message='INVALID_RECONCILIATION_AMOUNT';
    end;
    if v_counted is null or v_counted::text in ('NaN','Infinity','-Infinity') then raise exception using errcode='22023',message='INVALID_RECONCILIATION_AMOUNT'; end if;
    if v_method->>'code'='cash' and v_counted<0 then raise exception using errcode='22023',message='INVALID_RECONCILIATION_AMOUNT'; end if;
    v_expected:=round(coalesce((v_method->>'expected_amount')::numeric,0),2);
    v_counted:=round(v_counted,2);
    v_variance:=round(v_counted-v_expected,2);
    v_reason:=nullif(btrim(coalesce(v_count_row->>'variance_reason','')),'');
    if abs(v_variance)>0.005 and v_reason is null then raise exception using errcode='22023',message='RECONCILIATION_REASON_REQUIRED|'||(v_method->>'code'); end if;
    if v_method->>'code'='cash' then v_cash_counted:=v_counted; end if;
  end loop;

  if v_cash_counted is null then raise exception using errcode='22023',message='CASH_RECONCILIATION_REQUIRED'; end if;

  v_result:=public.close_pos_shift(p_shift_id,p_device_id,p_device_token,v_cash_counted,p_notes);

  for v_method in select value from jsonb_array_elements(v_preview->'methods') loop
    select value into v_count_row from jsonb_array_elements(p_reconciliation) where value->>'code'=v_method->>'code' limit 1;
    v_expected:=round(coalesce((v_method->>'expected_amount')::numeric,0),2);
    v_counted:=round((v_count_row->>'counted_amount')::numeric,2);
    v_variance:=round(v_counted-v_expected,2);
    v_reason:=nullif(btrim(coalesce(v_count_row->>'variance_reason','')),'');

    insert into public.pos_shift_payment_reconciliations(
      shift_id,branch_id,payment_method_id,method_code,method_name_snapshot,method_type_snapshot,
      settlement_account_id_snapshot,expected_source,sale_count,base_amount,charged_amount,
      customer_fee_amount,merchant_fee_amount,confirmed_refund_amount,pending_refund_amount,
      expected_amount,counted_amount,variance_amount,variance_reason,confirmed_by,confirmed_by_name_snapshot,confirmed_at
    ) values(
      v_shift.id,v_shift.branch_id,nullif(v_method->>'payment_method_id','')::uuid,v_method->>'code',v_method->>'name',v_method->>'method_type',
      nullif(v_method->>'settlement_account_id','')::uuid,v_method->>'expected_source',coalesce((v_method->>'sale_count')::bigint,0),
      round(coalesce((v_method->>'base_amount')::numeric,0),2),round(coalesce((v_method->>'charged_amount')::numeric,0),2),
      round(coalesce((v_method->>'customer_fee_amount')::numeric,0),2),round(coalesce((v_method->>'merchant_fee_amount')::numeric,0),2),
      round(coalesce((v_method->>'confirmed_refund_amount')::numeric,0),2),round(coalesce((v_method->>'pending_refund_amount')::numeric,0),2),
      v_expected,v_counted,v_variance,v_reason,auth.uid(),(select u.name from public.users u where u.id=auth.uid()),now()
    );

    v_saved:=v_saved||jsonb_build_array(jsonb_build_object(
      'code',v_method->>'code','name',v_method->>'name','method_type',v_method->>'method_type',
      'expected_amount',v_expected,'counted_amount',v_counted,'variance_amount',v_variance,'variance_reason',v_reason,
      'expected_source',v_method->>'expected_source'
    ));
  end loop;

  return v_result||jsonb_build_object('reconciliation_version',2,'payment_reconciliations',v_saved);
end;
$function$;

create or replace function public.get_reporting_shift_reconciliations_v2(
  p_branch_id uuid,p_from timestamptz,p_to timestamptz,p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,500),10),2000);
  v_can_control boolean:=false;
  v_rows jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then raise exception using errcode='42501',message='REPORTS_VIEW_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;

  v_can_control:=public.staff_has_permission('pos.manage_shifts',p_branch_id) or private.can_manage_financial_branch(p_branch_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'shift_id',r.shift_id,'payment_method_id',r.payment_method_id,'code',r.method_code,
    'name',r.method_name_snapshot,'method_type',r.method_type_snapshot,
    'settlement_account_id',r.settlement_account_id_snapshot,'expected_source',r.expected_source,
    'sale_count',r.sale_count,'base_amount',round(r.base_amount,2),'charged_amount',round(r.charged_amount,2),
    'customer_fee_amount',round(r.customer_fee_amount,2),'merchant_fee_amount',round(r.merchant_fee_amount,2),
    'confirmed_refund_amount',round(r.confirmed_refund_amount,2),'pending_refund_amount',round(r.pending_refund_amount,2),
    'expected_amount',case when v_can_control then round(r.expected_amount,2) else null end,
    'counted_amount',case when v_can_control then round(r.counted_amount,2) else null end,
    'variance_amount',case when v_can_control then round(r.variance_amount,2) else null end,
    'variance_reason',case when v_can_control then r.variance_reason else null end,
    'confirmed_by',case when v_can_control then r.confirmed_by else null end,
    'confirmed_by_name',case when v_can_control then r.confirmed_by_name_snapshot else null end,
    'confirmed_at',r.confirmed_at
  ) order by r.confirmed_at desc,r.shift_id,r.method_type_snapshot,r.method_name_snapshot),'[]'::jsonb)
  into v_rows
  from (
    select r.* from public.pos_shift_payment_reconciliations r
    join public.pos_shifts s on s.id=r.shift_id
    where r.branch_id=p_branch_id and s.closed_at>=p_from and s.closed_at<p_to
    order by r.confirmed_at desc
    limit v_limit
  ) r;

  return jsonb_build_object('version',2,'branch_id',p_branch_id,'from',p_from,'to',p_to,
    'permissions',jsonb_build_object('can_view_reconciliation',v_can_control),'rows',v_rows);
end;
$function$;

revoke all on function public.get_my_pos_shift_reconciliation_preview(uuid,text) from public,anon;
revoke all on function public.close_pos_shift_v2(uuid,uuid,text,jsonb,text) from public,anon;
revoke all on function public.get_reporting_shift_reconciliations_v2(uuid,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.get_my_pos_shift_reconciliation_preview(uuid,text) to authenticated,service_role;
grant execute on function public.close_pos_shift_v2(uuid,uuid,text,jsonb,text) to authenticated,service_role;
grant execute on function public.get_reporting_shift_reconciliations_v2(uuid,timestamptz,timestamptz,integer) to authenticated,service_role;
