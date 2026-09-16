-- Phase 6: Marketplace commission + merchant payable subledger + settlement batches
-- No existing order is auto-posted by this migration.

begin;

create or replace function public.has_merchant_access(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.merchant_members mm
      where mm.merchant_id=p_merchant_id
        and mm.user_id=auth.uid()
        and coalesce(mm.is_active,true)
    );
$$;

revoke all on function public.has_merchant_access(uuid) from public;
revoke all on function public.has_merchant_access(uuid) from anon;
grant execute on function public.has_merchant_access(uuid) to authenticated;

create table if not exists public.merchant_commission_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  merchant_id uuid references public.merchants(id) on delete cascade,
  main_category_id uuid references public.main_categories(id) on delete cascade,
  name text not null,
  commission_percent numeric(7,4) not null default 0
    check (commission_percent >= 0 and commission_percent <= 100),
  fixed_fee numeric(14,2) not null default 0
    check (fixed_fee >= 0),
  calculation_basis text not null default 'merchandise_subtotal'
    check (calculation_basis in ('merchandise_subtotal','order_total','net_after_discounts')),
  priority integer not null default 0,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

alter table public.merchant_commission_rules enable row level security;
create index if not exists idx_merchant_commission_rules_resolve
  on public.merchant_commission_rules (
    tenant_id, merchant_id, main_category_id, is_active, priority desc, effective_from desc
  );

create table if not exists public.merchant_financial_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  order_id uuid references public.online_orders(id) on delete restrict,
  commission_rule_id uuid references public.merchant_commission_rules(id) on delete restrict,
  entry_type text not null
    check (entry_type in (
      'order_gross','commission','payment_fee','delivery_contribution',
      'refund','adjustment','payout_adjustment'
    )),
  signed_amount numeric(14,2) not null,
  currency text not null default 'EGP',
  idempotency_key text not null,
  description text,
  snapshot jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (merchant_id, idempotency_key)
);

alter table public.merchant_financial_entries enable row level security;
create index if not exists idx_merchant_financial_entries_unsettled_scan
  on public.merchant_financial_entries (merchant_id, occurred_at, created_at);
create index if not exists idx_merchant_financial_entries_order
  on public.merchant_financial_entries (order_id, merchant_id);

create table if not exists public.merchant_settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  reference text not null unique,
  status text not null default 'draft'
    check (status in ('draft','approved','paid','cancelled')),
  period_start timestamptz,
  period_end timestamptz not null,
  gross_credits numeric(14,2) not null default 0,
  total_deductions numeric(14,2) not null default 0,
  net_payable numeric(14,2) not null default 0,
  currency text not null default 'EGP',
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.merchant_settlements enable row level security;
create index if not exists idx_merchant_settlements_merchant_status
  on public.merchant_settlements (merchant_id, status, period_end desc);

create table if not exists public.merchant_settlement_entries (
  settlement_id uuid not null references public.merchant_settlements(id) on delete cascade,
  financial_entry_id uuid not null references public.merchant_financial_entries(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (settlement_id, financial_entry_id),
  unique (financial_entry_id)
);

alter table public.merchant_settlement_entries enable row level security;

drop policy if exists "Merchant members can view commission rules" on public.merchant_commission_rules;
create policy "Merchant members can view commission rules"
on public.merchant_commission_rules for select to authenticated
using (
  (merchant_id is not null and public.has_merchant_access(merchant_id))
  or (merchant_id is null and public.has_tenant_access(tenant_id))
);

drop policy if exists "Super admins can manage commission rules" on public.merchant_commission_rules;
create policy "Super admins can manage commission rules"
on public.merchant_commission_rules for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Merchant members can view financial entries" on public.merchant_financial_entries;
create policy "Merchant members can view financial entries"
on public.merchant_financial_entries for select to authenticated
using (public.has_merchant_access(merchant_id));

drop policy if exists "Merchant members can view settlements" on public.merchant_settlements;
create policy "Merchant members can view settlements"
on public.merchant_settlements for select to authenticated
using (public.has_merchant_access(merchant_id));

drop policy if exists "Merchant members can view settlement entries" on public.merchant_settlement_entries;
create policy "Merchant members can view settlement entries"
on public.merchant_settlement_entries for select to authenticated
using (
  exists (
    select 1
    from public.merchant_settlements ms
    where ms.id=settlement_id
      and public.has_merchant_access(ms.merchant_id)
  )
);

create or replace function public.preview_merchant_commission_v1(
  p_merchant_id uuid,
  p_commission_basis numeric,
  p_main_category_id uuid default null,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_merchant_type text;
  v_rule public.merchant_commission_rules%rowtype;
  v_amount numeric(14,2);
begin
  if p_commission_basis < 0 then
    raise exception 'negative_commission_basis_not_allowed';
  end if;

  select m.tenant_id,m.merchant_type
    into v_tenant_id,v_merchant_type
  from public.merchants m
  where m.id=p_merchant_id;

  if v_tenant_id is null then
    raise exception 'merchant_not_found';
  end if;

  if not public.has_merchant_access(p_merchant_id) then
    raise exception 'not_authorized';
  end if;

  select r.* into v_rule
  from public.merchant_commission_rules r
  where r.tenant_id=v_tenant_id
    and r.is_active
    and r.effective_from <= p_at
    and (r.effective_to is null or r.effective_to > p_at)
    and (r.merchant_id is null or r.merchant_id=p_merchant_id)
    and (r.main_category_id is null or r.main_category_id=p_main_category_id)
  order by
    (r.merchant_id is not null)::int desc,
    (r.main_category_id is not null)::int desc,
    r.priority desc,
    r.effective_from desc,
    r.created_at desc
  limit 1;

  if v_rule.id is null then
    if v_merchant_type in ('partner','franchise') then
      return jsonb_build_object(
        'rule_found',false,
        'commission_amount',null,
        'requires_rule',true,
        'merchant_id',p_merchant_id,
        'basis',p_commission_basis
      );
    end if;

    return jsonb_build_object(
      'rule_found',false,
      'commission_amount',0,
      'requires_rule',false,
      'merchant_id',p_merchant_id,
      'basis',p_commission_basis
    );
  end if;

  v_amount := round((p_commission_basis * v_rule.commission_percent / 100.0) + v_rule.fixed_fee, 2);

  return jsonb_build_object(
    'rule_found',true,
    'rule_id',v_rule.id,
    'rule_name',v_rule.name,
    'calculation_basis',v_rule.calculation_basis,
    'commission_percent',v_rule.commission_percent,
    'fixed_fee',v_rule.fixed_fee,
    'basis',p_commission_basis,
    'commission_amount',v_amount,
    'effective_at',p_at
  );
end;
$$;

revoke all on function public.preview_merchant_commission_v1(uuid,numeric,uuid,timestamptz) from public;
revoke all on function public.preview_merchant_commission_v1(uuid,numeric,uuid,timestamptz) from anon;
grant execute on function public.preview_merchant_commission_v1(uuid,numeric,uuid,timestamptz) to authenticated;

create or replace function public.post_merchant_order_financials_v1(
  p_order_id uuid,
  p_merchant_gross numeric,
  p_commission_basis numeric,
  p_payment_fee numeric default 0,
  p_delivery_contribution numeric default 0,
  p_refund_amount numeric default 0,
  p_main_category_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.online_orders%rowtype;
  v_preview jsonb;
  v_commission numeric(14,2);
  v_rule_id uuid;
  v_net numeric(14,2);
  v_snapshot jsonb;
begin
  if not public.is_super_admin() then
    raise exception 'not_authorized';
  end if;

  if p_merchant_gross < 0 or p_commission_basis < 0
     or p_payment_fee < 0 or p_delivery_contribution < 0 or p_refund_amount < 0 then
    raise exception 'negative_financial_input_not_allowed';
  end if;

  select * into v_order
  from public.online_orders
  where id=p_order_id;

  if v_order.id is null then
    raise exception 'order_not_found';
  end if;

  v_preview := public.preview_merchant_commission_v1(
    v_order.merchant_id,
    p_commission_basis,
    p_main_category_id,
    coalesce(v_order.created_at,now())
  );

  if coalesce((v_preview->>'requires_rule')::boolean,false) then
    raise exception 'commission_rule_required';
  end if;

  v_commission := coalesce((v_preview->>'commission_amount')::numeric,0);
  v_rule_id := nullif(v_preview->>'rule_id','')::uuid;
  v_net := round(p_merchant_gross - v_commission - p_payment_fee - p_delivery_contribution - p_refund_amount,2);
  v_snapshot := jsonb_build_object(
    'order_total',v_order.total,
    'payment_method',v_order.payment_method,
    'merchant_snapshot',v_order.merchant_snapshot,
    'commission',v_preview
  );

  insert into public.merchant_financial_entries(
    tenant_id,merchant_id,branch_id,order_id,commission_rule_id,
    entry_type,signed_amount,idempotency_key,description,snapshot,occurred_at,created_by
  ) values (
    v_order.tenant_id,v_order.merchant_id,v_order.branch_id,v_order.id,v_rule_id,
    'order_gross',round(p_merchant_gross,2),'order:'||v_order.id||':gross','Merchant order gross',v_snapshot,coalesce(v_order.created_at,now()),auth.uid()
  ) on conflict (merchant_id,idempotency_key) do nothing;

  if v_commission <> 0 then
    insert into public.merchant_financial_entries(
      tenant_id,merchant_id,branch_id,order_id,commission_rule_id,
      entry_type,signed_amount,idempotency_key,description,snapshot,occurred_at,created_by
    ) values (
      v_order.tenant_id,v_order.merchant_id,v_order.branch_id,v_order.id,v_rule_id,
      'commission',-v_commission,'order:'||v_order.id||':commission','Marketplace commission',v_snapshot,coalesce(v_order.created_at,now()),auth.uid()
    ) on conflict (merchant_id,idempotency_key) do nothing;
  end if;

  if p_payment_fee <> 0 then
    insert into public.merchant_financial_entries(
      tenant_id,merchant_id,branch_id,order_id,commission_rule_id,
      entry_type,signed_amount,idempotency_key,description,snapshot,occurred_at,created_by
    ) values (
      v_order.tenant_id,v_order.merchant_id,v_order.branch_id,v_order.id,v_rule_id,
      'payment_fee',-round(p_payment_fee,2),'order:'||v_order.id||':payment_fee','Merchant payment fee contribution',v_snapshot,coalesce(v_order.created_at,now()),auth.uid()
    ) on conflict (merchant_id,idempotency_key) do nothing;
  end if;

  if p_delivery_contribution <> 0 then
    insert into public.merchant_financial_entries(
      tenant_id,merchant_id,branch_id,order_id,commission_rule_id,
      entry_type,signed_amount,idempotency_key,description,snapshot,occurred_at,created_by
    ) values (
      v_order.tenant_id,v_order.merchant_id,v_order.branch_id,v_order.id,v_rule_id,
      'delivery_contribution',-round(p_delivery_contribution,2),'order:'||v_order.id||':delivery','Merchant delivery contribution',v_snapshot,coalesce(v_order.created_at,now()),auth.uid()
    ) on conflict (merchant_id,idempotency_key) do nothing;
  end if;

  if p_refund_amount <> 0 then
    insert into public.merchant_financial_entries(
      tenant_id,merchant_id,branch_id,order_id,commission_rule_id,
      entry_type,signed_amount,idempotency_key,description,snapshot,occurred_at,created_by
    ) values (
      v_order.tenant_id,v_order.merchant_id,v_order.branch_id,v_order.id,v_rule_id,
      'refund',-round(p_refund_amount,2),'order:'||v_order.id||':refund:initial','Merchant refund impact',v_snapshot,now(),auth.uid()
    ) on conflict (merchant_id,idempotency_key) do nothing;
  end if;

  return jsonb_build_object(
    'order_id',v_order.id,
    'merchant_id',v_order.merchant_id,
    'gross',round(p_merchant_gross,2),
    'commission',v_commission,
    'payment_fee',round(p_payment_fee,2),
    'delivery_contribution',round(p_delivery_contribution,2),
    'refund',round(p_refund_amount,2),
    'net_payable',v_net,
    'commission_snapshot',v_preview
  );
end;
$$;

revoke all on function public.post_merchant_order_financials_v1(uuid,numeric,numeric,numeric,numeric,numeric,uuid) from public;
revoke all on function public.post_merchant_order_financials_v1(uuid,numeric,numeric,numeric,numeric,numeric,uuid) from anon;
grant execute on function public.post_merchant_order_financials_v1(uuid,numeric,numeric,numeric,numeric,numeric,uuid) to authenticated;

create or replace function private.guard_merchant_financial_entry_immutable_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'merchant_financial_entries_are_immutable';
end;
$$;

revoke all on function private.guard_merchant_financial_entry_immutable_v1() from public;

drop trigger if exists trg_guard_merchant_financial_entry_immutable_v1 on public.merchant_financial_entries;
create trigger trg_guard_merchant_financial_entry_immutable_v1
before update or delete on public.merchant_financial_entries
for each row
execute function private.guard_merchant_financial_entry_immutable_v1();

create or replace function public.create_merchant_settlement_v1(
  p_merchant_id uuid,
  p_period_end timestamptz default now()
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
  v_period_start timestamptz;
  v_gross numeric(14,2);
  v_deductions numeric(14,2);
  v_net numeric(14,2);
  v_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'not_authorized';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_merchant_id::text,0));

  select tenant_id into v_tenant_id
  from public.merchants
  where id=p_merchant_id;

  if v_tenant_id is null then
    raise exception 'merchant_not_found';
  end if;

  select
    min(mfe.occurred_at),
    coalesce(sum(case when mfe.signed_amount > 0 then mfe.signed_amount else 0 end),0),
    coalesce(abs(sum(case when mfe.signed_amount < 0 then mfe.signed_amount else 0 end)),0),
    coalesce(sum(mfe.signed_amount),0),
    count(*)
  into v_period_start,v_gross,v_deductions,v_net,v_count
  from public.merchant_financial_entries mfe
  where mfe.merchant_id=p_merchant_id
    and mfe.occurred_at <= p_period_end
    and not exists (
      select 1 from public.merchant_settlement_entries mse
      where mse.financial_entry_id=mfe.id
    );

  if v_count=0 then
    raise exception 'no_unsettled_entries';
  end if;

  v_reference := 'MSET-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(replace(v_settlement_id::text,'-',''),1,8));

  insert into public.merchant_settlements(
    id,tenant_id,merchant_id,reference,status,
    period_start,period_end,gross_credits,total_deductions,net_payable,
    currency,created_by
  ) values (
    v_settlement_id,v_tenant_id,p_merchant_id,v_reference,'draft',
    v_period_start,p_period_end,v_gross,v_deductions,v_net,
    'EGP',auth.uid()
  );

  insert into public.merchant_settlement_entries(settlement_id,financial_entry_id)
  select v_settlement_id,mfe.id
  from public.merchant_financial_entries mfe
  where mfe.merchant_id=p_merchant_id
    and mfe.occurred_at <= p_period_end
    and not exists (
      select 1 from public.merchant_settlement_entries mse
      where mse.financial_entry_id=mfe.id
    );

  return jsonb_build_object(
    'settlement_id',v_settlement_id,
    'reference',v_reference,
    'merchant_id',p_merchant_id,
    'entry_count',v_count,
    'gross_credits',v_gross,
    'total_deductions',v_deductions,
    'net_payable',v_net,
    'status','draft'
  );
end;
$$;

revoke all on function public.create_merchant_settlement_v1(uuid,timestamptz) from public;
revoke all on function public.create_merchant_settlement_v1(uuid,timestamptz) from anon;
grant execute on function public.create_merchant_settlement_v1(uuid,timestamptz) to authenticated;

commit;
