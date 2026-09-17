alter table public.merchant_financial_entries
  add column if not exists source_kind text not null default 'legacy',
  add column if not exists source_id uuid;

alter table public.merchant_financial_entries
  drop constraint if exists merchant_financial_entries_entry_type_check;
alter table public.merchant_financial_entries
  add constraint merchant_financial_entries_entry_type_check
  check (entry_type in (
    'order_gross','commission','payment_fee','delivery_contribution','refund','adjustment','payout_adjustment',
    'franchise_sale_accrual_marker','franchise_royalty','franchise_marketing_fee','franchise_platform_fee',
    'franchise_fixed_fee','franchise_adjustment'
  ));

create index if not exists idx_merchant_financial_entries_source_v1
  on public.merchant_financial_entries(merchant_id, source_kind, source_id);

alter table public.merchant_settlements
  add column if not exists settlement_kind text not null default 'marketplace',
  add column if not exists paid_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancellation_reason text;

alter table public.merchant_settlements
  drop constraint if exists merchant_settlements_kind_check;
alter table public.merchant_settlements
  add constraint merchant_settlements_kind_check check (settlement_kind in ('marketplace','franchise'));

create index if not exists idx_merchant_settlements_kind_status_v1
  on public.merchant_settlements(merchant_id, settlement_kind, status, period_end desc);

create table if not exists private.merchant_settlement_events_v1 (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.merchant_settlements(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_merchant_settlement_events_v1
  on private.merchant_settlement_events_v1(merchant_id, created_at desc);
alter table private.merchant_settlement_events_v1 enable row level security;
revoke all on private.merchant_settlement_events_v1 from public, anon, authenticated;
grant select on private.merchant_settlement_events_v1 to service_role;

create or replace function private.can_view_franchise_finance_v1(p_merchant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_branch_count integer;
begin
  if public.is_super_admin() then
    return true;
  end if;

  select m.tenant_id into v_tenant_id
  from public.merchants m
  where m.id=p_merchant_id and m.merchant_type='franchise';

  if v_tenant_id is null then
    return false;
  end if;

  if public.can_manage_business_structure_v1(v_tenant_id) then
    return true;
  end if;

  select count(*) into v_branch_count
  from public.branches b
  where b.merchant_id=p_merchant_id;

  if v_branch_count=0 then
    return false;
  end if;

  return not exists (
    select 1
    from public.branches b
    where b.merchant_id=p_merchant_id
      and not (
        public.staff_has_permission('finance.view',b.id)
        or public.staff_has_permission('finance.manage',b.id)
      )
  );
end;
$$;
revoke all on function private.can_view_franchise_finance_v1(uuid) from public, anon, authenticated;

create or replace function private.can_manage_franchise_finance_v1(p_merchant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_branch_count integer;
begin
  if public.is_super_admin() then
    return true;
  end if;

  if not exists (
    select 1 from public.merchants m
    where m.id=p_merchant_id and m.merchant_type='franchise'
  ) then
    return false;
  end if;

  select count(*) into v_branch_count
  from public.branches b
  where b.merchant_id=p_merchant_id;

  if v_branch_count=0 then
    return false;
  end if;

  return not exists (
    select 1
    from public.branches b
    where b.merchant_id=p_merchant_id
      and not public.staff_has_permission('finance.manage',b.id)
  );
end;
$$;
revoke all on function private.can_manage_franchise_finance_v1(uuid) from public, anon, authenticated;

create or replace function private.post_franchise_sale_fees_v1(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_tenant_id uuid;
  v_merchant_id uuid;
  v_merchant_type text;
  v_agreement private.franchise_agreements_v1%rowtype;
  v_basis numeric(14,2);
  v_royalty numeric(14,2);
  v_marketing numeric(14,2);
  v_platform numeric(14,2);
  v_snapshot jsonb;
begin
  select * into v_sale from public.sales where id=p_sale_id;
  if v_sale.id is null or v_sale.branch_id is null then
    return jsonb_build_object('posted',false,'reason','SALE_OR_BRANCH_NOT_FOUND');
  end if;

  select b.tenant_id,b.merchant_id,m.merchant_type
    into v_tenant_id,v_merchant_id,v_merchant_type
  from public.branches b
  join public.merchants m on m.id=b.merchant_id
  where b.id=v_sale.branch_id;

  if v_merchant_id is null or v_merchant_type <> 'franchise' then
    return jsonb_build_object('posted',false,'reason','NOT_FRANCHISE');
  end if;

  if exists (
    select 1 from public.merchant_financial_entries mfe
    where mfe.merchant_id=v_merchant_id
      and mfe.source_kind='pos_sale'
      and mfe.source_id=v_sale.id
      and mfe.entry_type='franchise_sale_accrual_marker'
  ) then
    return jsonb_build_object('posted',true,'already_posted',true,'sale_id',v_sale.id);
  end if;

  select a.* into v_agreement
  from private.franchise_agreements_v1 a
  where a.merchant_id=v_merchant_id
    and a.activated_at is not null
    and a.starts_on <= v_sale.date::date
    and (a.ends_on is null or a.ends_on >= v_sale.date::date)
    and a.status in ('active','suspended','expired','terminated')
  order by a.version desc
  limit 1;

  if v_agreement.id is null then
    return jsonb_build_object('posted',false,'reason','FRANCHISE_AGREEMENT_NOT_FOUND_FOR_SALE','sale_id',v_sale.id);
  end if;

  v_basis := greatest(round(coalesce(v_sale.total,0),2),0);
  v_royalty := round(v_basis * v_agreement.royalty_rate / 100.0,2);
  v_marketing := round(v_basis * v_agreement.marketing_fee_rate / 100.0,2);
  v_platform := round(v_basis * v_agreement.platform_fee_rate / 100.0,2);

  v_snapshot := jsonb_build_object(
    'source_kind','pos_sale',
    'sale_id',v_sale.id,
    'invoice_number',v_sale.invoice_number,
    'branch_id',v_sale.branch_id,
    'sale_total',v_sale.total,
    'fee_basis','sale_total_after_discounts',
    'fee_basis_amount',v_basis,
    'agreement',jsonb_build_object(
      'id',v_agreement.id,
      'agreement_code',v_agreement.agreement_code,
      'version',v_agreement.version,
      'starts_on',v_agreement.starts_on,
      'ends_on',v_agreement.ends_on,
      'royalty_rate',v_agreement.royalty_rate,
      'marketing_fee_rate',v_agreement.marketing_fee_rate,
      'platform_fee_rate',v_agreement.platform_fee_rate,
      'monthly_fixed_fee',v_agreement.monthly_fixed_fee,
      'currency',v_agreement.currency,
      'settlement_cycle',v_agreement.settlement_cycle
    )
  );

  if v_royalty <> 0 then
    insert into public.merchant_financial_entries(
      tenant_id,merchant_id,branch_id,entry_type,signed_amount,currency,idempotency_key,
      description,snapshot,occurred_at,created_by,source_kind,source_id
    ) values (
      v_tenant_id,v_merchant_id,v_sale.branch_id,'franchise_royalty',-v_royalty,v_agreement.currency,
      'franchise:sale:'||v_sale.id||':royalty','Franchise royalty fee',v_snapshot,v_sale.date,auth.uid(),'pos_sale',v_sale.id
    ) on conflict (merchant_id,idempotency_key) do nothing;
  end if;

  if v_marketing <> 0 then
    insert into public.merchant_financial_entries(
      tenant_id,merchant_id,branch_id,entry_type,signed_amount,currency,idempotency_key,
      description,snapshot,occurred_at,created_by,source_kind,source_id
    ) values (
      v_tenant_id,v_merchant_id,v_sale.branch_id,'franchise_marketing_fee',-v_marketing,v_agreement.currency,
      'franchise:sale:'||v_sale.id||':marketing','Franchise marketing fee',v_snapshot,v_sale.date,auth.uid(),'pos_sale',v_sale.id
    ) on conflict (merchant_id,idempotency_key) do nothing;
  end if;

  if v_platform <> 0 then
    insert into public.merchant_financial_entries(
      tenant_id,merchant_id,branch_id,entry_type,signed_amount,currency,idempotency_key,
      description,snapshot,occurred_at,created_by,source_kind,source_id
    ) values (
      v_tenant_id,v_merchant_id,v_sale.branch_id,'franchise_platform_fee',-v_platform,v_agreement.currency,
      'franchise:sale:'||v_sale.id||':platform','Franchise platform fee',v_snapshot,v_sale.date,auth.uid(),'pos_sale',v_sale.id
    ) on conflict (merchant_id,idempotency_key) do nothing;
  end if;

  insert into public.merchant_financial_entries(
    tenant_id,merchant_id,branch_id,entry_type,signed_amount,currency,idempotency_key,
    description,snapshot,occurred_at,created_by,source_kind,source_id
  ) values (
    v_tenant_id,v_merchant_id,v_sale.branch_id,'franchise_sale_accrual_marker',0,v_agreement.currency,
    'franchise:sale:'||v_sale.id||':marker','Franchise POS sale accrual marker',v_snapshot,v_sale.date,auth.uid(),'pos_sale',v_sale.id
  ) on conflict (merchant_id,idempotency_key) do nothing;

  return jsonb_build_object(
    'posted',true,'sale_id',v_sale.id,'merchant_id',v_merchant_id,'basis',v_basis,
    'royalty',v_royalty,'marketing_fee',v_marketing,'platform_fee',v_platform,
    'agreement_id',v_agreement.id,'agreement_version',v_agreement.version
  );
end;
$$;
revoke all on function private.post_franchise_sale_fees_v1(uuid) from public, anon, authenticated;

create or replace function private.post_franchise_online_order_fees_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.online_orders%rowtype;
  v_merchant_type text;
  v_agreement private.franchise_agreements_v1%rowtype;
  v_basis numeric(14,2);
  v_royalty numeric(14,2);
  v_marketing numeric(14,2);
  v_platform numeric(14,2);
  v_occurred_at timestamptz;
  v_snapshot jsonb;
begin
  select * into v_order from public.online_orders where id=p_order_id;
  if v_order.id is null or v_order.branch_id is null or v_order.status::text <> 'delivered' then
    return jsonb_build_object('posted',false,'reason','ORDER_NOT_DELIVERED');
  end if;

  select m.merchant_type into v_merchant_type
  from public.merchants m where m.id=v_order.merchant_id;
  if v_merchant_type <> 'franchise' then
    return jsonb_build_object('posted',false,'reason','NOT_FRANCHISE');
  end if;

  if exists (
    select 1 from public.merchant_financial_entries mfe
    where mfe.merchant_id=v_order.merchant_id
      and mfe.source_kind='online_order'
      and mfe.source_id=v_order.id
      and mfe.entry_type='franchise_sale_accrual_marker'
  ) then
    return jsonb_build_object('posted',true,'already_posted',true,'order_id',v_order.id);
  end if;

  select a.* into v_agreement
  from private.franchise_agreements_v1 a
  where a.merchant_id=v_order.merchant_id
    and a.activated_at is not null
    and a.starts_on <= coalesce(v_order.created_at,now())::date
    and (a.ends_on is null or a.ends_on >= coalesce(v_order.created_at,now())::date)
    and a.status in ('active','suspended','expired','terminated')
  order by a.version desc
  limit 1;

  if v_agreement.id is null then
    return jsonb_build_object('posted',false,'reason','FRANCHISE_AGREEMENT_NOT_FOUND_FOR_ORDER','order_id',v_order.id);
  end if;

  v_basis := greatest(round(coalesce(v_order.total,0)-coalesce(v_order.shipping_cost,0),2),0);
  v_royalty := round(v_basis * v_agreement.royalty_rate / 100.0,2);
  v_marketing := round(v_basis * v_agreement.marketing_fee_rate / 100.0,2);
  v_platform := round(v_basis * v_agreement.platform_fee_rate / 100.0,2);
  v_occurred_at := coalesce(v_order.updated_at,v_order.created_at,now());

  v_snapshot := jsonb_build_object(
    'source_kind','online_order',
    'order_id',v_order.id,
    'branch_id',v_order.branch_id,
    'order_total',v_order.total,
    'shipping_cost',v_order.shipping_cost,
    'fee_basis','order_total_excluding_shipping',
    'fee_basis_amount',v_basis,
    'agreement',jsonb_build_object(
      'id',v_agreement.id,'agreement_code',v_agreement.agreement_code,'version',v_agreement.version,
      'starts_on',v_agreement.starts_on,'ends_on',v_agreement.ends_on,
      'royalty_rate',v_agreement.royalty_rate,'marketing_fee_rate',v_agreement.marketing_fee_rate,
      'platform_fee_rate',v_agreement.platform_fee_rate,'monthly_fixed_fee',v_agreement.monthly_fixed_fee,
      'currency',v_agreement.currency,'settlement_cycle',v_agreement.settlement_cycle
    )
  );

  if v_royalty <> 0 then
    insert into public.merchant_financial_entries(
      tenant_id,merchant_id,branch_id,order_id,entry_type,signed_amount,currency,idempotency_key,
      description,snapshot,occurred_at,created_by,source_kind,source_id
    ) values (
      v_order.tenant_id,v_order.merchant_id,v_order.branch_id,v_order.id,'franchise_royalty',-v_royalty,v_agreement.currency,
      'franchise:order:'||v_order.id||':royalty','Franchise royalty fee',v_snapshot,v_occurred_at,auth.uid(),'online_order',v_order.id
    ) on conflict (merchant_id,idempotency_key) do nothing;
  end if;

  if v_marketing <> 0 then
    insert into public.merchant_financial_entries(
      tenant_id,merchant_id,branch_id,order_id,entry_type,signed_amount,currency,idempotency_key,
      description,snapshot,occurred_at,created_by,source_kind,source_id
    ) values (
      v_order.tenant_id,v_order.merchant_id,v_order.branch_id,v_order.id,'franchise_marketing_fee',-v_marketing,v_agreement.currency,
      'franchise:order:'||v_order.id||':marketing','Franchise marketing fee',v_snapshot,v_occurred_at,auth.uid(),'online_order',v_order.id
    ) on conflict (merchant_id,idempotency_key) do nothing;
  end if;

  if v_platform <> 0 then
    insert into public.merchant_financial_entries(
      tenant_id,merchant_id,branch_id,order_id,entry_type,signed_amount,currency,idempotency_key,
      description,snapshot,occurred_at,created_by,source_kind,source_id
    ) values (
      v_order.tenant_id,v_order.merchant_id,v_order.branch_id,v_order.id,'franchise_platform_fee',-v_platform,v_agreement.currency,
      'franchise:order:'||v_order.id||':platform','Franchise platform fee',v_snapshot,v_occurred_at,auth.uid(),'online_order',v_order.id
    ) on conflict (merchant_id,idempotency_key) do nothing;
  end if;

  insert into public.merchant_financial_entries(
    tenant_id,merchant_id,branch_id,order_id,entry_type,signed_amount,currency,idempotency_key,
    description,snapshot,occurred_at,created_by,source_kind,source_id
  ) values (
    v_order.tenant_id,v_order.merchant_id,v_order.branch_id,v_order.id,'franchise_sale_accrual_marker',0,v_agreement.currency,
    'franchise:order:'||v_order.id||':marker','Franchise online order accrual marker',v_snapshot,v_occurred_at,auth.uid(),'online_order',v_order.id
  ) on conflict (merchant_id,idempotency_key) do nothing;

  return jsonb_build_object(
    'posted',true,'order_id',v_order.id,'merchant_id',v_order.merchant_id,'basis',v_basis,
    'royalty',v_royalty,'marketing_fee',v_marketing,'platform_fee',v_platform,
    'agreement_id',v_agreement.id,'agreement_version',v_agreement.version
  );
end;
$$;
revoke all on function private.post_franchise_online_order_fees_v1(uuid) from public, anon, authenticated;

create or replace function private.capture_franchise_sale_finance_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.post_franchise_sale_fees_v1(new.id);
  return new;
end;
$$;
revoke all on function private.capture_franchise_sale_finance_v1() from public, anon, authenticated;

drop trigger if exists zzzzz_capture_franchise_sale_finance_v1 on public.sales;
create trigger zzzzz_capture_franchise_sale_finance_v1
after insert on public.sales
for each row execute function private.capture_franchise_sale_finance_v1();

create or replace function private.capture_franchise_online_order_finance_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status::text='delivered' and old.status::text is distinct from new.status::text then
    perform private.post_franchise_online_order_fees_v1(new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.capture_franchise_online_order_finance_v1() from public, anon, authenticated;

drop trigger if exists zzzzz_capture_franchise_online_order_finance_v1 on public.online_orders;
create trigger zzzzz_capture_franchise_online_order_finance_v1
after update of status on public.online_orders
for each row execute function private.capture_franchise_online_order_finance_v1();

create or replace function public.accrue_franchise_period_v1(
  p_merchant_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale record;
  v_order record;
  v_tenant_id uuid;
  v_currency text := 'EGP';
  v_month_start date;
  v_month_end date;
  v_charge_date date;
  v_agreement private.franchise_agreements_v1%rowtype;
  v_pos_count integer := 0;
  v_online_count integer := 0;
  v_fixed_count integer := 0;
  v_fixed_amount numeric(14,2) := 0;
  v_snapshot jsonb;
begin
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'FRANCHISE_FINANCE_INVALID_PERIOD';
  end if;

  if not private.can_manage_franchise_finance_v1(p_merchant_id) then
    raise exception 'FRANCHISE_FINANCE_MANAGE_REQUIRED';
  end if;

  select m.tenant_id into v_tenant_id
  from public.merchants m
  where m.id=p_merchant_id and m.merchant_type='franchise';
  if v_tenant_id is null then raise exception 'FRANCHISE_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(hashtextextended('franchise_accrual:'||p_merchant_id::text,0));

  for v_sale in
    select s.id
    from public.sales s
    join public.branches b on b.id=s.branch_id
    where b.merchant_id=p_merchant_id
      and s.date between p_period_start and p_period_end
      and not exists (
        select 1 from public.merchant_financial_entries mfe
        where mfe.merchant_id=p_merchant_id and mfe.source_kind='pos_sale' and mfe.source_id=s.id
          and mfe.entry_type='franchise_sale_accrual_marker'
      )
    order by s.date,s.id
  loop
    perform private.post_franchise_sale_fees_v1(v_sale.id);
    v_pos_count := v_pos_count + 1;
  end loop;

  for v_order in
    select o.id
    from public.online_orders o
    where o.merchant_id=p_merchant_id
      and o.status::text='delivered'
      and coalesce(o.updated_at,o.created_at) between p_period_start and p_period_end
      and not exists (
        select 1 from public.merchant_financial_entries mfe
        where mfe.merchant_id=p_merchant_id and mfe.source_kind='online_order' and mfe.source_id=o.id
          and mfe.entry_type='franchise_sale_accrual_marker'
      )
    order by coalesce(o.updated_at,o.created_at),o.id
  loop
    perform private.post_franchise_online_order_fees_v1(v_order.id);
    v_online_count := v_online_count + 1;
  end loop;

  v_month_start := date_trunc('month',p_period_start)::date;
  while v_month_start <= date_trunc('month',p_period_end)::date loop
    v_month_end := (v_month_start + interval '1 month - 1 day')::date;

    select a.* into v_agreement
    from private.franchise_agreements_v1 a
    where a.merchant_id=p_merchant_id
      and a.activated_at is not null
      and a.starts_on <= least(v_month_end,p_period_end::date)
      and (a.ends_on is null or a.ends_on >= v_month_start)
      and a.status in ('active','suspended','expired','terminated')
    order by a.starts_on desc,a.version desc
    limit 1;

    if v_agreement.id is not null then
      v_charge_date := least(v_month_end,coalesce(v_agreement.ends_on,v_month_end));
      if p_period_end::date >= v_charge_date and v_agreement.monthly_fixed_fee > 0 then
        v_currency := v_agreement.currency;
        v_snapshot := jsonb_build_object(
          'source_kind','franchise_monthly_fixed_fee','month',to_char(v_month_start,'YYYY-MM'),
          'charge_date',v_charge_date,
          'agreement',jsonb_build_object(
            'id',v_agreement.id,'agreement_code',v_agreement.agreement_code,'version',v_agreement.version,
            'starts_on',v_agreement.starts_on,'ends_on',v_agreement.ends_on,
            'monthly_fixed_fee',v_agreement.monthly_fixed_fee,'currency',v_agreement.currency,
            'settlement_cycle',v_agreement.settlement_cycle
          )
        );
        insert into public.merchant_financial_entries(
          tenant_id,merchant_id,entry_type,signed_amount,currency,idempotency_key,description,snapshot,
          occurred_at,created_by,source_kind
        ) values (
          v_tenant_id,p_merchant_id,'franchise_fixed_fee',-round(v_agreement.monthly_fixed_fee,2),v_agreement.currency,
          'franchise:fixed:'||to_char(v_month_start,'YYYY-MM'),'Franchise monthly fixed fee',v_snapshot,
          (v_charge_date::timestamp + interval '23 hours 59 minutes 59 seconds')::timestamptz,auth.uid(),'periodic_fee'
        ) on conflict (merchant_id,idempotency_key) do nothing;
        if found then
          v_fixed_count := v_fixed_count + 1;
          v_fixed_amount := v_fixed_amount + round(v_agreement.monthly_fixed_fee,2);
        end if;
      end if;
    end if;

    v_agreement := null;
    v_month_start := (v_month_start + interval '1 month')::date;
  end loop;

  return jsonb_build_object(
    'merchant_id',p_merchant_id,'period_start',p_period_start,'period_end',p_period_end,
    'pos_sales_scanned',v_pos_count,'online_orders_scanned',v_online_count,
    'fixed_fees_posted',v_fixed_count,'fixed_fee_amount',v_fixed_amount,'currency',v_currency
  );
end;
$$;
revoke all on function public.accrue_franchise_period_v1(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.accrue_franchise_period_v1(uuid,timestamptz,timestamptz) to authenticated;

create or replace function public.create_franchise_settlement_v1(
  p_merchant_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_settlement_id uuid := gen_random_uuid();
  v_reference text;
  v_gross numeric(14,2);
  v_deductions numeric(14,2);
  v_net numeric(14,2);
  v_count integer;
  v_currency text;
  v_direction text;
begin
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'FRANCHISE_FINANCE_INVALID_PERIOD';
  end if;
  if not private.can_manage_franchise_finance_v1(p_merchant_id) then
    raise exception 'FRANCHISE_FINANCE_MANAGE_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('franchise_settlement:'||p_merchant_id::text,0));
  perform public.accrue_franchise_period_v1(p_merchant_id,p_period_start,p_period_end);

  select m.tenant_id into v_tenant_id from public.merchants m
  where m.id=p_merchant_id and m.merchant_type='franchise';
  if v_tenant_id is null then raise exception 'FRANCHISE_NOT_FOUND'; end if;

  select
    coalesce(sum(case when mfe.signed_amount > 0 then mfe.signed_amount else 0 end),0),
    coalesce(abs(sum(case when mfe.signed_amount < 0 then mfe.signed_amount else 0 end)),0),
    coalesce(sum(mfe.signed_amount),0),count(*),coalesce(max(mfe.currency),'EGP')
  into v_gross,v_deductions,v_net,v_count,v_currency
  from public.merchant_financial_entries mfe
  where mfe.merchant_id=p_merchant_id
    and mfe.entry_type like 'franchise_%'
    and mfe.entry_type <> 'franchise_sale_accrual_marker'
    and mfe.occurred_at between p_period_start and p_period_end
    and not exists (
      select 1 from public.merchant_settlement_entries mse where mse.financial_entry_id=mfe.id
    );

  if v_count=0 then raise exception 'FRANCHISE_NO_UNSETTLED_ENTRIES'; end if;

  v_direction := case when v_net < 0 then 'merchant_owes_platform' when v_net > 0 then 'platform_owes_merchant' else 'balanced' end;
  v_reference := 'FSET-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(v_settlement_id::text,'-',''),1,8));

  insert into public.merchant_settlements(
    id,tenant_id,merchant_id,reference,status,settlement_kind,period_start,period_end,
    gross_credits,total_deductions,net_payable,currency,metadata,created_by
  ) values (
    v_settlement_id,v_tenant_id,p_merchant_id,v_reference,'draft','franchise',p_period_start,p_period_end,
    v_gross,v_deductions,v_net,v_currency,
    jsonb_build_object('balance_direction',v_direction,'created_from','franchise_finance_phase14'),auth.uid()
  );

  insert into public.merchant_settlement_entries(settlement_id,financial_entry_id)
  select v_settlement_id,mfe.id
  from public.merchant_financial_entries mfe
  where mfe.merchant_id=p_merchant_id
    and mfe.entry_type like 'franchise_%'
    and mfe.entry_type <> 'franchise_sale_accrual_marker'
    and mfe.occurred_at between p_period_start and p_period_end
    and not exists (
      select 1 from public.merchant_settlement_entries mse where mse.financial_entry_id=mfe.id
    );

  insert into private.merchant_settlement_events_v1(
    settlement_id,tenant_id,merchant_id,event_type,to_status,actor_user_id,snapshot
  ) values (
    v_settlement_id,v_tenant_id,p_merchant_id,'created','draft',auth.uid(),
    jsonb_build_object('reference',v_reference,'period_start',p_period_start,'period_end',p_period_end,
      'gross_credits',v_gross,'total_deductions',v_deductions,'net_payable',v_net,'balance_direction',v_direction)
  );

  return jsonb_build_object(
    'settlement_id',v_settlement_id,'reference',v_reference,'merchant_id',p_merchant_id,'status','draft',
    'entry_count',v_count,'gross_credits',v_gross,'total_deductions',v_deductions,
    'net_payable',v_net,'currency',v_currency,'balance_direction',v_direction
  );
end;
$$;
revoke all on function public.create_franchise_settlement_v1(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.create_franchise_settlement_v1(uuid,timestamptz,timestamptz) to authenticated;

create or replace function public.approve_franchise_settlement_v1(p_settlement_id uuid,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.merchant_settlements%rowtype;
begin
  select * into v_settlement from public.merchant_settlements where id=p_settlement_id for update;
  if v_settlement.id is null or v_settlement.settlement_kind <> 'franchise' then raise exception 'FRANCHISE_SETTLEMENT_NOT_FOUND'; end if;
  if not private.can_manage_franchise_finance_v1(v_settlement.merchant_id) then raise exception 'FRANCHISE_FINANCE_MANAGE_REQUIRED'; end if;
  if v_settlement.status <> 'draft' then raise exception 'FRANCHISE_SETTLEMENT_NOT_DRAFT'; end if;

  update public.merchant_settlements
  set status='approved',approved_by=auth.uid(),updated_at=now(),metadata=metadata||jsonb_build_object('approval_note',nullif(btrim(coalesce(p_note,'')),''))
  where id=p_settlement_id;

  insert into private.merchant_settlement_events_v1(
    settlement_id,tenant_id,merchant_id,event_type,from_status,to_status,reason,actor_user_id,snapshot
  ) values (
    v_settlement.id,v_settlement.tenant_id,v_settlement.merchant_id,'approved','draft','approved',nullif(btrim(coalesce(p_note,'')),''),auth.uid(),to_jsonb(v_settlement)
  );

  return jsonb_build_object('settlement_id',v_settlement.id,'status','approved');
end;
$$;
revoke all on function public.approve_franchise_settlement_v1(uuid,text) from public, anon;
grant execute on function public.approve_franchise_settlement_v1(uuid,text) to authenticated;

create or replace function public.mark_franchise_settlement_paid_v1(
  p_settlement_id uuid,
  p_external_reference text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.merchant_settlements%rowtype;
begin
  select * into v_settlement from public.merchant_settlements where id=p_settlement_id for update;
  if v_settlement.id is null or v_settlement.settlement_kind <> 'franchise' then raise exception 'FRANCHISE_SETTLEMENT_NOT_FOUND'; end if;
  if not private.can_manage_franchise_finance_v1(v_settlement.merchant_id) then raise exception 'FRANCHISE_FINANCE_MANAGE_REQUIRED'; end if;
  if v_settlement.status <> 'approved' then raise exception 'FRANCHISE_SETTLEMENT_NOT_APPROVED'; end if;
  if nullif(btrim(coalesce(p_external_reference,'')),'') is null then raise exception 'FRANCHISE_PAYMENT_REFERENCE_REQUIRED'; end if;

  update public.merchant_settlements
  set status='paid',external_reference=btrim(p_external_reference),paid_at=now(),paid_by=auth.uid(),updated_at=now(),
      metadata=metadata||jsonb_build_object('payment_note',nullif(btrim(coalesce(p_note,'')),''))
  where id=p_settlement_id;

  insert into private.merchant_settlement_events_v1(
    settlement_id,tenant_id,merchant_id,event_type,from_status,to_status,reason,actor_user_id,snapshot
  ) values (
    v_settlement.id,v_settlement.tenant_id,v_settlement.merchant_id,'paid','approved','paid',nullif(btrim(coalesce(p_note,'')),''),auth.uid(),
    jsonb_build_object('external_reference',btrim(p_external_reference),'net_payable',v_settlement.net_payable,'currency',v_settlement.currency)
  );

  return jsonb_build_object('settlement_id',v_settlement.id,'status','paid','external_reference',btrim(p_external_reference));
end;
$$;
revoke all on function public.mark_franchise_settlement_paid_v1(uuid,text,text) from public, anon;
grant execute on function public.mark_franchise_settlement_paid_v1(uuid,text,text) to authenticated;

create or replace function public.cancel_franchise_settlement_v1(p_settlement_id uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settlement public.merchant_settlements%rowtype;
  v_entry_ids jsonb;
begin
  select * into v_settlement from public.merchant_settlements where id=p_settlement_id for update;
  if v_settlement.id is null or v_settlement.settlement_kind <> 'franchise' then raise exception 'FRANCHISE_SETTLEMENT_NOT_FOUND'; end if;
  if not private.can_manage_franchise_finance_v1(v_settlement.merchant_id) then raise exception 'FRANCHISE_FINANCE_MANAGE_REQUIRED'; end if;
  if v_settlement.status not in ('draft','approved') then raise exception 'FRANCHISE_SETTLEMENT_CANNOT_CANCEL'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'FRANCHISE_SETTLEMENT_CANCEL_REASON_REQUIRED'; end if;

  select coalesce(jsonb_agg(mse.financial_entry_id),'[]'::jsonb) into v_entry_ids
  from public.merchant_settlement_entries mse where mse.settlement_id=p_settlement_id;

  update public.merchant_settlements
  set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=btrim(p_reason),updated_at=now(),
      metadata=metadata||jsonb_build_object('cancelled_entry_ids',v_entry_ids)
  where id=p_settlement_id;

  delete from public.merchant_settlement_entries where settlement_id=p_settlement_id;

  insert into private.merchant_settlement_events_v1(
    settlement_id,tenant_id,merchant_id,event_type,from_status,to_status,reason,actor_user_id,snapshot
  ) values (
    v_settlement.id,v_settlement.tenant_id,v_settlement.merchant_id,'cancelled',v_settlement.status,'cancelled',btrim(p_reason),auth.uid(),
    jsonb_build_object('released_entry_ids',v_entry_ids,'net_payable',v_settlement.net_payable,'currency',v_settlement.currency)
  );

  return jsonb_build_object('settlement_id',v_settlement.id,'status','cancelled','released_entries',jsonb_array_length(v_entry_ids));
end;
$$;
revoke all on function public.cancel_franchise_settlement_v1(uuid,text) from public, anon;
grant execute on function public.cancel_franchise_settlement_v1(uuid,text) to authenticated;

create or replace function public.post_franchise_adjustment_v1(
  p_merchant_id uuid,
  p_branch_id uuid,
  p_signed_amount numeric,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_currency text := 'EGP';
  v_id uuid;
begin
  if not private.can_manage_franchise_finance_v1(p_merchant_id) then raise exception 'FRANCHISE_FINANCE_MANAGE_REQUIRED'; end if;
  if coalesce(p_signed_amount,0)=0 then raise exception 'FRANCHISE_ADJUSTMENT_AMOUNT_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'FRANCHISE_ADJUSTMENT_REASON_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'FRANCHISE_ADJUSTMENT_IDEMPOTENCY_REQUIRED'; end if;

  select m.tenant_id,coalesce(a.currency,'EGP') into v_tenant_id,v_currency
  from public.merchants m
  left join private.franchise_agreements_v1 a on a.merchant_id=m.id and a.is_current
  where m.id=p_merchant_id and m.merchant_type='franchise';
  if v_tenant_id is null then raise exception 'FRANCHISE_NOT_FOUND'; end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branches b where b.id=p_branch_id and b.merchant_id=p_merchant_id
  ) then raise exception 'FRANCHISE_BRANCH_SCOPE_MISMATCH'; end if;

  insert into public.merchant_financial_entries(
    tenant_id,merchant_id,branch_id,entry_type,signed_amount,currency,idempotency_key,description,snapshot,
    occurred_at,created_by,source_kind
  ) values (
    v_tenant_id,p_merchant_id,p_branch_id,'franchise_adjustment',round(p_signed_amount,2),v_currency,btrim(p_idempotency_key),
    'Franchise manual adjustment',jsonb_build_object('reason',btrim(p_reason),'signed_amount',round(p_signed_amount,2)),
    now(),auth.uid(),'manual_adjustment'
  )
  on conflict (merchant_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key
  returning id into v_id;

  return jsonb_build_object('entry_id',v_id,'merchant_id',p_merchant_id,'signed_amount',round(p_signed_amount,2),'currency',v_currency);
end;
$$;
revoke all on function public.post_franchise_adjustment_v1(uuid,uuid,numeric,text,text) from public, anon;
grant execute on function public.post_franchise_adjustment_v1(uuid,uuid,numeric,text,text) to authenticated;

create or replace function public.get_franchise_finance_workspace_v1(
  p_merchant_id uuid,
  p_period_start timestamptz default date_trunc('month',now()),
  p_period_end timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchants%rowtype;
  v_agreement private.franchise_agreements_v1%rowtype;
  v_pos_count integer;
  v_pos_gross numeric(14,2);
  v_online_count integer;
  v_online_gross numeric(14,2);
  v_unaccrued_pos integer;
  v_unaccrued_online integer;
  v_royalty numeric(14,2);
  v_marketing numeric(14,2);
  v_platform numeric(14,2);
  v_fixed numeric(14,2);
  v_adjustments numeric(14,2);
  v_period_balance numeric(14,2);
  v_unsettled_balance numeric(14,2);
  v_settlements jsonb;
  v_entries jsonb;
begin
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then raise exception 'FRANCHISE_FINANCE_INVALID_PERIOD'; end if;
  if not private.can_view_franchise_finance_v1(p_merchant_id) then raise exception 'FRANCHISE_FINANCE_VIEW_REQUIRED'; end if;

  select * into v_merchant from public.merchants where id=p_merchant_id and merchant_type='franchise';
  if v_merchant.id is null then raise exception 'FRANCHISE_NOT_FOUND'; end if;
  select * into v_agreement from private.franchise_agreements_v1 where merchant_id=p_merchant_id and is_current limit 1;

  select count(*),coalesce(sum(s.total),0),
    count(*) filter (where not exists (
      select 1 from public.merchant_financial_entries mfe
      where mfe.merchant_id=p_merchant_id and mfe.source_kind='pos_sale' and mfe.source_id=s.id and mfe.entry_type='franchise_sale_accrual_marker'
    ))
  into v_pos_count,v_pos_gross,v_unaccrued_pos
  from public.sales s join public.branches b on b.id=s.branch_id
  where b.merchant_id=p_merchant_id and s.date between p_period_start and p_period_end;

  select count(*),coalesce(sum(greatest(o.total-coalesce(o.shipping_cost,0),0)),0),
    count(*) filter (where not exists (
      select 1 from public.merchant_financial_entries mfe
      where mfe.merchant_id=p_merchant_id and mfe.source_kind='online_order' and mfe.source_id=o.id and mfe.entry_type='franchise_sale_accrual_marker'
    ))
  into v_online_count,v_online_gross,v_unaccrued_online
  from public.online_orders o
  where o.merchant_id=p_merchant_id and o.status::text='delivered'
    and coalesce(o.updated_at,o.created_at) between p_period_start and p_period_end;

  select
    coalesce(abs(sum(signed_amount) filter (where entry_type='franchise_royalty')),0),
    coalesce(abs(sum(signed_amount) filter (where entry_type='franchise_marketing_fee')),0),
    coalesce(abs(sum(signed_amount) filter (where entry_type='franchise_platform_fee')),0),
    coalesce(abs(sum(signed_amount) filter (where entry_type='franchise_fixed_fee')),0),
    coalesce(sum(signed_amount) filter (where entry_type='franchise_adjustment'),0),
    coalesce(sum(signed_amount) filter (where entry_type<>'franchise_sale_accrual_marker'),0)
  into v_royalty,v_marketing,v_platform,v_fixed,v_adjustments,v_period_balance
  from public.merchant_financial_entries
  where merchant_id=p_merchant_id and occurred_at between p_period_start and p_period_end
    and entry_type like 'franchise_%';

  select coalesce(sum(mfe.signed_amount),0) into v_unsettled_balance
  from public.merchant_financial_entries mfe
  where mfe.merchant_id=p_merchant_id and mfe.entry_type like 'franchise_%'
    and mfe.entry_type<>'franchise_sale_accrual_marker'
    and not exists (select 1 from public.merchant_settlement_entries mse where mse.financial_entry_id=mfe.id);

  select coalesce(jsonb_agg(x.obj order by x.period_end desc),'[]'::jsonb) into v_settlements
  from (
    select ms.period_end,jsonb_build_object(
      'id',ms.id,'reference',ms.reference,'status',ms.status,'period_start',ms.period_start,'period_end',ms.period_end,
      'gross_credits',ms.gross_credits,'total_deductions',ms.total_deductions,'net_payable',ms.net_payable,
      'currency',ms.currency,'external_reference',ms.external_reference,'paid_at',ms.paid_at,
      'cancelled_at',ms.cancelled_at,'cancellation_reason',ms.cancellation_reason,'metadata',ms.metadata,'created_at',ms.created_at
    ) obj
    from public.merchant_settlements ms
    where ms.merchant_id=p_merchant_id and ms.settlement_kind='franchise'
    order by ms.period_end desc limit 20
  ) x;

  select coalesce(jsonb_agg(x.obj order by x.occurred_at desc,x.created_at desc),'[]'::jsonb) into v_entries
  from (
    select mfe.occurred_at,mfe.created_at,jsonb_build_object(
      'id',mfe.id,'branch_id',mfe.branch_id,'entry_type',mfe.entry_type,'signed_amount',mfe.signed_amount,
      'currency',mfe.currency,'description',mfe.description,'source_kind',mfe.source_kind,'source_id',mfe.source_id,
      'snapshot',mfe.snapshot,'occurred_at',mfe.occurred_at,'created_at',mfe.created_at,
      'settled',exists(select 1 from public.merchant_settlement_entries mse where mse.financial_entry_id=mfe.id)
    ) obj
    from public.merchant_financial_entries mfe
    where mfe.merchant_id=p_merchant_id and mfe.entry_type like 'franchise_%'
      and mfe.entry_type<>'franchise_sale_accrual_marker'
    order by mfe.occurred_at desc,mfe.created_at desc limit 100
  ) x;

  return jsonb_build_object(
    'merchant',jsonb_build_object('id',v_merchant.id,'name',v_merchant.name,'code',v_merchant.code,'status',v_merchant.status),
    'agreement',case when v_agreement.id is null then null else jsonb_build_object(
      'id',v_agreement.id,'agreement_code',v_agreement.agreement_code,'version',v_agreement.version,'status',v_agreement.status,
      'royalty_rate',v_agreement.royalty_rate,'marketing_fee_rate',v_agreement.marketing_fee_rate,
      'platform_fee_rate',v_agreement.platform_fee_rate,'monthly_fixed_fee',v_agreement.monthly_fixed_fee,
      'currency',v_agreement.currency,'settlement_cycle',v_agreement.settlement_cycle
    ) end,
    'period',jsonb_build_object('start',p_period_start,'end',p_period_end),
    'sales',jsonb_build_object(
      'pos_count',v_pos_count,'pos_gross',v_pos_gross,'online_delivered_count',v_online_count,'online_merchandise_gross',v_online_gross,
      'total_fee_basis',v_pos_gross+v_online_gross,'unaccrued_pos_count',v_unaccrued_pos,'unaccrued_online_count',v_unaccrued_online
    ),
    'fees',jsonb_build_object(
      'royalty',v_royalty,'marketing',v_marketing,'platform',v_platform,'fixed',v_fixed,'adjustments',v_adjustments,
      'period_balance',v_period_balance,'unsettled_balance',v_unsettled_balance,
      'balance_direction',case when v_unsettled_balance<0 then 'merchant_owes_platform' when v_unsettled_balance>0 then 'platform_owes_merchant' else 'balanced' end
    ),
    'settlements',v_settlements,'entries',v_entries
  );
end;
$$;
revoke all on function public.get_franchise_finance_workspace_v1(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.get_franchise_finance_workspace_v1(uuid,timestamptz,timestamptz) to authenticated;
