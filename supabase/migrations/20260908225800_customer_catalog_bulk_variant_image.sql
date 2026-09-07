create or replace function public.get_customer_branch_catalog(
  p_branch_id uuid,
  p_product_id uuid default null,
  p_main_category_id uuid default null,
  p_subcategory_id uuid default null,
  p_company_id uuid default null,
  p_search text default null,
  p_barcode text default null,
  p_limit integer default 500
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inventory_branch uuid;
  v_pricing_branch uuid;
begin
  if p_branch_id is null then
    raise exception using errcode='22023',message='DELIVERY_ADDRESS_REQUIRED';
  end if;

  select s.inventory_branch_id,s.pricing_branch_id
    into v_inventory_branch,v_pricing_branch
  from private.resolve_branch_sources(p_branch_id) s;

  return query
  select
    (to_jsonb(p)
      - 'purchase_price'
      - 'expiry_date'
      - 'shelf_location'
      - 'track_expiry')
    || jsonb_build_object(
      'quantity',i.quantity,
      'price',coalesce(bp.sale_price,p.price),
      'offer_price',case when bp.id is not null then bp.offer_price else p.offer_price end,
      'is_offer',case when bp.id is not null then coalesce(bp.is_offer,false) else coalesce(p.is_offer,false) end,
      'bulk_enabled',coalesce(p.bulk_enabled,false) and coalesce(p.bulk_quantity,0)>0 and i.quantity>=coalesce(p.bulk_quantity,0),
      'bulk_image_url',bv.image_url,
      'bulk_variant_id',bv.id,
      'delivery_branch_id',p_branch_id,
      'inventory_branch_id',v_inventory_branch,
      'pricing_branch_id',v_pricing_branch
    )
  from public.products p
  join public.inventory i
    on i.product_id=p.id
   and i.branch_id=v_inventory_branch
   and i.quantity>0
  left join public.branch_product_pricing bp
    on bp.product_id=p.id
   and bp.branch_id=v_pricing_branch
  left join lateral (
    select pv.id,pv.image_url
    from public.product_variants pv
    where pv.parent_product_id=p.id
      and pv.active=true
      and (
        (nullif(btrim(coalesce(p.bulk_barcode,'')),'') is not null and pv.barcode=p.bulk_barcode)
        or (coalesce(p.bulk_quantity,0)>0 and pv.conversion_factor=p.bulk_quantity)
      )
    order by
      case when nullif(btrim(coalesce(p.bulk_barcode,'')),'') is not null and pv.barcode=p.bulk_barcode then 0 else 1 end,
      pv.position asc nulls last,
      pv.created_at asc nulls last,
      pv.id
    limit 1
  ) bv on true
  where (p_product_id is null or p.id=p_product_id)
    and (p_main_category_id is null or p.main_category_id=p_main_category_id)
    and (p_subcategory_id is null or p.subcategory_id=p_subcategory_id)
    and (p_company_id is null or p.company_id=p_company_id)
    and (p_search is null or btrim(p_search)='' or p.name ilike '%'||btrim(p_search)||'%')
    and (p_barcode is null or btrim(p_barcode)='' or p.barcode=btrim(p_barcode) or p.bulk_barcode=btrim(p_barcode))
  order by p.created_at desc nulls last,p.id
  limit greatest(1,least(coalesce(p_limit,500),1000));
end;
$$;

revoke all on function public.get_customer_branch_catalog(uuid,uuid,uuid,uuid,uuid,text,text,integer) from public;
grant execute on function public.get_customer_branch_catalog(uuid,uuid,uuid,uuid,uuid,text,text,integer) to anon,authenticated,service_role;
