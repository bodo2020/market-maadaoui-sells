create or replace function public.create_finance_bank_account_v2(p_branch_id uuid,p_name text,p_custodian_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_name text:=trim(coalesce(p_name,''));v_user_name text;v_provider text;begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
  if not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED';end if;
  if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED';end if;
  if length(v_name)<2 then raise exception using errcode='22023',message='FINANCE_BANK_NAME_REQUIRED';end if;
  if exists(select 1 from public.payment_accounts where branch_id=p_branch_id and account_type='bank' and active and lower(trim(name))=lower(v_name)) then raise exception using errcode='23505',message='FINANCE_BANK_NAME_EXISTS';end if;
  if p_custodian_user_id is not null then
    select u.name into v_user_name from public.users u where u.id=p_custodian_user_id and coalesce(u.active,true) and public.has_branch_access(u.id,p_branch_id);
    if v_user_name is null then raise exception using errcode='22023',message='FINANCE_CUSTODIAN_INVALID';end if;
  end if;
  v_provider:='bank_'||replace(gen_random_uuid()::text,'-','');
  insert into public.payment_accounts(branch_id,account_type,provider_code,name,currency,active,custodian_user_id)
  values(p_branch_id,'bank',v_provider,v_name,'EGP',true,p_custodian_user_id) returning id into v_id;
  return jsonb_build_object('ok',true,'account_id',v_id,'name',v_name,'custodian_user_id',p_custodian_user_id,'custodian_user_name',v_user_name,'balance',0);
end;$$;

create or replace function public.update_finance_bank_account_v2(p_account_id uuid,p_name text,p_custodian_user_id uuid,p_active boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.payment_accounts%rowtype;v_name text:=trim(coalesce(p_name,''));v_user_name text;v_balance numeric;begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
  select * into a from public.payment_accounts where id=p_account_id and account_type='bank' for update;
  if a.id is null then raise exception using errcode='22023',message='FINANCE_BANK_NOT_FOUND';end if;
  if not public.has_branch_access(auth.uid(),a.branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED';end if;
  if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.manage',a.branch_id)) then raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED';end if;
  if length(v_name)<2 then raise exception using errcode='22023',message='FINANCE_BANK_NAME_REQUIRED';end if;
  if exists(select 1 from public.payment_accounts x where x.branch_id=a.branch_id and x.account_type='bank' and x.active and x.id<>a.id and lower(trim(x.name))=lower(v_name)) then raise exception using errcode='23505',message='FINANCE_BANK_NAME_EXISTS';end if;
  if p_custodian_user_id is not null then
    select u.name into v_user_name from public.users u where u.id=p_custodian_user_id and coalesce(u.active,true) and public.has_branch_access(u.id,a.branch_id);
    if v_user_name is null then raise exception using errcode='22023',message='FINANCE_CUSTODIAN_INVALID';end if;
  end if;
  if coalesce(p_active,false)=false and a.active then
    v_balance:=private.payment_account_balance(a.id);
    if abs(v_balance)>0.005 then raise exception using errcode='55000',message='FINANCE_BANK_HAS_BALANCE';end if;
    if exists(select 1 from private.finance_transfers_v2 t where t.branch_id=a.branch_id and ((t.source_ledger_kind='payment' and t.source_account_id=a.id) or (t.destination_ledger_kind='payment' and t.destination_account_id=a.id)) and t.status in ('awaiting_sender','awaiting_receiver','exception')) then raise exception using errcode='55000',message='FINANCE_BANK_HAS_OPEN_TRANSFERS';end if;
  end if;
  update public.payment_accounts set name=v_name,custodian_user_id=p_custodian_user_id,active=coalesce(p_active,false),updated_at=now() where id=a.id;
  return jsonb_build_object('ok',true,'account_id',a.id,'name',v_name,'active',coalesce(p_active,false),'custodian_user_id',p_custodian_user_id,'custodian_user_name',v_user_name,'balance',round(private.payment_account_balance(a.id),2));
end;$$;

revoke all on function public.create_finance_bank_account_v2(uuid,text,uuid) from public,anon;
revoke all on function public.update_finance_bank_account_v2(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.create_finance_bank_account_v2(uuid,text,uuid) to authenticated,service_role;
grant execute on function public.update_finance_bank_account_v2(uuid,text,uuid,boolean) to authenticated,service_role;
