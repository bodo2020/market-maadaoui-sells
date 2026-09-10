create or replace function public.get_finance_control_center_v2(p_branch_id uuid, p_limit integer default 80)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit,80),20),200);
  v_treasury jsonb;
  v_advances jsonb := '[]'::jsonb;
  v_payroll jsonb := '[]'::jsonb;
  v_tasks jsonb := '[]'::jsonb;
  v_summary jsonb;
  v_branch_safe numeric := 0;
  v_drawers numeric := 0;
  v_online_cash numeric := 0;
  v_banks numeric := 0;
  v_clearing numeric := 0;
  v_active_advance numeric := 0;
  v_unlinked_advance numeric := 0;
  v_locked_payroll numeric := 0;
  v_pending_disbursement numeric := 0;
  v_in_transit numeric := 0;
  v_in_transit_count integer := 0;
  v_transfer_exceptions integer := 0;
  v_unlinked_count integer := 0;
  v_failed_tasks integer := 0;
begin
  if auth.uid() is null then raise exception using errcode='42501', message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(), p_branch_id) then raise exception using errcode='42501', message='FINANCE_BRANCH_ACCESS_DENIED'; end if;
  if not (public.staff_has_permission('finance.view', p_branch_id) or public.staff_has_permission('finance.manage', p_branch_id) or private.staff_is_super_admin(auth.uid())) then
    raise exception using errcode='42501', message='FINANCE_VIEW_DENIED';
  end if;

  v_treasury := public.get_finance_treasury_workspace_v2(p_branch_id, v_limit);

  select
    coalesce(sum(case when ca.account_type='branch_safe' then private.cash_account_balance(ca.id) else 0 end),0),
    coalesce(sum(case when ca.account_type='pos_drawer' then private.cash_account_balance(ca.id) else 0 end),0),
    coalesce(sum(case when ca.account_type='online_collection' then private.cash_account_balance(ca.id) else 0 end),0)
  into v_branch_safe, v_drawers, v_online_cash
  from public.cash_accounts ca
  where ca.branch_id=p_branch_id and (ca.active or abs(private.cash_account_balance(ca.id))>0.005);

  select
    coalesce(sum(case when pa.account_type='bank' then private.payment_account_balance(pa.id) else 0 end),0),
    coalesce(sum(case when pa.account_type='gateway_clearing' then private.payment_account_balance(pa.id) else 0 end),0)
  into v_banks, v_clearing
  from public.payment_accounts pa
  where pa.branch_id=p_branch_id and (pa.active or abs(private.payment_account_balance(pa.id))>0.005);

  select
    coalesce(sum(case when a.status='active' then a.outstanding_amount else 0 end),0),
    coalesce(sum(case when a.paid_at is not null and a.payout_source_kind is null then a.principal_amount else 0 end),0),
    count(*) filter (where a.paid_at is not null and a.payout_source_kind is null)
  into v_active_advance, v_unlinked_advance, v_unlinked_count
  from private.hr_salary_advances a where a.branch_id=p_branch_id;

  select coalesce(sum(r.total_net) filter (where r.status='locked'),0) into v_locked_payroll
  from private.hr_payroll_runs r where r.branch_id=p_branch_id;

  select
    coalesce(sum(coalesce(t.amount,0)) filter (where t.status in ('claimed','in_progress')),0),
    count(*) filter (where t.status='failed')
  into v_pending_disbursement, v_failed_tasks
  from public.operations_tasks t
  where t.branch_id=p_branch_id and t.source_kind in ('hr_treasury_payout','hr_treasury_payroll');

  select
    coalesce(sum(amount) filter (where status in ('awaiting_receiver','exception')),0),
    count(*) filter (where status in ('awaiting_receiver','exception')),
    count(*) filter (where status='exception')
  into v_in_transit, v_in_transit_count, v_transfer_exceptions
  from private.finance_transfers_v2 where branch_id=p_branch_id;

  select coalesce(jsonb_agg(x.obj order by x.sort_at desc),'[]'::jsonb) into v_advances
  from (
    select jsonb_build_object(
      'advance_id',a.id,'employee_id',a.employee_id,'employee_name',u.name,
      'principal_amount',round(a.principal_amount,2),'outstanding_amount',round(a.outstanding_amount,2),
      'monthly_deduction',round(a.monthly_deduction,2),'repayment_months',a.repayment_months,'status',a.status,
      'paid_at',a.paid_at,'payout_source_kind',a.payout_source_kind,'payout_account_name',a.payout_account_name_snapshot,
      'payout_responsible_user_id',a.payout_responsible_user_id,'payout_responsible_user_name',ru.name,
      'payout_reference',a.payout_reference,
      'source_status',case when a.paid_at is not null and a.payout_source_kind is null then 'unlinked' when a.payout_source_kind is not null then 'linked' else 'pending' end
    ) obj, coalesce(a.paid_at,a.created_at) sort_at
    from private.hr_salary_advances a join public.users u on u.id=a.employee_id
    left join public.users ru on ru.id=a.payout_responsible_user_id
    where a.branch_id=p_branch_id order by coalesce(a.paid_at,a.created_at) desc limit v_limit
  ) x;

  select coalesce(jsonb_agg(x.obj order by x.sort_at desc),'[]'::jsonb) into v_payroll
  from (
    select jsonb_build_object(
      'run_id',r.id,'month',r.month,'year',r.year,'status',r.status,'total_net',round(r.total_net,2),
      'total_deductions',round(r.total_deductions,2),'payment_source_kind',r.payment_source_kind,
      'payment_account_name',r.payment_account_name_snapshot,'payment_responsible_user_id',r.payment_responsible_user_id,
      'payment_responsible_user_name',ru.name,'payment_reference',r.payment_reference,
      'payment_requested_at',r.payment_requested_at,'paid_at',r.paid_at,
      'delegated_task_id',r.payment_delegated_task_id,'delegated_task_status',t.status
    ) obj, coalesce(r.paid_at,r.payment_requested_at,r.created_at) sort_at
    from private.hr_payroll_runs r left join public.users ru on ru.id=r.payment_responsible_user_id
    left join public.operations_tasks t on t.id=r.payment_delegated_task_id
    where r.branch_id=p_branch_id order by coalesce(r.paid_at,r.payment_requested_at,r.created_at) desc limit 24
  ) x;

  select coalesce(jsonb_agg(x.obj order by x.created_at desc),'[]'::jsonb) into v_tasks
  from (
    select jsonb_build_object(
      'task_id',t.id,'source_kind',t.source_kind,'source_id',t.source_id,'title',t.title,
      'amount',round(coalesce(t.amount,0),2),'status',t.status,'priority',t.priority,
      'responsible_user_id',t.claimed_by,'responsible_user_name',u.name,'created_at',t.created_at,
      'completed_at',t.completed_at,'failure_reason',t.failure_reason
    ) obj,t.created_at
    from public.operations_tasks t left join public.users u on u.id=t.claimed_by
    where t.branch_id=p_branch_id and t.source_kind in ('hr_treasury_payout','hr_treasury_payroll')
    order by t.created_at desc limit 50
  ) x;

  v_summary := jsonb_build_object(
    'branch_safe_balance',round(v_branch_safe,2),
    'cashier_drawers_balance',round(v_drawers,2),
    'online_cash_balance',round(v_online_cash,2),
    'bank_balance',round(v_banks,2),
    'gateway_clearing_balance',round(v_clearing,2),
    'operational_cash_total',round(v_branch_safe+v_drawers+v_online_cash,2),
    'liquid_funds_total',round(v_branch_safe+v_drawers+v_online_cash+v_banks,2),
    'in_transit_amount',round(v_in_transit,2),
    'in_transit_count',v_in_transit_count,
    'funds_under_custody_total',round(v_branch_safe+v_drawers+v_online_cash+v_banks+v_in_transit,2),
    'transfer_exception_count',v_transfer_exceptions,
    'active_salary_advance_outstanding',round(v_active_advance,2),
    'unlinked_salary_advance_amount',round(v_unlinked_advance,2),
    'unlinked_salary_advance_count',v_unlinked_count,
    'locked_payroll_amount',round(v_locked_payroll,2),
    'pending_treasury_disbursement_amount',round(v_pending_disbursement,2),
    'failed_treasury_tasks',v_failed_tasks,
    'attention_count',v_unlinked_count+v_failed_tasks+v_transfer_exceptions
  );

  return jsonb_build_object('version',3,'branch_id',p_branch_id,'summary',v_summary,'treasury',v_treasury,
    'salary_advances',v_advances,'payroll_runs',v_payroll,'treasury_tasks',v_tasks,'generated_at',now());
end;$$;

revoke all on function public.get_finance_control_center_v2(uuid,integer) from public,anon;
grant execute on function public.get_finance_control_center_v2(uuid,integer) to authenticated,service_role;
