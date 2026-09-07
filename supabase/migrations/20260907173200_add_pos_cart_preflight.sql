create or replace function public.preflight_pos_sale(p_branch_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  p public.products%rowtype;
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
    begin
      select * into p from public.products where id=(x->'product'->>'id')::uuid;
    exception when others then
      return jsonb_build_object('ok',false,'code','PRODUCT_UNAVAILABLE','product_name',coalesce(x->'product'->>'name','منتج'));
    end;

    if p.id is null then
      return jsonb_build_object('ok',false,'code','PRODUCT_UNAVAILABLE','product_name',coalesce(x->'product'->>'name','منتج'));
    end if;

    v_quantity := coalesce((x->>'quantity')::numeric,0);
    if p.barcode_type='scale' then
      v_quantity := coalesce((x->>'weight')::numeric,v_quantity);
    elsif coalesce((x->>'isBulk')::boolean,false) then
      if not coalesce(p.bulk_enabled,false) or coalesce(p.bulk_quantity,0)<=0 or coalesce(p.bulk_price,0)<=0 then
        return jsonb_build_object('ok',false,'code','BULK_UNAVAILABLE','product_id',p.id,'product_name',p.name);
      end if;
      if mod(v_quantity,p.bulk_quantity)<>0 then
        return jsonb_build_object('ok',false,'code','INVALID_BULK_QUANTITY','product_id',p.id,'product_name',p.name,'pack_size',p.bulk_quantity);
      end if;
    end if;

    if v_quantity is null or v_quantity<=0 or v_quantity::text in ('NaN','Infinity','-Infinity') or round(v_quantity,3)<>v_quantity then
      return jsonb_build_object('ok',false,'code','INVALID_QUANTITY','product_id',p.id,'product_name',p.name);
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

    if coalesce((x->>'isBulk')::boolean,false) then
      v_line_subtotal := round(v_regular_price * v_quantity,2);
      v_line_total := round((v_quantity / p.bulk_quantity) * p.bulk_price,2);
      v_effective_price := round(p.bulk_price/p.bulk_quantity,4);
    else
      v_effective_price := case when v_offer_active and v_offer_price is not null and v_offer_price>=0 then v_offer_price else v_regular_price end;
      v_line_subtotal := round(v_regular_price * v_quantity,2);
      v_line_total := round(v_effective_price * v_quantity,2);
    end if;

    v_line_discount := greatest(0,round(v_line_subtotal-v_line_total,2));
    v_discount_per_unit := case when v_quantity>0 then round(v_line_discount/v_quantity,4) else 0 end;

    select coalesce(i.quantity,0) into v_available
    from public.inventory i
    where i.product_id=p.id and i.branch_id=v_inventory_branch;
    v_available := coalesce(v_available,0);

    if abs(coalesce((x->>'total')::numeric,v_line_total)-v_line_total)>0.009
       or abs(coalesce((x->>'price')::numeric,v_effective_price)-v_effective_price)>0.009 then
      v_repriced := true;
    end if;

    v_item := x || jsonb_build_object(
      'quantity',case when p.barcode_type='scale' then coalesce((x->>'quantity')::numeric,1) else v_quantity end,
      'weight',case when p.barcode_type='scale' then to_jsonb(round(v_quantity,3)) else x->'weight' end,
      'price',v_effective_price,
      'discount',v_discount_per_unit,
      'total',v_line_total
    );
    v_item := jsonb_set(
      v_item,
      '{product}',
      coalesce(x->'product','{}'::jsonb) || jsonb_build_object(
        'id',p.id,
        'name',p.name,
        'price',v_regular_price,
        'purchase_price',v_purchase_price,
        'offer_price',v_offer_price,
        'is_offer',v_offer_active,
        'bulk_enabled',p.bulk_enabled,
        'bulk_quantity',p.bulk_quantity,
        'bulk_price',p.bulk_price,
        'bulk_barcode',p.bulk_barcode,
        'barcode',p.barcode,
        'barcode_type',p.barcode_type,
        'quantity',v_available
      ),
      true
    );

    v_items := v_items || jsonb_build_array(v_item);
    v_deductions := v_deductions || jsonb_build_array(jsonb_build_object('id',p.id,'quantity',v_quantity));
    v_subtotal := v_subtotal + v_line_subtotal;
    v_discount := v_discount + v_line_discount;
    v_total := v_total + v_line_total;
  end loop;

  for x in
    select jsonb_build_object('id',value->>'id','quantity',sum((value->>'quantity')::numeric))
    from jsonb_array_elements(v_deductions)
    group by value->>'id'
  loop
    select coalesce(i.quantity,0), p2.name
      into v_available,v_name
    from public.products p2
    left join public.inventory i on i.product_id=p2.id and i.branch_id=v_inventory_branch
    where p2.id=(x->>'id')::uuid;
    v_available := coalesce(v_available,0);
    v_requested := (x->>'quantity')::numeric;
    if v_requested>v_available then
      return jsonb_build_object(
        'ok',false,
        'code','INSUFFICIENT_STOCK',
        'product_id',x->>'id',
        'product_name',v_name,
        'available',v_available,
        'requested',v_requested
      );
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'items',v_items,
    'subtotal',round(v_subtotal,2),
    'discount',round(v_discount,2),
    'total',round(v_total,2),
    'repriced',v_repriced,
    'inventory_branch_id',v_inventory_branch,
    'pricing_branch_id',v_pricing_branch,
    'checked_at',now()
  );
end;
$function$;

revoke all on function public.preflight_pos_sale(uuid,jsonb) from public;
grant execute on function public.preflight_pos_sale(uuid,jsonb) to authenticated;
