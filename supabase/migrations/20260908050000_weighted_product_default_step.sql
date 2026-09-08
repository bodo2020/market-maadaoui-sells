alter table public.products
  add column if not exists default_weight_grams integer not null default 250;

alter table public.products
  drop constraint if exists products_default_weight_grams_check;

alter table public.products
  add constraint products_default_weight_grams_check
  check (default_weight_grams between 1 and 100000);

create or replace function public.save_product_editor(
  p_branch_id uuid,
  p_product jsonb,
  p_inventory jsonb default '{}'::jsonb,
  p_alert jsonb default '{}'::jsonb,
  p_product_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_existing public.products%rowtype;
  v_saved public.products%rowtype;
  v_branch public.branches%rowtype;
  v_inventory_branch uuid;
  v_pricing_branch uuid;
  v_inventory public.inventory%rowtype;
  v_name text := nullif(btrim(p_product->>'name'),'');
  v_barcode text := nullif(btrim(p_product->>'barcode'),'');
  v_barcode_type text := coalesce(nullif(btrim(p_product->>'barcode_type'),''),'normal');
  v_price numeric := coalesce((p_product->>'price')::numeric,0);
  v_purchase numeric := coalesce((p_product->>'purchase_price')::numeric,0);
  v_offer_price numeric;
  v_is_offer boolean := coalesce((p_product->>'is_offer')::boolean,false);
  v_quantity numeric := coalesce((p_inventory->>'quantity')::numeric,0);
  v_min_stock integer := coalesce((p_inventory->>'min_stock_level')::integer,5);
  v_alert_enabled boolean := coalesce((p_alert->>'enabled')::boolean,false);
  v_default_weight_grams integer := coalesce(nullif(p_product->>'default_weight_grams','')::integer,250);
  v_subcategory uuid;
  v_main_category uuid;
  v_company uuid;
  v_image_urls text[] := '{}'::text[];
  v_branch_owner uuid;
begin
  if auth.uid() is null or p_branch_id is null or not private.can_manage_inventory_branch(p_branch_id) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;

  select * into v_branch from public.branches where id=p_branch_id and active;
  if v_branch.id is null then
    raise exception using errcode='22023',message='BRANCH_REQUIRED';
  end if;

  if v_name is null or v_price<0 or v_purchase<0 then
    raise exception using errcode='22023',message='INVALID_PRODUCT';
  end if;
  if v_barcode_type not in ('normal','scale') then
    raise exception using errcode='22023',message='INVALID_BARCODE_TYPE';
  end if;
  if v_default_weight_grams not between 1 and 100000 then
    raise exception using errcode='22023',message='INVALID_DEFAULT_WEIGHT';
  end if;
  if v_quantity<0 or round(v_quantity,3)<>v_quantity or v_min_stock<0 then
    raise exception using errcode='22023',message='INVALID_INVENTORY';
  end if;

  if p_product ? 'offer_price' and nullif(p_product->>'offer_price','') is not null then
    v_offer_price := (p_product->>'offer_price')::numeric;
    if v_offer_price<0 then raise exception using errcode='22023',message='INVALID_OFFER_PRICE'; end if;
  else
    v_offer_price := null;
  end if;
  if v_is_offer and v_offer_price is null then
    raise exception using errcode='22023',message='OFFER_PRICE_REQUIRED';
  end if;

  begin v_subcategory := nullif(p_product->>'subcategory_id','')::uuid; exception when others then v_subcategory := null; end;
  begin v_main_category := nullif(p_product->>'main_category_id','')::uuid; exception when others then v_main_category := null; end;
  begin v_company := nullif(p_product->>'company_id','')::uuid; exception when others then v_company := null; end;

  if v_subcategory is not null then
    select category_id into v_main_category from public.subcategories where id=v_subcategory;
    if v_main_category is null then raise exception using errcode='22023',message='INVALID_SUBCATEGORY'; end if;
  end if;

  if jsonb_typeof(p_product->'image_urls')='array' then
    select coalesce(array_agg(value),'{}'::text[]) into v_image_urls
    from jsonb_array_elements_text(p_product->'image_urls');
  end if;

  if p_product_id is not null then
    select * into v_existing from public.products where id=p_product_id for update;
    if v_existing.id is null then raise exception using errcode='22023',message='PRODUCT_NOT_FOUND'; end if;
  end if;

  if v_barcode is not null and (
    exists(select 1 from public.products p where p.barcode=v_barcode and (p_product_id is null or p.id<>p_product_id))
    or exists(select 1 from public.products p where p.bulk_barcode=v_barcode and (p_product_id is null or p.id<>p_product_id))
    or exists(select 1 from public.product_variants pv where pv.barcode=v_barcode or pv.bulk_barcode=v_barcode)
  ) then
    raise exception using errcode='23505',message='BARCODE_ALREADY_EXISTS';
  end if;

  select s.inventory_branch_id,s.pricing_branch_id
    into v_inventory_branch,v_pricing_branch
  from private.resolve_branch_sources(p_branch_id) s;

  v_branch_owner := case when v_branch.branch_type::text='external' then p_branch_id else null end;

  if p_product_id is null then
    insert into public.products(
      name,barcode,description,image_urls,price,purchase_price,offer_price,is_offer,
      barcode_type,bulk_enabled,bulk_quantity,bulk_price,bulk_barcode,manufacturer_name,
      is_bulk,unit_of_measure,company_id,main_category_id,subcategory_id,expiry_date,
      shelf_location,track_expiry,base_unit,branch_id,default_weight_grams
    ) values (
      v_name,v_barcode,nullif(p_product->>'description',''),v_image_urls,v_price,v_purchase,v_offer_price,v_is_offer,
      v_barcode_type,false,null,null,null,nullif(p_product->>'manufacturer_name',''),
      false,coalesce(nullif(p_product->>'unit_of_measure',''),case when v_barcode_type='scale' then 'كجم' else 'قطعة' end),
      v_company,v_main_category,v_subcategory,nullif(p_product->>'expiry_date','')::date,
      nullif(p_product->>'shelf_location',''),coalesce((p_product->>'track_expiry')::boolean,false),
      coalesce(nullif(p_product->>'base_unit',''),case when v_barcode_type='scale' then 'كجم' else 'قطعة' end),v_branch_owner,
      v_default_weight_grams
    ) returning * into v_saved;
  else
    update public.products p set
      name=v_name,
      barcode=v_barcode,
      description=case when p_product ? 'description' then nullif(p_product->>'description','') else p.description end,
      image_urls=case when p_product ? 'image_urls' then v_image_urls else p.image_urls end,
      price=case when v_branch.independent_pricing then p.price else v_price end,
      purchase_price=case when v_branch.independent_pricing then p.purchase_price else v_purchase end,
      offer_price=case when v_branch.independent_pricing then p.offer_price else v_offer_price end,
      is_offer=case when v_branch.independent_pricing then p.is_offer else v_is_offer end,
      barcode_type=v_barcode_type,
      manufacturer_name=case when p_product ? 'manufacturer_name' then nullif(p_product->>'manufacturer_name','') else p.manufacturer_name end,
      unit_of_measure=coalesce(nullif(p_product->>'unit_of_measure',''),case when v_barcode_type='scale' then 'كجم' else p.unit_of_measure end),
      company_id=v_company,
      main_category_id=v_main_category,
      subcategory_id=v_subcategory,
      expiry_date=case when p_product ? 'expiry_date' then nullif(p_product->>'expiry_date','')::date else p.expiry_date end,
      shelf_location=case when p_product ? 'shelf_location' then nullif(p_product->>'shelf_location','') else p.shelf_location end,
      track_expiry=case when p_product ? 'track_expiry' then coalesce((p_product->>'track_expiry')::boolean,false) else p.track_expiry end,
      base_unit=coalesce(nullif(p_product->>'base_unit',''),p.base_unit),
      default_weight_grams=v_default_weight_grams,
      updated_at=now()
    where p.id=p_product_id
    returning * into v_saved;
  end if;

  select * into v_inventory from public.inventory
  where product_id=v_saved.id and branch_id=v_inventory_branch
  for update;

  insert into public.inventory(product_id,branch_id,quantity,min_stock_level,updated_at)
  values(v_saved.id,v_inventory_branch,v_quantity,v_min_stock,now())
  on conflict(product_id,branch_id) do update set
    quantity=excluded.quantity,
    min_stock_level=excluded.min_stock_level,
    updated_at=now();

  if v_branch.independent_pricing then
    insert into public.branch_product_pricing(branch_id,product_id,sale_price,purchase_price,offer_price,is_offer,updated_at)
    values(v_pricing_branch,v_saved.id,v_price,v_purchase,v_offer_price,v_is_offer,now())
    on conflict(branch_id,product_id) do update set
      sale_price=excluded.sale_price,
      purchase_price=excluded.purchase_price,
      offer_price=excluded.offer_price,
      is_offer=excluded.is_offer,
      updated_at=now();
  end if;

  insert into public.inventory_alerts(product_id,min_stock_level,alert_enabled,updated_at)
  values(v_saved.id,case when v_alert_enabled then v_min_stock else null end,v_alert_enabled,now())
  on conflict(product_id) do update set
    min_stock_level=excluded.min_stock_level,
    alert_enabled=excluded.alert_enabled,
    updated_at=now();

  return to_jsonb(v_saved)||jsonb_build_object(
    'quantity',v_quantity,
    'min_stock_level',v_min_stock,
    'price',v_price,
    'purchase_price',v_purchase,
    'offer_price',v_offer_price,
    'is_offer',v_is_offer,
    'inventory_branch_id',v_inventory_branch,
    'pricing_branch_id',v_pricing_branch
  );
end;
$function$;