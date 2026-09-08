-- Modern POS refund flow: loyalty-aware split, dynamic payment labels,
-- and settlement ledger reversal after provider confirmation.

alter table public.returns drop constraint if exists returns_pos_refund_split_matches_total;
alter table public.returns add constraint returns_pos_refund_split_matches_total
check (
  source <> 'pos'
  or abs(round((coalesce(refund_cash_amount,0) + coalesce(refund_card_amount,0) + coalesce(refund_loyalty_amount,0)) - total_amount, 2)) < 0.01
);

create or replace function public.get_pos_sale_return_preview(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_sale public.sales%rowtype;
  v_method public.pos_payment_methods%rowtype;
  v_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_idx integer;
  v_sold numeric;
  v_returned numeric;
  v_returned_amount numeric;
  v_prev_total numeric;
  v_prev_cash numeric;
  v_prev_card numeric;
  v_prev_loyalty numeric;
  v_base_paid numeric;
  v_amount_charged numeric;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_sale from public.sales where id=p_sale_id;
  if v_sale.id is null or v_sale.request_fingerprint is null or v_sale.branch_id is null then
    raise exception using errcode='22023',message='POS_SALE_NOT_FOUND';
  end if;
  if not public.staff_has_permission('sales.refund',v_sale.branch_id) then
    raise exception using errcode='42501',message='REFUND_PERMISSION_DENIED';
  end if;

  if v_sale.payment_method_id is not null then
    select * into v_method from public.pos_payment_methods where id=v_sale.payment_method_id;
  end if;

  if jsonb_array_length(v_sale.items)>0 then
    for v_idx in 0..jsonb_array_length(v_sale.items)-1 loop
      v_line := v_sale.items->v_idx;
      v_sold := coalesce(nullif(v_line->>'weight','')::numeric,nullif(v_line->>'quantity','')::numeric,0);
      select coalesce(sum(ri.quantity),0),coalesce(sum(ri.total),0)
        into v_returned,v_returned_amount
      from public.return_items ri
      join public.returns r on r.id=ri.return_id
      where r.sale_id=v_sale.id and ri.sale_line_index=v_idx and r.status='approved';

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'line_index',v_idx,
        'product_id',v_line->'product'->>'id',
        'product_name',v_line->'product'->>'name',
        'sold_quantity',round(v_sold,3),
        'returned_quantity',round(v_returned,3),
        'available_quantity',greatest(0,round(v_sold-v_returned,3)),
        'line_total',coalesce((v_line->>'total')::numeric,0),
        'returned_amount',round(v_returned_amount,2),
        'remaining_amount',greatest(0,round(coalesce((v_line->>'total')::numeric,0)-v_returned_amount,2)),
        'unit_price',coalesce((v_line->>'price')::numeric,0),
        'purchase_price',coalesce((v_line->'product'->>'purchase_price')::numeric,0),
        'is_bulk',coalesce((v_line->>'isBulk')::boolean,false),
        'weight_based',(v_line->'weight') is not null and jsonb_typeof(v_line->'weight')<>'null',
        'bulk_quantity',v_line->'product'->'bulk_quantity'
      ));
    end loop;
  end if;

  select coalesce(sum(total_amount),0),coalesce(sum(refund_cash_amount),0),coalesce(sum(refund_card_amount),0),coalesce(sum(refund_loyalty_amount),0)
    into v_prev_total,v_prev_cash,v_prev_card,v_prev_loyalty
  from public.returns where sale_id=v_sale.id and status='approved';

  v_base_paid:=greatest(0,round(v_sale.total-coalesce(v_sale.loyalty_voucher_amount,0),2));
  v_amount_charged:=case
    when coalesce(v_sale.amount_charged,0)>0 then round(v_sale.amount_charged,2)
    else v_base_paid
  end;

  return jsonb_build_object(
    'sale_id',v_sale.id,
    'invoice_number',v_sale.invoice_number,
    'date',v_sale.date,
    'branch_id',v_sale.branch_id,
    'payment_method',v_sale.payment_method,
    'payment_method_id',v_sale.payment_method_id,
    'payment_method_code',coalesce(v_sale.payment_method_code,v_method.code,v_sale.payment_method),
    'payment_method_name',coalesce(v_sale.payment_method_name,v_method.name,case when v_sale.payment_method='cash' then 'نقدي' when v_sale.payment_method='card' then 'بطاقة بنكية' else 'مختلط' end),
    'payment_method_type',coalesce(v_method.method_type,case when v_sale.payment_method='cash' then 'cash' when v_sale.payment_method='card' then 'card' else 'other' end),
    'payment_reference',v_sale.payment_reference,
    'sale_total',v_sale.total,
    'loyalty_voucher_amount',coalesce(v_sale.loyalty_voucher_amount,0),
    'amount_paid',v_base_paid,
    'amount_charged',v_amount_charged,
    'payment_fee_amount',coalesce(v_sale.payment_fee_amount,0),
    'customer_payment_fee_amount',coalesce(v_sale.customer_payment_fee_amount,0),
    'merchant_payment_fee_amount',coalesce(v_sale.merchant_payment_fee_amount,0),
    'payment_fee_bearer',v_sale.payment_fee_bearer,
    'payment_fee_refundable',false,
    'cash_amount',case when v_sale.payment_method='cash' then v_base_paid else 0 end,
    'card_amount',case when v_sale.payment_method='cash' then 0 else v_base_paid end,
    'returned_total',round(v_prev_total,2),
    'returned_loyalty',round(v_prev_loyalty,2),
    'returned_cash',round(v_prev_cash,2),
    'returned_card',round(v_prev_card,2),
    'returned_customer_money',round(v_prev_cash+v_prev_card,2),
    'remaining_total',greatest(0,round(v_sale.total-v_prev_total,2)),
    'remaining_customer_paid',greatest(0,round(v_base_paid-v_prev_cash-v_prev_card,2)),
    'customer_name',v_sale.customer_name,
    'lines',v_lines
  );
end;
$function$;

create or replace function public.list_branch_pending_pos_card_refunds(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_rows jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not (public.staff_has_permission('sales.refund',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then
    raise exception using errcode='42501',message='REFUND_PERMISSION_DENIED';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'return_id',c.return_id,'sale_id',c.sale_id,'invoice_number',s.invoice_number,
    'amount',c.amount,'status',c.status,'created_at',c.created_at,
    'employee_name',u.name,'device_name',d.name,
    'payment_method_id',s.payment_method_id,
    'payment_method_code',coalesce(s.payment_method_code,m.code,s.payment_method),
    'payment_method_name',coalesce(s.payment_method_name,m.name,case when s.payment_method='card' then 'بطاقة بنكية' else 'وسيلة دفع إلكترونية' end),
    'payment_method_type',coalesce(m.method_type,case when s.payment_method='card' then 'card' else 'other' end),
    'payment_reference',s.payment_reference
  ) order by c.created_at),'[]'::jsonb)
  into v_rows
  from public.pos_card_refunds c
  join public.sales s on s.id=c.sale_id
  left join public.pos_payment_methods m on m.id=s.payment_method_id
  left join public.users u on u.id=c.created_by
  left join public.pos_devices d on d.id=c.device_id
  where c.branch_id=p_branch_id and c.status='pending';
  return v_rows;
end;
$function$;

create or replace function public.list_pos_sale_pending_card_refunds(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_sale public.sales%rowtype; v_method public.pos_payment_methods%rowtype; v_rows jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_sale from public.sales where id=p_sale_id;
  if v_sale.id is null or v_sale.branch_id is null then raise exception using errcode='22023',message='POS_SALE_NOT_FOUND'; end if;
  if not public.staff_has_permission('sales.refund',v_sale.branch_id) and not public.staff_has_permission('finance.manage',v_sale.branch_id) then
    raise exception using errcode='42501',message='REFUND_PERMISSION_DENIED';
  end if;
  if v_sale.payment_method_id is not null then select * into v_method from public.pos_payment_methods where id=v_sale.payment_method_id; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'return_id',c.return_id,'sale_id',c.sale_id,'amount',c.amount,'status',c.status,
    'created_at',c.created_at,'provider_reference',c.provider_reference,
    'payment_method_id',v_sale.payment_method_id,
    'payment_method_code',coalesce(v_sale.payment_method_code,v_method.code,v_sale.payment_method),
    'payment_method_name',coalesce(v_sale.payment_method_name,v_method.name,case when v_sale.payment_method='card' then 'بطاقة بنكية' else 'وسيلة دفع إلكترونية' end),
    'payment_method_type',coalesce(v_method.method_type,case when v_sale.payment_method='card' then 'card' else 'other' end),
    'payment_reference',v_sale.payment_reference
  ) order by c.created_at),'[]'::jsonb)
  into v_rows from public.pos_card_refunds c where c.sale_id=p_sale_id and c.status='pending';
  return v_rows;
end;
$function$;

create or replace function public.confirm_pos_card_refund(p_refund_id uuid, p_provider_reference text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_refund public.pos_card_refunds%rowtype;
  v_return public.returns%rowtype;
  v_sale public.sales%rowtype;
  v_method public.pos_payment_methods%rowtype;
  v_reference text;
  v_ledger_recorded boolean := false;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_refund from public.pos_card_refunds where id=p_refund_id for update;
  if v_refund.id is null then raise exception using errcode='22023',message='REFUND_NOT_FOUND'; end if;
  if not public.staff_has_permission('sales.refund',v_refund.branch_id) and not public.staff_has_permission('finance.manage',v_refund.branch_id) then
    raise exception using errcode='42501',message='REFUND_PERMISSION_DENIED';
  end if;

  select * into v_sale from public.sales where id=v_refund.sale_id;
  if v_sale.payment_method_id is not null then
    select * into v_method from public.pos_payment_methods where id=v_sale.payment_method_id;
  end if;

  if v_refund.status='confirmed' then
    select exists(
      select 1 from public.payment_ledger l where l.return_id=v_refund.return_id and l.entry_type='pos_sale_refund'
    ) into v_ledger_recorded;
    return to_jsonb(v_refund)||jsonb_build_object(
      'payment_method_id',v_sale.payment_method_id,
      'payment_method_code',coalesce(v_sale.payment_method_code,v_method.code,v_sale.payment_method),
      'payment_method_name',coalesce(v_sale.payment_method_name,v_method.name,'وسيلة الدفع'),
      'payment_method_type',coalesce(v_method.method_type,'card'),
      'payment_ledger_recorded',v_ledger_recorded
    );
  end if;
  if v_refund.status<>'pending' then raise exception using errcode='22023',message='REFUND_NOT_PENDING'; end if;

  v_reference:=trim(coalesce(p_provider_reference,''));
  if length(v_reference)<3 then raise exception using errcode='22023',message='PROVIDER_REFERENCE_REQUIRED'; end if;

  update public.pos_card_refunds
    set status='confirmed',provider_reference=v_reference,confirmed_by=auth.uid(),confirmed_at=now()
  where id=v_refund.id returning * into v_refund;

  update public.returns set refund_status='completed',updated_at=now()
  where id=v_refund.return_id returning * into v_return;

  if v_method.id is not null and v_method.method_type<>'cash' and v_method.settlement_account_id is not null and v_refund.amount>0 then
    insert into public.payment_ledger(
      account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by,return_id,sale_id
    )
    select
      v_method.settlement_account_id,v_refund.branch_id,'pos_sale_refund',-v_refund.amount,v_method.code,v_reference,
      'رد POS - فاتورة '||v_sale.invoice_number,
      jsonb_build_object(
        'sale_id',v_sale.id,'return_id',v_return.id,'refund_id',v_refund.id,
        'payment_method_id',v_method.id,'payment_method',v_method.name,
        'original_payment_reference',v_sale.payment_reference
      ),auth.uid(),v_return.id,v_sale.id
    where not exists(
      select 1 from public.payment_ledger l where l.return_id=v_return.id and l.entry_type='pos_sale_refund'
    );
  end if;

  select exists(
    select 1 from public.payment_ledger l where l.return_id=v_return.id and l.entry_type='pos_sale_refund'
  ) into v_ledger_recorded;

  return to_jsonb(v_refund)||jsonb_build_object(
    'return',to_jsonb(v_return),
    'payment_method_id',v_sale.payment_method_id,
    'payment_method_code',coalesce(v_sale.payment_method_code,v_method.code,v_sale.payment_method),
    'payment_method_name',coalesce(v_sale.payment_method_name,v_method.name,'وسيلة الدفع'),
    'payment_method_type',coalesce(v_method.method_type,'card'),
    'payment_ledger_recorded',v_ledger_recorded
  );
end;
$function$;