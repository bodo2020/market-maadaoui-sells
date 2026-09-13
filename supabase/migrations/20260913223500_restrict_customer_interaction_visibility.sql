-- CRM/follow-up notes are internal staff data. Signed-in customers must not be
-- able to read the table directly.
drop policy if exists "Users can view customer interactions" on public.customer_interactions;
drop policy if exists "Staff can view customer interactions" on public.customer_interactions;

create policy "Staff can view customer interactions"
on public.customer_interactions
for select to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or (
    branch_id is not null
    and (
      public.staff_has_permission('customers.view', branch_id)
      or public.staff_has_permission('customers.manage', branch_id)
    )
  )
);
