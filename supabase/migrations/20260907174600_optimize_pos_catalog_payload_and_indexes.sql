create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_products_name_trgm
  on public.products using gin (name extensions.gin_trgm_ops);

drop index if exists public.idx_inventory_product_branch;
drop index if exists public.idx_inventory_branch_id;

create or replace function public.get_pos_branch_catalog(
  p_branch_id uuid,
  p_search text default null,
  p_barcode text default null,
  p_limit integer default 2000
)
returns setof jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_inventory_branch uuid;
  v_pricing_branch uuid;
  v_barcode text := nullif(btrim(p_barcode),'');
  v_scale_product_barcode text;
  v_scale_weight numeric;
begin
  if auth.uid() is null or p_branch_id is null or not (
    private.can_operate_cash_branch(p_branch_id) or private.can_manage_inventory_branch(p_branch_id)
  ) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;

  select s.inventory_branch_id,s.pricing_branch_id
    into v_inventory_branch,v_pricing_branch
  from private.resolve_branch_sources(p_branch_id) s;

  if v_barcode ~ '^\d{11,12}$'
     and (left(v_barcode,2)='02' or left(v_barcode,1)='2') then
    v_scale_product_barcode := lpad(substr(v_barcode,3,4),6,'0');
    v_scale_weight := substr(v_barcode,7,5)::numeric / 1000;
    if v_scale_weight <= 0 or v_scale_weight > 100 then
      v_scale_product_barcode := null;
      v_scale_weight := null;
    end if;
  end if;

  return query
  select jsonb_build_object(
      'id',p.id,
      'name',p.name,
      'image_urls',p.image_urls,
      'barcode',p.barcode,
      'barcode_type',p.barcode_type,
      'price',coalesce(bp.sale_price,p.price),
      'purchase_price',coalesce(bp.purchase_price,p.purchase_price),
      'offer_price',case when bp.id is not null then bp.offer_price else p.offer_price end,
      'is_offer',case when bp.id is not null then coalesce(bp.is_offer,false) else coalesce(p.is_offer,false) end,
      'bulk_enabled',coalesce(p.bulk_enabled,false),
      'bulk_quantity',p.bulk_quantity,
      'bulk_price',p.bulk_price,
      'bulk_barcode',p.bulk_barcode,
      'unit_of_measure',p.unit_of_measure,
      'main_category_id',p.main_category_id,
      'subcategory_id',p.subcategory_id,
      'company_id',p.company_id,
      'quantity',coalesce(i.quantity,0),
      'min_stock_level',coalesce(i.min_stock_level,5),
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
  join public.inventory i
    on i.product_id=p.id and i.branch_id=v_inventory_branch
  left join public.branch_product_pricing bp
    on bp.product_id=p.id and bp.branch_id=v_pricing_branch
  where (p_search is null or btrim(p_search)='' or p.name ilike '%'||btrim(p_search)||'%' or p.barcode ilike '%'||btrim(p_search)||'%')
    and (
      v_barcode is null
      or p.barcode=v_barcode
      or p.bulk_barcode=v_barcode
      or (v_scale_product_barcode is not null and p.barcode=v_scale_product_barcode and p.barcode_type='scale')
    )
  order by
    case when v_barcode is not null and (p.barcode=v_barcode or p.bulk_barcode=v_barcode) then 0 else 1 end,
    p.name,p.id
  limit greatest(1,least(coalesce(p_limit,2000),5000));
end;
$function$;
