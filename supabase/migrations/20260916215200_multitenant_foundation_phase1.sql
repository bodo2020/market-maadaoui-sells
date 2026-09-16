-- Phase 1: Multi-tenant foundation for Elmadawy Market
-- Safe foundation only: establish the Elmadawy tenant and bind existing branches.
-- This migration intentionally does NOT enforce tenant isolation on products,
-- sales, invoices, online orders, or other operational tables yet.

begin;

insert into public.tenants (
  name,
  subdomain,
  status,
  subscription_status,
  country,
  settings,
  features,
  limits
)
values (
  'المعداوي ماركت',
  'elmadawy',
  'active',
  'active',
  'Egypt',
  jsonb_build_object(
    'currency', 'EGP',
    'locale', 'ar-EG',
    'timezone', 'Africa/Cairo',
    'is_platform_tenant', true
  ),
  '{}'::jsonb,
  jsonb_build_object(
    'max_users', 1000,
    'max_branches', 1000,
    'max_products', 1000000
  )
)
on conflict (subdomain) do update
set name = excluded.name,
    status = 'active',
    subscription_status = 'active',
    settings = coalesce(public.tenants.settings, '{}'::jsonb) || excluded.settings,
    limits = coalesce(public.tenants.limits, '{}'::jsonb) || excluded.limits,
    updated_at = now();

alter table public.branches
  add column if not exists tenant_id uuid;

do $$
declare
  v_tenant_id uuid;
begin
  select id into v_tenant_id
  from public.tenants
  where subdomain = 'elmadawy';

  if v_tenant_id is null then
    raise exception 'Elmadawy tenant seed failed';
  end if;

  update public.branches
  set tenant_id = v_tenant_id
  where tenant_id is null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'branches_tenant_id_fkey'
      and conrelid = 'public.branches'::regclass
  ) then
    alter table public.branches
      add constraint branches_tenant_id_fkey
      foreign key (tenant_id)
      references public.tenants(id)
      on delete restrict;
  end if;
end $$;

create index if not exists idx_branches_tenant_active
  on public.branches (tenant_id, active);

alter table public.branches
  alter column tenant_id set not null;

comment on column public.branches.tenant_id is
  'Owning tenant. Foundation for multi-tenant SaaS isolation; existing Elmadawy branches are backfilled to the platform tenant.';

commit;
