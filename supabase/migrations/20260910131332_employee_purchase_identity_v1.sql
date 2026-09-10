alter table private.hr_employee_wallet_accounts
  add column if not exists membership_number text,
  add column if not exists barcode_token text,
  add column if not exists points_balance bigint not null default 0,
  add column if not exists lifetime_points_earned bigint not null default 0,
  add column if not exists lifetime_points_reversed bigint not null default 0;

create unique index if not exists hr_employee_wallet_membership_uq on private.hr_employee_wallet_accounts(membership_number) where membership_number is not null;
create unique index if not exists hr_employee_wallet_barcode_uq on private.hr_employee_wallet_accounts(barcode_token) where barcode_token is not null;

create sequence if not exists private.hr_employee_card_seq start with 1 increment by 1;

create or replace function private.hr_employee_card_ean13(p_seq bigint)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare
  v_base text;
  v_sum integer:=0;
  v_i integer;
  v_digit integer;
  v_check integer;
begin
  if p_seq is null or p_seq < 1 or p_seq > 999999999 then
    raise exception using errcode='22023',message='EMPLOYEE_CARD_SEQUENCE_INVALID';
  end if;
  v_base:='297'||lpad(p_seq::text,9,'0');
  for v_i in 1..12 loop
    v_digit:=substr(v_base,v_i,1)::integer;
    v_sum:=v_sum+case when mod(v_i,2)=0 then v_digit*3 else v_digit end;
  end loop;
  v_check:=mod(10-mod(v_sum,10),10);
  return v_base||v_check::text;
end;
$$;

create or replace function private.hr_prepare_employee_wallet_identity_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_seq bigint;
begin
  if new.membership_number is null or new.barcode_token is null then
    v_seq:=nextval('private.hr_employee_card_seq'::regclass);
    if new.membership_number is null then new.membership_number:='EMP'||lpad(v_seq::text,8,'0'); end if;
    if new.barcode_token is null then new.barcode_token:=private.hr_employee_card_ean13(v_seq); end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hr_prepare_employee_wallet_identity_v1 on private.hr_employee_wallet_accounts;
create trigger trg_hr_prepare_employee_wallet_identity_v1
before insert on private.hr_employee_wallet_accounts
for each row execute function private.hr_prepare_employee_wallet_identity_v1();

with seqs as (
  select employee_id,nextval('private.hr_employee_card_seq'::regclass) as seq
  from private.hr_employee_wallet_accounts
  where membership_number is null or barcode_token is null
)
update private.hr_employee_wallet_accounts a
set membership_number=coalesce(a.membership_number,'EMP'||lpad(seqs.seq::text,8,'0')),
    barcode_token=coalesce(a.barcode_token,private.hr_employee_card_ean13(seqs.seq)),
    updated_at=now()
from seqs where seqs.employee_id=a.employee_id;

alter table private.hr_employee_wallet_ledger add column if not exists points_delta bigint not null default 0;
alter table private.hr_employee_wallet_ledger drop constraint if exists hr_employee_wallet_ledger_check;
alter table private.hr_employee_wallet_ledger add constraint hr_employee_wallet_ledger_check check (benefit_delta<>0 or receivable_delta<>0 or points_delta<>0);
alter table private.hr_employee_wallet_ledger drop constraint if exists hr_employee_wallet_ledger_entry_type_check;
alter table private.hr_employee_wallet_ledger add constraint hr_employee_wallet_ledger_entry_type_check check (entry_type in ('benefit_topup','employee_purchase','credit_payment','payroll_settlement','refund','adjustment','points_earn','points_reversal'));

alter table private.hr_payroll_policies add column if not exists pay_day_of_month smallint;
alter table private.hr_payroll_policies drop constraint if exists hr_payroll_policies_pay_day_check;
alter table private.hr_payroll_policies add constraint hr_payroll_policies_pay_day_check check (pay_day_of_month is null or pay_day_of_month between 1 and 31);

insert into public.pos_payment_methods(branch_id,code,name,method_type,active,sort_order,fee_type,fee_value,fee_bearer,require_reference,settlement_account_id,metadata)
select b.id,'employee_credit','آجل موظف','other',true,950,'none',0,'business',false,null,jsonb_build_object('system_kind','employee_credit','system_locked',true)
from public.branches b
on conflict(branch_id,code) do update set
  name=excluded.name,
  active=true,
  sort_order=excluded.sort_order,
  fee_type='none',
  fee_value=0,
  fee_bearer='business',
  require_reference=false,
  settlement_account_id=null,
  metadata=coalesce(public.pos_payment_methods.metadata,'{}'::jsonb)||excluded.metadata,
  updated_at=now();

create or replace function private.hr_ensure_employee_credit_method_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.pos_payment_methods(branch_id,code,name,method_type,active,sort_order,fee_type,fee_value,fee_bearer,require_reference,settlement_account_id,metadata)
  values(new.id,'employee_credit','آجل موظف','other',true,950,'none',0,'business',false,null,jsonb_build_object('system_kind','employee_credit','system_locked',true))
  on conflict(branch_id,code) do nothing;
  return new;
end;$$;

drop trigger if exists trg_hr_ensure_employee_credit_method_v1 on public.branches;
create trigger trg_hr_ensure_employee_credit_method_v1 after insert on public.branches for each row execute function private.hr_ensure_employee_credit_method_v1();

create or replace function public.lookup_employee_purchase_card_v1(p_code text,p_branch_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not private.staff_is_super_admin(v_uid) and not public.staff_has_permission('pos.use',p_branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  select jsonb_build_object(
    'employee_id',u.id,'name',u.name,'username',u.username,'employee_code',ep.employee_code,
    'membership_number',a.membership_number,'barcode_token',a.barcode_token,
    'points_balance',a.points_balance,'credit_limit',a.credit_limit,'receivable_balance',a.receivable_balance,
    'credit_available',greatest(a.credit_limit-a.receivable_balance,0),'credit_active',a.active,
    'payroll_deduction_enabled',a.payroll_deduction_enabled,'branch_id',a.branch_id
  ) into v_result
  from private.hr_employee_wallet_accounts a
  join public.users u on u.id=a.employee_id and coalesce(u.active,true)
  left join private.hr_employee_profiles ep on ep.user_id=u.id
  where (a.barcode_token=trim(coalesce(p_code,'')) or a.membership_number=trim(coalesce(p_code,'')))
    and a.active
    and (ep.primary_branch_id=p_branch_id or exists(select 1 from public.user_branch_roles ubr where ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active) or private.staff_is_super_admin(v_uid))
  limit 1;
  return v_result;
end;$$;

create or replace function public.get_my_employee_purchase_profile_v1(p_branch_id uuid default null,p_ledger_limit integer default 30)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid(); v_branch uuid; v_today date:=timezone('Africa/Cairo',now())::date; v_month_start date; v_pay_day integer; v_next_pay date;
  v_attended integer:=0; v_scheduled integer:=0; v_leave numeric:=0; v_absent numeric:=0; v_late integer:=0; v_worked integer:=0;
  v_wallet jsonb; v_advances jsonb; v_latest_payroll jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select coalesce(p_branch_id,ep.primary_branch_id) into v_branch from private.hr_employee_profiles ep where ep.user_id=v_uid;
  if v_branch is null then select ubr.branch_id into v_branch from public.user_branch_roles ubr where ubr.user_id=v_uid and ubr.active order by ubr.is_primary desc nulls last limit 1; end if;
  if v_branch is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not exists(select 1 from public.user_branch_roles ubr where ubr.user_id=v_uid and ubr.branch_id=v_branch and ubr.active)
     and not exists(select 1 from private.hr_employee_profiles ep where ep.user_id=v_uid and ep.primary_branch_id=v_branch)
     and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED'; end if;

  insert into private.hr_employee_wallet_accounts(employee_id,branch_id) values(v_uid,v_branch)
  on conflict(employee_id) do update set branch_id=coalesce(private.hr_employee_wallet_accounts.branch_id,excluded.branch_id);

  v_month_start:=date_trunc('month',v_today)::date;
  select count(distinct s.work_date)::int, count(distinct s.work_date) filter(where s.late_minutes>0)::int, coalesce(sum(s.worked_minutes),0)::int
  into v_attended,v_late,v_worked from private.hr_attendance_sessions s where s.user_id=v_uid and s.work_date between v_month_start and v_today;

  select count(*)::int into v_scheduled
  from generate_series(v_month_start::timestamp,v_today::timestamp,interval '1 day') g(day)
  where exists(select 1 from private.hr_employee_shift_assignments a where a.user_id=v_uid and a.branch_id=v_branch and a.active
    and g.day::date>=a.effective_from and (a.effective_to is null or g.day::date<=a.effective_to)
    and extract(dow from g.day)::smallint=any(a.weekdays));

  select coalesce(sum(case when lp.partial_day='none' then 1 else 0.5 end),0) into v_leave
  from generate_series(v_month_start::timestamp,v_today::timestamp,interval '1 day') g(day)
  join private.hr_leave_periods lp on lp.employee_id=v_uid and lp.branch_id=v_branch and lp.status='approved' and g.day::date between lp.start_date and lp.end_date
  where exists(select 1 from private.hr_employee_shift_assignments a where a.user_id=v_uid and a.branch_id=v_branch and a.active
    and g.day::date>=a.effective_from and (a.effective_to is null or g.day::date<=a.effective_to)
    and extract(dow from g.day)::smallint=any(a.weekdays));
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
      from private.hr_employee_wallet_ledger l where l.employee_id=v_uid order by l.created_at desc limit greatest(1,least(coalesce(p_ledger_limit,30),100))
    ) x),'[]'::jsonb)
  ) into v_wallet from private.hr_employee_wallet_accounts a where a.employee_id=v_uid;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_advances from (
    select sa.id,sa.principal_amount,sa.monthly_deduction,sa.outstanding_amount,sa.repayment_months,sa.status,sa.paid_at,sa.settled_at,sa.created_at
    from private.hr_salary_advances sa where sa.employee_id=v_uid and sa.outstanding_amount>0 order by sa.created_at desc limit 10
  ) x;

  select to_jsonb(x) into v_latest_payroll from (
    select pi.id,pr.month,pr.year,pr.status,pr.period_start,pr.period_end,pr.paid_at,pi.base_salary,pi.gross_amount,pi.total_deductions,pi.net_amount,pi.attended_days,pi.absent_days,pi.advance_deduction
    from private.hr_payroll_items pi join private.hr_payroll_runs pr on pr.id=pi.run_id where pi.employee_id=v_uid order by pr.year desc,pr.month desc limit 1
  ) x;

  return jsonb_build_object(
    'wallet',v_wallet,
    'attendance',jsonb_build_object('month_start',v_month_start,'through_date',v_today,'scheduled_days',v_scheduled,'attended_days',v_attended,'approved_leave_days',v_leave,'absent_days',v_absent,'late_days',v_late,'worked_minutes',v_worked),
    'payroll',jsonb_build_object('next_pay_date',v_next_pay,'pay_day_of_month',v_pay_day,'latest',v_latest_payroll),
    'advances',v_advances,
    'generated_at',now()
  );
end;$$;

revoke all on function public.lookup_employee_purchase_card_v1(text,uuid) from public,anon;
revoke all on function public.get_my_employee_purchase_profile_v1(uuid,integer) from public,anon;
grant execute on function public.lookup_employee_purchase_card_v1(text,uuid) to authenticated;
grant execute on function public.get_my_employee_purchase_profile_v1(uuid,integer) to authenticated;
