create table if not exists private.hr_payroll_policies (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  salary_divisor_days numeric(8,2) not null default 30 check (salary_divisor_days > 0),
  standard_day_minutes integer not null default 480 check (standard_day_minutes between 60 and 1440),
  late_deduction_factor numeric(8,4) not null default 1 check (late_deduction_factor >= 0),
  early_deduction_factor numeric(8,4) not null default 1 check (early_deduction_factor >= 0),
  overtime_factor numeric(8,4) not null default 1.5 check (overtime_factor >= 0),
  auto_overtime_enabled boolean not null default false,
  auto_absence_deduction boolean not null default true,
  paid_leave_types text[] not null default array['annual','casual','sick']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.hr_compensation_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  pay_basis text not null default 'monthly' check (pay_basis in ('monthly')),
  base_salary numeric(14,2) not null check (base_salary >= 0),
  currency text not null default 'EGP',
  effective_from date not null default current_date,
  effective_to date,
  active boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create unique index if not exists hr_compensation_profiles_one_active_idx on private.hr_compensation_profiles(employee_id,branch_id) where active;
create index if not exists hr_compensation_profiles_period_idx on private.hr_compensation_profiles(branch_id,employee_id,effective_from,effective_to);

create table if not exists private.hr_payroll_runs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2020 and 2200),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','hr_review','finance_review','locked','paid','cancelled')),
  generated_by uuid references public.users(id),
  generated_at timestamptz not null default now(),
  submitted_by uuid references public.users(id),
  submitted_at timestamptz,
  hr_reviewed_by uuid references public.users(id),
  hr_reviewed_at timestamptz,
  hr_review_note text,
  finance_reviewed_by uuid references public.users(id),
  finance_reviewed_at timestamptz,
  finance_review_note text,
  locked_by uuid references public.users(id),
  locked_at timestamptz,
  paid_by uuid references public.users(id),
  paid_at timestamptz,
  payment_reference text,
  total_base numeric(16,2) not null default 0,
  total_earnings numeric(16,2) not null default 0,
  total_deductions numeric(16,2) not null default 0,
  total_net numeric(16,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(branch_id,month,year),
  check (period_end >= period_start)
);

create table if not exists private.hr_payroll_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references private.hr_payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.users(id) on delete restrict,
  compensation_profile_id uuid references private.hr_compensation_profiles(id),
  employee_name_snapshot text not null,
  employee_code_snapshot text,
  base_salary numeric(14,2) not null default 0,
  scheduled_days numeric(8,2) not null default 0,
  attended_days numeric(8,2) not null default 0,
  paid_leave_days numeric(8,2) not null default 0,
  unpaid_leave_days numeric(8,2) not null default 0,
  absent_days numeric(8,2) not null default 0,
  worked_minutes integer not null default 0,
  late_minutes integer not null default 0,
  early_departure_minutes integer not null default 0,
  overtime_candidate_minutes integer not null default 0,
  overtime_paid_minutes integer not null default 0,
  overtime_amount numeric(14,2) not null default 0,
  absence_deduction numeric(14,2) not null default 0,
  unpaid_leave_deduction numeric(14,2) not null default 0,
  late_deduction numeric(14,2) not null default 0,
  early_deduction numeric(14,2) not null default 0,
  advance_deduction numeric(14,2) not null default 0,
  manual_earnings numeric(14,2) not null default 0,
  manual_deductions numeric(14,2) not null default 0,
  gross_amount numeric(14,2) not null default 0,
  total_deductions numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null default 0,
  schedule_ready boolean not null default false,
  warnings text[] not null default '{}'::text[],
  calculation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id,employee_id)
);
create index if not exists hr_payroll_items_employee_idx on private.hr_payroll_items(employee_id,run_id);

create table if not exists private.hr_payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references private.hr_payroll_runs(id) on delete cascade,
  payroll_item_id uuid not null references private.hr_payroll_items(id) on delete cascade,
  adjustment_type text not null check (adjustment_type in ('earning','deduction')),
  code text not null,
  amount numeric(14,2) not null check (amount > 0),
  note text not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists hr_payroll_adjustments_item_idx on private.hr_payroll_adjustments(payroll_item_id);

create table if not exists private.hr_salary_advance_repayments (
  id uuid primary key default gen_random_uuid(),
  advance_id uuid not null references private.hr_salary_advances(id) on delete restrict,
  payroll_item_id uuid not null references private.hr_payroll_items(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique(advance_id,payroll_item_id)
);

alter table private.hr_payroll_policies enable row level security;
alter table private.hr_compensation_profiles enable row level security;
alter table private.hr_payroll_runs enable row level security;
alter table private.hr_payroll_items enable row level security;
alter table private.hr_payroll_adjustments enable row level security;
alter table private.hr_salary_advance_repayments enable row level security;
revoke all on table private.hr_payroll_policies, private.hr_compensation_profiles, private.hr_payroll_runs, private.hr_payroll_items, private.hr_payroll_adjustments, private.hr_salary_advance_repayments from anon, authenticated;

create or replace function private.hr_payroll_recalculate_item_v2(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item private.hr_payroll_items%rowtype;
  v_run private.hr_payroll_runs%rowtype;
  v_policy private.hr_payroll_policies%rowtype;
  v_manual_earn numeric:=0;
  v_manual_deduct numeric:=0;
  v_daily numeric:=0;
  v_minute numeric:=0;
  v_other_deduct numeric:=0;
  v_advance_requested numeric:=0;
  v_advance_allowed numeric:=0;
begin
  select * into v_item from private.hr_payroll_items where id=p_item_id for update;
  if v_item.id is null then return; end if;
  select * into v_run from private.hr_payroll_runs where id=v_item.run_id;
  select * into v_policy from private.hr_payroll_policies where branch_id=v_run.branch_id;
  if v_policy.branch_id is null then
    v_policy.branch_id:=v_run.branch_id; v_policy.salary_divisor_days:=30; v_policy.standard_day_minutes:=480;
    v_policy.late_deduction_factor:=1; v_policy.early_deduction_factor:=1; v_policy.overtime_factor:=1.5;
    v_policy.auto_overtime_enabled:=false; v_policy.auto_absence_deduction:=true; v_policy.paid_leave_types:=array['annual','casual','sick']::text[];
  end if;
  select coalesce(sum(amount) filter(where adjustment_type='earning'),0),coalesce(sum(amount) filter(where adjustment_type='deduction'),0)
    into v_manual_earn,v_manual_deduct from private.hr_payroll_adjustments where payroll_item_id=p_item_id;
  v_daily:=case when v_policy.salary_divisor_days>0 then v_item.base_salary/v_policy.salary_divisor_days else 0 end;
  v_minute:=case when v_policy.standard_day_minutes>0 then v_daily/v_policy.standard_day_minutes else 0 end;
  v_item.overtime_paid_minutes:=case when v_policy.auto_overtime_enabled then v_item.overtime_candidate_minutes else 0 end;
  v_item.overtime_amount:=round(v_item.overtime_paid_minutes*v_minute*v_policy.overtime_factor,2);
  v_item.absence_deduction:=case when v_item.schedule_ready and v_policy.auto_absence_deduction then round(v_item.absent_days*v_daily,2) else 0 end;
  v_item.unpaid_leave_deduction:=case when v_item.schedule_ready then round(v_item.unpaid_leave_days*v_daily,2) else 0 end;
  v_item.late_deduction:=round(v_item.late_minutes*v_minute*v_policy.late_deduction_factor,2);
  v_item.early_deduction:=round(v_item.early_departure_minutes*v_minute*v_policy.early_deduction_factor,2);
  select coalesce(sum(least(monthly_deduction,outstanding_amount)),0) into v_advance_requested
  from private.hr_salary_advances
  where employee_id=v_item.employee_id and branch_id=v_run.branch_id and status='active' and outstanding_amount>0;
  v_item.gross_amount:=round(v_item.base_salary+v_item.overtime_amount+v_manual_earn,2);
  v_other_deduct:=v_item.absence_deduction+v_item.unpaid_leave_deduction+v_item.late_deduction+v_item.early_deduction+v_manual_deduct;
  v_advance_allowed:=least(v_advance_requested,greatest(v_item.gross_amount-v_other_deduct,0));
  v_item.advance_deduction:=round(v_advance_allowed,2);
  v_item.manual_earnings:=round(v_manual_earn,2);
  v_item.manual_deductions:=round(v_manual_deduct,2);
  v_item.total_deductions:=round(v_other_deduct+v_item.advance_deduction,2);
  v_item.net_amount:=round(greatest(v_item.gross_amount-v_item.total_deductions,0),2);
  update private.hr_payroll_items set
    overtime_paid_minutes=v_item.overtime_paid_minutes,overtime_amount=v_item.overtime_amount,
    absence_deduction=v_item.absence_deduction,unpaid_leave_deduction=v_item.unpaid_leave_deduction,
    late_deduction=v_item.late_deduction,early_deduction=v_item.early_deduction,advance_deduction=v_item.advance_deduction,
    manual_earnings=v_item.manual_earnings,manual_deductions=v_item.manual_deductions,gross_amount=v_item.gross_amount,
    total_deductions=v_item.total_deductions,net_amount=v_item.net_amount,updated_at=now()
  where id=p_item_id;
end;
$$;

create or replace function private.hr_payroll_refresh_totals_v2(p_run_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update private.hr_payroll_runs r set
    total_base=coalesce(x.base,0),total_earnings=coalesce(x.earn,0),total_deductions=coalesce(x.deduct,0),total_net=coalesce(x.net,0),updated_at=now()
  from (select run_id,sum(base_salary) base,sum(gross_amount-base_salary) earn,sum(total_deductions) deduct,sum(net_amount) net from private.hr_payroll_items where run_id=p_run_id group by run_id)x
  where r.id=p_run_id and r.id=x.run_id;
  update private.hr_payroll_runs set total_base=0,total_earnings=0,total_deductions=0,total_net=0,updated_at=now()
  where id=p_run_id and not exists(select 1 from private.hr_payroll_items where run_id=p_run_id);
end;$$;

create or replace function public.get_hr_compensation_directory_v1(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='HR_BRANCH_ACCESS_DENIED'; end if;
 if not (public.staff_has_permission('hr.view',p_branch_id) or public.staff_has_permission('finance.view',p_branch_id)) then raise exception using errcode='42501',message='PAYROLL_VIEW_DENIED'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('employee_id',u.id,'employee_name',u.name,'employee_code',ep.employee_code,'employment_status',ep.employment_status,'contract_type',ep.contract_type,'compensation_profile_id',cp.id,'base_salary',cp.base_salary,'currency',coalesce(cp.currency,'EGP'),'effective_from',cp.effective_from,'effective_to',cp.effective_to,'configured',cp.id is not null) order by u.name),'[]'::jsonb) into v_items
 from private.hr_employee_profiles ep join public.users u on u.id=ep.user_id
 left join lateral(select c.* from private.hr_compensation_profiles c where c.employee_id=ep.user_id and c.branch_id=p_branch_id and c.active order by c.effective_from desc limit 1)cp on true
 where ep.primary_branch_id=p_branch_id and ep.employment_status in ('active','leave') and coalesce(u.active,true);
 return jsonb_build_object('branch_id',p_branch_id,'items',v_items);
end;$$;

create or replace function public.save_hr_compensation_profile_v1(p_employee_id uuid,p_branch_id uuid,p_base_salary numeric,p_effective_from date default current_date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_existing private.hr_compensation_profiles%rowtype; v_new private.hr_compensation_profiles%rowtype;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='HR_BRANCH_ACCESS_DENIED'; end if;
 if not public.staff_has_permission('hr.manage_employees',p_branch_id) then raise exception using errcode='42501',message='PAYROLL_COMPENSATION_DENIED'; end if;
 if p_base_salary is null or p_base_salary<0 then raise exception using errcode='22023',message='INVALID_BASE_SALARY'; end if;
 if not exists(select 1 from private.hr_employee_profiles where user_id=p_employee_id and primary_branch_id=p_branch_id and employment_status in ('active','leave')) then raise exception using errcode='22023',message='HR_EMPLOYEE_NOT_FOUND'; end if;
 select * into v_existing from private.hr_compensation_profiles where employee_id=p_employee_id and branch_id=p_branch_id and active for update;
 if v_existing.id is not null and v_existing.effective_from=coalesce(p_effective_from,current_date) then
   update private.hr_compensation_profiles set base_salary=round(p_base_salary,2),updated_at=now() where id=v_existing.id returning * into v_new;
 else
   if v_existing.id is not null then update private.hr_compensation_profiles set active=false,effective_to=greatest(v_existing.effective_from,coalesce(p_effective_from,current_date)-1),updated_at=now() where id=v_existing.id; end if;
   insert into private.hr_compensation_profiles(employee_id,branch_id,base_salary,effective_from,created_by) values(p_employee_id,p_branch_id,round(p_base_salary,2),coalesce(p_effective_from,current_date),auth.uid()) returning * into v_new;
 end if;
 insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data) values('compensation_profile',v_new.id,'save',auth.uid(),p_branch_id,to_jsonb(v_new));
 return jsonb_build_object('ok',true,'profile',to_jsonb(v_new));
end;$$;

create or replace function public.get_hr_payroll_workspace_v2(p_branch_id uuid,p_month integer,p_year integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_run private.hr_payroll_runs%rowtype; v_items jsonb; v_policy jsonb; v_comp jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='HR_BRANCH_ACCESS_DENIED'; end if;
 if not (public.staff_has_permission('hr.view',p_branch_id) or public.staff_has_permission('finance.view',p_branch_id)) then raise exception using errcode='42501',message='PAYROLL_VIEW_DENIED'; end if;
 if p_month not between 1 and 12 or p_year not between 2020 and 2200 then raise exception using errcode='22023',message='INVALID_PAYROLL_PERIOD'; end if;
 select * into v_run from private.hr_payroll_runs where branch_id=p_branch_id and month=p_month and year=p_year;
 if v_run.id is not null then
   select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'employee_id',i.employee_id,'employee_name',i.employee_name_snapshot,'employee_code',i.employee_code_snapshot,'base_salary',i.base_salary,'scheduled_days',i.scheduled_days,'attended_days',i.attended_days,'paid_leave_days',i.paid_leave_days,'unpaid_leave_days',i.unpaid_leave_days,'absent_days',i.absent_days,'worked_minutes',i.worked_minutes,'late_minutes',i.late_minutes,'early_departure_minutes',i.early_departure_minutes,'overtime_candidate_minutes',i.overtime_candidate_minutes,'overtime_paid_minutes',i.overtime_paid_minutes,'overtime_amount',i.overtime_amount,'absence_deduction',i.absence_deduction,'unpaid_leave_deduction',i.unpaid_leave_deduction,'late_deduction',i.late_deduction,'early_deduction',i.early_deduction,'advance_deduction',i.advance_deduction,'manual_earnings',i.manual_earnings,'manual_deductions',i.manual_deductions,'gross_amount',i.gross_amount,'total_deductions',i.total_deductions,'net_amount',i.net_amount,'schedule_ready',i.schedule_ready,'warnings',i.warnings,'calculation',i.calculation) order by i.employee_name_snapshot),'[]'::jsonb) into v_items from private.hr_payroll_items i where i.run_id=v_run.id;
 else v_items:='[]'::jsonb; end if;
 select to_jsonb(p) into v_policy from private.hr_payroll_policies p where p.branch_id=p_branch_id;
 select public.get_hr_compensation_directory_v1(p_branch_id) into v_comp;
 return jsonb_build_object('version',2,'branch_id',p_branch_id,'month',p_month,'year',p_year,'run',case when v_run.id is null then null else to_jsonb(v_run) end,'items',v_items,'policy',coalesce(v_policy,jsonb_build_object('salary_divisor_days',30,'standard_day_minutes',480,'late_deduction_factor',1,'early_deduction_factor',1,'overtime_factor',1.5,'auto_overtime_enabled',false,'auto_absence_deduction',true,'paid_leave_types',array['annual','casual','sick'])),'compensation',v_comp,'generated_at',now());
end;$$;

create or replace function public.generate_hr_payroll_run_v2(p_branch_id uuid,p_month integer,p_year integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_start date; v_end date; v_run private.hr_payroll_runs%rowtype; v_policy private.hr_payroll_policies%rowtype; r record; v_comp private.hr_compensation_profiles%rowtype;
 v_schedule_ready boolean; v_scheduled numeric:=0; v_attended numeric:=0; v_attended_scheduled numeric:=0; v_paid_leave numeric:=0; v_unpaid_leave numeric:=0; v_absent numeric:=0;
 v_worked integer:=0; v_late integer:=0; v_early integer:=0; v_ot integer:=0; v_item_id uuid; v_warn text[];
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='HR_BRANCH_ACCESS_DENIED'; end if;
 if not public.staff_has_permission('hr.manage_employees',p_branch_id) then raise exception using errcode='42501',message='PAYROLL_GENERATE_DENIED'; end if;
 if p_month not between 1 and 12 or p_year not between 2020 and 2200 then raise exception using errcode='22023',message='INVALID_PAYROLL_PERIOD'; end if;
 v_start:=make_date(p_year,p_month,1); v_end:=(v_start+interval '1 month - 1 day')::date;
 insert into private.hr_payroll_policies(branch_id) values(p_branch_id) on conflict(branch_id) do nothing;
 select * into v_policy from private.hr_payroll_policies where branch_id=p_branch_id;
 select * into v_run from private.hr_payroll_runs where branch_id=p_branch_id and month=p_month and year=p_year for update;
 if v_run.id is null then insert into private.hr_payroll_runs(branch_id,month,year,period_start,period_end,status,generated_by) values(p_branch_id,p_month,p_year,v_start,v_end,'draft',auth.uid()) returning * into v_run;
 elsif v_run.status<>'draft' then raise exception using errcode='55000',message='PAYROLL_RUN_NOT_EDITABLE';
 else update private.hr_payroll_runs set generated_by=auth.uid(),generated_at=now(),updated_at=now() where id=v_run.id returning * into v_run; end if;
 delete from private.hr_payroll_adjustments where run_id=v_run.id;
 delete from private.hr_payroll_items where run_id=v_run.id;
 for r in select ep.*,u.name from private.hr_employee_profiles ep join public.users u on u.id=ep.user_id where ep.primary_branch_id=p_branch_id and ep.employment_status in ('active','leave') and coalesce(u.active,true) and coalesce(ep.hire_date,v_start)<=v_end and coalesce(ep.termination_date,v_end)>=v_start order by u.name loop
   select * into v_comp from private.hr_compensation_profiles c where c.employee_id=r.user_id and c.branch_id=p_branch_id and c.effective_from<=v_end and (c.effective_to is null or c.effective_to>=v_start) order by c.effective_from desc limit 1;
   v_schedule_ready:=exists(select 1 from private.hr_employee_shift_assignments a where a.user_id=r.user_id and a.branch_id=p_branch_id and a.active and a.effective_from<=v_end and (a.effective_to is null or a.effective_to>=v_start));
   select count(*)::numeric into v_scheduled from generate_series(v_start,v_end,interval '1 day') g(d) where v_schedule_ready and g.d::date>=coalesce(r.hire_date,v_start) and g.d::date<=coalesce(r.termination_date,v_end) and exists(select 1 from private.hr_employee_shift_assignments a where a.user_id=r.user_id and a.branch_id=p_branch_id and a.active and a.effective_from<=g.d::date and (a.effective_to is null or a.effective_to>=g.d::date) and extract(dow from g.d)::smallint=any(a.weekdays));
   select count(distinct s.work_date)::numeric,coalesce(sum(s.worked_minutes),0)::int,coalesce(sum(s.late_minutes),0)::int,coalesce(sum(s.early_departure_minutes),0)::int,coalesce(sum(case when s.check_out_at is not null and s.scheduled_end_at is not null and s.check_out_at>s.scheduled_end_at then floor(extract(epoch from (s.check_out_at-s.scheduled_end_at))/60) else 0 end),0)::int into v_attended,v_worked,v_late,v_early,v_ot from private.hr_attendance_sessions s where s.user_id=r.user_id and s.branch_id=p_branch_id and s.work_date between v_start and v_end and s.status<>'cancelled';
   select count(distinct s.work_date)::numeric into v_attended_scheduled from private.hr_attendance_sessions s where s.user_id=r.user_id and s.branch_id=p_branch_id and s.work_date between v_start and v_end and s.status<>'cancelled' and v_schedule_ready and exists(select 1 from private.hr_employee_shift_assignments a where a.user_id=r.user_id and a.branch_id=p_branch_id and a.active and a.effective_from<=s.work_date and (a.effective_to is null or a.effective_to>=s.work_date) and extract(dow from s.work_date)::smallint=any(a.weekdays));
   select coalesce(sum(case when lp.partial_day='none' then 1 else .5 end),0)::numeric into v_paid_leave from private.hr_leave_periods lp cross join lateral generate_series(greatest(lp.start_date,v_start),least(lp.end_date,v_end),interval '1 day') d(dt) where lp.employee_id=r.user_id and lp.branch_id=p_branch_id and lp.status='approved' and lp.leave_type=any(v_policy.paid_leave_types) and (not v_schedule_ready or exists(select 1 from private.hr_employee_shift_assignments a where a.user_id=r.user_id and a.branch_id=p_branch_id and a.active and a.effective_from<=d.dt::date and (a.effective_to is null or a.effective_to>=d.dt::date) and extract(dow from d.dt)::smallint=any(a.weekdays)));
   select coalesce(sum(case when lp.partial_day='none' then 1 else .5 end),0)::numeric into v_unpaid_leave from private.hr_leave_periods lp cross join lateral generate_series(greatest(lp.start_date,v_start),least(lp.end_date,v_end),interval '1 day') d(dt) where lp.employee_id=r.user_id and lp.branch_id=p_branch_id and lp.status='approved' and not (lp.leave_type=any(v_policy.paid_leave_types)) and (not v_schedule_ready or exists(select 1 from private.hr_employee_shift_assignments a where a.user_id=r.user_id and a.branch_id=p_branch_id and a.active and a.effective_from<=d.dt::date and (a.effective_to is null or a.effective_to>=d.dt::date) and extract(dow from d.dt)::smallint=any(a.weekdays)));
   v_absent:=case when v_schedule_ready then greatest(v_scheduled-v_attended_scheduled-v_paid_leave-v_unpaid_leave,0) else 0 end;
   v_warn:='{}'::text[]; if v_comp.id is null then v_warn:=array_append(v_warn,'COMPENSATION_MISSING'); end if; if not v_schedule_ready then v_warn:=array_append(v_warn,'SCHEDULE_MISSING_NO_ABSENCE_DEDUCTION'); end if;
   insert into private.hr_payroll_items(run_id,employee_id,compensation_profile_id,employee_name_snapshot,employee_code_snapshot,base_salary,scheduled_days,attended_days,paid_leave_days,unpaid_leave_days,absent_days,worked_minutes,late_minutes,early_departure_minutes,overtime_candidate_minutes,schedule_ready,warnings,calculation)
   values(v_run.id,r.user_id,v_comp.id,r.name,r.employee_code,coalesce(v_comp.base_salary,0),v_scheduled,v_attended,v_paid_leave,v_unpaid_leave,v_absent,v_worked,v_late,v_early,v_ot,v_schedule_ready,v_warn,jsonb_build_object('period_start',v_start,'period_end',v_end,'policy',to_jsonb(v_policy))) returning id into v_item_id;
   perform private.hr_payroll_recalculate_item_v2(v_item_id);
 end loop;
 perform private.hr_payroll_refresh_totals_v2(v_run.id);
 insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data) values('payroll_run',v_run.id,'generate',auth.uid(),p_branch_id,jsonb_build_object('month',p_month,'year',p_year));
 return public.get_hr_payroll_workspace_v2(p_branch_id,p_month,p_year);
end;$$;

create or replace function public.add_hr_payroll_adjustment_v2(p_payroll_item_id uuid,p_adjustment_type text,p_code text,p_amount numeric,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_item private.hr_payroll_items%rowtype; v_run private.hr_payroll_runs%rowtype; v_id uuid;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select * into v_item from private.hr_payroll_items where id=p_payroll_item_id; if v_item.id is null then raise exception using errcode='22023',message='PAYROLL_ITEM_NOT_FOUND'; end if;
 select * into v_run from private.hr_payroll_runs where id=v_item.run_id for update;
 if v_run.status<>'draft' then raise exception using errcode='55000',message='PAYROLL_RUN_NOT_EDITABLE'; end if;
 if not public.staff_has_permission('hr.manage_employees',v_run.branch_id) then raise exception using errcode='42501',message='PAYROLL_ADJUSTMENT_DENIED'; end if;
 if p_adjustment_type not in ('earning','deduction') or p_amount is null or p_amount<=0 or length(trim(coalesce(p_note,'')))<3 then raise exception using errcode='22023',message='INVALID_PAYROLL_ADJUSTMENT'; end if;
 insert into private.hr_payroll_adjustments(run_id,payroll_item_id,adjustment_type,code,amount,note,created_by) values(v_run.id,v_item.id,p_adjustment_type,coalesce(nullif(trim(p_code),''),'manual'),round(p_amount,2),trim(p_note),auth.uid()) returning id into v_id;
 perform private.hr_payroll_recalculate_item_v2(v_item.id); perform private.hr_payroll_refresh_totals_v2(v_run.id);
 return jsonb_build_object('ok',true,'adjustment_id',v_id);
end;$$;

create or replace function public.submit_hr_payroll_for_review_v2(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run private.hr_payroll_runs%rowtype;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select * into v_run from private.hr_payroll_runs where id=p_run_id for update; if v_run.id is null then raise exception using errcode='22023',message='PAYROLL_RUN_NOT_FOUND'; end if;
 if not public.staff_has_permission('hr.manage_employees',v_run.branch_id) then raise exception using errcode='42501',message='PAYROLL_SUBMIT_DENIED'; end if;
 if v_run.status<>'draft' then raise exception using errcode='55000',message='PAYROLL_RUN_NOT_DRAFT'; end if;
 if exists(select 1 from private.hr_payroll_items where run_id=v_run.id and compensation_profile_id is null) then raise exception using errcode='55000',message='PAYROLL_COMPENSATION_INCOMPLETE'; end if;
 update private.hr_payroll_runs set status='hr_review',submitted_by=auth.uid(),submitted_at=now(),hr_reviewed_by=null,hr_reviewed_at=null,hr_review_note=null,finance_reviewed_by=null,finance_reviewed_at=null,finance_review_note=null,updated_at=now() where id=v_run.id returning * into v_run;
 insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data) values('payroll_run',v_run.id,'submit_hr_review',auth.uid(),v_run.branch_id,to_jsonb(v_run));
 return jsonb_build_object('ok',true,'run',to_jsonb(v_run));
end;$$;

create or replace function public.decide_hr_payroll_v2(p_run_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run private.hr_payroll_runs%rowtype;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select * into v_run from private.hr_payroll_runs where id=p_run_id for update; if v_run.id is null then raise exception using errcode='22023',message='PAYROLL_RUN_NOT_FOUND'; end if;
 if not public.staff_has_permission('hr.manage_employees',v_run.branch_id) then raise exception using errcode='42501',message='PAYROLL_HR_REVIEW_DENIED'; end if;
 if v_run.status<>'hr_review' then raise exception using errcode='55000',message='PAYROLL_NOT_IN_HR_REVIEW'; end if;
 if p_decision not in ('approved','rejected') then raise exception using errcode='22023',message='INVALID_PAYROLL_DECISION'; end if;
 if p_decision='rejected' and length(trim(coalesce(p_note,'')))<3 then raise exception using errcode='22023',message='PAYROLL_REJECTION_NOTE_REQUIRED'; end if;
 update private.hr_payroll_runs set status=case when p_decision='approved' then 'finance_review' else 'draft' end,hr_reviewed_by=auth.uid(),hr_reviewed_at=now(),hr_review_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now() where id=v_run.id returning * into v_run;
 insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data) values('payroll_run',v_run.id,'hr_'||p_decision,auth.uid(),v_run.branch_id,to_jsonb(v_run));
 return jsonb_build_object('ok',true,'run',to_jsonb(v_run));
end;$$;

create or replace function public.decide_finance_payroll_v2(p_run_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run private.hr_payroll_runs%rowtype; i record; v_legacy public.salaries%rowtype;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select * into v_run from private.hr_payroll_runs where id=p_run_id for update; if v_run.id is null then raise exception using errcode='22023',message='PAYROLL_RUN_NOT_FOUND'; end if;
 if not public.staff_has_permission('finance.manage',v_run.branch_id) then raise exception using errcode='42501',message='PAYROLL_FINANCE_REVIEW_DENIED'; end if;
 if v_run.status<>'finance_review' then raise exception using errcode='55000',message='PAYROLL_NOT_IN_FINANCE_REVIEW'; end if;
 if p_decision not in ('approved','rejected') then raise exception using errcode='22023',message='INVALID_PAYROLL_DECISION'; end if;
 if p_decision='rejected' and length(trim(coalesce(p_note,'')))<3 then raise exception using errcode='22023',message='PAYROLL_REJECTION_NOTE_REQUIRED'; end if;
 if p_decision='rejected' then
   update private.hr_payroll_runs set status='draft',finance_reviewed_by=auth.uid(),finance_reviewed_at=now(),finance_review_note=trim(p_note),updated_at=now() where id=v_run.id returning * into v_run;
 else
   for i in select * from private.hr_payroll_items where run_id=v_run.id loop
     select * into v_legacy from public.salaries where employee_id=i.employee_id and month=v_run.month and year=v_run.year for update;
     if v_legacy.id is not null and coalesce(v_legacy.notes,'') not like 'Payroll V2 run:%' then raise exception using errcode='55000',message='LEGACY_SALARY_CONFLICT'; end if;
     insert into public.salaries(employee_id,amount,month,year,status,notes,created_by,branch_id)
     values(i.employee_id,i.net_amount,v_run.month,v_run.year,'pending','Payroll V2 run:'||v_run.id::text,auth.uid(),v_run.branch_id)
     on conflict(employee_id,month,year) do update set amount=excluded.amount,status='pending',payment_date=null,notes=excluded.notes,branch_id=excluded.branch_id,updated_at=now();
   end loop;
   update private.hr_payroll_runs set status='locked',finance_reviewed_by=auth.uid(),finance_reviewed_at=now(),finance_review_note=nullif(trim(coalesce(p_note,'')),''),locked_by=auth.uid(),locked_at=now(),updated_at=now() where id=v_run.id returning * into v_run;
 end if;
 insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data) values('payroll_run',v_run.id,'finance_'||p_decision,auth.uid(),v_run.branch_id,to_jsonb(v_run));
 return jsonb_build_object('ok',true,'run',to_jsonb(v_run));
end;$$;

create or replace function public.mark_hr_payroll_paid_v2(p_run_id uuid,p_payment_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run private.hr_payroll_runs%rowtype; i record; a record; v_remaining numeric; v_take numeric;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select * into v_run from private.hr_payroll_runs where id=p_run_id for update; if v_run.id is null then raise exception using errcode='22023',message='PAYROLL_RUN_NOT_FOUND'; end if;
 if v_run.status='paid' then return jsonb_build_object('ok',true,'idempotent',true,'run',to_jsonb(v_run)); end if;
 if not public.staff_has_permission('finance.manage',v_run.branch_id) then raise exception using errcode='42501',message='PAYROLL_PAYMENT_DENIED'; end if;
 if v_run.status<>'locked' then raise exception using errcode='55000',message='PAYROLL_NOT_LOCKED'; end if;
 if length(trim(coalesce(p_payment_reference,'')))<2 then raise exception using errcode='22023',message='PAYROLL_PAYMENT_REFERENCE_REQUIRED'; end if;
 for i in select * from private.hr_payroll_items where run_id=v_run.id order by employee_name_snapshot loop
   update public.salaries set amount=i.net_amount,status='paid',payment_date=current_date,notes='Payroll V2 run:'||v_run.id::text||' | Ref:'||trim(p_payment_reference),updated_at=now() where employee_id=i.employee_id and month=v_run.month and year=v_run.year and notes like 'Payroll V2 run:%';
   v_remaining:=i.advance_deduction;
   if v_remaining>0 then
     for a in select * from private.hr_salary_advances where employee_id=i.employee_id and branch_id=v_run.branch_id and status='active' and outstanding_amount>0 order by paid_at nulls last,created_at for update loop
       exit when v_remaining<=0;
       v_take:=least(v_remaining,a.monthly_deduction,a.outstanding_amount);
       if v_take>0 then
         insert into private.hr_salary_advance_repayments(advance_id,payroll_item_id,amount,created_by) values(a.id,i.id,v_take,auth.uid()) on conflict(advance_id,payroll_item_id) do nothing;
         update private.hr_salary_advances set outstanding_amount=greatest(outstanding_amount-v_take,0),status=case when outstanding_amount-v_take<=0 then 'settled' else 'active' end,settled_at=case when outstanding_amount-v_take<=0 then now() else settled_at end,updated_at=now() where id=a.id;
         v_remaining:=v_remaining-v_take;
       end if;
     end loop;
   end if;
 end loop;
 update private.hr_payroll_runs set status='paid',paid_by=auth.uid(),paid_at=now(),payment_reference=trim(p_payment_reference),updated_at=now() where id=v_run.id returning * into v_run;
 insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data) values('payroll_run',v_run.id,'paid',auth.uid(),v_run.branch_id,to_jsonb(v_run));
 return jsonb_build_object('ok',true,'idempotent',false,'run',to_jsonb(v_run));
end;$$;

revoke all on function public.get_hr_compensation_directory_v1(uuid) from public,anon;
revoke all on function public.save_hr_compensation_profile_v1(uuid,uuid,numeric,date) from public,anon;
revoke all on function public.get_hr_payroll_workspace_v2(uuid,integer,integer) from public,anon;
revoke all on function public.generate_hr_payroll_run_v2(uuid,integer,integer) from public,anon;
revoke all on function public.add_hr_payroll_adjustment_v2(uuid,text,text,numeric,text) from public,anon;
revoke all on function public.submit_hr_payroll_for_review_v2(uuid) from public,anon;
revoke all on function public.decide_hr_payroll_v2(uuid,text,text) from public,anon;
revoke all on function public.decide_finance_payroll_v2(uuid,text,text) from public,anon;
revoke all on function public.mark_hr_payroll_paid_v2(uuid,text) from public,anon;
grant execute on function public.get_hr_compensation_directory_v1(uuid) to authenticated;
grant execute on function public.save_hr_compensation_profile_v1(uuid,uuid,numeric,date) to authenticated;
grant execute on function public.get_hr_payroll_workspace_v2(uuid,integer,integer) to authenticated;
grant execute on function public.generate_hr_payroll_run_v2(uuid,integer,integer) to authenticated;
grant execute on function public.add_hr_payroll_adjustment_v2(uuid,text,text,numeric,text) to authenticated;
grant execute on function public.submit_hr_payroll_for_review_v2(uuid) to authenticated;
grant execute on function public.decide_hr_payroll_v2(uuid,text,text) to authenticated;
grant execute on function public.decide_finance_payroll_v2(uuid,text,text) to authenticated;
grant execute on function public.mark_hr_payroll_paid_v2(uuid,text) to authenticated;
