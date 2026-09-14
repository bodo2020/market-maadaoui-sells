create or replace function public.get_my_order_picking_session_v1(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_f private.order_fulfillment_state_v1%rowtype;
  v_result jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  perform private.sync_order_fulfillment_items_v1(p_order_id);
  select * into v_f from private.order_fulfillment_state_v1 where order_id=p_order_id;
  if v_f.order_id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  if not private.fulfillment_actor_allowed_v1(v_uid,v_f.branch_id) then raise exception using errcode='42501',message='FULFILLMENT_PERMISSION_DENIED'; end if;
  if v_f.picker_user_id is not null and v_f.picker_user_id<>v_uid and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;

  select jsonb_build_object(
    'order_id',p_order_id,
    'fulfillment_state',v_f.fulfillment_state,
    'picker_user_id',v_f.picker_user_id,
    'items_total',v_f.items_total,
    'items_picked',v_f.items_picked,
    'shortage_count',v_f.shortage_count,
    'substitution_count',v_f.substitution_count,
    'pending_substitution_count',(
      select count(*)
      from private.order_fulfillment_substitutions_v1 s
      where s.order_id=p_order_id and s.status='pending'
    ),
    'resolved_count',v_f.items_picked+v_f.shortage_count+v_f.substitution_count,
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'id',i.id,
      'line_no',i.line_no,
      'product_id',i.product_id,
      'variant_id',i.variant_id,
      'barcode',i.barcode,
      'product_name',i.product_name,
      'image_url',i.image_url,
      'required_quantity',i.required_quantity,
      'picked_quantity',i.picked_quantity,
      'shortage_quantity',i.shortage_quantity,
      'substitution_quantity',i.substitution_quantity,
      'is_weight_based',i.is_weight_based,
      'is_bulk',i.is_bulk,
      'bulk_quantity',i.bulk_quantity,
      'unit_of_measure',i.unit_of_measure,
      'status',i.status,
      'last_scanned_at',i.last_scanned_at,
      'note',i.note,
      'substitution',(
        select jsonb_build_object(
          'id',s.id,
          'status',s.status,
          'replacement_product_id',s.replacement_product_id,
          'replacement_variant_id',s.replacement_variant_id,
          'replacement_product_name',s.replacement_product_name,
          'replacement_barcode',s.replacement_barcode,
          'replacement_image_url',s.replacement_image_url,
          'quantity',s.quantity,
          'original_unit_price',s.original_unit_price,
          'replacement_unit_price',s.replacement_unit_price,
          'price_delta_total',s.price_delta_total,
          'financial_state',s.financial_state,
          'proposed_at',s.proposed_at,
          'resolved_at',s.resolved_at,
          'resolution_note',s.resolution_note
        )
        from private.order_fulfillment_substitutions_v1 s
        where s.item_id=i.id
        order by s.proposed_at desc
        limit 1
      )
    ) order by case i.status when 'pending' then 0 when 'picking' then 1 else 2 end,i.line_no),'[]'::jsonb)
  ) into v_result
  from private.order_fulfillment_items_v1 i
  where i.order_id=p_order_id;

  return v_result;
end;
$$;
