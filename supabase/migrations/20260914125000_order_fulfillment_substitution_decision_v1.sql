create or replace function public.list_order_substitution_approvals_v1(
  p_branch_id uuid,
  p_limit integer default 50
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_items jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),150);
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(v_uid,p_branch_id) then raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED'; end if;
  if not (public.staff_has_permission('online_orders.manage',p_branch_id) or private.staff_is_super_admin(v_uid)) then raise exception using errcode='42501',message='SUBSTITUTION_APPROVAL_DENIED'; end if;

  select coalesce(jsonb_agg(x.obj order by x.sort_due,x.sort_proposed),'[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'id',s.id,
      'task_id',s.approval_task_id,
      'order_id',s.order_id,
      'tracking_number',o.tracking_number,
      'item_id',s.item_id,
      'original_product_name',s.original_product_name,
      'replacement_product_name',s.replacement_product_name,
      'replacement_product_id',s.replacement_product_id,
      'replacement_variant_id',s.replacement_variant_id,
      'replacement_barcode',s.replacement_barcode,
      'replacement_image_url',s.replacement_image_url,
      'quantity',s.quantity,
      'original_unit_price',s.original_unit_price,
      'replacement_unit_price',s.replacement_unit_price,
      'price_delta_total',s.price_delta_total,
      'financial_state',s.financial_state,
      'status',s.status,
      'proposed_by',s.proposed_by,
      'proposed_by_name',u.name,
      'proposed_at',s.proposed_at,
      'due_at',t.due_at,
      'task_status',t.status
    ) obj,
    coalesce(t.due_at,s.proposed_at) sort_due,
    s.proposed_at sort_proposed
    from private.order_fulfillment_substitutions_v1 s
    join public.online_orders o on o.id=s.order_id
    left join public.users u on u.id=s.proposed_by
    left join public.operations_tasks t on t.id=s.approval_task_id
    where s.branch_id=p_branch_id and s.status='pending'
    order by coalesce(t.due_at,s.proposed_at),s.proposed_at
    limit v_limit
  ) x;

  return jsonb_build_object(
    'branch_id',p_branch_id,
    'count',jsonb_array_length(coalesce(v_items,'[]'::jsonb)),
    'items',coalesce(v_items,'[]'::jsonb)
  );
end;
$$;

create or replace function public.decide_order_fulfillment_substitution_v1(
  p_substitution_id uuid,
  p_decision text,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_decision text:=lower(trim(coalesce(p_decision,'')));
  v_note text:=trim(coalesce(p_note,''));
  v_sub private.order_fulfillment_substitutions_v1%rowtype;
  v_i private.order_fulfillment_items_v1%rowtype;
  v_f private.order_fulfillment_state_v1%rowtype;
  v_candidate jsonb;
  v_inventory_branch uuid;
  v_stock_after numeric;
  v_customer_uid uuid;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if v_decision not in ('approve','reject') then raise exception using errcode='22023',message='INVALID_SUBSTITUTION_DECISION'; end if;
  if length(v_note)<3 then raise exception using errcode='22023',message='SUBSTITUTION_DECISION_NOTE_REQUIRED'; end if;

  select * into v_sub
  from private.order_fulfillment_substitutions_v1
  where id=p_substitution_id
  for update;
  if v_sub.id is null then raise exception using errcode='22023',message='SUBSTITUTION_NOT_FOUND'; end if;

  if not (public.staff_has_permission('online_orders.manage',v_sub.branch_id) or private.staff_is_super_admin(v_uid)) then raise exception using errcode='42501',message='SUBSTITUTION_APPROVAL_DENIED'; end if;
  if v_sub.status<>'pending' then
    return jsonb_build_object('ok',true,'id',v_sub.id,'status',v_sub.status,'idempotent',true);
  end if;

  select * into v_i from private.order_fulfillment_items_v1 where id=v_sub.item_id for update;
  select * into v_f from private.order_fulfillment_state_v1 where order_id=v_sub.order_id for update;

  if v_decision='reject' then
    update private.order_fulfillment_substitutions_v1
    set status='rejected',resolved_by=v_uid,resolved_at=now(),resolution_note=v_note,updated_at=now()
    where id=v_sub.id
    returning * into v_sub;

    if v_sub.approval_task_id is not null then
      update public.operations_tasks
      set status='completed',
          claimed_by=coalesce(claimed_by,v_uid),
          claimed_at=coalesce(claimed_at,now()),
          started_at=coalesce(started_at,now()),
          completed_by=v_uid,
          completed_at=now(),
          updated_at=now(),
          metadata=metadata||jsonb_build_object('decision','rejected','resolution_note',v_note)
      where id=v_sub.approval_task_id;

      insert into public.operations_task_events(task_id,event_type,actor_id,note)
      values(v_sub.approval_task_id,'completed',v_uid,'تم رفض البديل: '||v_note);
    end if;

    insert into public.order_operations_realtime_signals_v1(branch_id,order_id,event_type)
    values(v_sub.branch_id,v_sub.order_id,'substitution_rejected');

    return jsonb_build_object('ok',true,'id',v_sub.id,'status','rejected');
  end if;

  if v_f.fulfillment_state<>'picking' then raise exception using errcode='55000',message='PICKING_NOT_ACTIVE'; end if;

  v_candidate:=private.order_substitution_candidate_snapshot_v1(
    v_sub.item_id,
    v_sub.replacement_product_id,
    v_sub.replacement_variant_id
  );
  if coalesce((v_candidate->>'available_quantity')::numeric,0)+0.0005<v_sub.quantity then raise exception using errcode='22023',message='SUBSTITUTE_INSUFFICIENT_STOCK'; end if;

  select s.inventory_branch_id into v_inventory_branch
  from private.resolve_branch_sources(v_sub.branch_id) s;

  perform set_config('app.inventory_movement_source','order_substitution',true);
  perform set_config('app.inventory_task_id',coalesce(v_sub.approval_task_id::text,''),true);
  perform set_config('app.inventory_reason_code','order_substitution',true);
  perform set_config('app.inventory_note','بديل طلب: '||v_sub.original_product_name||' ← '||v_sub.replacement_product_name,true);

  update public.inventory
  set quantity=quantity-v_sub.stock_units_required
  where product_id=v_sub.replacement_product_id
    and branch_id=v_inventory_branch
    and quantity+0.0005>=v_sub.stock_units_required
  returning quantity into v_stock_after;
  if not found then raise exception using errcode='22023',message='SUBSTITUTE_INSUFFICIENT_STOCK'; end if;

  update private.order_fulfillment_substitutions_v1
  set status='approved',resolved_by=v_uid,resolved_at=now(),resolution_note=v_note,updated_at=now()
  where id=v_sub.id
  returning * into v_sub;

  update private.order_fulfillment_items_v1
  set substitution_quantity=substitution_quantity+v_sub.quantity,
      status=case
        when picked_quantity+shortage_quantity+substitution_quantity+v_sub.quantity>=required_quantity-0.0005 then 'substituted'
        else 'picking'
      end,
      completed_at=case
        when picked_quantity+shortage_quantity+substitution_quantity+v_sub.quantity>=required_quantity-0.0005 then now()
        else completed_at
      end,
      note=concat_ws(' · ',nullif(note,''),'بديل معتمد: '||v_sub.replacement_product_name),
      updated_by=v_uid,
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'approved_substitution_id',v_sub.id,
        'replacement_product_id',v_sub.replacement_product_id,
        'replacement_variant_id',v_sub.replacement_variant_id,
        'replacement_product_name',v_sub.replacement_product_name,
        'price_delta_total',v_sub.price_delta_total
      )
  where id=v_i.id;

  perform private.refresh_order_fulfillment_item_totals_v1(v_sub.order_id);

  if v_sub.approval_task_id is not null then
    update public.operations_tasks
    set status='completed',
        claimed_by=coalesce(claimed_by,v_uid),
        claimed_at=coalesce(claimed_at,now()),
        started_at=coalesce(started_at,now()),
        completed_by=v_uid,
        completed_at=now(),
        updated_at=now(),
        metadata=metadata||jsonb_build_object('decision','approved','resolution_note',v_note,'stock_after',v_stock_after)
    where id=v_sub.approval_task_id;

    insert into public.operations_task_events(task_id,event_type,actor_id,note)
    values(v_sub.approval_task_id,'completed',v_uid,'تم اعتماد البديل: '||v_note);
  end if;

  select c.user_id into v_customer_uid
  from public.online_orders o
  left join public.customers c on c.id=o.customer_id
  where o.id=v_sub.order_id;

  if v_customer_uid is not null then
    insert into public.customer_notifications(user_id,order_id,kind,status,title,body,dedupe_key)
    values(
      v_customer_uid,
      v_sub.order_id,
      'order_status',
      'active',
      'تم اعتماد بديل في طلبك',
      v_sub.original_product_name||' تم استبداله بـ '||v_sub.replacement_product_name||
        case when abs(v_sub.price_delta_total)<0.005 then '' else ' · فرق السعر '||trim(to_char(v_sub.price_delta_total,'FM999999990.00'))||' ج.م' end,
      'order-substitution-approved:'||v_sub.id::text
    )
    on conflict (dedupe_key) do nothing;
  end if;

  insert into public.order_operations_realtime_signals_v1(branch_id,order_id,event_type)
  values(v_sub.branch_id,v_sub.order_id,'substitution_approved');

  return jsonb_build_object(
    'ok',true,
    'id',v_sub.id,
    'status','approved',
    'price_delta_total',v_sub.price_delta_total,
    'financial_state',v_sub.financial_state,
    'stock_after',v_stock_after
  );
end;
$$;

revoke all on function public.list_order_substitution_approvals_v1(uuid,integer) from public;
revoke all on function public.decide_order_fulfillment_substitution_v1(uuid,text,text) from public;
grant execute on function public.list_order_substitution_approvals_v1(uuid,integer) to authenticated;
grant execute on function public.decide_order_fulfillment_substitution_v1(uuid,text,text) to authenticated;
