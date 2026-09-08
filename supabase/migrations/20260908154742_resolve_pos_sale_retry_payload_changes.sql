create or replace function public.create_pos_sale_v2(
  p_request_id uuid,
  p_branch_id uuid,
  p_sale jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_method_id uuid;
  v_method public.pos_payment_methods%rowtype;
  v_reference text;
  v_result jsonb;
  v_sale public.sales%rowtype;
  v_payment public.pos_sale_payments%rowtype;
  v_requested_device_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;

  if p_request_id is null or p_branch_id is null then
    raise exception using errcode='22023', message='INVALID_SALE';
  end if;

  -- Resolve a previously committed request before validating the new payload.
  -- This makes retries safe even when the cashier changed payment/customer/voucher
  -- after an uncertain client response: a committed sale is returned, never duplicated.
  select * into v_sale
  from public.sales
  where id = p_request_id;

  if v_sale.id is not null then
    begin
      v_requested_device_id := nullif(p_sale->>'device_id','')::uuid;
    exception when others then
      v_requested_device_id := null;
    end;

    if v_sale.cashier_id is distinct from auth.uid()
       or v_sale.branch_id is distinct from p_branch_id
       or (v_sale.device_id is not null and v_requested_device_id is distinct from v_sale.device_id)
    then
      raise exception using errcode='42501', message='REQUEST_CONFLICT';
    end if;

    select * into v_payment
    from public.pos_sale_payments
    where sale_id = v_sale.id;

    return to_jsonb(v_sale)
      || jsonb_build_object(
        'amount_due', coalesce(v_sale.amount_charged, v_sale.total),
        'payment_base_due', coalesce(v_payment.base_amount, greatest(round(coalesce(v_sale.total,0)-coalesce(v_sale.loyalty_voucher_amount,0),2),0)),
        'payment_fee_amount', coalesce(v_sale.payment_fee_amount,0),
        'customer_payment_fee_amount', coalesce(v_sale.customer_payment_fee_amount,0),
        'merchant_payment_fee_amount', coalesce(v_sale.merchant_payment_fee_amount,0),
        'amount_charged', coalesce(v_sale.amount_charged, v_sale.total),
        'estimated_net_settlement', coalesce(v_payment.estimated_net_settlement, coalesce(v_sale.amount_charged, v_sale.total)),
        'request_replayed', true
      );
  end if;

  perform private.ensure_default_pos_payment_methods(p_branch_id);

  begin
    v_method_id := nullif(p_sale->>'payment_method_id','')::uuid;
  exception when others then
    raise exception using errcode='22023', message='PAYMENT_METHOD_REQUIRED';
  end;

  if v_method_id is null then
    raise exception using errcode='22023', message='PAYMENT_METHOD_REQUIRED';
  end if;

  select * into v_method
  from public.pos_payment_methods
  where id = v_method_id
    and branch_id = p_branch_id
    and active;

  if v_method.id is null then
    raise exception using errcode='22023', message='PAYMENT_METHOD_UNAVAILABLE';
  end if;

  v_reference := nullif(btrim(coalesce(p_sale->>'payment_reference','')), '');
  if v_method.require_reference and v_reference is null then
    raise exception using errcode='22023', message='PAYMENT_REFERENCE_REQUIRED';
  end if;

  v_result := public.create_pos_sale(
    p_request_id,
    p_branch_id,
    p_sale || jsonb_build_object(
      'payment_method_id', v_method.id,
      'payment_reference', v_reference
    )
  );

  select * into v_sale
  from public.sales
  where id = p_request_id;

  if v_sale.id is null then
    raise exception using errcode='55000', message='SALE_NOT_CONFIRMED';
  end if;

  if v_sale.payment_method_id is distinct from v_method.id then
    raise exception using errcode='42501', message='REQUEST_CONFLICT';
  end if;

  select * into v_payment
  from public.pos_sale_payments
  where sale_id = v_sale.id;

  return coalesce(v_result, '{}'::jsonb)
    || to_jsonb(v_sale)
    || jsonb_build_object(
      'amount_due', coalesce(v_sale.amount_charged, v_sale.total),
      'payment_base_due', coalesce(v_payment.base_amount, greatest(round(coalesce(v_sale.total,0)-coalesce(v_sale.loyalty_voucher_amount,0),2),0)),
      'payment_fee_amount', coalesce(v_sale.payment_fee_amount,0),
      'customer_payment_fee_amount', coalesce(v_sale.customer_payment_fee_amount,0),
      'merchant_payment_fee_amount', coalesce(v_sale.merchant_payment_fee_amount,0),
      'amount_charged', coalesce(v_sale.amount_charged, v_sale.total),
      'estimated_net_settlement', coalesce(v_payment.estimated_net_settlement, coalesce(v_sale.amount_charged, v_sale.total)),
      'request_replayed', false
    );
end;
$function$;

revoke all on function public.create_pos_sale_v2(uuid,uuid,jsonb) from public, anon;
grant execute on function public.create_pos_sale_v2(uuid,uuid,jsonb) to authenticated;
