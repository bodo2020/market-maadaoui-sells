-- Customer credit for selected online-registered customers.
-- Credit is branch-scoped, explicitly approved by finance, barcode-gated in POS,
-- and enforced server-side at sale commit time.

alter table private.customer_receivable_accounts_v1
  add column if not exists credit_enabled boolean not null default false,
  add column if not exists credit_approved_by uuid references public.users(id) on delete set null,
  add column if not exists credit_approved_at timestamptz,
  add column if not exists credit_approval_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='customer_receivable_accounts_credit_policy_check') then
    alter table private.customer_receivable_accounts_v1
      add constraint customer_receivable_accounts_credit_policy_check
      check (not credit_enabled or (credit_limit is not null and credit_limit > 0));
  end if;
end $$;

alter table public.sales add column if not exists customer_credit_amount numeric(12,2) not null default 0;
alter table public.pos_invoices add column if not exists customer_credit_amount numeric(12,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='sales_customer_credit_amount_check') then
    alter table public.sales add constraint sales_customer_credit_amount_check check (customer_credit_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='pos_invoices_customer_credit_amount_check') then
    alter table public.pos_invoices add constraint pos_invoices_customer_credit_amount_check check (customer_credit_amount >= 0);
  end if;
end $$;

insert into public.pos_payment_methods(branch_id,code,name,method_type,active,sort_order,fee_type,fee_value,fee_bearer,require_reference,metadata)
select b.id,'customer_credit','آجل عميل','other',true,960,'none',0,'business',false,
       jsonb_build_object('system',true,'internal_only',true,'customer_credit',true)
from public.branches b
on conflict(branch_id,code) do update set
  name=excluded.name,method_type='other',active=true,sort_order=960,fee_type='none',fee_value=0,
  fee_bearer='business',require_reference=false,settlement_account_id=null,
  metadata=coalesce(public.pos_payment_methods.metadata,'{}'::jsonb)||excluded.metadata,updated_at=now();

create or replace function public.configure_customer_credit_v1(
  p_branch_id uuid,p_customer_id uuid,p_enabled boolean,p_credit_limit numeric,p_note text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_customer public.customers%rowtype;
  v_loyalty public.customer_loyalty_accounts%rowtype;
  v_account private.customer_receivable_accounts_v1%rowtype;
  v_method public.pos_payment_methods%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(v_uid,p_branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED'; end if;
  if not (private.staff_is_super_admin(v_uid) or public.staff_has_permission('finance.manage',p_branch_id)) then
    raise exception using errcode='42501',message='CUSTOMER_CREDIT_MANAGE_DENIED';
  end if;

  select * into v_customer from public.customers where id=p_customer_id;
  if v_customer.id is null then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;

  if coalesce(p_enabled,false) then
    if v_customer.user_id is null or not exists(select 1 from auth.users au where au.id=v_customer.user_id) then
      raise exception using errcode='22023',message='CUSTOMER_ONLINE_ACCOUNT_REQUIRED';
    end if;
    if p_credit_limit is null or p_credit_limit<=0 then raise exception using errcode='22023',message='CUSTOMER_CREDIT_LIMIT_REQUIRED'; end if;
    v_loyalty:=private.ensure_customer_loyalty_account(v_customer.id);
    if v_loyalty.customer_id is null or v_loyalty.status<>'active' or nullif(trim(coalesce(v_loyalty.barcode_token,'')),'') is null then
      raise exception using errcode='22023',message='CUSTOMER_LOYALTY_CARD_REQUIRED';
    end if;
  end if;

  insert into private.customer_receivable_accounts_v1(branch_id,customer_id,credit_limit,active,credit_enabled,credit_approved_by,credit_approved_at,credit_approval_note)
  values(p_branch_id,p_customer_id,case when p_credit_limit is null then null else round(p_credit_limit,2) end,true,coalesce(p_enabled,false),
         case when p_enabled then v_uid else null end,case when p_enabled then now() else null end,nullif(trim(coalesce(p_note,'')),''))
  on conflict(branch_id,customer_id) do update set
    credit_limit=case when p_credit_limit is null then private.customer_receivable_accounts_v1.credit_limit else round(p_credit_limit,2) end,
    active=true,credit_enabled=coalesce(p_enabled,false),
    credit_approved_by=case when p_enabled then v_uid else private.customer_receivable_accounts_v1.credit_approved_by end,
    credit_approved_at=case when p_enabled then now() else private.customer_receivable_accounts_v1.credit_approved_at end,
    credit_approval_note=coalesce(nullif(trim(coalesce(p_note,'')),''),private.customer_receivable_accounts_v1.credit_approval_note),updated_at=now()
  returning * into v_account;

  if v_account.credit_enabled and v_account.credit_limit < v_account.balance then
    raise exception using errcode='23514',message='CUSTOMER_CREDIT_LIMIT_BELOW_BALANCE';
  end if;

  insert into public.pos_payment_methods(branch_id,code,name,method_type,active,sort_order,fee_type,fee_value,fee_bearer,require_reference,metadata)
  values(p_branch_id,'customer_credit','آجل عميل','other',true,960,'none',0,'business',false,jsonb_build_object('system',true,'internal_only',true,'customer_credit',true))
  on conflict(branch_id,code) do update set active=true,metadata=coalesce(public.pos_payment_methods.metadata,'{}'::jsonb)||excluded.metadata,updated_at=now()
  returning * into v_method;

  return jsonb_build_object('ok',true,'customer_id',v_customer.id,
    'customer_name',coalesce(nullif(v_customer.name,''),nullif(trim(coalesce(v_customer.first_name,'')||' '||coalesce(v_customer.last_name,'')),''),'عميل'),
    'online_registered',v_customer.user_id is not null and exists(select 1 from auth.users au where au.id=v_customer.user_id),
    'credit_enabled',v_account.credit_enabled,'credit_limit',v_account.credit_limit,'balance',v_account.balance,
    'credit_available',greatest(coalesce(v_account.credit_limit,0)-v_account.balance,0),
    'membership_number',v_loyalty.membership_number,'barcode_token',v_loyalty.barcode_token,'payment_method_id',v_method.id);
end;
$$;

create or replace function public.get_pos_payment_methods(p_branch_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not (private.can_operate_cash_branch(p_branch_id) or private.staff_is_super_admin(auth.uid())
          or public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)
          or public.staff_has_permission('branch.manage_settings',p_branch_id)) then
    raise exception using errcode='42501',message='PAYMENT_METHOD_ACCESS_DENIED';
  end if;
  perform private.ensure_default_pos_payment_methods(p_branch_id);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.id,'branch_id',m.branch_id,'code',m.code,'name',m.name,'method_type',m.method_type,'active',m.active,
    'sort_order',m.sort_order,'fee_type',m.fee_type,'fee_value',m.fee_value,'fee_bearer',m.fee_bearer,
    'require_reference',m.require_reference,'settlement_account_id',m.settlement_account_id,'metadata',m.metadata,'updated_at',m.updated_at
  ) order by m.sort_order,m.name)
  from public.pos_payment_methods m
  where m.branch_id=p_branch_id and coalesce(m.metadata->>'archived','false')<>'true' and coalesce(m.metadata->>'internal_only','false')<>'true'),'[]'::jsonb);
end;
$$;

create or replace function public.lookup_customer_loyalty(p_code text,p_branch_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_account public.customer_loyalty_accounts%rowtype;
  v_customer public.customers%rowtype;
  v_settings public.loyalty_settings%rowtype;
  v_credit private.customer_receivable_accounts_v1%rowtype;
  v_method_id uuid;
  v_code text;
  v_online boolean:=false;
begin
  if auth.uid() is null or p_branch_id is null or not private.can_operate_cash_branch(p_branch_id) then raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED'; end if;
  v_code:=upper(btrim(coalesce(p_code,'')));
  if v_code='' then raise exception using errcode='22023',message='CUSTOMER_CODE_REQUIRED'; end if;
  select * into v_account from public.customer_loyalty_accounts a where upper(a.barcode_token)=v_code or upper(a.membership_number)=v_code limit 1;
  if v_account.customer_id is null or v_account.status<>'active' then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
  select * into v_customer from public.customers where id=v_account.customer_id;
  select * into v_settings from public.loyalty_settings where singleton=true;
  select * into v_credit from private.customer_receivable_accounts_v1 where branch_id=p_branch_id and customer_id=v_customer.id;
  v_online:=v_customer.user_id is not null and exists(select 1 from auth.users au where au.id=v_customer.user_id);
  select m.id into v_method_id from public.pos_payment_methods m where m.branch_id=p_branch_id and m.code='customer_credit' and m.active limit 1;
  return jsonb_build_object(
    'customer_id',v_customer.id,'name',v_customer.name,'phone',v_customer.phone,'membership_number',v_account.membership_number,
    'barcode_token',v_account.barcode_token,'points_balance',v_account.points_balance,'lifetime_points_earned',v_account.lifetime_points_earned,
    'redeemable_credit_egp',floor(greatest(v_account.points_balance,0)::numeric/v_settings.redemption_points)*v_settings.redemption_value_egp,
    'redemption_points',v_settings.redemption_points,'redemption_value_egp',v_settings.redemption_value_egp,
    'online_registered',v_online,'credit_enabled',coalesce(v_credit.credit_enabled,false),
    'credit_active',v_online and coalesce(v_credit.active,false) and coalesce(v_credit.credit_enabled,false) and coalesce(v_credit.credit_limit,0)>0 and v_method_id is not null,
    'credit_limit',coalesce(v_credit.credit_limit,0),'receivable_balance',coalesce(v_credit.balance,0),
    'credit_available',greatest(coalesce(v_credit.credit_limit,0)-coalesce(v_credit.balance,0),0),'credit_payment_method_id',v_method_id);
end;
$$;

create or replace function public.get_business_debts_workspace_v1(p_branch_id uuid,p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_customers jsonb; v_employees jsonb; v_suppliers jsonb; v_recent jsonb;
  v_customer_total numeric:=0; v_employee_total numeric:=0; v_supplier_total numeric:=0; v_supplier_credit numeric:=0;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED'; end if;
  if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id) or public.staff_has_permission('reports.view',p_branch_id)) then raise exception using errcode='42501',message='DEBT_VIEW_DENIED'; end if;
  p_limit:=greatest(1,least(coalesce(p_limit,200),500));

  select coalesce(sum(a.balance),0) into v_customer_total from private.customer_receivable_accounts_v1 a where a.branch_id=p_branch_id and a.active;
  select coalesce(jsonb_agg(jsonb_build_object(
    'party_type','customer','id',a.customer_id,'name',coalesce(nullif(c.name,''),nullif(trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')),''),'عميل'),
    'phone',c.phone,'balance',a.balance,'credit_limit',a.credit_limit,'credit_enabled',a.credit_enabled,
    'credit_available',greatest(coalesce(a.credit_limit,0)-a.balance,0),
    'online_registered',c.user_id is not null and exists(select 1 from auth.users au where au.id=c.user_id),
    'membership_number',cla.membership_number,'barcode_token',cla.barcode_token,'credit_approved_at',a.credit_approved_at,
    'credit_approval_note',a.credit_approval_note,'updated_at',a.updated_at
  ) order by a.credit_enabled desc,a.balance desc,a.updated_at desc),'[]'::jsonb)
  into v_customers
  from (select * from private.customer_receivable_accounts_v1 where branch_id=p_branch_id and active and (balance>0 or credit_enabled)
        order by credit_enabled desc,balance desc,updated_at desc limit p_limit) a
  join public.customers c on c.id=a.customer_id left join public.customer_loyalty_accounts cla on cla.customer_id=c.id;

  select coalesce(sum(x.receivable_balance),0),coalesce(jsonb_agg(jsonb_build_object(
    'party_type','employee','id',x.employee_id,'name',u.name,'phone',u.phone,'balance',x.receivable_balance,'credit_limit',x.credit_limit,
    'payroll_deduction_enabled',x.payroll_deduction_enabled,'updated_at',x.updated_at) order by x.receivable_balance desc),'[]'::jsonb)
  into v_employee_total,v_employees
  from (select * from private.hr_employee_wallet_accounts where branch_id=p_branch_id and active and receivable_balance>0 order by receivable_balance desc limit p_limit) x
  join public.users u on u.id=x.employee_id;

  with balances as (select l.supplier_id,round(sum(l.signed_amount),2) balance from private.supplier_ledger_v1 l where l.branch_id=p_branch_id group by l.supplier_id),
  limited as (select * from balances where balance<>0 order by abs(balance) desc limit p_limit)
  select coalesce(sum(greatest(b.balance,0)),0),coalesce(sum(greatest(-b.balance,0)),0),
    coalesce(jsonb_agg(jsonb_build_object('party_type','supplier','id',b.supplier_id,'name',s.name,'phone',s.phone,'balance',b.balance,
      'payment_terms_days',s.payment_terms_days,'credit_limit',s.credit_limit) order by abs(b.balance) desc),'[]'::jsonb)
  into v_supplier_total,v_supplier_credit,v_suppliers from limited b join public.suppliers s on s.id=b.supplier_id;

  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'customer_id',l.customer_id,
    'customer_name',coalesce(nullif(c.name,''),nullif(trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')),''),'عميل'),
    'entry_type',l.entry_type,'signed_amount',l.signed_amount,'description',l.description,'reference_kind',l.reference_kind,
    'reference_id',l.reference_id,'created_at',l.created_at) order by l.created_at desc),'[]'::jsonb)
  into v_recent from (select * from private.customer_receivable_ledger_v1 where branch_id=p_branch_id order by created_at desc limit greatest(20,least(p_limit,100))) l
  join public.customers c on c.id=l.customer_id;

  return jsonb_build_object('version',2,'branch_id',p_branch_id,
    'summary',jsonb_build_object('customer_receivables',round(v_customer_total,2),'employee_receivables',round(v_employee_total,2),
      'total_receivables',round(v_customer_total+v_employee_total,2),'supplier_payables',round(v_supplier_total,2),'supplier_credits',round(v_supplier_credit,2)),
    'customers',coalesce(v_customers,'[]'::jsonb),'employees',coalesce(v_employees,'[]'::jsonb),'suppliers',coalesce(v_suppliers,'[]'::jsonb),
    'recent_customer_entries',coalesce(v_recent,'[]'::jsonb),'generated_at',now());
end;
$$;

create or replace function public.search_business_debt_parties_v1(p_branch_id uuid,p_party_type text,p_search text default null,p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_search text:=nullif(trim(coalesce(p_search,'')),''); v_limit integer:=greatest(1,least(coalesce(p_limit,30),100)); v_rows jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED'; end if;
  if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='DEBT_VIEW_DENIED'; end if;
  if p_party_type not in ('customer','employee','supplier') then raise exception using errcode='22023',message='INVALID_PARTY_TYPE'; end if;
  if p_party_type='customer' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) into v_rows from (
      select c.id,coalesce(nullif(c.name,''),nullif(trim(coalesce(c.first_name,'')||' '||coalesce(c.last_name,'')),''),'عميل') name,c.phone,c.email,
        (c.user_id is not null and exists(select 1 from auth.users au where au.id=c.user_id)) online_registered,cla.membership_number,cla.barcode_token,
        coalesce(a.balance,0) balance,coalesce(a.credit_enabled,false) credit_enabled,a.credit_limit,
        greatest(coalesce(a.credit_limit,0)-coalesce(a.balance,0),0) credit_available
      from public.customers c left join public.customer_loyalty_accounts cla on cla.customer_id=c.id
      left join private.customer_receivable_accounts_v1 a on a.branch_id=p_branch_id and a.customer_id=c.id
      where v_search is null or coalesce(c.name,'') ilike '%'||v_search||'%' or coalesce(c.first_name,'') ilike '%'||v_search||'%'
        or coalesce(c.last_name,'') ilike '%'||v_search||'%' or coalesce(c.phone,'') ilike '%'||v_search||'%'
        or coalesce(cla.membership_number,'') ilike '%'||v_search||'%' order by 2 limit v_limit) x;
  elsif p_party_type='employee' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) into v_rows from (
      select distinct u.id,u.name,u.phone,u.email,coalesce(ep.employee_code,'') employee_code
      from public.users u join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and coalesce(ubr.active,true)
      left join private.hr_employee_profiles ep on ep.user_id=u.id
      where coalesce(u.active,true) and u.role<>'super_admin' and (v_search is null or coalesce(u.name,'') ilike '%'||v_search||'%'
        or coalesce(u.phone,'') ilike '%'||v_search||'%' or coalesce(ep.employee_code,'') ilike '%'||v_search||'%')
      order by u.name limit v_limit) x;
  else
    select coalesce(jsonb_agg(to_jsonb(x) order by x.name),'[]'::jsonb) into v_rows from (
      select s.id,s.name,s.phone,s.email,s.payment_terms_days,s.credit_limit from public.suppliers s
      where coalesce(s.active,true) and (v_search is null or coalesce(s.name,'') ilike '%'||v_search||'%' or coalesce(s.phone,'') ilike '%'||v_search||'%')
      order by s.name limit v_limit) x;
  end if;
  return jsonb_build_object('party_type',p_party_type,'rows',coalesce(v_rows,'[]'::jsonb));
end;
$$;

create or replace function private.charge_customer_credit_sale_v1(p_branch_id uuid,p_customer_id uuid,p_sale_id uuid,p_amount numeric,p_invoice_number text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_account private.customer_receivable_accounts_v1%rowtype; v_key text:='customer-credit-sale:'||p_sale_id::text; v_entry_id uuid;
begin
  if p_amount is null or p_amount<=0 then raise exception using errcode='22023',message='INVALID_DEBT_AMOUNT'; end if;
  if exists(select 1 from private.customer_receivable_ledger_v1 where idempotency_key=v_key) then
    select * into v_account from private.customer_receivable_accounts_v1 where branch_id=p_branch_id and customer_id=p_customer_id;
    return jsonb_build_object('ok',true,'idempotent',true,'balance',coalesce(v_account.balance,0),'credit_available',greatest(coalesce(v_account.credit_limit,0)-coalesce(v_account.balance,0),0));
  end if;
  select * into v_account from private.customer_receivable_accounts_v1 where branch_id=p_branch_id and customer_id=p_customer_id for update;
  if v_account.customer_id is null or not v_account.active or not v_account.credit_enabled or coalesce(v_account.credit_limit,0)<=0 then raise exception using errcode='23514',message='CUSTOMER_CREDIT_INACTIVE'; end if;
  if v_account.balance+round(p_amount,2)>v_account.credit_limit+0.009 then raise exception using errcode='23514',message='CUSTOMER_CREDIT_LIMIT_EXCEEDED'; end if;
  update private.customer_receivable_accounts_v1 set balance=round(balance+p_amount,2),updated_at=now()
    where branch_id=p_branch_id and customer_id=p_customer_id returning * into v_account;
  insert into private.customer_receivable_ledger_v1(branch_id,customer_id,entry_type,signed_amount,description,reference_kind,reference_id,idempotency_key,created_by)
  values(p_branch_id,p_customer_id,'charge',round(p_amount,2),'شراء آجل - فاتورة '||coalesce(p_invoice_number,''),'sale',p_sale_id,v_key,auth.uid()) returning id into v_entry_id;
  return jsonb_build_object('ok',true,'idempotent',false,'entry_id',v_entry_id,'balance',v_account.balance,'credit_available',greatest(coalesce(v_account.credit_limit,0)-v_account.balance,0));
end;
$$;

create or replace function public.create_pos_sale_v5(p_request_id uuid,p_branch_id uuid,p_sale jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_result jsonb; v_sale public.sales%rowtype; v_replayed boolean:=false;
  v_customer_credit numeric(12,2):=0; v_customer_parts integer:=0; v_total_parts integer:=0; v_base_due numeric(12,2):=0;
  v_customer public.customers%rowtype; v_account private.customer_receivable_accounts_v1%rowtype; v_breakdown jsonb:='[]'::jsonb; v_charge jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_result:=public.create_pos_sale_v4(p_request_id,p_branch_id,p_sale);
  v_replayed:=coalesce((v_result->>'request_replayed')::boolean,false);
  select * into v_sale from public.sales where id=p_request_id for update;
  if v_sale.id is null then raise exception using errcode='55000',message='SALE_NOT_CONFIRMED'; end if;
  if v_replayed then
    return to_jsonb(v_sale)||jsonb_build_object('sale_version',5,'customer_credit_amount',coalesce(v_sale.customer_credit_amount,0),'request_replayed',true);
  end if;

  select count(*)::int,count(*) filter(where p.method_code_snapshot='customer_credit')::int,
         coalesce(sum(p.base_amount) filter(where p.method_code_snapshot='customer_credit'),0)
  into v_total_parts,v_customer_parts,v_customer_credit
  from private.pos_sale_payment_parts_v3 p where p.sale_id=v_sale.id;

  v_base_due:=greatest(round(coalesce(v_sale.total,0)-coalesce(v_sale.loyalty_voucher_amount,0),2),0);
  if v_customer_credit<=0 then
    return to_jsonb(v_sale)||coalesce(v_result,'{}'::jsonb)||jsonb_build_object('sale_version',5,'customer_credit_amount',0,'request_replayed',false);
  end if;
  if v_customer_parts<>1 or v_total_parts<>1 or abs(v_customer_credit-v_base_due)>0.009 then raise exception using errcode='22023',message='CUSTOMER_CREDIT_MUST_BE_FULL_PAYMENT'; end if;
  if v_sale.customer_id is null then raise exception using errcode='22023',message='CUSTOMER_REQUIRED_FOR_CREDIT'; end if;
  if v_sale.employee_id is not null then raise exception using errcode='22023',message='BUYER_IDENTITY_CONFLICT'; end if;

  select * into v_customer from public.customers where id=v_sale.customer_id;
  if v_customer.id is null then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
  if v_customer.user_id is null or not exists(select 1 from auth.users au where au.id=v_customer.user_id) then raise exception using errcode='22023',message='CUSTOMER_ONLINE_ACCOUNT_REQUIRED'; end if;
  select * into v_account from private.customer_receivable_accounts_v1 where branch_id=p_branch_id and customer_id=v_customer.id for update;
  if v_account.customer_id is null or not v_account.active or not v_account.credit_enabled or coalesce(v_account.credit_limit,0)<=0 then raise exception using errcode='23514',message='CUSTOMER_CREDIT_INACTIVE'; end if;
  if v_customer_credit>greatest(v_account.credit_limit-v_account.balance,0)+0.009 then raise exception using errcode='23514',message='CUSTOMER_CREDIT_LIMIT_EXCEEDED'; end if;

  select coalesce(jsonb_agg(case when x.elem->>'code'='customer_credit' then x.elem||jsonb_build_object(
    'method_type','customer_credit','charged_amount',0,'estimated_net_settlement',0,'fee_amount',0,'customer_fee_amount',0,'merchant_fee_amount',0)
    else x.elem end order by x.ord),'[]'::jsonb)
  into v_breakdown from jsonb_array_elements(coalesce(v_sale.payment_breakdown,'[]'::jsonb)) with ordinality x(elem,ord);

  delete from public.pos_sale_payments where sale_id=v_sale.id and payment_method_id in (select id from public.pos_payment_methods where branch_id=p_branch_id and code='customer_credit');
  delete from private.pos_sale_payment_parts_v3 where sale_id=v_sale.id and method_code_snapshot='customer_credit';

  update public.sales set customer_credit_amount=v_customer_credit,cash_amount=0,card_amount=0,digital_wallet_amount=0,
    payment_method='mixed',payment_method_code='customer_credit',payment_method_name='آجل عميل',payment_reference=null,
    amount_charged=0,payment_fee_amount=0,customer_payment_fee_amount=0,merchant_payment_fee_amount=0,payment_fee_bearer=null,
    net_profit_after_payment_fee=profit,payment_breakdown=v_breakdown
  where id=v_sale.id returning * into v_sale;

  v_charge:=private.charge_customer_credit_sale_v1(p_branch_id,v_sale.customer_id,v_sale.id,v_customer_credit,v_sale.invoice_number);

  update public.pos_invoices set customer_credit_amount=v_customer_credit,cash_amount=0,card_amount=0,digital_wallet_amount=0,
    payment_method='mixed',payment_method_code='customer_credit',payment_method_name='آجل عميل',payment_method_type='customer_credit',
    payment_fee_amount=0,payment_fee_bearer=null,customer_payment_fee_amount=0,merchant_payment_fee_amount=0,amount_charged=0,
    net_profit_after_payment_fee=v_sale.profit,payment_reference=null,payment_breakdown=v_breakdown
  where sale_id=v_sale.id;

  return to_jsonb(v_sale)||jsonb_build_object('sale_version',5,'customer_credit_amount',v_customer_credit,
    'customer_credit_balance',coalesce((v_charge->>'balance')::numeric,0),
    'customer_credit_available',coalesce((v_charge->>'credit_available')::numeric,0),'request_replayed',false);
end;
$$;

revoke all on function public.configure_customer_credit_v1(uuid,uuid,boolean,numeric,text) from public,anon;
grant execute on function public.configure_customer_credit_v1(uuid,uuid,boolean,numeric,text) to authenticated,service_role;
revoke all on function public.create_pos_sale_v5(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_pos_sale_v5(uuid,uuid,jsonb) to authenticated,service_role;
revoke all on function private.charge_customer_credit_sale_v1(uuid,uuid,uuid,numeric,text) from public,anon,authenticated;
grant execute on function private.charge_customer_credit_sale_v1(uuid,uuid,uuid,numeric,text) to service_role;
