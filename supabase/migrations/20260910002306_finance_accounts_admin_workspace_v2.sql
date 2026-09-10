create or replace function public.get_finance_accounts_admin_v2(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_cash jsonb;v_banks jsonb;v_staff jsonb;begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
  if not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED';end if;
  if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED';end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',ca.id,'account_type',ca.account_type,'name',ca.name,'currency',ca.currency,'active',ca.active,
    'balance',round(private.cash_account_balance(ca.id),2),'custodian_user_id',ca.custodian_user_id,'custodian_user_name',u.name
  ) order by ca.name),'[]') into v_cash
  from public.cash_accounts ca left join public.users u on u.id=ca.custodian_user_id
  where ca.branch_id=p_branch_id and ca.account_type='branch_safe';

  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',pa.id,'account_type',pa.account_type,'provider_code',pa.provider_code,'name',pa.name,'currency',pa.currency,
    'active',pa.active,'balance',round(private.payment_account_balance(pa.id),2),'custodian_user_id',pa.custodian_user_id,'custodian_user_name',u.name
  ) order by pa.active desc,pa.name),'[]') into v_banks
  from public.payment_accounts pa left join public.users u on u.id=pa.custodian_user_id
  where pa.branch_id=p_branch_id and pa.account_type='bank';

  select coalesce(jsonb_agg(jsonb_build_object('user_id',u.id,'name',u.name,'role',ubr.role) order by u.name),'[]') into v_staff
  from public.user_branch_roles ubr join public.users u on u.id=ubr.user_id
  where ubr.branch_id=p_branch_id and coalesce(ubr.active,true) and coalesce(u.active,true);

  return jsonb_build_object('version',2,'branch_id',p_branch_id,'branch_safes',v_cash,'bank_accounts',v_banks,'eligible_staff',v_staff,'generated_at',now());
end;$$;

revoke all on function public.get_finance_accounts_admin_v2(uuid) from public,anon;
grant execute on function public.get_finance_accounts_admin_v2(uuid) to authenticated,service_role;
