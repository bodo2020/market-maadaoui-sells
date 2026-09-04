-- Stage 1: lock down staff identity and branch-role tables after Supabase Auth rollout.
-- This migration intentionally does not touch financial/order policies yet.

alter table public.users enable row level security;
alter table public.user_branch_roles enable row level security;

-- Remove legacy/public users policies that allowed anonymous reads or writes.
drop policy if exists "Admins can view all users" on public.users;
drop policy if exists "Allow admin roles to delete users" on public.users;
drop policy if exists "Allow admin roles to insert users" on public.users;
drop policy if exists "Allow admin roles to update users" on public.users;
drop policy if exists "Allow all users to view users" on public.users;
drop policy if exists "Users can view own user data" on public.users;

create policy "Authenticated users view own user data or admins view all"
on public.users
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or public.is_super_admin()
);

create policy "Admins insert users"
on public.users
for insert
to authenticated
with check (
  public.is_admin()
  or public.is_super_admin()
);

create policy "Admins update users"
on public.users
for update
to authenticated
using (
  public.is_admin()
  or public.is_super_admin()
)
with check (
  public.is_admin()
  or public.is_super_admin()
);

create policy "Admins delete users"
on public.users
for delete
to authenticated
using (
  public.is_admin()
  or public.is_super_admin()
);

-- Remove the temporary public branch-role policy and recreate authenticated-only access.
drop policy if exists "Admins manage user_branch_roles" on public.user_branch_roles;
drop policy if exists "Temporary public manage user_branch_roles" on public.user_branch_roles;
drop policy if exists "Users can view their branch roles" on public.user_branch_roles;

create policy "Users view own branch roles or admins view all"
on public.user_branch_roles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or public.is_super_admin()
);

create policy "Admins manage user branch roles"
on public.user_branch_roles
for all
to authenticated
using (
  public.is_admin()
  or public.is_super_admin()
)
with check (
  public.is_admin()
  or public.is_super_admin()
);

-- Defense in depth: anonymous clients should have no direct table privileges here.
revoke all on table public.users from anon;
revoke all on table public.user_branch_roles from anon;

grant select, insert, update, delete on table public.users to authenticated;
grant select, insert, update, delete on table public.user_branch_roles to authenticated;
