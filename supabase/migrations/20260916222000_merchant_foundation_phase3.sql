-- Phase 3: Merchant foundation
-- Introduces Tenant -> Merchant -> Branch without changing existing operational flows.

begin;

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  merchant_type text not null default 'partner'
    check (merchant_type in ('owned','partner','franchise')),
  status text not null default 'pending'
    check (status in ('draft','pending','active','suspended','inactive')),
  contact_name text,
  phone text,
  email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  unique (id, tenant_id)
);

alter table public.merchants enable row level security;

create index if not exists idx_merchants_tenant_status_type
  on public.merchants (tenant_id, status, merchant_type);

insert into public.merchants (tenant_id, code, name, merchant_type, status, metadata)
select id, 'elmadawy-owned', 'المعداوي ماركت', 'owned', 'active',
       jsonb_build_object('source','platform_seed')
from public.tenants
where subdomain='elmadawy'
on conflict (tenant_id, code) do update
set name=excluded.name,
    merchant_type='owned',
    status='active',
    updated_at=now();

insert into public.merchants (tenant_id, code, name, merchant_type, status, metadata)
select b.tenant_id,
       'franchise-' || lower(coalesce(nullif(b.code,''), replace(b.id::text,'-',''))),
       b.name,
       'franchise',
       case when coalesce(b.active,true) then 'active' else 'inactive' end,
       jsonb_build_object(
         'legacy_branch_id', b.id,
         'legacy_commission_rate', coalesce(b.commission_rate,0),
         'legacy_monthly_fee', coalesce(b.monthly_fee,0)
       )
from public.branches b
where b.category::text='franchise'
on conflict (tenant_id, code) do update
set name=excluded.name,
    status=excluded.status,
    metadata=public.merchants.metadata || excluded.metadata,
    updated_at=now();

alter table public.branches add column if not exists merchant_id uuid;

update public.branches b
set merchant_id=m.id
from public.merchants m
where b.tenant_id=m.tenant_id
  and m.code='elmadawy-owned'
  and b.category::text <> 'franchise'
  and b.merchant_id is null;

update public.branches b
set merchant_id=m.id
from public.merchants m
where b.tenant_id=m.tenant_id
  and m.code='franchise-' || lower(coalesce(nullif(b.code,''), replace(b.id::text,'-','')))
  and b.category::text='franchise'
  and b.merchant_id is null;

do $$
begin
  if exists (select 1 from public.branches where merchant_id is null) then
    raise exception 'Merchant backfill incomplete: at least one branch has no merchant';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='branches_merchant_id_fkey'
      and conrelid='public.branches'::regclass
  ) then
    alter table public.branches
      add constraint branches_merchant_id_fkey
      foreign key (merchant_id)
      references public.merchants(id)
      on delete restrict;
  end if;
end $$;

alter table public.branches alter column merchant_id set not null;

create index if not exists idx_branches_tenant_merchant_active
  on public.branches (tenant_id, merchant_id, active);

create table if not exists public.merchant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff'
    check (role in ('owner','admin','manager','staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, user_id)
);

alter table public.merchant_members enable row level security;
create index if not exists idx_merchant_members_user_active
  on public.merchant_members (user_id, is_active, merchant_id);
create index if not exists idx_merchant_members_tenant_merchant
  on public.merchant_members (tenant_id, merchant_id);

insert into public.merchant_members (tenant_id, merchant_id, user_id, role, is_active)
select m.tenant_id, m.id, tu.user_id,
       case when tu.role='owner' then 'owner' else 'admin' end,
       true
from public.merchants m
join public.tenant_users tu on tu.tenant_id=m.tenant_id
where tu.role in ('owner','admin')
  and coalesce(tu.is_active,true)
on conflict (merchant_id,user_id) do update
set role=excluded.role,
    is_active=true,
    updated_at=now();

create table if not exists public.merchant_listings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  merchant_sku text,
  status text not null default 'draft'
    check (status in ('draft','active','paused','rejected','archived')),
  preparation_minutes integer check (preparation_minutes is null or preparation_minutes >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, branch_id, product_id)
);

alter table public.merchant_listings enable row level security;
create index if not exists idx_merchant_listings_tenant_status
  on public.merchant_listings (tenant_id, status, merchant_id, branch_id);
create index if not exists idx_merchant_listings_product
  on public.merchant_listings (product_id, status);

drop policy if exists "Tenant members can view merchants" on public.merchants;
create policy "Tenant members can view merchants"
on public.merchants for select to authenticated
using (public.has_tenant_access(tenant_id));

drop policy if exists "Super admins can manage merchants" on public.merchants;
create policy "Super admins can manage merchants"
on public.merchants for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Users can view own merchant memberships" on public.merchant_members;
create policy "Users can view own merchant memberships"
on public.merchant_members for select to authenticated
using (user_id=auth.uid() or public.is_super_admin());

drop policy if exists "Super admins can manage merchant memberships" on public.merchant_members;
create policy "Super admins can manage merchant memberships"
on public.merchant_members for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "Tenant members can view merchant listings" on public.merchant_listings;
create policy "Tenant members can view merchant listings"
on public.merchant_listings for select to authenticated
using (public.has_tenant_access(tenant_id));

drop policy if exists "Super admins can manage merchant listings" on public.merchant_listings;
create policy "Super admins can manage merchant listings"
on public.merchant_listings for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

comment on table public.merchants is
  'Business sellers inside a tenant: owned retail, marketplace partners, or franchise operators.';
comment on table public.merchant_listings is
  'Marketplace/product ownership layer. Pricing and inventory remain in branch-specific operational sources until catalog integration.';

commit;
