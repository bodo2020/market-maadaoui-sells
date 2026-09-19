-- M14 Inventory Reservations — production-aligned schema snapshot
-- Production migration history: 20260919114304 inventory_reservations_m14

alter table public.online_orders
  add column if not exists inventory_reservation_version smallint;

create table if not exists private.inventory_reservation_balances_v1 (
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  reserved_quantity numeric not null default 0 check (reserved_quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id, product_id)
);

create table if not exists private.inventory_reservations_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.online_orders(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  state text not null default 'reserved'
    check (state in ('reserved','committed','released','restocked')),
  source_kind text not null,
  reserved_at timestamptz not null default now(),
  committed_at timestamptz,
  released_at timestamptz,
  restocked_at timestamptz,
  release_reason text,
  metadata jsonb not null default '{}'::jsonb,
  unique (order_id, branch_id, product_id)
);

alter table private.inventory_reservation_balances_v1 enable row level security;
alter table private.inventory_reservations_v1 enable row level security;

revoke all on table private.inventory_reservation_balances_v1 from public, anon, authenticated;
revoke all on table private.inventory_reservations_v1 from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.inventory_reserved_quantity_v1(p_branch_id uuid, p_product_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((select b.reserved_quantity from private.inventory_reservation_balances_v1 b
    where b.branch_id=p_branch_id and b.product_id=p_product_id),0)::numeric;
$function$;

CREATE OR REPLACE FUNCTION private.inventory_available_quantity_v1(p_branch_id uuid, p_product_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select greatest(coalesce((select i.quantity from public.inventory i
    where i.branch_id=p_branch_id and i.product_id=p_product_id),0)
    -private.inventory_reserved_quantity_v1(p_branch_id,p_product_id),0)::numeric;
$function$;

CREATE OR REPLACE FUNCTION private.reserve_order_inventory_v1(p_order_id uuid, p_stock jsonb, p_fallback_branch_id uuid, p_source_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_item jsonb; v_branch uuid; v_product uuid; v_qty numeric; v_on_hand numeric; v_reserved numeric;
  v_count integer:=0; v_total numeric:=0;
begin
  if p_order_id is null or jsonb_typeof(p_stock) is distinct from 'array' then
    raise exception using errcode='22023',message='RESERVATION_INPUT_INVALID'; end if;
  if not exists(select 1 from public.online_orders o where o.id=p_order_id) then
    raise exception using errcode='P0002',message='RESERVATION_ORDER_NOT_FOUND'; end if;

  for v_item in select value from jsonb_array_elements(p_stock)
    order by coalesce(value->>'branch_id',p_fallback_branch_id::text),value->>'product_id'
  loop
    begin
      v_branch:=coalesce(nullif(v_item->>'branch_id','')::uuid,p_fallback_branch_id);
      v_product:=(v_item->>'product_id')::uuid; v_qty:=(v_item->>'quantity')::numeric;
    exception when others then raise exception using errcode='22023',message='RESERVATION_INPUT_INVALID'; end;
    if v_branch is null or v_product is null or v_qty<=0 or round(v_qty,3)<>v_qty then
      raise exception using errcode='22023',message='RESERVATION_INPUT_INVALID'; end if;
    if exists(select 1 from private.inventory_reservations_v1 r
      where r.order_id=p_order_id and r.branch_id=v_branch and r.product_id=v_product) then continue; end if;

    select i.quantity into v_on_hand from public.inventory i
    where i.branch_id=v_branch and i.product_id=v_product for update;
    if v_on_hand is null then raise exception using errcode='22023',message='INSUFFICIENT_STOCK',detail=v_product::text; end if;

    insert into private.inventory_reservation_balances_v1(branch_id,product_id,reserved_quantity)
    values(v_branch,v_product,0) on conflict(branch_id,product_id) do nothing;
    select b.reserved_quantity into v_reserved from private.inventory_reservation_balances_v1 b
    where b.branch_id=v_branch and b.product_id=v_product for update;

    if greatest(v_on_hand-coalesce(v_reserved,0),0)<v_qty then
      raise exception using errcode='22023',message='INSUFFICIENT_STOCK',detail=v_product::text; end if;

    update private.inventory_reservation_balances_v1
    set reserved_quantity=reserved_quantity+v_qty,updated_at=now()
    where branch_id=v_branch and product_id=v_product;
    insert into private.inventory_reservations_v1(order_id,branch_id,product_id,quantity,state,source_kind,metadata)
    values(p_order_id,v_branch,v_product,v_qty,'reserved',coalesce(nullif(p_source_kind,''),'online_order'),
      jsonb_build_object('reservation_version',1));
    v_count:=v_count+1; v_total:=v_total+v_qty;
  end loop;

  update private.order_intake_state_v1 set inventory_state='reserved',
    validation=coalesce(validation,'{}'::jsonb)||jsonb_build_object('inventory_reservation_version',1,'reservation_state','reserved'),
    updated_at=now() where order_id=p_order_id;
  return jsonb_build_object('order_id',p_order_id,'state','reserved','lines',v_count,'quantity',v_total);
end $function$;

CREATE OR REPLACE FUNCTION private.commit_order_inventory_reservation_v1(p_order_id uuid, p_reason text DEFAULT 'order_ready'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r private.inventory_reservations_v1%rowtype; v_on_hand numeric; v_balance numeric; v_count integer:=0; v_total numeric:=0;
begin
  for r in select * from private.inventory_reservations_v1
    where order_id=p_order_id and state='reserved' order by branch_id,product_id for update
  loop
    select i.quantity into v_on_hand from public.inventory i
    where i.branch_id=r.branch_id and i.product_id=r.product_id for update;
    if v_on_hand is null or v_on_hand<r.quantity then
      raise exception using errcode='55000',message='RESERVED_STOCK_COMMIT_FAILED',detail=r.product_id::text; end if;
    select b.reserved_quantity into v_balance from private.inventory_reservation_balances_v1 b
    where b.branch_id=r.branch_id and b.product_id=r.product_id for update;
    if coalesce(v_balance,0)<r.quantity then
      raise exception using errcode='55000',message='RESERVATION_BALANCE_CORRUPT',detail=r.product_id::text; end if;

    update private.inventory_reservation_balances_v1 set reserved_quantity=reserved_quantity-r.quantity,updated_at=now()
    where branch_id=r.branch_id and product_id=r.product_id;
    perform set_config('app.inventory_movement_source','online_order_reservation_commit',true);
    perform set_config('app.inventory_reason_code',coalesce(nullif(p_reason,''),'order_ready'),true);
    perform set_config('app.inventory_note','Reserved stock committed for order '||p_order_id::text,true);
    update public.inventory set quantity=quantity-r.quantity,updated_at=now()
    where branch_id=r.branch_id and product_id=r.product_id;
    update private.inventory_reservations_v1 set state='committed',committed_at=now(),
      metadata=metadata||jsonb_build_object('commit_reason',p_reason) where id=r.id;
    v_count:=v_count+1; v_total:=v_total+r.quantity;
  end loop;
  update private.order_intake_state_v1 set inventory_state='committed',
    validation=coalesce(validation,'{}'::jsonb)||jsonb_build_object('reservation_state','committed'),updated_at=now()
  where order_id=p_order_id and v_count>0;
  return jsonb_build_object('order_id',p_order_id,'state','committed','lines',v_count,'quantity',v_total);
end $function$;

CREATE OR REPLACE FUNCTION private.release_order_inventory_reservation_v1(p_order_id uuid, p_reason text DEFAULT 'order_cancelled'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r private.inventory_reservations_v1%rowtype; v_balance numeric; v_count integer:=0; v_restocked integer:=0; v_total numeric:=0;
begin
  for r in select * from private.inventory_reservations_v1
    where order_id=p_order_id and state in ('reserved','committed') order by branch_id,product_id for update
  loop
    perform 1 from public.inventory i where i.branch_id=r.branch_id and i.product_id=r.product_id for update;
    if not found then raise exception using errcode='55000',message='RESERVATION_STOCK_ROW_MISSING',detail=r.product_id::text; end if;
    if r.state='reserved' then
      select b.reserved_quantity into v_balance from private.inventory_reservation_balances_v1 b
      where b.branch_id=r.branch_id and b.product_id=r.product_id for update;
      if coalesce(v_balance,0)<r.quantity then
        raise exception using errcode='55000',message='RESERVATION_BALANCE_CORRUPT',detail=r.product_id::text; end if;
      update private.inventory_reservation_balances_v1 set reserved_quantity=reserved_quantity-r.quantity,updated_at=now()
      where branch_id=r.branch_id and product_id=r.product_id;
      update private.inventory_reservations_v1 set state='released',released_at=now(),release_reason=p_reason where id=r.id;
    else
      perform set_config('app.inventory_movement_source','online_order_cancel_restock',true);
      perform set_config('app.inventory_reason_code',coalesce(nullif(p_reason,''),'order_cancelled'),true);
      perform set_config('app.inventory_note','Committed order stock restocked for order '||p_order_id::text,true);
      update public.inventory set quantity=quantity+r.quantity,updated_at=now()
      where branch_id=r.branch_id and product_id=r.product_id;
      update private.inventory_reservations_v1 set state='restocked',restocked_at=now(),
        released_at=coalesce(released_at,now()),release_reason=p_reason where id=r.id;
      v_restocked:=v_restocked+1;
    end if;
    v_count:=v_count+1; v_total:=v_total+r.quantity;
  end loop;
  update private.order_intake_state_v1 set inventory_state='released',
    validation=coalesce(validation,'{}'::jsonb)||jsonb_build_object('reservation_state','released'),updated_at=now()
  where order_id=p_order_id and v_count>0;
  return jsonb_build_object('order_id',p_order_id,'state','released','lines',v_count,'restocked_lines',v_restocked,'quantity',v_total);
end $function$;

CREATE OR REPLACE FUNCTION private.consume_available_inventory_v1(p_branch_id uuid, p_product_id uuid, p_quantity numeric, p_source text DEFAULT 'inventory_consume'::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_on_hand numeric; v_reserved numeric; v_after numeric;
begin
  if p_branch_id is null or p_product_id is null or p_quantity is null or p_quantity<=0 or round(p_quantity,3)<>p_quantity then
    raise exception using errcode='22023',message='INVALID_STOCK_CHANGE'; end if;
  select i.quantity into v_on_hand from public.inventory i where i.branch_id=p_branch_id and i.product_id=p_product_id for update;
  if v_on_hand is null then raise exception using errcode='22023',message='INSUFFICIENT_STOCK'; end if;
  select coalesce(b.reserved_quantity,0) into v_reserved from private.inventory_reservation_balances_v1 b
  where b.branch_id=p_branch_id and b.product_id=p_product_id;
  v_reserved:=coalesce(v_reserved,0);
  if greatest(v_on_hand-v_reserved,0)<p_quantity then
    raise exception using errcode='22023',message='INSUFFICIENT_STOCK',
      detail=jsonb_build_object('product_id',p_product_id,'available',greatest(v_on_hand-v_reserved,0),'required',p_quantity)::text; end if;
  perform set_config('app.inventory_movement_source',coalesce(nullif(p_source,''),'inventory_consume'),true);
  update public.inventory set quantity=quantity-p_quantity,updated_at=now()
  where branch_id=p_branch_id and product_id=p_product_id returning quantity into v_after;
  return v_after;
end $function$;

CREATE OR REPLACE FUNCTION private.guard_inventory_reserved_stock_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_reserved numeric:=0;
begin
  select coalesce(b.reserved_quantity,0) into v_reserved
  from private.inventory_reservation_balances_v1 b
  where b.branch_id=old.branch_id and b.product_id=old.product_id;
  v_reserved:=coalesce(v_reserved,0);
  if tg_op='DELETE' then
    if v_reserved>0 then raise exception using errcode='55000',message='RESERVED_STOCK_PROTECTED'; end if;
    return old;
  end if;
  if greatest(coalesce(new.quantity,0),0)<v_reserved then
    raise exception using errcode='22023',message='RESERVED_STOCK_PROTECTED',
      detail=jsonb_build_object('product_id',old.product_id,'on_hand_after',new.quantity,'reserved',v_reserved)::text;
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.sync_order_inventory_reservation_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(new.inventory_reservation_version,0)<>1 then return new; end if;
  if new.status::text in ('ready','shipped','delivered') then
    perform private.commit_order_inventory_reservation_v1(new.id,'order_'||new.status::text);
  elsif new.status::text='cancelled' and old.status::text is distinct from 'cancelled' then
    perform private.release_order_inventory_reservation_v1(new.id,
      coalesce(nullif(current_setting('app.order_cancel_reason',true),''),'order_cancelled'));
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.capture_order_intake_eta_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_intake_state text;
  v_eligible boolean;
  v_decision text;
begin
  v_intake_state := private.order_intake_stage_v1(new.status::text, null);
  v_eligible := coalesce(new.checkout_version = 1
    and new.branch_id is not null
    and jsonb_typeof(new.items) = 'array'
    and jsonb_array_length(new.items) > 0
    and jsonb_typeof(new.stock_deductions) = 'array'
    and new.payment_method in ('cash','wallet'), false);
  v_decision := case when v_eligible then 'shadow_eligible' else 'shadow_review' end;

  insert into private.order_intake_state_v1(
    order_id,branch_id,intake_state,decision,auto_accept_eligible,inventory_state,payment_state,
    validation,received_at,evaluated_at,confirmed_at,completed_at,updated_at
  ) values (
    new.id,new.branch_id,v_intake_state,v_decision,v_eligible,
    case
      when new.stock_released_at is not null then 'released'
      when coalesce(new.inventory_reservation_version,0)=1 then 'reservation_pending'
      when jsonb_typeof(new.stock_deductions)='array' then 'committed'
      else 'unknown'
    end,
    new.payment_status::text,
    jsonb_build_object('checkout_version',new.checkout_version,'branch_resolved',new.branch_id is not null,
      'items_valid',jsonb_typeof(new.items)='array' and jsonb_array_length(new.items)>0,
      'stock_snapshot_present',jsonb_typeof(new.stock_deductions)='array',
      'inventory_reservation_version',new.inventory_reservation_version,'mode','shadow'),
    coalesce(new.created_at,now()),now(),
    case when new.status::text not in ('pending','cancelled') then coalesce(new.updated_at,now()) end,
    case when new.status::text in ('delivered','cancelled') then coalesce(new.updated_at,now()) end,
    now()
  ) on conflict(order_id) do update set
    branch_id=excluded.branch_id,intake_state=excluded.intake_state,
    inventory_state=excluded.inventory_state,payment_state=excluded.payment_state,
    confirmed_at=coalesce(private.order_intake_state_v1.confirmed_at,excluded.confirmed_at),
    completed_at=coalesce(private.order_intake_state_v1.completed_at,excluded.completed_at),
    updated_at=now();

  if tg_op = 'INSERT' or old.status is distinct from new.status or old.payment_status is distinct from new.payment_status then
    insert into private.order_intake_events_v1(order_id,event_type,order_status,intake_state,actor_user_id,metadata)
    values(new.id,case when tg_op='INSERT' then 'order_received' else 'order_state_changed' end,
      new.status::text,v_intake_state,auth.uid(),jsonb_build_object('payment_status',new.payment_status::text,'mode','shadow'));
  end if;

  perform private.recalculate_order_eta_v1(new.id,case when tg_op='INSERT' then 'order_received' else 'order_updated' end);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.customer_checkout_plan(p_items jsonb, p_address_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c public.customers%rowtype;
  a public.customer_addresses%rowtype;
  p public.products%rowtype;
  b public.branches%rowtype;
  bp public.branch_product_pricing%rowtype;
  bv public.product_variants%rowtype;
  x jsonb;
  lines jsonb := '[]';
  deductions jsonb;
  shipping jsonb;
  result jsonb;
  qty numeric;
  units numeric;
  price numeric;
  line_total numeric;
  subtotal numeric := 0;
  shipping_price numeric;
  branch uuid;
  inventory_branch uuid;
  pricing_branch uuid;
  branch_distance double precision;
  bulk boolean;
  weight boolean;
  free_delivery boolean;
  bulk_qty numeric;
  line_name text;
  line_barcode text;
  line_image text;
  line_variant_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;

  select * into c from public.customers where user_id=auth.uid();
  if c.id is null or length(trim(coalesce(c.name,'')))<2 then
    raise exception using errcode='22023',message='PROFILE_REQUIRED';
  end if;

  select * into a from public.customer_addresses where id=p_address_id and user_id=auth.uid();
  if a.id is null or length(trim(a.address))=0 then
    raise exception using errcode='42501',message='ADDRESS_REQUIRED';
  end if;
  if a.latitude is null or a.longitude is null then
    raise exception using errcode='22023',message='DELIVERY_UNAVAILABLE';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode='22023',message='INVALID_CART';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode='22023',message='INVALID_CART';
  end if;

  select r.branch_id,r.distance_km,r.delivery_fee
    into branch,branch_distance,shipping_price
  from public.find_delivery_branch(a.latitude::double precision,a.longitude::double precision) r
  limit 1;
  if branch is null then
    raise exception using errcode='22023',message='DELIVERY_UNAVAILABLE';
  end if;

  select * into b from public.branches where id=branch and active and delivery_enabled for share;
  if b.id is null then
    raise exception using errcode='22023',message='DELIVERY_UNAVAILABLE';
  end if;

  select s.inventory_branch_id,s.pricing_branch_id
    into inventory_branch,pricing_branch
  from private.resolve_branch_sources(b.id) s;
  shipping_price := coalesce(shipping_price,b.delivery_fee,0);

  for x in select value from jsonb_array_elements(p_items) order by value->>'product_id',value->>'is_bulk' loop
    if jsonb_typeof(x->'quantity') is distinct from 'number'
       or jsonb_typeof(x->'is_bulk') is distinct from 'boolean' then
      raise exception using errcode='22023',message='INVALID_CART';
    end if;

    qty := (x->>'quantity')::numeric;
    bulk := (x->>'is_bulk')::boolean;
    if qty<>trunc(qty) or qty not between 1 and 100000 then
      raise exception using errcode='22023',message='INVALID_QUANTITY';
    end if;

    select * into p from public.products where id=(x->>'product_id')::uuid for update;
    if p.id is null then
      raise exception using errcode='22023',message='PRODUCT_UNAVAILABLE';
    end if;

    weight := p.barcode_type='scale' or coalesce(p.unit_of_measure,'') in ('weight','kg','كيلوجرام','كجم');
    weight := coalesce(weight,false);
    if coalesce(x->>'unit_of_measure','piece')<>(case when weight then 'weight' else 'piece' end) then
      raise exception using errcode='22023',message='PRODUCT_UNIT_CHANGED';
    end if;

    select * into bp
    from public.branch_product_pricing
    where branch_id=pricing_branch and product_id=p.id
    for share;

    price := case when bp.id is not null
      then case when bp.is_offer and bp.offer_price is not null then bp.offer_price else bp.sale_price end
      else case when p.is_offer and p.offer_price is not null then p.offer_price else p.price end
    end;

    units := qty;
    bulk_qty := null;
    line_name := p.name;
    line_barcode := p.barcode;
    line_image := p.image_urls[1];
    line_variant_id := null;

    if bulk then
      if weight then
        raise exception using errcode='22023',message='BULK_UNAVAILABLE';
      end if;

      bv := null;
      select pv.* into bv
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
      limit 1;

      if bv.id is not null then
        bulk_qty := bv.conversion_factor;
        price := bv.price;
        units := qty * bv.conversion_factor;
        line_name := coalesce(nullif(btrim(bv.name),''),p.name);
        line_barcode := coalesce(nullif(btrim(bv.barcode),''),p.bulk_barcode,p.barcode);
        line_image := coalesce(nullif(btrim(bv.image_url),''),p.image_urls[1]);
        line_variant_id := bv.id;
      else
        if not coalesce(p.bulk_enabled,false)
           or coalesce(p.bulk_quantity,0)<=0
           or p.bulk_price is null then
          raise exception using errcode='22023',message='BULK_UNAVAILABLE';
        end if;
        bulk_qty := p.bulk_quantity;
        price := p.bulk_price;
        units := qty * p.bulk_quantity;
        line_barcode := coalesce(p.bulk_barcode,p.barcode);
      end if;
    elsif weight then
      units := qty/1000;
    end if;

    if private.inventory_available_quantity_v1(inventory_branch,p.id)<units then
      raise exception using errcode='22023',message='INSUFFICIENT_STOCK',detail=p.id::text;
    end if;
    if price is null or price<0 then
      raise exception using errcode='22023',message='PRICE_UNAVAILABLE';
    end if;

    line_total := round(price*(case when weight then units else qty end),2);
    subtotal := subtotal+line_total;
    lines := lines || jsonb_build_array(jsonb_build_object(
      'product_id',p.id,
      'variant_id',line_variant_id,
      'name',line_name,
      'product_name',line_name,
      'barcode',line_barcode,
      'image_url',line_image,
      'quantity',case when weight then units else qty end,
      'price',price,
      'total',line_total,
      'is_bulk',bulk,
      'bulk_quantity',bulk_qty,
      'unit_of_measure',case when weight then 'weight' else 'piece' end,
      'is_weight_based',weight,
      'stock_quantity',units
    ));
  end loop;

  select jsonb_agg(jsonb_build_object('product_id',id,'quantity',quantity,'branch_id',inventory_branch) order by id)
    into deductions
  from (
    select value->>'product_id' id,sum((value->>'stock_quantity')::numeric) quantity
    from jsonb_array_elements(lines)
    group by 1
  ) s;

  perform 1 from public.special_offers where offer_type='free_delivery' and active for share;
  select exists(
    select 1 from public.special_offers
    where offer_type='free_delivery' and active
      and usage_limit is null
      and coalesce(min_order_amount,0)<=subtotal
      and (expiry_date is null or expiry_date >= (now() at time zone 'Africa/Cairo')::date)
  ) into free_delivery;
  if free_delivery then shipping_price:=0; end if;

  shipping := jsonb_build_object(
    'address_id',a.id,
    'address',a.address,
    'latitude',a.latitude,
    'longitude',a.longitude,
    'assigned_branch_id',branch,
    'distance_km',round(branch_distance::numeric,3)
  );

  result := jsonb_build_object(
    'items',lines,
    'subtotal',subtotal,
    'shipping_cost',shipping_price,
    'total',subtotal+shipping_price,
    'free_delivery',free_delivery,
    'branch_id',b.id,
    'inventory_branch_id',inventory_branch,
    'pricing_branch_id',pricing_branch,
    'delivery_location_id',null,
    'customer_id',c.id,
    'customer_snapshot',jsonb_build_object('name',trim(c.name),'phone',c.phone),
    'shipping_snapshot',shipping,
    'stock_deductions',deductions
  );

  return result || jsonb_build_object('quote_token',md5(result::text));
end;
$function$;

CREATE OR REPLACE FUNCTION private.marketplace_quote_plan_v1(p_branch_id uuid, p_items jsonb, p_latitude double precision, p_longitude double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_branch public.branches%rowtype;
  v_merchant public.merchants%rowtype;
  v_delivery record;
  v_item jsonb;
  v_row record;
  v_qty numeric;
  v_units numeric;
  v_price numeric;
  v_line_total numeric;
  v_subtotal numeric:=0;
  v_lines jsonb:='[]'::jsonb;
  v_deductions jsonb;
  v_result jsonb;
  v_weight boolean;
  v_expected_unit text;
begin
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode='22023',message='INVALID_CART';
  end if;

  if p_latitude is null or p_longitude is null
     or p_latitude<-90 or p_latitude>90
     or p_longitude<-180 or p_longitude>180 then
    raise exception using errcode='22023',message='DELIVERY_ADDRESS_REQUIRED';
  end if;

  select b.* into v_branch
  from public.branches b
  where b.id=p_branch_id
    and b.marketplace_customer_enabled
    and b.active
    and b.latitude is not null
    and b.longitude is not null;

  if v_branch.id is null then
    raise exception using errcode='22023',message='MARKETPLACE_STORE_UNAVAILABLE';
  end if;

  select m.* into v_merchant
  from public.merchants m
  where m.id=v_branch.merchant_id
    and m.merchant_type in ('partner','franchise')
    and m.status='active'
    and m.customer_published_at is not null;

  if v_merchant.id is null then
    raise exception using errcode='22023',message='MARKETPLACE_STORE_UNAVAILABLE';
  end if;

  select fd.* into v_delivery
  from public.find_delivery_branch(p_latitude,p_longitude) fd
  where fd.branch_id=v_branch.hub_branch_id;

  if v_delivery.branch_id is null then
    raise exception using errcode='22023',message='DELIVERY_UNAVAILABLE';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
    order by value->>'listing_id'
  loop
    if jsonb_typeof(v_item)<>'object'
       or v_item->>'listing_id' is null
       or jsonb_typeof(v_item->'quantity') is distinct from 'number' then
      raise exception using errcode='22023',message='INVALID_CART';
    end if;

    if coalesce((v_item->>'is_bulk')::boolean,false) then
      raise exception using errcode='22023',message='BULK_UNAVAILABLE';
    end if;

    v_qty:=(v_item->>'quantity')::numeric;
    if v_qty<>trunc(v_qty) or v_qty not between 1 and 100000 then
      raise exception using errcode='22023',message='INVALID_QUANTITY';
    end if;

    select
      ml.id as listing_id,
      ml.product_id,
      ml.preparation_minutes,
      p.name,
      p.barcode,
      p.barcode_type,
      p.unit_of_measure,
      p.image_urls,
      bp.sale_price,
      bp.offer_price,
      bp.is_offer,
      private.inventory_available_quantity_v1(i.branch_id,i.product_id) as stock
    into v_row
    from public.merchant_listings ml
    join public.products p on p.id=ml.product_id
    join public.branch_product_pricing bp
      on bp.branch_id=ml.branch_id and bp.product_id=ml.product_id
    join public.inventory i
      on i.branch_id=ml.branch_id and i.product_id=ml.product_id
    where ml.id=(v_item->>'listing_id')::uuid
      and ml.branch_id=v_branch.id
      and ml.merchant_id=v_merchant.id
      and ml.marketplace_customer_enabled=true
      and ml.status='active';

    if v_row.listing_id is null then
      raise exception using errcode='22023',message='PRODUCT_UNAVAILABLE';
    end if;

    v_weight:=coalesce(v_row.barcode_type='scale',false)
      or coalesce(v_row.unit_of_measure,'') in ('weight','kg','كيلوجرام','كجم');

    v_expected_unit:=case when v_weight then 'weight' else 'piece' end;

    if coalesce(v_item->>'unit_of_measure','piece')<>v_expected_unit then
      raise exception using errcode='22023',message='PRODUCT_UNIT_CHANGED';
    end if;

    v_price:=case
      when coalesce(v_row.is_offer,false) and v_row.offer_price is not null
        then v_row.offer_price
      else v_row.sale_price
    end;

    if v_price is null or v_price<0 then
      raise exception using errcode='22023',message='PRICE_UNAVAILABLE';
    end if;

    v_units:=case when v_weight then v_qty/1000.0 else v_qty end;
    if coalesce(v_row.stock,0)<v_units then
      raise exception using errcode='22023',message='INSUFFICIENT_STOCK',detail=v_row.product_id::text;
    end if;

    v_line_total:=round(v_price*(case when v_weight then v_units else v_qty end),2);
    v_subtotal:=v_subtotal+v_line_total;

    v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
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

  select jsonb_agg(
    jsonb_build_object(
      'product_id',product_id,
      'quantity',quantity,
      'branch_id',v_branch.id
    )
    order by product_id
  )
  into v_deductions
  from (
    select
      (value->>'product_id')::uuid as product_id,
      sum((value->>'stock_quantity')::numeric) as quantity
    from jsonb_array_elements(v_lines)
    group by 1
  ) s;

  v_result:=jsonb_build_object(
    'source_kind','marketplace',
    'merchant_id',v_merchant.id,
    'merchant_name',v_merchant.name,
    'branch_id',v_branch.id,
    'branch_name',v_branch.name,
    'pickup_address',v_branch.address,
    'pickup_latitude',v_branch.latitude,
    'pickup_longitude',v_branch.longitude,
    'coverage_source_branch_id',v_delivery.branch_id,
    'coverage_source_branch_name',v_delivery.branch_name,
    'zone_id',null,
    'zone_name','تغطية '||v_delivery.branch_name,
    'items',v_lines,
    'subtotal',round(v_subtotal,2),
    'shipping_cost',round(coalesce(v_delivery.delivery_fee,0),2),
    'total',round(v_subtotal+coalesce(v_delivery.delivery_fee,0),2),
    'free_delivery',coalesce(v_delivery.delivery_fee,0)=0,
    'min_order_amount',coalesce(v_branch.min_order_amount,0),
    'minimum_order_met',v_subtotal>=coalesce(v_branch.min_order_amount,0),
    'estimated_time',null,
    'estimated_delivery_minutes',v_delivery.estimated_delivery_minutes,
    'stock_deductions',coalesce(v_deductions,'[]'::jsonb)
  );

  return v_result||jsonb_build_object('quote_token',md5(v_result::text));
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_checkout_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- SECURITY INVOKER here is intentional: a direct Data API insert must not impersonate
  -- the private checkout implementation by supplying its version/snapshot columns.
  if current_user in ('anon','authenticated') and
    (new.checkout_version is not null or new.checkout_fingerprint is not null
      or new.stock_deductions is not null or new.stock_released_at is not null
      or new.inventory_reservation_version is not null
      or new.customer_snapshot is not null or new.shipping_snapshot is not null) then
    raise exception using errcode='42501',message='USE_CHECKOUT_RPC';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.guard_checkout_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  x jsonb;
  inventory_branch uuid;
  v_customer_user uuid;
  v_combined_context text:=nullif(current_setting('app.combined_checkout_write',true),'');
  v_delivery_assignment_context text:=nullif(current_setting('app.delivery_assignment_write',true),'');
  v_delivery_assignment_actor text:=nullif(current_setting('app.delivery_assignment_actor',true),'');
  v_auto_confirm_context text:=nullif(current_setting('app.checkout_auto_confirm_write',true),'');
begin
  if old.checkout_version is distinct from 1 then return coalesce(new,old); end if;

  if tg_op='DELETE' then
    if auth.uid() is null or not (public.staff_has_permission('online_orders.manage',old.branch_id) or private.staff_is_super_admin(auth.uid())) then
      raise exception using errcode='42501',message='ORDER_MANAGER_REQUIRED';
    end if;
    raise exception using errcode='22023',message='CANCEL_ORDER_INSTEAD';
  end if;

  if tg_op='UPDATE'
     and v_auto_confirm_context=new.id::text
     and old.status::text='pending'
     and new.status::text='confirmed'
     and (to_jsonb(new)-array['status','updated_at']) is not distinct from
         (to_jsonb(old)-array['status','updated_at']) then
    return new;
  end if;

  if tg_op='UPDATE' and v_combined_context is not null then
    if old.status::text='pending'
       and new.status::text='confirmed'
       and (to_jsonb(new)-array['status','updated_at']) is not distinct from
           (to_jsonb(old)-array['status','updated_at']) then
      return new;
    end if;

    if new.order_group_id::text=v_combined_context
       and (old.order_group_id is null or old.order_group_id is not distinct from new.order_group_id)
       and (to_jsonb(new)-array['order_group_id','shipping_cost','total','shipping_snapshot','updated_at']) is not distinct from
           (to_jsonb(old)-array['order_group_id','shipping_cost','total','shipping_snapshot','updated_at']) then
      return new;
    end if;
  end if;

  if tg_op='UPDATE'
     and v_delivery_assignment_context is not null
     and (to_jsonb(new)-array['delivery_person','updated_at']) is not distinct from
         (to_jsonb(old)-array['delivery_person','updated_at'])
     and (
       (
         auth.uid() is not null
         and (
           private.staff_is_super_admin(auth.uid())
           or public.staff_has_permission('delivery.manage',v_delivery_assignment_context::uuid)
           or public.staff_has_permission('online_orders.manage',v_delivery_assignment_context::uuid)
         )
       )
       or (
         v_delivery_assignment_actor is not null
         and private.delivery_assignment_actor_allowed_v2(
           v_delivery_assignment_actor::uuid,
           v_delivery_assignment_context::uuid
         )
       )
     )
  then
    return new;
  end if;

  if tg_op='UPDATE'
     and (to_jsonb(new)-array['loyalty_voucher_id','loyalty_voucher_amount','updated_at']) is not distinct from (to_jsonb(old)-array['loyalty_voucher_id','loyalty_voucher_amount','updated_at'])
     and new.loyalty_voucher_id is not null and coalesce(new.loyalty_voucher_amount,0)>0 then
    select c.user_id into v_customer_user from public.customers c where c.id=new.customer_id;
    if v_customer_user=auth.uid() and exists(
      select 1 from public.loyalty_voucher_usages u
      where u.source_type='online_order' and u.source_id=new.id and u.customer_id=new.customer_id
        and u.voucher_id=new.loyalty_voucher_id and abs(u.amount_egp-coalesce(new.loyalty_voucher_amount,0))<0.009 and u.reversed_at is null
    ) then return new; end if;
  end if;

  if tg_op='UPDATE' and new.delivery_person is null and old.delivery_person is not null
     and (to_jsonb(new)-array['delivery_person','updated_at']) is not distinct from (to_jsonb(old)-array['delivery_person','updated_at'])
     and exists(select 1 from private.delivery_order_assignments_v1 a where a.order_id=new.id and a.delivery_user_id=auth.uid() and a.unassigned_at is null and a.delivery_state='assigned') then
    return new;
  end if;

  if tg_op='UPDATE' and new.status::text='shipped' and old.status::text<>'delivered'
     and (to_jsonb(new)-array['status','updated_at']) is not distinct from (to_jsonb(old)-array['status','updated_at'])
     and exists(select 1 from private.delivery_order_assignments_v1 a where a.order_id=new.id and a.delivery_user_id=auth.uid() and a.unassigned_at is null and a.delivery_state='on_the_way' and a.departed_at is not null) then
    return new;
  end if;

  if tg_op='UPDATE' and new.status::text='delivered'
     and (to_jsonb(new)-array['status','payment_status','updated_at']) is not distinct from (to_jsonb(old)-array['status','payment_status','updated_at'])
     and exists(select 1 from private.delivery_order_assignments_v1 a where a.order_id=new.id and a.delivery_user_id=auth.uid() and a.unassigned_at is null and a.delivery_state='delivered' and a.delivered_at is not null) then
    return new;
  end if;

  if tg_op='UPDATE' and old.branch_id is not null
     and public.staff_has_permission('online_orders.intake',old.branch_id)
     and old.status::text='pending' and new.status::text='confirmed'
     and (to_jsonb(new)-array['status','updated_at']) is not distinct from (to_jsonb(old)-array['status','updated_at']) then
    return new;
  end if;

  if tg_op='UPDATE' and old.branch_id is not null
     and public.staff_has_permission('online_orders.prepare',old.branch_id)
     and ((old.status::text='confirmed' and new.status::text='preparing') or (old.status::text='preparing' and new.status::text='ready'))
     and (to_jsonb(new)-array['status','updated_at']) is not distinct from (to_jsonb(old)-array['status','updated_at']) then
    return new;
  end if;

  if auth.uid() is null or not (public.staff_has_permission('online_orders.manage',old.branch_id) or private.staff_is_super_admin(auth.uid())) then
    raise exception using errcode='42501',message='ORDER_MANAGER_REQUIRED';
  end if;

  if (to_jsonb(new)-array['status','payment_status','notes','delivery_person','updated_at','return_status']) is distinct from (to_jsonb(old)-array['status','payment_status','notes','delivery_person','updated_at','return_status']) then
    raise exception using errcode='22023',message='CHECKOUT_ORDER_IMMUTABLE';
  end if;

  if old.status='cancelled' and new.status<>'cancelled' then
    raise exception using errcode='22023',message='CANCELLED_ORDER_FINAL';
  end if;

  if new.status='cancelled' and old.status<>'cancelled' then
    if old.status in ('shipped','delivered') then
      raise exception using errcode='22023',message='USE_RETURN_PROCESS';
    end if;
    if coalesce(old.inventory_reservation_version,0)=1 then
      new.stock_released_at:=coalesce(old.stock_released_at,now());
    else
      for x in select value from jsonb_array_elements(old.stock_deductions) order by value->>'branch_id',value->>'product_id' loop
        inventory_branch:=coalesce((x->>'branch_id')::uuid,old.branch_id);
        update public.inventory set quantity=quantity+(x->>'quantity')::numeric
        where branch_id=inventory_branch and product_id=(x->>'product_id')::uuid;
        if not found then raise exception using errcode='22023',message='STOCK_ROW_MISSING'; end if;
      end loop;
      new.stock_released_at:=now();
    end if;
  end if;

  return new;
end
$function$;

CREATE OR REPLACE FUNCTION private.place_customer_order(p_request_id uuid, p_items jsonb, p_address_id uuid, p_payment_method text, p_notes text, p_quote_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  plan jsonb;
  x jsonb;
  existing public.online_orders%rowtype;
  created public.online_orders%rowtype;
  fingerprint text;
  customer uuid;
  inventory_branch uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='REQUEST_REQUIRED'; end if;
  if p_payment_method is null or p_payment_method not in ('cash','wallet') or length(coalesce(p_notes,''))>1000 then
    raise exception using errcode='22023',message='INVALID_ORDER';
  end if;
  select id into customer from public.customers where user_id=auth.uid();
  fingerprint:=md5(jsonb_build_object(
    'items',p_items,'address',p_address_id,'payment',p_payment_method,'notes',coalesce(p_notes,'')
  )::text);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,3));
  select * into existing from public.online_orders where id=p_request_id;
  if existing.id is not null then
    if existing.customer_id is distinct from customer or existing.checkout_fingerprint is distinct from fingerprint then
      raise exception using errcode='42501',message='REQUEST_CONFLICT';
    end if;
    return jsonb_build_object('id',existing.id,'tracking_number',existing.tracking_number,'total',existing.total);
  end if;
  if not coalesce((select enabled from private.customer_checkout_rollout where singleton),false) then
    raise exception using errcode='55000',message='CHECKOUT_NOT_READY';
  end if;

  plan:=private.customer_checkout_plan_v3(p_items,p_address_id);
  if p_quote_token is distinct from plan->>'quote_token' then
    raise exception using errcode='22023',message='QUOTE_CHANGED';
  end if;


  insert into public.online_orders(
    id,customer_id,items,total,shipping_cost,payment_method,status,payment_status,
    shipping_address,delivery_location_id,branch_id,notes,tracking_number,checkout_version,checkout_fingerprint,
    customer_snapshot,shipping_snapshot,stock_deductions,inventory_reservation_version
  )
  values(
    p_request_id,customer,plan->'items',(plan->>'total')::numeric,(plan->>'shipping_cost')::numeric,
    p_payment_method,'pending','pending',plan->'shipping_snapshot'->>'address',
    (plan->>'delivery_location_id')::uuid,(plan->>'branch_id')::uuid,coalesce(p_notes,''),
    upper(replace(p_request_id::text,'-','')),1,fingerprint,plan->'customer_snapshot',
    (plan->'shipping_snapshot')||jsonb_build_object(
      'delivery_pricing',plan->'delivery_pricing',
      'delivery_policy',plan->'delivery_policy'
    ),
    plan->'stock_deductions',1
  ) returning * into created;

  perform private.reserve_order_inventory_v1(
    created.id,plan->'stock_deductions',
    coalesce((plan->>'inventory_branch_id')::uuid,(plan->>'branch_id')::uuid),
    'owned_online'
  );
  return jsonb_build_object('id',created.id,'tracking_number',created.tracking_number,'total',created.total);
end;
$function$;

CREATE OR REPLACE FUNCTION public.place_marketplace_order_v1(p_request_id uuid, p_branch_id uuid, p_items jsonb, p_address_id uuid, p_payment_method text, p_notes text, p_quote_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  v_fingerprint:=md5(jsonb_build_object(
    'source','marketplace','branch',p_branch_id,'items',p_items,'address',p_address_id,
    'payment',p_payment_method,'notes',coalesce(p_notes,'')
  )::text);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,9));
  select * into v_existing from public.online_orders where id=p_request_id;
  if v_existing.id is not null then
    if v_existing.customer_id is distinct from v_customer.id
       or v_existing.checkout_fingerprint is distinct from v_fingerprint
       or v_existing.source_channel is distinct from 'marketplace' then
      raise exception using errcode='42501',message='REQUEST_CONFLICT';
    end if;
    return jsonb_build_object(
      'id',v_existing.id,'tracking_number',v_existing.tracking_number,'total',v_existing.total,
      'amount_due',v_existing.total,'merchant_id',v_existing.merchant_id
    );
  end if;

  v_plan:=private.marketplace_quote_plan_v3(
    p_branch_id,p_items,v_address.latitude::double precision,v_address.longitude::double precision
  );
  if p_quote_token is distinct from v_plan->>'quote_token' then
    raise exception using errcode='22023',message='QUOTE_CHANGED';
  end if;
  if not coalesce((v_plan->>'minimum_order_met')::boolean,false) then
    raise exception using errcode='22023',message='MIN_ORDER_NOT_MET';
  end if;


  insert into public.online_orders(
    id,customer_id,items,total,shipping_cost,payment_method,status,payment_status,
    shipping_address,delivery_location_id,delivery_zone_id,branch_id,notes,tracking_number,
    checkout_version,checkout_fingerprint,customer_snapshot,shipping_snapshot,stock_deductions,inventory_reservation_version,source_channel
  ) values (
    p_request_id,v_customer.id,v_plan->'items',(v_plan->>'total')::numeric,(v_plan->>'shipping_cost')::numeric,
    p_payment_method,'pending','pending',v_address.address,v_address.neighborhood_id,(v_plan->>'zone_id')::uuid,
    p_branch_id,coalesce(p_notes,''),upper(replace(p_request_id::text,'-','')),9,v_fingerprint,
    jsonb_build_object('name',trim(v_customer.name),'phone',v_customer.phone,'email',v_customer.email),
    jsonb_build_object(
      'address_id',v_address.id,'address',v_address.address,'latitude',v_address.latitude,'longitude',v_address.longitude,
      'assigned_branch_id',p_branch_id,'zone_id',(v_plan->>'zone_id')::uuid,'zone_name',v_plan->>'zone_name',
      'merchant_id',(v_plan->>'merchant_id')::uuid,'merchant_name',v_plan->>'merchant_name',
      'delivery_pricing',v_plan->'delivery_pricing','delivery_policy',v_plan->'delivery_policy',
      'delivery_cost',(v_plan->>'delivery_cost')::numeric,
      'merchant_delivery_subsidy',(v_plan->>'merchant_delivery_subsidy')::numeric,
      'elmadawy_delivery_subsidy',(v_plan->>'elmadawy_delivery_subsidy')::numeric
    ),
    v_plan->'stock_deductions',1,'marketplace'
  ) returning * into v_created;

  perform private.reserve_order_inventory_v1(v_created.id,v_plan->'stock_deductions',p_branch_id,'marketplace');

  return jsonb_build_object(
    'id',v_created.id,'tracking_number',v_created.tracking_number,'total',v_created.total,
    'amount_due',v_created.total,'merchant_id',v_created.merchant_id,
    'merchant_name',v_plan->>'merchant_name','source_kind','marketplace'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.transition_my_partner_order_v1(p_merchant_id uuid, p_branch_id uuid, p_order_id uuid, p_action text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_action text:=lower(btrim(coalesce(p_action,'')));
  v_reason text:=nullif(btrim(coalesce(p_reason,'')),'');
  v_order public.online_orders%rowtype;
  v_branch public.branches%rowtype;
  v_from_status text;
  v_to_status text;
  v_item jsonb;
  v_inventory_branch uuid;
  v_cancel_blocked boolean:=false;
  v_stock_released boolean:=false;
begin
  v_role:=private.assert_partner_order_operator_v1(p_merchant_id,p_branch_id);

  if v_action not in ('accept','reject','start_preparing','mark_ready','cancel') then
    raise exception using errcode='22023',message='PARTNER_ORDER_ACTION_INVALID';
  end if;

  if length(coalesce(v_reason,''))>300 then
    raise exception using errcode='22023',message='PARTNER_ORDER_REASON_TOO_LONG';
  end if;

  if v_action in ('reject','cancel') and (v_reason is null or length(v_reason)<3) then
    raise exception using errcode='22023',message=
      case when v_action='reject'
        then 'PARTNER_ORDER_REJECT_REASON_REQUIRED'
        else 'PARTNER_ORDER_CANCEL_REASON_REQUIRED'
      end;
  end if;

  if v_action in ('reject','cancel') and v_role not in ('owner','admin','manager') then
    raise exception using errcode='42501',message='PARTNER_ORDER_CANCEL_MANAGER_REQUIRED';
  end if;

  select * into v_branch
  from public.branches b
  where b.id=p_branch_id
    and b.merchant_id=p_merchant_id
    and b.branch_type='external';

  if v_branch.id is null then
    raise exception using errcode='P0002',message='PARTNER_BRANCH_NOT_FOUND';
  end if;

  select * into v_order
  from public.online_orders o
  where o.id=p_order_id
    and o.merchant_id=p_merchant_id
    and o.branch_id=p_branch_id
    and o.source_channel='marketplace'
    and o.checkout_version=9
  for update;

  if v_order.id is null then
    raise exception using errcode='P0002',message='PARTNER_ORDER_NOT_FOUND';
  end if;

  v_from_status:=v_order.status::text;

  if v_action not in ('reject','cancel') and not coalesce(v_branch.active,false) then
    raise exception using errcode='55000',message='PARTNER_BRANCH_INACTIVE';
  end if;

  if v_action='accept' then
    v_to_status:='confirmed';
    if v_from_status=v_to_status then
      return jsonb_build_object('ok',true,'idempotent',true,'order_id',v_order.id,'status',v_to_status);
    end if;
    if v_from_status<>'pending' then
      raise exception using errcode='40001',message='PARTNER_ORDER_STATUS_CHANGED';
    end if;

  elsif v_action='reject' then
    v_to_status:='cancelled';
    if v_from_status='cancelled' then
      return jsonb_build_object(
        'ok',true,'idempotent',true,'order_id',v_order.id,'status','cancelled',
        'rejected',true,'stock_released_at',v_order.stock_released_at
      );
    end if;
    if v_from_status<>'pending' then
      raise exception using errcode='22023',message='PARTNER_ORDER_REJECT_PENDING_ONLY';
    end if;

  elsif v_action='start_preparing' then
    v_to_status:='preparing';
    if v_from_status=v_to_status then
      return jsonb_build_object('ok',true,'idempotent',true,'order_id',v_order.id,'status',v_to_status);
    end if;
    if v_from_status<>'confirmed' then
      raise exception using errcode='40001',message='PARTNER_ORDER_STATUS_CHANGED';
    end if;

  elsif v_action='mark_ready' then
    v_to_status:='ready';
    if v_from_status=v_to_status then
      return jsonb_build_object('ok',true,'idempotent',true,'order_id',v_order.id,'status',v_to_status);
    end if;
    if v_from_status<>'preparing' then
      raise exception using errcode='40001',message='PARTNER_ORDER_STATUS_CHANGED';
    end if;

  elsif v_action='cancel' then
    v_to_status:='cancelled';
    if v_from_status='cancelled' then
      return jsonb_build_object(
        'ok',true,'idempotent',true,'order_id',v_order.id,'status','cancelled',
        'stock_released_at',v_order.stock_released_at
      );
    end if;

    if v_from_status not in ('pending','confirmed','preparing','ready') then
      raise exception using errcode='22023',message='PARTNER_ORDER_CANNOT_CANCEL';
    end if;
  end if;

  if v_action in ('reject','cancel') then
    select exists(
      select 1
      from private.delivery_order_assignments_v1 a
      where a.order_id=v_order.id
        and a.unassigned_at is null
        and a.delivery_state in ('picked_up','on_the_way','arrived','delivered','failed','return_to_branch')
    ) into v_cancel_blocked;

    if v_cancel_blocked then
      raise exception using errcode='22023',message='USE_RETURN_PROCESS';
    end if;

    if v_order.stock_released_at is null then
      if coalesce(v_order.inventory_reservation_version,0)=1 then
        perform set_config(
          'app.order_cancel_reason',
          case when v_action='reject' then 'partner_rejected: '||v_reason else v_reason end,
          true
        );
        v_stock_released:=true;
      else
      if jsonb_typeof(v_order.stock_deductions) is distinct from 'array' then
        raise exception using errcode='55000',message='PARTNER_ORDER_STOCK_SNAPSHOT_REQUIRED';
      end if;

      perform set_config(
        'app.inventory_movement_source',
        case when v_action='reject' then 'partner_order_reject' else 'partner_order_cancel' end,
        true
      );
      perform set_config(
        'app.inventory_reason_code',
        case when v_action='reject' then 'partner_order_rejected' else 'partner_order_cancelled' end,
        true
      );
      perform set_config('app.inventory_note',v_reason,true);
      perform set_config(
        'app.order_cancel_reason',
        case when v_action='reject' then 'partner_rejected: '||v_reason else v_reason end,
        true
      );

      for v_item in
        select value
        from jsonb_array_elements(v_order.stock_deductions)
        order by value->>'product_id'
      loop
        if (v_item->>'product_id') is null
           or (v_item->>'quantity') is null
           or (v_item->>'quantity')::numeric<=0 then
          raise exception using errcode='55000',message='PARTNER_ORDER_STOCK_SNAPSHOT_INVALID';
        end if;

        v_inventory_branch:=coalesce(
          nullif(v_item->>'branch_id','')::uuid,
          v_order.branch_id
        );

        update public.inventory
        set quantity=quantity+(v_item->>'quantity')::numeric,
            updated_at=now()
        where branch_id=v_inventory_branch
          and product_id=(v_item->>'product_id')::uuid;

        if not found then
          raise exception using errcode='55000',message='PARTNER_ORDER_STOCK_ROW_MISSING';
        end if;
      end loop;

      v_stock_released:=true;
      end if;
    else
      perform set_config(
        'app.order_cancel_reason',
        case when v_action='reject' then 'partner_rejected: '||v_reason else v_reason end,
        true
      );
    end if;
  end if;

  if v_action in ('reject','cancel') then
    update public.online_orders
    set status='cancelled'::public.order_status,
        stock_released_at=coalesce(stock_released_at,now()),
        updated_at=now()
    where id=v_order.id
    returning * into v_order;
  else
    update public.online_orders
    set status=v_to_status::public.order_status,
        updated_at=now()
    where id=v_order.id
    returning * into v_order;
  end if;

  insert into private.partner_order_events_v1(
    tenant_id,merchant_id,branch_id,order_id,action,from_status,to_status,
    actor_user_id,actor_role,reason,metadata
  )
  values(
    v_order.tenant_id,p_merchant_id,p_branch_id,v_order.id,v_action,v_from_status,v_to_status,
    auth.uid(),v_role,v_reason,
    jsonb_build_object(
      'checkout_version',v_order.checkout_version,
      'source_channel',v_order.source_channel,
      'stock_released',v_stock_released,
      'rejected',v_action='reject',
      'order_group_id',v_order.order_group_id
    )
  );

  return jsonb_build_object(
    'ok',true,
    'idempotent',false,
    'order_id',v_order.id,
    'status',v_order.status::text,
    'rejected',v_action='reject',
    'payment_status',v_order.payment_status::text,
    'stock_released_at',v_order.stock_released_at,
    'updated_at',v_order.updated_at
  );
end;
$function$;


drop trigger if exists inventory_guard_reserved_stock_v1 on public.inventory;
create trigger inventory_guard_reserved_stock_v1
before delete or update of quantity on public.inventory
for each row execute function private.guard_inventory_reserved_stock_v1();

drop trigger if exists zz_sync_order_inventory_reservation_v1 on public.online_orders;
create trigger zz_sync_order_inventory_reservation_v1
after update of status on public.online_orders
for each row execute function private.sync_order_inventory_reservation_v1();

revoke execute on function private.inventory_reserved_quantity_v1(uuid,uuid) from public, anon, authenticated;
revoke execute on function private.inventory_available_quantity_v1(uuid,uuid) from public, anon, authenticated;
revoke execute on function private.reserve_order_inventory_v1(uuid,jsonb,uuid,text) from public, anon, authenticated;
revoke execute on function private.commit_order_inventory_reservation_v1(uuid,text) from public, anon, authenticated;
revoke execute on function private.release_order_inventory_reservation_v1(uuid,text) from public, anon, authenticated;
revoke execute on function private.consume_available_inventory_v1(uuid,uuid,numeric,text) from public, anon, authenticated;
revoke execute on function private.guard_inventory_reserved_stock_v1() from public, anon, authenticated;
revoke execute on function private.sync_order_inventory_reservation_v1() from public, anon, authenticated;
