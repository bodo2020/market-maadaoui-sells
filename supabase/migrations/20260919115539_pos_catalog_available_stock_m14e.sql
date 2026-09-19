-- M14e — POS catalog exposes/uses available stock
CREATE OR REPLACE FUNCTION public.get_pos_branch_catalog(p_branch_id uuid, p_search text DEFAULT NULL::text, p_barcode text DEFAULT NULL::text, p_limit integer DEFAULT 2000)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inventory_branch uuid;
  v_pricing_branch uuid;
  v_barcode text := nullif(btrim(p_barcode),'');
  v_scale_product_barcode text;
  v_scale_weight numeric;
  v_variant_rows integer := 0;
begin
  if auth.uid() is null or p_branch_id is null or not (
    private.can_operate_cash_branch(p_branch_id) or private.can_manage_inventory_branch(p_branch_id)
  ) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;

  select s.inventory_branch_id,s.pricing_branch_id
    into v_inventory_branch,v_pricing_branch
  from private.resolve_branch_sources(p_branch_id) s;

  -- Exact linked-sale-unit barcode match. The POS sees the unit as its own
  -- catalogue product (variant UUID) and preflight later canonicalizes it to
  -- the base product + conversion factor before checkout.
  if v_barcode is not null then
    return query
    select to_jsonb(p)
      || jsonb_build_object(
        'id',pv.id,
        'name',pv.name,
        'image_urls',case when pv.image_url is not null then jsonb_build_array(pv.image_url) else to_jsonb(coalesce(p.image_urls,'{}'::text[])) end,
        'quantity',floor(private.inventory_available_quantity_v1(v_inventory_branch,p.id)/nullif(pv.conversion_factor,0)),
        'base_quantity',private.inventory_available_quantity_v1(v_inventory_branch,p.id),
        'base_on_hand_quantity',coalesce(i.quantity,0),
        'reserved_quantity',private.inventory_reserved_quantity_v1(v_inventory_branch,p.id),
        'min_stock_level',floor(coalesce(i.min_stock_level,5)/nullif(pv.conversion_factor,0)),
        'price',pv.price,
        'purchase_price',case when coalesce(pv.purchase_price,0)>0 then pv.purchase_price else coalesce(bp.purchase_price,p.purchase_price,0)*pv.conversion_factor end,
        'offer_price',null,
        'is_offer',false,
        'barcode',coalesce(pv.barcode,pv.bulk_barcode),
        'barcode_type','normal',
        'bulk_enabled',false,
        'bulk_quantity',null,
        'bulk_price',null,
        'bulk_barcode',null,
        'is_bulk',false,
        'is_linked_sale_unit',true,
        'variant_id',pv.id,
        'parent_product_id',p.id,
        'conversion_factor',pv.conversion_factor,
        'variant_type',pv.variant_type,
        'variant_price',pv.price,
        'variant_purchase_price',pv.purchase_price,
        'variant_image_url',pv.image_url,
        'unit_of_measure',pv.variant_type,
        'operational_branch_id',p_branch_id,
        'inventory_branch_id',v_inventory_branch,
        'pricing_branch_id',v_pricing_branch
      )
    from public.product_variants pv
    join public.products p on p.id=pv.parent_product_id
    join public.inventory i on i.product_id=p.id and i.branch_id=v_inventory_branch
    left join public.branch_product_pricing bp on bp.product_id=p.id and bp.branch_id=v_pricing_branch
    where pv.active
      and (pv.barcode=v_barcode or pv.bulk_barcode=v_barcode)
    order by pv.position,pv.name,pv.id
    limit 1;

    get diagnostics v_variant_rows = row_count;
    if v_variant_rows>0 then return; end if;
  end if;

  if v_barcode ~ '^\d{11,12}$'
     and (left(v_barcode,2)='02' or left(v_barcode,1)='2') then
    v_scale_product_barcode := lpad(substr(v_barcode,3,4),6,'0');
    v_scale_weight := substr(v_barcode,7,5)::numeric / 1000;
    if v_scale_weight <= 0 or v_scale_weight > 100 then
      v_scale_product_barcode := null;
      v_scale_weight := null;
    end if;
  end if;

  -- Exact base/scale barcode lookup keeps the lean direct path.
  if v_barcode is not null then
    return query
    select to_jsonb(p)
      || jsonb_build_object(
        'quantity',private.inventory_available_quantity_v1(v_inventory_branch,p.id),
        'on_hand_quantity',coalesce(i.quantity,0),
        'reserved_quantity',private.inventory_reserved_quantity_v1(v_inventory_branch,p.id),
        'min_stock_level',coalesce(i.min_stock_level,5),
        'price',coalesce(bp.sale_price,p.price),
        'purchase_price',coalesce(bp.purchase_price,p.purchase_price),
        'offer_price',case when bp.id is not null then bp.offer_price else p.offer_price end,
        'is_offer',case when bp.id is not null then coalesce(bp.is_offer,false) else coalesce(p.is_offer,false) end,
        'has_custom_pricing',bp.id is not null,
        'operational_branch_id',p_branch_id,
        'inventory_branch_id',v_inventory_branch,
        'pricing_branch_id',v_pricing_branch
      )
      || case
        when v_scale_product_barcode is not null
         and p.barcode=v_scale_product_barcode
         and p.barcode_type='scale'
        then jsonb_build_object(
          'calculated_weight',round(v_scale_weight,3),
          'calculated_price',round(
            (case
              when (case when bp.id is not null then coalesce(bp.is_offer,false) else coalesce(p.is_offer,false) end)
               and (case when bp.id is not null then bp.offer_price else p.offer_price end) is not null
              then (case when bp.id is not null then bp.offer_price else p.offer_price end)
              else coalesce(bp.sale_price,p.price)
            end) * v_scale_weight,
            2
          )
        )
        else '{}'::jsonb
      end
    from public.products p
    join public.inventory i on i.product_id=p.id and i.branch_id=v_inventory_branch
    left join public.branch_product_pricing bp on bp.product_id=p.id and bp.branch_id=v_pricing_branch
    where p.barcode=v_barcode
       or p.bulk_barcode=v_barcode
       or (v_scale_product_barcode is not null and p.barcode=v_scale_product_barcode and p.barcode_type='scale')
    order by case when p.barcode=v_barcode or p.bulk_barcode=v_barcode then 0 else 1 end,p.name,p.id
    limit greatest(1,least(coalesce(p_limit,2000),5000));
    return;
  end if;

  -- Browse/search combines base products and linked sale units. A linked unit
  -- has a unique variant UUID, own image/name/price and package-level stock.
  return query
  with catalog_rows as (
    select
      0 as kind_order,
      p.name as sort_name,
      to_jsonb(p)
        || jsonb_build_object(
          'quantity',private.inventory_available_quantity_v1(v_inventory_branch,p.id),
        'on_hand_quantity',coalesce(i.quantity,0),
        'reserved_quantity',private.inventory_reserved_quantity_v1(v_inventory_branch,p.id),
          'min_stock_level',coalesce(i.min_stock_level,5),
          'price',coalesce(bp.sale_price,p.price),
          'purchase_price',coalesce(bp.purchase_price,p.purchase_price),
          'offer_price',case when bp.id is not null then bp.offer_price else p.offer_price end,
          'is_offer',case when bp.id is not null then coalesce(bp.is_offer,false) else coalesce(p.is_offer,false) end,
          'has_custom_pricing',bp.id is not null,
          'is_linked_sale_unit',false,
          'operational_branch_id',p_branch_id,
          'inventory_branch_id',v_inventory_branch,
          'pricing_branch_id',v_pricing_branch
        ) as item
    from public.products p
    join public.inventory i on i.product_id=p.id and i.branch_id=v_inventory_branch
    left join public.branch_product_pricing bp on bp.product_id=p.id and bp.branch_id=v_pricing_branch
    where p_search is null or btrim(p_search)='' or p.name ilike '%'||btrim(p_search)||'%' or p.barcode ilike '%'||btrim(p_search)||'%' or p.bulk_barcode ilike '%'||btrim(p_search)||'%'

    union all

    select
      1 as kind_order,
      pv.name as sort_name,
      to_jsonb(p)
        || jsonb_build_object(
          'id',pv.id,
          'name',pv.name,
          'image_urls',case when pv.image_url is not null then jsonb_build_array(pv.image_url) else to_jsonb(coalesce(p.image_urls,'{}'::text[])) end,
          'quantity',floor(private.inventory_available_quantity_v1(v_inventory_branch,p.id)/nullif(pv.conversion_factor,0)),
          'base_quantity',private.inventory_available_quantity_v1(v_inventory_branch,p.id),
        'base_on_hand_quantity',coalesce(i.quantity,0),
        'reserved_quantity',private.inventory_reserved_quantity_v1(v_inventory_branch,p.id),
          'min_stock_level',floor(coalesce(i.min_stock_level,5)/nullif(pv.conversion_factor,0)),
          'price',pv.price,
          'purchase_price',case when coalesce(pv.purchase_price,0)>0 then pv.purchase_price else coalesce(bp.purchase_price,p.purchase_price,0)*pv.conversion_factor end,
          'offer_price',null,
          'is_offer',false,
          'barcode',coalesce(pv.barcode,pv.bulk_barcode),
          'barcode_type','normal',
          'bulk_enabled',false,
          'bulk_quantity',null,
          'bulk_price',null,
          'bulk_barcode',null,
          'is_bulk',false,
          'is_linked_sale_unit',true,
          'variant_id',pv.id,
          'parent_product_id',p.id,
          'conversion_factor',pv.conversion_factor,
          'variant_type',pv.variant_type,
          'variant_price',pv.price,
          'variant_purchase_price',pv.purchase_price,
          'variant_image_url',pv.image_url,
          'unit_of_measure',pv.variant_type,
          'operational_branch_id',p_branch_id,
          'inventory_branch_id',v_inventory_branch,
          'pricing_branch_id',v_pricing_branch
        ) as item
    from public.product_variants pv
    join public.products p on p.id=pv.parent_product_id
    join public.inventory i on i.product_id=p.id and i.branch_id=v_inventory_branch
    left join public.branch_product_pricing bp on bp.product_id=p.id and bp.branch_id=v_pricing_branch
    where pv.active
      and (p_search is null or btrim(p_search)='' or pv.name ilike '%'||btrim(p_search)||'%' or pv.barcode ilike '%'||btrim(p_search)||'%' or pv.bulk_barcode ilike '%'||btrim(p_search)||'%' or p.name ilike '%'||btrim(p_search)||'%')
  )
  select item
  from catalog_rows
  order by kind_order,sort_name
  limit greatest(1,least(coalesce(p_limit,2000),5000));
end;
$function$;
