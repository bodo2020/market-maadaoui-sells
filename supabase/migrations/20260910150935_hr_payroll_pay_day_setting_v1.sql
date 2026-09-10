create or replace function public.set_hr_payroll_pay_day_v1(p_branch_id uuid,p_pay_day smallint)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_policy private.hr_payroll_policies%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='HR_BRANCH_ACCESS_DENIED';
  end if;
  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('hr.manage_employees',p_branch_id)
     and not public.staff_has_permission('finance.manage',p_branch_id) then
    raise exception using errcode='42501',message='PAYROLL_POLICY_DENIED';
  end if;
  if p_pay_day is null or p_pay_day not between 1 and 31 then
    raise exception using errcode='22023',message='INVALID_PAY_DAY';
  end if;

  insert into private.hr_payroll_policies(branch_id,pay_day_of_month,updated_at)
  values(p_branch_id,p_pay_day,now())
  on conflict(branch_id) do update
    set pay_day_of_month=excluded.pay_day_of_month,updated_at=now()
  returning * into v_policy;

  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data)
  values('payroll_policy',p_branch_id,'set_pay_day',v_uid,p_branch_id,jsonb_build_object('pay_day_of_month',p_pay_day));

  return jsonb_build_object('ok',true,'pay_day_of_month',v_policy.pay_day_of_month);
end;$$;

revoke all on function public.set_hr_payroll_pay_day_v1(uuid,smallint) from public,anon;
grant execute on function public.set_hr_payroll_pay_day_v1(uuid,smallint) to authenticated,service_role;
