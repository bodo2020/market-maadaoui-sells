-- POS payment methods / fee accounting foundation.
-- Idempotent snapshot of the live structure so GitHub can recreate the payment layer.

create table if not exists public.pos_payment_methods (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  code text not null,
  name text not null,
  method_type text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  fee_type text not null default 'none',
  fee_value numeric not null default 0,
  fee_bearer text not null default 'business',
  require_reference boolean not null default false,
  settlement_account_id uuid references public.payment_accounts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_payment_methods_code_unique unique (branch_id, code),
  constraint pos_payment_methods_type_check check (method_type in ('cash','card','digital_wallet','bank_transfer','other')),
  constraint pos_payment_methods_fee_type_check check (fee_type in ('none','percent','fixed')),
  constraint pos_payment_methods_fee_bearer_check check (fee_bearer in ('customer','business')),
  constraint pos_payment_methods_fee_value_check check (fee_value >= 0 and fee_value <= 100000)
);

create index if not exists pos_payment_methods_branch_active_idx
  on public.pos_payment_methods(branch_id, active, sort_order);

alter table public.sales add column if not exists payment_method_id uuid;
alter table public.sales add column if not exists payment_method_code text;
alter table public.sales add column if not exists payment_method_name text;
alter table public.sales add column if not exists payment_fee_amount numeric not null default 0;
alter table public.sales add column if not exists payment_fee_bearer text;
alter table public.sales add column if not exists customer_payment_fee_amount numeric not null default 0;
alter table public.sales add column if not exists merchant_payment_fee_amount numeric not null default 0;
alter table public.sales add column if not exists amount_charged numeric not null default 0;
alter table public.sales add column if not exists digital_wallet_amount numeric not null default 0;
alter table public.sales add column if not exists net_profit_after_payment_fee numeric;
alter table public.sales add column if not exists payment_reference text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.sales'::regclass and conname='sales_payment_method_id_fkey'
  ) then
    alter table public.sales
      add constraint sales_payment_method_id_fkey
      foreign key (payment_method_id) references public.pos_payment_methods(id) on delete set null;
  end if;
end $$;

create table if not exists public.pos_sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  payment_method_id uuid not null references public.pos_payment_methods(id) on delete restrict,
  base_amount numeric not null,
  fee_amount numeric not null default 0,
  customer_fee_amount numeric not null default 0,
  merchant_fee_amount numeric not null default 0,
  charged_amount numeric not null,
  estimated_net_settlement numeric not null,
  reference text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pos_sale_payments_sale_unique unique (sale_id),
  constraint pos_sale_payments_amounts_check check (
    base_amount >= 0 and fee_amount >= 0 and customer_fee_amount >= 0 and merchant_fee_amount >= 0 and charged_amount >= 0
  )
);

create index if not exists pos_sale_payments_sale_idx
  on public.pos_sale_payments(sale_id);
create index if not exists pos_sale_payments_method_idx
  on public.pos_sale_payments(payment_method_id, created_at desc);

-- These tables are internal implementation details. Client access goes through SECURITY DEFINER RPCs.
revoke all on table public.pos_payment_methods from public, anon, authenticated;
revoke all on table public.pos_sale_payments from public, anon, authenticated;
grant all on table public.pos_payment_methods to service_role;
grant all on table public.pos_sale_payments to service_role;
