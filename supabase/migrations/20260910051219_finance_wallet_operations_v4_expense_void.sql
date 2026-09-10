create or replace function public.void_branch_expense_atomic(p_expense_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_expense public.expenses%rowtype; v_cash_ledger uuid; v_payment_ledger uuid; v_fee_ledger uuid; v_op private.finance_wallet_operations_v4%rowtype; v_method text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_expense from public.expenses where id=p_expense_id for update;
  if v_expense.id is null then raise exception using errcode='22023',message='EXPENSE_NOT_FOUND'; end if;
  if not (public.staff_has_permission('finance.manage',v_expense.branch_id) or private.can_manage_financial_branch(v_expense.branch_id)) then raise exception using errcode='42501',message='EXPENSE_MANAGE_DENIED'; end if;
  if v_expense.status='voided' then return to_jsonb(v_expense); end if;
  if v_expense.paid_from_account_id is not null then
    insert into public.cash_ledger(account_id,branch_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by)
    values(v_expense.paid_from_account_id,v_expense.branch_id,auth.uid(),'expense_void',round(v_expense.amount,2),'expense_void',v_expense.id,'عكس مصروف: '||v_expense.type,jsonb_build_object('reason',nullif(trim(coalesce(p_reason,'')),'')),auth.uid()) returning id into v_cash_ledger;
  elsif v_expense.paid_from_payment_account_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_expense.paid_from_payment_account_id::text,0));
    if v_expense.wallet_operation_id is not null then select * into v_op from private.finance_wallet_operations_v4 where id=v_expense.wallet_operation_id for update; end if;
    v_method:=coalesce(v_expense.payment_method,'digital_wallet');
    insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
    values(v_expense.paid_from_payment_account_id,v_expense.branch_id,'wallet_expense_void',round(v_expense.amount,2),v_method,case when v_op.id is null then null else v_op.provider_reference end,'عكس مصروف من المحفظة: '||v_expense.type,jsonb_build_object('wallet_operation_id',v_expense.wallet_operation_id,'reason',nullif(trim(coalesce(p_reason,'')),'')),auth.uid()) returning id into v_payment_ledger;
    if v_expense.actual_fee_amount>0 then
      insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
      values(v_expense.paid_from_payment_account_id,v_expense.branch_id,'wallet_expense_fee_void',v_expense.actual_fee_amount,v_method,case when v_op.id is null then null else v_op.provider_reference end,'عكس عمولة مصروف من المحفظة',jsonb_build_object('wallet_operation_id',v_expense.wallet_operation_id),auth.uid()) returning id into v_fee_ledger;
    end if;
    if v_op.id is not null then update private.finance_wallet_operations_v4 set status='voided',voided_by=auth.uid(),voided_at=now(),void_reason=nullif(trim(coalesce(p_reason,'')),'') where id=v_op.id; end if;
  end if;
  update public.expenses set status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=nullif(trim(coalesce(p_reason,'')),'') where id=v_expense.id returning * into v_expense;
  return to_jsonb(v_expense)||jsonb_build_object('ledger_entry_id',v_cash_ledger,'payment_ledger_entry_id',v_payment_ledger,'fee_ledger_entry_id',v_fee_ledger,'cash_balance_after',case when v_expense.paid_from_account_id is null then null else private.cash_account_balance(v_expense.paid_from_account_id) end,'payment_balance_after',case when v_expense.paid_from_payment_account_id is null then null else private.payment_account_balance(v_expense.paid_from_payment_account_id) end);
end $$;