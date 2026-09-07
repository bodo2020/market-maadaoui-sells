create or replace function public.get_product_management_stats(p_branch_id uuid)
returns jsonb
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

  return (
    with base as (
      select
        p.id,
        coalesce(i.quantity,0) as quantity,
        coalesce(i.min_stock_level,5) as min_stock_level,
        case when bp.id is not null then coalesce(bp.is_offer,false) else coalesce(p.is_offer,false) end as is_offer,
        coalesce(p.bulk_enabled,false) as bulk_enabled,
        coalesce(p.bulk_quantity,0) as bulk_quantity,
        coalesce(p.bulk_price,0) as bulk_price,
        p.bulk_barcode,
        exists (
          select 1 from public.product_variants pv
          where pv.parent_product_id=p.id and pv.active
        ) as has_active_sale_unit
      from public.products p
      join public.inventory i on i.product_id=p.id and i.branch_id=v_inventory_branch
      left join public.branch_product_pricing bp on bp.product_id=p.id and bp.branch_id=v_pricing_branch
    ), variant_stats as (
      select
        count(*) filter (where pv.active) as active_sale_units,
        count(*) filter (where not pv.active) as inactive_sale_units
      from public.product_variants pv
      join public.products p on p.id=pv.parent_product_id
      join public.inventory i on i.product_id=p.id and i.branch_id=v_inventory_branch
    )
    select jsonb_build_object(
      'total_products',count(*),
      'in_stock_products',count(*) filter (where quantity>min_stock_level),
      'low_stock_products',count(*) filter (where quantity>0 and quantity<=min_stock_level),
      'out_of_stock_products',count(*) filter (where quantity<=0),
      'offer_products',count(*) filter (where is_offer),
      'active_sale_units',(select active_sale_units from variant_stats),
      'inactive_sale_units',(select inactive_sale_units from variant_stats),
      'legacy_bulk_unresolved',count(*) filter (
        where bulk_enabled and bulk_quantity>0 and bulk_price>0 and not has_active_sale_unit
      ),
      'inventory_branch_id',v_inventory_branch,
      'pricing_branch_id',v_pricing_branch,
      'operational_branch_id',p_branch_id
    )
    from base
  );
end;
$function$;

revoke all on function public.get_product_management_stats(uuid) from public,anon;
grant execute on function public.get_product_management_stats(uuid) to authenticated;
