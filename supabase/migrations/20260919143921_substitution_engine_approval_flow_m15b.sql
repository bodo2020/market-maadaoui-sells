-- M15b — candidate intelligence + approval resolution + M14 stock integration.
CREATE OR REPLACE FUNCTION private.order_substitution_candidate_snapshot_v1(p_item_id uuid, p_product_id uuid, p_variant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not coalesce(v_category_ok,false) then
    raise exception using errcode='22023',message='SUBSTITUTE_CATEGORY_MISMATCH';
  end if;
  if v_p.branch_id is not null and v_p.branch_id<>v_f.branch_id then
    raise exception using errcode='22023',message='SUBSTITUTE_BRANCH_MISMATCH';
  end if;
  select s.inventory_branch_id into v_inventory_branch
  from private.resolve_branch_sources(v_f.branch_id) s;
  v_stock:=private.inventory_available_quantity_v1(v_inventory_branch,p_product_id);

  if p_variant_id is not null then
    if not v_i.is_bulk then raise exception using errcode='22023',message='SUBSTITUTE_UNIT_MISMATCH'; end if;
    select * into v_v
    from public.product_variants
    where id=p_variant_id and parent_product_id=p_product_id and active;
    if v_v.id is null then raise exception using errcode='22023',message='SUBSTITUTE_VARIANT_NOT_FOUND'; end if;
    if v_i.product_id=p_product_id and v_i.variant_id=p_variant_id then
      raise exception using errcode='22023',message='SUBSTITUTE_SAME_PRODUCT';
    end if;
    v_factor:=greatest(coalesce(v_v.conversion_factor,1),0.001);
    v_available:=floor(v_stock/v_factor);
    v_price:=greatest(coalesce(v_v.price,0),0);
    v_name:=v_v.name;
    v_barcode:=coalesce(v_v.barcode,v_v.bulk_barcode);
    v_image:=coalesce(v_v.image_url,(v_p.image_urls)[1]);
  else
    if v_i.is_bulk then raise exception using errcode='22023',message='SUBSTITUTE_UNIT_MISMATCH'; end if;
    if v_i.product_id=p_product_id then raise exception using errcode='22023',message='SUBSTITUTE_SAME_PRODUCT'; end if;
    v_candidate_weight:=coalesce(v_p.barcode_type,'')='scale'
      or lower(coalesce(v_p.unit_of_measure,'')) in ('weight','kg','kilogram','كيلو');
    if v_candidate_weight<>v_i.is_weight_based then
      raise exception using errcode='22023',message='SUBSTITUTE_UNIT_MISMATCH';
    end if;
    v_available:=v_stock;
    v_price:=case
      when coalesce(v_p.is_offer,false) and coalesce(v_p.offer_price,0)>0 then v_p.offer_price
      else v_p.price
    end;
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
    'available_quantity',greatest(v_available,0),
    'stock_units_per_order_unit',v_factor,
    'is_bulk',p_variant_id is not null,
    'is_weight_based',v_candidate_weight,
    'unit_of_measure',v_p.unit_of_measure
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.resolve_order_substitution_v2(p_substitution_id uuid, p_decision text, p_actor uuid, p_source text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_decision text:=lower(trim(coalesce(p_decision,'')));
  v_source text:=lower(trim(coalesce(p_source,'')));
  v_note text:=trim(coalesce(p_note,''));
  v_sub private.order_fulfillment_substitutions_v1%rowtype;
  v_i private.order_fulfillment_items_v1%rowtype;
  v_f private.order_fulfillment_state_v1%rowtype;
  v_candidate jsonb;
  v_original_stock_units numeric;
  v_stock_after numeric;
  v_customer_uid uuid;
  v_staff_actor uuid;
  v_inventory_branch uuid;
begin
  if v_decision not in ('approve','reject') then
    raise exception using errcode='22023',message='INVALID_SUBSTITUTION_DECISION';
  end if;
  if v_source not in ('manager','customer','auto') then
    raise exception using errcode='22023',message='INVALID_SUBSTITUTION_RESOLUTION_SOURCE';
  end if;

  select * into v_sub
  from private.order_fulfillment_substitutions_v1
  where id=p_substitution_id for update;
  if v_sub.id is null then raise exception using errcode='22023',message='SUBSTITUTION_NOT_FOUND'; end if;
  if v_sub.status<>'pending' then
    return jsonb_build_object('ok',true,'id',v_sub.id,'status',v_sub.status,'idempotent',true);
  end if;
  if v_sub.approval_mode<>v_source then
    raise exception using errcode='42501',message='SUBSTITUTION_RESOLUTION_MODE_MISMATCH';
  end if;

  select * into v_i from private.order_fulfillment_items_v1 where id=v_sub.item_id for update;
  select * into v_f from private.order_fulfillment_state_v1 where order_id=v_sub.order_id for update;
  v_staff_actor:=case when v_source in ('manager','auto') then p_actor else null end;

  if v_decision='reject' then
    update private.order_fulfillment_substitutions_v1
    set status='rejected',
        resolved_by=v_staff_actor,
        customer_resolved_by=case when v_source='customer' then p_actor else null end,
        resolved_at=now(),
        resolution_source=v_source,
        resolution_note=coalesce(nullif(v_note,''),'تم رفض البديل'),
        updated_at=now()
    where id=v_sub.id
    returning * into v_sub;

    if v_sub.approval_task_id is not null then
      update public.operations_tasks
      set status='completed',
          claimed_by=case when v_source='manager' then coalesce(claimed_by,p_actor) else claimed_by end,
          claimed_at=case when v_source='manager' then coalesce(claimed_at,now()) else claimed_at end,
          started_at=case when v_source='manager' then coalesce(started_at,now()) else started_at end,
          completed_by=case when v_source='manager' then p_actor else null end,
          completed_at=now(),updated_at=now(),
          metadata=metadata||jsonb_build_object(
            'decision','rejected','resolution_source',v_source,
            'resolution_note',coalesce(nullif(v_note,''),'تم رفض البديل')
          )
      where id=v_sub.approval_task_id;

      insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
      values(v_sub.approval_task_id,'completed',v_staff_actor,'تم رفض البديل',
        jsonb_build_object('resolution_source',v_source));
    end if;

    insert into public.order_operations_realtime_signals_v1(branch_id,order_id,event_type)
    values(v_sub.branch_id,v_sub.order_id,'substitution_rejected');

    return jsonb_build_object('ok',true,'id',v_sub.id,'status','rejected','resolution_source',v_source);
  end if;

  if v_f.fulfillment_state<>'picking' then
    raise exception using errcode='55000',message='PICKING_NOT_ACTIVE';
  end if;

  v_candidate:=private.order_substitution_candidate_snapshot_v1(
    v_sub.item_id,v_sub.replacement_product_id,v_sub.replacement_variant_id
  );
  if coalesce((v_candidate->>'available_quantity')::numeric,0)+0.0005<v_sub.quantity then
    raise exception using errcode='22023',message='SUBSTITUTE_INSUFFICIENT_STOCK';
  end if;

  v_original_stock_units:=private.fulfillment_item_stock_units_v1(v_i.id,v_sub.quantity);
  perform private.release_order_inventory_reservation_quantity_v1(
    v_sub.order_id,v_i.product_id,v_original_stock_units,'order_substitution_approved'
  );

  select s.inventory_branch_id into v_inventory_branch
  from private.resolve_branch_sources(v_sub.branch_id) s;
  v_stock_after:=private.consume_available_inventory_v1(
    v_inventory_branch,v_sub.replacement_product_id,v_sub.stock_units_required,'order_substitution'
  );

  update private.order_fulfillment_substitutions_v1
  set replacement_inventory_state='consumed',
      replacement_inventory_consumed_at=now(),
      resolved_by=v_staff_actor,
      customer_resolved_by=case when v_source='customer' then p_actor else null end,
      resolved_at=now(),
      resolution_source=v_source,
      resolution_note=coalesce(nullif(v_note,''),'تم اعتماد البديل'),
      status='approved',updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'original_reservation_released_stock_units',v_original_stock_units,
        'replacement_stock_units_consumed',v_sub.stock_units_required
      )
  where id=v_sub.id
  returning * into v_sub;

  update private.order_fulfillment_items_v1
  set substitution_quantity=substitution_quantity+v_sub.quantity,
      status=case
        when picked_quantity+shortage_quantity+substitution_quantity+v_sub.quantity>=required_quantity-0.0005
          then 'substituted'
        else 'picking'
      end,
      completed_at=case
        when picked_quantity+shortage_quantity+substitution_quantity+v_sub.quantity>=required_quantity-0.0005
          then now()
        else completed_at
      end,
      note=concat_ws(' · ',nullif(note,''),'بديل معتمد: '||v_sub.replacement_product_name),
      updated_by=coalesce(v_staff_actor,updated_by),
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'approved_substitution_id',v_sub.id,
        'replacement_product_id',v_sub.replacement_product_id,
        'replacement_variant_id',v_sub.replacement_variant_id,
        'replacement_product_name',v_sub.replacement_product_name,
        'price_delta_total',v_sub.price_delta_total,
        'resolution_source',v_source
      )
  where id=v_i.id;

  perform private.refresh_order_fulfillment_item_totals_v1(v_sub.order_id);

  if v_sub.approval_task_id is not null then
    update public.operations_tasks
    set status='completed',
        claimed_by=case when v_source='manager' then coalesce(claimed_by,p_actor) else claimed_by end,
        claimed_at=case when v_source='manager' then coalesce(claimed_at,now()) else claimed_at end,
        started_at=case when v_source='manager' then coalesce(started_at,now()) else started_at end,
        completed_by=case when v_source='manager' then p_actor else null end,
        completed_at=now(),updated_at=now(),
        metadata=metadata||jsonb_build_object(
          'decision','approved','resolution_source',v_source,
          'resolution_note',coalesce(nullif(v_note,''),'تم اعتماد البديل'),
          'stock_after',v_stock_after
        )
    where id=v_sub.approval_task_id;

    insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
    values(v_sub.approval_task_id,'completed',v_staff_actor,'تم اعتماد البديل',
      jsonb_build_object('resolution_source',v_source));
  end if;

  if v_source<>'customer' then
    select c.user_id into v_customer_uid
    from public.online_orders o
    left join public.customers c on c.id=o.customer_id
    where o.id=v_sub.order_id;
    if v_customer_uid is not null then
      insert into public.customer_notifications(user_id,order_id,kind,status,title,body,dedupe_key)
      values(
        v_customer_uid,v_sub.order_id,'order_status','active','تم اعتماد بديل في طلبك',
        v_sub.original_product_name||' تم استبداله بـ '||v_sub.replacement_product_name||
        case
          when abs(v_sub.price_delta_total)<0.005 then ''
          else ' · فرق السعر '||trim(to_char(v_sub.price_delta_total,'FM999999990.00'))||' ج.م'
        end,
        'order-substitution-approved-v2:'||v_sub.id::text
      )
      on conflict(dedupe_key) do nothing;
    end if;
  end if;

  insert into public.order_operations_realtime_signals_v1(branch_id,order_id,event_type)
  values(v_sub.branch_id,v_sub.order_id,'substitution_approved');

  return jsonb_build_object(
    'ok',true,'id',v_sub.id,'status','approved','resolution_source',v_source,
    'price_delta_total',v_sub.price_delta_total,'financial_state',v_sub.financial_state,
    'stock_after',v_stock_after,
    'original_reservation_released_stock_units',v_original_stock_units
  );
end;
$function$;

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
    perform private.release_order_inventory_reservation_v1(
      new.id,coalesce(nullif(current_setting('app.order_cancel_reason',true),''),'order_cancelled')
    );
    perform private.restock_order_substitution_inventory_v1(
      new.id,coalesce(nullif(current_setting('app.order_cancel_reason',true),''),'order_cancelled')
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_order_fulfillment_substitution_candidates_v2(p_item_id uuid, p_query text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_base jsonb;
  v_i private.order_fulfillment_items_v1%rowtype;
  v_f private.order_fulfillment_state_v1%rowtype;
  v_inventory_branch uuid;
  v_orig_company uuid;
  v_items jsonb;
begin
  v_base:=public.search_order_fulfillment_substitution_candidates_v1(
    p_item_id,p_query,least(greatest(coalesce(p_limit,20)*3,20),100)
  );
  select * into v_i from private.order_fulfillment_items_v1 where id=p_item_id;
  select * into v_f from private.order_fulfillment_state_v1 where order_id=v_i.order_id;
  select company_id into v_orig_company from public.products where id=v_i.product_id;
  select s.inventory_branch_id into v_inventory_branch
  from private.resolve_branch_sources(v_f.branch_id) s;

  select coalesce(
    jsonb_agg(q.item order by q.is_predefined desc,q.same_brand desc,q.price_gap,q.name),
    '[]'::jsonb
  ) into v_items
  from (
    select
      e.value || jsonb_build_object(
        'available_quantity',x.real_available,
        'is_predefined',x.is_predefined,
        'same_brand',x.same_brand,
        'match_reason',case
          when x.is_predefined then 'predefined'
          when x.same_brand then 'same_brand'
          else 'same_category'
        end,
        'match_score',
          (case when x.is_predefined then 1000 else 0 end)
          +(case when x.same_brand then 100 else 0 end)
          +greatest(0::numeric,50::numeric-least(50::numeric,abs(coalesce((e.value->>'price_delta_per_unit')::numeric,0))))
      ) as item,
      x.is_predefined,
      x.same_brand,
      abs(coalesce((e.value->>'price_delta_per_unit')::numeric,0)) as price_gap,
      coalesce(e.value->>'name','') as name
    from jsonb_array_elements(coalesce(v_base->'items','[]'::jsonb)) as e(value)
    cross join lateral (
      select
        case
          when nullif(e.value->>'variant_id','') is not null
            then floor(
              private.inventory_available_quantity_v1(v_inventory_branch,(e.value->>'product_id')::uuid)
              / greatest(coalesce((e.value->>'stock_units_per_order_unit')::numeric,1),0.001)
            )
          else private.inventory_available_quantity_v1(v_inventory_branch,(e.value->>'product_id')::uuid)
        end as real_available,
        exists(
          select 1 from private.product_substitution_rules_v1 r
          where r.active
            and r.original_product_id=v_i.product_id
            and r.replacement_product_id=(e.value->>'product_id')::uuid
            and r.replacement_variant_id is not distinct from nullif(e.value->>'variant_id','')::uuid
            and (r.branch_id is null or r.branch_id=v_f.branch_id)
        ) as is_predefined,
        coalesce(
          (select p.company_id is not distinct from v_orig_company
           from public.products p
           where p.id=(e.value->>'product_id')::uuid),
          false
        ) as same_brand
    ) x
    where x.real_available>0
    order by x.is_predefined desc,x.same_brand desc,
      abs(coalesce((e.value->>'price_delta_per_unit')::numeric,0)),
      coalesce(e.value->>'name','')
    limit least(greatest(coalesce(p_limit,20),1),50)
  ) q;

  return jsonb_build_object(
    'item_id',p_item_id,
    'original_product_name',v_base->>'original_product_name',
    'original_unit_price',coalesce((v_base->>'original_unit_price')::numeric,0),
    'items',coalesce(v_items,'[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.propose_order_fulfillment_substitution_v2(p_item_id uuid, p_replacement_product_id uuid, p_replacement_variant_id uuid DEFAULT NULL::uuid, p_quantity numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_i private.order_fulfillment_items_v1%rowtype;
  v_policy text;
  v_result jsonb;
  v_id uuid;
  v_sub private.order_fulfillment_substitutions_v1%rowtype;
  v_mode text;
  v_customer_uid uuid;
  v_resolution jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_i from private.order_fulfillment_items_v1 where id=p_item_id;
  if v_i.id is null then raise exception using errcode='22023',message='PICKING_ITEM_NOT_FOUND'; end if;

  v_policy:=private.order_substitution_policy_v1(v_i.order_id);
  if v_policy='remove_item' then
    raise exception using errcode='55000',message='SUBSTITUTION_POLICY_REMOVE_ITEM';
  end if;

  v_result:=public.propose_order_fulfillment_substitution_v1(
    p_item_id,p_replacement_product_id,p_replacement_variant_id,p_quantity,p_note
  );
  v_id:=(v_result->'substitution'->>'id')::uuid;
  select * into v_sub from private.order_fulfillment_substitutions_v1 where id=v_id for update;

  v_mode:=case
    when v_policy='allow_substitutions' and v_sub.price_delta_total<=0.004 then 'auto'
    when v_policy in ('allow_substitutions','contact_me') then 'customer'
    else 'manager'
  end;

  update private.order_fulfillment_substitutions_v1
  set approval_mode=v_mode,
      customer_decision_due_at=case when v_mode='customer' then now()+interval '10 minutes' else null end,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'substitution_policy',v_policy,'approval_mode',v_mode
      ),
      updated_at=now()
  where id=v_id
  returning * into v_sub;

  if v_sub.approval_task_id is not null then
    update public.operations_tasks
    set title=case
          when v_mode='customer' then 'انتظار موافقة العميل على البديل'
          when v_mode='auto' then 'اعتماد تلقائي لبديل مناسب'
          else title
        end,
        description=case
          when v_mode='customer'
            then v_sub.original_product_name||' ← '||v_sub.replacement_product_name||' · العميل مطلوب يوافق من التطبيق.'
          when v_mode='auto'
            then v_sub.original_product_name||' ← '||v_sub.replacement_product_name||' · مطابق لسياسة العميل ولا يزيد السعر.'
          else description
        end,
        due_at=case when v_mode='customer' then v_sub.customer_decision_due_at else due_at end,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'substitution_policy',v_policy,'approval_mode',v_mode
        ),
        updated_at=now()
    where id=v_sub.approval_task_id;
  end if;

  if v_mode='customer' then
    select c.user_id into v_customer_uid
    from public.online_orders o join public.customers c on c.id=o.customer_id
    where o.id=v_sub.order_id;

    if v_customer_uid is not null then
      insert into public.customer_notifications(user_id,order_id,kind,status,title,body,dedupe_key)
      values(
        v_customer_uid,v_sub.order_id,'order_status','active','بديل يحتاج موافقتك',
        v_sub.original_product_name||' غير متاح. المقترح: '||v_sub.replacement_product_name||
        case
          when abs(v_sub.price_delta_total)<0.005 then ' · نفس القيمة تقريبًا'
          when v_sub.price_delta_total>0 then ' · زيادة '||trim(to_char(v_sub.price_delta_total,'FM999999990.00'))||' ج.م'
          else ' · توفير '||trim(to_char(abs(v_sub.price_delta_total),'FM999999990.00'))||' ج.م'
        end||'. افتح طلبك للموافقة أو الرفض.',
        'order-substitution-customer-decision:'||v_sub.id::text
      )
      on conflict(dedupe_key) do nothing;
    end if;
  elsif v_mode='auto' then
    v_resolution:=private.resolve_order_substitution_v2(
      v_sub.id,'approve',v_uid,'auto','تم الاعتماد تلقائيًا حسب اختيار العميل'
    );
    return jsonb_build_object(
      'ok',true,'substitution',to_jsonb(v_sub)-'metadata',
      'approval_mode',v_mode,'substitution_policy',v_policy,'auto_resolution',v_resolution
    );
  end if;

  return jsonb_build_object(
    'ok',true,'substitution',to_jsonb(v_sub)-'metadata',
    'approval_mode',v_mode,'substitution_policy',v_policy
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.decide_order_fulfillment_substitution_v1(p_substitution_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_sub private.order_fulfillment_substitutions_v1%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_sub from private.order_fulfillment_substitutions_v1 where id=p_substitution_id;
  if v_sub.id is null then raise exception using errcode='22023',message='SUBSTITUTION_NOT_FOUND'; end if;
  if not (public.staff_has_permission('online_orders.manage',v_sub.branch_id) or private.staff_is_super_admin(v_uid)) then
    raise exception using errcode='42501',message='SUBSTITUTION_APPROVAL_DENIED';
  end if;
  if v_sub.approval_mode='customer' then
    raise exception using errcode='42501',message='CUSTOMER_DECISION_REQUIRED';
  end if;
  if v_sub.approval_mode='auto' then
    return jsonb_build_object('ok',true,'id',v_sub.id,'status',v_sub.status,'idempotent',true);
  end if;
  if length(trim(coalesce(p_note,'')))<3 then
    raise exception using errcode='22023',message='SUBSTITUTION_DECISION_NOTE_REQUIRED';
  end if;
  return private.resolve_order_substitution_v2(p_substitution_id,p_decision,v_uid,'manager',p_note);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_order_substitution_approvals_v1(p_branch_id uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_items jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),150);
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;
  if not (public.staff_has_permission('online_orders.manage',p_branch_id) or private.staff_is_super_admin(v_uid)) then
    raise exception using errcode='42501',message='SUBSTITUTION_APPROVAL_DENIED';
  end if;

  select coalesce(jsonb_agg(x.obj order by x.sort_due,x.sort_proposed),'[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'id',s.id,'task_id',s.approval_task_id,'order_id',s.order_id,
      'tracking_number',o.tracking_number,'item_id',s.item_id,
      'original_product_name',s.original_product_name,'replacement_product_name',s.replacement_product_name,
      'replacement_product_id',s.replacement_product_id,'replacement_variant_id',s.replacement_variant_id,
      'replacement_barcode',s.replacement_barcode,'replacement_image_url',s.replacement_image_url,
      'quantity',s.quantity,'original_unit_price',s.original_unit_price,
      'replacement_unit_price',s.replacement_unit_price,'price_delta_total',s.price_delta_total,
      'financial_state',s.financial_state,'status',s.status,'approval_mode',s.approval_mode,
      'proposed_by',s.proposed_by,'proposed_by_name',u.name,'proposed_at',s.proposed_at,
      'due_at',t.due_at,'task_status',t.status
    ) obj,
    coalesce(t.due_at,s.proposed_at) sort_due,
    s.proposed_at sort_proposed
    from private.order_fulfillment_substitutions_v1 s
    join public.online_orders o on o.id=s.order_id
    left join public.users u on u.id=s.proposed_by
    left join public.operations_tasks t on t.id=s.approval_task_id
    where s.branch_id=p_branch_id and s.status='pending' and s.approval_mode='manager'
    order by coalesce(t.due_at,s.proposed_at),s.proposed_at
    limit v_limit
  ) x;

  return jsonb_build_object(
    'branch_id',p_branch_id,
    'count',jsonb_array_length(coalesce(v_items,'[]'::jsonb)),
    'items',coalesce(v_items,'[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_order_picking_session_v2(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_base jsonb;
begin
  v_base:=public.get_my_order_picking_session_v1(p_order_id);
  return v_base||jsonb_build_object('substitution_policy',private.order_substitution_policy_v1(p_order_id));
end;
$function$;

CREATE OR REPLACE FUNCTION public.mark_order_fulfillment_shortage_v2(p_item_id uuid, p_shortage_quantity numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_i private.order_fulfillment_items_v1%rowtype;
  v_result jsonb;
  v_stock_units numeric;
begin
  select * into v_i from private.order_fulfillment_items_v1 where id=p_item_id;
  if v_i.id is null then raise exception using errcode='22023',message='PICKING_ITEM_NOT_FOUND'; end if;
  v_stock_units:=private.fulfillment_item_stock_units_v1(p_item_id,p_shortage_quantity);
  v_result:=public.mark_order_fulfillment_shortage_v1(p_item_id,p_shortage_quantity,p_note);
  perform private.release_order_inventory_reservation_quantity_v1(
    v_i.order_id,v_i.product_id,v_stock_units,'order_fulfillment_shortage'
  );
  return v_result||jsonb_build_object('released_reservation_stock_units',v_stock_units);
end;
$function$;


revoke execute on function private.resolve_order_substitution_v2(uuid,text,uuid,text,text)
from public,anon,authenticated;

revoke all on function public.search_order_fulfillment_substitution_candidates_v2(uuid,text,integer) from public;
revoke all on function public.propose_order_fulfillment_substitution_v2(uuid,uuid,uuid,numeric,text) from public;
revoke all on function public.get_my_order_picking_session_v2(uuid) from public;
revoke all on function public.mark_order_fulfillment_shortage_v2(uuid,numeric,text) from public;

grant execute on function public.search_order_fulfillment_substitution_candidates_v2(uuid,text,integer) to authenticated;
grant execute on function public.propose_order_fulfillment_substitution_v2(uuid,uuid,uuid,numeric,text) to authenticated;
grant execute on function public.get_my_order_picking_session_v2(uuid) to authenticated;
grant execute on function public.mark_order_fulfillment_shortage_v2(uuid,numeric,text) to authenticated;
