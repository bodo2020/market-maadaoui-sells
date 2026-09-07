-- Server-authoritative POS sale pricing, stock and profit validation.
-- The client submits the cart intent, but branch pricing and totals are recomputed here.
create or replace function private.create_pos_sale(p_request_id uuid, p_branch_id uuid, p_sale jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  previous public.sales%rowtype;
  saved public.sales%rowtype;
  p public.products%rowtype;
  x jsonb;
  deductions jsonb := '[]'::jsonb;
  canonical_items jsonb := '[]'::jsonb;
  quantity numeric;
  client_total numeric;
  cash numeric;
  card numeric;
  method text;
  fingerprint text;
  v_inventory_branch uuid;
  v_pricing_branch uuid;
  v_invoice_number text;
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
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_profit numeric := 0;
  v_item jsonb;
begin
  if auth.uid() is null or p_branch_id is null or not private.can_operate_cash_branch(p_branch_id) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;
  if p_request_id is null or jsonb_typeof(p_sale->'items') is distinct from 'array' then
    raise exception using errcode='22023',message='INVALID_SALE';
  end if;

  select s.inventory_branch_id,s.pricing_branch_id
    into v_inventory_branch,v_pricing_branch
  from private.resolve_branch_sources(p_branch_id) s;

  fingerprint := md5(jsonb_build_array(p_branch_id,v_inventory_branch,v_pricing_branch,p_sale - 'invoice_number')::text);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,8));
  select * into previous from public.sales where id=p_request_id;
  if found then
    if previous.cashier_id<>auth.uid() or previous.request_fingerprint is distinct from fingerprint then
      raise exception using errcode='42501',message='REQUEST_CONFLICT';
    end if;
    return to_jsonb(previous);
  end if;

  if jsonb_array_length(p_sale->'items') not between 1 and 300 then
    raise exception using errcode='22023',message='INVALID_SALE';
  end if;

  client_total := coalesce((p_sale->>'total')::numeric,0);
  cash := coalesce((p_sale->>'cash_amount')::numeric,0);
  card := coalesce((p_sale->>'card_amount')::numeric,0);
  method := p_sale->>'payment_method';
  if method is null or method not in ('cash','card','mixed') or cash<0 or card<0
     or cash::text in ('NaN','Infinity') or card::text in ('NaN','Infinity') then
    raise exception using errcode='22023',message='INVALID_PAYMENT_SPLIT';
  end if;

  for x in select value from jsonb_array_elements(p_sale->'items') order by value->'product'->>'id' loop
    select * into p from public.products where id=(x->'product'->>'id')::uuid for update;
    if p.id is null then
      raise exception using errcode='22023',message='PRODUCT_UNAVAILABLE';
    end if;

    quantity := coalesce((x->>'quantity')::numeric,0);
    if p.barcode_type='scale' then
      quantity := coalesce((x->>'weight')::numeric,quantity);
    elsif coalesce((x->>'isBulk')::boolean,false) then
      if not coalesce(p.bulk_enabled,false) or coalesce(p.bulk_quantity,0)<=0 or coalesce(p.bulk_price,0)<=0 then
        raise exception using errcode='22023',message='BULK_UNAVAILABLE';
      end if;
      if mod(quantity,p.bulk_quantity)<>0 then
        raise exception using errcode='22023',message='INVALID_BULK_QUANTITY';
      end if;
    end if;
    if quantity is null or quantity<=0 or quantity::text in ('NaN','Infinity') or round(quantity,3)<>quantity then
      raise exception using errcode='22023',message='INVALID_QUANTITY';
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
      v_line_subtotal := round(v_regular_price * quantity,2);
      v_line_total := round((quantity / p.bulk_quantity) * p.bulk_price,2);
      v_line_discount := greatest(0,round(v_line_subtotal-v_line_total,2));
      v_effective_price := round(p.bulk_price/p.bulk_quantity,4);
    else
      v_effective_price := case when v_offer_active and v_offer_price is not null and v_offer_price>=0 then v_offer_price else v_regular_price end;
      v_line_subtotal := round(v_regular_price * quantity,2);
      v_line_total := round(v_effective_price * quantity,2);
      v_line_discount := greatest(0,round(v_line_subtotal-v_line_total,2));
    end if;

    v_subtotal := v_subtotal + v_line_subtotal;
    v_discount := v_discount + v_line_discount;
    v_total := v_total + v_line_total;
    v_profit := v_profit + round(v_line_total - (v_purchase_price * quantity),2);

    v_item := x || jsonb_build_object(
      'quantity',case when p.barcode_type='scale' then coalesce((x->>'quantity')::numeric,1) else quantity end,
      'price',v_effective_price,
      'discount',v_line_discount,
      'total',v_line_total
    );
    v_item := jsonb_set(v_item,'{product}',coalesce(x->'product','{}'::jsonb) || jsonb_build_object(
      'id',p.id,'name',p.name,'price',v_regular_price,'purchase_price',v_purchase_price,
      'offer_price',v_offer_price,'is_offer',v_offer_active,'bulk_enabled',p.bulk_enabled,
      'bulk_quantity',p.bulk_quantity,'bulk_price',p.bulk_price,'barcode_type',p.barcode_type
    ),true);
    canonical_items := canonical_items || jsonb_build_array(v_item);
    deductions := deductions || jsonb_build_array(jsonb_build_object('id',p.id,'quantity',quantity));
  end loop;

  v_subtotal := round(v_subtotal,2);
  v_discount := round(v_discount,2);
  v_total := round(v_total,2);
  v_profit := round(v_profit,2);

  if abs(round(client_total,2)-v_total)>0.009 then
    raise exception using errcode='22023',message='PRICE_CHANGED';
  end if;
  if method='cash' and cash=0 and card=0 then cash:=v_total; end if;
  if method='card' and cash=0 and card=0 then card:=v_total; end if;
  if round(cash+card,2)<>v_total then
    raise exception using errcode='22023',message='INVALID_PAYMENT_SPLIT';
  end if;

  for x in
    select jsonb_build_object('id',value->>'id','quantity',sum((value->>'quantity')::numeric))
    from jsonb_array_elements(deductions)
    group by value->>'id'
    order by value->>'id'
  loop
    update public.inventory
      set quantity=inventory.quantity-(x->>'quantity')::numeric
    where product_id=(x->>'id')::uuid and branch_id=v_inventory_branch
      and inventory.quantity>=(x->>'quantity')::numeric;
    if not found then
      raise exception using errcode='22023',message='INSUFFICIENT_STOCK';
    end if;
  end loop;

  v_invoice_number := private.next_pos_invoice_number(p_branch_id);
  insert into public.sales(
    id,items,cashier_id,cashier_name,branch_id,subtotal,discount,total,profit,payment_method,
    cash_amount,card_amount,customer_name,customer_phone,invoice_number,request_fingerprint
  ) values (
    p_request_id,canonical_items,auth.uid(),(select name from public.users where id=auth.uid()),p_branch_id,
    v_subtotal,v_discount,v_total,v_profit,method,cash,card,p_sale->>'customer_name',p_sale->>'customer_phone',
    v_invoice_number,fingerprint
  ) returning * into saved;

  return to_jsonb(saved)||jsonb_build_object('inventory_branch_id',v_inventory_branch,'pricing_branch_id',v_pricing_branch);
end;
$function$;
