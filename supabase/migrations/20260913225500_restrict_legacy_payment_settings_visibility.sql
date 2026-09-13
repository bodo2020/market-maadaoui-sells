-- Legacy payment_settings contains bank account details and fee configuration.
-- POS cashiers use get_pos_payment_methods(), which performs its own branch-scoped
-- authorization, so direct table reads are limited to finance/settings staff.

drop policy if exists "security_payment_settings_staff_read" on public.payment_settings;
create policy "Authorized staff read payment settings"
on public.payment_settings for select to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_any_branch_permission('finance.view')
  or public.staff_has_any_branch_permission('finance.manage')
  or public.staff_has_any_branch_permission('branch.manage_settings')
);
