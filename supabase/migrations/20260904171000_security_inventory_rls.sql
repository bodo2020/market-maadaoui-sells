-- Stage 6: harden inventory/damage/transfer backoffice data.
-- Customer Auth users must not gain inventory privileges merely by being authenticated.

-- Inventory operators: global admins, branch managers/admins, or an active
-- employee explicitly assigned to the branch. Cashier/delivery roles do not
-- receive inventory-write access.
create or replace function private.can_manage_inventory_branch(_branch uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null or _branch is null then false
    when exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and coalesce(u.active, true)
        and u.role in ('super_admin', 'admin')
    ) then true
    else exists (
      select 1
      from public.user_branch_roles ubr
      join public.users u on u.id = ubr.user_id
      where ubr.user_id = (select auth.uid())
        and ubr.branch_id = _branch
        and coalesce(u.active, true)
        and (
          u.role in ('branch_manager', 'employee')
          or ubr.role in ('branch_manager', 'branch_admin', 'employee', 'inventory', 'inventory_manager')
        )
    )
  end;
$$;

-- Some legacy inventory tables are global rather than branch-scoped. Keep their
-- mutation rights conservative until branch_id is added to those tables.
create or replace function private.can_manage_global_inventory()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and coalesce(u.active, true)
      and u.role in ('super_admin', 'admin', 'branch_manager')
  )
  or exists (
    select 1
    from public.user_branch_roles ubr
    join public.users u on u.id = ubr.user_id
    where ubr.user_id = (select auth.uid())
      and coalesce(u.active, true)
      and ubr.role in ('branch_manager', 'branch_admin', 'inventory_manager')
  );
$$;

revoke execute on function private.can_manage_inventory_branch(uuid) from public, anon;
revoke execute on function private.can_manage_global_inventory() from public, anon;
grant execute on function private.can_manage_inventory_branch(uuid) to authenticated, service_role;
grant execute on function private.can_manage_global_inventory() to authenticated, service_role;

-- Server-owned audit columns. This prevents a browser from impersonating a
-- different employee in created_by fields.
create or replace function private.set_inventory_created_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.created_by := (select auth.uid());
  end if;
  return new;
end;
$$;

revoke execute on function private.set_inventory_created_by() from public, anon, authenticated;
grant execute on function private.set_inventory_created_by() to service_role;

-- ---------------------------------------------------------------------------
-- damaged_products: immutable audit log, globally visible only to inventory
-- managers because the legacy table has no branch_id.
-- ---------------------------------------------------------------------------
alter table public.damaged_products enable row level security;
drop policy if exists "Allow all operations on damaged_products" on public.damaged_products;

create policy "Inventory managers view damaged products"
on public.damaged_products
for select
to authenticated
using (private.can_manage_global_inventory());

create policy "Inventory managers record damaged products"
on public.damaged_products
for insert
to authenticated
with check (private.can_manage_global_inventory());

revoke all on table public.damaged_products from anon, authenticated;
grant select on table public.damaged_products to authenticated;
grant insert (
  product_id, batch_number, damaged_quantity, damage_cost,
  damage_date, notes
) on table public.damaged_products to authenticated;

drop trigger if exists set_damaged_products_created_by on public.damaged_products;
create trigger set_damaged_products_created_by
before insert on public.damaged_products
for each row execute function private.set_inventory_created_by();

-- ---------------------------------------------------------------------------
-- inventory_alerts: staff may read low-stock configuration; only inventory
-- managers may change global alert thresholds.
-- ---------------------------------------------------------------------------
alter table public.inventory_alerts enable row level security;
drop policy if exists "Allow all operations for inventory_alerts" on public.inventory_alerts;

create policy "Active staff view inventory alerts"
on public.inventory_alerts
for select
to authenticated
using (private.is_active_staff());

create policy "Inventory managers create alerts"
on public.inventory_alerts
for insert
to authenticated
with check (private.can_manage_global_inventory());

create policy "Inventory managers update alerts"
on public.inventory_alerts
for update
to authenticated
using (private.can_manage_global_inventory())
with check (private.can_manage_global_inventory());

create policy "Inventory managers delete alerts"
on public.inventory_alerts
for delete
to authenticated
using (private.can_manage_global_inventory());

revoke all on table public.inventory_alerts from anon, authenticated;
grant select, delete on table public.inventory_alerts to authenticated;
grant insert (product_id, min_stock_level, alert_enabled) on table public.inventory_alerts to authenticated;
grant update (min_stock_level, alert_enabled, updated_at) on table public.inventory_alerts to authenticated;

-- ---------------------------------------------------------------------------
-- inventory_records: branch-scoped counting details. Product, expected quantity,
-- purchase price and branch are fixed after creation; count-result fields may be
-- updated by authorized inventory operators.
-- ---------------------------------------------------------------------------
alter table public.inventory_records enable row level security;
drop policy if exists "Allow all access to inventory records" on public.inventory_records;

create policy "Inventory operators view branch records"
on public.inventory_records
for select
to authenticated
using (private.can_manage_inventory_branch(branch_id));

create policy "Inventory operators create branch records"
on public.inventory_records
for insert
to authenticated
with check (
  branch_id is not null
  and private.can_manage_inventory_branch(branch_id)
);

create policy "Inventory operators update branch records"
on public.inventory_records
for update
to authenticated
using (private.can_manage_inventory_branch(branch_id))
with check (private.can_manage_inventory_branch(branch_id));

create policy "Inventory operators delete branch records"
on public.inventory_records
for delete
to authenticated
using (private.can_manage_inventory_branch(branch_id));

revoke all on table public.inventory_records from anon, authenticated;
grant select, delete on table public.inventory_records to authenticated;
grant insert (
  inventory_date, product_id, expected_quantity, actual_quantity, difference,
  purchase_price, difference_value, status, notes, branch_id
) on table public.inventory_records to authenticated;
grant update (
  actual_quantity, difference, difference_value, status, notes, updated_at
) on table public.inventory_records to authenticated;

drop trigger if exists set_inventory_records_created_by on public.inventory_records;
create trigger set_inventory_records_created_by
before insert on public.inventory_records
for each row execute function private.set_inventory_created_by();

-- ---------------------------------------------------------------------------
-- inventory_sessions: branch-scoped session summary. The browser cannot change
-- branch/session ownership after creation.
-- ---------------------------------------------------------------------------
alter table public.inventory_sessions enable row level security;
drop policy if exists "Allow all access to inventory sessions" on public.inventory_sessions;

create policy "Inventory operators view branch sessions"
on public.inventory_sessions
for select
to authenticated
using (private.can_manage_inventory_branch(branch_id));

create policy "Inventory operators create branch sessions"
on public.inventory_sessions
for insert
to authenticated
with check (
  branch_id is not null
  and private.can_manage_inventory_branch(branch_id)
);

create policy "Inventory operators update branch sessions"
on public.inventory_sessions
for update
to authenticated
using (private.can_manage_inventory_branch(branch_id))
with check (private.can_manage_inventory_branch(branch_id));

create policy "Inventory operators delete branch sessions"
on public.inventory_sessions
for delete
to authenticated
using (private.can_manage_inventory_branch(branch_id));

revoke all on table public.inventory_sessions from anon, authenticated;
grant select, delete on table public.inventory_sessions to authenticated;
grant insert (
  session_date, total_products, completed_products, matched_products,
  discrepancy_products, total_difference_value, status, branch_id
) on table public.inventory_sessions to authenticated;
grant update (
  total_products, completed_products, matched_products, discrepancy_products,
  total_difference_value, status, approved_by, approved_at, updated_at
) on table public.inventory_sessions to authenticated;

drop trigger if exists set_inventory_sessions_created_by on public.inventory_sessions;
create trigger set_inventory_sessions_created_by
before insert on public.inventory_sessions
for each row execute function private.set_inventory_created_by();

-- Ensure approval identity is server-owned when a session enters approved state.
create or replace function private.set_inventory_approval_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.approved_by := (select auth.uid());
    new.approved_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function private.set_inventory_approval_identity() from public, anon, authenticated;
grant execute on function private.set_inventory_approval_identity() to service_role;

drop trigger if exists set_inventory_session_approval_identity on public.inventory_sessions;
create trigger set_inventory_session_approval_identity
before update on public.inventory_sessions
for each row execute function private.set_inventory_approval_identity();

-- ---------------------------------------------------------------------------
-- inventory_transfers: branch-authorized transfer headers. Branch identities and
-- creator are immutable after creation. Either involved inventory manager may
-- update operational status/notes.
-- ---------------------------------------------------------------------------
alter table public.inventory_transfers enable row level security;
drop policy if exists "Branch managers/admins can manage transfers" on public.inventory_transfers;
drop policy if exists "Branch users can view related transfers" on public.inventory_transfers;
drop policy if exists "Temporary public manage inventory_transfers" on public.inventory_transfers;

create policy "Inventory operators view related transfers"
on public.inventory_transfers
for select
to authenticated
using (
  private.can_manage_inventory_branch(from_branch_id)
  or private.can_manage_inventory_branch(to_branch_id)
);

create policy "Inventory operators create source transfers"
on public.inventory_transfers
for insert
to authenticated
with check (
  from_branch_id <> to_branch_id
  and private.can_manage_inventory_branch(from_branch_id)
);

create policy "Inventory operators update related transfers"
on public.inventory_transfers
for update
to authenticated
using (
  private.can_manage_inventory_branch(from_branch_id)
  or private.can_manage_inventory_branch(to_branch_id)
)
with check (
  private.can_manage_inventory_branch(from_branch_id)
  or private.can_manage_inventory_branch(to_branch_id)
);

create policy "Inventory managers delete source transfers"
on public.inventory_transfers
for delete
to authenticated
using (private.can_manage_inventory_branch(from_branch_id));

revoke all on table public.inventory_transfers from anon, authenticated;
grant select, delete on table public.inventory_transfers to authenticated;
grant insert (
  from_branch_id, to_branch_id, status, notes, transfer_type,
  expected_arrival_date, actual_arrival_date
) on table public.inventory_transfers to authenticated;
grant update (
  status, notes, approved_by, expected_arrival_date,
  actual_arrival_date, updated_at
) on table public.inventory_transfers to authenticated;

drop trigger if exists set_inventory_transfers_created_by on public.inventory_transfers;
create trigger set_inventory_transfers_created_by
before insert on public.inventory_transfers
for each row execute function private.set_inventory_created_by();

-- ---------------------------------------------------------------------------
-- inventory_transfer_items: permissions are inherited from the parent transfer.
-- ---------------------------------------------------------------------------
alter table public.inventory_transfer_items enable row level security;
drop policy if exists "Branch managers/admins manage transfer items" on public.inventory_transfer_items;
drop policy if exists "Branch users can view transfer items via parent" on public.inventory_transfer_items;
drop policy if exists "Temporary public manage inventory_transfer_items" on public.inventory_transfer_items;

create policy "Inventory operators view transfer items"
on public.inventory_transfer_items
for select
to authenticated
using (
  exists (
    select 1
    from public.inventory_transfers t
    where t.id = transfer_id
      and (
        private.can_manage_inventory_branch(t.from_branch_id)
        or private.can_manage_inventory_branch(t.to_branch_id)
      )
  )
);

create policy "Inventory operators create transfer items"
on public.inventory_transfer_items
for insert
to authenticated
with check (
  quantity > 0
  and exists (
    select 1
    from public.inventory_transfers t
    where t.id = transfer_id
      and private.can_manage_inventory_branch(t.from_branch_id)
  )
);

create policy "Inventory operators update transfer item quantity"
on public.inventory_transfer_items
for update
to authenticated
using (
  exists (
    select 1
    from public.inventory_transfers t
    where t.id = transfer_id
      and private.can_manage_inventory_branch(t.from_branch_id)
  )
)
with check (
  quantity > 0
  and exists (
    select 1
    from public.inventory_transfers t
    where t.id = transfer_id
      and private.can_manage_inventory_branch(t.from_branch_id)
  )
);

create policy "Inventory operators delete transfer items"
on public.inventory_transfer_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.inventory_transfers t
    where t.id = transfer_id
      and private.can_manage_inventory_branch(t.from_branch_id)
  )
);

revoke all on table public.inventory_transfer_items from anon, authenticated;
grant select, delete on table public.inventory_transfer_items to authenticated;
grant insert (transfer_id, product_id, quantity) on table public.inventory_transfer_items to authenticated;
grant update (quantity) on table public.inventory_transfer_items to authenticated;
