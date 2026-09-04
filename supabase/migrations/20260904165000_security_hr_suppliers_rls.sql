-- Stage 5: harden HR/staff operational data and supplier records.
-- Depends on the Supabase Auth rollout and private financial helpers.

-- True only for an active staff account in public.users. Customer Auth accounts
-- do not gain staff access merely by being authenticated.
create or replace function private.is_active_staff()
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
  );
$$;

-- Global admins can manage any employee. A branch manager may manage staff who
-- share at least one branch assignment with them.
create or replace function private.can_manage_staff_user(_employee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null or _employee is null then false
    when exists (
      select 1
      from public.users u
      where u.id = (select auth.uid())
        and coalesce(u.active, true)
        and u.role in ('super_admin', 'admin')
    ) then true
    else exists (
      select 1
      from public.users manager
      join public.user_branch_roles manager_branch
        on manager_branch.user_id = manager.id
      join public.user_branch_roles employee_branch
        on employee_branch.branch_id = manager_branch.branch_id
       and employee_branch.user_id = _employee
      where manager.id = (select auth.uid())
        and coalesce(manager.active, true)
        and (
          manager.role = 'branch_manager'
          or manager_branch.role in ('branch_manager', 'branch_admin')
        )
    )
  end;
$$;

-- Supplier records are shared store-backoffice data. They may be viewed only by
-- active staff and managed by active admins/branch managers.
create or replace function private.can_manage_suppliers()
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
      and ubr.role in ('branch_manager', 'branch_admin')
  );
$$;

revoke execute on function private.is_active_staff() from public, anon;
revoke execute on function private.can_manage_staff_user(uuid) from public, anon;
revoke execute on function private.can_manage_suppliers() from public, anon;
grant execute on function private.is_active_staff() to authenticated, service_role;
grant execute on function private.can_manage_staff_user(uuid) to authenticated, service_role;
grant execute on function private.can_manage_suppliers() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- shifts
-- Staff can see/start/end their own shift. Authorized managers can do the same
-- for staff they manage. The browser cannot rewrite employee_id or start_time
-- after a shift is created.
-- ---------------------------------------------------------------------------
alter table public.shifts enable row level security;

drop policy if exists "Allow full access to all users temporarily" on public.shifts;

create policy "Staff view own shifts or managers view managed staff"
on public.shifts
for select
to authenticated
using (
  employee_id = (select auth.uid())
  or private.can_manage_staff_user(employee_id)
);

create policy "Staff start own shifts or managers start managed staff shifts"
on public.shifts
for insert
to authenticated
with check (
  employee_id is not null
  and (
    employee_id = (select auth.uid())
    or private.can_manage_staff_user(employee_id)
  )
);

create policy "Staff end own shifts or managers update managed staff shifts"
on public.shifts
for update
to authenticated
using (
  employee_id = (select auth.uid())
  or private.can_manage_staff_user(employee_id)
)
with check (
  employee_id = (select auth.uid())
  or private.can_manage_staff_user(employee_id)
);

create policy "Managers delete managed staff shifts"
on public.shifts
for delete
to authenticated
using (private.can_manage_staff_user(employee_id));

revoke all on table public.shifts from anon, authenticated;
grant select, delete on table public.shifts to authenticated;
grant insert (employee_id, start_time) on table public.shifts to authenticated;
grant update (end_time, total_hours, updated_at) on table public.shifts to authenticated;

-- ---------------------------------------------------------------------------
-- salaries
-- Employees may see only their own payroll. Branch/global managers may manage
-- payroll rows only for branches they are authorized to manage.
-- ---------------------------------------------------------------------------
alter table public.salaries enable row level security;

drop policy if exists "Admins can manage salaries for their branch" on public.salaries;
drop policy if exists "Users can view salaries for their branch" on public.salaries;

create policy "Employees view own salaries or managers view branch payroll"
on public.salaries
for select
to authenticated
using (
  employee_id = (select auth.uid())
  or private.can_manage_financial_branch(branch_id)
);

create policy "Financial managers create branch salaries"
on public.salaries
for insert
to authenticated
with check (
  branch_id is not null
  and private.can_manage_financial_branch(branch_id)
  and created_by = (select auth.uid())
);

create policy "Financial managers update branch salaries"
on public.salaries
for update
to authenticated
using (private.can_manage_financial_branch(branch_id))
with check (private.can_manage_financial_branch(branch_id));

create policy "Financial managers delete branch salaries"
on public.salaries
for delete
to authenticated
using (private.can_manage_financial_branch(branch_id));

revoke all on table public.salaries from anon, authenticated;
grant select, insert, update, delete on table public.salaries to authenticated;

-- ---------------------------------------------------------------------------
-- suppliers
-- Supplier contacts/balances are backoffice-only. Customers and anonymous users
-- must not be able to read or mutate them.
-- ---------------------------------------------------------------------------
alter table public.suppliers enable row level security;

drop policy if exists "Allow all users to view suppliers" on public.suppliers;
drop policy if exists "Temporary allow all operations on suppliers" on public.suppliers;

create policy "Active staff view suppliers"
on public.suppliers
for select
to authenticated
using (private.is_active_staff());

create policy "Staff managers create suppliers"
on public.suppliers
for insert
to authenticated
with check (private.can_manage_suppliers());

create policy "Staff managers update suppliers"
on public.suppliers
for update
to authenticated
using (private.can_manage_suppliers())
with check (private.can_manage_suppliers());

create policy "Staff managers delete suppliers"
on public.suppliers
for delete
to authenticated
using (private.can_manage_suppliers());

revoke all on table public.suppliers from anon, authenticated;
grant select, insert, update, delete on table public.suppliers to authenticated;
