create table if not exists private.expense_categories_v2 (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  code text not null,
  name_ar text not null,
  group_name_ar text not null default 'مصروفات تشغيلية',
  accounting_treatment text not null default 'opex' check (accounting_treatment in ('opex','capex','prepaid','employee_advance')),
  active boolean not null default true,
  approval_required boolean not null default true,
  require_independent_approval boolean not null default true,
  auto_approve_limit numeric(14,2) not null default 0 check (auto_approve_limit>=0),
  receipt_required_above numeric(14,2) not null default 0 check (receipt_required_above>=0),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists expense_categories_v2_global_code_uq on private.expense_categories_v2(code) where branch_id is null;
create unique index if not exists expense_categories_v2_branch_code_uq on private.expense_categories_v2(branch_id,code) where branch_id is not null;

create table if not exists private.expense_documents_v2 (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  document_number text not null unique,
  branch_id uuid not null references public.branches(id),
  category_id uuid not null references private.expense_categories_v2(id),
  category_code text not null,
  category_name text not null,
  accounting_treatment text not null check (accounting_treatment in ('opex','capex','prepaid','employee_advance')),
  amount numeric(14,2) not null check (amount>0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount>=0),
  beneficiary_name text,
  supplier_id uuid,
  employee_id uuid,
  invoice_number text,
  tax_amount numeric(14,2) not null default 0 check (tax_amount>=0),
  description text not null,
  notes text,
  incurred_at timestamptz not null default now(),
  receipt_url text,
  source text not null default 'business' check (source in ('business','pos','import')),
  pos_shift_id uuid references public.pos_shifts(id),
  pos_device_id uuid references public.pos_devices(id),
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','partially_paid','paid','rejected','cancelled','voided')),
  requested_by uuid not null,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  rejection_reason text,
  voided_by uuid,
  voided_at timestamptz,
  void_reason text,
  linked_expense_id uuid references public.expenses(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid_amount<=amount)
);
create index if not exists expense_documents_v2_branch_status_idx on private.expense_documents_v2(branch_id,status,incurred_at desc);
create index if not exists expense_documents_v2_requester_idx on private.expense_documents_v2(requested_by,created_at desc);
create index if not exists expense_documents_v2_shift_idx on private.expense_documents_v2(pos_shift_id,status) where pos_shift_id is not null;

create table if not exists private.expense_payments_v2 (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  expense_document_id uuid not null references private.expense_documents_v2(id),
  branch_id uuid not null references public.branches(id),
  source_kind text not null check (source_kind in ('branch_safe','pos_drawer','bank','payment_account')),
  source_account_id uuid not null,
  amount numeric(14,2) not null check (amount>0),
  fee_amount numeric(14,2) not null default 0 check (fee_amount>=0),
  provider_reference text,
  cash_ledger_entry_id uuid references public.cash_ledger(id),
  payment_ledger_entry_id uuid references public.payment_ledger(id),
  fee_ledger_entry_id uuid references public.payment_ledger(id),
  fee_expense_id uuid references public.expenses(id),
  shift_id uuid references public.pos_shifts(id),
  status text not null default 'active' check (status in ('active','reversed')),
  paid_by uuid not null,
  paid_at timestamptz not null default now(),
  reversed_by uuid,
  reversed_at timestamptz,
  reverse_reason text,
  created_at timestamptz not null default now()
);
create index if not exists expense_payments_v2_document_idx on private.expense_payments_v2(expense_document_id,paid_at desc);

create table if not exists private.expense_audit_v2 (
  id uuid primary key default gen_random_uuid(),
  expense_document_id uuid not null references private.expense_documents_v2(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  event_type text not null,
  actor_user_id uuid,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists expense_audit_v2_document_idx on private.expense_audit_v2(expense_document_id,created_at desc);

alter table public.expenses add column if not exists expense_document_id uuid;
alter table public.expenses add column if not exists expense_category_id uuid;
alter table public.expenses add column if not exists accounting_treatment text;
alter table public.expenses add column if not exists beneficiary_name text;
alter table public.expenses add column if not exists invoice_number text;
create unique index if not exists expenses_expense_document_uq on public.expenses(expense_document_id) where expense_document_id is not null;

insert into public.staff_permissions(code,name_ar,module,description) values
 ('expense.view','عرض المصروفات','finance','عرض مركز المصروفات ومستنداته'),
 ('expense.request','طلب مصروف','finance','إنشاء طلب مصروف وإرساله للموافقة'),
 ('expense.approve','اعتماد المصروفات','finance','اعتماد أو رفض طلبات المصروفات'),
 ('expense.pay','صرف المصروفات','finance','تنفيذ دفعات المصروفات من الخزن والحسابات'),
 ('expense.manage_categories','إدارة بنود المصروفات','finance','إدارة بنود وسياسات المصروفات')
on conflict(code) do update set name_ar=excluded.name_ar,module=excluded.module,description=excluded.description;

insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r cross join public.staff_permissions p
where r.active and p.code in ('expense.view','expense.request','expense.approve','expense.pay','expense.manage_categories')
  and (r.code in ('accountant','branch_admin','branch_manager','super_admin') or exists(
    select 1 from public.staff_role_permissions rp2 join public.staff_permissions fp on fp.id=rp2.permission_id
    where rp2.role_id=r.id and fp.code='finance.manage'
  ))
on conflict do nothing;
insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r join public.staff_permissions p on p.code='expense.request'
where r.active and r.code='cashier'
on conflict do nothing;

insert into private.expense_categories_v2(branch_id,code,name_ar,group_name_ar,accounting_treatment,approval_required,require_independent_approval,auto_approve_limit,receipt_required_above) values
 (null,'rent','إيجارات','تشغيل الفروع','opex',true,true,0,0),
 (null,'electricity','كهرباء','مرافق','opex',true,true,0,0),
 (null,'water','مياه','مرافق','opex',true,true,0,0),
 (null,'gas','غاز','مرافق','opex',true,true,0,0),
 (null,'maintenance','صيانة','تشغيل الفروع','opex',true,true,0,0),
 (null,'transport','نقل وانتقالات','تشغيل الفروع','opex',true,true,0,0),
 (null,'cleaning','نظافة','تشغيل الفروع','opex',true,true,0,0),
 (null,'consumables','أدوات ومستهلكات','تشغيل الفروع','opex',true,true,0,0),
 (null,'packaging','تعبئة وتغليف','تشغيل الفروع','opex',true,true,0,0),
 (null,'marketing','تسويق وإعلانات','تسويق','opex',true,true,0,0),
 (null,'subscriptions','اشتراكات وبرامج','إدارة','prepaid',true,true,0,0),
 (null,'government_fees','رسوم حكومية','إدارة','opex',true,true,0,0),
 (null,'bank_fees','رسوم بنكية','مالية','opex',true,true,0,0),
 (null,'hospitality','ضيافة','إدارة','opex',true,true,0,0),
 (null,'equipment','معدات وأصول','أصول','capex',true,true,0,0),
 (null,'employee_advance','عهدة / سلفة موظف','عهد وسلف','employee_advance',true,true,0,0),
 (null,'other','مصروفات متنوعة','أخرى','opex',true,true,0,0)
on conflict do nothing;

create or replace function private.expense_document_number_v2()
returns text language plpgsql security definer set search_path='' as $$
declare v_seq bigint; begin
  perform pg_advisory_xact_lock(hashtextextended('expense-document-number',0));
  select coalesce(max((regexp_match(document_number,'([0-9]+)$'))[1]::bigint),0)+1 into v_seq
  from private.expense_documents_v2 where document_number like 'EXP-'||to_char(now(),'YYYY')||'-%';
  return 'EXP-'||to_char(now(),'YYYY')||'-'||lpad(v_seq::text,6,'0');
end $$;

create or replace function private.expense_write_audit_v2(p_document_id uuid,p_event text,p_actor uuid,p_note text default null,p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare v_branch uuid; begin
  select branch_id into v_branch from private.expense_documents_v2 where id=p_document_id;
  if v_branch is null then return; end if;
  insert into private.expense_audit_v2(expense_document_id,branch_id,event_type,actor_user_id,note,metadata)
  values(p_document_id,v_branch,p_event,p_actor,nullif(trim(coalesce(p_note,'')),''),coalesce(p_metadata,'{}'::jsonb));
end $$;

create or replace function private.expense_recognize_v2(p_document_id uuid,p_actor uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare d private.expense_documents_v2%rowtype; v_expense uuid; begin
  select * into d from private.expense_documents_v2 where id=p_document_id for update;
  if d.id is null then raise exception using errcode='22023',message='EXPENSE_DOCUMENT_NOT_FOUND'; end if;
  if d.linked_expense_id is not null then return d.linked_expense_id; end if;
  if d.accounting_treatment='employee_advance' then return null; end if;
  insert into public.expenses(type,amount,description,date,receipt_url,branch_id,payment_method,created_by,status,
    expense_document_id,expense_category_id,accounting_treatment,beneficiary_name,invoice_number)
  values(d.category_name,d.amount,d.description,d.incurred_at,d.receipt_url,d.branch_id,'unpaid',d.requested_by,'active',
    d.id,d.category_id,d.accounting_treatment,d.beneficiary_name,d.invoice_number)
  returning id into v_expense;
  update private.expense_documents_v2 set linked_expense_id=v_expense,updated_at=now() where id=d.id;
  perform private.expense_write_audit_v2(d.id,'recognized',p_actor,null,jsonb_build_object('expense_id',v_expense));
  return v_expense;
end $$;

create or replace function private.expense_create_approval_task_v2(p_document_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare d private.expense_documents_v2%rowtype; v_task uuid; begin
  select * into d from private.expense_documents_v2 where id=p_document_id;
  if d.id is null or d.status<>'pending_approval' then return null; end if;
  insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,metadata,created_by)
  values(d.branch_id,'expense_approval','expense_approval',d.id,d.amount,'normal','open','مراجعة مصروف '||d.document_number,
    d.category_name||' · '||d.description,
    jsonb_build_object('expense_document_id',d.id,'document_number',d.document_number,'category',d.category_name,'requested_by',d.requested_by),d.requested_by)
  on conflict(task_type,source_kind,source_id) do update set amount=excluded.amount,title=excluded.title,description=excluded.description,metadata=excluded.metadata,updated_at=now()
  returning id into v_task;
  insert into private.notification_events_v2(audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at)
  select 'staff',u.id,d.branch_id,'expense.approval_required','finance','normal','مصروف بانتظار الاعتماد',
    d.document_number||' · '||d.category_name||' · '||to_char(d.amount,'FM9999999990.00')||' ج.م',
    'expense_approval',d.id,'/finance/expenses','مراجعة المصروف',true,'expense-approval:'||d.id::text,array['in_app']::text[],'active',
    jsonb_build_object('document_number',d.document_number,'amount',d.amount,'category',d.category_name),now(),now()
  from public.users u
  where coalesce(u.active,true) and private.staff_user_has_permission_v3(u.id,'expense.approve',d.branch_id)
  on conflict(recipient_user_id,dedupe_key) do update set status='active',resolved_at=null,updated_at=now(),body=excluded.body,metadata=excluded.metadata;
  return v_task;
end $$;

create or replace function public.create_expense_request_v2(
  p_request_id uuid,p_branch_id uuid,p_category_id uuid,p_amount numeric,p_description text,
  p_beneficiary_name text default null,p_invoice_number text default null,p_tax_amount numeric default 0,
  p_incurred_at timestamptz default now(),p_receipt_url text default null,p_notes text default null,p_submit boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.expense_categories_v2%rowtype; d private.expense_documents_v2%rowtype; v_status text; v_auto boolean; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.request',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_REQUEST_DENIED'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='REQUEST_ID_REQUIRED'; end if;
  select * into d from private.expense_documents_v2 where request_id=p_request_id;
  if d.id is not null then return to_jsonb(d); end if;
  if coalesce(p_amount,0)<=0 or nullif(trim(coalesce(p_description,'')),'') is null then raise exception using errcode='22023',message='EXPENSE_DETAILS_REQUIRED'; end if;
  select * into c from private.expense_categories_v2 where id=p_category_id and active and (branch_id is null or branch_id=p_branch_id);
  if c.id is null then raise exception using errcode='22023',message='EXPENSE_CATEGORY_NOT_FOUND'; end if;
  if c.receipt_required_above>0 and p_amount>=c.receipt_required_above and nullif(trim(coalesce(p_receipt_url,'')),'') is null then raise exception using errcode='22023',message='EXPENSE_RECEIPT_REQUIRED'; end if;
  v_auto:=p_submit and (not c.approval_required or (c.auto_approve_limit>0 and p_amount<=c.auto_approve_limit));
  v_status:=case when not p_submit then 'draft' when v_auto then 'approved' else 'pending_approval' end;
  insert into private.expense_documents_v2(request_id,document_number,branch_id,category_id,category_code,category_name,accounting_treatment,amount,
    beneficiary_name,invoice_number,tax_amount,description,notes,incurred_at,receipt_url,source,status,requested_by,submitted_at,approved_by,approved_at)
  values(p_request_id,private.expense_document_number_v2(),p_branch_id,c.id,c.code,c.name_ar,c.accounting_treatment,round(p_amount,2),
    nullif(trim(coalesce(p_beneficiary_name,'')),''),nullif(trim(coalesce(p_invoice_number,'')),''),round(coalesce(p_tax_amount,0),2),trim(p_description),
    nullif(trim(coalesce(p_notes,'')),''),coalesce(p_incurred_at,now()),nullif(trim(coalesce(p_receipt_url,'')),''),'business',v_status,auth.uid(),case when p_submit then now() end,
    case when v_auto then auth.uid() end,case when v_auto then now() end)
  returning * into d;
  perform private.expense_write_audit_v2(d.id,case when p_submit then 'submitted' else 'draft_created' end,auth.uid(),null,jsonb_build_object('status',v_status));
  if v_auto then perform private.expense_recognize_v2(d.id,auth.uid()); else perform private.expense_create_approval_task_v2(d.id); end if;
  select * into d from private.expense_documents_v2 where id=d.id;
  return to_jsonb(d);
end $$;

create or replace function public.decide_expense_request_v2(p_document_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.expense_documents_v2%rowtype; c private.expense_categories_v2%rowtype; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into d from private.expense_documents_v2 where id=p_document_id for update;
  if d.id is null then raise exception using errcode='22023',message='EXPENSE_DOCUMENT_NOT_FOUND'; end if;
  if not (public.staff_has_permission('expense.approve',d.branch_id) or public.staff_has_permission('finance.manage',d.branch_id)) then raise exception using errcode='42501',message='EXPENSE_APPROVE_DENIED'; end if;
  if d.status<>'pending_approval' then raise exception using errcode='22023',message='EXPENSE_NOT_PENDING_APPROVAL'; end if;
  select * into c from private.expense_categories_v2 where id=d.category_id;
  if p_decision not in ('approve','reject') then raise exception using errcode='22023',message='INVALID_DECISION'; end if;
  if p_decision='approve' and c.require_independent_approval and d.requested_by=auth.uid() and not private.staff_is_super_admin(auth.uid()) then raise exception using errcode='42501',message='EXPENSE_SELF_APPROVAL_DENIED'; end if;
  if p_decision='approve' then
    update private.expense_documents_v2 set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=d.id;
    perform private.expense_recognize_v2(d.id,auth.uid());
    perform private.expense_write_audit_v2(d.id,'approved',auth.uid(),p_note);
  else
    update private.expense_documents_v2 set status='rejected',rejected_by=auth.uid(),rejected_at=now(),rejection_reason=nullif(trim(coalesce(p_note,'')),''),updated_at=now() where id=d.id;
    perform private.expense_write_audit_v2(d.id,'rejected',auth.uid(),p_note);
  end if;
  update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),metadata=metadata||jsonb_build_object('decision',p_decision,'decision_note',nullif(trim(coalesce(p_note,'')),''))
  where task_type='expense_approval' and source_kind='expense_approval' and source_id=d.id and status not in ('completed','cancelled');
  update private.notification_events_v2 set status='resolved',resolved_at=coalesce(resolved_at,now()),updated_at=now()
  where source_kind='expense_approval' and source_id=d.id and status='active';
  select * into d from private.expense_documents_v2 where id=d.id;
  return to_jsonb(d);
end $$;

create or replace function public.pay_expense_v2(
  p_request_id uuid,p_document_id uuid,p_source_kind text,p_source_account_id uuid,p_amount numeric,
  p_actual_fee numeric default 0,p_provider_reference text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.expense_documents_v2%rowtype; v_payment private.expense_payments_v2%rowtype; v_cash public.cash_accounts%rowtype; v_pay public.payment_accounts%rowtype;
  v_remaining numeric; v_balance numeric; v_cash_ledger uuid; v_pay_ledger uuid; v_fee_ledger uuid; v_fee_expense uuid; v_method text; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='REQUEST_ID_REQUIRED'; end if;
  select * into v_payment from private.expense_payments_v2 where request_id=p_request_id;
  if v_payment.id is not null then return to_jsonb(v_payment); end if;
  select * into d from private.expense_documents_v2 where id=p_document_id for update;
  if d.id is null then raise exception using errcode='22023',message='EXPENSE_DOCUMENT_NOT_FOUND'; end if;
  if not (public.staff_has_permission('expense.pay',d.branch_id) or public.staff_has_permission('finance.manage',d.branch_id)) then raise exception using errcode='42501',message='EXPENSE_PAY_DENIED'; end if;
  if d.status not in ('approved','partially_paid') then raise exception using errcode='22023',message='EXPENSE_NOT_PAYABLE'; end if;
  if d.accounting_treatment='employee_advance' then raise exception using errcode='22023',message='EMPLOYEE_ADVANCE_USE_DEDICATED_FLOW'; end if;
  v_remaining:=round(d.amount-d.paid_amount,2);
  if coalesce(p_amount,0)<=0 or round(p_amount,2)>v_remaining then raise exception using errcode='22023',message='INVALID_EXPENSE_PAYMENT_AMOUNT'; end if;
  if coalesce(p_actual_fee,0)<0 then raise exception using errcode='22023',message='INVALID_ACTUAL_FEE'; end if;
  if p_source_kind='pos_drawer' then raise exception using errcode='42501',message='POS_DRAWER_REQUIRES_CASHIER_CONFIRMATION'; end if;
  if p_source_kind='branch_safe' then
    select * into v_cash from public.cash_accounts where id=p_source_account_id and branch_id=d.branch_id and active and account_type='branch_safe' for update;
    if v_cash.id is null then raise exception using errcode='22023',message='EXPENSE_CASH_ACCOUNT_NOT_FOUND'; end if;
    perform pg_advisory_xact_lock(hashtextextended('cash-account:'||v_cash.id::text,51));
    v_balance:=private.cash_account_balance(v_cash.id);
    if v_balance<round(p_amount,2) then raise exception using errcode='22003',message='INSUFFICIENT_EXPENSE_SOURCE_BALANCE'; end if;
    insert into public.cash_ledger(account_id,branch_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by)
    values(v_cash.id,d.branch_id,auth.uid(),'expense_cash',-round(p_amount,2),'expense_document',d.id,'صرف مصروف '||d.document_number||' - '||d.category_name,
      jsonb_build_object('document_number',d.document_number,'note',nullif(trim(coalesce(p_note,'')),'')),auth.uid()) returning id into v_cash_ledger;
    v_method:='cash';
  elsif p_source_kind in ('bank','payment_account') then
    select * into v_pay from public.payment_accounts where id=p_source_account_id and branch_id=d.branch_id and active for update;
    if v_pay.id is null or (p_source_kind='bank' and v_pay.account_type<>'bank') then raise exception using errcode='22023',message='EXPENSE_PAYMENT_ACCOUNT_NOT_FOUND'; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_pay.id::text,0));
    v_balance:=private.payment_account_balance(v_pay.id);
    if v_balance<round(p_amount+coalesce(p_actual_fee,0),2) then raise exception using errcode='22003',message='INSUFFICIENT_EXPENSE_SOURCE_BALANCE'; end if;
    v_method:=coalesce(nullif(v_pay.provider_code,''),v_pay.account_type);
    insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
    values(v_pay.id,d.branch_id,'expense_payment',-round(p_amount,2),v_method,nullif(trim(coalesce(p_provider_reference,'')),''),'صرف مصروف '||d.document_number||' - '||d.category_name,
      jsonb_build_object('expense_document_id',d.id,'document_number',d.document_number),auth.uid()) returning id into v_pay_ledger;
    if coalesce(p_actual_fee,0)>0 then
      insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
      values(v_pay.id,d.branch_id,'expense_payment_fee',-round(p_actual_fee,2),v_method,nullif(trim(coalesce(p_provider_reference,'')),''),'رسوم دفع المصروف '||d.document_number,
        jsonb_build_object('expense_document_id',d.id),auth.uid()) returning id into v_fee_ledger;
      insert into public.expenses(type,amount,description,date,branch_id,payment_method,created_by,status,accounting_treatment,beneficiary_name)
      values('رسوم دفع مصروف',round(p_actual_fee,2),'رسوم دفع مرتبطة بـ '||d.document_number,now(),d.branch_id,v_method,auth.uid(),'active','opex',v_pay.name)
      returning id into v_fee_expense;
    end if;
  else raise exception using errcode='22023',message='INVALID_EXPENSE_SOURCE'; end if;
  insert into private.expense_payments_v2(request_id,expense_document_id,branch_id,source_kind,source_account_id,amount,fee_amount,provider_reference,
    cash_ledger_entry_id,payment_ledger_entry_id,fee_ledger_entry_id,fee_expense_id,paid_by)
  values(p_request_id,d.id,d.branch_id,p_source_kind,p_source_account_id,round(p_amount,2),round(coalesce(p_actual_fee,0),2),nullif(trim(coalesce(p_provider_reference,'')),''),
    v_cash_ledger,v_pay_ledger,v_fee_ledger,v_fee_expense,auth.uid()) returning * into v_payment;
  update private.expense_documents_v2 set paid_amount=round(paid_amount+p_amount,2),status=case when round(paid_amount+p_amount,2)>=amount then 'paid' else 'partially_paid' end,updated_at=now() where id=d.id;
  if d.linked_expense_id is not null then update public.expenses set payment_method=case when coalesce(payment_method,'unpaid') in ('unpaid',v_method) then v_method else 'mixed' end,updated_at=now() where id=d.linked_expense_id; end if;
  perform private.expense_write_audit_v2(d.id,'payment',auth.uid(),p_note,jsonb_build_object('payment_id',v_payment.id,'amount',p_amount,'fee',coalesce(p_actual_fee,0),'source_kind',p_source_kind,'source_account_id',p_source_account_id));
  return to_jsonb(v_payment)||jsonb_build_object('document',(select to_jsonb(x) from private.expense_documents_v2 x where x.id=d.id));
end $$;

create or replace function public.reverse_expense_payment_v2(p_payment_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p private.expense_payments_v2%rowtype; d private.expense_documents_v2%rowtype; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into p from private.expense_payments_v2 where id=p_payment_id for update;
  if p.id is null then raise exception using errcode='22023',message='EXPENSE_PAYMENT_NOT_FOUND'; end if;
  if p.status='reversed' then return to_jsonb(p); end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception using errcode='22023',message='REVERSAL_REASON_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.pay',p.branch_id) or public.staff_has_permission('finance.manage',p.branch_id)) then raise exception using errcode='42501',message='EXPENSE_PAY_DENIED'; end if;
  select * into d from private.expense_documents_v2 where id=p.expense_document_id for update;
  if p.source_kind in ('branch_safe','pos_drawer') then
    insert into public.cash_ledger(account_id,branch_id,shift_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by)
    values(p.source_account_id,p.branch_id,p.shift_id,auth.uid(),'expense_void',p.amount,'expense_payment_reversal',p.id,'عكس دفعة مصروف '||d.document_number,jsonb_build_object('reason',trim(p_reason)),auth.uid());
  else
    insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
    values(p.source_account_id,p.branch_id,'expense_payment_void',p.amount,coalesce((select provider_code from public.payment_accounts where id=p.source_account_id),'payment'),p.provider_reference,'عكس دفعة مصروف '||d.document_number,jsonb_build_object('reason',trim(p_reason)),auth.uid());
    if p.fee_amount>0 then insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
      values(p.source_account_id,p.branch_id,'expense_payment_fee_void',p.fee_amount,coalesce((select provider_code from public.payment_accounts where id=p.source_account_id),'payment'),p.provider_reference,'عكس رسوم دفعة مصروف '||d.document_number,jsonb_build_object('reason',trim(p_reason)),auth.uid()); end if;
    if p.fee_expense_id is not null then update public.expenses set status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason),updated_at=now() where id=p.fee_expense_id; end if;
  end if;
  update private.expense_payments_v2 set status='reversed',reversed_by=auth.uid(),reversed_at=now(),reverse_reason=trim(p_reason) where id=p.id returning * into p;
  update private.expense_documents_v2 set paid_amount=greatest(round(paid_amount-p.amount,2),0),status=case when greatest(round(paid_amount-p.amount,2),0)=0 then 'approved' else 'partially_paid' end,updated_at=now() where id=d.id;
  perform private.expense_write_audit_v2(d.id,'payment_reversed',auth.uid(),p_reason,jsonb_build_object('payment_id',p.id,'amount',p.amount));
  return to_jsonb(p)||jsonb_build_object('document',(select to_jsonb(x) from private.expense_documents_v2 x where x.id=d.id));
end $$;

create or replace function public.void_expense_request_v2(p_document_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.expense_documents_v2%rowtype; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into d from private.expense_documents_v2 where id=p_document_id for update;
  if d.id is null then raise exception using errcode='22023',message='EXPENSE_DOCUMENT_NOT_FOUND'; end if;
  if not (public.staff_has_permission('expense.approve',d.branch_id) or public.staff_has_permission('finance.manage',d.branch_id)) then raise exception using errcode='42501',message='EXPENSE_VOID_DENIED'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception using errcode='22023',message='VOID_REASON_REQUIRED'; end if;
  if exists(select 1 from private.expense_payments_v2 where expense_document_id=d.id and status='active') then raise exception using errcode='55000',message='REVERSE_EXPENSE_PAYMENTS_FIRST'; end if;
  if d.status in ('voided','cancelled','rejected') then return to_jsonb(d); end if;
  update private.expense_documents_v2 set status='voided',voided_by=auth.uid(),voided_at=now(),void_reason=trim(p_reason),updated_at=now() where id=d.id;
  if d.linked_expense_id is not null then update public.expenses set status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason),updated_at=now() where id=d.linked_expense_id; end if;
  update public.operations_tasks set status='cancelled',updated_at=now(),failure_reason=trim(p_reason) where source_kind='expense_approval' and source_id=d.id and status not in ('completed','cancelled');
  update private.notification_events_v2 set status='resolved',resolved_at=coalesce(resolved_at,now()),updated_at=now() where source_kind='expense_approval' and source_id=d.id and status='active';
  perform private.expense_write_audit_v2(d.id,'voided',auth.uid(),p_reason);
  select * into d from private.expense_documents_v2 where id=d.id; return to_jsonb(d);
end $$;

create or replace function public.get_expense_workspace_v2(p_branch_id uuid,p_status text default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_docs jsonb; v_categories jsonb; v_sources jsonb; v_summary jsonb; v_limit int:=least(greatest(coalesce(p_limit,100),10),300); begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.view',p_branch_id) or public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_VIEW_DENIED'; end if;
  with preferred as (
    select distinct on(code) id,code,name_ar,group_name_ar,accounting_treatment,active,approval_required,require_independent_approval,auto_approve_limit,receipt_required_above,branch_id
    from private.expense_categories_v2 where active and (branch_id is null or branch_id=p_branch_id)
    order by code,(branch_id is null),updated_at desc
  ) select coalesce(jsonb_agg(to_jsonb(preferred) order by group_name_ar,name_ar),'[]'::jsonb) into v_categories from preferred;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',x.id,'document_number',x.document_number,'branch_id',x.branch_id,'category_id',x.category_id,'category_code',x.category_code,'category_name',x.category_name,
    'accounting_treatment',x.accounting_treatment,'amount',x.amount,'paid_amount',x.paid_amount,'remaining_amount',round(x.amount-x.paid_amount,2),'beneficiary_name',x.beneficiary_name,
    'invoice_number',x.invoice_number,'tax_amount',x.tax_amount,'description',x.description,'notes',x.notes,'incurred_at',x.incurred_at,'receipt_url',x.receipt_url,'source',x.source,
    'status',x.status,'requested_by',x.requested_by,'requested_by_name',coalesce(u.name,'—'),'approved_by',x.approved_by,'approved_by_name',coalesce(a.name,'—'),'approved_at',x.approved_at,
    'rejection_reason',x.rejection_reason,'linked_expense_id',x.linked_expense_id,'pos_shift_id',x.pos_shift_id,'created_at',x.created_at,
    'payments',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'source_kind',p.source_kind,'source_account_id',p.source_account_id,'amount',p.amount,'fee_amount',p.fee_amount,
      'provider_reference',p.provider_reference,'status',p.status,'paid_by',p.paid_by,'paid_by_name',coalesce(pu.name,'—'),'paid_at',p.paid_at,'reverse_reason',p.reverse_reason) order by p.paid_at desc)
      from private.expense_payments_v2 p left join public.users pu on pu.id=p.paid_by where p.expense_document_id=x.id),'[]'::jsonb)
  ) order by x.created_at desc),'[]'::jsonb) into v_docs
  from (select * from private.expense_documents_v2 where branch_id=p_branch_id and (p_status is null or status=p_status) order by created_at desc limit v_limit) x
  left join public.users u on u.id=x.requested_by left join public.users a on a.id=x.approved_by;
  select jsonb_build_object(
    'total_documents',count(*),'pending_approval',count(*) filter(where status='pending_approval'),'approved_unpaid',count(*) filter(where status='approved'),
    'partially_paid',count(*) filter(where status='partially_paid'),'paid',count(*) filter(where status='paid'),
    'recognized_amount',round(coalesce(sum(amount) filter(where status in ('approved','partially_paid','paid')),0),2),
    'paid_amount',round(coalesce(sum(paid_amount) filter(where status in ('partially_paid','paid')),0),2),
    'outstanding_amount',round(coalesce(sum(amount-paid_amount) filter(where status in ('approved','partially_paid')),0),2)
  ) into v_summary from private.expense_documents_v2 where branch_id=p_branch_id;
  with s as (
    select ca.id account_id,'branch_safe'::text source_kind,ca.name,ca.currency,private.cash_account_balance(ca.id) balance,ca.account_type,null::text provider_code
    from public.cash_accounts ca where ca.branch_id=p_branch_id and ca.account_type='branch_safe' and ca.active
    union all
    select pa.id,case when pa.account_type='bank' then 'bank' else 'payment_account' end,pa.name,pa.currency,private.payment_account_balance(pa.id),pa.account_type,pa.provider_code
    from public.payment_accounts pa where pa.branch_id=p_branch_id and pa.active and pa.account_type in ('bank','gateway_clearing')
  ) select coalesce(jsonb_agg(jsonb_build_object('account_id',account_id,'source_kind',source_kind,'name',name,'currency',currency,'balance',round(balance,2),'account_type',account_type,'provider_code',provider_code) order by source_kind,name),'[]'::jsonb) into v_sources from s;
  return jsonb_build_object('version',2,'branch_id',p_branch_id,'summary',coalesce(v_summary,'{}'::jsonb),'categories',v_categories,'documents',v_docs,'payout_sources',v_sources,
    'permissions',jsonb_build_object('can_request',public.staff_has_permission('expense.request',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id),
      'can_approve',public.staff_has_permission('expense.approve',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id),
      'can_pay',public.staff_has_permission('expense.pay',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id),
      'can_manage_categories',public.staff_has_permission('expense.manage_categories',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)),'generated_at',now());
end $$;

create or replace function public.upsert_expense_category_v2(p_branch_id uuid,p_category_id uuid,p_code text,p_name_ar text,p_group_name_ar text,p_accounting_treatment text,
  p_active boolean,p_approval_required boolean,p_require_independent_approval boolean,p_auto_approve_limit numeric,p_receipt_required_above numeric,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.expense_categories_v2%rowtype; begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if not (public.staff_has_permission('expense.manage_categories',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_CATEGORY_MANAGE_DENIED'; end if;
 if p_accounting_treatment not in ('opex','capex','prepaid','employee_advance') then raise exception using errcode='22023',message='INVALID_ACCOUNTING_TREATMENT'; end if;
 if nullif(trim(coalesce(p_code,'')),'') is null or nullif(trim(coalesce(p_name_ar,'')),'') is null then raise exception using errcode='22023',message='EXPENSE_CATEGORY_DETAILS_REQUIRED'; end if;
 if p_category_id is null then
   insert into private.expense_categories_v2(branch_id,code,name_ar,group_name_ar,accounting_treatment,active,approval_required,require_independent_approval,auto_approve_limit,receipt_required_above,notes,created_by)
   values(p_branch_id,trim(p_code),trim(p_name_ar),coalesce(nullif(trim(coalesce(p_group_name_ar,'')),''),'مصروفات تشغيلية'),p_accounting_treatment,coalesce(p_active,true),coalesce(p_approval_required,true),coalesce(p_require_independent_approval,true),greatest(coalesce(p_auto_approve_limit,0),0),greatest(coalesce(p_receipt_required_above,0),0),nullif(trim(coalesce(p_notes,'')),''),auth.uid()) returning * into c;
 else
   update private.expense_categories_v2 set code=trim(p_code),name_ar=trim(p_name_ar),group_name_ar=coalesce(nullif(trim(coalesce(p_group_name_ar,'')),''),'مصروفات تشغيلية'),accounting_treatment=p_accounting_treatment,
    active=coalesce(p_active,true),approval_required=coalesce(p_approval_required,true),require_independent_approval=coalesce(p_require_independent_approval,true),auto_approve_limit=greatest(coalesce(p_auto_approve_limit,0),0),receipt_required_above=greatest(coalesce(p_receipt_required_above,0),0),notes=nullif(trim(coalesce(p_notes,'')),''),updated_at=now()
   where id=p_category_id and branch_id=p_branch_id returning * into c;
   if c.id is null then raise exception using errcode='22023',message='EXPENSE_CATEGORY_NOT_FOUND'; end if;
 end if;
 return to_jsonb(c);
end $$;

create or replace function public.get_pos_expense_categories_v2(p_device_id uuid,p_device_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_device public.pos_devices%rowtype; v_items jsonb; begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());
 if not (public.staff_has_permission('expense.request',v_device.branch_id) or public.staff_has_permission('pos.use',v_device.branch_id)) then raise exception using errcode='42501',message='EXPENSE_REQUEST_DENIED'; end if;
 with preferred as (select distinct on(code) id,code,name_ar,group_name_ar,accounting_treatment,approval_required,auto_approve_limit,receipt_required_above from private.expense_categories_v2 where active and (branch_id is null or branch_id=v_device.branch_id) order by code,(branch_id is null),updated_at desc)
 select coalesce(jsonb_agg(to_jsonb(preferred) order by group_name_ar,name_ar),'[]'::jsonb) into v_items from preferred;
 return jsonb_build_object('branch_id',v_device.branch_id,'items',v_items);
end $$;

create or replace function public.request_pos_expense_v2(p_request_id uuid,p_device_id uuid,p_device_token text,p_category_id uuid,p_amount numeric,p_description text,p_beneficiary_name text default null,p_receipt_url text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device public.pos_devices%rowtype; v_shift public.pos_shifts%rowtype; c private.expense_categories_v2%rowtype; d private.expense_documents_v2%rowtype; v_auto boolean; begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if p_request_id is null then raise exception using errcode='22023',message='REQUEST_ID_REQUIRED'; end if;
 select * into d from private.expense_documents_v2 where request_id=p_request_id; if d.id is not null then return to_jsonb(d); end if;
 v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());
 if not (public.staff_has_permission('expense.request',v_device.branch_id) or public.staff_has_permission('pos.use',v_device.branch_id)) then raise exception using errcode='42501',message='EXPENSE_REQUEST_DENIED'; end if;
 select * into v_shift from public.pos_shifts where user_id=auth.uid() and device_id=v_device.id and branch_id=v_device.branch_id and status='open' order by opened_at desc limit 1;
 if v_shift.id is null then raise exception using errcode='55000',message='SHIFT_NOT_OPEN'; end if;
 select * into c from private.expense_categories_v2 where id=p_category_id and active and (branch_id is null or branch_id=v_device.branch_id);
 if c.id is null then raise exception using errcode='22023',message='EXPENSE_CATEGORY_NOT_FOUND'; end if;
 if coalesce(p_amount,0)<=0 or nullif(trim(coalesce(p_description,'')),'') is null then raise exception using errcode='22023',message='EXPENSE_DETAILS_REQUIRED'; end if;
 if c.receipt_required_above>0 and p_amount>=c.receipt_required_above and nullif(trim(coalesce(p_receipt_url,'')),'') is null then raise exception using errcode='22023',message='EXPENSE_RECEIPT_REQUIRED'; end if;
 v_auto:=not c.approval_required or (c.auto_approve_limit>0 and p_amount<=c.auto_approve_limit);
 insert into private.expense_documents_v2(request_id,document_number,branch_id,category_id,category_code,category_name,accounting_treatment,amount,beneficiary_name,description,incurred_at,receipt_url,source,pos_shift_id,pos_device_id,status,requested_by,submitted_at,approved_by,approved_at)
 values(p_request_id,private.expense_document_number_v2(),v_device.branch_id,c.id,c.code,c.name_ar,c.accounting_treatment,round(p_amount,2),nullif(trim(coalesce(p_beneficiary_name,'')),''),trim(p_description),now(),nullif(trim(coalesce(p_receipt_url,'')),''),'pos',v_shift.id,v_device.id,case when v_auto then 'approved' else 'pending_approval' end,auth.uid(),now(),case when v_auto then auth.uid() end,case when v_auto then now() end) returning * into d;
 perform private.expense_write_audit_v2(d.id,'pos_submitted',auth.uid(),null,jsonb_build_object('device_id',v_device.id,'shift_id',v_shift.id));
 if v_auto then perform private.expense_recognize_v2(d.id,auth.uid()); else perform private.expense_create_approval_task_v2(d.id); end if;
 select * into d from private.expense_documents_v2 where id=d.id; return to_jsonb(d);
end $$;

create or replace function public.get_my_pos_expenses_v2(p_device_id uuid,p_device_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_device public.pos_devices%rowtype; v_shift public.pos_shifts%rowtype; v_items jsonb; begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());
 select * into v_shift from public.pos_shifts where user_id=auth.uid() and device_id=v_device.id and branch_id=v_device.branch_id and status='open' order by opened_at desc limit 1;
 if v_shift.id is null then return jsonb_build_object('shift_id',null,'items','[]'::jsonb); end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'document_number',d.document_number,'category_id',d.category_id,'category_name',d.category_name,'amount',d.amount,'paid_amount',d.paid_amount,'remaining_amount',round(d.amount-d.paid_amount,2),'description',d.description,'beneficiary_name',d.beneficiary_name,'status',d.status,'receipt_url',d.receipt_url,'created_at',d.created_at,'approved_at',d.approved_at) order by d.created_at desc),'[]'::jsonb) into v_items
 from private.expense_documents_v2 d where d.pos_shift_id=v_shift.id and d.pos_device_id=v_device.id and d.requested_by=auth.uid() and d.status not in ('cancelled','voided');
 return jsonb_build_object('shift_id',v_shift.id,'branch_id',v_device.branch_id,'items',v_items);
end $$;

create or replace function public.pay_my_pos_expense_v2(p_request_id uuid,p_document_id uuid,p_device_id uuid,p_device_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device public.pos_devices%rowtype; v_shift public.pos_shifts%rowtype; d private.expense_documents_v2%rowtype; v_payment private.expense_payments_v2%rowtype; v_drawer uuid; v_remaining numeric; v_balance numeric; v_ledger uuid; begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if p_request_id is null then raise exception using errcode='22023',message='REQUEST_ID_REQUIRED'; end if;
 select * into v_payment from private.expense_payments_v2 where request_id=p_request_id; if v_payment.id is not null then return to_jsonb(v_payment); end if;
 v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());
 select * into v_shift from public.pos_shifts where user_id=auth.uid() and device_id=v_device.id and branch_id=v_device.branch_id and status='open' order by opened_at desc limit 1;
 if v_shift.id is null then raise exception using errcode='55000',message='SHIFT_NOT_OPEN'; end if;
 select * into d from private.expense_documents_v2 where id=p_document_id for update;
 if d.id is null or d.source<>'pos' or d.pos_shift_id<>v_shift.id or d.pos_device_id<>v_device.id or d.requested_by<>auth.uid() then raise exception using errcode='42501',message='POS_EXPENSE_NOT_OWNED'; end if;
 if d.status not in ('approved','partially_paid') then raise exception using errcode='22023',message='EXPENSE_NOT_PAYABLE'; end if;
 if d.accounting_treatment='employee_advance' then raise exception using errcode='22023',message='EMPLOYEE_ADVANCE_USE_DEDICATED_FLOW'; end if;
 v_remaining:=round(d.amount-d.paid_amount,2); if v_remaining<=0 then raise exception using errcode='22023',message='EXPENSE_ALREADY_PAID'; end if;
 select drawer_account_id into v_drawer from public.pos_shifts where id=v_shift.id;
 if v_drawer is null then raise exception using errcode='55000',message='DRAWER_ACCOUNT_MISSING'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cash-account:'||v_drawer::text,51)); v_balance:=private.cash_account_balance(v_drawer);
 if v_balance<v_remaining then raise exception using errcode='22003',message='INSUFFICIENT_DRAWER_CASH'; end if;
 insert into public.cash_ledger(account_id,branch_id,shift_id,device_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by)
 values(v_drawer,v_device.branch_id,v_shift.id,v_device.id,auth.uid(),'expense_cash',-v_remaining,'expense_document',d.id,'صرف مصروف '||d.document_number||' - '||d.category_name,jsonb_build_object('document_number',d.document_number,'pos_expense_v2',true),auth.uid()) returning id into v_ledger;
 insert into private.expense_payments_v2(request_id,expense_document_id,branch_id,source_kind,source_account_id,amount,cash_ledger_entry_id,shift_id,paid_by)
 values(p_request_id,d.id,d.branch_id,'pos_drawer',v_drawer,v_remaining,v_ledger,v_shift.id,auth.uid()) returning * into v_payment;
 update private.expense_documents_v2 set paid_amount=amount,status='paid',updated_at=now() where id=d.id;
 if d.linked_expense_id is not null then update public.expenses set payment_method='cash',shift_id=v_shift.id,updated_at=now() where id=d.linked_expense_id; end if;
 perform private.expense_write_audit_v2(d.id,'pos_paid',auth.uid(),null,jsonb_build_object('payment_id',v_payment.id,'amount',v_remaining,'shift_id',v_shift.id));
 return to_jsonb(v_payment)||jsonb_build_object('drawer_balance_after',private.cash_account_balance(v_drawer),'document',(select to_jsonb(x) from private.expense_documents_v2 x where x.id=d.id));
end $$;

create or replace function private.approval_center_action_url_v1(p_source_kind text)
returns text language sql immutable set search_path='' as $$
 select case
   when p_source_kind in ('inventory_adjustment','attendance_exception','hr_request','order_substitution','order_substitution_financial_adjustment','order_shortage_financial_adjustment') then '/approvals'
   when p_source_kind='expense_approval' then '/finance/expenses'
   when p_source_kind='shift_reconciliation' then '/tasks?type=shift'
   when p_source_kind='cash_handoff' then '/tasks?type=cash_handoff'
   when p_source_kind='inventory_transfer_variance' then '/inventory-transfers'
   else '/tasks' end
$$;
create or replace function private.approval_center_is_review_task_v1(p_source_kind text)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_source_kind,'') in ('inventory_adjustment','shift_reconciliation','cash_handoff','inventory_transfer_variance','attendance_exception','hr_request','order_substitution','order_substitution_financial_adjustment','order_shortage_financial_adjustment','expense_approval')
$$;

revoke all on private.expense_categories_v2,private.expense_documents_v2,private.expense_payments_v2,private.expense_audit_v2 from public,anon,authenticated;
revoke all on function public.create_expense_request_v2(uuid,uuid,uuid,numeric,text,text,text,numeric,timestamptz,text,text,boolean) from public,anon;
revoke all on function public.decide_expense_request_v2(uuid,text,text) from public,anon;
revoke all on function public.pay_expense_v2(uuid,uuid,text,uuid,numeric,numeric,text,text) from public,anon;
revoke all on function public.reverse_expense_payment_v2(uuid,text) from public,anon;
revoke all on function public.void_expense_request_v2(uuid,text) from public,anon;
revoke all on function public.get_expense_workspace_v2(uuid,text,integer) from public,anon;
revoke all on function public.upsert_expense_category_v2(uuid,uuid,text,text,text,text,boolean,boolean,boolean,numeric,numeric,text) from public,anon;
revoke all on function public.get_pos_expense_categories_v2(uuid,text) from public,anon;
revoke all on function public.request_pos_expense_v2(uuid,uuid,text,uuid,numeric,text,text,text) from public,anon;
revoke all on function public.get_my_pos_expenses_v2(uuid,text) from public,anon;
revoke all on function public.pay_my_pos_expense_v2(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.create_expense_request_v2(uuid,uuid,uuid,numeric,text,text,text,numeric,timestamptz,text,text,boolean) to authenticated;
grant execute on function public.decide_expense_request_v2(uuid,text,text) to authenticated;
grant execute on function public.pay_expense_v2(uuid,uuid,text,uuid,numeric,numeric,text,text) to authenticated;
grant execute on function public.reverse_expense_payment_v2(uuid,text) to authenticated;
grant execute on function public.void_expense_request_v2(uuid,text) to authenticated;
grant execute on function public.get_expense_workspace_v2(uuid,text,integer) to authenticated;
grant execute on function public.upsert_expense_category_v2(uuid,uuid,text,text,text,text,boolean,boolean,boolean,numeric,numeric,text) to authenticated;
grant execute on function public.get_pos_expense_categories_v2(uuid,text) to authenticated;
grant execute on function public.request_pos_expense_v2(uuid,uuid,text,uuid,numeric,text,text,text) to authenticated;
grant execute on function public.get_my_pos_expenses_v2(uuid,text) to authenticated;
grant execute on function public.pay_my_pos_expense_v2(uuid,uuid,uuid,text) to authenticated;
