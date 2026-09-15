alter table public.returns add column if not exists customer_credit_refund_amount numeric(12,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='returns_customer_credit_refund_amount_check') then
    alter table public.returns add constraint returns_customer_credit_refund_amount_check check (customer_credit_refund_amount >= 0);
  end if;
end $$;

create or replace function public.get_pos_sale_return_preview_v5(p_sale_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_base jsonb; v_sale public.sales%rowtype; v_returned_credit numeric(12,2):=0;
begin
  v_base:=public.get_pos_sale_return_preview_v4(p_sale_id);
  select * into v_sale from public.sales where id=p_sale_id;
  if v_sale.id is null then raise exception using errcode='22023',message='POS_SALE_NOT_FOUND'; end if;
  select coalesce(sum(r.customer_credit_refund_amount),0) into v_returned_credit
  from public.returns r where r.sale_id=p_sale_id and r.status='approved';
  v_base:=v_base||jsonb_build_object('return_version',5,'customer_id',v_sale.customer_id,
    'customer_credit_amount',coalesce(v_sale.customer_credit_amount,0),'returned_customer_credit',round(v_returned_credit,2),
    'remaining_customer_credit',greatest(0,round(coalesce(v_sale.customer_credit_amount,0)-v_returned_credit,2)));
  if coalesce(v_sale.customer_credit_amount,0)>0 then
    v_base:=v_base||jsonb_build_object('payment_method_code','customer_credit','payment_method_name','آجل عميل',
      'payment_method_type','customer_credit','amount_paid',0,'amount_charged',0,'cash_amount',0,'card_amount',0,
      'returned_cash',0,'returned_card',0,'returned_customer_money',0,'remaining_customer_paid',0);
  end if;
  return v_base;
end;
$$;

create or replace function public.create_pos_sale_return_v5(
  p_request_id uuid,p_sale_id uuid,p_device_id uuid,p_device_token text,p_items jsonb,p_reason text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_result jsonb; v_return public.returns%rowtype; v_sale public.sales%rowtype;
  v_account private.customer_receivable_accounts_v1%rowtype; v_credit_refund numeric(12,2):=0; v_credit_key text;
begin
  v_result:=public.create_pos_sale_return_v4(p_request_id,p_sale_id,p_device_id,p_device_token,p_items,p_reason);
  select * into v_sale from public.sales where id=p_sale_id for update;
  select * into v_return from public.returns where id=nullif(v_result->>'id','')::uuid for update;
  if v_sale.id is null or v_return.id is null then raise exception using errcode='55000',message='RETURN_NOT_CONFIRMED'; end if;

  if coalesce(v_sale.customer_credit_amount,0)>0 then
    v_credit_refund:=round(v_return.total_amount,2);
    v_credit_key:='customer-credit-return:'||v_return.id::text;
    if not exists(select 1 from private.customer_receivable_ledger_v1 where idempotency_key=v_credit_key) then
      select * into v_account from private.customer_receivable_accounts_v1
      where branch_id=v_sale.branch_id and customer_id=v_sale.customer_id for update;
      if v_account.customer_id is null then raise exception using errcode='55000',message='CUSTOMER_CREDIT_ACCOUNT_NOT_FOUND'; end if;
      if v_account.balance+0.009<v_credit_refund then raise exception using errcode='23514',message='CUSTOMER_CREDIT_ALREADY_SETTLED'; end if;
      update private.customer_receivable_accounts_v1
      set balance=greatest(0,round(balance-v_credit_refund,2)),updated_at=now()
      where branch_id=v_sale.branch_id and customer_id=v_sale.customer_id;
      insert into private.customer_receivable_ledger_v1(
        branch_id,customer_id,entry_type,signed_amount,description,reference_kind,reference_id,idempotency_key,metadata,created_by
      ) values(
        v_sale.branch_id,v_sale.customer_id,'adjustment_decrease',-v_credit_refund,
        'مرتجع من فاتورة آجل '||v_sale.invoice_number,'return',v_return.id,v_credit_key,
        jsonb_build_object('sale_id',v_sale.id,'invoice_number',v_sale.invoice_number),auth.uid()
      );
    end if;
    delete from public.pos_card_refunds where return_id=v_return.id and status='pending';
    delete from private.pos_return_payment_parts_v3 where return_id=v_return.id;
    update public.returns
    set refund_card_amount=0,refund_cash_amount=0,customer_credit_refund_amount=v_credit_refund,
        refund_method='none',refund_status='completed',updated_at=now()
    where id=v_return.id returning * into v_return;
  end if;

  return to_jsonb(v_return)||jsonb_build_object('return_version',5,'customer_credit_refund_amount',v_credit_refund,
    'refund_breakdown',case when v_credit_refund>0 then jsonb_build_array(jsonb_build_object(
      'code','customer_credit','name','آجل عميل','method_type','customer_credit','base_refund_amount',v_credit_refund,'status','completed'))
      else coalesce(v_result->'refund_breakdown','[]'::jsonb) end,
    'employee_credit_refund_amount',coalesce((v_result->>'employee_credit_refund_amount')::numeric,0),
    'employee_points_reversed',coalesce((v_result->>'employee_points_reversed')::bigint,0));
end;
$$;

revoke all on function public.get_pos_sale_return_preview_v5(uuid) from public,anon;
grant execute on function public.get_pos_sale_return_preview_v5(uuid) to authenticated,service_role;
revoke all on function public.create_pos_sale_return_v5(uuid,uuid,uuid,text,jsonb,text) from public,anon;
grant execute on function public.create_pos_sale_return_v5(uuid,uuid,uuid,text,jsonb,text) to authenticated,service_role;
