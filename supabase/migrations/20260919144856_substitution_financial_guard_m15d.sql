-- M15d — narrow internal checkout guard for substitution financial adjustments.
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
  v_substitution_finance_context text:=nullif(current_setting('app.substitution_financial_write',true),'');
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

  if tg_op='UPDATE'
     and v_substitution_finance_context=new.id::text
     and (to_jsonb(new)-array['total','updated_at']) is not distinct from
         (to_jsonb(old)-array['total','updated_at']) then
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

  perform set_config('app.substitution_financial_write',v_sub.order_id::text,true);

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

  perform set_config('app.substitution_financial_write','',true);

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

revoke execute on function private.resolve_order_substitution_v2(uuid,text,uuid,text,text) from public,anon,authenticated;
