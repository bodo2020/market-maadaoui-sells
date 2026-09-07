create or replace function public.get_product_management_catalog(
  p_branch_id uuid,
  p_search text default null,
  p_company_id uuid default null,
  p_category_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_inventory_branch uuid;
  v_pricing_branch uuid;
begin
  if auth.uid() is null or p_branch_id is null or not private.can_manage_inventory_branch(p_branch_id) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;

  select s.inventory_branch_id,s.pricing_branch_id
    into v_inventory_branch,v_pricing_branch
  from private.resolve_branch_sources(p_branch_id) s;

  return query
  with rows as (
    select
      p.name as sort_name,
      p.barcode as sort_barcode,
      jsonb_build_object(
        'row_key','product:'||p.id::text,
        'record_type','product',
        'id',p.id,
        'base_product_id',p.id,
        'variant_id',null,
        'name',p.name,
        'barcode',p.barcode,
        'barcode_type',p.barcode_type,
        'image_urls',coalesce(to_jsonb(p.image_urls),'[]'::jsonb),
        'price',coalesce(bp.sale_price,p.price),
        'purchase_price',coalesce(bp.purchase_price,p.purchase_price),
        'offer_price',case when bp.id is not null then bp.offer_price else p.offer_price end,
        'is_offer',case when bp.id is not null then coalesce(bp.is_offer,false) else coalesce(p.is_offer,false) end,
        'quantity',coalesce(i.quantity,0),
        'base_quantity',coalesce(i.quantity,0),
        'min_stock_level',coalesce(i.min_stock_level,5),
        'company_id',p.company_id,
        'main_category_id',p.main_category_id,
        'subcategory_id',p.subcategory_id,
        'unit_of_measure',p.unit_of_measure,
        'has_variants',coalesce(p.has_variants,false),
        'is_linked_sale_unit',false,
        'active',true,
        'conversion_factor',1,
        'variant_type',null,
        'parent_name',null,
        'stock_status',case when coalesce(i.quantity,0)<=0 then 'out' when coalesce(i.quantity,0)<=coalesce(i.min_stock_level,5) then 'low' else 'in' end,
        'inventory_branch_id',v_inventory_branch,
        'pricing_branch_id',v_pricing_branch
      ) as item
    from public.products p
    join public.inventory i on i.product_id=p.id and i.branch_id=v_inventory_branch
    left join public.branch_product_pricing bp on bp.product_id=p.id and bp.branch_id=v_pricing_branch
    where (p_company_id is null or p.company_id=p_company_id)
      and (p_category_id is null or p.main_category_id=p_category_id)
      and (p_search is null or btrim(p_search)='' or p.name ilike '%'||btrim(p_search)||'%' or p.barcode ilike '%'||btrim(p_search)||'%' or p.bulk_barcode ilike '%'||btrim(p_search)||'%')

    union all

    select
      pv.name as sort_name,
      coalesce(pv.barcode,pv.bulk_barcode) as sort_barcode,
      jsonb_build_object(
        'row_key','variant:'||pv.id::text,
        'record_type','sale_unit',
        'id',pv.id,
        'base_product_id',p.id,
        'variant_id',pv.id,
        'name',pv.name,
        'barcode',coalesce(pv.barcode,pv.bulk_barcode),
        'barcode_type','normal',
        'image_urls',case when pv.image_url is not null then jsonb_build_array(pv.image_url) else coalesce(to_jsonb(p.image_urls),'[]'::jsonb) end,
        'price',pv.price,
        'purchase_price',case when coalesce(pv.purchase_price,0)>0 then pv.purchase_price else coalesce(bp.purchase_price,p.purchase_price,0)*pv.conversion_factor end,
        'offer_price',null,
        'is_offer',false,
        'quantity',floor(coalesce(i.quantity,0)/nullif(pv.conversion_factor,0)),
        'base_quantity',coalesce(i.quantity,0),
        'min_stock_level',floor(coalesce(i.min_stock_level,5)/nullif(pv.conversion_factor,0)),
        'company_id',p.company_id,
        'main_category_id',p.main_category_id,
        'subcategory_id',p.subcategory_id,
        'unit_of_measure',pv.variant_type,
        'has_variants',false,
        'is_linked_sale_unit',true,
        'active',pv.active,
        'conversion_factor',pv.conversion_factor,
        'variant_type',pv.variant_type,
        'parent_name',p.name,
        'stock_status',case when floor(coalesce(i.quantity,0)/nullif(pv.conversion_factor,0))<=0 then 'out' when floor(coalesce(i.quantity,0)/nullif(pv.conversion_factor,0))<=floor(coalesce(i.min_stock_level,5)/nullif(pv.conversion_factor,0)) then 'low' else 'in' end,
        'inventory_branch_id',v_inventory_branch,
        'pricing_branch_id',v_pricing_branch
      ) as item
    from public.product_variants pv
    join public.products p on p.id=pv.parent_product_id
    join public.inventory i on i.product_id=p.id and i.branch_id=v_inventory_branch
    left join public.branch_product_pricing bp on bp.product_id=p.id and bp.branch_id=v_pricing_branch
    where (p_company_id is null or p.company_id=p_company_id)
      and (p_category_id is null or p.main_category_id=p_category_id)
      and (p_search is null or btrim(p_search)='' or pv.name ilike '%'||btrim(p_search)||'%' or pv.barcode ilike '%'||btrim(p_search)||'%' or pv.bulk_barcode ilike '%'||btrim(p_search)||'%' or p.name ilike '%'||btrim(p_search)||'%')
  ), counted as (
    select rows.*,count(*) over() as total_count from rows
  )
  select item||jsonb_build_object('total_count',total_count)
  from counted
  order by sort_name,sort_barcode nulls last
  limit greatest(1,least(coalesce(p_limit,50),200))
  offset greatest(0,coalesce(p_offset,0));
end;
$function$;

revoke all on function public.get_product_management_catalog(uuid,text,uuid,uuid,integer,integer) from public,anon;
grant execute on function public.get_product_management_catalog(uuid,text,uuid,uuid,integer,integer) to authenticated;
