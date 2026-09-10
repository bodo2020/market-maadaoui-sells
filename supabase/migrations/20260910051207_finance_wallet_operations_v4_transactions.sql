create or replace function public.create_wallet_expense_v4(
  p_request_id uuid,p_branch_id uuid,p_payment_account_id uuid,p_type text,p_amount numeric,p_description text default null,p_actual_fee numeric default null,p_provider_reference text default null,p_date timestamptz default now(),p_receipt_url text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_account public.payment_accounts%rowtype; v_fee jsonb; v_method_code text; v_expected numeric(12,2); v_actual numeric(12,2); v_total numeric(12,2); v_before numeric(14,2); v_op private.finance_wallet_operations_v4%rowtype; v_expense public.expenses%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('finance.manage',p_branch_id) or private.can_manage_financial_branch(p_branch_id)) then raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='REQUEST_ID_REQUIRED'; end if;
  if coalesce(p_amount,0)<=0 then raise exception using errcode='22023',message='INVALID_AMOUNT'; end if;
  if nullif(trim(coalesce(p_type,'')),'') is null then raise exception using errcode='22023',message='EXPENSE_TYPE_REQUIRED'; end if;
  select * into v_op from private.finance_wallet_operations_v4 where request_id=p_request_id;
  if v_op.id is not null then
    if v_op.branch_id<>p_branch_id or v_op.operation_type<>'expense' then raise exception using errcode='22023',message='REQUEST_ID_CONFLICT'; end if;
    return to_jsonb(v_op)||jsonb_build_object('balance_after',private.payment_account_balance(v_op.payment_account_id));
  end if;
  select * into v_account from public.payment_accounts where id=p_payment_account_id and branch_id=p_branch_id and active is true and account_type='gateway_clearing' for update;
  if v_account.id is null then raise exception using errcode='22023',message='WALLET_ACCOUNT_NOT_FOUND'; end if;
  v_fee:=private.finance_wallet_fee_v1(p_branch_id,p_payment_account_id,p_amount);
  if coalesce(v_fee->>'method_type','')<>'digital_wallet' then raise exception using errcode='22023',message='DIGITAL_WALLET_REQUIRED'; end if;
  v_method_code:=coalesce(nullif(v_fee->>'code',''),'digital_wallet');
  v_expected:=round(coalesce((v_fee->>'expected_fee_amount')::numeric,0),2); v_actual:=round(coalesce(p_actual_fee,v_expected),2);
  if v_actual<0 then raise exception using errcode='22023',message='INVALID_ACTUAL_FEE'; end if;
  v_total:=round(p_amount+v_actual,2);
  perform pg_advisory_xact_lock(hashtextextended(p_payment_account_id::text,0));
  v_before:=private.payment_account_balance(p_payment_account_id);
  if v_before<v_total then raise exception using errcode='22003',message='INSUFFICIENT_WALLET_BALANCE',detail=jsonb_build_object('balance',v_before,'required',v_total)::text; end if;
  insert into private.finance_wallet_operations_v4(request_id,branch_id,payment_account_id,operation_type,principal_amount,expected_fee_amount,actual_fee_amount,fee_saving_amount,total_debit,provider_reference,note,created_by)
  values(p_request_id,p_branch_id,p_payment_account_id,'expense',round(p_amount,2),v_expected,v_actual,round(v_expected-v_actual,2),v_total,nullif(trim(coalesce(p_provider_reference,'')),''),nullif(trim(coalesce(p_description,'')),''),auth.uid()) returning * into v_op;
  insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
  values(p_payment_account_id,p_branch_id,'wallet_expense',-round(p_amount,2),v_method_code,nullif(trim(coalesce(p_provider_reference,'')),''),'مصروف من المحفظة: '||trim(p_type),jsonb_build_object('wallet_operation_id',v_op.id,'expected_fee',v_expected,'actual_fee',v_actual,'fee_saving',round(v_expected-v_actual,2)),auth.uid());
  if v_actual>0 then
    insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
    values(p_payment_account_id,p_branch_id,'wallet_expense_fee',-v_actual,v_method_code,nullif(trim(coalesce(p_provider_reference,'')),''),'عمولة مصروف من المحفظة',jsonb_build_object('wallet_operation_id',v_op.id,'expense_type',trim(p_type)),auth.uid());
  end if;
  insert into public.expenses(type,amount,description,date,receipt_url,branch_id,payment_method,paid_from_payment_account_id,wallet_operation_id,expected_fee_amount,actual_fee_amount,fee_saving_amount,created_by,status)
  values(trim(p_type),round(p_amount,2),nullif(trim(coalesce(p_description,'')),''),coalesce(p_date,now()),nullif(trim(coalesce(p_receipt_url,'')),''),p_branch_id,v_method_code,p_payment_account_id,v_op.id,v_expected,v_actual,round(v_expected-v_actual,2),auth.uid(),'active') returning * into v_expense;
  update private.finance_wallet_operations_v4 set expense_id=v_expense.id where id=v_op.id returning * into v_op;
  return to_jsonb(v_op)||jsonb_build_object('expense',to_jsonb(v_expense),'balance_before',v_before,'balance_after',private.payment_account_balance(p_payment_account_id),'fee_config',v_fee);
end $$;

create or replace function public.create_supplier_wallet_payment_v4(
  p_request_id uuid,p_branch_id uuid,p_payment_account_id uuid,p_supplier_id uuid,p_amount numeric,p_representative_id uuid default null,p_purchase_id uuid default null,p_apply_to_supplier boolean default false,p_actual_fee numeric default null,p_provider_reference text default null,p_note text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_account public.payment_accounts%rowtype; v_purchase public.purchases%rowtype; v_rep private.supplier_representatives_v1%rowtype; v_fee jsonb; v_method_code text; v_expected numeric(12,2); v_actual numeric(12,2); v_total numeric(12,2); v_before numeric(14,2); v_outstanding numeric(12,2); v_apply boolean; v_op private.finance_wallet_operations_v4%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('finance.manage',p_branch_id) or private.can_manage_financial_branch(p_branch_id)) then raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='REQUEST_ID_REQUIRED'; end if;
  if coalesce(p_amount,0)<=0 then raise exception using errcode='22023',message='INVALID_AMOUNT'; end if;
  if not exists(select 1 from public.suppliers where id=p_supplier_id) then raise exception using errcode='22023',message='SUPPLIER_NOT_FOUND'; end if;
  select * into v_op from private.finance_wallet_operations_v4 where request_id=p_request_id;
  if v_op.id is not null then
    if v_op.branch_id<>p_branch_id or v_op.operation_type<>'supplier_payment' then raise exception using errcode='22023',message='REQUEST_ID_CONFLICT'; end if;
    return to_jsonb(v_op)||jsonb_build_object('balance_after',private.payment_account_balance(v_op.payment_account_id));
  end if;
  if p_representative_id is not null then
    select * into v_rep from private.supplier_representatives_v1 where id=p_representative_id and branch_id=p_branch_id and supplier_id=p_supplier_id and active is true;
    if v_rep.id is null then raise exception using errcode='22023',message='REPRESENTATIVE_NOT_FOUND'; end if;
    if not v_rep.can_receive_payments then raise exception using errcode='42501',message='REPRESENTATIVE_PAYMENT_NOT_ALLOWED'; end if;
    if v_rep.payment_limit is not null and p_amount>v_rep.payment_limit then raise exception using errcode='22003',message='REPRESENTATIVE_PAYMENT_LIMIT_EXCEEDED'; end if;
  end if;
  v_apply:=coalesce(p_apply_to_supplier,false) or p_purchase_id is not null;
  if p_purchase_id is not null then
    select * into v_purchase from public.purchases where id=p_purchase_id for update;
    if v_purchase.id is null or v_purchase.branch_id is distinct from p_branch_id or v_purchase.supplier_id is distinct from p_supplier_id then raise exception using errcode='22023',message='PURCHASE_NOT_FOUND_FOR_SUPPLIER'; end if;
    v_outstanding:=round(v_purchase.total-v_purchase.paid,2);
    if v_outstanding<=0 then raise exception using errcode='22003',message='PURCHASE_HAS_NO_OUTSTANDING'; end if;
    if p_amount>v_outstanding then raise exception using errcode='22003',message='PAYMENT_EXCEEDS_PURCHASE_OUTSTANDING',detail=jsonb_build_object('outstanding',v_outstanding)::text; end if;
  end if;
  select * into v_account from public.payment_accounts where id=p_payment_account_id and branch_id=p_branch_id and active is true and account_type='gateway_clearing' for update;
  if v_account.id is null then raise exception using errcode='22023',message='WALLET_ACCOUNT_NOT_FOUND'; end if;
  v_fee:=private.finance_wallet_fee_v1(p_branch_id,p_payment_account_id,p_amount);
  if coalesce(v_fee->>'method_type','')<>'digital_wallet' then raise exception using errcode='22023',message='DIGITAL_WALLET_REQUIRED'; end if;
  v_method_code:=coalesce(nullif(v_fee->>'code',''),'digital_wallet');
  v_expected:=round(coalesce((v_fee->>'expected_fee_amount')::numeric,0),2); v_actual:=round(coalesce(p_actual_fee,v_expected),2);
  if v_actual<0 then raise exception using errcode='22023',message='INVALID_ACTUAL_FEE'; end if;
  v_total:=round(p_amount+v_actual,2);
  perform pg_advisory_xact_lock(hashtextextended(p_payment_account_id::text,0));
  v_before:=private.payment_account_balance(p_payment_account_id);
  if v_before<v_total then raise exception using errcode='22003',message='INSUFFICIENT_WALLET_BALANCE',detail=jsonb_build_object('balance',v_before,'required',v_total)::text; end if;
  insert into private.finance_wallet_operations_v4(request_id,branch_id,payment_account_id,operation_type,principal_amount,expected_fee_amount,actual_fee_amount,fee_saving_amount,total_debit,supplier_id,representative_id,purchase_id,apply_to_supplier,provider_reference,note,created_by)
  values(p_request_id,p_branch_id,p_payment_account_id,'supplier_payment',round(p_amount,2),v_expected,v_actual,round(v_expected-v_actual,2),v_total,p_supplier_id,p_representative_id,p_purchase_id,v_apply,nullif(trim(coalesce(p_provider_reference,'')),''),nullif(trim(coalesce(p_note,'')),''),auth.uid()) returning * into v_op;
  insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
  values(p_payment_account_id,p_branch_id,'supplier_wallet_payment',-round(p_amount,2),v_method_code,nullif(trim(coalesce(p_provider_reference,'')),''),'دفع مورد من المحفظة',jsonb_build_object('wallet_operation_id',v_op.id,'supplier_id',p_supplier_id,'representative_id',p_representative_id,'purchase_id',p_purchase_id,'apply_to_supplier',v_apply),auth.uid());
  if v_actual>0 then
    insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
    values(p_payment_account_id,p_branch_id,'supplier_wallet_payment_fee',-v_actual,v_method_code,nullif(trim(coalesce(p_provider_reference,'')),''),'عمولة دفع مورد من المحفظة',jsonb_build_object('wallet_operation_id',v_op.id,'supplier_id',p_supplier_id),auth.uid());
  end if;
  if p_purchase_id is not null then
    perform set_config('app.supplier_wallet_operation_id',v_op.id::text,true); perform set_config('app.supplier_representative_id',coalesce(p_representative_id::text,''),true);
    update public.purchases set paid=round(paid+p_amount,2) where id=p_purchase_id;
    perform set_config('app.supplier_wallet_operation_id','',true); perform set_config('app.supplier_representative_id','',true);
  elsif v_apply then
    insert into private.supplier_ledger_v1(branch_id,supplier_id,entry_type,signed_amount,wallet_operation_id,representative_id,idempotency_key,description,metadata,created_by)
    values(p_branch_id,p_supplier_id,'supplier_payment',-round(p_amount,2),v_op.id,p_representative_id,'wallet-op:'||v_op.id::text||':supplier-payment','دفعة على حساب المورد',jsonb_build_object('provider_reference',nullif(trim(coalesce(p_provider_reference,'')),'')),auth.uid());
  end if;
  return to_jsonb(v_op)||jsonb_build_object('balance_before',v_before,'balance_after',private.payment_account_balance(p_payment_account_id),'supplier_branch_balance',coalesce((select round(sum(signed_amount),2) from private.supplier_ledger_v1 where supplier_id=p_supplier_id and branch_id=p_branch_id),0),'fee_config',v_fee);
end $$;

create or replace function public.void_supplier_wallet_payment_v4(p_operation_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_op private.finance_wallet_operations_v4%rowtype; v_purchase public.purchases%rowtype; v_method text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_op from private.finance_wallet_operations_v4 where id=p_operation_id for update;
  if v_op.id is null or v_op.operation_type<>'supplier_payment' then raise exception using errcode='22023',message='SUPPLIER_PAYMENT_NOT_FOUND'; end if;
  if not (public.staff_has_permission('finance.manage',v_op.branch_id) or private.can_manage_financial_branch(v_op.branch_id)) then raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED'; end if;
  if v_op.status='voided' then return to_jsonb(v_op)||jsonb_build_object('balance_after',private.payment_account_balance(v_op.payment_account_id)); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_op.payment_account_id::text,0));
  v_method:=coalesce(private.finance_wallet_fee_v1(v_op.branch_id,v_op.payment_account_id,v_op.principal_amount)->>'code','digital_wallet');
  insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
  values(v_op.payment_account_id,v_op.branch_id,'supplier_wallet_payment_void',v_op.principal_amount,v_method,v_op.provider_reference,'عكس دفع مورد من المحفظة',jsonb_build_object('wallet_operation_id',v_op.id,'reason',nullif(trim(coalesce(p_reason,'')),'')),auth.uid());
  if v_op.actual_fee_amount>0 then
    insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
    values(v_op.payment_account_id,v_op.branch_id,'supplier_wallet_payment_fee_void',v_op.actual_fee_amount,v_method,v_op.provider_reference,'عكس عمولة دفع مورد',jsonb_build_object('wallet_operation_id',v_op.id),auth.uid());
  end if;
  if v_op.purchase_id is not null then
    select * into v_purchase from public.purchases where id=v_op.purchase_id for update;
    if v_purchase.id is not null then
      if v_purchase.paid<v_op.principal_amount then raise exception using errcode='22003',message='PURCHASE_PAID_VALUE_TOO_LOW_TO_VOID'; end if;
      perform set_config('app.supplier_wallet_operation_id',v_op.id::text,true); perform set_config('app.supplier_representative_id',coalesce(v_op.representative_id::text,''),true);
      update public.purchases set paid=round(paid-v_op.principal_amount,2) where id=v_purchase.id;
      perform set_config('app.supplier_wallet_operation_id','',true); perform set_config('app.supplier_representative_id','',true);
    end if;
  elsif v_op.apply_to_supplier then
    insert into private.supplier_ledger_v1(branch_id,supplier_id,entry_type,signed_amount,wallet_operation_id,representative_id,idempotency_key,description,metadata,created_by)
    values(v_op.branch_id,v_op.supplier_id,'supplier_payment_void',v_op.principal_amount,v_op.id,v_op.representative_id,'wallet-op:'||v_op.id::text||':supplier-payment-void','عكس دفعة على حساب المورد',jsonb_build_object('reason',nullif(trim(coalesce(p_reason,'')),'')),auth.uid());
  end if;
  update private.finance_wallet_operations_v4 set status='voided',voided_by=auth.uid(),voided_at=now(),void_reason=nullif(trim(coalesce(p_reason,'')),'') where id=v_op.id returning * into v_op;
  return to_jsonb(v_op)||jsonb_build_object('balance_after',private.payment_account_balance(v_op.payment_account_id));
end $$;

revoke all on function public.create_wallet_expense_v4(uuid,uuid,uuid,text,numeric,text,numeric,text,timestamptz,text) from public,anon;
revoke all on function public.create_supplier_wallet_payment_v4(uuid,uuid,uuid,uuid,numeric,uuid,uuid,boolean,numeric,text,text) from public,anon;
revoke all on function public.void_supplier_wallet_payment_v4(uuid,text) from public,anon;
grant execute on function public.create_wallet_expense_v4(uuid,uuid,uuid,text,numeric,text,numeric,text,timestamptz,text) to authenticated;
grant execute on function public.create_supplier_wallet_payment_v4(uuid,uuid,uuid,uuid,numeric,uuid,uuid,boolean,numeric,text,text) to authenticated;
grant execute on function public.void_supplier_wallet_payment_v4(uuid,text) to authenticated;