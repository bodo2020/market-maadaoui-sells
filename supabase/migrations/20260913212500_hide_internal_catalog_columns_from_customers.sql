-- Customer/guest storefront access uses redacted SECURITY DEFINER RPCs.
-- Direct reads of internal product/variant/branch rows are staff-only because
-- those tables contain purchase prices, shelf locations and franchise terms.

create or replace function public.get_my_return_request_items_v1(p_return_request_id uuid)
returns setof jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
begin
  if v_uid is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;

  if not exists(
    select 1 from public.return_requests rr
    where rr.id=p_return_request_id and rr.user_id=v_uid
  ) then
    raise exception using errcode='42501',message='RETURN_REQUEST_ACCESS_DENIED';
  end if;

  return query
  select jsonb_build_object(
    'id',ri.id,
    'return_request_id',ri.return_request_id,
    'product_id',ri.product_id,
    'quantity',ri.quantity,
    'reason',ri.reason,
    'created_at',ri.created_at,
    'products',jsonb_build_object(
      'id',p.id,
      'name',p.name,
      'image_urls',coalesce(to_jsonb(p.image_urls),'[]'::jsonb)
    )
  )
  from public.return_request_items ri
  join public.products p on p.id=ri.product_id
  where ri.return_request_id=p_return_request_id
  order by ri.created_at asc,ri.id;
end;
$$;

revoke all on function public.get_my_return_request_items_v1(uuid) from public, anon;
grant execute on function public.get_my_return_request_items_v1(uuid) to authenticated, service_role;

-- Products: purchase_price, shelf_location and archive metadata are internal.
drop policy if exists "Users can view all products" on public.products;
drop policy if exists "security_customer_products_staff_read" on public.products;
create policy "security_customer_products_staff_read"
on public.products
for select to authenticated
using (private.is_active_staff());
revoke select on public.products from anon;

-- Product variants also contain purchase_price.
drop policy if exists "Anyone can view product variants" on public.product_variants;
drop policy if exists "security_customer_product_variants_staff_read" on public.product_variants;
create policy "security_customer_product_variants_staff_read"
on public.product_variants
for select to authenticated
using (private.is_active_staff());
revoke select on public.product_variants from anon;

-- Branch rows contain commission/monthly contract fields.
drop policy if exists "Branches are viewable by everyone" on public.branches;
drop policy if exists "security_customer_branches_staff_read" on public.branches;
create policy "security_customer_branches_staff_read"
on public.branches
for select to authenticated
using (private.is_active_staff());
revoke select on public.branches from anon;
