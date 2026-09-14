create table if not exists private.order_fulfillment_substitutions_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.online_orders(id) on delete cascade,
  item_id uuid not null references private.order_fulfillment_items_v1(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  original_product_id uuid,
  original_variant_id uuid,
  replacement_product_id uuid not null references public.products(id),
  replacement_variant_id uuid references public.product_variants(id),
  original_product_name text not null,
  replacement_product_name text not null,
  quantity numeric not null check (quantity > 0),
  original_unit_price numeric not null check (original_unit_price >= 0),
  replacement_unit_price numeric not null check (replacement_unit_price >= 0),
  price_delta_total numeric not null,
  replacement_barcode text,
  replacement_image_url text,
  stock_units_required numeric not null check (stock_units_required > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  financial_state text not null default 'pending' check (financial_state in ('pending','not_required','settled','waived')),
  approval_task_id uuid references public.operations_tasks(id) on delete set null,
  proposed_by uuid not null references public.users(id),
  proposed_at timestamptz not null default now(),
  resolved_by uuid references public.users(id),
  resolved_at timestamptz,
  resolution_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists order_fulfillment_substitutions_one_pending_v1
  on private.order_fulfillment_substitutions_v1(item_id)
  where status='pending';

create index if not exists order_fulfillment_substitutions_order_v1
  on private.order_fulfillment_substitutions_v1(order_id, proposed_at desc);

create index if not exists order_fulfillment_substitutions_branch_status_v1
  on private.order_fulfillment_substitutions_v1(branch_id,status,proposed_at desc);

create or replace function private.order_substitution_original_unit_price_v1(
  p_order_id uuid,
  p_line_no integer,
  p_product_id uuid,
  p_variant_id uuid
) returns numeric
language sql stable security definer set search_path=''
as $$
  select coalesce(
    (
      select nullif(e.elem->>'price','')::numeric
      from public.online_orders o
      cross join lateral jsonb_array_elements(o.items) with ordinality e(elem,ord)
      where o.id=p_order_id and e.ord=p_line_no+1
      limit 1
    ),
    (
      select nullif(e.elem->>'price','')::numeric
      from public.online_orders o
      cross join lateral jsonb_array_elements(o.items) e(elem)
      where o.id=p_order_id
        and nullif(e.elem->>'product_id','')::uuid=p_product_id
        and (p_variant_id is null or nullif(e.elem->>'variant_id','')::uuid=p_variant_id)
      limit 1
    ),
    0::numeric
  );
$$;

create or replace function private.order_substitution_candidate_snapshot_v1(
  p_item_id uuid,
  p_product_id uuid,
  p_variant_id uuid default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_i private.order_fulfillment_items_v1%rowtype;
  v_f private.order_fulfillment_state_v1%rowtype;
  v_orig public.products%rowtype;
  v_p public.products%rowtype;
  v_v public.product_variants%rowtype;
  v_inventory_branch uuid;
  v_stock numeric:=0;
  v_available numeric:=0;
  v_price numeric:=0;
  v_name text;
  v_barcode text;
  v_image text;
  v_factor numeric:=1;
  v_candidate_weight boolean:=false;
  v_category_ok boolean:=false;
begin
  select * into v_i from private.order_fulfillment_items_v1 where id=p_item_id;
  if v_i.id is null then raise exception using errcode='22023',message='PICKING_ITEM_NOT_FOUND'; end if;
  select * into v_f from private.order_fulfillment_state_v1 where order_id=v_i.order_id;
  if v_f.order_id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  select * into v_orig from public.products where id=v_i.product_id;
  select * into v_p from public.products where id=p_product_id and archived_at is null;
  if v_p.id is null then raise exception using errcode='22023',message='SUBSTITUTE_PRODUCT_NOT_FOUND'; end if;

  v_category_ok := case
    when v_orig.subcategory_id is not null then v_p.subcategory_id=v_orig.subcategory_id
    when v_orig.main_category_id is not null then v_p.main_category_id=v_orig.main_category_id
    when v_orig.company_id is not null then v_p.company_id=v_orig.company_id
    else false
  end;
  if not coalesce(v_category_ok,false) then raise exception using errcode='22023',message='SUBSTITUTE_CATEGORY_MISMATCH'; end if;
  if v_p.branch_id is not null and v_p.branch_id<>v_f.branch_id then raise exception using errcode='22023',message='SUBSTITUTE_BRANCH_MISMATCH'; end if;

  select s.inventory_branch_id into v_inventory_branch from private.resolve_branch_sources(v_f.branch_id) s;
  select coalesce(inv.quantity,0) into v_stock
  from public.inventory inv
  where inv.product_id=p_product_id and inv.branch_id=v_inventory_branch;
  v_stock:=coalesce(v_stock,0);

  if p_variant_id is not null then
    if not v_i.is_bulk then raise exception using errcode='22023',message='SUBSTITUTE_UNIT_MISMATCH'; end if;
    select * into v_v from public.product_variants where id=p_variant_id and parent_product_id=p_product_id and active;
    if v_v.id is null then raise exception using errcode='22023',message='SUBSTITUTE_VARIANT_NOT_FOUND'; end if;
    if v_i.product_id=p_product_id and v_i.variant_id=p_variant_id then raise exception using errcode='22023',message='SUBSTITUTE_SAME_PRODUCT'; end if;
    v_factor:=greatest(coalesce(v_v.conversion_factor,1),0.001);
    v_available:=floor(v_stock/v_factor);
    v_price:=greatest(coalesce(v_v.price,0),0);
    v_name:=v_v.name;
    v_barcode:=coalesce(v_v.barcode,v_v.bulk_barcode);
    v_image:=coalesce(v_v.image_url,(v_p.image_urls)[1]);
  else
    if v_i.is_bulk then raise exception using errcode='22023',message='SUBSTITUTE_UNIT_MISMATCH'; end if;
    if v_i.product_id=p_product_id then raise exception using errcode='22023',message='SUBSTITUTE_SAME_PRODUCT'; end if;
    v_candidate_weight := coalesce(v_p.barcode_type,'')='scale'
      or lower(coalesce(v_p.unit_of_measure,'')) in ('weight','kg','kilogram','كيلو');
    if v_candidate_weight<>v_i.is_weight_based then raise exception using errcode='22023',message='SUBSTITUTE_UNIT_MISMATCH'; end if;
    v_available:=v_stock;
    v_price:=case when coalesce(v_p.is_offer,false) and coalesce(v_p.offer_price,0)>0 then v_p.offer_price else v_p.price end;
    v_name:=v_p.name;
    v_barcode:=v_p.barcode;
    v_image:=(v_p.image_urls)[1];
  end if;

  return jsonb_build_object(
    'product_id',v_p.id,
    'variant_id',case when p_variant_id is null then null else v_v.id end,
    'name',v_name,
    'barcode',v_barcode,
    'image_url',v_image,
    'unit_price',round(v_price,2),
    'available_quantity',v_available,
    'stock_units_per_order_unit',v_factor,
    'is_bulk',p_variant_id is not null,
    'is_weight_based',v_candidate_weight,
    'unit_of_measure',v_p.unit_of_measure
  );
end;
$$;
