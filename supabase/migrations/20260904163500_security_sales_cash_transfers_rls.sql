-- Stage 4: harden sales and cash transfer audit data.
-- Depends on private.can_manage_financial_branch() and private.can_operate_cash_branch().

-- ---------------------------------------------------------------------------
-- sales
-- Cash operators need branch-level SELECT because current invoice numbering and
-- sales history query branch sales. Inserts must belong to the authenticated
-- cashier. Only financial managers can delete; updates are limited to customer
-- identity fields at the privilege layer.
-- ---------------------------------------------------------------------------
alter table public.sales enable row level security;

drop policy if exists "Admins can manage all sales" on public.sales;
drop policy if exists "Authenticated users can insert sales" on public.sales;
drop policy if exists "Authenticated users can view sales" on public.sales;
drop policy if exists "Only admins can delete sales" on public.sales;
drop policy if exists "Only admins can update sales" on public.sales;
drop policy if exists "Users can delete sales from their branch" on public.sales;
drop policy if exists "Users can insert sales to their branch" on public.sales;
drop policy if exists "Users can update their own sales" on public.sales;

create policy "Cash operators view branch sales"
on public.sales
for select
to authenticated
using (
  branch_id is not null
  and private.can_operate_cash_branch(branch_id)
);

create policy "Cash operators insert own branch sales"
on public.sales
for insert
to authenticated
with check (
  branch_id is not null
  and cashier_id = (select auth.uid())
  and private.can_operate_cash_branch(branch_id)
);

create policy "Cashiers update own sale customer info"
on public.sales
for update
to authenticated
using (
  branch_id is not null
  and cashier_id = (select auth.uid())
  and private.can_operate_cash_branch(branch_id)
)
with check (
  branch_id is not null
  and cashier_id = (select auth.uid())
  and private.can_operate_cash_branch(branch_id)
);

create policy "Financial managers update branch sale customer info"
on public.sales
for update
to authenticated
using (private.can_manage_financial_branch(branch_id))
with check (private.can_manage_financial_branch(branch_id));

create policy "Financial managers delete branch sales"
on public.sales
for delete
to authenticated
using (private.can_manage_financial_branch(branch_id));

revoke all on table public.sales from anon, authenticated;
grant select, insert, delete on table public.sales to authenticated;
grant update (customer_name, customer_phone) on table public.sales to authenticated;

-- ---------------------------------------------------------------------------
-- cash_transfers
-- Transfers are financial audit records. They are branch-scoped, manager-only,
-- immutable after creation, and cannot spoof created_by.
-- ---------------------------------------------------------------------------
alter table public.cash_transfers enable row level security;

drop policy if exists "Admins can manage cash transfers" on public.cash_transfers;
drop policy if exists "Branch users can view transfers" on public.cash_transfers;

create policy "Financial managers view branch cash transfers"
on public.cash_transfers
for select
to authenticated
using (private.can_manage_financial_branch(branch_id));

create policy "Financial managers create branch cash transfers"
on public.cash_transfers
for insert
to authenticated
with check (
  branch_id is not null
  and created_by = (select auth.uid())
  and private.can_manage_financial_branch(branch_id)
  and amount > 0
  and from_register in ('store', 'online')
  and to_register in ('store', 'online')
  and from_register <> to_register
);

revoke all on table public.cash_transfers from anon, authenticated;
grant select, insert on table public.cash_transfers to authenticated;
