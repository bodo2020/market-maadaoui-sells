with legacy_candidates as (
  select p.*
  from public.products p
  where coalesce(p.bulk_enabled,false)
    and coalesce(p.bulk_quantity,0)>0
    and coalesce(p.bulk_price,0)>0
    and nullif(btrim(p.bulk_barcode),'') is not null
    and not exists (
      select 1 from public.products p2
      where p2.id<>p.id
        and (p2.barcode=p.bulk_barcode or p2.bulk_barcode=p.bulk_barcode)
    )
    and not exists (
      select 1 from public.product_variants pv
      where pv.barcode=p.bulk_barcode or pv.bulk_barcode=p.bulk_barcode
    )
    and not exists (
      select 1 from public.products dup
      where dup.id<>p.id and dup.bulk_barcode=p.bulk_barcode
    )
), inserted as (
  insert into public.product_variants(
    parent_product_id,
    name,
    variant_type,
    price,
    purchase_price,
    conversion_factor,
    barcode,
    image_url,
    active,
    position
  )
  select
    p.id,
    p.name || ' - جملة',
    'جملة',
    p.bulk_price,
    round(coalesce(p.purchase_price,0) * p.bulk_quantity,2),
    p.bulk_quantity,
    p.bulk_barcode,
    p.image_urls[1],
    true,
    0
  from legacy_candidates p
  returning parent_product_id
)
update public.products p
set has_variants=true,
    updated_at=now()
where p.id in (select parent_product_id from inserted);

comment on table public.product_variants is 'Linked sale units/variants. Legacy bulk products are migrated here while legacy bulk_* columns remain temporarily for backward compatibility.';
