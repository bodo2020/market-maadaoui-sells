create or replace function public.get_pos_sale_return_preview_v7(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_base jsonb;
  v_sale public.sales%rowtype;
  v_paid_base numeric(14,2):=0;
  v_returned_customer_credit numeric(14,2):=0;
  v_returned_employee_credit numeric(14,2):=0;
  v_returned_paid numeric(14,2):=0;
begin
  v_base:=public.get_pos_sale_return_preview_v6(p_sale_id);
  select * into v_sale from public.sales where id=p_sale_id;
  if v_sale.id is null then raise exception using errcode='22023',message='POS_SALE_NOT_FOUND'; end if;

  v_paid_base:=greatest(round(coalesce(v_sale.total,0)-coalesce(v_sale.loyalty_voucher_amount,0)-coalesce(v_sale.customer_credit_amount,0)-coalesce(v_sale.employee_credit_amount,0),2),0);
  select coalesce(sum(customer_credit_refund_amount),0),coalesce(sum(employee_credit_refund_amount),0),coalesce(sum(refund_cash_amount+refund_card_amount),0)
    into v_returned_customer_credit,v_returned_employee_credit,v_returned_paid
  from public.returns where sale_id=v_sale.id and status='approved';

  return v_base||jsonb_build_object(
    'return_version',7,
    'paid_base_amount',v_paid_base,
    'amount_paid',v_paid_base,
    'customer_credit_amount',coalesce(v_sale.customer_credit_amount,0),
    'employee_credit_amount',coalesce(v_sale.employee_credit_amount,0),
    'returned_customer_credit',round(v_returned_customer_credit,2),
    'returned_employee_credit',round(v_returned_employee_credit,2),
    'remaining_customer_credit',greatest(round(coalesce(v_sale.customer_credit_amount,0)-v_returned_customer_credit,2),0),
    'remaining_employee_credit',greatest(round(coalesce(v_sale.employee_credit_amount,0)-v_returned_employee_credit,2),0),
    'returned_customer_money',round(v_returned_paid,2),
    'remaining_customer_paid',greatest(round(v_paid_base-v_returned_paid,2),0),
    'partial_credit_sale',((coalesce(v_sale.customer_credit_amount,0)+coalesce(v_sale.employee_credit_amount,0))>0 and v_paid_base>0),
    'credit_return_policy','credit_first_then_paid_methods'
  );
end;
$function$;

create or replace function public.create_pos_sale_return_v7(
  p_request_id uuid,
  p_sale_id uuid,
  p_device_id uuid,
  p_device_token text,
  p_items jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_existing public.returns%rowtype;
  v_sale public.sales%rowtype;
  v_device public.pos_devices%rowtype;
  v_shift public.pos_shifts%rowtype;
  v_inventory_branch uuid;
  v_selection jsonb:='[]'::jsonb;
  v_in jsonb;
  v_line jsonb;
  v_idx integer;
  v_product uuid;
  v_product_name text;
  v_qty numeric;
  v_sold numeric;
  v_prev_qty numeric;
  v_available numeric;
  v_line_total numeric;
  v_prev_line_amount numeric;
  v_remaining_line_amount numeric;
  v_refund_line numeric;
  v_unit_refund numeric;
  v_purchase numeric;
  v_total numeric(14,2):=0;
  v_prev_total numeric(14,2):=0;
  v_prev_cash numeric(14,2):=0;
  v_prev_card numeric(14,2):=0;
  v_prev_loyalty numeric(14,2):=0;
  v_prev_customer_credit numeric(14,2):=0;
  v_prev_employee_credit numeric(14,2):=0;
  v_orig_loyalty numeric(14,2):=0;
  v_orig_customer_credit numeric(14,2):=0;
  v_orig_employee_credit numeric(14,2):=0;
  v_orig_credit numeric(14,2):=0;
  v_orig_paid numeric(14,2):=0;
  v_orig_cash numeric(14,2):=0;
  v_orig_card numeric(14,2):=0;
  v_target_total numeric(14,2):=0;
  v_target_loyalty numeric(14,2):=0;
  v_loyalty_refund numeric(14,2):=0;
  v_target_nonloyalty numeric(14,2):=0;
  v_target_credit numeric(14,2):=0;
  v_prev_credit numeric(14,2):=0;
  v_credit_refund numeric(14,2):=0;
  v_target_money numeric(14,2):=0;
  v_target_cash numeric(14,2):=0;
  v_target_card numeric(14,2):=0;
  v_cash_refund numeric(14,2):=0;
  v_card_refund numeric(14,2):=0;
  v_drawer_balance numeric(14,2):=0;
  v_return public.returns%rowtype;
  v_has_usage boolean:=false;
  v_restored numeric(14,2):=0;
  v_cash_part private.pos_sale_payment_parts_v3%rowtype;
  v_part private.pos_sale_payment_parts_v3%rowtype;
  v_orig_noncash numeric(14,2):=0;
  v_prev_noncash numeric(14,2):=0;
  v_target_noncash numeric(14,2):=0;
  v_cum_orig numeric(14,2):=0;
  v_prev_cum numeric(14,2):=0;
  v_target_cum numeric(14,2):=0;
  v_prev_cum_before numeric(14,2):=0;
  v_target_cum_before numeric(14,2):=0;
  v_part_refund numeric(14,2):=0;
  v_allocated numeric(14,2):=0;
  v_breakdown jsonb:='[]'::jsonb;
  v_account private.customer_receivable_accounts_v1%rowtype;
  v_employee_account private.hr_employee_wallet_accounts%rowtype;
  v_balance_after numeric(14,2):=0;
  v_credit_key text;
  v_customer_user_id uuid;
  v_points_target bigint:=0;
  v_points_prev bigint:=0;
  v_points_delta bigint:=0;
  v_employee_points_target bigint:=0;
  v_employee_points_prev bigint:=0;
  v_employee_points_delta bigint:=0;
  v_result jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_request_id is null or p_sale_id is null or p_device_id is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode='22023',message='INVALID_POS_RETURN';
  end if;

  select * into v_sale from public.sales where id=p_sale_id for update;
  if v_sale.id is null or v_sale.request_fingerprint is null or v_sale.branch_id is null then
    raise exception using errcode='22023',message='POS_SALE_NOT_FOUND';
  end if;

  v_orig_customer_credit:=round(coalesce(v_sale.customer_credit_amount,0),2);
  v_orig_employee_credit:=round(coalesce(v_sale.employee_credit_amount,0),2);
  v_orig_credit:=round(v_orig_customer_credit+v_orig_employee_credit,2);
  v_orig_paid:=greatest(round(coalesce(v_sale.total,0)-coalesce(v_sale.loyalty_voucher_amount,0)-v_orig_credit,2),0);

  if v_orig_credit<=0 or v_orig_paid<=0 then
    return public.create_pos_sale_return_v5(p_request_id,p_sale_id,p_device_id,p_device_token,p_items,p_reason)
      ||jsonb_build_object('return_version',7,'credit_return_policy','credit_first_then_paid_methods');
  end if;

  if v_orig_customer_credit>0 and v_orig_employee_credit>0 then
    raise exception using errcode='55000',message='BUYER_IDENTITY_CONFLICT';
  end if;
  if not public.staff_has_permission('sales.refund',v_sale.branch_id) then
    raise exception using errcode='42501',message='REFUND_PERMISSION_DENIED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pos-return:'||p_request_id::text,73));
  select * into v_existing from public.returns where pos_request_id=p_request_id;
  if v_existing.id is not null then
    if v_existing.sale_id<>p_sale_id or v_existing.created_by<>v_uid then
      raise exception using errcode='42501',message='RETURN_REQUEST_CONFLICT';
    end if;
    v_breakdown:=coalesce(private.pos_return_payment_breakdown_v3(v_existing.id),'[]'::jsonb);
    if coalesce(v_existing.customer_credit_refund_amount,0)>0 then
      v_breakdown:=jsonb_build_array(jsonb_build_object('code','customer_credit','name','آجل عميل','method_type','customer_credit','base_refund_amount',v_existing.customer_credit_refund_amount,'status','completed'))||v_breakdown;
    elsif coalesce(v_existing.employee_credit_refund_amount,0)>0 then
      v_breakdown:=jsonb_build_array(jsonb_build_object('code','employee_credit','name','آجل موظف','method_type','employee_credit','base_refund_amount',v_existing.employee_credit_refund_amount,'status','completed'))||v_breakdown;
    end if;
    return to_jsonb(v_existing)||jsonb_build_object(
      'return_version',7,'refund_breakdown',v_breakdown,
      'payment_refunds_pending',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_breakdown) x where x->>'status'='pending'),'[]'::jsonb),
      'card_refund_id',null,'card_refund_pending',exists(select 1 from private.pos_return_payment_parts_v3 where return_id=v_existing.id and status='pending'),
      'refund_customer_money',round(coalesce(v_existing.refund_cash_amount,0)+coalesce(v_existing.refund_card_amount,0),2),
      'idempotent',true,'credit_return_policy','credit_first_then_paid_methods'
    );
  end if;

  v_device:=private.pos_device_for_user(p_device_id,p_device_token,v_uid);
  if v_device.id is null or v_device.branch_id<>v_sale.branch_id then raise exception using errcode='42501',message='DEVICE_UNAVAILABLE'; end if;
  select * into v_shift from public.pos_shifts
  where user_id=v_uid and branch_id=v_sale.branch_id and device_id=v_device.id and status='open'
  order by opened_at desc limit 1 for update;
  if v_shift.id is null or v_shift.drawer_account_id is null then raise exception using errcode='55000',message='POS_SHIFT_REQUIRED'; end if;

  select s.inventory_branch_id into v_inventory_branch from private.resolve_branch_sources(v_sale.branch_id) s;
  if v_inventory_branch is null then raise exception using errcode='22023',message='RETURN_BRANCH_REQUIRED'; end if;

  for v_in in select value from jsonb_array_elements(p_items) loop
    v_idx:=coalesce((v_in->>'line_index')::integer,-1);
    v_qty:=coalesce((v_in->>'quantity')::numeric,0);
    if v_idx<0 or v_idx>=jsonb_array_length(v_sale.items) or v_qty<=0 or round(v_qty,3)<>v_qty then
      raise exception using errcode='22023',message='INVALID_RETURN_ITEM';
    end if;
    if exists(select 1 from jsonb_array_elements(v_selection) z where (z->>'line_index')::integer=v_idx) then
      raise exception using errcode='22023',message='DUPLICATE_RETURN_LINE';
    end if;

    v_line:=v_sale.items->v_idx;
    v_product:=(v_line->'product'->>'id')::uuid;
    v_product_name:=coalesce(v_line->'product'->>'name','منتج');
    v_sold:=coalesce(nullif(v_line->>'weight','')::numeric,nullif(v_line->>'quantity','')::numeric,0);
    if v_product is null or v_sold<=0 then raise exception using errcode='22023',message='INVALID_RETURN_ITEM'; end if;

    select coalesce(sum(ri.quantity),0),coalesce(sum(ri.total),0)
      into v_prev_qty,v_prev_line_amount
    from public.return_items ri join public.returns r on r.id=ri.return_id
    where r.sale_id=v_sale.id and ri.sale_line_index=v_idx and r.status='approved';
    v_available:=round(v_sold-v_prev_qty,3);
    if v_qty>v_available+0.0004 then
      raise exception using errcode='22023',message='RETURN_QUANTITY_EXCEEDED|'||v_product_name||'|'||to_char(v_available,'FM999999990.000');
    end if;

    v_line_total:=round(coalesce((v_line->>'total')::numeric,0),2);
    v_remaining_line_amount:=greatest(0,round(v_line_total-v_prev_line_amount,2));
    if abs(v_qty-v_available)<0.0005 then
      v_refund_line:=v_remaining_line_amount;
    else
      v_refund_line:=least(v_remaining_line_amount,round((v_line_total/nullif(v_sold,0))*v_qty,2));
    end if;
    if v_refund_line<=0 then raise exception using errcode='22023',message='RETURN_AMOUNT_INVALID'; end if;
    v_unit_refund:=round(v_refund_line/v_qty,4);
    v_purchase:=coalesce((v_line->'product'->>'purchase_price')::numeric,0);
    v_total:=round(v_total+v_refund_line,2);
    v_selection:=v_selection||jsonb_build_array(jsonb_build_object(
      'line_index',v_idx,'product_id',v_product,'product_name',v_product_name,'quantity',v_qty,'sold_quantity',v_sold,
      'price',v_unit_refund,'total',v_refund_line,'line_original_total',v_line_total,'purchase_price',v_purchase,
      'reason',nullif(trim(coalesce(v_in->>'reason','')),'')
    ));
  end loop;

  if v_total<=0 then raise exception using errcode='22023',message='RETURN_AMOUNT_INVALID'; end if;

  select coalesce(sum(total_amount),0),coalesce(sum(refund_cash_amount),0),coalesce(sum(refund_card_amount),0),coalesce(sum(refund_loyalty_amount),0),
         coalesce(sum(customer_credit_refund_amount),0),coalesce(sum(employee_credit_refund_amount),0)
    into v_prev_total,v_prev_cash,v_prev_card,v_prev_loyalty,v_prev_customer_credit,v_prev_employee_credit
  from public.returns where sale_id=v_sale.id and status='approved';
  if v_prev_total+v_total>v_sale.total+0.009 then raise exception using errcode='22023',message='RETURN_AMOUNT_EXCEEDED'; end if;

  v_orig_loyalty:=greatest(0,least(v_sale.total,coalesce(v_sale.loyalty_voucher_amount,0)));
  select exists(select 1 from public.loyalty_voucher_usages u where u.source_type='pos_sale' and u.source_id=v_sale.id and u.voucher_id=v_sale.loyalty_voucher_id)
    into v_has_usage;
  if not v_has_usage then v_orig_loyalty:=0; end if;

  v_target_total:=round(v_prev_total+v_total,2);
  if v_orig_loyalty>0 and v_sale.total>0 then
    v_target_loyalty:=case when v_target_total>=v_sale.total-0.009 then v_orig_loyalty else least(v_orig_loyalty,round(v_target_total*v_orig_loyalty/v_sale.total,2)) end;
  end if;
  v_loyalty_refund:=greatest(0,round(v_target_loyalty-v_prev_loyalty,2));

  v_target_nonloyalty:=greatest(0,round(v_target_total-v_target_loyalty,2));
  v_prev_credit:=case when v_orig_customer_credit>0 then v_prev_customer_credit else v_prev_employee_credit end;
  v_target_credit:=least(v_orig_credit,v_target_nonloyalty);
  v_credit_refund:=greatest(0,round(v_target_credit-v_prev_credit,2));
  v_target_money:=greatest(0,round(v_target_nonloyalty-v_target_credit,2));

  select coalesce(sum(base_amount) filter(where method_type_snapshot='cash'),0),
         coalesce(sum(base_amount) filter(where method_type_snapshot<>'cash'),0)
    into v_orig_cash,v_orig_card
  from private.pos_sale_payment_parts_v3
  where sale_id=v_sale.id and method_code_snapshot not in ('customer_credit','employee_credit');
  if abs(round(v_orig_cash+v_orig_card,2)-v_orig_paid)>0.02 then
    raise exception using errcode='55000',message='PAID_PAYMENT_BREAKDOWN_MISMATCH';
  end if;
  if v_target_money>v_orig_paid+0.009 then raise exception using errcode='22023',message='REFUND_ALLOCATION_INVALID'; end if;

  v_target_cash:=case when v_orig_paid<=0 then 0 when v_target_money>=v_orig_paid-0.009 then v_orig_cash else round(v_target_money*v_orig_cash/v_orig_paid,2) end;
  v_target_card:=greatest(0,round(v_target_money-v_target_cash,2));
  v_cash_refund:=greatest(0,round(v_target_cash-v_prev_cash,2));
  v_card_refund:=greatest(0,round(v_target_card-v_prev_card,2));

  if abs(round(v_loyalty_refund+v_credit_refund+v_cash_refund+v_card_refund,2)-v_total)>0.02 then
    raise exception using errcode='22023',message='REFUND_ALLOCATION_INVALID';
  end if;

  if v_cash_refund>0 then
    perform pg_advisory_xact_lock(hashtextextended('cash-account:'||v_shift.drawer_account_id::text,61));
    v_drawer_balance:=private.cash_account_balance(v_shift.drawer_account_id);
    if v_cash_refund>v_drawer_balance+0.009 then
      raise exception using errcode='22023',message='INSUFFICIENT_DRAWER_CASH|'||to_char(v_drawer_balance,'FM9999999990.00');
    end if;
  end if;

  if v_credit_refund>0 and v_orig_customer_credit>0 then
    select * into v_account from private.customer_receivable_accounts_v1
    where branch_id=v_sale.branch_id and customer_id=v_sale.customer_id for update;
    if v_account.customer_id is null then raise exception using errcode='55000',message='CUSTOMER_CREDIT_ACCOUNT_NOT_FOUND'; end if;
    if v_account.balance+0.009<v_credit_refund then raise exception using errcode='23514',message='CUSTOMER_CREDIT_ALREADY_SETTLED'; end if;
  elsif v_credit_refund>0 and v_orig_employee_credit>0 then
    select * into v_employee_account from private.hr_employee_wallet_accounts where employee_id=v_sale.employee_id for update;
    if v_employee_account.employee_id is null then raise exception using errcode='55000',message='EMPLOYEE_WALLET_NOT_FOUND'; end if;
    if v_employee_account.receivable_balance+0.009<v_credit_refund then raise exception using errcode='23514',message='EMPLOYEE_CREDIT_ALREADY_SETTLED'; end if;
  end if;

  insert into public.returns(
    sale_id,branch_id,shift_id,device_id,pos_request_id,customer_id,customer_name,total_amount,reason,status,
    refund_method,refund_status,refund_account_id,refund_cash_amount,refund_card_amount,loyalty_voucher_id,refund_loyalty_amount,
    employee_credit_refund_amount,customer_credit_refund_amount,approved_by,approved_at,inventory_restored_at,created_by,source,created_at,updated_at
  ) values(
    v_sale.id,v_sale.branch_id,v_shift.id,v_device.id,p_request_id,v_sale.customer_id,v_sale.customer_name,v_total,nullif(trim(coalesce(p_reason,'')),''),'approved',
    case when v_cash_refund>0 and v_card_refund>0 then 'mixed' when v_card_refund>0 then 'card' when v_cash_refund>0 then 'cash' else 'none' end,
    case when v_card_refund>0 then 'pending_provider' else 'completed' end,
    case when v_cash_refund>0 then v_shift.drawer_account_id else null end,
    v_cash_refund,v_card_refund,v_sale.loyalty_voucher_id,v_loyalty_refund,
    case when v_orig_employee_credit>0 then v_credit_refund else 0 end,
    case when v_orig_customer_credit>0 then v_credit_refund else 0 end,
    v_uid,now(),now(),v_uid,'pos',now(),now()
  ) returning * into v_return;

  if v_loyalty_refund>0 then
    v_restored:=private.restore_loyalty_voucher_for_return('pos_sale',v_sale.id,v_return.id,v_loyalty_refund,v_sale.branch_id,'pos_return');
    if abs(v_restored-v_loyalty_refund)>0.009 then raise exception using errcode='40001',message='LOYALTY_RETURN_ALLOCATION_CHANGED'; end if;
  end if;

  perform 1 from public.products p where p.id in(select (z->>'product_id')::uuid from jsonb_array_elements(v_selection) z) order by p.id for update;
  for v_in in select value from jsonb_array_elements(v_selection) order by (value->>'product_id'),(value->>'line_index')::integer loop
    insert into public.return_items(return_id,product_id,quantity,price,total,reason,purchase_price,profit_loss,sale_line_index,sold_quantity,line_original_total)
    values(v_return.id,(v_in->>'product_id')::uuid,(v_in->>'quantity')::numeric,(v_in->>'price')::numeric,(v_in->>'total')::numeric,
      coalesce(v_in->>'reason',nullif(trim(coalesce(p_reason,'')),'')),(v_in->>'purchase_price')::numeric,
      round(((v_in->>'price')::numeric-(v_in->>'purchase_price')::numeric)*(v_in->>'quantity')::numeric,2),
      (v_in->>'line_index')::integer,(v_in->>'sold_quantity')::numeric,(v_in->>'line_original_total')::numeric);
    insert into public.inventory(product_id,branch_id,quantity,updated_at)
    values((v_in->>'product_id')::uuid,v_inventory_branch,(v_in->>'quantity')::numeric,now())
    on conflict(product_id,branch_id) do update set quantity=public.inventory.quantity+excluded.quantity,updated_at=now();
  end loop;

  if v_cash_refund>0 then
    insert into public.cash_ledger(account_id,branch_id,shift_id,device_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by)
    values(v_shift.drawer_account_id,v_sale.branch_id,v_shift.id,v_device.id,v_uid,'refund_cash',-v_cash_refund,'return',v_return.id,
      'رد نقدي لفاتورة '||v_sale.invoice_number,
      jsonb_build_object('sale_id',v_sale.id,'invoice_number',v_sale.invoice_number,'refund_total',v_total,'credit_refund',v_credit_refund,'loyalty_restored',v_loyalty_refund,'card_refund',v_card_refund),v_uid);

    select * into v_cash_part from private.pos_sale_payment_parts_v3
    where sale_id=v_sale.id and method_type_snapshot='cash' and method_code_snapshot not in ('customer_credit','employee_credit')
    order by part_order limit 1;
    if v_cash_part.id is null then raise exception using errcode='22023',message='REFUND_ALLOCATION_INVALID'; end if;
    insert into private.pos_return_payment_parts_v3(
      return_id,sale_id,sale_payment_part_id,branch_id,shift_id,device_id,payment_method_id,part_order,
      method_code_snapshot,method_name_snapshot,method_type_snapshot,settlement_account_id_snapshot,
      original_payment_reference,base_refund_amount,status,created_by,confirmed_by,confirmed_at
    ) values(v_return.id,v_sale.id,v_cash_part.id,v_sale.branch_id,v_shift.id,v_device.id,v_cash_part.payment_method_id,v_cash_part.part_order,
      v_cash_part.method_code_snapshot,v_cash_part.method_name_snapshot,v_cash_part.method_type_snapshot,v_cash_part.settlement_account_id_snapshot,
      v_cash_part.reference,v_cash_refund,'completed',v_uid,v_uid,now());
  end if;

  if v_card_refund>0 then
    v_orig_noncash:=v_orig_card;
    v_prev_noncash:=v_prev_card;
    v_target_noncash:=round(v_prev_card+v_card_refund,2);
    for v_part in
      select * from private.pos_sale_payment_parts_v3
      where sale_id=v_sale.id and method_type_snapshot<>'cash' and method_code_snapshot not in ('customer_credit','employee_credit')
      order by part_order
    loop
      v_cum_orig:=round(v_cum_orig+v_part.base_amount,2);
      if v_cum_orig>=v_orig_noncash-0.009 then
        v_prev_cum:=v_prev_noncash; v_target_cum:=v_target_noncash;
      else
        v_prev_cum:=round(v_prev_noncash*v_cum_orig/v_orig_noncash,2);
        v_target_cum:=round(v_target_noncash*v_cum_orig/v_orig_noncash,2);
      end if;
      v_part_refund:=round((v_target_cum-v_target_cum_before)-(v_prev_cum-v_prev_cum_before),2);
      v_prev_cum_before:=v_prev_cum;
      v_target_cum_before:=v_target_cum;
      if v_part_refund>0 then
        insert into private.pos_return_payment_parts_v3(
          return_id,sale_id,sale_payment_part_id,branch_id,shift_id,device_id,payment_method_id,part_order,
          method_code_snapshot,method_name_snapshot,method_type_snapshot,settlement_account_id_snapshot,
          original_payment_reference,base_refund_amount,status,created_by
        ) values(v_return.id,v_sale.id,v_part.id,v_sale.branch_id,v_shift.id,v_device.id,v_part.payment_method_id,v_part.part_order,
          v_part.method_code_snapshot,v_part.method_name_snapshot,v_part.method_type_snapshot,v_part.settlement_account_id_snapshot,
          v_part.reference,v_part_refund,'pending',v_uid);
        v_allocated:=round(v_allocated+v_part_refund,2);
      end if;
    end loop;
    if abs(v_allocated-v_card_refund)>0.009 then raise exception using errcode='22023',message='REFUND_ALLOCATION_INVALID'; end if;
  end if;

  if v_credit_refund>0 and v_orig_customer_credit>0 then
    v_balance_after:=greatest(0,round(v_account.balance-v_credit_refund,2));
    update private.customer_receivable_accounts_v1 set balance=v_balance_after,updated_at=now()
      where branch_id=v_sale.branch_id and customer_id=v_sale.customer_id;
    v_credit_key:='customer-credit-return:'||v_return.id::text;
    insert into private.customer_receivable_ledger_v1(branch_id,customer_id,entry_type,signed_amount,description,reference_kind,reference_id,idempotency_key,metadata,created_by)
    values(v_sale.branch_id,v_sale.customer_id,'adjustment_decrease',-v_credit_refund,'مرتجع من فاتورة آجل '||v_sale.invoice_number,'return',v_return.id,v_credit_key,
      jsonb_build_object('sale_id',v_sale.id,'invoice_number',v_sale.invoice_number,'return_policy','credit_first_then_paid_methods'),v_uid)
    on conflict(idempotency_key) do nothing;
    select user_id into v_customer_user_id from public.customers where id=v_sale.customer_id;
    if v_customer_user_id is not null then
      insert into private.notification_events_v2(audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,
        action_url,action_label,requires_action,dedupe_key,eligible_channels,metadata)
      values('customer',v_customer_user_id,v_sale.branch_id,'customer.credit_return','customers','normal','تم تخفيض مديونيتك بعد مرتجع',
        'تم خصم '||to_char(v_credit_refund,'FM999999990.00')||' ج.م من المديونية نتيجة مرتجع من فاتورة '||v_sale.invoice_number||'. الرصيد الحالي '||to_char(v_balance_after,'FM999999990.00')||' ج.م.',
        'pos_return',v_return.id,'/account/debts','عرض المديونية',false,'customer-credit-return:'||v_return.id::text,array['in_app','push'],
        jsonb_build_object('delivery_type','transactional','sale_id',v_sale.id,'return_id',v_return.id,'amount',v_credit_refund,'balance_after',v_balance_after))
      on conflict(recipient_user_id,dedupe_key) do nothing;
    end if;
  elsif v_credit_refund>0 and v_orig_employee_credit>0 then
    v_balance_after:=greatest(0,round(v_employee_account.receivable_balance-v_credit_refund,2));
    update private.hr_employee_wallet_accounts set receivable_balance=v_balance_after,updated_at=now() where employee_id=v_sale.employee_id;
    v_credit_key:='employee-credit-return:'||v_return.id::text;
    insert into private.hr_employee_wallet_ledger(employee_id,branch_id,entry_type,benefit_delta,receivable_delta,points_delta,amount,
      reference_kind,reference_id,idempotency_key,description,metadata,actor_user_id)
    values(v_sale.employee_id,v_sale.branch_id,'refund',0,-v_credit_refund,0,v_credit_refund,'return',v_return.id,v_credit_key,
      'مرتجع من فاتورة آجل '||v_sale.invoice_number,jsonb_build_object('sale_id',v_sale.id,'invoice_number',v_sale.invoice_number,'return_policy','credit_first_then_paid_methods'),v_uid)
    on conflict(idempotency_key) do nothing;
    insert into private.notification_events_v2(audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,
      action_url,action_label,requires_action,dedupe_key,eligible_channels,metadata)
    values('staff',v_sale.employee_id,v_sale.branch_id,'employee.credit_return','finance','normal','تم تخفيض رصيد الآجل',
      'تم خصم '||to_char(v_credit_refund,'FM999999990.00')||' ج.م من الرصيد المستحق نتيجة مرتجع من فاتورة '||v_sale.invoice_number||'. الرصيد الحالي '||to_char(v_balance_after,'FM999999990.00')||' ج.م.',
      'pos_return',v_return.id,'/my-hr','عرض حسابي',false,'employee-credit-return-v7:'||v_return.id::text,array['in_app','push'],
      jsonb_build_object('delivery_type','transactional','sale_id',v_sale.id,'return_id',v_return.id,'amount',v_credit_refund,'balance_after',v_balance_after))
    on conflict(recipient_user_id,dedupe_key) do nothing;
  end if;

  if v_sale.customer_id is not null and coalesce(v_sale.loyalty_points_earned,0)>0 and v_orig_paid>0 then
    v_points_target:=case when v_target_money>=v_orig_paid-0.009 then v_sale.loyalty_points_earned
      else floor(v_sale.loyalty_points_earned*v_target_money/v_orig_paid)::bigint end;
    select coalesce(-sum(points_delta),0)::bigint into v_points_prev
    from public.loyalty_ledger
    where customer_id=v_sale.customer_id and entry_type='reversal' and metadata->>'sale_id'=v_sale.id::text;
    v_points_delta:=greatest(v_points_target-v_points_prev,0);
    if v_points_delta>0 then
      perform private.post_loyalty_entry(v_sale.customer_id,'reversal',-v_points_delta,v_cash_refund+v_card_refund,'pos_return',v_return.id,v_sale.branch_id,v_sale.invoice_number,
        jsonb_build_object('sale_id',v_sale.id,'invoice_number',v_sale.invoice_number,'reason','paid_amount_return','credit_amount_never_earned_points',v_orig_customer_credit),v_uid);
    end if;
  end if;

  if v_sale.employee_id is not null and coalesce(v_sale.employee_points_earned,0)>0 and v_orig_paid>0 then
    v_employee_points_target:=case when v_target_money>=v_orig_paid-0.009 then v_sale.employee_points_earned
      else floor(v_sale.employee_points_earned*v_target_money/v_orig_paid)::bigint end;
    select coalesce(-sum(points_delta),0)::bigint into v_employee_points_prev
    from private.hr_employee_wallet_ledger
    where employee_id=v_sale.employee_id and entry_type='points_reversal' and metadata->>'sale_id'=v_sale.id::text;
    v_employee_points_delta:=greatest(v_employee_points_target-v_employee_points_prev,0);
    if v_employee_points_delta>0 then
      update private.hr_employee_wallet_accounts
      set points_balance=greatest(points_balance-v_employee_points_delta,0),lifetime_points_reversed=lifetime_points_reversed+v_employee_points_delta,updated_at=now()
      where employee_id=v_sale.employee_id;
      insert into private.hr_employee_wallet_ledger(employee_id,branch_id,entry_type,benefit_delta,receivable_delta,points_delta,amount,
        reference_kind,reference_id,idempotency_key,description,metadata,actor_user_id)
      values(v_sale.employee_id,v_sale.branch_id,'points_reversal',0,0,-v_employee_points_delta,v_cash_refund+v_card_refund,'return',v_return.id,
        'employee-points-return-v7:'||v_return.id::text,'عكس نقاط الجزء المدفوع المرتجع - فاتورة '||v_sale.invoice_number,
        jsonb_build_object('sale_id',v_sale.id,'invoice_number',v_sale.invoice_number,'credit_amount',v_orig_employee_credit),v_uid)
      on conflict(idempotency_key) do nothing;
    end if;
  end if;

  v_breakdown:=coalesce(private.pos_return_payment_breakdown_v3(v_return.id),'[]'::jsonb);
  if v_credit_refund>0 and v_orig_customer_credit>0 then
    v_breakdown:=jsonb_build_array(jsonb_build_object('code','customer_credit','name','آجل عميل','method_type','customer_credit','base_refund_amount',v_credit_refund,'status','completed'))||v_breakdown;
  elsif v_credit_refund>0 and v_orig_employee_credit>0 then
    v_breakdown:=jsonb_build_array(jsonb_build_object('code','employee_credit','name','آجل موظف','method_type','employee_credit','base_refund_amount',v_credit_refund,'status','completed'))||v_breakdown;
  end if;

  v_result:=to_jsonb(v_return)||jsonb_build_object(
    'return_version',7,'invoice_number',v_sale.invoice_number,'inventory_branch_id',v_inventory_branch,
    'customer_credit_refund_amount',case when v_orig_customer_credit>0 then v_credit_refund else 0 end,
    'employee_credit_refund_amount',case when v_orig_employee_credit>0 then v_credit_refund else 0 end,
    'customer_points_reversed',v_points_delta,'employee_points_reversed',v_employee_points_delta,
    'refund_customer_money',round(v_cash_refund+v_card_refund,2),'refund_loyalty_amount',v_loyalty_refund,
    'refund_breakdown',v_breakdown,
    'payment_refunds_pending',coalesce((select jsonb_agg(x) from jsonb_array_elements(v_breakdown) x where x->>'status'='pending'),'[]'::jsonb),
    'card_refund_id',null,'card_refund_pending',exists(select 1 from private.pos_return_payment_parts_v3 where return_id=v_return.id and status='pending'),
    'drawer_balance_after',private.cash_account_balance(v_shift.drawer_account_id),
    'idempotent',false,'credit_return_policy','credit_first_then_paid_methods'
  );
  return v_result;
end;
$function$;

revoke all on function public.get_pos_sale_return_preview_v7(uuid) from public,anon;
grant execute on function public.get_pos_sale_return_preview_v7(uuid) to authenticated;
revoke all on function public.create_pos_sale_return_v7(uuid,uuid,uuid,text,jsonb,text) from public,anon;
grant execute on function public.create_pos_sale_return_v7(uuid,uuid,uuid,text,jsonb,text) to authenticated;
comment on function public.create_pos_sale_return_v7(uuid,uuid,uuid,text,jsonb,text) is 'POS return V7: for partial-credit sales, restore voucher proportionally, reduce credit first, then refund actually-paid methods; customer credit never generated loyalty points.';