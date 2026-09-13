-- Public storefront assets remain readable, but only the staff roles responsible
-- for each content area may create, replace or delete them.

-- Banners / home content
drop policy if exists "security_p0_staff_banner_assets_insert" on storage.objects;
drop policy if exists "security_p0_staff_banner_assets_update" on storage.objects;
drop policy if exists "security_p0_staff_banner_assets_delete" on storage.objects;

create policy "security_p0_staff_banner_assets_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='banners'
  and (
    public.is_admin() or public.is_super_admin()
    or public.staff_has_any_branch_permission('growth_console.banners.manage')
    or public.staff_has_any_branch_permission('home_content.manage')
  )
);

create policy "security_p0_staff_banner_assets_update"
on storage.objects for update to authenticated
using (
  bucket_id='banners'
  and (
    public.is_admin() or public.is_super_admin()
    or public.staff_has_any_branch_permission('growth_console.banners.manage')
    or public.staff_has_any_branch_permission('home_content.manage')
  )
)
with check (
  bucket_id='banners'
  and (
    public.is_admin() or public.is_super_admin()
    or public.staff_has_any_branch_permission('growth_console.banners.manage')
    or public.staff_has_any_branch_permission('home_content.manage')
  )
);

create policy "security_p0_staff_banner_assets_delete"
on storage.objects for delete to authenticated
using (
  bucket_id='banners'
  and (
    public.is_admin() or public.is_super_admin()
    or public.staff_has_any_branch_permission('growth_console.banners.manage')
    or public.staff_has_any_branch_permission('home_content.manage')
  )
);

-- Product media
drop policy if exists "security_p0_staff_product_assets_insert" on storage.objects;
drop policy if exists "security_p0_staff_product_assets_update" on storage.objects;
drop policy if exists "security_p0_staff_product_assets_delete" on storage.objects;

create policy "security_p0_staff_product_assets_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id=any(array['products'::text,'images'::text])
  and (
    public.is_admin() or public.is_super_admin()
    or public.staff_has_any_branch_permission('products.manage')
  )
);

create policy "security_p0_staff_product_assets_update"
on storage.objects for update to authenticated
using (
  bucket_id=any(array['products'::text,'images'::text])
  and (
    public.is_admin() or public.is_super_admin()
    or public.staff_has_any_branch_permission('products.manage')
  )
)
with check (
  bucket_id=any(array['products'::text,'images'::text])
  and (
    public.is_admin() or public.is_super_admin()
    or public.staff_has_any_branch_permission('products.manage')
  )
);

create policy "security_p0_staff_product_assets_delete"
on storage.objects for delete to authenticated
using (
  bucket_id=any(array['products'::text,'images'::text])
  and (
    public.is_admin() or public.is_super_admin()
    or public.staff_has_any_branch_permission('products.manage')
  )
);

-- Store identity / branch assets
drop policy if exists "security_p0_staff_store_assets_insert" on storage.objects;
drop policy if exists "security_p0_staff_store_assets_update" on storage.objects;
drop policy if exists "security_p0_staff_store_assets_delete" on storage.objects;

create policy "security_p0_staff_store_assets_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id=any(array['store'::text,'store_assets'::text])
  and (
    public.is_admin() or public.is_super_admin()
    or public.staff_has_any_branch_permission('branch.manage_settings')
  )
);

create policy "security_p0_staff_store_assets_update"
on storage.objects for update to authenticated
using (
  bucket_id=any(array['store'::text,'store_assets'::text])
  and (
    public.is_admin() or public.is_super_admin()
    or public.staff_has_any_branch_permission('branch.manage_settings')
  )
)
with check (
  bucket_id=any(array['store'::text,'store_assets'::text])
  and (
    public.is_admin() or public.is_super_admin()
    or public.staff_has_any_branch_permission('branch.manage_settings')
  )
);

create policy "security_p0_staff_store_assets_delete"
on storage.objects for delete to authenticated
using (
  bucket_id=any(array['store'::text,'store_assets'::text])
  and (
    public.is_admin() or public.is_super_admin()
    or public.staff_has_any_branch_permission('branch.manage_settings')
  )
);
