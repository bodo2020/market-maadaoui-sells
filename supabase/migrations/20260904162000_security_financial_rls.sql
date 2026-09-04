-- Stage 3: harden financial tables and cash RPCs.
-- Requires the Supabase Auth staff rollout and staff RLS migration to be live first.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated, service_role;

-- Financial managers: global admins, or branch managers/admins assigned to the branch.
create or replace function private.can_manage_financial_branch(_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then false
    when exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and coalesce(u.active, true)
        and u.role in ('super_admin', 'admin')
    ) then true
    when _branch is null then false
    else exists (
      select 1
      from public.user_branch_roles ubr
      join public.users u on u.id = ubr.user_id
      where ubr.user_id = (select auth.uid())
        and ubr.branch_id = _branch
        and coalesce(u.active, true)
        and (
          u.role = 'branch_manager'
          or ubr.role in ('branch_manager', 'branch_admin')
        )
    )
  end;
$$;

-- Cash operators: admins/managers and cashiers assigned to the branch.
create or replace function private.can_operate_cash_branch(_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then false
    when exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and coalesce(u.active, true)
        and u.role in ('super_admin', 'admin')
    ) then true
    when _branch is null then false
    else exists (
      select 1
      from public.user_branch_roles ubr
      join public.users u on u.id = ubr.user_id
      where ubr.user_id = (select auth.uid())
        and ubr.branch_id = _branch
        and coalesce(u.active, true)
        and (
          u.role in ('cashier', 'branch_manager')
          or ubr.role in ('cashier', 'branch_manager', 'branch_admin')
        )
    )
  end;
$$;

revoke execute on function private.can_manage_financial_branch(uuid) from public, anon;
revoke execute on function private.can_operate_cash_branch(uuid) from public, anon;
grant execute on function private.can_manage_financial_branch(uuid) to authenticated, service_role;
grant execute on function private.can_operate_cash_branch(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- cash_transactions: direct client writes are disabled. Official writes go
-- through the branch-aware RPCs below.
-- ---------------------------------------------------------------------------
alter table public.cash_transactions enable row level security;

drop policy if exists "Admins manage cash_transactions" on public.cash_transactions;
drop policy if exists "Anonymous can view cash_transactions" on public.cash_transactions;
drop policy if exists "Branch users can insert cash_transactions" on public.cash_transactions;
drop policy if exists "Branch users view cash_transactions" on public.cash_transactions;

create policy "Cash operators view branch cash transactions"
on public.cash_transactions
for select
to authenticated
using (private.can_operate_cash_branch(branch_id));

revoke all on table public.cash_transactions from anon, authenticated;
grant select on table public.cash_transactions to authenticated;

-- ---------------------------------------------------------------------------
-- cash_tracking: branch financial managers may maintain tracking rows; cash
-- operators may read their branch. Legacy NULL-branch rows remain visible only
-- to global admin/super-admin through the helper.
-- ---------------------------------------------------------------------------
alter table public.cash_tracking enable row level security;

drop policy if exists "Admins manage cash_tracking" on public.cash_tracking;
drop policy if exists "Anonymous can view cash_tracking" on public.cash_tracking;
drop policy if exists "Branch users can insert cash_tracking" on public.cash_tracking;
drop policy if exists "Branch users can update cash_tracking" on public.cash_tracking;
drop policy if exists "Branch users view cash_tracking" on public.cash_tracking;

create policy "Cash operators view branch cash tracking"
on public.cash_tracking
for select
to authenticated
using (private.can_operate_cash_branch(branch_id));

create policy "Financial managers insert branch cash tracking"
on public.cash_tracking
for insert
to authenticated
with check (
  branch_id is not null
  and private.can_manage_financial_branch(branch_id)
);

create policy "Financial managers update branch cash tracking"
on public.cash_tracking
for update
to authenticated
using (private.can_manage_financial_branch(branch_id))
with check (private.can_manage_financial_branch(branch_id));

revoke all on table public.cash_tracking from anon, authenticated;
grant select, insert, update on table public.cash_tracking to authenticated;

-- ---------------------------------------------------------------------------
-- expenses: no public access. Managers are scoped to their branch; only global
-- admins can see or modify legacy NULL-branch rows.
-- ---------------------------------------------------------------------------
alter table public.expenses enable row level security;

drop policy if exists "Allow all users to delete expenses" on public.expenses;
drop policy if exists "Allow all users to insert expenses" on public.expenses;
drop policy if exists "Allow all users to select expenses" on public.expenses;
drop policy if exists "Allow all users to update expenses" on public.expenses;

create policy "Financial managers view branch expenses"
on public.expenses
for select
to authenticated
using (private.can_manage_financial_branch(branch_id));

create policy "Financial managers insert branch expenses"
on public.expenses
for insert
to authenticated
with check (
  branch_id is not null
  and private.can_manage_financial_branch(branch_id)
);

create policy "Financial managers update branch expenses"
on public.expenses
for update
to authenticated
using (private.can_manage_financial_branch(branch_id))
with check (private.can_manage_financial_branch(branch_id));

create policy "Financial managers delete branch expenses"
on public.expenses
for delete
to authenticated
using (private.can_manage_financial_branch(branch_id));

revoke all on table public.expenses from anon, authenticated;
grant select, insert, update, delete on table public.expenses to authenticated;

-- ---------------------------------------------------------------------------
-- purchases
-- ---------------------------------------------------------------------------
alter table public.purchases enable row level security;

drop policy if exists "Admins and super admins can manage purchases" on public.purchases;
drop policy if exists "Allow all users to view purchases" on public.purchases;
drop policy if exists "Anyone can delete purchases" on public.purchases;
drop policy if exists "Anyone can insert purchases" on public.purchases;
drop policy if exists "Anyone can update purchases" on public.purchases;
drop policy if exists "Users can manage purchases" on public.purchases;
drop policy if exists "Users can view purchases" on public.purchases;

create policy "Financial managers view branch purchases"
on public.purchases
for select
to authenticated
using (private.can_manage_financial_branch(branch_id));

create policy "Financial managers insert branch purchases"
on public.purchases
for insert
to authenticated
with check (
  branch_id is not null
  and private.can_manage_financial_branch(branch_id)
);

create policy "Financial managers update branch purchases"
on public.purchases
for update
to authenticated
using (private.can_manage_financial_branch(branch_id))
with check (private.can_manage_financial_branch(branch_id));

create policy "Financial managers delete branch purchases"
on public.purchases
for delete
to authenticated
using (private.can_manage_financial_branch(branch_id));

revoke all on table public.purchases from anon, authenticated;
grant select, insert, update, delete on table public.purchases to authenticated;

-- ---------------------------------------------------------------------------
-- purchase_items: enforce the same branch as the parent purchase on new rows.
-- ---------------------------------------------------------------------------
alter table public.purchase_items enable row level security;

drop policy if exists "Admins and super admins can manage purchase items" on public.purchase_items;
drop policy if exists "Admins manage purchase_items" on public.purchase_items;
drop policy if exists "Admins view purchase_items" on public.purchase_items;
drop policy if exists "Allow all users to view purchase items" on public.purchase_items;
drop policy if exists "Anyone can delete purchase_items" on public.purchase_items;
drop policy if exists "Anyone can insert purchase_items" on public.purchase_items;
drop policy if exists "Anyone can update purchase_items" on public.purchase_items;

create policy "Financial managers view branch purchase items"
on public.purchase_items
for select
to authenticated
using (private.can_manage_financial_branch(branch_id));

create policy "Financial managers insert branch purchase items"
on public.purchase_items
for insert
to authenticated
with check (
  branch_id is not null
  and private.can_manage_financial_branch(branch_id)
  and exists (
    select 1
    from public.purchases p
    where p.id = purchase_id
      and p.branch_id = purchase_items.branch_id
  )
);

create policy "Financial managers update branch purchase items"
on public.purchase_items
for update
to authenticated
using (private.can_manage_financial_branch(branch_id))
with check (
  private.can_manage_financial_branch(branch_id)
  and (
    (
      branch_id is not null
      and exists (
        select 1
        from public.purchases p
        where p.id = purchase_id
          and p.branch_id = purchase_items.branch_id
      )
    )
    or (
      branch_id is null
      and (public.is_admin() or public.is_super_admin())
      and exists (
        select 1
        from public.purchases p
        where p.id = purchase_id
          and p.branch_id is null
      )
    )
  )
);

create policy "Financial managers delete branch purchase items"
on public.purchase_items
for delete
to authenticated
using (private.can_manage_financial_branch(branch_id));

revoke all on table public.purchase_items from anon, authenticated;
grant select, insert, update, delete on table public.purchase_items to authenticated;

-- ---------------------------------------------------------------------------
-- Cash RPC hardening. Legacy branchless SECURITY DEFINER overloads become
-- service-only. Browser-accessible wrappers require a real Auth user, a branch,
-- and server-side branch authorization. Client-supplied created_by is never
-- trusted.
-- ---------------------------------------------------------------------------

create or replace function public.add_cash_transaction_api(
  p_amount numeric,
  p_transaction_type text,
  p_register_type text,
  p_notes text,
  p_created_by uuid default null::uuid,
  p_branch_id uuid default null::uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_branch_id is null or not private.can_operate_cash_branch(p_branch_id) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;

  if p_created_by is not null and p_created_by <> v_uid then
    raise exception 'Invalid transaction owner' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;

  if p_transaction_type not in ('deposit', 'withdrawal') then
    raise exception 'Invalid transaction type' using errcode = '22023';
  end if;

  if p_register_type not in ('store', 'online') then
    raise exception 'Invalid register type' using errcode = '22023';
  end if;

  return public.add_cash_transaction(
    p_amount,
    p_transaction_type,
    p_register_type,
    coalesce(p_notes, ''),
    v_uid,
    p_branch_id
  );
end;
$$;

create or replace function public.get_current_cash_balance(
  p_register_type text,
  p_branch_id uuid default null::uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_branch_id is null or not private.can_operate_cash_branch(p_branch_id) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;

  if p_register_type not in ('store', 'online', 'merged') then
    raise exception 'Invalid register type' using errcode = '22023';
  end if;

  select coalesce(ct.balance_after, 0)
  into v_balance
  from public.cash_transactions ct
  where ct.register_type = p_register_type
    and ct.branch_id = p_branch_id
  order by ct.transaction_date desc, ct.created_at desc
  limit 1;

  return coalesce(v_balance, 0);
end;
$$;

create or replace function public.get_merged_cash_balance(
  p_branch_id uuid default null::uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_balance numeric := 0;
  v_online_balance numeric := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_branch_id is null or not private.can_operate_cash_branch(p_branch_id) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;

  select coalesce(ct.balance_after, 0)
  into v_store_balance
  from public.cash_transactions ct
  where ct.register_type = 'store'
    and ct.branch_id = p_branch_id
  order by ct.transaction_date desc, ct.created_at desc
  limit 1;

  if coalesce(v_store_balance, 0) = 0 then
    select coalesce(ctk.closing_balance, 0)
    into v_store_balance
    from public.cash_tracking ctk
    where ctk.register_type = 'store'
      and ctk.branch_id = p_branch_id
    order by ctk.date desc, ctk.created_at desc
    limit 1;
  end if;

  select coalesce(ct.balance_after, 0)
  into v_online_balance
  from public.cash_transactions ct
  where ct.register_type = 'online'
    and ct.branch_id = p_branch_id
  order by ct.transaction_date desc, ct.created_at desc
  limit 1;

  if coalesce(v_online_balance, 0) = 0 then
    select coalesce(ctk.closing_balance, 0)
    into v_online_balance
    from public.cash_tracking ctk
    where ctk.register_type = 'online'
      and ctk.branch_id = p_branch_id
    order by ctk.date desc, ctk.created_at desc
    limit 1;
  end if;

  return coalesce(v_store_balance, 0) + coalesce(v_online_balance, 0);
end;
$$;

create or replace function public.record_merged_cash_transaction(
  p_amount numeric,
  p_transaction_type text,
  p_notes text,
  p_created_by uuid default null::uuid,
  p_branch_id uuid default null::uuid
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_current_balance numeric;
  v_new_balance numeric;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_branch_id is null or not private.can_manage_financial_branch(p_branch_id) then
    raise exception 'Branch access denied' using errcode = '42501';
  end if;

  if p_created_by is not null and p_created_by <> v_uid then
    raise exception 'Invalid transaction owner' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;

  if p_transaction_type not in ('deposit', 'withdrawal') then
    raise exception 'Invalid transaction type' using errcode = '22023';
  end if;

  v_current_balance := public.get_merged_cash_balance(p_branch_id);

  if p_transaction_type = 'deposit' then
    v_new_balance := v_current_balance + p_amount;
  else
    if p_amount > v_current_balance then
      raise exception 'Insufficient funds. Current balance: %', v_current_balance;
    end if;
    v_new_balance := v_current_balance - p_amount;
  end if;

  insert into public.cash_transactions (
    transaction_date, amount, transaction_type, register_type,
    notes, balance_after, created_by, branch_id
  ) values (
    now(), p_amount, p_transaction_type, 'merged',
    coalesce(p_notes, ''), v_new_balance, v_uid, p_branch_id
  );

  insert into public.cash_tracking (
    date, register_type, opening_balance, closing_balance,
    difference, notes, created_by, branch_id
  ) values (
    current_date, 'merged', v_current_balance, v_new_balance,
    case when p_transaction_type = 'deposit' then p_amount else -p_amount end,
    coalesce(p_notes, ''), v_uid, p_branch_id
  );

  return v_new_balance;
end;
$$;

-- Remove browser access to legacy/core branchless or spoofable overloads.
revoke execute on function public.add_cash_transaction(numeric, text, text, text) from public, anon, authenticated;
revoke execute on function public.add_cash_transaction(numeric, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.add_cash_transaction(numeric, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.record_merged_cash_transaction(numeric, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.get_merged_cash_balance() from public, anon, authenticated;

grant execute on function public.add_cash_transaction(numeric, text, text, text, uuid, uuid) to service_role;
grant execute on function public.record_merged_cash_transaction(numeric, text, text, uuid) to service_role;
grant execute on function public.get_merged_cash_balance() to service_role;

-- Branch-aware API surface for signed-in staff.
revoke execute on function public.add_cash_transaction_api(numeric, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.get_current_cash_balance(text, uuid) from public, anon, authenticated;
revoke execute on function public.get_merged_cash_balance(uuid) from public, anon, authenticated;
revoke execute on function public.record_merged_cash_transaction(numeric, text, text, uuid, uuid) from public, anon, authenticated;

grant execute on function public.add_cash_transaction_api(numeric, text, text, text, uuid, uuid) to authenticated, service_role;
grant execute on function public.get_current_cash_balance(text, uuid) to authenticated, service_role;
grant execute on function public.get_merged_cash_balance(uuid) to authenticated, service_role;
grant execute on function public.record_merged_cash_transaction(numeric, text, text, uuid, uuid) to authenticated, service_role;
