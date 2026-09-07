create or replace function public.get_pos_branch_catalog(
  p_branch_id uuid,
  p_search text default null,
  p_barcode text default null,
  p_limit integer default 2000
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

  if v_barcode is not null then
    return query
    select to_jsonb(p)
      || jsonb_build_object(
        'id',pv.id,
        'name',pv.name,
        'image_urls',case when pv.image_url is not null then jsonb_build_array(pv.image_url) else to_jsonb(coalesce(p.image_urls,'{}'::text[])) end,
        'quantity',floor(coalesce(i.quantity,0)/nullif(pv.conversion_factor,0)),
        'base_quantity',coalesce(i.quantity,0),
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

  if v_barcode is not null then
    return query
    select to_jsonb(p)
      || jsonb_build_object(
        'quantity',coalesce(i.quantity,0),
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

  return query
  with catalog_rows as (
    select
      0 as kind_order,
      p.name as sort_name,
      to_jsonb(p)
        || jsonb_build_object(
          'quantity',coalesce(i.quantity,0),
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
          'quantity',floor(coalesce(i.quantity,0)/nullif(pv.conversion_factor,0)),
          'base_quantity',coalesce(i.quantity,0),
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

revoke all on function public.get_pos_branch_catalog(uuid,text,text,integer) from public,anon;
grant execute on function public.get_pos_branch_catalog(uuid,text,text,integer) to authenticated;

create or replace function public.preflight_pos_sale(p_branch_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  p public.products%rowtype;
  pv public.product_variants%rowtype;
  x jsonb;
  v_inventory_branch uuid;
  v_pricing_branch uuid;
  v_has_bp boolean;
  v_bp_sale numeric;
  v_bp_purchase numeric;
  v_bp_offer numeric;
  v_bp_is_offer boolean;
  v_regular_price numeric;
  v_purchase_price numeric;
  v_offer_price numeric;
  v_offer_active boolean;
  v_effective_price numeric;
  v_line_subtotal numeric;
  v_line_total numeric;
  v_line_discount numeric;
  v_discount_per_unit numeric;
  v_quantity numeric;
  v_base_quantity numeric;
  v_package_count numeric;
  v_available numeric;
  v_requested numeric;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_items jsonb := '[]'::jsonb;
  v_deductions jsonb := '[]'::jsonb;
  v_item jsonb;
  v_repriced boolean := false;
  v_name text;
  v_variant_id uuid;
  v_is_variant boolean;
  v_variant_catalog_input boolean;
  v_pack numeric;
  v_pack_price numeric;
  v_compare_price numeric;
begin
  if auth.uid() is null or p_branch_id is null or not private.can_operate_cash_branch(p_branch_id) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;

  if not exists (
    select 1 from public.pos_shifts s
    where s.user_id=auth.uid() and s.branch_id=p_branch_id and s.status='open'
  ) then
    return jsonb_build_object('ok',false,'code','POS_SHIFT_REQUIRED');
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 300 then
    raise exception using errcode='22023',message='INVALID_SALE';
  end if;

  select s.inventory_branch_id,s.pricing_branch_id
    into v_inventory_branch,v_pricing_branch
  from private.resolve_branch_sources(p_branch_id) s;

  for x in select value from jsonb_array_elements(p_items) loop
    p := null;
    pv := null;
    v_variant_id := null;
    v_is_variant := false;
    v_variant_catalog_input := false;

    begin
      select * into p from public.products where id=(x->'product'->>'id')::uuid;
    exception when others then
      p := null;
    end;

    if p.id is null and coalesce((x->'product'->>'is_linked_sale_unit')::boolean,false) then
      begin
        v_variant_id := coalesce(
          nullif(x->'product'->>'variant_id','')::uuid,
          (x->'product'->>'id')::uuid
        );
      exception when others then
        v_variant_id := null;
      end;
      if v_variant_id is not null then
        select * into pv from public.product_variants where id=v_variant_id and active;
        if pv.id is not null then
          select * into p from public.products where id=pv.parent_product_id;
          v_is_variant := true;
          v_variant_catalog_input := true;
        end if;
      end if;
    end if;

    if p.id is null then
      return jsonb_build_object('ok',false,'code','PRODUCT_UNAVAILABLE','product_name',coalesce(x->'product'->>'name','منتج'));
    end if;

    if not v_is_variant then
      begin
        v_variant_id := nullif(x->'product'->>'variant_id','')::uuid;
      exception when others then
        v_variant_id := null;
      end;
      if v_variant_id is not null then
        select * into pv from public.product_variants
        where id=v_variant_id and parent_product_id=p.id and active;
        if pv.id is null then
          return jsonb_build_object('ok',false,'code','BULK_UNAVAILABLE','product_id',p.id,'product_name',coalesce(x->'product'->>'name',p.name));
        end if;
        v_is_variant := true;
      end if;
    end if;

    v_quantity := coalesce((x->>'quantity')::numeric,0);
    v_base_quantity := v_quantity;
    v_package_count := null;

    if v_variant_catalog_input then
      v_package_count := v_quantity;
      v_pack := pv.conversion_factor;
      v_pack_price := pv.price;
      v_base_quantity := v_package_count * v_pack;
      if v_package_count<=0 or round(v_package_count,0)<>v_package_count or v_pack<=1 or v_pack_price<=0 then
        return jsonb_build_object('ok',false,'code','INVALID_BULK_QUANTITY','product_id',p.id,'product_name',pv.name,'pack_size',v_pack);
      end if;
    elsif p.barcode_type='scale' and not v_is_variant then
      v_base_quantity := coalesce((x->>'weight')::numeric,v_quantity);
    elsif coalesce((x->>'isBulk')::boolean,false) then
      if v_is_variant then
        v_pack := pv.conversion_factor;
        v_pack_price := pv.price;
      else
        v_pack := p.bulk_quantity;
        v_pack_price := p.bulk_price;
      end if;
      if coalesce(v_pack,0)<=0 or coalesce(v_pack_price,0)<=0 or (not v_is_variant and not coalesce(p.bulk_enabled,false)) then
        return jsonb_build_object('ok',false,'code','BULK_UNAVAILABLE','product_id',p.id,'product_name',coalesce(x->'product'->>'name',p.name));
      end if;
      if mod(v_quantity,v_pack)<>0 then
        return jsonb_build_object('ok',false,'code','INVALID_BULK_QUANTITY','product_id',p.id,'product_name',coalesce(x->'product'->>'name',p.name),'pack_size',v_pack);
      end if;
      v_base_quantity := v_quantity;
      v_package_count := v_quantity/v_pack;
    end if;

    if v_base_quantity is null or v_base_quantity<=0 or v_base_quantity::text in ('NaN','Infinity','-Infinity') or round(v_base_quantity,3)<>v_base_quantity then
      return jsonb_build_object('ok',false,'code','INVALID_QUANTITY','product_id',p.id,'product_name',coalesce(x->'product'->>'name',p.name));
    end if;

    select exists(select 1 from public.branch_product_pricing bp where bp.branch_id=v_pricing_branch and bp.product_id=p.id)
      into v_has_bp;
    if v_has_bp then
      select bp.sale_price,bp.purchase_price,bp.offer_price,bp.is_offer
        into v_bp_sale,v_bp_purchase,v_bp_offer,v_bp_is_offer
      from public.branch_product_pricing bp
      where bp.branch_id=v_pricing_branch and bp.product_id=p.id
      limit 1;
      v_regular_price := coalesce(v_bp_sale,p.price,0);
      v_purchase_price := coalesce(v_bp_purchase,p.purchase_price,0);
      v_offer_price := v_bp_offer;
      v_offer_active := coalesce(v_bp_is_offer,false);
    else
      v_regular_price := coalesce(p.price,0);
      v_purchase_price := coalesce(p.purchase_price,0);
      v_offer_price := p.offer_price;
      v_offer_active := coalesce(p.is_offer,false);
    end if;

    if v_is_variant and (v_variant_catalog_input or coalesce((x->>'isBulk')::boolean,false)) then
      v_pack := pv.conversion_factor;
      v_pack_price := pv.price;
      if v_package_count is null then v_package_count := v_base_quantity/v_pack; end if;
      if coalesce(pv.purchase_price,0)>0 then
        v_purchase_price := pv.purchase_price/v_pack;
      end if;
      v_line_subtotal := round(v_regular_price*v_base_quantity,2);
      v_line_total := round(v_package_count*v_pack_price,2);
      v_effective_price := round(v_pack_price/v_pack,4);
      v_compare_price := case when v_variant_catalog_input then v_pack_price else v_effective_price end;
    elsif coalesce((x->>'isBulk')::boolean,false) then
      v_line_subtotal := round(v_regular_price*v_base_quantity,2);
      v_line_total := round((v_base_quantity/v_pack)*v_pack_price,2);
      v_effective_price := round(v_pack_price/v_pack,4);
      v_compare_price := v_effective_price;
    else
      v_effective_price := case when v_offer_active and v_offer_price is not null and v_offer_price>=0 then v_offer_price else v_regular_price end;
      v_line_subtotal := round(v_regular_price*v_base_quantity,2);
      v_line_total := round(v_effective_price*v_base_quantity,2);
      v_compare_price := v_effective_price;
    end if;

    v_line_discount := greatest(0,round(v_line_subtotal-v_line_total,2));
    v_discount_per_unit := case when v_base_quantity>0 then round(v_line_discount/v_base_quantity,4) else 0 end;

    select coalesce(i.quantity,0) into v_available
    from public.inventory i
    where i.product_id=p.id and i.branch_id=v_inventory_branch;
    v_available := coalesce(v_available,0);

    if abs(coalesce((x->>'total')::numeric,v_line_total)-v_line_total)>0.009
       or abs(coalesce((x->>'price')::numeric,v_compare_price)-v_compare_price)>0.009 then
      v_repriced := true;
    end if;

    v_item := x || jsonb_build_object(
      'quantity',case when p.barcode_type='scale' and not v_is_variant then coalesce((x->>'quantity')::numeric,1) else v_base_quantity end,
      'weight',case when p.barcode_type='scale' and not v_is_variant then to_jsonb(round(v_base_quantity,3)) else x->'weight' end,
      'isBulk',case when v_is_variant then true else coalesce((x->>'isBulk')::boolean,false) end,
      'price',v_effective_price,
      'discount',v_discount_per_unit,
      'total',v_line_total
    );
    v_item := jsonb_set(
      v_item,
      '{product}',
      coalesce(x->'product','{}'::jsonb) || jsonb_build_object(
        'id',p.id,
        'name',case when v_is_variant then pv.name else p.name end,
        'price',v_regular_price,
        'purchase_price',v_purchase_price,
        'offer_price',case when v_is_variant then null else v_offer_price end,
        'is_offer',case when v_is_variant then false else v_offer_active end,
        'bulk_enabled',case when v_is_variant then true else p.bulk_enabled end,
        'bulk_quantity',case when v_is_variant then pv.conversion_factor else p.bulk_quantity end,
        'bulk_price',case when v_is_variant then pv.price else p.bulk_price end,
        'bulk_barcode',case when v_is_variant then coalesce(pv.barcode,pv.bulk_barcode) else p.bulk_barcode end,
        'barcode',case when v_is_variant then coalesce(pv.barcode,pv.bulk_barcode) else p.barcode end,
        'barcode_type',case when v_is_variant then 'normal' else p.barcode_type end,
        'quantity',v_available,
        'image_urls',case when v_is_variant and pv.image_url is not null then jsonb_build_array(pv.image_url) else to_jsonb(coalesce(p.image_urls,'{}'::text[])) end,
        'variant_id',case when v_is_variant then to_jsonb(pv.id) else 'null'::jsonb end,
        'parent_product_id',case when v_is_variant then to_jsonb(p.id) else 'null'::jsonb end,
        'conversion_factor',case when v_is_variant then to_jsonb(pv.conversion_factor) else 'null'::jsonb end,
        'variant_type',case when v_is_variant then to_jsonb(pv.variant_type) else 'null'::jsonb end,
        'is_linked_sale_unit',v_is_variant
      ),
      true
    );

    v_items := v_items || jsonb_build_array(v_item);
    v_deductions := v_deductions || jsonb_build_array(jsonb_build_object('id',p.id,'quantity',v_base_quantity));
    v_subtotal := v_subtotal + v_line_subtotal;
    v_discount := v_discount + v_line_discount;
    v_total := v_total + v_line_total;
  end loop;

  for x in
    select jsonb_build_object('id',value->>'id','quantity',sum((value->>'quantity')::numeric))
    from jsonb_array_elements(v_deductions)
    group by value->>'id'
  loop
    select coalesce(i.quantity,0),p2.name
      into v_available,v_name
    from public.products p2
    left join public.inventory i on i.product_id=p2.id and i.branch_id=v_inventory_branch
    where p2.id=(x->>'id')::uuid;
    v_available := coalesce(v_available,0);
    v_requested := (x->>'quantity')::numeric;
    if v_requested>v_available then
      return jsonb_build_object('ok',false,'code','INSUFFICIENT_STOCK','product_id',x->>'id','product_name',v_name,'available',v_available,'requested',v_requested);
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,'items',v_items,'subtotal',round(v_subtotal,2),'discount',round(v_discount,2),
    'total',round(v_total,2),'repriced',v_repriced,'inventory_branch_id',v_inventory_branch,
    'pricing_branch_id',v_pricing_branch,'checked_at',now()
  );
end;
$function$;

revoke all on function public.preflight_pos_sale(uuid,jsonb) from public,anon;
grant execute on function public.preflight_pos_sale(uuid,jsonb) to authenticated;
