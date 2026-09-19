insert into public.staff_permissions(code,name_ar,module,description) values
 ('expense.manage_advances','إدارة العهد والسلف','finance','طلب وصرف وتسوية عهد وسلف الموظفين')
on conflict(code) do update set name_ar=excluded.name_ar,module=excluded.module,description=excluded.description;

insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r cross join public.staff_permissions p
where r.active and p.code='expense.manage_advances'
  and (r.code in ('accountant','branch_admin','branch_manager','super_admin') or exists(
    select 1 from public.staff_role_permissions rp2 join public.staff_permissions fp on fp.id=rp2.permission_id
    where rp2.role_id=r.id and fp.code='finance.manage'
  ))
on conflict do nothing;

create table if not exists private.employee_advance_settlements_v2(
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  expense_document_id uuid not null references private.expense_documents_v2(id),
  branch_id uuid not null references public.branches(id),
  employee_id uuid not null,
  settlement_type text not null check(settlement_type in ('expense_receipt','cash_return')),
  amount numeric(14,2) not null check(amount>0),
  category_id uuid references private.expense_categories_v2(id),
  description text not null,
  receipt_url text,
  invoice_number text,
  source_kind text check(source_kind is null or source_kind in ('branch_safe','bank','payment_account')),
  source_account_id uuid,
  provider_reference text,
  linked_expense_id uuid references public.expenses(id),
  cash_ledger_entry_id uuid references public.cash_ledger(id),
  payment_ledger_entry_id uuid references public.payment_ledger(id),
  status text not null default 'active' check(status in ('active','reversed')),
  settled_by uuid not null,
  settled_at timestamptz not null default now(),
  reversed_by uuid,
  reversed_at timestamptz,
  reverse_reason text,
  created_at timestamptz not null default now()
);
create index if not exists employee_advance_settlements_v2_doc_idx on private.employee_advance_settlements_v2(expense_document_id,status,settled_at desc);
create index if not exists employee_advance_settlements_v2_employee_idx on private.employee_advance_settlements_v2(employee_id,branch_id,status);

create or replace function private.employee_advance_notify_v2(p_document_id uuid,p_event_key text,p_title text,p_body text,p_suffix text,p_severity text default 'normal')
returns void language plpgsql security definer set search_path='' as $$
declare d private.expense_documents_v2%rowtype; begin
  select * into d from private.expense_documents_v2 where id=p_document_id;
  if d.id is null or d.employee_id is null then return; end if;
  insert into private.notification_events_v2(audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at)
  values('staff',d.employee_id,d.branch_id,p_event_key,'finance',coalesce(nullif(p_severity,''),'normal'),p_title,p_body,'employee_advance',d.id,'/finance/expenses/advances','عرض العهدة',false,
    'employee-advance:'||d.id::text||':'||p_suffix,array['in_app']::text[],'active',jsonb_build_object('expense_document_id',d.id,'document_number',d.document_number,'amount',d.amount,'paid_amount',d.paid_amount),now(),now())
  on conflict(recipient_user_id,dedupe_key) do update set title=excluded.title,body=excluded.body,severity=excluded.severity,status='active',resolved_at=null,metadata=excluded.metadata,updated_at=now();
end $$;

create or replace function public.create_employee_advance_request_v2(
  p_request_id uuid,p_branch_id uuid,p_employee_id uuid,p_amount numeric,p_purpose text,p_due_date date default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.expense_categories_v2%rowtype; d private.expense_documents_v2%rowtype; v_name text; v_auto boolean; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.manage_advances',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_ADVANCE_MANAGE_DENIED'; end if;
  if p_request_id is null or p_employee_id is null or coalesce(p_amount,0)<=0 or nullif(trim(coalesce(p_purpose,'')),'') is null then raise exception using errcode='22023',message='INVALID_EMPLOYEE_ADVANCE'; end if;
  select * into d from private.expense_documents_v2 where request_id=p_request_id; if d.id is not null then return to_jsonb(d); end if;
  if not exists(select 1 from private.hr_employee_profiles e where e.user_id=p_employee_id and e.employment_status='active' and (e.primary_branch_id=p_branch_id or public.staff_has_permission('hr.view',p_branch_id))) then raise exception using errcode='22023',message='EMPLOYEE_NOT_ELIGIBLE'; end if;
  select coalesce(nullif(u.name,''),e.employee_code,'موظف') into v_name from private.hr_employee_profiles e left join public.users u on u.id=e.user_id where e.user_id=p_employee_id limit 1;
  select * into c from private.expense_categories_v2 where active and accounting_treatment='employee_advance' and (branch_id=p_branch_id or branch_id is null) order by (branch_id=p_branch_id) desc limit 1;
  if c.id is null then raise exception using errcode='22023',message='EMPLOYEE_ADVANCE_CATEGORY_NOT_FOUND'; end if;
  v_auto:=not c.approval_required or (c.auto_approve_limit>0 and p_amount<=c.auto_approve_limit);
  insert into private.expense_documents_v2(request_id,document_number,branch_id,category_id,category_code,category_name,accounting_treatment,amount,beneficiary_name,employee_id,description,notes,incurred_at,source,status,requested_by,submitted_at,approved_by,approved_at)
  values(p_request_id,private.expense_document_number_v2(),p_branch_id,c.id,c.code,c.name_ar,'employee_advance',round(p_amount,2),v_name,p_employee_id,trim(p_purpose),
    concat_ws(' · ',nullif(trim(coalesce(p_notes,'')),''),case when p_due_date is not null then 'تاريخ التسوية المطلوب: '||p_due_date::text end),now(),'business',case when v_auto then 'approved' else 'pending_approval' end,auth.uid(),now(),case when v_auto then auth.uid() end,case when v_auto then now() end)
  returning * into d;
  perform private.expense_write_audit_v2(d.id,'advance_requested',auth.uid(),p_notes,jsonb_build_object('employee_id',p_employee_id,'due_date',p_due_date));
  if v_auto then perform private.employee_advance_notify_v2(d.id,'expense.advance_approved','تم اعتماد العهدة',d.document_number||' · '||round(d.amount,2)||' ج.م','approved','normal'); else perform private.expense_create_approval_task_v2(d.id); end if;
  return to_jsonb(d);
end $$;

create or replace function public.disburse_employee_advance_v2(
  p_request_id uuid,p_document_id uuid,p_source_kind text,p_source_account_id uuid,p_amount numeric,p_actual_fee numeric default 0,p_provider_reference text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.expense_documents_v2%rowtype; v_payment private.expense_payments_v2%rowtype; v_cash public.cash_accounts%rowtype; v_pay public.payment_accounts%rowtype; v_remaining numeric; v_balance numeric; v_cash_ledger uuid; v_pay_ledger uuid; v_fee_ledger uuid; v_fee_expense uuid; v_method text; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='REQUEST_ID_REQUIRED'; end if;
  select * into v_payment from private.expense_payments_v2 where request_id=p_request_id; if v_payment.id is not null then return to_jsonb(v_payment); end if;
  select * into d from private.expense_documents_v2 where id=p_document_id for update;
  if d.id is null or d.accounting_treatment<>'employee_advance' or d.employee_id is null then raise exception using errcode='22023',message='EMPLOYEE_ADVANCE_NOT_FOUND'; end if;
  if not (public.staff_has_permission('expense.manage_advances',d.branch_id) or public.staff_has_permission('finance.manage',d.branch_id)) then raise exception using errcode='42501',message='EXPENSE_ADVANCE_MANAGE_DENIED'; end if;
  if d.status not in ('approved','partially_paid') then raise exception using errcode='22023',message='EMPLOYEE_ADVANCE_NOT_DISBURSABLE'; end if;
  v_remaining:=round(d.amount-d.paid_amount,2); if coalesce(p_amount,0)<=0 or round(p_amount,2)>v_remaining then raise exception using errcode='22023',message='INVALID_ADVANCE_DISBURSEMENT'; end if;
  if coalesce(p_actual_fee,0)<0 or p_source_kind='pos_drawer' then raise exception using errcode='22023',message='INVALID_ADVANCE_SOURCE'; end if;
  if p_source_kind='branch_safe' then
    select * into v_cash from public.cash_accounts where id=p_source_account_id and branch_id=d.branch_id and active and account_type='branch_safe' for update;
    if v_cash.id is null then raise exception using errcode='22023',message='EXPENSE_CASH_ACCOUNT_NOT_FOUND'; end if;
    perform pg_advisory_xact_lock(hashtextextended('cash-account:'||v_cash.id::text,51)); v_balance:=private.cash_account_balance(v_cash.id);
    if v_balance<round(p_amount,2) then raise exception using errcode='22003',message='INSUFFICIENT_EXPENSE_SOURCE_BALANCE'; end if;
    insert into public.cash_ledger(account_id,branch_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by)
    values(v_cash.id,d.branch_id,auth.uid(),'employee_advance_disbursement',-round(p_amount,2),'employee_advance',d.id,'صرف عهدة '||d.document_number||' - '||coalesce(d.beneficiary_name,''),jsonb_build_object('employee_id',d.employee_id,'note',nullif(trim(coalesce(p_note,'')),'')),auth.uid()) returning id into v_cash_ledger;
    v_method:='cash';
  elsif p_source_kind in ('bank','payment_account') then
    select * into v_pay from public.payment_accounts where id=p_source_account_id and branch_id=d.branch_id and active for update;
    if v_pay.id is null or (p_source_kind='bank' and v_pay.account_type<>'bank') then raise exception using errcode='22023',message='EXPENSE_PAYMENT_ACCOUNT_NOT_FOUND'; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_pay.id::text,0)); v_balance:=private.payment_account_balance(v_pay.id);
    if v_balance<round(p_amount+coalesce(p_actual_fee,0),2) then raise exception using errcode='22003',message='INSUFFICIENT_EXPENSE_SOURCE_BALANCE'; end if;
    v_method:=coalesce(nullif(v_pay.provider_code,''),v_pay.account_type);
    insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
    values(v_pay.id,d.branch_id,'employee_advance_disbursement',-round(p_amount,2),v_method,nullif(trim(coalesce(p_provider_reference,'')),''),'صرف عهدة '||d.document_number,jsonb_build_object('expense_document_id',d.id,'employee_id',d.employee_id),auth.uid()) returning id into v_pay_ledger;
    if coalesce(p_actual_fee,0)>0 then
      insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
      values(v_pay.id,d.branch_id,'employee_advance_fee',-round(p_actual_fee,2),v_method,nullif(trim(coalesce(p_provider_reference,'')),''),'رسوم صرف عهدة '||d.document_number,jsonb_build_object('expense_document_id',d.id),auth.uid()) returning id into v_fee_ledger;
      insert into public.expenses(type,amount,description,date,branch_id,payment_method,created_by,status,accounting_treatment,beneficiary_name)
      values('رسوم صرف عهدة',round(p_actual_fee,2),'رسوم مرتبطة بـ '||d.document_number,now(),d.branch_id,v_method,auth.uid(),'active','opex',v_pay.name) returning id into v_fee_expense;
    end if;
  else raise exception using errcode='22023',message='INVALID_ADVANCE_SOURCE'; end if;
  insert into private.expense_payments_v2(request_id,expense_document_id,branch_id,source_kind,source_account_id,amount,fee_amount,provider_reference,cash_ledger_entry_id,payment_ledger_entry_id,fee_ledger_entry_id,fee_expense_id,paid_by)
  values(p_request_id,d.id,d.branch_id,p_source_kind,p_source_account_id,round(p_amount,2),round(coalesce(p_actual_fee,0),2),nullif(trim(coalesce(p_provider_reference,'')),''),v_cash_ledger,v_pay_ledger,v_fee_ledger,v_fee_expense,auth.uid()) returning * into v_payment;
  update private.expense_documents_v2 set paid_amount=round(paid_amount+p_amount,2),status=case when round(paid_amount+p_amount,2)>=amount then 'paid' else 'partially_paid' end,updated_at=now() where id=d.id;
  perform private.expense_write_audit_v2(d.id,'advance_disbursed',auth.uid(),p_note,jsonb_build_object('payment_id',v_payment.id,'amount',p_amount,'source_kind',p_source_kind,'source_account_id',p_source_account_id));
  perform private.employee_advance_notify_v2(d.id,'expense.advance_disbursed','تم صرف العهدة',d.document_number||' · تم صرف '||round(p_amount,2)||' ج.م','disbursement:'||v_payment.id::text,'normal');
  return to_jsonb(v_payment)||jsonb_build_object('document',(select to_jsonb(x) from private.expense_documents_v2 x where x.id=d.id));
end $$;

create or replace function private.employee_advance_outstanding_v2(p_document_id uuid)
returns numeric language sql stable security definer set search_path='' as $$
  select greatest(d.paid_amount-coalesce((select sum(s.amount) from private.employee_advance_settlements_v2 s where s.expense_document_id=d.id and s.status='active'),0),0)::numeric
  from private.expense_documents_v2 d where d.id=p_document_id and d.accounting_treatment='employee_advance'
$$;

create or replace function public.settle_employee_advance_expense_v2(
  p_request_id uuid,p_document_id uuid,p_category_id uuid,p_amount numeric,p_description text,p_receipt_url text,p_invoice_number text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.expense_documents_v2%rowtype; c private.expense_categories_v2%rowtype; s private.employee_advance_settlements_v2%rowtype; v_outstanding numeric; v_expense uuid; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into s from private.employee_advance_settlements_v2 where request_id=p_request_id; if s.id is not null then return to_jsonb(s); end if;
  select * into d from private.expense_documents_v2 where id=p_document_id for update;
  if d.id is null or d.accounting_treatment<>'employee_advance' or d.employee_id is null then raise exception using errcode='22023',message='EMPLOYEE_ADVANCE_NOT_FOUND'; end if;
  if not (public.staff_has_permission('expense.manage_advances',d.branch_id) or public.staff_has_permission('finance.manage',d.branch_id)) then raise exception using errcode='42501',message='EXPENSE_ADVANCE_MANAGE_DENIED'; end if;
  v_outstanding:=private.employee_advance_outstanding_v2(d.id);
  if coalesce(p_amount,0)<=0 or round(p_amount,2)>v_outstanding or nullif(trim(coalesce(p_description,'')),'') is null then raise exception using errcode='22023',message='INVALID_ADVANCE_SETTLEMENT_AMOUNT'; end if;
  select * into c from private.expense_categories_v2 where id=p_category_id and active and accounting_treatment='opex' and (branch_id is null or branch_id=d.branch_id);
  if c.id is null then raise exception using errcode='22023',message='ADVANCE_SETTLEMENT_CATEGORY_INVALID'; end if;
  if c.receipt_required_above>0 and p_amount>=c.receipt_required_above and nullif(trim(coalesce(p_receipt_url,'')),'') is null then raise exception using errcode='22023',message='EXPENSE_RECEIPT_REQUIRED'; end if;
  insert into public.expenses(type,amount,description,date,receipt_url,branch_id,payment_method,created_by,status,expense_category_id,accounting_treatment,beneficiary_name,invoice_number)
  values(c.name_ar,round(p_amount,2),trim(p_description),now(),nullif(trim(coalesce(p_receipt_url,'')),''),d.branch_id,'employee_advance_settlement',auth.uid(),'active',c.id,'opex',d.beneficiary_name,nullif(trim(coalesce(p_invoice_number,'')),'')) returning id into v_expense;
  insert into private.employee_advance_settlements_v2(request_id,expense_document_id,branch_id,employee_id,settlement_type,amount,category_id,description,receipt_url,invoice_number,linked_expense_id,settled_by)
  values(p_request_id,d.id,d.branch_id,d.employee_id,'expense_receipt',round(p_amount,2),c.id,trim(p_description),nullif(trim(coalesce(p_receipt_url,'')),''),nullif(trim(coalesce(p_invoice_number,'')),''),v_expense,auth.uid()) returning * into s;
  perform private.expense_write_audit_v2(d.id,'advance_expense_settlement',auth.uid(),p_note,jsonb_build_object('settlement_id',s.id,'expense_id',v_expense,'amount',p_amount,'category_id',c.id));
  perform private.employee_advance_notify_v2(d.id,'expense.advance_settlement','تم تسجيل تسوية من العهدة',d.document_number||' · مصروف مثبت '||round(p_amount,2)||' ج.م','settlement:'||s.id::text,'normal');
  return to_jsonb(s)||jsonb_build_object('remaining_amount',private.employee_advance_outstanding_v2(d.id));
end $$;

create or replace function public.settle_employee_advance_return_v2(
  p_request_id uuid,p_document_id uuid,p_source_kind text,p_source_account_id uuid,p_amount numeric,p_provider_reference text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.expense_documents_v2%rowtype; s private.employee_advance_settlements_v2%rowtype; v_cash public.cash_accounts%rowtype; v_pay public.payment_accounts%rowtype; v_outstanding numeric; v_cash_ledger uuid; v_pay_ledger uuid; v_method text; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into s from private.employee_advance_settlements_v2 where request_id=p_request_id; if s.id is not null then return to_jsonb(s); end if;
  select * into d from private.expense_documents_v2 where id=p_document_id for update;
  if d.id is null or d.accounting_treatment<>'employee_advance' or d.employee_id is null then raise exception using errcode='22023',message='EMPLOYEE_ADVANCE_NOT_FOUND'; end if;
  if not (public.staff_has_permission('expense.manage_advances',d.branch_id) or public.staff_has_permission('finance.manage',d.branch_id)) then raise exception using errcode='42501',message='EXPENSE_ADVANCE_MANAGE_DENIED'; end if;
  v_outstanding:=private.employee_advance_outstanding_v2(d.id); if coalesce(p_amount,0)<=0 or round(p_amount,2)>v_outstanding then raise exception using errcode='22023',message='INVALID_ADVANCE_SETTLEMENT_AMOUNT'; end if;
  if p_source_kind='branch_safe' then
    select * into v_cash from public.cash_accounts where id=p_source_account_id and branch_id=d.branch_id and active and account_type='branch_safe' for update;
    if v_cash.id is null then raise exception using errcode='22023',message='EXPENSE_CASH_ACCOUNT_NOT_FOUND'; end if;
    insert into public.cash_ledger(account_id,branch_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by)
    values(v_cash.id,d.branch_id,auth.uid(),'employee_advance_return',round(p_amount,2),'employee_advance',d.id,'رد متبقي عهدة '||d.document_number,jsonb_build_object('employee_id',d.employee_id,'note',nullif(trim(coalesce(p_note,'')),'')),auth.uid()) returning id into v_cash_ledger;
    v_method:='cash';
  elsif p_source_kind in ('bank','payment_account') then
    select * into v_pay from public.payment_accounts where id=p_source_account_id and branch_id=d.branch_id and active for update;
    if v_pay.id is null or (p_source_kind='bank' and v_pay.account_type<>'bank') then raise exception using errcode='22023',message='EXPENSE_PAYMENT_ACCOUNT_NOT_FOUND'; end if;
    v_method:=coalesce(nullif(v_pay.provider_code,''),v_pay.account_type);
    insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
    values(v_pay.id,d.branch_id,'employee_advance_return',round(p_amount,2),v_method,nullif(trim(coalesce(p_provider_reference,'')),''),'رد متبقي عهدة '||d.document_number,jsonb_build_object('expense_document_id',d.id,'employee_id',d.employee_id),auth.uid()) returning id into v_pay_ledger;
  else raise exception using errcode='22023',message='INVALID_ADVANCE_RETURN_SOURCE'; end if;
  insert into private.employee_advance_settlements_v2(request_id,expense_document_id,branch_id,employee_id,settlement_type,amount,description,source_kind,source_account_id,provider_reference,cash_ledger_entry_id,payment_ledger_entry_id,settled_by)
  values(p_request_id,d.id,d.branch_id,d.employee_id,'cash_return',round(p_amount,2),'رد متبقي عهدة',p_source_kind,p_source_account_id,nullif(trim(coalesce(p_provider_reference,'')),''),v_cash_ledger,v_pay_ledger,auth.uid()) returning * into s;
  perform private.expense_write_audit_v2(d.id,'advance_cash_return',auth.uid(),p_note,jsonb_build_object('settlement_id',s.id,'amount',p_amount,'source_kind',p_source_kind,'source_account_id',p_source_account_id));
  perform private.employee_advance_notify_v2(d.id,'expense.advance_return','تم رد جزء من العهدة',d.document_number||' · تم رد '||round(p_amount,2)||' ج.م','return:'||s.id::text,'normal');
  return to_jsonb(s)||jsonb_build_object('remaining_amount',private.employee_advance_outstanding_v2(d.id));
end $$;

create or replace function public.get_employee_advance_workspace_v2(p_branch_id uuid,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_docs jsonb; v_employees jsonb; v_sources jsonb; v_categories jsonb; v_summary jsonb; v_limit int:=least(greatest(coalesce(p_limit,100),10),300); begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.view',p_branch_id) or public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id) or public.staff_has_permission('expense.manage_advances',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_VIEW_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',e.user_id,'employee_code',e.employee_code,'name',coalesce(nullif(u.name,''),e.employee_code),'primary_branch_id',e.primary_branch_id) order by coalesce(nullif(u.name,''),e.employee_code)),'[]'::jsonb)
  into v_employees from private.hr_employee_profiles e left join public.users u on u.id=e.user_id where e.employment_status='active' and e.primary_branch_id=p_branch_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name_ar',c.name_ar,'group_name_ar',c.group_name_ar,'receipt_required_above',c.receipt_required_above) order by c.group_name_ar,c.name_ar),'[]'::jsonb)
  into v_categories from private.expense_categories_v2 c where c.active and c.accounting_treatment='opex' and (c.branch_id is null or c.branch_id=p_branch_id);
  with sources as (
    select ca.id account_id,'branch_safe'::text source_kind,ca.name,ca.currency,private.cash_account_balance(ca.id) balance,ca.account_type,null::text provider_code from public.cash_accounts ca where ca.branch_id=p_branch_id and ca.active and ca.account_type='branch_safe'
    union all
    select pa.id,case when pa.account_type='bank' then 'bank' else 'payment_account' end,pa.name,pa.currency,private.payment_account_balance(pa.id),pa.account_type,pa.provider_code from public.payment_accounts pa where pa.branch_id=p_branch_id and pa.active
  ) select coalesce(jsonb_agg(jsonb_build_object('account_id',account_id,'source_kind',source_kind,'name',name,'currency',currency,'balance',balance,'account_type',account_type,'provider_code',provider_code) order by source_kind,name),'[]'::jsonb) into v_sources from sources;
  with docs as (
    select d.*,coalesce(nullif(u.name,''),e.employee_code,d.beneficiary_name,'موظف') employee_name,
      coalesce((select sum(s.amount) from private.employee_advance_settlements_v2 s where s.expense_document_id=d.id and s.status='active'),0)::numeric settled_amount
    from private.expense_documents_v2 d left join private.hr_employee_profiles e on e.user_id=d.employee_id left join public.users u on u.id=d.employee_id
    where d.branch_id=p_branch_id and d.accounting_treatment='employee_advance' order by d.created_at desc limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(docs)||jsonb_build_object('employee_name',employee_name,'settled_amount',settled_amount,'advance_outstanding',greatest(paid_amount-settled_amount,0),
    'undisbursed_amount',greatest(amount-paid_amount,0),'settlement_status',case when paid_amount<=0 then 'not_disbursed' when greatest(paid_amount-settled_amount,0)<=0 then 'settled' else 'open' end,
    'settlements',coalesce((select jsonb_agg(to_jsonb(s) order by s.settled_at desc) from private.employee_advance_settlements_v2 s where s.expense_document_id=docs.id),'[]'::jsonb)) order by created_at desc),'[]'::jsonb)
  into v_docs from docs;
  select jsonb_build_object('requested_amount',coalesce(sum(amount) filter(where status not in ('rejected','cancelled','voided')),0),'disbursed_amount',coalesce(sum(paid_amount) filter(where status not in ('rejected','cancelled','voided')),0),
    'unsettled_amount',coalesce(sum(greatest(paid_amount-coalesce((select sum(s.amount) from private.employee_advance_settlements_v2 s where s.expense_document_id=d.id and s.status='active'),0),0)) filter(where status not in ('rejected','cancelled','voided')),0),
    'open_advances',count(*) filter(where status not in ('rejected','cancelled','voided') and paid_amount>coalesce((select sum(s.amount) from private.employee_advance_settlements_v2 s where s.expense_document_id=d.id and s.status='active'),0)))
  into v_summary from private.expense_documents_v2 d where d.branch_id=p_branch_id and d.accounting_treatment='employee_advance';
  return jsonb_build_object('version',2,'branch_id',p_branch_id,'summary',v_summary,'documents',v_docs,'employees',v_employees,'payout_sources',v_sources,'expense_categories',v_categories,
    'permissions',jsonb_build_object('can_manage',public.staff_has_permission('expense.manage_advances',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)));
end $$;

revoke all on table private.employee_advance_settlements_v2 from public,anon,authenticated;
revoke all on function private.employee_advance_notify_v2(uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function private.employee_advance_outstanding_v2(uuid) from public,anon,authenticated;
revoke all on function public.create_employee_advance_request_v2(uuid,uuid,uuid,numeric,text,date,text) from public,anon;
revoke all on function public.disburse_employee_advance_v2(uuid,uuid,text,uuid,numeric,numeric,text,text) from public,anon;
revoke all on function public.settle_employee_advance_expense_v2(uuid,uuid,uuid,numeric,text,text,text,text) from public,anon;
revoke all on function public.settle_employee_advance_return_v2(uuid,uuid,text,uuid,numeric,text,text) from public,anon;
revoke all on function public.get_employee_advance_workspace_v2(uuid,integer) from public,anon;
grant execute on function public.create_employee_advance_request_v2(uuid,uuid,uuid,numeric,text,date,text) to authenticated;
grant execute on function public.disburse_employee_advance_v2(uuid,uuid,text,uuid,numeric,numeric,text,text) to authenticated;
grant execute on function public.settle_employee_advance_expense_v2(uuid,uuid,uuid,numeric,text,text,text,text) to authenticated;
grant execute on function public.settle_employee_advance_return_v2(uuid,uuid,text,uuid,numeric,text,text) to authenticated;
grant execute on function public.get_employee_advance_workspace_v2(uuid,integer) to authenticated;
