create or replace function public.search_order_fulfillment_substitution_candidates_v1(
  p_item_id uuid,
  p_query text default null,
  p_limit integer default 20
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_i private.order_fulfillment_items_v1%rowtype;
  v_f private.order_fulfillment_state_v1%rowtype;
  v_orig public.products%rowtype;
  v_inventory_branch uuid;
  v_original_price numeric:=0;
  v_q text:=lower(trim(coalesce(p_query,'')));
  v_limit integer:=least(greatest(coalesce(p_limit,20),1),50);
  v_items jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_i from private.order_fulfillment_items_v1 where id=p_item_id;
  if v_i.id is null then raise exception using errcode='22023',message='PICKING_ITEM_NOT_FOUND'; end if;
  select * into v_f from private.order_fulfillment_state_v1 where order_id=v_i.order_id;
  if v_f.order_id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  if v_f.picker_user_id is distinct from v_uid and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if v_f.fulfillment_state<>'picking' then raise exception using errcode='55000',message='PICKING_NOT_ACTIVE'; end if;

  select * into v_orig from public.products where id=v_i.product_id;
  select s.inventory_branch_id into v_inventory_branch from private.resolve_branch_sources(v_f.branch_id) s;
  v_original_price:=private.order_substitution_original_unit_price_v1(v_i.order_id,v_i.line_no,v_i.product_id,v_i.variant_id);

  if v_i.is_bulk then
    select coalesce(jsonb_agg(x.obj order by x.price_gap,x.name),'[]'::jsonb) into v_items
    from (
      select jsonb_build_object(
        'product_id',p.id,'variant_id',pv.id,'name',pv.name,
        'barcode',coalesce(pv.barcode,pv.bulk_barcode),
        'image_url',coalesce(pv.image_url,(p.image_urls)[1]),
        'unit_price',round(pv.price,2),
        'original_unit_price',round(v_original_price,2),
        'price_delta_per_unit',round(pv.price-v_original_price,2),
        'available_quantity',floor(inv.quantity/greatest(pv.conversion_factor,0.001)),
        'stock_units_per_order_unit',pv.conversion_factor,
        'is_bulk',true,'is_weight_based',false,
        'unit_of_measure',p.unit_of_measure
      ) obj,
      abs(pv.price-v_original_price) price_gap,
      pv.name
      from public.product_variants pv
      join public.products p on p.id=pv.parent_product_id and p.archived_at is null
      join public.inventory inv on inv.product_id=p.id and inv.branch_id=v_inventory_branch
      where pv.active
        and pv.id is distinct from v_i.variant_id
        and floor(inv.quantity/greatest(pv.conversion_factor,0.001))>0
        and (p.branch_id is null or p.branch_id=v_f.branch_id)
        and case
          when v_orig.subcategory_id is not null then p.subcategory_id=v_orig.subcategory_id
          when v_orig.main_category_id is not null then p.main_category_id=v_orig.main_category_id
          when v_orig.company_id is not null then p.company_id=v_orig.company_id
          else false
        end
        and (
          v_q=''
          or lower(pv.name) like '%'||v_q||'%'
          or lower(coalesce(p.name,'')) like '%'||v_q||'%'
          or lower(coalesce(pv.barcode,pv.bulk_barcode,''))=v_q
        )
      order by price_gap,pv.name
      limit v_limit
    ) x;
  else
    select coalesce(jsonb_agg(x.obj order by x.price_gap,x.name),'[]'::jsonb) into v_items
    from (
      select jsonb_build_object(
        'product_id',p.id,'variant_id',null,'name',p.name,
        'barcode',p.barcode,'image_url',(p.image_urls)[1],
        'unit_price',round(case when coalesce(p.is_offer,false) and coalesce(p.offer_price,0)>0 then p.offer_price else p.price end,2),
        'original_unit_price',round(v_original_price,2),
        'price_delta_per_unit',round((case when coalesce(p.is_offer,false) and coalesce(p.offer_price,0)>0 then p.offer_price else p.price end)-v_original_price,2),
        'available_quantity',inv.quantity,
        'stock_units_per_order_unit',1,
        'is_bulk',false,
        'is_weight_based',(coalesce(p.barcode_type,'')='scale' or lower(coalesce(p.unit_of_measure,'')) in ('weight','kg','kilogram','كيلو')),
        'unit_of_measure',p.unit_of_measure
      ) obj,
      abs((case when coalesce(p.is_offer,false) and coalesce(p.offer_price,0)>0 then p.offer_price else p.price end)-v_original_price) price_gap,
      p.name
      from public.products p
      join public.inventory inv on inv.product_id=p.id and inv.branch_id=v_inventory_branch
      where p.archived_at is null
        and p.id<>v_i.product_id
        and inv.quantity>0
        and (p.branch_id is null or p.branch_id=v_f.branch_id)
        and ((coalesce(p.barcode_type,'')='scale' or lower(coalesce(p.unit_of_measure,'')) in ('weight','kg','kilogram','كيلو'))=v_i.is_weight_based)
        and case
          when v_orig.subcategory_id is not null then p.subcategory_id=v_orig.subcategory_id
          when v_orig.main_category_id is not null then p.main_category_id=v_orig.main_category_id
          when v_orig.company_id is not null then p.company_id=v_orig.company_id
          else false
        end
        and (v_q='' or lower(p.name) like '%'||v_q||'%' or lower(coalesce(p.barcode,''))=v_q)
      order by price_gap,p.name
      limit v_limit
    ) x;
  end if;

  return jsonb_build_object(
    'item_id',v_i.id,
    'original_product_name',v_i.product_name,
    'original_unit_price',round(v_original_price,2),
    'items',coalesce(v_items,'[]'::jsonb)
  );
end;
$$;

create or replace function public.propose_order_fulfillment_substitution_v1(
  p_item_id uuid,
  p_replacement_product_id uuid,
  p_replacement_variant_id uuid default null,
  p_quantity numeric default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_i private.order_fulfillment_items_v1%rowtype;
  v_f private.order_fulfillment_state_v1%rowtype;
  v_o public.online_orders%rowtype;
  v_candidate jsonb;
  v_remaining numeric;
  v_qty numeric;
  v_original_price numeric;
  v_replacement_price numeric;
  v_delta numeric;
  v_sub private.order_fulfillment_substitutions_v1%rowtype;
  v_task_id uuid;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_i from private.order_fulfillment_items_v1 where id=p_item_id for update;
  if v_i.id is null then raise exception using errcode='22023',message='PICKING_ITEM_NOT_FOUND'; end if;
  select * into v_f from private.order_fulfillment_state_v1 where order_id=v_i.order_id for update;
  select * into v_o from public.online_orders where id=v_i.order_id;
  if v_f.picker_user_id is distinct from v_uid and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if v_f.fulfillment_state<>'picking' then raise exception using errcode='55000',message='PICKING_NOT_ACTIVE'; end if;
  if exists(select 1 from private.order_fulfillment_substitutions_v1 where item_id=p_item_id and status='pending') then raise exception using errcode='55000',message='SUBSTITUTION_ALREADY_PENDING'; end if;

  v_remaining:=v_i.required_quantity-v_i.picked_quantity-v_i.shortage_quantity-v_i.substitution_quantity;
  if v_remaining<=0.0005 then raise exception using errcode='55000',message='ITEM_ALREADY_COMPLETE'; end if;
  v_qty:=coalesce(p_quantity,v_remaining);
  if v_qty<=0 or abs(v_qty-v_remaining)>0.0005 then raise exception using errcode='22023',message='SUBSTITUTION_MUST_COVER_REMAINING'; end if;

  v_candidate:=private.order_substitution_candidate_snapshot_v1(p_item_id,p_replacement_product_id,p_replacement_variant_id);
  if coalesce((v_candidate->>'available_quantity')::numeric,0)+0.0005<v_qty then raise exception using errcode='22023',message='SUBSTITUTE_INSUFFICIENT_STOCK'; end if;
  v_original_price:=private.order_substitution_original_unit_price_v1(v_i.order_id,v_i.line_no,v_i.product_id,v_i.variant_id);
  v_replacement_price:=coalesce((v_candidate->>'unit_price')::numeric,0);
  v_delta:=round((v_replacement_price-v_original_price)*v_qty,2);

  insert into private.order_fulfillment_substitutions_v1(
    order_id,item_id,branch_id,original_product_id,original_variant_id,
    replacement_product_id,replacement_variant_id,original_product_name,
    replacement_product_name,quantity,original_unit_price,replacement_unit_price,
    price_delta_total,replacement_barcode,replacement_image_url,stock_units_required,
    status,financial_state,proposed_by,metadata
  ) values(
    v_i.order_id,v_i.id,v_f.branch_id,v_i.product_id,v_i.variant_id,
    p_replacement_product_id,p_replacement_variant_id,v_i.product_name,
    v_candidate->>'name',v_qty,v_original_price,v_replacement_price,v_delta,
    v_candidate->>'barcode',v_candidate->>'image_url',
    v_qty*coalesce((v_candidate->>'stock_units_per_order_unit')::numeric,1),
    'pending',case when abs(v_delta)<0.005 then 'not_required' else 'pending' end,v_uid,
    jsonb_strip_nulls(jsonb_build_object(
      'note',nullif(trim(coalesce(p_note,'')),''),
      'order_tracking_number',v_o.tracking_number
    ))
  ) returning * into v_sub;

  insert into public.operations_tasks(
    branch_id,task_type,source_kind,source_id,order_id,amount,priority,status,
    title,description,due_at,metadata,created_by
  ) values(
    v_f.branch_id,'approval','order_substitution',v_sub.id,v_i.order_id,abs(v_delta),'high','open',
    'اعتماد بديل لطلب '||coalesce(v_o.tracking_number,left(v_i.order_id::text,8)),
    v_i.product_name||' ← '||(v_candidate->>'name')||' · الكمية '||trim(to_char(v_qty,'FM999999990.###'))||' · فرق السعر '||trim(to_char(v_delta,'FM999999990.00'))||' ج.م',
    now()+interval '10 minutes',
    jsonb_build_object(
      'substitution_id',v_sub.id,
      'item_id',v_i.id,
      'original_product_name',v_i.product_name,
      'replacement_product_name',v_candidate->>'name',
      'quantity',v_qty,
      'price_delta_total',v_delta,
      'decision',null
    ),
    v_uid
  ) returning id into v_task_id;

  update private.order_fulfillment_substitutions_v1
  set approval_task_id=v_task_id,updated_at=now()
  where id=v_sub.id
  returning * into v_sub;

  insert into public.order_operations_realtime_signals_v1(branch_id,order_id,event_type)
  values(v_f.branch_id,v_i.order_id,'substitution_proposed');

  return jsonb_build_object(
    'ok',true,
    'substitution',jsonb_build_object(
      'id',v_sub.id,'status',v_sub.status,'item_id',v_sub.item_id,
      'replacement_product_id',v_sub.replacement_product_id,
      'replacement_variant_id',v_sub.replacement_variant_id,
      'replacement_product_name',v_sub.replacement_product_name,
      'replacement_barcode',v_sub.replacement_barcode,
      'replacement_image_url',v_sub.replacement_image_url,
      'quantity',v_sub.quantity,
      'original_unit_price',v_sub.original_unit_price,
      'replacement_unit_price',v_sub.replacement_unit_price,
      'price_delta_total',v_sub.price_delta_total,
      'financial_state',v_sub.financial_state,
      'approval_task_id',v_sub.approval_task_id,
      'proposed_at',v_sub.proposed_at
    )
  );
end;
$$;

create or replace function public.cancel_order_fulfillment_substitution_v1(p_substitution_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_sub private.order_fulfillment_substitutions_v1%rowtype;
  v_f private.order_fulfillment_state_v1%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_sub from private.order_fulfillment_substitutions_v1 where id=p_substitution_id for update;
  if v_sub.id is null then raise exception using errcode='22023',message='SUBSTITUTION_NOT_FOUND'; end if;
  select * into v_f from private.order_fulfillment_state_v1 where order_id=v_sub.order_id;
  if v_sub.proposed_by<>v_uid and v_f.picker_user_id is distinct from v_uid and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if v_sub.status<>'pending' then raise exception using errcode='55000',message='SUBSTITUTION_NOT_PENDING'; end if;

  update private.order_fulfillment_substitutions_v1
  set status='cancelled',resolved_by=v_uid,resolved_at=now(),
      resolution_note='ألغاه المجهز قبل الاعتماد',updated_at=now()
  where id=v_sub.id
  returning * into v_sub;

  if v_sub.approval_task_id is not null then
    update public.operations_tasks
    set status='cancelled',completed_by=v_uid,completed_at=now(),updated_at=now(),
        metadata=metadata||jsonb_build_object('decision','cancelled','resolution_note','ألغاه المجهز قبل الاعتماد')
    where id=v_sub.approval_task_id and status in ('open','claimed','in_progress','failed');
  end if;

  insert into public.order_operations_realtime_signals_v1(branch_id,order_id,event_type)
  values(v_sub.branch_id,v_sub.order_id,'substitution_cancelled');
  return jsonb_build_object('ok',true,'id',v_sub.id,'status',v_sub.status);
end;
$$;

revoke all on function public.search_order_fulfillment_substitution_candidates_v1(uuid,text,integer) from public;
revoke all on function public.propose_order_fulfillment_substitution_v1(uuid,uuid,uuid,numeric,text) from public;
revoke all on function public.cancel_order_fulfillment_substitution_v1(uuid) from public;
grant execute on function public.search_order_fulfillment_substitution_candidates_v1(uuid,text,integer) to authenticated;
grant execute on function public.propose_order_fulfillment_substitution_v1(uuid,uuid,uuid,numeric,text) to authenticated;
grant execute on function public.cancel_order_fulfillment_substitution_v1(uuid) to authenticated;
