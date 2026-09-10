create or replace function public.get_my_employee_purchase_profile_v1(p_branch_id uuid default null,p_ledger_limit integer default 30)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_branch uuid;
  v_today date:=timezone('Africa/Cairo',now())::date;
  v_through date:=timezone('Africa/Cairo',now())::date-1;
  v_month_start date;
  v_pay_day integer;
  v_next_pay date;
  v_attended integer:=0;
  v_scheduled integer:=0;
  v_leave numeric:=0;
  v_absent numeric:=0;
  v_late integer:=0;
  v_worked integer:=0;
  v_wallet jsonb;
  v_advances jsonb;
  v_latest_payroll jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select coalesce(p_branch_id,ep.primary_branch_id) into v_branch from private.hr_employee_profiles ep where ep.user_id=v_uid;
  if v_branch is null then
    select ubr.branch_id into v_branch from public.user_branch_roles ubr where ubr.user_id=v_uid and ubr.active order by ubr.is_primary desc nulls last limit 1;
  end if;
  if v_branch is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not exists(select 1 from public.user_branch_roles ubr where ubr.user_id=v_uid and ubr.branch_id=v_branch and ubr.active)
     and not exists(select 1 from private.hr_employee_profiles ep where ep.user_id=v_uid and ep.primary_branch_id=v_branch)
     and not private.staff_is_super_admin(v_uid) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;

  insert into private.hr_employee_wallet_accounts(employee_id,branch_id) values(v_uid,v_branch)
  on conflict(employee_id) do update set branch_id=coalesce(private.hr_employee_wallet_accounts.branch_id,excluded.branch_id);

  v_month_start:=date_trunc('month',v_today)::date;
  if v_through>=v_month_start then
    select count(distinct s.work_date)::int,
           count(distinct s.work_date) filter(where s.late_minutes>0)::int,
           coalesce(sum(s.worked_minutes),0)::int
    into v_attended,v_late,v_worked
    from private.hr_attendance_sessions s
    where s.user_id=v_uid and s.work_date between v_month_start and v_through;

    select count(*)::int into v_scheduled
    from generate_series(v_month_start::timestamp,v_through::timestamp,interval '1 day') g(day)
    where exists(
      select 1 from private.hr_employee_shift_assignments a
      where a.user_id=v_uid and a.branch_id=v_branch and a.active
        and g.day::date>=a.effective_from
        and (a.effective_to is null or g.day::date<=a.effective_to)
        and extract(dow from g.day)::smallint=any(a.weekdays)
    );

    select coalesce(sum(case when lp.partial_day='none' then 1 else 0.5 end),0) into v_leave
    from generate_series(v_month_start::timestamp,v_through::timestamp,interval '1 day') g(day)
    join private.hr_leave_periods lp
      on lp.employee_id=v_uid and lp.branch_id=v_branch and lp.status='approved'
     and g.day::date between lp.start_date and lp.end_date
    where exists(
      select 1 from private.hr_employee_shift_assignments a
      where a.user_id=v_uid and a.branch_id=v_branch and a.active
        and g.day::date>=a.effective_from
        and (a.effective_to is null or g.day::date<=a.effective_to)
        and extract(dow from g.day)::smallint=any(a.weekdays)
    );
  end if;
  v_absent:=greatest(v_scheduled-v_attended-v_leave,0);

  select pp.pay_day_of_month into v_pay_day from private.hr_payroll_policies pp where pp.branch_id=v_branch;
  if v_pay_day is not null then
    v_next_pay:=make_date(extract(year from v_today)::int,extract(month from v_today)::int,least(v_pay_day,extract(day from (date_trunc('month',v_today)+interval '1 month - 1 day'))::int));
    if v_next_pay<v_today then
      v_next_pay:=make_date(extract(year from (v_today+interval '1 month'))::int,extract(month from (v_today+interval '1 month'))::int,least(v_pay_day,extract(day from (date_trunc('month',v_today+interval '1 month')+interval '1 month - 1 day'))::int));
    end if;
  end if;

  select jsonb_build_object(
    'employee_id',a.employee_id,'branch_id',a.branch_id,'membership_number',a.membership_number,'barcode_token',a.barcode_token,
    'points_balance',a.points_balance,'lifetime_points_earned',a.lifetime_points_earned,'lifetime_points_reversed',a.lifetime_points_reversed,
    'credit_limit',a.credit_limit,'receivable_balance',a.receivable_balance,'credit_available',greatest(a.credit_limit-a.receivable_balance,0),
    'benefit_balance',a.benefit_balance,'benefit_monthly_allowance',a.benefit_monthly_allowance,'payroll_deduction_enabled',a.payroll_deduction_enabled,'active',a.active,
    'ledger',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
      select l.id,l.entry_type,l.benefit_delta,l.receivable_delta,l.points_delta,l.amount,l.reference_kind,l.reference_id,l.description,l.metadata,l.created_at
      from private.hr_employee_wallet_ledger l
      where l.employee_id=v_uid
      order by l.created_at desc
      limit greatest(1,least(coalesce(p_ledger_limit,30),100))
    ) x),'[]'::jsonb)
  ) into v_wallet from private.hr_employee_wallet_accounts a where a.employee_id=v_uid;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_advances from (
    select sa.id,sa.principal_amount,sa.monthly_deduction,sa.outstanding_amount,sa.repayment_months,sa.status,sa.paid_at,sa.settled_at,sa.created_at
    from private.hr_salary_advances sa
    where sa.employee_id=v_uid and sa.outstanding_amount>0
    order by sa.created_at desc limit 10
  ) x;

  select to_jsonb(x) into v_latest_payroll from (
    select pi.id,pr.month,pr.year,pr.status,pr.period_start,pr.period_end,pr.paid_at,pi.base_salary,pi.gross_amount,pi.total_deductions,pi.net_amount,pi.attended_days,pi.absent_days,pi.advance_deduction
    from private.hr_payroll_items pi
    join private.hr_payroll_runs pr on pr.id=pi.run_id
    where pi.employee_id=v_uid
    order by pr.year desc,pr.month desc limit 1
  ) x;

  return jsonb_build_object(
    'wallet',v_wallet,
    'attendance',jsonb_build_object(
      'month_start',v_month_start,
      'through_date',v_through,
      'scheduled_days',v_scheduled,
      'attended_days',v_attended,
      'approved_leave_days',v_leave,
      'absent_days',v_absent,
      'late_days',v_late,
      'worked_minutes',v_worked
    ),
    'payroll',jsonb_build_object('next_pay_date',v_next_pay,'pay_day_of_month',v_pay_day,'latest',v_latest_payroll),
    'advances',v_advances,
    'generated_at',now()
  );
end;$function$;

revoke all on function public.get_my_employee_purchase_profile_v1(uuid,integer) from public,anon;
grant execute on function public.get_my_employee_purchase_profile_v1(uuid,integer) to authenticated,service_role;
