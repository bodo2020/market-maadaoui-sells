create table if not exists private.customer_receivable_accounts_v1 (
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  balance numeric(14,2) not null default 0 check (balance >= 0),
  credit_limit numeric(14,2) null check (credit_limit is null or credit_limit >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (branch_id, customer_id)
);

create table if not exists private.customer_receivable_ledger_v1 (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  entry_type text not null check (entry_type in ('charge','payment','adjustment_increase','adjustment_decrease','writeoff')),
  signed_amount numeric(14,2) not null check (signed_amount <> 0),
  description text,
  reference_kind text,
  reference_id uuid,
  idempotency_key text not null unique,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_receivable_accounts_branch_balance_idx on private.customer_receivable_accounts_v1(branch_id, balance desc) where active and balance > 0;
create index if not exists customer_receivable_ledger_branch_created_idx on private.customer_receivable_ledger_v1(branch_id, created_at desc);
create index if not exists customer_receivable_ledger_customer_created_idx on private.customer_receivable_ledger_v1(customer_id, created_at desc);

grant select on private.customer_receivable_accounts_v1 to service_role;
grant select on private.customer_receivable_ledger_v1 to service_role;
revoke all on private.customer_receivable_accounts_v1 from anon, authenticated;
revoke all on private.customer_receivable_ledger_v1 from anon, authenticated;

create or replace function public.post_customer_receivable_v1(p_branch_id uuid,p_customer_id uuid,p_entry_type text,p_amount numeric,p_description text,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid();v_signed numeric(14,2);v_account private.customer_receivable_accounts_v1%rowtype;v_entry_id uuid;
begin
 if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 if p_branch_id is null or not public.has_branch_access(v_uid,p_branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED';end if;
 if not (private.staff_is_super_admin(v_uid) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='DEBT_MANAGE_DENIED';end if;
 if p_entry_type not in ('charge','payment','adjustment_increase','adjustment_decrease','writeoff') then raise exception using errcode='22023',message='INVALID_DEBT_ENTRY_TYPE';end if;
 if p_amount is null or p_amount<=0 then raise exception using errcode='22023',message='INVALID_DEBT_AMOUNT';end if;
 if char_length(trim(coalesce(p_description,'')))<3 then raise exception using errcode='22023',message='DEBT_DESCRIPTION_REQUIRED';end if;
 if char_length(trim(coalesce(p_idempotency_key,'')))<8 then raise exception using errcode='22023',message='IDEMPOTENCY_REQUIRED';end if;
 if not exists(select 1 from public.customers c where c.id=p_customer_id) then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND';end if;
 if exists(select 1 from private.customer_receivable_ledger_v1 l where l.idempotency_key=p_idempotency_key) then select * into v_account from private.customer_receivable_accounts_v1 where branch_id=p_branch_id and customer_id=p_customer_id;return jsonb_build_object('ok',true,'idempotent',true,'balance',coalesce(v_account.balance,0));end if;
 v_signed:=case when p_entry_type in ('charge','adjustment_increase') then round(p_amount,2) else -round(p_amount,2) end;
 insert into private.customer_receivable_accounts_v1(branch_id,customer_id) values(p_branch_id,p_customer_id) on conflict(branch_id,customer_id) do nothing;
 select * into v_account from private.customer_receivable_accounts_v1 where branch_id=p_branch_id and customer_id=p_customer_id for update;
 if v_account.balance+v_signed<0 then raise exception using errcode='23514',message='DEBT_BALANCE_CANNOT_BE_NEGATIVE';end if;
 if v_account.credit_limit is not null and v_account.credit_limit>0 and v_account.balance+v_signed>v_account.credit_limit then raise exception using errcode='23514',message='CUSTOMER_CREDIT_LIMIT_EXCEEDED';end if;
 update private.customer_receivable_accounts_v1 set balance=round(balance+v_signed,2),updated_at=now() where branch_id=p_branch_id and customer_id=p_customer_id returning * into v_account;
 insert into private.customer_receivable_ledger_v1(branch_id,customer_id,entry_type,signed_amount,description,idempotency_key,created_by) values(p_branch_id,p_customer_id,p_entry_type,v_signed,trim(p_description),trim(p_idempotency_key),v_uid) returning id into v_entry_id;
 return jsonb_build_object('ok',true,'entry_id',v_entry_id,'balance',v_account.balance);
end;$function$;

create or replace function public.get_business_debts_workspace_v1(p_branch_id uuid,p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare v_customers jsonb;v_employees jsonb;v_suppliers jsonb;v_recent jsonb;v_customer_total numeric:=0;v_employee_total numeric:=0;v_supplier_total numeric:=0;v_supplier_credit numeric:=0;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED';end if;
 if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id) or public.staff_has_permission('reports.view',p_branch_id)) then raise exception using errcode='42501',message='DEBT_VIEW_DENIED';end if;
 p_limit:=greatest(1,least(coalesce(p_limit,200),500));
 select coalesce(sum(a.balance),0),coalesce(jsonb_agg(jsonb_build_object('party_type','customer','id',a.customer_id,'name',coalesce(nullif(c.name,''),nullif(trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')),''),'عميل'),'phone',c.phone,'balance',a.balance,'credit_limit',a.credit_limit,'updated_at',a.updated_at) order by a.balance desc) filter (where a.customer_id is not null),'[]'::jsonb)
 into v_customer_total,v_customers from (select * from private.customer_receivable_accounts_v1 where branch_id=p_branch_id and active and balance>0 order by balance desc limit p_limit) a join public.customers c on c.id=a.customer_id;
 select coalesce(sum(x.receivable_balance),0),coalesce(jsonb_agg(jsonb_build_object('party_type','employee','id',x.employee_id,'name',u.name,'phone',u.phone,'balance',x.receivable_balance,'credit_limit',x.credit_limit,'payroll_deduction_enabled',x.payroll_deduction_enabled,'updated_at',x.updated_at) order by x.receivable_balance desc),'[]'::jsonb)
 into v_employee_total,v_employees from (select * from private.hr_employee_wallet_accounts where branch_id=p_branch_id and active and receivable_balance>0 order by receivable_balance desc limit p_limit) x join public.users u on u.id=x.employee_id;
 with balances as (select l.supplier_id,round(sum(l.signed_amount),2) balance from private.supplier_ledger_v1 l where l.branch_id=p_branch_id group by l.supplier_id),limited as (select * from balances where balance<>0 order by abs(balance) desc limit p_limit)
 select coalesce(sum(greatest(b.balance,0)),0),coalesce(sum(greatest(-b.balance,0)),0),coalesce(jsonb_agg(jsonb_build_object('party_type','supplier','id',b.supplier_id,'name',s.name,'phone',s.phone,'balance',b.balance,'payment_terms_days',s.payment_terms_days,'credit_limit',s.credit_limit) order by abs(b.balance) desc),'[]'::jsonb)
 into v_supplier_total,v_supplier_credit,v_suppliers from limited b join public.suppliers s on s.id=b.supplier_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'customer_id',l.customer_id,'customer_name',coalesce(nullif(c.name,''),nullif(trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')),''),'عميل'),'entry_type',l.entry_type,'signed_amount',l.signed_amount,'description',l.description,'created_at',l.created_at) order by l.created_at desc),'[]'::jsonb)
 into v_recent from (select * from private.customer_receivable_ledger_v1 where branch_id=p_branch_id order by created_at desc limit greatest(20,least(p_limit,100))) l join public.customers c on c.id=l.customer_id;
 return jsonb_build_object('version',1,'branch_id',p_branch_id,'summary',jsonb_build_object('customer_receivables',round(v_customer_total,2),'employee_receivables',round(v_employee_total,2),'total_receivables',round(v_customer_total+v_employee_total,2),'supplier_payables',round(v_supplier_total,2),'supplier_credits',round(v_supplier_credit,2)),'customers',coalesce(v_customers,'[]'::jsonb),'employees',coalesce(v_employees,'[]'::jsonb),'suppliers',coalesce(v_suppliers,'[]'::jsonb),'recent_customer_entries',coalesce(v_recent,'[]'::jsonb),'generated_at',now());
end;$function$;

create or replace function public.get_reporting_debts_v1(p_branch_id uuid,p_from timestamptz,p_to timestamptz,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare v_workspace jsonb;v_customer_movement numeric:=0;v_employee_movement numeric:=0;v_supplier_movement numeric:=0;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='REPORT_BRANCH_ACCESS_DENIED';end if;
 if not public.staff_has_permission('reports.view',p_branch_id) then raise exception using errcode='42501',message='REPORT_VIEW_DENIED';end if;
 if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE';end if;
 v_workspace:=public.get_business_debts_workspace_v1(p_branch_id,p_limit);
 select coalesce(sum(signed_amount),0) into v_customer_movement from private.customer_receivable_ledger_v1 where branch_id=p_branch_id and created_at>=p_from and created_at<p_to;
 select coalesce(sum(receivable_delta),0) into v_employee_movement from private.hr_employee_wallet_ledger where branch_id=p_branch_id and created_at>=p_from and created_at<p_to;
 select coalesce(sum(signed_amount),0) into v_supplier_movement from private.supplier_ledger_v1 where branch_id=p_branch_id and created_at>=p_from and created_at<p_to;
 return v_workspace||jsonb_build_object('period',jsonb_build_object('from',p_from,'to',p_to),'period_movement',jsonb_build_object('customer_receivables',round(v_customer_movement,2),'employee_receivables',round(v_employee_movement,2),'supplier_payables',round(v_supplier_movement,2)),'data_quality',jsonb_build_object('customer_source','private.customer_receivable_ledger_v1','employee_source','private.hr_employee_wallet_ledger','supplier_source','private.supplier_ledger_v1','snapshot_note','Current balances are point-in-time; period movement is shown separately.'));
end;$function$;

revoke all on function public.post_customer_receivable_v1(uuid,uuid,text,numeric,text,text) from public,anon;
revoke all on function public.get_business_debts_workspace_v1(uuid,integer) from public,anon;
revoke all on function public.get_reporting_debts_v1(uuid,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.post_customer_receivable_v1(uuid,uuid,text,numeric,text,text) to authenticated,service_role;
grant execute on function public.get_business_debts_workspace_v1(uuid,integer) to authenticated,service_role;
grant execute on function public.get_reporting_debts_v1(uuid,timestamptz,timestamptz,integer) to authenticated,service_role;
