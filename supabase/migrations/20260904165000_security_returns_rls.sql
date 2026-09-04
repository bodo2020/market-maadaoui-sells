-- Stage 7: harden POS returns and customer return requests.
-- Removes legacy public access while preserving staff/customer workflows.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A POS return may be operated by cash staff for its branch. Legacy/unassigned
-- returns are visible only to global financial admins until they are assigned.
create or replace function private.can_operate_pos_return(_return_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.returns r
    where r.id = _return_id
      and (
        (r.branch_id is not null and private.can_operate_cash_branch(r.branch_id))
        or (r.branch_id is null and private.can_manage_financial_branch(null))
      )
  );
$$;

-- Managers may handle an online return request according to the order's branch.
-- Orders that predate branch assignment remain global-admin only.
create or replace function private.can_manage_return_request(_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.return_requests rr
    left join public.online_orders o on o.id = rr.order_id
    where rr.id = _request_id
      and private.can_manage_financial_branch(o.branch_id)
  );
$$;

create or replace function private.is_return_request_owner(_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.return_requests rr
    where rr.id = _request_id
      and rr.user_id = (select auth.uid())
  );
$$;

-- Fill a missing POS-return branch from its online order first, then only when
-- the current staff user has exactly one assigned branch. Never guess between
-- multiple branch assignments.
create or replace function private.assign_return_branch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch uuid;
  v_branch_count integer;
begin
  if new.branch_id is not null then
    return new;
  end if;

  if new.order_id is not null then
    select o.branch_id
      into v_branch
    from public.online_orders o
    where o.id = new.order_id;

    if v_branch is not null then
      new.branch_id := v_branch;
      return new;
    end if;
  end if;

  if (select auth.uid()) is not null then
    select count(*), min(ubr.branch_id::text)::uuid
      into v_branch_count, v_branch
    from public.user_branch_roles ubr
    where ubr.user_id = (select auth.uid());

    if v_branch_count = 1 then
      new.branch_id := v_branch;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.can_operate_pos_return(uuid) from public, anon;
revoke execute on function private.can_manage_return_request(uuid) from public, anon;
revoke execute on function private.is_return_request_owner(uuid) from public, anon;
revoke execute on function private.assign_return_branch() from public, anon, authenticated;
grant execute on function private.can_operate_pos_return(uuid) to authenticated, service_role;
grant execute on function private.can_manage_return_request(uuid) to authenticated, service_role;
grant execute on function private.is_return_request_owner(uuid) to authenticated, service_role;
grant execute on function private.assign_return_branch() to service_role;

-- ---------------------------------------------------------------------------
-- returns: staff/POS return headers
-- ---------------------------------------------------------------------------
alter table public.returns enable row level security;

drop policy if exists "Enable all access to returns" on public.returns;
drop policy if exists "Enable insert for authenticated users only" on public.returns;
drop policy if exists "Enable read access for all users" on public.returns;
drop policy if exists "Enable update for authenticated users only" on public.returns;

create policy "Cash operators view branch returns"
on public.returns
for select
to authenticated
using (
  (branch_id is not null and private.can_operate_cash_branch(branch_id))
  or (branch_id is null and private.can_manage_financial_branch(null))
);

create policy "Cash operators create branch returns"
on public.returns
for insert
to authenticated
with check (
  (branch_id is not null and private.can_operate_cash_branch(branch_id))
  or (branch_id is null and private.can_manage_financial_branch(null))
);

create policy "Cash operators update branch returns"
on public.returns
for update
to authenticated
using (
  (branch_id is not null and private.can_operate_cash_branch(branch_id))
  or (branch_id is null and private.can_manage_financial_branch(null))
)
with check (
  (branch_id is not null and private.can_operate_cash_branch(branch_id))
  or (branch_id is null and private.can_manage_financial_branch(null))
);

create policy "Financial managers delete branch returns"
on public.returns
for delete
to authenticated
using (private.can_manage_financial_branch(branch_id));

revoke all on table public.returns from anon, authenticated;
grant select, delete on table public.returns to authenticated;
grant insert (
  order_id, customer_id, total_amount, reason, status, customer_name, branch_id
) on table public.returns to authenticated;
grant update (
  total_amount, reason, status, customer_name, updated_at
) on table public.returns to authenticated;

drop trigger if exists assign_return_branch on public.returns;
create trigger assign_return_branch
before insert on public.returns
for each row execute function private.assign_return_branch();

-- ---------------------------------------------------------------------------
-- return_items: access inherits from the parent POS return.
-- ---------------------------------------------------------------------------
alter table public.return_items enable row level security;

drop policy if exists "Enable all access to return_items" on public.return_items;
drop policy if exists "Enable insert for authenticated users only" on public.return_items;
drop policy if exists "Enable read access for all users" on public.return_items;

create policy "Cash operators view return items"
on public.return_items
for select
to authenticated
using (private.can_operate_pos_return(return_id));

create policy "Cash operators create return items"
on public.return_items
for insert
to authenticated
with check (
  return_id is not null
  and quantity > 0
  and private.can_operate_pos_return(return_id)
);

create policy "Cash operators update return items"
on public.return_items
for update
to authenticated
using (private.can_operate_pos_return(return_id))
with check (
  return_id is not null
  and quantity > 0
  and private.can_operate_pos_return(return_id)
);

create policy "Financial managers delete return items"
on public.return_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.returns r
    where r.id = return_id
      and private.can_manage_financial_branch(r.branch_id)
  )
);

revoke all on table public.return_items from anon, authenticated;
grant select, delete on table public.return_items to authenticated;
grant insert (
  return_id, product_id, quantity, price, total, reason, purchase_price, profit_loss
) on table public.return_items to authenticated;
grant update (
  quantity, price, total, reason, purchase_price, profit_loss
) on table public.return_items to authenticated;

-- ---------------------------------------------------------------------------
-- return_requests: customer-authored online return requests.
-- Customers own their request. Branch financial managers may review/update it.
-- ---------------------------------------------------------------------------
alter table public.return_requests enable row level security;

drop policy if exists "Users can create their own return requests" on public.return_requests;
drop policy if exists "Users can see their own return requests" on public.return_requests;
drop policy if exists "Admins can view all return requests" on public.return_requests;

create policy "Customers create own return requests"
on public.return_requests
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Customers view own return requests"
on public.return_requests
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Managers view branch return requests"
on public.return_requests
for select
to authenticated
using (private.can_manage_return_request(id));

create policy "Managers update branch return requests"
on public.return_requests
for update
to authenticated
using (private.can_manage_return_request(id))
with check (private.can_manage_return_request(id));

create policy "Managers delete branch return requests"
on public.return_requests
for delete
to authenticated
using (private.can_manage_return_request(id));

revoke all on table public.return_requests from anon, authenticated;
grant select, delete on table public.return_requests to authenticated;
grant insert (user_id, order_id, reason, images) on table public.return_requests to authenticated;
grant update (status, admin_notes, updated_at) on table public.return_requests to authenticated;

-- ---------------------------------------------------------------------------
-- return_request_items: customer items inherit ownership from return_requests;
-- managers inherit access from the request/order branch.
-- ---------------------------------------------------------------------------
alter table public.return_request_items enable row level security;

drop policy if exists "Users can create their own return request items" on public.return_request_items;
drop policy if exists "Users can see their own return request items" on public.return_request_items;

create policy "Customers create own return request items"
on public.return_request_items
for insert
to authenticated
with check (
  quantity > 0
  and private.is_return_request_owner(return_request_id)
);

create policy "Customers view own return request items"
on public.return_request_items
for select
to authenticated
using (private.is_return_request_owner(return_request_id));

create policy "Managers view return request items"
on public.return_request_items
for select
to authenticated
using (private.can_manage_return_request(return_request_id));

create policy "Managers update return request items"
on public.return_request_items
for update
to authenticated
using (private.can_manage_return_request(return_request_id))
with check (
  quantity > 0
  and private.can_manage_return_request(return_request_id)
);

create policy "Managers delete return request items"
on public.return_request_items
for delete
to authenticated
using (private.can_manage_return_request(return_request_id));

revoke all on table public.return_request_items from anon, authenticated;
grant select, delete on table public.return_request_items to authenticated;
grant insert (return_request_id, product_id, quantity, reason) on table public.return_request_items to authenticated;
grant update (quantity, reason) on table public.return_request_items to authenticated;

-- RLS parent lookups should not scan whole tables.
create index if not exists idx_return_items_return_id
  on public.return_items (return_id);
create index if not exists idx_return_request_items_request_id
  on public.return_request_items (return_request_id);
create index if not exists idx_return_requests_user_id
  on public.return_requests (user_id);
create index if not exists idx_return_requests_order_id
  on public.return_requests (order_id);
