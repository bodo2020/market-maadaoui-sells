create or replace function public.get_product_details_pro(
  p_branch_id uuid,
  p_product_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_inventory_branch uuid;
  v_pricing_branch uuid;
  v_product public.products%rowtype;
  v_inventory public.inventory%rowtype;
  v_pricing public.branch_product_pricing%rowtype;
  v_effective_sale numeric;
  v_effective_purchase numeric;
  v_effective_offer numeric;
  v_effective_is_offer boolean;
begin
  if auth.uid() is null or p_branch_id is null or p_product_id is null
     or not private.can_manage_inventory_branch(p_branch_id) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;

  select s.inventory_branch_id,s.pricing_branch_id
    into v_inventory_branch,v_pricing_branch
  from private.resolve_branch_sources(p_branch_id) s;

  select * into v_product
  from public.products
  where id=p_product_id;

  if v_product.id is null then
    raise exception using errcode='22023',message='PRODUCT_NOT_FOUND';
  end if;

  select * into v_inventory
  from public.inventory
  where product_id=p_product_id and branch_id=v_inventory_branch
  limit 1;

  select * into v_pricing
  from public.branch_product_pricing
  where product_id=p_product_id and branch_id=v_pricing_branch
  limit 1;

  v_effective_sale := coalesce(v_pricing.sale_price,v_product.price,0);
  v_effective_purchase := coalesce(v_pricing.purchase_price,v_product.purchase_price,0);
  v_effective_offer := case when v_pricing.id is not null then v_pricing.offer_price else v_product.offer_price end;
  v_effective_is_offer := case when v_pricing.id is not null then coalesce(v_pricing.is_offer,false) else coalesce(v_product.is_offer,false) end;

  return jsonb_build_object(
    'product',
      to_jsonb(v_product) || jsonb_build_object(
        'quantity',coalesce(v_inventory.quantity,0),
        'min_stock_level',coalesce(v_inventory.min_stock_level,0),
        'max_stock_level',v_inventory.max_stock_level,
        'price',v_effective_sale,
        'purchase_price',v_effective_purchase,
        'offer_price',v_effective_offer,
        'is_offer',v_effective_is_offer,
        'inventory_value',round(coalesce(v_inventory.quantity,0)*v_effective_purchase,2),
        'margin_value',round(v_effective_sale-v_effective_purchase,2),
        'margin_percent',case when v_effective_sale>0 then round(((v_effective_sale-v_effective_purchase)/v_effective_sale)*100,2) else 0 end,
        'company_name',(select c.name from public.companies c where c.id=v_product.company_id),
        'main_category_name',(select mc.name from public.main_categories mc where mc.id=v_product.main_category_id),
        'subcategory_name',(select sc.name from public.subcategories sc where sc.id=v_product.subcategory_id),
        'operational_branch_id',p_branch_id,
        'inventory_branch_id',v_inventory_branch,
        'pricing_branch_id',v_pricing_branch,
        'has_custom_pricing',v_pricing.id is not null
      ),
    'variants',
      coalesce((
        select jsonb_agg(
          to_jsonb(pv) || jsonb_build_object(
            'available_packages',floor(coalesce(v_inventory.quantity,0)/nullif(pv.conversion_factor,0)),
            'stock_units',coalesce(v_inventory.quantity,0),
            'effective_purchase_price',case when coalesce(pv.purchase_price,0)>0 then pv.purchase_price else v_effective_purchase*pv.conversion_factor end
          )
          order by pv.position,pv.name,pv.id
        )
        from public.product_variants pv
        where pv.parent_product_id=p_product_id
      ),'[]'::jsonb),
    'batches',
      coalesce((
        select jsonb_agg(to_jsonb(b) order by b.expiry_date nulls last,b.created_at desc)
        from (
          select pb.id,pb.batch_number,pb.expiry_date,pb.quantity,pb.shelf_location,
                 pb.purchase_date,pb.purchase_price,pb.notes,pb.created_at,pb.updated_at,
                 pb.supplier_id,s.name as supplier_name
          from public.product_batches pb
          left join public.suppliers s on s.id=pb.supplier_id
          where pb.product_id=p_product_id and pb.branch_id=v_inventory_branch
          order by pb.expiry_date nulls last,pb.created_at desc
          limit 100
        ) b
      ),'[]'::jsonb),
    'recent_purchases',
      coalesce((
        select jsonb_agg(to_jsonb(r) order by r.purchase_date desc,r.created_at desc)
        from (
          select pi.id,pi.purchase_id,pi.quantity,pi.price,pi.sale_price,pi.total,
                 pi.batch_number,pi.expiry_date,pi.shelf_location,pi.notes,pi.created_at,
                 pu.invoice_number,pu.date as purchase_date,pu.supplier_id,s.name as supplier_name
          from public.purchase_items pi
          join public.purchases pu on pu.id=pi.purchase_id
          left join public.suppliers s on s.id=pu.supplier_id
          where pi.product_id=p_product_id
            and coalesce(pi.branch_id,pu.branch_id)=v_inventory_branch
          order by pu.date desc,pi.created_at desc
          limit 30
        ) r
      ),'[]'::jsonb),
    'source_context',jsonb_build_object(
      'operational_branch_id',p_branch_id,
      'inventory_branch_id',v_inventory_branch,
      'pricing_branch_id',v_pricing_branch
    )
  );
end;
$function$;

revoke all on function public.get_product_details_pro(uuid,uuid) from public,anon;
grant execute on function public.get_product_details_pro(uuid,uuid) to authenticated;
