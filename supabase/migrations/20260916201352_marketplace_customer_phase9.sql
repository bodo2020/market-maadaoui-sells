alter table public.branches
  add column if not exists marketplace_customer_enabled boolean not null default false;

alter table public.merchant_listings
  add column if not exists marketplace_customer_enabled boolean not null default false;

create index if not exists idx_branches_marketplace_customer
  on public.branches (merchant_id, marketplace_customer_enabled)
  where marketplace_customer_enabled = true;

create index if not exists idx_merchant_listings_marketplace_customer
  on public.merchant_listings (branch_id, marketplace_customer_enabled, status)
  where marketplace_customer_enabled = true;

-- Keep legacy customer routing scoped to Elmadawy-owned merchants.
create or replace function public.find_delivery_branch(
  p_latitude double precision,
  p_longitude double precision
)
returns table(
  branch_id uuid,
  branch_name text,
  distance_km double precision,
  delivery_radius_km numeric,
  delivery_fee numeric,
  min_order_amount numeric,
  estimated_delivery_minutes integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  with candidates as (
    select b.id,b.name,b.delivery_radius_km,b.delivery_fee,b.min_order_amount,b.estimated_delivery_minutes,
      6371.0 * 2 * asin(sqrt(
        power(sin(radians((b.latitude - p_latitude) / 2)), 2) +
        cos(radians(p_latitude)) * cos(radians(b.latitude)) *
        power(sin(radians((b.longitude - p_longitude) / 2)), 2)
      )) as distance_km
    from public.branches b
    join public.merchants m on m.id=b.merchant_id
    where b.active=true
      and b.delivery_enabled=true
      and m.merchant_type='owned'
      and m.status='active'
      and b.latitude is not null
      and b.longitude is not null
  )
  select id,name,distance_km,delivery_radius_km,delivery_fee,min_order_amount,estimated_delivery_minutes
  from candidates
  where distance_km <= delivery_radius_km
  order by distance_km asc
  limit 1;
$function$;

create or replace function public.get_customer_branch_runtime(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  b public.branches%rowtype;
  s record;
begin
  if p_branch_id is null then
    raise exception using errcode='22023',message='DELIVERY_ADDRESS_REQUIRED';
  end if;

  select b0.* into b
  from public.branches b0
  join public.merchants m on m.id=b0.merchant_id
  where b0.id=p_branch_id
    and b0.active=true
    and b0.delivery_enabled=true
    and m.merchant_type='owned'
    and m.status='active';
  if b.id is null then
    raise exception using errcode='22023',message='DELIVERY_UNAVAILABLE';
  end if;

  select * into s from private.resolve_branch_sources(b.id);
  return jsonb_build_object(
    'delivery_branch_id',b.id,
    'branch_name',b.name,
    'branch_code',b.code,
    'inventory_branch_id',s.inventory_branch_id,
    'pricing_branch_id',s.pricing_branch_id,
    'delivery_radius_km',b.delivery_radius_km,
    'delivery_fee',b.delivery_fee,
    'min_order_amount',b.min_order_amount,
    'estimated_delivery_minutes',b.estimated_delivery_minutes,
    'opens_at',b.opens_at,
    'closes_at',b.closes_at,
    'delivery_enabled',b.delivery_enabled,
    'latitude',b.latitude,
    'longitude',b.longitude
  );
end;
$function$;

-- Preserve the mature owned-branch catalog behind an owned-only wrapper.
do $do$
begin
  if to_regprocedure('public.get_customer_branch_catalog_core_v1(uuid,uuid,uuid,uuid,uuid,text,text,integer)') is null then
    alter function public.get_customer_branch_catalog(uuid,uuid,uuid,uuid,uuid,text,text,integer)
      rename to get_customer_branch_catalog_core_v1;
  end if;
end
$do$;

revoke all on function public.get_customer_branch_catalog_core_v1(uuid,uuid,uuid,uuid,uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.get_customer_branch_catalog_core_v1(uuid,uuid,uuid,uuid,uuid,text,text,integer) to service_role;

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
as $function$
begin
  if not exists (
    select 1
    from public.branches b
    join public.merchants m on m.id=b.merchant_id
    where b.id=p_branch_id
      and b.active=true
      and b.delivery_enabled=true
      and m.merchant_type='owned'
      and m.status='active'
  ) then
    raise exception using errcode='22023',message='DELIVERY_UNAVAILABLE';
  end if;

  return query
  select c
  from public.get_customer_branch_catalog_core_v1(
    p_branch_id,p_product_id,p_main_category_id,p_subcategory_id,p_company_id,p_search,p_barcode,p_limit
  ) c;
end;
$function$;

revoke all on function public.get_customer_branch_catalog(uuid,uuid,uuid,uuid,uuid,text,text,integer) from public;
grant execute on function public.get_customer_branch_catalog(uuid,uuid,uuid,uuid,uuid,text,text,integer) to anon, authenticated, service_role;

create or replace function private.marketplace_point_in_zone_v1(
  p_zone_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_points jsonb;
  v_count integer;
  v_i integer;
  v_j integer;
  v_xi double precision;
  v_yi double precision;
  v_xj double precision;
  v_yj double precision;
  v_inside boolean := false;
begin
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    return false;
  end if;

  select z.polygon_coordinates->'coordinates'->0 into v_points
  from public.branch_delivery_zones z
  where z.id=p_zone_id and coalesce(z.is_active,true);

  if v_points is null or jsonb_typeof(v_points) <> 'array' then return false; end if;
  v_count := jsonb_array_length(v_points);
  if v_count < 3 then return false; end if;

  v_j := v_count - 1;
  for v_i in 0..v_count-1 loop
    begin
      v_xi := (v_points->v_i->>0)::double precision;
      v_yi := (v_points->v_i->>1)::double precision;
      v_xj := (v_points->v_j->>0)::double precision;
      v_yj := (v_points->v_j->>1)::double precision;
    exception when others then
      return false;
    end;

    if ((v_yi > p_lat) <> (v_yj > p_lat))
       and p_lng < ((v_xj-v_xi)*(p_lat-v_yi)/nullif(v_yj-v_yi,0.0)+v_xi) then
      v_inside := not v_inside;
    end if;
    v_j := v_i;
  end loop;
  return v_inside;
end;
$function$;

revoke all on function private.marketplace_point_in_zone_v1(uuid,double precision,double precision) from public, anon, authenticated;

create or replace function private.marketplace_customer_publish_readiness_v1(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_base jsonb;
  v_merchant public.merchants%rowtype;
  v_branch_count integer;
  v_geo_ready integer;
  v_publishable_listings integer;
  v_missing jsonb := '[]'::jsonb;
begin
  select * into v_merchant from public.merchants where id=p_merchant_id;
  if v_merchant.id is null then raise exception 'merchant_not_found'; end if;
  if v_merchant.merchant_type not in ('partner','franchise') then raise exception 'merchant_not_marketplace_partner'; end if;

  v_base := private.marketplace_merchant_readiness_v1(p_merchant_id);
  if not coalesce((v_base->>'ready_for_approval')::boolean,false) then
    v_missing := v_missing || coalesce(v_base->'missing','[]'::jsonb);
  end if;
  if v_merchant.status <> 'active' or v_merchant.marketplace_approved_at is null then
    v_missing := v_missing || jsonb_build_array('marketplace_approval');
  end if;

  select count(*), count(*) filter (where b.latitude is not null and b.longitude is not null)
    into v_branch_count,v_geo_ready
  from public.branches b where b.merchant_id=p_merchant_id;
  if v_branch_count=0 or v_geo_ready<>v_branch_count then
    v_missing := v_missing || jsonb_build_array('branch_coordinates');
  end if;

  select count(*) into v_publishable_listings
  from public.merchant_listings ml
  join public.branch_product_pricing bp on bp.branch_id=ml.branch_id and bp.product_id=ml.product_id
  join public.inventory i on i.branch_id=ml.branch_id and i.product_id=ml.product_id
  where ml.merchant_id=p_merchant_id
    and ml.status in ('draft','active')
    and bp.sale_price >= 0
    and i.quantity > 0;
  if v_publishable_listings=0 then
    v_missing := v_missing || jsonb_build_array('in_stock_listing');
  end if;

  return jsonb_build_object(
    'merchant_id',p_merchant_id,
    'ready_for_customer_publish',jsonb_array_length(v_missing)=0,
    'missing',v_missing,
    'base_readiness',v_base,
    'checks',jsonb_build_object(
      'branch_count',v_branch_count,
      'branches_with_coordinates',v_geo_ready,
      'publishable_listings',v_publishable_listings
    )
  );
end;
$function$;

revoke all on function private.marketplace_customer_publish_readiness_v1(uuid) from public, anon, authenticated;

create or replace function public.publish_marketplace_merchant_v1(p_merchant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tenant_id uuid;
  v_readiness jsonb;
  v_published integer;
begin
  select tenant_id into v_tenant_id from public.merchants where id=p_merchant_id;
  if v_tenant_id is null then raise exception 'merchant_not_found'; end if;
  if not public.can_manage_tenant_marketplace_v1(v_tenant_id) then raise exception 'MARKETPLACE_ACCESS_DENIED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_merchant_id::text,2));
  v_readiness := private.marketplace_customer_publish_readiness_v1(p_merchant_id);
  if not coalesce((v_readiness->>'ready_for_customer_publish')::boolean,false) then
    raise exception 'MARKETPLACE_CUSTOMER_NOT_READY:%',v_readiness->'missing';
  end if;

  update public.merchants
  set customer_published_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('customer_publishing',true,'customer_published_at',now()),
      updated_at=now()
  where id=p_merchant_id and merchant_type in ('partner','franchise') and status='active';
  if not found then raise exception 'merchant_not_publishable'; end if;

  update public.branches
  set marketplace_customer_enabled=true,active=true,delivery_enabled=false,updated_at=now()
  where merchant_id=p_merchant_id;

  update public.merchant_listings ml
  set marketplace_customer_enabled=true,status='active',updated_at=now()
  where ml.merchant_id=p_merchant_id
    and ml.status in ('draft','active')
    and exists (select 1 from public.branch_product_pricing bp where bp.branch_id=ml.branch_id and bp.product_id=ml.product_id and bp.sale_price>=0)
    and exists (select 1 from public.inventory i where i.branch_id=ml.branch_id and i.product_id=ml.product_id and i.quantity>0);
  get diagnostics v_published=row_count;

  return jsonb_build_object('merchant_id',p_merchant_id,'customer_published',true,'published_listings',v_published,'readiness',v_readiness);
end;
$function$;

create or replace function public.unpublish_marketplace_merchant_v1(p_merchant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.merchants where id=p_merchant_id;
  if v_tenant_id is null then raise exception 'merchant_not_found'; end if;
  if not public.can_manage_tenant_marketplace_v1(v_tenant_id) then raise exception 'MARKETPLACE_ACCESS_DENIED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_merchant_id::text,2));
  update public.merchants
  set customer_published_at=null,
      metadata=(coalesce(metadata,'{}'::jsonb)-'customer_published_at')||jsonb_build_object('customer_publishing',false),
      updated_at=now()
  where id=p_merchant_id and merchant_type in ('partner','franchise');

  update public.branches
  set marketplace_customer_enabled=false,active=false,delivery_enabled=false,updated_at=now()
  where merchant_id=p_merchant_id;

  update public.merchant_listings
  set marketplace_customer_enabled=false,status=case when status='active' then 'draft' else status end,updated_at=now()
  where merchant_id=p_merchant_id;

  return jsonb_build_object('merchant_id',p_merchant_id,'customer_published',false);
end;
$function$;

revoke all on function public.publish_marketplace_merchant_v1(uuid) from public, anon;
revoke all on function public.unpublish_marketplace_merchant_v1(uuid) from public, anon;
grant execute on function public.publish_marketplace_merchant_v1(uuid) to authenticated, service_role;
grant execute on function public.unpublish_marketplace_merchant_v1(uuid) to authenticated, service_role;

create or replace function public.get_customer_marketplace_stores_v1(
  p_latitude double precision,
  p_longitude double precision,
  p_branch_id uuid default null,
  p_limit integer default 20
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_latitude is null or p_longitude is null or p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
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
    'zone_id',z.id,
    'zone_name',z.zone_name,
    'delivery_fee',coalesce(z.delivery_price,b.delivery_fee,0),
    'estimated_time',z.estimated_time,
    'estimated_delivery_minutes',b.estimated_delivery_minutes,
    'min_order_amount',b.min_order_amount,
    'distance_km',round((6371.0 * 2 * asin(sqrt(
      power(sin(radians((b.latitude-p_latitude)/2)),2)+
      cos(radians(p_latitude))*cos(radians(b.latitude))*power(sin(radians((b.longitude-p_longitude)/2)),2)
    )))::numeric,3),
    'available_products',(select count(*) from public.merchant_listings mlx join public.inventory ix on ix.branch_id=mlx.branch_id and ix.product_id=mlx.product_id where mlx.branch_id=b.id and mlx.marketplace_customer_enabled and mlx.status='active' and ix.quantity>0)
  )
  from public.branches b
  join public.merchants m on m.id=b.merchant_id
  join lateral (
    select z0.* from public.branch_delivery_zones z0
    where z0.branch_id=b.id and coalesce(z0.is_active,true)
      and private.marketplace_point_in_zone_v1(z0.id,p_latitude,p_longitude)
    order by coalesce(z0.priority,2147483647),z0.delivery_price,z0.created_at
    limit 1
  ) z on true
  where b.marketplace_customer_enabled=true
    and b.active=true
    and b.latitude is not null and b.longitude is not null
    and (p_branch_id is null or b.id=p_branch_id)
    and m.merchant_type in ('partner','franchise')
    and m.status='active'
    and m.customer_published_at is not null
    and exists (
      select 1
      from public.merchant_listings ml
      join public.branch_product_pricing bp on bp.branch_id=ml.branch_id and bp.product_id=ml.product_id
      join public.inventory i on i.branch_id=ml.branch_id and i.product_id=ml.product_id
      where ml.branch_id=b.id
        and ml.marketplace_customer_enabled=true
        and ml.status='active'
        and bp.sale_price>=0
        and i.quantity>0
    )
  order by (6371.0 * 2 * asin(sqrt(
      power(sin(radians((b.latitude-p_latitude)/2)),2)+
      cos(radians(p_latitude))*cos(radians(b.latitude))*power(sin(radians((b.longitude-p_longitude)/2)),2)
    ))) asc,m.name,b.name
  limit greatest(1,least(coalesce(p_limit,20),50));
end;
$function$;

create or replace function public.get_customer_marketplace_store_catalog_v1(
  p_branch_id uuid,
  p_search text default null,
  p_limit integer default 200
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1 from public.branches b join public.merchants m on m.id=b.merchant_id
    where b.id=p_branch_id and b.marketplace_customer_enabled and b.active
      and m.status='active' and m.merchant_type in ('partner','franchise') and m.customer_published_at is not null
  ) then
    raise exception using errcode='22023',message='MARKETPLACE_STORE_UNAVAILABLE';
  end if;

  return query
  select (to_jsonb(p)-'purchase_price'-'expiry_date'-'shelf_location'-'track_expiry') || jsonb_build_object(
    'price',bp.sale_price,
    'offer_price',case when coalesce(bp.is_offer,false) then bp.offer_price else null end,
    'is_offer',coalesce(bp.is_offer,false),
    'quantity',coalesce(i.quantity,0),
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
    'commerce_source','marketplace'
  )
  from public.merchant_listings ml
  join public.merchants m on m.id=ml.merchant_id
  join public.branches b on b.id=ml.branch_id
  join public.products p on p.id=ml.product_id
  join public.branch_product_pricing bp on bp.branch_id=ml.branch_id and bp.product_id=ml.product_id
  join public.inventory i on i.branch_id=ml.branch_id and i.product_id=ml.product_id
  where ml.branch_id=p_branch_id
    and ml.marketplace_customer_enabled=true
    and ml.status='active'
    and b.marketplace_customer_enabled=true and b.active=true
    and m.status='active' and m.customer_published_at is not null
    and i.quantity>0 and bp.sale_price>=0
    and (p_search is null or btrim(p_search)='' or p.name ilike '%'||btrim(p_search)||'%' or coalesce(p.barcode,'')=btrim(p_search))
  order by p.name,ml.created_at
  limit greatest(1,least(coalesce(p_limit,200),500));
end;
$function$;

revoke all on function public.get_customer_marketplace_stores_v1(double precision,double precision,uuid,integer) from public;
revoke all on function public.get_customer_marketplace_store_catalog_v1(uuid,text,integer) from public;
grant execute on function public.get_customer_marketplace_stores_v1(double precision,double precision,uuid,integer) to anon, authenticated, service_role;
grant execute on function public.get_customer_marketplace_store_catalog_v1(uuid,text,integer) to anon, authenticated, service_role;

create or replace function private.marketplace_quote_plan_v1(
  p_branch_id uuid,
  p_items jsonb,
  p_latitude double precision,
  p_longitude double precision
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_branch public.branches%rowtype;
  v_merchant public.merchants%rowtype;
  v_zone public.branch_delivery_zones%rowtype;
  v_item jsonb;
  v_row record;
  v_qty numeric;
  v_units numeric;
  v_price numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_deductions jsonb;
  v_result jsonb;
  v_weight boolean;
  v_expected_unit text;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode='22023',message='INVALID_CART';
  end if;
  if p_latitude is null or p_longitude is null or p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
    raise exception using errcode='22023',message='DELIVERY_ADDRESS_REQUIRED';
  end if;

  select b.* into v_branch from public.branches b
  where b.id=p_branch_id and b.marketplace_customer_enabled and b.active;
  if v_branch.id is null then raise exception using errcode='22023',message='MARKETPLACE_STORE_UNAVAILABLE'; end if;

  select m.* into v_merchant from public.merchants m
  where m.id=v_branch.merchant_id and m.merchant_type in ('partner','franchise') and m.status='active' and m.customer_published_at is not null;
  if v_merchant.id is null then raise exception using errcode='22023',message='MARKETPLACE_STORE_UNAVAILABLE'; end if;

  select z.* into v_zone from public.branch_delivery_zones z
  where z.branch_id=v_branch.id and coalesce(z.is_active,true)
    and private.marketplace_point_in_zone_v1(z.id,p_latitude,p_longitude)
  order by coalesce(z.priority,2147483647),z.delivery_price,z.created_at
  limit 1;
  if v_zone.id is null then raise exception using errcode='22023',message='DELIVERY_UNAVAILABLE'; end if;

  for v_item in select value from jsonb_array_elements(p_items) order by value->>'listing_id' loop
    if jsonb_typeof(v_item) <> 'object' or v_item->>'listing_id' is null
       or jsonb_typeof(v_item->'quantity') is distinct from 'number' then
      raise exception using errcode='22023',message='INVALID_CART';
    end if;
    if coalesce((v_item->>'is_bulk')::boolean,false) then
      raise exception using errcode='22023',message='BULK_UNAVAILABLE';
    end if;

    v_qty := (v_item->>'quantity')::numeric;
    if v_qty<>trunc(v_qty) or v_qty not between 1 and 100000 then
      raise exception using errcode='22023',message='INVALID_QUANTITY';
    end if;

    select ml.id as listing_id,ml.product_id,ml.preparation_minutes,
           p.name,p.barcode,p.barcode_type,p.unit_of_measure,p.image_urls,
           bp.sale_price,bp.offer_price,bp.is_offer,i.quantity as stock
      into v_row
    from public.merchant_listings ml
    join public.products p on p.id=ml.product_id
    join public.branch_product_pricing bp on bp.branch_id=ml.branch_id and bp.product_id=ml.product_id
    join public.inventory i on i.branch_id=ml.branch_id and i.product_id=ml.product_id
    where ml.id=(v_item->>'listing_id')::uuid
      and ml.branch_id=v_branch.id
      and ml.merchant_id=v_merchant.id
      and ml.marketplace_customer_enabled=true
      and ml.status='active';
    if v_row.listing_id is null then raise exception using errcode='22023',message='PRODUCT_UNAVAILABLE'; end if;

    v_weight := coalesce(v_row.barcode_type='scale',false) or coalesce(v_row.unit_of_measure,'') in ('weight','kg','كيلوجرام','كجم');
    v_expected_unit := case when v_weight then 'weight' else 'piece' end;
    if coalesce(v_item->>'unit_of_measure','piece')<>v_expected_unit then
      raise exception using errcode='22023',message='PRODUCT_UNIT_CHANGED';
    end if;

    v_price := case when coalesce(v_row.is_offer,false) and v_row.offer_price is not null then v_row.offer_price else v_row.sale_price end;
    if v_price is null or v_price<0 then raise exception using errcode='22023',message='PRICE_UNAVAILABLE'; end if;

    v_units := case when v_weight then v_qty/1000.0 else v_qty end;
    if coalesce(v_row.stock,0)<v_units then
      raise exception using errcode='22023',message='INSUFFICIENT_STOCK',detail=v_row.product_id::text;
    end if;

    v_line_total := round(v_price*(case when v_weight then v_units else v_qty end),2);
    v_subtotal := v_subtotal+v_line_total;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'listing_id',v_row.listing_id,
      'product_id',v_row.product_id,
      'name',v_row.name,
      'product_name',v_row.name,
      'barcode',v_row.barcode,
      'image_url',v_row.image_urls[1],
      'requested_quantity',v_qty,
      'quantity',case when v_weight then v_units else v_qty end,
      'unit_of_measure',v_expected_unit,
      'is_weight_based',v_weight,
      'is_bulk',false,
      'price',v_price,
      'total',v_line_total,
      'available_stock',v_row.stock,
      'stock_quantity',v_units,
      'preparation_minutes',v_row.preparation_minutes
    ));
  end loop;

  select jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity,'branch_id',v_branch.id) order by product_id)
    into v_deductions
  from (
    select (value->>'product_id')::uuid product_id,sum((value->>'stock_quantity')::numeric) quantity
    from jsonb_array_elements(v_lines)
    group by 1
  ) s;

  v_result := jsonb_build_object(
    'source_kind','marketplace',
    'merchant_id',v_merchant.id,
    'merchant_name',v_merchant.name,
    'branch_id',v_branch.id,
    'branch_name',v_branch.name,
    'zone_id',v_zone.id,
    'zone_name',v_zone.zone_name,
    'items',v_lines,
    'subtotal',round(v_subtotal,2),
    'shipping_cost',round(coalesce(v_zone.delivery_price,v_branch.delivery_fee,0),2),
    'total',round(v_subtotal+coalesce(v_zone.delivery_price,v_branch.delivery_fee,0),2),
    'free_delivery',false,
    'min_order_amount',coalesce(v_branch.min_order_amount,0),
    'minimum_order_met',v_subtotal>=coalesce(v_branch.min_order_amount,0),
    'estimated_time',v_zone.estimated_time,
    'estimated_delivery_minutes',v_branch.estimated_delivery_minutes,
    'stock_deductions',coalesce(v_deductions,'[]'::jsonb)
  );
  return v_result||jsonb_build_object('quote_token',md5(v_result::text));
end;
$function$;

revoke all on function private.marketplace_quote_plan_v1(uuid,jsonb,double precision,double precision) from public, anon, authenticated;

create or replace function public.quote_marketplace_cart_v1(
  p_branch_id uuid,
  p_items jsonb,
  p_latitude double precision,
  p_longitude double precision
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private.marketplace_quote_plan_v1(p_branch_id,p_items,p_latitude,p_longitude);
$function$;

revoke all on function public.quote_marketplace_cart_v1(uuid,jsonb,double precision,double precision) from public;
grant execute on function public.quote_marketplace_cart_v1(uuid,jsonb,double precision,double precision) to anon, authenticated, service_role;

create or replace function public.place_marketplace_order_v1(
  p_request_id uuid,
  p_branch_id uuid,
  p_items jsonb,
  p_address_id uuid,
  p_payment_method text,
  p_notes text,
  p_quote_token text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_customer public.customers%rowtype;
  v_address public.customer_addresses%rowtype;
  v_existing public.online_orders%rowtype;
  v_created public.online_orders%rowtype;
  v_plan jsonb;
  v_item jsonb;
  v_fingerprint text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='REQUEST_REQUIRED'; end if;
  if p_payment_method is null or p_payment_method not in ('cash','wallet') or length(coalesce(p_notes,''))>1000 then
    raise exception using errcode='22023',message='INVALID_ORDER';
  end if;

  select * into v_customer from public.customers where user_id=auth.uid() order by created_at desc limit 1;
  if v_customer.id is null or length(trim(coalesce(v_customer.name,'')))<2 then
    raise exception using errcode='22023',message='PROFILE_REQUIRED';
  end if;
  select * into v_address from public.customer_addresses where id=p_address_id and user_id=auth.uid();
  if v_address.id is null or length(trim(coalesce(v_address.address,'')))=0 then
    raise exception using errcode='42501',message='ADDRESS_REQUIRED';
  end if;
  if v_address.latitude is null or v_address.longitude is null then
    raise exception using errcode='22023',message='DELIVERY_UNAVAILABLE';
  end if;

  v_fingerprint:=md5(jsonb_build_object('source','marketplace','branch',p_branch_id,'items',p_items,'address',p_address_id,'payment',p_payment_method,'notes',coalesce(p_notes,''))::text);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,9));
  select * into v_existing from public.online_orders where id=p_request_id;
  if v_existing.id is not null then
    if v_existing.customer_id is distinct from v_customer.id
       or v_existing.checkout_fingerprint is distinct from v_fingerprint
       or v_existing.source_channel is distinct from 'marketplace' then
      raise exception using errcode='42501',message='REQUEST_CONFLICT';
    end if;
    return jsonb_build_object('id',v_existing.id,'tracking_number',v_existing.tracking_number,'total',v_existing.total,'amount_due',v_existing.total,'merchant_id',v_existing.merchant_id);
  end if;

  v_plan:=private.marketplace_quote_plan_v1(p_branch_id,p_items,v_address.latitude::double precision,v_address.longitude::double precision);
  if p_quote_token is distinct from v_plan->>'quote_token' then
    raise exception using errcode='22023',message='QUOTE_CHANGED';
  end if;
  if not coalesce((v_plan->>'minimum_order_met')::boolean,false) then
    raise exception using errcode='22023',message='MIN_ORDER_NOT_MET';
  end if;

  for v_item in select value from jsonb_array_elements(v_plan->'stock_deductions') order by value->>'product_id' loop
    update public.inventory
    set quantity=quantity-(v_item->>'quantity')::numeric,updated_at=now()
    where branch_id=p_branch_id and product_id=(v_item->>'product_id')::uuid and quantity>=(v_item->>'quantity')::numeric;
    if not found then raise exception using errcode='22023',message='INSUFFICIENT_STOCK',detail=v_item->>'product_id'; end if;
  end loop;

  insert into public.online_orders(
    id,customer_id,items,total,shipping_cost,payment_method,status,payment_status,
    shipping_address,delivery_location_id,delivery_zone_id,branch_id,notes,tracking_number,
    checkout_version,checkout_fingerprint,customer_snapshot,shipping_snapshot,stock_deductions,source_channel
  ) values (
    p_request_id,v_customer.id,v_plan->'items',(v_plan->>'total')::numeric,(v_plan->>'shipping_cost')::numeric,
    p_payment_method,'pending','pending',v_address.address,v_address.neighborhood_id,(v_plan->>'zone_id')::uuid,p_branch_id,
    coalesce(p_notes,''),upper(replace(p_request_id::text,'-','')),9,v_fingerprint,
    jsonb_build_object('name',trim(v_customer.name),'phone',v_customer.phone,'email',v_customer.email),
    jsonb_build_object(
      'address_id',v_address.id,'address',v_address.address,'latitude',v_address.latitude,'longitude',v_address.longitude,
      'assigned_branch_id',p_branch_id,'zone_id',(v_plan->>'zone_id')::uuid,'zone_name',v_plan->>'zone_name',
      'merchant_id',(v_plan->>'merchant_id')::uuid,'merchant_name',v_plan->>'merchant_name'
    ),
    v_plan->'stock_deductions','marketplace'
  ) returning * into v_created;

  return jsonb_build_object(
    'id',v_created.id,
    'tracking_number',v_created.tracking_number,
    'total',v_created.total,
    'amount_due',v_created.total,
    'merchant_id',v_created.merchant_id,
    'merchant_name',v_plan->>'merchant_name',
    'source_kind','marketplace'
  );
end;
$function$;

revoke all on function public.place_marketplace_order_v1(uuid,uuid,jsonb,uuid,text,text,text) from public, anon;
grant execute on function public.place_marketplace_order_v1(uuid,uuid,jsonb,uuid,text,text,text) to authenticated, service_role;

create or replace function public.replace_customer_cart(p_items jsonb,p_expected_user_id uuid)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_customer uuid;
  v_marketplace_merchants integer;
  v_marketplace_branches integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_expected_user_id is distinct from auth.uid() then raise exception 'Session changed' using errcode='42501'; end if;
  select id into strict v_customer from public.customers where user_id=auth.uid();
  perform pg_advisory_xact_lock(hashtextextended(v_customer::text,0));
  if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Cart must be an array' using errcode='22023'; end if;
  if jsonb_array_length(p_items)>300 then raise exception 'Cart too large' using errcode='22023'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where jsonb_typeof(x)<>'object' or x->>'product_id' is null
      or coalesce(jsonb_typeof(x->'quantity'),'null')<>'number'
      or (x->>'quantity')::numeric<=0 or (x->>'quantity')::numeric<>trunc((x->>'quantity')::numeric)
      or (x->>'quantity')::numeric>2147483647
      or coalesce(jsonb_typeof(x->'metadata'),'null')<>'object'
      or coalesce(x->'metadata'->>'source_kind','owned') not in ('owned','marketplace')
  ) then raise exception 'Invalid cart item' using errcode='22023'; end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where coalesce(x->'metadata'->>'source_kind','owned')='marketplace'
      and (nullif(x->'metadata'->>'merchant_id','') is null or nullif(x->'metadata'->>'branch_id','') is null or nullif(x->'metadata'->>'listing_id','') is null)
  ) then raise exception 'Marketplace cart source required' using errcode='22023'; end if;

  select count(distinct x->'metadata'->>'merchant_id'),count(distinct x->'metadata'->>'branch_id')
    into v_marketplace_merchants,v_marketplace_branches
  from jsonb_array_elements(p_items) x
  where coalesce(x->'metadata'->>'source_kind','owned')='marketplace';

  if v_marketplace_merchants>1 or v_marketplace_branches>1 then
    raise exception 'MIXED_MERCHANT_CART' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_items) x where coalesce(x->'metadata'->>'source_kind','owned')='owned')
     and exists(select 1 from jsonb_array_elements(p_items) x where coalesce(x->'metadata'->>'source_kind','owned')='marketplace') then
    raise exception 'MIXED_MERCHANT_CART' using errcode='22023';
  end if;

  delete from public.cart_items where customer_id=v_customer or user_id=auth.uid();
  insert into public.cart_items(customer_id,product_id,quantity,metadata)
  select v_customer,(x->>'product_id')::uuid,(x->>'quantity')::integer,
    jsonb_build_object(
      'is_bulk',coalesce((x->'metadata'->>'is_bulk')::boolean,false),
      'unit_of_measure',nullif(x->'metadata'->>'unit_of_measure',''),
      'source_kind',coalesce(x->'metadata'->>'source_kind','owned'),
      'merchant_id',nullif(x->'metadata'->>'merchant_id',''),
      'merchant_name',nullif(x->'metadata'->>'merchant_name',''),
      'branch_id',nullif(x->'metadata'->>'branch_id',''),
      'branch_name',nullif(x->'metadata'->>'branch_name',''),
      'listing_id',nullif(x->'metadata'->>'listing_id','')
    )
  from jsonb_array_elements(p_items) x;
end;
$function$;

revoke select on public.merchants,public.merchant_listings,public.merchant_commission_rules,
  public.merchant_members,public.merchant_financial_entries,public.merchant_settlements,
  public.merchant_settlement_entries from anon;
