-- M14c — customer catalog exposes sellable stock (on-hand minus reserved)
CREATE OR REPLACE FUNCTION public.get_customer_branch_catalog_core_v1(p_branch_id uuid, p_product_id uuid DEFAULT NULL::uuid, p_main_category_id uuid DEFAULT NULL::uuid, p_subcategory_id uuid DEFAULT NULL::uuid, p_company_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_barcode text DEFAULT NULL::text, p_limit integer DEFAULT 500)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      'quantity',private.inventory_available_quantity_v1(v_inventory_branch,p.id),
      'price',coalesce(bp.sale_price,p.price),
      'offer_price',case when bp.id is not null then bp.offer_price else p.offer_price end,
      'is_offer',case when bp.id is not null then coalesce(bp.is_offer,false) else coalesce(p.is_offer,false) end,
      'bulk_enabled',case
        when bv.id is not null then coalesce(bv.conversion_factor,0)>0 and (p_product_id is not null or private.inventory_available_quantity_v1(v_inventory_branch,p.id)>=bv.conversion_factor)
        else coalesce(p.bulk_enabled,false) and coalesce(p.bulk_quantity,0)>0 and (p_product_id is not null or private.inventory_available_quantity_v1(v_inventory_branch,p.id)>=coalesce(p.bulk_quantity,0))
      end,
      'bulk_quantity',coalesce(bv.conversion_factor,p.bulk_quantity),
      'bulk_price',coalesce(bv.price,p.bulk_price),
      'bulk_barcode',coalesce(bv.barcode,p.bulk_barcode),
      'bulk_name',bv.name,
      'bulk_image_url',bv.image_url,
      'bulk_variant_id',bv.id,
      'bulk_variant_type',bv.variant_type,
      'delivery_branch_id',p_branch_id,
      'inventory_branch_id',v_inventory_branch,
      'pricing_branch_id',v_pricing_branch,
      'commerce_source','owned',
      'catalog_scope','elmadawy'
    )
  from public.products p
  left join public.inventory i
    on i.product_id=p.id
   and i.branch_id=v_inventory_branch
  left join public.branch_product_pricing bp
    on bp.product_id=p.id
   and bp.branch_id=v_pricing_branch
  left join lateral (
    select pv.id,pv.name,pv.image_url,pv.conversion_factor,pv.price,pv.barcode,pv.variant_type,pv.position,pv.created_at
    from public.product_variants pv
    where pv.parent_product_id=p.id
      and pv.active=true
      and coalesce(pv.conversion_factor,0)>1
    order by
      case when nullif(btrim(coalesce(p.bulk_barcode,'')),'') is not null and pv.barcode=p.bulk_barcode then 0 else 1 end,
      case when coalesce(p.bulk_quantity,0)>0 and pv.conversion_factor=p.bulk_quantity then 0 else 1 end,
      case when pv.variant_type='جملة' then 0 else 1 end,
      pv.position asc nulls last,
      pv.created_at asc nulls last,
      pv.id
    limit 1
  ) bv on true
  where p.catalog_scope='elmadawy'
    and p.owner_merchant_id is null
    and p.archived_at is null
    and (p_product_id is null or p.id=p_product_id)
    and (p_product_id is not null or private.inventory_available_quantity_v1(v_inventory_branch,p.id)>0)
    and (p_main_category_id is null or p.main_category_id=p_main_category_id)
    and (p_subcategory_id is null or p.subcategory_id=p_subcategory_id)
    and (p_company_id is null or p.company_id=p_company_id)
    and (
      p_search is null or btrim(p_search)='' or
      p.name ilike '%'||btrim(p_search)||'%' or
      coalesce(bv.name,'') ilike '%'||btrim(p_search)||'%'
    )
    and (
      p_barcode is null or btrim(p_barcode)='' or
      p.barcode=btrim(p_barcode) or
      coalesce(bv.barcode,p.bulk_barcode)=btrim(p_barcode)
    )
  order by p.created_at desc nulls last,p.id
  limit greatest(1,least(coalesce(p_limit,500),1000));
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_branch_favorite_products_v1(p_branch_id uuid, p_product_ids uuid[])
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inventory_branch uuid;
  v_pricing_branch uuid;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;
  if p_branch_id is null then
    raise exception using errcode='22023', message='DELIVERY_ADDRESS_REQUIRED';
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
      'quantity',private.inventory_available_quantity_v1(v_inventory_branch,p.id),
      'price',coalesce(bp.sale_price,p.price),
      'offer_price',case when bp.id is not null then bp.offer_price else p.offer_price end,
      'is_offer',case when bp.id is not null then coalesce(bp.is_offer,false) else coalesce(p.is_offer,false) end,
      'bulk_enabled',case
        when bv.id is not null then coalesce(bv.conversion_factor,0)>0
        else coalesce(p.bulk_enabled,false) and coalesce(p.bulk_quantity,0)>0
      end,
      'bulk_quantity',coalesce(bv.conversion_factor,p.bulk_quantity),
      'bulk_price',coalesce(bv.price,p.bulk_price),
      'bulk_barcode',coalesce(bv.barcode,p.bulk_barcode),
      'bulk_name',bv.name,
      'bulk_image_url',bv.image_url,
      'bulk_variant_id',bv.id,
      'bulk_variant_type',bv.variant_type,
      'delivery_branch_id',p_branch_id,
      'inventory_branch_id',v_inventory_branch,
      'pricing_branch_id',v_pricing_branch
    )
  from public.products p
  left join public.inventory i
    on i.product_id=p.id
   and i.branch_id=v_inventory_branch
  left join public.branch_product_pricing bp
    on bp.product_id=p.id
   and bp.branch_id=v_pricing_branch
  left join lateral (
    select pv.id,pv.name,pv.image_url,pv.conversion_factor,pv.price,pv.barcode,pv.variant_type,pv.position,pv.created_at
    from public.product_variants pv
    where pv.parent_product_id=p.id
      and pv.active=true
      and coalesce(pv.conversion_factor,0)>1
    order by
      case when nullif(btrim(coalesce(p.bulk_barcode,'')),'') is not null and pv.barcode=p.bulk_barcode then 0 else 1 end,
      case when coalesce(p.bulk_quantity,0)>0 and pv.conversion_factor=p.bulk_quantity then 0 else 1 end,
      case when pv.variant_type='جملة' then 0 else 1 end,
      pv.position asc nulls last,
      pv.created_at asc nulls last,
      pv.id
    limit 1
  ) bv on true
  where p.id=any(coalesce(p_product_ids,'{}'::uuid[]))
  order by p.created_at desc nulls last,p.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_branch_product_any_stock_v1(p_branch_id uuid, p_product_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inventory_branch uuid;
  v_pricing_branch uuid;
  v_result jsonb;
begin
  if p_branch_id is null or p_product_id is null then
    raise exception using errcode='22023',message='INVALID_PRODUCT_LOOKUP';
  end if;

  select s.inventory_branch_id,s.pricing_branch_id
    into v_inventory_branch,v_pricing_branch
  from private.resolve_branch_sources(p_branch_id) s;

  select
    (to_jsonb(p)
      - 'purchase_price'
      - 'expiry_date'
      - 'shelf_location'
      - 'track_expiry')
    || jsonb_build_object(
      'quantity',private.inventory_available_quantity_v1(v_inventory_branch,p.id),
      'price',coalesce(bp.sale_price,p.price),
      'offer_price',case when bp.id is not null then bp.offer_price else p.offer_price end,
      'is_offer',case when bp.id is not null then coalesce(bp.is_offer,false) else coalesce(p.is_offer,false) end,
      'bulk_enabled',case
        when bv.id is not null then coalesce(bv.conversion_factor,0)>0
        else coalesce(p.bulk_enabled,false) and coalesce(p.bulk_quantity,0)>0
      end,
      'bulk_quantity',coalesce(bv.conversion_factor,p.bulk_quantity),
      'bulk_price',coalesce(bv.price,p.bulk_price),
      'bulk_barcode',coalesce(bv.barcode,p.bulk_barcode),
      'bulk_name',bv.name,
      'bulk_image_url',bv.image_url,
      'bulk_variant_id',bv.id,
      'bulk_variant_type',bv.variant_type,
      'delivery_branch_id',p_branch_id,
      'inventory_branch_id',v_inventory_branch,
      'pricing_branch_id',v_pricing_branch,
      'commerce_source','owned',
      'catalog_scope','elmadawy'
    ) into v_result
  from public.products p
  left join public.inventory i
    on i.product_id=p.id and i.branch_id=v_inventory_branch
  left join public.branch_product_pricing bp
    on bp.product_id=p.id and bp.branch_id=v_pricing_branch
  left join lateral (
    select pv.id,pv.name,pv.image_url,pv.conversion_factor,pv.price,pv.barcode,pv.variant_type,pv.position,pv.created_at
    from public.product_variants pv
    where pv.parent_product_id=p.id
      and pv.active=true
      and coalesce(pv.conversion_factor,0)>1
    order by
      case when nullif(btrim(coalesce(p.bulk_barcode,'')),'') is not null and pv.barcode=p.bulk_barcode then 0 else 1 end,
      case when coalesce(p.bulk_quantity,0)>0 and pv.conversion_factor=p.bulk_quantity then 0 else 1 end,
      case when pv.variant_type='جملة' then 0 else 1 end,
      pv.position asc nulls last,
      pv.created_at asc nulls last,
      pv.id
    limit 1
  ) bv on true
  where p.id=p_product_id
    and p.catalog_scope='elmadawy'
    and p.owner_merchant_id is null
    and p.archived_at is null;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_marketplace_store_catalog_v2(p_branch_id uuid, p_product_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 200)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (
    select 1
    from public.branches b
    join public.merchants m on m.id=b.merchant_id
    where b.id=p_branch_id
      and b.marketplace_customer_enabled
      and b.active
      and m.status='active'
      and m.merchant_type in ('partner','franchise')
      and m.customer_published_at is not null
  ) then
    raise exception using errcode='22023',message='MARKETPLACE_STORE_UNAVAILABLE';
  end if;

  return query
  select
    (
      to_jsonb(p)
      - 'purchase_price'
      - 'expiry_date'
      - 'shelf_location'
      - 'track_expiry'
      - 'owner_merchant_id'
    )
    || jsonb_build_object(
      'price',bp.sale_price,
      'offer_price',case when coalesce(bp.is_offer,false) then bp.offer_price else null end,
      'is_offer',coalesce(bp.is_offer,false),
      'quantity',private.inventory_available_quantity_v1(ml.branch_id,ml.product_id),
      'bulk_enabled',false,
      'bulk_quantity',null,
      'bulk_price',null,
      'bulk_barcode',null,
      'marketplace_listing_id',ml.id,
      'merchant_id',ml.merchant_id,
      'merchant_name',m.name,
      'marketplace_branch_id',b.id,
      'marketplace_branch_name',b.name,
      'preparation_minutes',ml.preparation_minutes,
      'commerce_source','marketplace',
      'catalog_scope','partner',
      'fallback_reason',case
        when nullif(btrim(coalesce(p.barcode,'')),'') is not null
         and exists (
           select 1
           from public.products ep
           where ep.catalog_scope='elmadawy'
             and ep.archived_at is null
             and ep.barcode=p.barcode
         )
        then 'elmadawy_out_of_stock'
        else 'partner_unique_product'
      end
    )
  from public.merchant_listings ml
  join public.merchants m on m.id=ml.merchant_id
  join public.branches b on b.id=ml.branch_id
  join public.products p on p.id=ml.product_id
  join public.branch_product_pricing bp
    on bp.branch_id=ml.branch_id and bp.product_id=ml.product_id
  join public.inventory i
    on i.branch_id=ml.branch_id and i.product_id=ml.product_id
  where ml.branch_id=p_branch_id
    and ml.marketplace_customer_enabled=true
    and ml.status='active'
    and b.marketplace_customer_enabled=true
    and b.active=true
    and m.status='active'
    and m.customer_published_at is not null
    and p.archived_at is null
    and p.catalog_scope='partner'
    and p.owner_merchant_id=ml.merchant_id
    and private.inventory_available_quantity_v1(ml.branch_id,ml.product_id)>0
    and bp.sale_price>=0
    and (p_product_id is null or p.id=p_product_id)
    and (
      p_search is null
      or btrim(p_search)=''
      or p.name ilike '%'||btrim(p_search)||'%'
      or coalesce(p.barcode,'')=btrim(p_search)
    )
    and (
      nullif(btrim(coalesce(p.barcode,'')),'') is null
      or not exists (
        select 1
        from public.products ep
        join public.branches hub on hub.id=b.hub_branch_id
        join public.merchants em
          on em.id=hub.merchant_id
         and em.merchant_type='owned'
         and em.status='active'
        join public.inventory ei
          on ei.branch_id=coalesce(hub.inventory_source_branch_id,hub.id)
         and ei.product_id=ep.id
        where ep.catalog_scope='elmadawy'
          and ep.archived_at is null
          and ep.barcode=p.barcode
          and private.inventory_available_quantity_v1(ei.branch_id,ei.product_id)>0
      )
    )
  order by p.name,ml.created_at
  limit greatest(1,least(coalesce(p_limit,200),500));
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_marketplace_stores_v1(p_latitude double precision, p_longitude double precision, p_branch_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_latitude is null or p_longitude is null
     or p_latitude<-90 or p_latitude>90
     or p_longitude<-180 or p_longitude>180 then
    raise exception using errcode='22023',message='DELIVERY_ADDRESS_REQUIRED';
  end if;

  return query
  select jsonb_build_object(
    'merchant_id',m.id,
    'merchant_name',m.name,
    'merchant_type',m.merchant_type,
    'branch_id',b.id,
    'branch_name',b.name,
    'address',b.address,
    'pickup_address',b.address,
    'pickup_latitude',b.latitude,
    'pickup_longitude',b.longitude,
    'zone_id',null,
    'zone_name','تغطية '||fd.branch_name,
    'coverage_source_branch_id',fd.branch_id,
    'coverage_source_branch_name',fd.branch_name,
    'delivery_fee',coalesce(fd.delivery_fee,0),
    'estimated_time',null,
    'estimated_delivery_minutes',fd.estimated_delivery_minutes,
    'min_order_amount',coalesce(b.min_order_amount,0),
    'distance_km',round(fd.distance_km::numeric,3),
    'available_products',(
      select count(*)
      from public.merchant_listings mlx
      join public.inventory ix
        on ix.branch_id=mlx.branch_id and ix.product_id=mlx.product_id
      where mlx.branch_id=b.id
        and mlx.marketplace_customer_enabled
        and mlx.status='active'
        and private.inventory_available_quantity_v1(ix.branch_id,ix.product_id)>0
    )
  )
  from public.branches b
  join public.merchants m on m.id=b.merchant_id
  join lateral public.find_delivery_branch(p_latitude,p_longitude) fd
    on fd.branch_id=b.hub_branch_id
  where b.marketplace_customer_enabled=true
    and b.active=true
    and b.latitude is not null
    and b.longitude is not null
    and (p_branch_id is null or b.id=p_branch_id)
    and m.merchant_type in ('partner','franchise')
    and m.status='active'
    and m.customer_published_at is not null
    and exists (
      select 1
      from public.merchant_listings ml
      join public.branch_product_pricing bp
        on bp.branch_id=ml.branch_id and bp.product_id=ml.product_id
      join public.inventory i
        on i.branch_id=ml.branch_id and i.product_id=ml.product_id
      where ml.branch_id=b.id
        and ml.marketplace_customer_enabled=true
        and ml.status='active'
        and bp.sale_price>=0
        and private.inventory_available_quantity_v1(i.branch_id,i.product_id)>0
    )
  order by fd.distance_km asc,m.name,b.name
  limit greatest(1,least(coalesce(p_limit,20),50));
end;
$function$;
