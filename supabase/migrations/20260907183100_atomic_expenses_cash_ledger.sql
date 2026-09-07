-- Atomic expense posting and reversal on the immutable branch cash ledger.

alter table public.expenses add column if not exists payment_method text;
alter table public.expenses add column if not exists paid_from_account_id uuid references public.cash_accounts(id);
alter table public.expenses add column if not exists shift_id uuid references public.pos_shifts(id);
alter table public.expenses add column if not exists created_by uuid references public.users(id);
alter table public.expenses add column if not exists status text not null default 'active';
alter table public.expenses add column if not exists voided_at timestamptz;
alter table public.expenses add column if not exists voided_by uuid references public.users(id);
alter table public.expenses add column if not exists void_reason text;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='expenses_status_check') then
    alter table public.expenses add constraint expenses_status_check check(status in ('active','voided'));
  end if;
end $$;

create or replace function private.protect_expense_financial_fields()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' and old.paid_from_account_id is not null then raise exception using errcode='55000',message='USE_EXPENSE_VOID'; end if;
  if tg_op='UPDATE' and old.paid_from_account_id is not null then
    if new.amount is distinct from old.amount or new.branch_id is distinct from old.branch_id
       or new.paid_from_account_id is distinct from old.paid_from_account_id
       or new.payment_method is distinct from old.payment_method
       or new.shift_id is distinct from old.shift_id then
      raise exception using errcode='55000',message='EXPENSE_FINANCIAL_FIELDS_LOCKED';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
drop trigger if exists protect_expense_financial_fields on public.expenses;
create trigger protect_expense_financial_fields before update or delete on public.expenses for each row execute function private.protect_expense_financial_fields();

create or replace function public.create_branch_expense_atomic(
  p_branch_id uuid,p_type text,p_amount numeric,p_description text,p_date timestamptz default now(),p_receipt_url text default null,p_source text default 'safe'
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_account uuid; v_balance numeric; v_expense public.expenses%rowtype; v_ledger uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('finance.manage',p_branch_id) or private.can_manage_financial_branch(p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_MANAGE_DENIED'; end if;
  if p_amount is null or p_amount<=0 or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception using errcode='22023',message='INVALID_AMOUNT'; end if;
  if nullif(trim(coalesce(p_type,'')),'') is null or nullif(trim(coalesce(p_description,'')),'') is null then raise exception using errcode='22023',message='EXPENSE_DETAILS_REQUIRED'; end if;
  if p_source not in ('safe','noncash') then raise exception using errcode='22023',message='INVALID_EXPENSE_SOURCE'; end if;

  if p_source='safe' then
    v_account:=private.ensure_branch_safe_account(p_branch_id);
    perform pg_advisory_xact_lock(hashtextextended('cash-account:'||v_account::text,51));
    v_balance:=private.cash_account_balance(v_account);
    if round(p_amount,2)>v_balance then raise exception using errcode='22023',message='INSUFFICIENT_SAFE_CASH|'||to_char(v_balance,'FM9999999990.00'); end if;
  end if;

  insert into public.expenses(type,amount,description,date,receipt_url,branch_id,payment_method,paid_from_account_id,created_by,status)
  values(trim(p_type),round(p_amount,2),trim(p_description),coalesce(p_date,now()),nullif(trim(coalesce(p_receipt_url,'')),''),p_branch_id,case when p_source='safe' then 'cash' else 'noncash' end,v_account,auth.uid(),'active')
  returning * into v_expense;

  if v_account is not null then
    insert into public.cash_ledger(account_id,branch_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,created_by,created_at)
    values(v_account,p_branch_id,auth.uid(),'expense_cash',-round(p_amount,2),'expense',v_expense.id,'مصروف: '||trim(p_type)||' - '||trim(p_description),auth.uid(),coalesce(p_date,now()))
    returning id into v_ledger;
  end if;
  return to_jsonb(v_expense)||jsonb_build_object('ledger_entry_id',v_ledger,'cash_balance_after',case when v_account is null then null else private.cash_account_balance(v_account) end);
end; $$;
revoke all on function public.create_branch_expense_atomic(uuid,text,numeric,text,timestamptz,text,text) from public,anon;
grant execute on function public.create_branch_expense_atomic(uuid,text,numeric,text,timestamptz,text,text) to authenticated;

create or replace function public.void_branch_expense_atomic(p_expense_id uuid,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_expense public.expenses%rowtype; v_ledger uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_expense from public.expenses where id=p_expense_id for update;
  if v_expense.id is null then raise exception using errcode='22023',message='EXPENSE_NOT_FOUND'; end if;
  if not (public.staff_has_permission('finance.manage',v_expense.branch_id) or private.can_manage_financial_branch(v_expense.branch_id)) then raise exception using errcode='42501',message='EXPENSE_MANAGE_DENIED'; end if;
  if v_expense.status='voided' then return to_jsonb(v_expense); end if;
  if v_expense.paid_from_account_id is not null then
    insert into public.cash_ledger(account_id,branch_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by)
    values(v_expense.paid_from_account_id,v_expense.branch_id,auth.uid(),'expense_void',round(v_expense.amount,2),'expense_void',v_expense.id,'عكس مصروف: '||v_expense.type,jsonb_build_object('reason',nullif(trim(coalesce(p_reason,'')),'')),auth.uid()) returning id into v_ledger;
  end if;
  update public.expenses set status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=nullif(trim(coalesce(p_reason,'')),'') where id=v_expense.id returning * into v_expense;
  return to_jsonb(v_expense)||jsonb_build_object('ledger_entry_id',v_ledger,'cash_balance_after',case when v_expense.paid_from_account_id is null then null else private.cash_account_balance(v_expense.paid_from_account_id) end);
end; $$;
revoke all on function public.void_branch_expense_atomic(uuid,text) from public,anon;
grant execute on function public.void_branch_expense_atomic(uuid,text) to authenticated;
