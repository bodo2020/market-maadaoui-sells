-- M15c — customer substitution decisions + checkout policy snapshot.
CREATE OR REPLACE FUNCTION public.get_my_order_substitutions_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_policy text;
  v_items jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not exists(
    select 1 from public.online_orders o
    join public.customers c on c.id=o.customer_id
    where o.id=p_order_id and c.user_id=v_uid
  ) then raise exception using errcode='42501',message='ORDER_ACCESS_DENIED'; end if;

  v_policy:=private.order_substitution_policy_v1(p_order_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'item_id',s.item_id,'status',s.status,'approval_mode',s.approval_mode,
    'original_product_name',s.original_product_name,
    'replacement_product_name',s.replacement_product_name,
    'replacement_image_url',s.replacement_image_url,
    'quantity',s.quantity,'original_unit_price',s.original_unit_price,
    'replacement_unit_price',s.replacement_unit_price,
    'price_delta_total',s.price_delta_total,'financial_state',s.financial_state,
    'proposed_at',s.proposed_at,'customer_decision_due_at',s.customer_decision_due_at,
    'resolved_at',s.resolved_at,'resolution_source',s.resolution_source,
    'resolution_note',s.resolution_note,
    'can_decide',(s.status='pending' and s.approval_mode='customer')
  ) order by s.proposed_at desc),'[]'::jsonb)
  into v_items
  from private.order_fulfillment_substitutions_v1 s
  where s.order_id=p_order_id;

  return jsonb_build_object(
    'order_id',p_order_id,
    'substitution_policy',v_policy,
    'items',coalesce(v_items,'[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.decide_my_order_substitution_v1(p_substitution_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_sub private.order_fulfillment_substitutions_v1%rowtype;
  v_decision text:=lower(trim(coalesce(p_decision,'')));
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if v_decision not in ('approve','reject') then
    raise exception using errcode='22023',message='INVALID_SUBSTITUTION_DECISION';
  end if;

  select * into v_sub
  from private.order_fulfillment_substitutions_v1
  where id=p_substitution_id;

  if v_sub.id is null then raise exception using errcode='22023',message='SUBSTITUTION_NOT_FOUND'; end if;

  if not exists(
    select 1 from public.online_orders o
    join public.customers c on c.id=o.customer_id
    where o.id=v_sub.order_id and c.user_id=v_uid
  ) then raise exception using errcode='42501',message='ORDER_ACCESS_DENIED'; end if;

  if v_sub.approval_mode<>'customer' then
    raise exception using errcode='42501',message='CUSTOMER_DECISION_NOT_REQUIRED';
  end if;

  return private.resolve_order_substitution_v2(
    p_substitution_id,v_decision,v_uid,'customer',
    case when v_decision='approve' then 'وافق العميل من التطبيق' else 'رفض العميل من التطبيق' end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.place_customer_order_with_voucher_v3(p_request_id uuid, p_items jsonb, p_address_id uuid, p_payment_method text, p_notes text, p_quote_token text, p_voucher_code text, p_voucher_amount numeric, p_route_quote_id uuid, p_substitution_policy text DEFAULT 'contact_me'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_substitution_policy not in ('allow_substitutions','contact_me','remove_item') then
    raise exception using errcode='22023',message='INVALID_SUBSTITUTION_POLICY';
  end if;

  v_result:=public.place_customer_order_with_voucher_v2(
    p_request_id,p_items,p_address_id,p_payment_method,p_notes,p_quote_token,
    p_voucher_code,p_voucher_amount,p_route_quote_id
  );
  perform private.set_order_substitution_preference_v1(
    (v_result->>'id')::uuid,p_substitution_policy,auth.uid()
  );
  return v_result||jsonb_build_object('substitution_policy',p_substitution_policy);
end;
$function$;

CREATE OR REPLACE FUNCTION public.place_marketplace_order_v3(p_request_id uuid, p_branch_id uuid, p_items jsonb, p_address_id uuid, p_payment_method text, p_notes text, p_quote_token text, p_route_quote_id uuid, p_substitution_policy text DEFAULT 'contact_me'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_substitution_policy not in ('allow_substitutions','contact_me','remove_item') then
    raise exception using errcode='22023',message='INVALID_SUBSTITUTION_POLICY';
  end if;

  v_result:=public.place_marketplace_order_v2(
    p_request_id,p_branch_id,p_items,p_address_id,p_payment_method,p_notes,
    p_quote_token,p_route_quote_id
  );
  perform private.set_order_substitution_preference_v1(
    (v_result->>'id')::uuid,p_substitution_policy,auth.uid()
  );
  return v_result||jsonb_build_object('substitution_policy',p_substitution_policy);
end;
$function$;

CREATE OR REPLACE FUNCTION public.place_combined_order_group_v3(p_group_id uuid, p_sources jsonb, p_address_id uuid, p_payment_method text, p_notes text, p_quote_token text, p_route_quote_id uuid, p_substitution_policy text DEFAULT 'contact_me'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb; r jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_substitution_policy not in ('allow_substitutions','contact_me','remove_item') then
    raise exception using errcode='22023',message='INVALID_SUBSTITUTION_POLICY';
  end if;

  v_result:=public.place_combined_order_group_v2(
    p_group_id,p_sources,p_address_id,p_payment_method,p_notes,p_quote_token,p_route_quote_id
  );

  for r in select value from jsonb_array_elements(coalesce(v_result->'orders','[]'::jsonb))
  loop
    perform private.set_order_substitution_preference_v1(
      (r->>'order_id')::uuid,p_substitution_policy,auth.uid()
    );
  end loop;

  return v_result||jsonb_build_object('substitution_policy',p_substitution_policy);
end;
$function$;


revoke all on function public.get_my_order_substitutions_v1(uuid) from public;
revoke all on function public.decide_my_order_substitution_v1(uuid,text) from public;
revoke all on function public.place_customer_order_with_voucher_v3(uuid,jsonb,uuid,text,text,text,text,numeric,uuid,text) from public;
revoke all on function public.place_marketplace_order_v3(uuid,uuid,jsonb,uuid,text,text,text,uuid,text) from public;
revoke all on function public.place_combined_order_group_v3(uuid,jsonb,uuid,text,text,text,uuid,text) from public;

grant execute on function public.get_my_order_substitutions_v1(uuid) to authenticated;
grant execute on function public.decide_my_order_substitution_v1(uuid,text) to authenticated;
grant execute on function public.place_customer_order_with_voucher_v3(uuid,jsonb,uuid,text,text,text,text,numeric,uuid,text) to authenticated;
grant execute on function public.place_marketplace_order_v3(uuid,uuid,jsonb,uuid,text,text,text,uuid,text) to authenticated;
grant execute on function public.place_combined_order_group_v3(uuid,jsonb,uuid,text,text,text,uuid,text) to authenticated;
