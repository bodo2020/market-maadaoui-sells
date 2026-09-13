-- P0 security hardening applied to production on 2026-09-13.
-- Goal: preserve public storefront reads while removing anonymous mutation paths.
-- This migration is intentionally idempotent where possible so the repository
-- matches the already-hardened production database.

-- ---------------------------------------------------------------------------
-- 1. Remove legacy/public write-through RLS policies
-- ---------------------------------------------------------------------------

drop policy if exists "Allow all users to manage areas" on public.areas;
drop policy if exists "Temporary public manage branch_neighborhoods" on public.branch_neighborhoods;
drop policy if exists "Temporary public manage branches" on public.branches;
drop policy if exists "Allow all users to manage cities" on public.cities;
drop policy if exists "Allow full access to companies" on public.companies;
drop policy if exists "Allow full access to delivery_type_pricing" on public.delivery_type_pricing;
drop policy if exists "Enable all access to delivery_type_pricing" on public.delivery_type_pricing;
drop policy if exists "Allow full access to delivery_types" on public.delivery_types;
drop policy if exists "Enable all access to delivery_types" on public.delivery_types;
drop policy if exists "Temporary public manage franchise_settings" on public.franchise_settings;
drop policy if exists "Allow all users to manage governorates" on public.governorates;
drop policy if exists "Users can manage inventory" on public.inventory;
drop policy if exists "Allow all authenticated users to manage main categories" on public.main_categories;
drop policy if exists "Allow all users to manage neighborhoods" on public.neighborhoods;
drop policy if exists "Users can manage all products" on public.products;
drop policy if exists "Enable all access for all users" on public.special_offers;
drop policy if exists "Allow all authenticated users to manage subcategories" on public.subcategories;

-- Defense in depth: storefront anon keeps the reads it needs, but direct writes
-- to catalogue/configuration/inventory tables are not granted.
revoke insert, update, delete on public.areas from anon;
revoke insert, update, delete on public.branch_neighborhoods from anon;
revoke insert, update, delete on public.branches from anon;
revoke insert, update, delete on public.cities from anon;
revoke insert, update, delete on public.companies from anon;
revoke insert, update, delete on public.delivery_type_pricing from anon;
revoke insert, update, delete on public.delivery_types from anon;
revoke insert, update, delete on public.franchise_settings from anon;
revoke insert, update, delete on public.governorates from anon;
revoke insert, update, delete on public.inventory from anon;
revoke insert, update, delete on public.main_categories from anon;
revoke insert, update, delete on public.neighborhoods from anon;
revoke insert, update, delete on public.products from anon;
revoke insert, update, delete on public.special_offers from anon;
revoke insert, update, delete on public.subcategories from anon;

-- ---------------------------------------------------------------------------
-- 2. Replace legacy broad writes with staff/permission scoped writes
-- ---------------------------------------------------------------------------

drop policy if exists "security_p0_staff_manage_companies" on public.companies;
create policy "security_p0_staff_manage_companies"
on public.companies
for all to authenticated
using (
  public.is_admin()
  or public.is_super_admin()
  or public.staff_has_any_branch_permission('products.manage')
  or public.staff_has_any_branch_permission('purchases.manage')
)
with check (
  public.is_admin()
  or public.is_super_admin()
  or public.staff_has_any_branch_permission('products.manage')
  or public.staff_has_any_branch_permission('purchases.manage')
);

drop policy if exists "security_p0_staff_manage_delivery_types" on public.delivery_types;
create policy "security_p0_staff_manage_delivery_types"
on public.delivery_types
for all to authenticated
using (
  public.is_admin()
  or public.is_super_admin()
  or public.staff_has_any_branch_permission('branch.manage_settings')
  or public.staff_has_any_branch_permission('pricing.manage')
)
with check (
  public.is_admin()
  or public.is_super_admin()
  or public.staff_has_any_branch_permission('branch.manage_settings')
  or public.staff_has_any_branch_permission('pricing.manage')
);

drop policy if exists "security_p0_staff_manage_delivery_type_pricing" on public.delivery_type_pricing;
create policy "security_p0_staff_manage_delivery_type_pricing"
on public.delivery_type_pricing
for all to authenticated
using (
  public.is_admin()
  or public.is_super_admin()
  or public.staff_has_any_branch_permission('branch.manage_settings')
  or public.staff_has_any_branch_permission('pricing.manage')
)
with check (
  public.is_admin()
  or public.is_super_admin()
  or public.staff_has_any_branch_permission('branch.manage_settings')
  or public.staff_has_any_branch_permission('pricing.manage')
);

drop policy if exists "security_p0_staff_manage_main_categories" on public.main_categories;
create policy "security_p0_staff_manage_main_categories"
on public.main_categories
for all to authenticated
using (
  public.is_admin()
  or public.is_super_admin()
  or public.staff_has_any_branch_permission('products.manage')
)
with check (
  public.is_admin()
  or public.is_super_admin()
  or public.staff_has_any_branch_permission('products.manage')
);

drop policy if exists "security_p0_staff_manage_subcategories" on public.subcategories;
create policy "security_p0_staff_manage_subcategories"
on public.subcategories
for all to authenticated
using (
  public.is_admin()
  or public.is_super_admin()
  or public.staff_has_any_branch_permission('products.manage')
)
with check (
  public.is_admin()
  or public.is_super_admin()
  or public.staff_has_any_branch_permission('products.manage')
);

drop policy if exists "security_p0_staff_manage_products" on public.products;
create policy "security_p0_staff_manage_products"
on public.products
for all to authenticated
using (
  public.is_admin()
  or public.is_super_admin()
  or public.staff_has_any_branch_permission('products.manage')
)
with check (
  public.is_admin()
  or public.is_super_admin()
  or public.staff_has_any_branch_permission('products.manage')
);

drop policy if exists "security_p0_staff_manage_special_offers" on public.special_offers;
create policy "security_p0_staff_manage_special_offers"
on public.special_offers
for all to authenticated
using (
  public.is_admin()
  or public.is_super_admin()
  or public.staff_has_any_branch_permission('pricing.manage')
  or public.staff_has_any_branch_permission('products.manage')
)
with check (
  public.is_admin()
  or public.is_super_admin()
  or public.staff_has_any_branch_permission('pricing.manage')
  or public.staff_has_any_branch_permission('products.manage')
);

-- ---------------------------------------------------------------------------
-- 3. Storage: remove broad public mutation policies
-- ---------------------------------------------------------------------------

drop policy if exists "Give users access to all files" on storage.objects;
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Allow all users to delete from products bucket" on storage.objects;
drop policy if exists "Allow all users to upload to products bucket" on storage.objects;
drop policy if exists "Allow all users to update products bucket" on storage.objects;
drop policy if exists "Anyone can upload store files" on storage.objects;
drop policy if exists "Authenticated users can delete their own store files" on storage.objects;
drop policy if exists "Authenticated users can update their own store files" on storage.objects;
drop policy if exists "Allow authenticated users to upload images" on storage.objects;

-- Public storefront assets remain readable.
drop policy if exists "security_p0_public_asset_read" on storage.objects;
create policy "security_p0_public_asset_read"
on storage.objects
for select to public
using (bucket_id in ('banners','images','products','store','store_assets'));

-- Asset mutations require a real active staff account. More granular permissions
-- can be layered on later without reopening anonymous writes.
drop policy if exists "security_p0_staff_product_assets_insert" on storage.objects;
create policy "security_p0_staff_product_assets_insert"
on storage.objects
for insert to authenticated
with check (bucket_id in ('products','images') and private.is_active_staff());

drop policy if exists "security_p0_staff_product_assets_update" on storage.objects;
create policy "security_p0_staff_product_assets_update"
on storage.objects
for update to authenticated
using (bucket_id in ('products','images') and private.is_active_staff())
with check (bucket_id in ('products','images') and private.is_active_staff());

drop policy if exists "security_p0_staff_product_assets_delete" on storage.objects;
create policy "security_p0_staff_product_assets_delete"
on storage.objects
for delete to authenticated
using (bucket_id in ('products','images') and private.is_active_staff());

drop policy if exists "security_p0_staff_banner_assets_insert" on storage.objects;
create policy "security_p0_staff_banner_assets_insert"
on storage.objects
for insert to authenticated
with check (bucket_id='banners' and private.is_active_staff());

drop policy if exists "security_p0_staff_banner_assets_update" on storage.objects;
create policy "security_p0_staff_banner_assets_update"
on storage.objects
for update to authenticated
using (bucket_id='banners' and private.is_active_staff())
with check (bucket_id='banners' and private.is_active_staff());

drop policy if exists "security_p0_staff_banner_assets_delete" on storage.objects;
create policy "security_p0_staff_banner_assets_delete"
on storage.objects
for delete to authenticated
using (bucket_id='banners' and private.is_active_staff());

drop policy if exists "security_p0_staff_store_assets_insert" on storage.objects;
create policy "security_p0_staff_store_assets_insert"
on storage.objects
for insert to authenticated
with check (bucket_id in ('store','store_assets') and private.is_active_staff());

drop policy if exists "security_p0_staff_store_assets_update" on storage.objects;
create policy "security_p0_staff_store_assets_update"
on storage.objects
for update to authenticated
using (bucket_id in ('store','store_assets') and private.is_active_staff())
with check (bucket_id in ('store','store_assets') and private.is_active_staff());

drop policy if exists "security_p0_staff_store_assets_delete" on storage.objects;
create policy "security_p0_staff_store_assets_delete"
on storage.objects
for delete to authenticated
using (bucket_id in ('store','store_assets') and private.is_active_staff());

-- NOTE: the returns bucket intentionally stays compatible with the current
-- customer-app flow, which stores return images and calls getPublicUrl().
-- A separate coordinated migration will make returns private after the app
-- switches to path-based references/signed URLs.
