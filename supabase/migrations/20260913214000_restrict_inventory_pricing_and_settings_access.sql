-- Close signed-in customer access to internal inventory/payment/invoice data and
-- replace legacy branch-access inventory writes with explicit permissions.

-- Inventory
drop policy if exists "Admins can manage inventory" on public.inventory;
drop policy if exists "Users can view inventory" on public.inventory;
drop policy if exists "Users can view inventory for accessible branches" on public.inventory;
drop policy if exists "security_inventory_read" on public.inventory;
drop policy if exists "security_inventory_write" on public.inventory;

create policy "security_inventory_read"
on public.inventory
for select to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_permission('inventory.view', branch_id)
  or public.staff_has_permission('inventory.manage', branch_id)
  or public.staff_has_permission('products.manage', branch_id)
);

create policy "security_inventory_write"
on public.inventory
for all to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_permission('inventory.manage', branch_id)
  or public.staff_has_permission('products.manage', branch_id)
)
with check (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_permission('inventory.manage', branch_id)
  or public.staff_has_permission('products.manage', branch_id)
);

-- Branch pricing contains purchase prices.
drop policy if exists "Admins can manage branch pricing" on public.branch_product_pricing;
drop policy if exists "Users can view branch pricing" on public.branch_product_pricing;
drop policy if exists "security_branch_pricing_read" on public.branch_product_pricing;
drop policy if exists "security_branch_pricing_write" on public.branch_product_pricing;

create policy "security_branch_pricing_read"
on public.branch_product_pricing
for select to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_permission('products.manage', branch_id)
  or public.staff_has_permission('pricing.manage', branch_id)
);

create policy "security_branch_pricing_write"
on public.branch_product_pricing
for all to authenticated
using (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_permission('products.manage', branch_id)
  or public.staff_has_permission('pricing.manage', branch_id)
)
with check (
  public.is_admin() or public.is_super_admin()
  or public.staff_has_permission('products.manage', branch_id)
  or public.staff_has_permission('pricing.manage', branch_id)
);

-- Payment/invoice settings are staff configuration, not customer data.
drop policy if exists "All users can view payment settings" on public.payment_settings;
drop policy if exists "security_payment_settings_staff_read" on public.payment_settings;
create policy "security_payment_settings_staff_read"
on public.payment_settings
for select to authenticated
using (private.is_active_staff());

drop policy if exists "All users can view invoice settings" on public.invoice_settings;
drop policy if exists "security_invoice_settings_staff_read" on public.invoice_settings;
create policy "security_invoice_settings_staff_read"
on public.invoice_settings
for select to authenticated
using (private.is_active_staff());
