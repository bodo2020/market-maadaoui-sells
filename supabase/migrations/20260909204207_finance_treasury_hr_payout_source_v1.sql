-- Finance treasury source-of-funds foundation for HR payouts.
-- Applied live to marketpos as migration 20260909204207.

alter table private.hr_salary_advances
  add column if not exists payout_source_kind text,
  add column if not exists payout_cash_account_id uuid references public.cash_accounts(id) on delete restrict,
  add column if not exists payout_payment_account_id uuid references public.payment_accounts(id) on delete restrict,
  add column if not exists payout_account_name_snapshot text,
  add column if not exists payout_cash_ledger_id uuid references public.cash_ledger(id) on delete restrict,
  add column if not exists payout_payment_ledger_id uuid references public.payment_ledger(id) on delete restrict,
  add column if not exists paid_by uuid references public.users(id) on delete restrict,
  add column if not exists payout_note text,
  add column if not exists source_reconciled_by uuid references public.users(id) on delete restrict,
  add column if not exists source_reconciled_at timestamptz;

create index if not exists hr_salary_advances_payout_cash_account_idx on private.hr_salary_advances(payout_cash_account_id) where payout_cash_account_id is not null;
create index if not exists hr_salary_advances_payout_payment_account_idx on private.hr_salary_advances(payout_payment_account_id) where payout_payment_account_id is not null;
create index if not exists hr_salary_advances_payout_cash_ledger_idx on private.hr_salary_advances(payout_cash_ledger_id) where payout_cash_ledger_id is not null;
create index if not exists hr_salary_advances_payout_payment_ledger_idx on private.hr_salary_advances(payout_payment_ledger_id) where payout_payment_ledger_id is not null;
create index if not exists hr_salary_advances_paid_by_idx on private.hr_salary_advances(paid_by) where paid_by is not null;
create index if not exists hr_salary_advances_source_reconciled_by_idx on private.hr_salary_advances(source_reconciled_by) where source_reconciled_by is not null;

alter table private.hr_payroll_runs
  add column if not exists payment_source_kind text,
  add column if not exists payment_cash_account_id uuid references public.cash_accounts(id) on delete restrict,
  add column if not exists payment_payment_account_id uuid references public.payment_accounts(id) on delete restrict,
  add column if not exists payment_account_name_snapshot text,
  add column if not exists payment_cash_ledger_id uuid references public.cash_ledger(id) on delete restrict,
  add column if not exists payment_payment_ledger_id uuid references public.payment_ledger(id) on delete restrict;

create index if not exists hr_payroll_runs_payment_cash_account_idx on private.hr_payroll_runs(payment_cash_account_id) where payment_cash_account_id is not null;
create index if not exists hr_payroll_runs_payment_payment_account_idx on private.hr_payroll_runs(payment_payment_account_id) where payment_payment_account_id is not null;
create index if not exists hr_payroll_runs_payment_cash_ledger_idx on private.hr_payroll_runs(payment_cash_ledger_id) where payment_cash_ledger_id is not null;
create index if not exists hr_payroll_runs_payment_payment_ledger_idx on private.hr_payroll_runs(payment_payment_ledger_id) where payment_payment_ledger_id is not null;

create or replace function public.get_finance_payout_sources_v1(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED'; end if;
  if not (public.staff_has_permission('finance.manage',p_branch_id) or private.staff_is_super_admin(auth.uid())) then raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED'; end if;
  with sources as (
    select ca.id account_id,'branch_safe'::text source_kind,ca.name,ca.currency,ca.active,private.cash_account_balance(ca.id) balance
    from public.cash_accounts ca where ca.branch_id=p_branch_id and ca.account_type='branch_safe' and ca.active
    union all
    select pa.id,'bank',pa.name,pa.currency,pa.active,private.payment_account_balance(pa.id)
    from public.payment_accounts pa where pa.branch_id=p_branch_id and pa.account_type='bank' and pa.active
  )
  select coalesce(jsonb_agg(jsonb_build_object('account_id',account_id,'source_kind',source_kind,'name',name,'currency',currency,'active',active,'balance',round(balance,2)) order by case when source_kind='branch_safe' then 0 else 1 end,name),'[]'::jsonb) into v_items from sources;
  return jsonb_build_object('version',1,'branch_id',p_branch_id,'items',v_items,'generated_at',now());
end;$$;

create or replace function public.get_finance_treasury_workspace_v1(p_branch_id uuid,p_limit integer default 80)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer:=least(greatest(coalesce(p_limit,80),20),200);v_cash jsonb:='[]';v_payment jsonb:='[]';v_recent jsonb:='[]';v_unlinked jsonb:='[]';v_can_manage boolean:=false;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED'; end if;
  if not (public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id) or private.staff_is_super_admin(auth.uid())) then raise exception using errcode='42501',message='FINANCE_VIEW_DENIED'; end if;
  v_can_manage:=public.staff_has_permission('finance.manage',p_branch_id) or private.staff_is_super_admin(auth.uid());
  select coalesce(jsonb_agg(jsonb_build_object('account_id',ca.id,'account_type',ca.account_type,'name',ca.name,'currency',ca.currency,'active',ca.active,'balance',round(private.cash_account_balance(ca.id),2),'device_id',ca.device_id,'device_name',d.name,'open_shift_id',s.id,'cashier_id',s.user_id,'cashier_name',u.name,'last_movement_at',(select max(l.created_at) from public.cash_ledger l where l.account_id=ca.id)) order by case ca.account_type when 'branch_safe' then 0 when 'pos_drawer' then 1 else 2 end,ca.name),'[]'::jsonb) into v_cash from public.cash_accounts ca left join public.pos_devices d on d.id=ca.device_id left join lateral(select ps.id,ps.user_id from public.pos_shifts ps where ps.drawer_account_id=ca.id and ps.status='open' order by ps.opened_at desc limit 1)s on true left join public.users u on u.id=s.user_id where ca.branch_id=p_branch_id and (ca.active or abs(private.cash_account_balance(ca.id))>0.005);
  select coalesce(jsonb_agg(jsonb_build_object('account_id',pa.id,'account_type',pa.account_type,'provider_code',pa.provider_code,'name',pa.name,'currency',pa.currency,'active',pa.active,'balance',round(private.payment_account_balance(pa.id),2),'last_movement_at',(select max(l.created_at) from public.payment_ledger l where l.account_id=pa.id)) order by case pa.account_type when 'bank' then 0 else 1 end,pa.name),'[]'::jsonb) into v_payment from public.payment_accounts pa where pa.branch_id=p_branch_id and (pa.active or abs(private.payment_account_balance(pa.id))>0.005);
  select coalesce(jsonb_agg(jsonb_build_object('advance_id',a.id,'employee_id',a.employee_id,'employee_name',u.name,'amount',a.principal_amount,'outstanding_amount',a.outstanding_amount,'status',a.status,'paid_at',a.paid_at,'payout_reference',a.payout_reference,'source_status','unlinked') order by a.paid_at desc),'[]'::jsonb) into v_unlinked from private.hr_salary_advances a join public.users u on u.id=a.employee_id where a.branch_id=p_branch_id and a.paid_at is not null and a.payout_source_kind is null and a.status in ('active','settled');
  with movements as (select cl.id,'cash'::text ledger_kind,ca.id account_id,ca.account_type,ca.name account_name,cl.entry_type,cl.signed_amount,cl.description,cl.reference_type,cl.reference_id,cl.created_at,cl.created_by,u.name actor_name from public.cash_ledger cl join public.cash_accounts ca on ca.id=cl.account_id left join public.users u on u.id=cl.created_by where cl.branch_id=p_branch_id union all select pl.id,'payment',pa.id,pa.account_type,pa.name,pl.entry_type,pl.signed_amount,pl.description,'payment_ledger'::text,null::uuid,pl.created_at,pl.created_by,u.name from public.payment_ledger pl join public.payment_accounts pa on pa.id=pl.account_id left join public.users u on u.id=pl.created_by where pl.branch_id=p_branch_id),limited as(select * from movements order by created_at desc limit v_limit) select coalesce(jsonb_agg(jsonb_build_object('id',id,'ledger_kind',ledger_kind,'account_id',account_id,'account_type',account_type,'account_name',account_name,'entry_type',entry_type,'signed_amount',round(signed_amount,2),'description',description,'reference_type',reference_type,'reference_id',reference_id,'created_at',created_at,'created_by',created_by,'actor_name',actor_name) order by created_at desc),'[]'::jsonb) into v_recent from limited;
  return jsonb_build_object('version',1,'branch_id',p_branch_id,'permissions',jsonb_build_object('can_manage',v_can_manage),'cash_accounts',v_cash,'payment_accounts',v_payment,'unlinked_salary_advances',v_unlinked,'recent_movements',v_recent,'generated_at',now());
end;$$;

-- Compatibility safety: legacy payout/payment functions require the newer source-aware workflows.
create or replace function public.complete_hr_salary_advance_payout_v1(p_task_id uuid,p_note text,p_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$begin if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;raise exception using errcode='55000',message='HR_PAYOUT_SOURCE_REQUIRED';end;$$;
create or replace function public.mark_hr_payroll_paid_v2(p_run_id uuid,p_payment_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$begin if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;raise exception using errcode='55000',message='PAYROLL_PAYMENT_SOURCE_REQUIRED';end;$$;

revoke all on function public.get_finance_payout_sources_v1(uuid) from public,anon;
revoke all on function public.get_finance_treasury_workspace_v1(uuid,integer) from public,anon;
grant execute on function public.get_finance_payout_sources_v1(uuid) to authenticated;
grant execute on function public.get_finance_treasury_workspace_v1(uuid,integer) to authenticated;
