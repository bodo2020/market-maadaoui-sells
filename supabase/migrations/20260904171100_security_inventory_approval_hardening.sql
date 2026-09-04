-- Stage 6 follow-up: approval integrity and RLS support indexes.

-- Only global admins or branch managers/admins may approve a completed inventory session.
create or replace function private.can_approve_inventory_branch(_branch uuid)
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
        and ubr.role in ('branch_manager', 'branch_admin')
    )
  end;
$$;

revoke execute on function private.can_approve_inventory_branch(uuid) from public, anon;
grant execute on function private.can_approve_inventory_branch(uuid) to authenticated, service_role;

-- Inventory operators may work a session, but only managers may move it into
-- or out of the approved state.
drop policy if exists "Inventory operators update branch sessions" on public.inventory_sessions;
create policy "Inventory operators update branch sessions"
on public.inventory_sessions
for update
to authenticated
using (private.can_manage_inventory_branch(branch_id))
with check (
  private.can_manage_inventory_branch(branch_id)
  and (
    status <> 'approved'
    or private.can_approve_inventory_branch(branch_id)
  )
);

create or replace function private.set_inventory_approval_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Trusted server/database maintenance is not tied to an end-user JWT.
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.status = 'approved' and old.status is distinct from 'approved' then
    if not private.can_approve_inventory_branch(new.branch_id) then
      raise exception 'Only an authorized branch manager may approve inventory';
    end if;
    new.approved_by := (select auth.uid());
    new.approved_at := now();
  elsif old.status = 'approved' and new.status is distinct from 'approved' then
    if not private.can_approve_inventory_branch(new.branch_id) then
      raise exception 'Only an authorized branch manager may reopen approved inventory';
    end if;
    new.approved_by := null;
    new.approved_at := null;
  end if;

  return new;
end;
$$;

revoke execute on function private.set_inventory_approval_identity() from public, anon, authenticated;
grant execute on function private.set_inventory_approval_identity() to service_role;

-- Approval identity is trigger-owned; browser clients may never spoof it.
revoke update (approved_by, approved_at) on public.inventory_sessions from authenticated;
revoke update (approved_by) on public.inventory_transfers from authenticated;

-- Support branch- and parent-based RLS lookups efficiently.
create index if not exists idx_inventory_transfers_from_branch_id
  on public.inventory_transfers (from_branch_id);
create index if not exists idx_inventory_transfers_to_branch_id
  on public.inventory_transfers (to_branch_id);
create index if not exists idx_inventory_transfer_items_transfer_id
  on public.inventory_transfer_items (transfer_id);
