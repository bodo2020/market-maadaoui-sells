-- Phase 2: Tenant access layer
-- Establish real Auth-backed tenant memberships without changing current POS/operations authorization.

begin;

-- Memberships must reference real Supabase Auth identities.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tenant_users_user_id_auth_fkey'
      and conrelid = 'public.tenant_users'::regclass
  ) then
    alter table public.tenant_users
      add constraint tenant_users_user_id_auth_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end $$;

-- Seed only current active staff that have a confirmed auth.users identity.
insert into public.tenant_users (
  tenant_id,
  user_id,
  role,
  permissions,
  is_active
)
select
  t.id,
  u.id,
  case
    when u.role = 'super_admin' then 'owner'
    when u.role = 'admin' then 'admin'
    when u.role = 'branch_manager' then 'manager'
    else 'user'
  end,
  '{}'::jsonb,
  true
from public.users u
join auth.users a on a.id = u.id
cross join public.tenants t
where t.subdomain = 'elmadawy'
  and u.active is distinct from false
on conflict (tenant_id, user_id) do update
set role = excluded.role,
    is_active = true,
    updated_at = now();

-- Minimal stable helper used by future tenant-aware policies.
create or replace function public.has_tenant_access(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.staff_is_super_admin(auth.uid())
    or exists (
      select 1
      from public.tenant_users tu
      where tu.tenant_id = p_tenant_id
        and tu.user_id = auth.uid()
        and coalesce(tu.is_active, true)
    );
$$;

revoke all on function public.has_tenant_access(uuid) from public;
revoke all on function public.has_tenant_access(uuid) from anon;
grant execute on function public.has_tenant_access(uuid) to authenticated;

-- Members can discover only tenants they belong to.
drop policy if exists "Tenant members can view their tenant" on public.tenants;
create policy "Tenant members can view their tenant"
on public.tenants
for select
to authenticated
using (public.has_tenant_access(id));

-- Members can inspect only their own membership row.
-- Existing super-admin management policy remains intact.
drop policy if exists "Users can view own tenant membership" on public.tenant_users;
create policy "Users can view own tenant membership"
on public.tenant_users
for select
to authenticated
using (user_id = auth.uid() or public.is_super_admin());

create index if not exists idx_tenant_users_user_active
  on public.tenant_users (user_id, is_active, tenant_id);

commit;
