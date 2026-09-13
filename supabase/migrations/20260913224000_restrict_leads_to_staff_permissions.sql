-- Leads contain prospect PII and internal CRM notes. Customer accounts must not
-- be able to read or mutate them simply because they are authenticated.

drop policy if exists "Leads are viewable by authenticated users" on public.leads;
drop policy if exists "Authenticated users can create leads" on public.leads;
drop policy if exists "Authenticated users can update leads" on public.leads;
drop policy if exists "Authenticated users can delete leads" on public.leads;
drop policy if exists "Staff can view leads" on public.leads;
drop policy if exists "Staff can create leads" on public.leads;
drop policy if exists "Staff can update leads" on public.leads;
drop policy if exists "Staff can delete leads" on public.leads;

create policy "Staff can view leads"
on public.leads for select to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_any_branch_permission('customers.view')
  or public.staff_has_any_branch_permission('customers.manage')
);

create policy "Staff can create leads"
on public.leads for insert to authenticated
with check (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_any_branch_permission('customers.manage')
);

create policy "Staff can update leads"
on public.leads for update to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_any_branch_permission('customers.manage')
)
with check (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_any_branch_permission('customers.manage')
);

create policy "Staff can delete leads"
on public.leads for delete to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_any_branch_permission('customers.manage')
);
