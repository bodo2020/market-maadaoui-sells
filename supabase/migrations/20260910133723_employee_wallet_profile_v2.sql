create or replace function public.get_my_employee_wallet_v1(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  insert into private.hr_employee_wallet_accounts(employee_id,branch_id)
  select v_uid,ep.primary_branch_id from private.hr_employee_profiles ep where ep.user_id=v_uid
  on conflict(employee_id) do update set branch_id=coalesce(private.hr_employee_wallet_accounts.branch_id,excluded.branch_id);

  select jsonb_build_object(
    'account',jsonb_build_object(
      'employee_id',a.employee_id,'branch_id',a.branch_id,
      'membership_number',a.membership_number,'barcode_token',a.barcode_token,
      'points_balance',a.points_balance,'lifetime_points_earned',a.lifetime_points_earned,'lifetime_points_reversed',a.lifetime_points_reversed,
      'benefit_balance',a.benefit_balance,'benefit_monthly_allowance',a.benefit_monthly_allowance,
      'credit_limit',a.credit_limit,'receivable_balance',a.receivable_balance,'credit_available',greatest(a.credit_limit-a.receivable_balance,0),
      'payroll_deduction_enabled',a.payroll_deduction_enabled,'active',a.active
    ),
    'ledger',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select l.id,l.entry_type,l.benefit_delta,l.receivable_delta,l.points_delta,l.amount,l.reference_kind,l.reference_id,l.description,l.metadata,l.created_at
      from private.hr_employee_wallet_ledger l where l.employee_id=v_uid order by l.created_at desc limit greatest(1,least(coalesce(p_limit,50),200))
    ) x),'[]'::jsonb)
  ) into v_result from private.hr_employee_wallet_accounts a where a.employee_id=v_uid;
  return coalesce(v_result,jsonb_build_object('account',null,'ledger','[]'::jsonb));
end;$function$;

create or replace function public.get_employee_wallet_admin_v1(p_employee_id uuid,p_branch_id uuid,p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('finance.view',p_branch_id)
     and not public.staff_has_permission('hr.manage_employees',p_branch_id) then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  if not exists(select 1 from public.users u where u.id=p_employee_id and coalesce(u.active,true)) then raise exception using errcode='22023',message='EMPLOYEE_NOT_FOUND'; end if;
  insert into private.hr_employee_wallet_accounts(employee_id,branch_id)
  values(p_employee_id,p_branch_id)
  on conflict(employee_id) do update set branch_id=coalesce(private.hr_employee_wallet_accounts.branch_id,excluded.branch_id);

  select jsonb_build_object(
    'account',jsonb_build_object(
      'employee_id',a.employee_id,'branch_id',a.branch_id,
      'membership_number',a.membership_number,'barcode_token',a.barcode_token,
      'points_balance',a.points_balance,'lifetime_points_earned',a.lifetime_points_earned,'lifetime_points_reversed',a.lifetime_points_reversed,
      'benefit_balance',a.benefit_balance,'benefit_monthly_allowance',a.benefit_monthly_allowance,
      'credit_limit',a.credit_limit,'receivable_balance',a.receivable_balance,'credit_available',greatest(a.credit_limit-a.receivable_balance,0),
      'payroll_deduction_enabled',a.payroll_deduction_enabled,'active',a.active
    ),
    'ledger',coalesce((select jsonb_agg(x order by x.created_at desc) from (
      select l.id,l.entry_type,l.benefit_delta,l.receivable_delta,l.points_delta,l.amount,l.reference_kind,l.reference_id,l.description,l.metadata,l.actor_user_id,l.created_at
      from private.hr_employee_wallet_ledger l where l.employee_id=p_employee_id order by l.created_at desc limit greatest(1,least(coalesce(p_limit,100),300))
    ) x),'[]'::jsonb)
  ) into v_result from private.hr_employee_wallet_accounts a where a.employee_id=p_employee_id;
  return v_result;
end;$function$;

revoke all on function public.get_my_employee_wallet_v1(integer) from public,anon;
grant execute on function public.get_my_employee_wallet_v1(integer) to authenticated,service_role;
revoke all on function public.get_employee_wallet_admin_v1(uuid,uuid,integer) from public,anon;
grant execute on function public.get_employee_wallet_admin_v1(uuid,uuid,integer) to authenticated,service_role;
