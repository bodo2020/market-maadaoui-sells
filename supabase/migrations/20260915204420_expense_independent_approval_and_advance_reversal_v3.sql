-- Expense control V3 hardening:
-- 1) independent approval always requires a different user
-- 2) employee-advance expense settlements respect category approval policy
-- 3) active advance settlements can be reversed with a full audit/ledger trail

alter table private.expense_documents_v2
  add column if not exists advance_parent_document_id uuid references private.expense_documents_v2(id),
  add column if not exists advance_settlement_request_id uuid;

create unique index if not exists expense_documents_v2_advance_settlement_request_uidx
  on private.expense_documents_v2(advance_settlement_request_id)
  where advance_settlement_request_id is not null;
create index if not exists expense_documents_v2_advance_parent_idx
  on private.expense_documents_v2(advance_parent_document_id)
  where advance_parent_document_id is not null;

alter table private.employee_advance_settlements_v2
  add column if not exists reversal_request_id uuid,
  add column if not exists reversal_cash_ledger_entry_id uuid references public.cash_ledger(id),
  add column if not exists reversal_payment_ledger_entry_id uuid references public.payment_ledger(id);

create unique index if not exists employee_advance_settlements_v2_reversal_request_uidx
  on private.employee_advance_settlements_v2(reversal_request_id)
  where reversal_request_id is not null;

create or replace function private.expense_create_approval_task_v2(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  d private.expense_documents_v2%rowtype;
  c private.expense_categories_v2%rowtype;
  v_task uuid;
begin
  select * into d from private.expense_documents_v2 where id=p_document_id;
  if d.id is null or d.status<>'pending_approval' then return null; end if;
  select * into c from private.expense_categories_v2 where id=d.category_id;

  insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,metadata,created_by)
  values(d.branch_id,'expense_approval','expense_approval',d.id,d.amount,'normal','open','مراجعة مصروف '||d.document_number,
    d.category_name||' · '||d.description,
    jsonb_build_object('expense_document_id',d.id,'document_number',d.document_number,'category',d.category_name,'requested_by',d.requested_by,'independent_approval',coalesce(c.require_independent_approval,false)),d.requested_by)
  on conflict(task_type,source_kind,source_id) do update
    set amount=excluded.amount,title=excluded.title,description=excluded.description,metadata=excluded.metadata,updated_at=now()
  returning id into v_task;

  insert into private.notification_events_v2(audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at)
  select 'staff',u.id,d.branch_id,'expense.approval_required','finance','normal','مصروف بانتظار الاعتماد',
    d.document_number||' · '||d.category_name||' · '||to_char(d.amount,'FM9999999990.00')||' ج.م',
    'expense_approval',d.id,'/finance/expenses','مراجعة المصروف',true,'expense-approval:'||d.id::text,array['in_app']::text[],'active',
    jsonb_build_object('document_number',d.document_number,'amount',d.amount,'category',d.category_name,'independent_approval',coalesce(c.require_independent_approval,false)),now(),now()
  from public.users u
  where coalesce(u.active,true)
    and private.staff_user_has_permission_v3(u.id,'expense.approve',d.branch_id)
    and (not coalesce(c.require_independent_approval,false) or u.id<>d.requested_by)
  on conflict(recipient_user_id,dedupe_key) do update
    set status='active',resolved_at=null,updated_at=now(),body=excluded.body,metadata=excluded.metadata;
  return v_task;
end $function$;

create or replace function public.create_expense_request_v2(p_request_id uuid, p_branch_id uuid, p_category_id uuid, p_amount numeric, p_description text, p_beneficiary_name text default null::text, p_invoice_number text default null::text, p_tax_amount numeric default 0, p_incurred_at timestamp with time zone default now(), p_receipt_url text default null::text, p_notes text default null::text, p_submit boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
  v_auto:=p_submit and not c.require_independent_approval and (not c.approval_required or (c.auto_approve_limit>0 and p_amount<=c.auto_approve_limit));
  v_status:=case when not p_submit then 'draft' when v_auto then 'approved' else 'pending_approval' end;
  insert into private.expense_documents_v2(request_id,document_number,branch_id,category_id,category_code,category_name,accounting_treatment,amount,
    beneficiary_name,invoice_number,tax_amount,description,notes,incurred_at,receipt_url,source,status,requested_by,submitted_at,approved_by,approved_at)
  values(p_request_id,private.expense_document_number_v2(),p_branch_id,c.id,c.code,c.name_ar,c.accounting_treatment,round(p_amount,2),
    nullif(trim(coalesce(p_beneficiary_name,'')),''),nullif(trim(coalesce(p_invoice_number,'')),''),round(coalesce(p_tax_amount,0),2),trim(p_description),
    nullif(trim(coalesce(p_notes,'')),''),coalesce(p_incurred_at,now()),nullif(trim(coalesce(p_receipt_url,'')),''),'business',v_status,auth.uid(),case when p_submit then now() end,
    case when v_auto then auth.uid() end,case when v_auto then now() end)
  returning * into d;
  perform private.expense_write_audit_v2(d.id,case when p_submit then 'submitted' else 'draft_created' end,auth.uid(),null,jsonb_build_object('status',v_status,'independent_approval',c.require_independent_approval));
  if v_auto then perform private.expense_recognize_v2(d.id,auth.uid()); elsif p_submit then perform private.expense_create_approval_task_v2(d.id); end if;
  select * into d from private.expense_documents_v2 where id=d.id;
  return to_jsonb(d);
end $function$;

create or replace function public.request_pos_expense_v2(p_request_id uuid, p_device_id uuid, p_device_token text, p_category_id uuid, p_amount numeric, p_description text, p_beneficiary_name text default null::text, p_receipt_url text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
 v_auto:=not c.require_independent_approval and (not c.approval_required or (c.auto_approve_limit>0 and p_amount<=c.auto_approve_limit));
 insert into private.expense_documents_v2(request_id,document_number,branch_id,category_id,category_code,category_name,accounting_treatment,amount,beneficiary_name,description,incurred_at,receipt_url,source,pos_shift_id,pos_device_id,status,requested_by,submitted_at,approved_by,approved_at)
 values(p_request_id,private.expense_document_number_v2(),v_device.branch_id,c.id,c.code,c.name_ar,c.accounting_treatment,round(p_amount,2),nullif(trim(coalesce(p_beneficiary_name,'')),''),trim(p_description),now(),nullif(trim(coalesce(p_receipt_url,'')),''),'pos',v_shift.id,v_device.id,case when v_auto then 'approved' else 'pending_approval' end,auth.uid(),now(),case when v_auto then auth.uid() end,case when v_auto then now() end) returning * into d;
 perform private.expense_write_audit_v2(d.id,'pos_submitted',auth.uid(),null,jsonb_build_object('device_id',v_device.id,'shift_id',v_shift.id,'independent_approval',c.require_independent_approval));
 if v_auto then perform private.expense_recognize_v2(d.id,auth.uid()); else perform private.expense_create_approval_task_v2(d.id); end if;
 select * into d from private.expense_documents_v2 where id=d.id; return to_jsonb(d);
end $function$;

create or replace function public.create_employee_advance_request_v2(p_request_id uuid, p_branch_id uuid, p_employee_id uuid, p_amount numeric, p_purpose text, p_due_date date default null::date, p_notes text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare c private.expense_categories_v2%rowtype; d private.expense_documents_v2%rowtype; v_name text; v_auto boolean; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.manage_advances',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_ADVANCE_MANAGE_DENIED'; end if;
  if p_request_id is null or p_employee_id is null or coalesce(p_amount,0)<=0 or nullif(trim(coalesce(p_purpose,'')),'') is null then raise exception using errcode='22023',message='INVALID_EMPLOYEE_ADVANCE'; end if;
  select * into d from private.expense_documents_v2 where request_id=p_request_id; if d.id is not null then return to_jsonb(d); end if;
  if not private.employee_is_in_branch_v2(p_employee_id,p_branch_id) then raise exception using errcode='22023',message='EMPLOYEE_NOT_ELIGIBLE'; end if;
  select coalesce(nullif(u.name,''),e.employee_code,'موظف') into v_name from private.hr_employee_profiles e left join public.users u on u.id=e.user_id where e.user_id=p_employee_id limit 1;
  select * into c from private.expense_categories_v2 where active and accounting_treatment='employee_advance' and (branch_id=p_branch_id or branch_id is null) order by (branch_id=p_branch_id) desc limit 1;
  if c.id is null then raise exception using errcode='22023',message='EMPLOYEE_ADVANCE_CATEGORY_NOT_FOUND'; end if;
  v_auto:=not c.require_independent_approval and (not c.approval_required or (c.auto_approve_limit>0 and p_amount<=c.auto_approve_limit));
  insert into private.expense_documents_v2(request_id,document_number,branch_id,category_id,category_code,category_name,accounting_treatment,amount,beneficiary_name,employee_id,description,notes,incurred_at,source,status,requested_by,submitted_at,approved_by,approved_at)
  values(p_request_id,private.expense_document_number_v2(),p_branch_id,c.id,c.code,c.name_ar,'employee_advance',round(p_amount,2),v_name,p_employee_id,trim(p_purpose),
    concat_ws(' · ',nullif(trim(coalesce(p_notes,'')),''),case when p_due_date is not null then 'تاريخ التسوية المطلوب: '||p_due_date::text end),now(),'business',case when v_auto then 'approved' else 'pending_approval' end,auth.uid(),now(),case when v_auto then auth.uid() end,case when v_auto then now() end)
  returning * into d;
  perform private.expense_write_audit_v2(d.id,'advance_requested',auth.uid(),p_notes,jsonb_build_object('employee_id',p_employee_id,'due_date',p_due_date,'independent_approval',c.require_independent_approval));
  if v_auto then perform private.employee_advance_notify_v2(d.id,'expense.advance_approved','تم اعتماد العهدة',d.document_number||' · '||round(d.amount,2)||' ج.م','approved','normal'); else perform private.expense_create_approval_task_v2(d.id); end if;
  return to_jsonb(d);
end $function$;

create or replace function private.generate_due_recurring_expenses_v2(p_branch_id uuid default null::uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare r private.expense_recurring_rules_v2%rowtype; c private.expense_categories_v2%rowtype; v_run_id uuid; v_doc private.expense_documents_v2%rowtype; v_status text; v_auto boolean; v_today date:=timezone('Africa/Cairo',now())::date; v_count int:=0; v_guard int; begin
  for r in select * from private.expense_recurring_rules_v2 where active and next_run_date<=v_today and (p_branch_id is null or branch_id=p_branch_id) order by next_run_date,id for update skip locked loop
    v_guard:=0;
    while r.active and r.next_run_date<=v_today and v_guard<24 loop
      v_guard:=v_guard+1;
      if r.end_date is not null and r.next_run_date>r.end_date then update private.expense_recurring_rules_v2 set active=false,updated_at=now() where id=r.id; exit; end if;
      select * into c from private.expense_categories_v2 where id=r.category_id and active and (branch_id is null or branch_id=r.branch_id);
      if c.id is null then update private.expense_recurring_rules_v2 set active=false,updated_at=now() where id=r.id; exit; end if;
      v_run_id:=null;
      insert into private.expense_recurring_runs_v2(rule_id,run_date,status) values(r.id,r.next_run_date,'creating') on conflict(rule_id,run_date) do nothing returning id into v_run_id;
      if v_run_id is not null then
        v_auto:=r.auto_submit and not (c.receipt_required_above>0 and r.amount>=c.receipt_required_above) and not c.require_independent_approval and (not c.approval_required or (c.auto_approve_limit>0 and r.amount<=c.auto_approve_limit));
        v_status:=case when not r.auto_submit or (c.receipt_required_above>0 and r.amount>=c.receipt_required_above) then 'draft' when v_auto then 'approved' else 'pending_approval' end;
        insert into private.expense_documents_v2(request_id,document_number,branch_id,category_id,category_code,category_name,accounting_treatment,amount,beneficiary_name,tax_amount,description,notes,incurred_at,source,status,requested_by,submitted_at,approved_by,approved_at,recurring_rule_id,recurring_run_date)
        values(gen_random_uuid(),private.expense_document_number_v2(),r.branch_id,c.id,c.code,c.name_ar,c.accounting_treatment,r.amount,r.beneficiary_name,r.tax_amount,r.description,r.notes,
          (r.next_run_date::timestamp at time zone 'Africa/Cairo'),'business',v_status,r.created_by,case when v_status<>'draft' then now() end,case when v_auto then r.created_by end,case when v_auto then now() end,r.id,r.next_run_date)
        returning * into v_doc;
        update private.expense_recurring_runs_v2 set expense_document_id=v_doc.id,status=v_status where id=v_run_id;
        perform private.expense_write_audit_v2(v_doc.id,'recurring_generated',r.created_by,null,jsonb_build_object('recurring_rule_id',r.id,'run_date',r.next_run_date,'status',v_status,'independent_approval',c.require_independent_approval));
        if v_status='approved' then perform private.expense_recognize_v2(v_doc.id,r.created_by);
        elsif v_status='pending_approval' then perform private.expense_create_approval_task_v2(v_doc.id);
        else
          insert into private.notification_events_v2(audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at)
          values('staff',r.created_by,r.branch_id,'expense.recurring_draft','finance','normal','مصروف دوري يحتاج إثباتًا','تم إنشاء '||v_doc.document_number||' كمسودة. ارفع الإثبات ثم أرسله للاعتماد.','expense_document',v_doc.id,'/finance/expenses','فتح المصروف',true,'expense-recurring-draft:'||v_doc.id::text,array['in_app']::text[],'active',jsonb_build_object('document_number',v_doc.document_number,'rule_id',r.id),now(),now())
          on conflict(recipient_user_id,dedupe_key) do nothing;
        end if;
        v_count:=v_count+1;
      end if;
      r.next_run_date:=private.expense_next_recurring_date_v2(r.next_run_date,r.cadence);
      if r.next_run_date is null or (r.end_date is not null and r.next_run_date>r.end_date) then r.active:=false; end if;
      update private.expense_recurring_rules_v2 set next_run_date=r.next_run_date,active=r.active,last_generated_at=case when v_run_id is not null then now() else last_generated_at end,
        generated_count=generated_count+case when v_run_id is not null then 1 else 0 end,updated_at=now() where id=r.id;
      v_run_id:=null;
    end loop;
  end loop;
  return v_count;
end $function$;

create or replace function public.decide_expense_request_v2(p_document_id uuid, p_decision text, p_note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare d private.expense_documents_v2%rowtype; c private.expense_categories_v2%rowtype; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into d from private.expense_documents_v2 where id=p_document_id for update;
  if d.id is null then raise exception using errcode='22023',message='EXPENSE_DOCUMENT_NOT_FOUND'; end if;
  if not (public.staff_has_permission('expense.approve',d.branch_id) or public.staff_has_permission('finance.manage',d.branch_id)) then raise exception using errcode='42501',message='EXPENSE_APPROVE_DENIED'; end if;
  if d.status<>'pending_approval' then raise exception using errcode='22023',message='EXPENSE_NOT_PENDING_APPROVAL'; end if;
  select * into c from private.expense_categories_v2 where id=d.category_id;
  if p_decision not in ('approve','reject') then raise exception using errcode='22023',message='INVALID_DECISION'; end if;
  if p_decision='approve' and coalesce(c.require_independent_approval,false) and d.requested_by=auth.uid() then raise exception using errcode='42501',message='EXPENSE_SELF_APPROVAL_DENIED'; end if;
  if p_decision='approve' then
    update private.expense_documents_v2 set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=d.id;
    perform private.expense_recognize_v2(d.id,auth.uid());
    perform private.expense_write_audit_v2(d.id,'approved',auth.uid(),p_note,jsonb_build_object('independent_approval',coalesce(c.require_independent_approval,false)));
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
end $function$;

create or replace function private.expense_recognize_v2(p_document_id uuid, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  d private.expense_documents_v2%rowtype;
  parent_doc private.expense_documents_v2%rowtype;
  s private.employee_advance_settlements_v2%rowtype;
  v_expense uuid;
  v_outstanding numeric;
begin
  select * into d from private.expense_documents_v2 where id=p_document_id for update;
  if d.id is null then raise exception using errcode='22023',message='EXPENSE_DOCUMENT_NOT_FOUND'; end if;
  if d.status<>'approved' then raise exception using errcode='55000',message='EXPENSE_NOT_APPROVED'; end if;
  if d.linked_expense_id is not null then return d.linked_expense_id; end if;

  if d.accounting_treatment <> 'opex' then
    perform private.expense_write_audit_v2(d.id,'non_opex_approved',p_actor,null,jsonb_build_object('accounting_treatment',d.accounting_treatment,'excluded_from_operating_expense',true));
    return null;
  end if;

  if d.source='employee_advance_settlement' then
    if d.advance_parent_document_id is null or d.advance_settlement_request_id is null then raise exception using errcode='22023',message='ADVANCE_SETTLEMENT_LINK_MISSING'; end if;
    select * into parent_doc from private.expense_documents_v2 where id=d.advance_parent_document_id for update;
    if parent_doc.id is null or parent_doc.accounting_treatment<>'employee_advance' or parent_doc.employee_id is null then raise exception using errcode='22023',message='EMPLOYEE_ADVANCE_NOT_FOUND'; end if;
    if parent_doc.status<>'paid' then raise exception using errcode='55000',message='EMPLOYEE_ADVANCE_NOT_DISBURSED'; end if;
    select * into s from private.employee_advance_settlements_v2 where request_id=d.advance_settlement_request_id;
    if s.id is not null then
      update private.expense_documents_v2 set linked_expense_id=s.linked_expense_id,updated_at=now() where id=d.id;
      return s.linked_expense_id;
    end if;
    v_outstanding:=private.employee_advance_outstanding_v2(parent_doc.id);
    if d.amount>v_outstanding then raise exception using errcode='22023',message='ADVANCE_SETTLEMENT_EXCEEDS_OUTSTANDING'; end if;
  end if;

  insert into public.expenses(type,amount,description,date,receipt_url,branch_id,payment_method,created_by,status,
    expense_document_id,expense_category_id,accounting_treatment,beneficiary_name,invoice_number)
  values(d.category_name,d.amount,d.description,d.incurred_at,d.receipt_url,d.branch_id,
    case when d.source='employee_advance_settlement' then 'employee_advance_settlement' else 'unpaid' end,
    d.requested_by,'active',d.id,d.category_id,d.accounting_treatment,d.beneficiary_name,d.invoice_number)
  returning id into v_expense;

  update private.expense_documents_v2 set linked_expense_id=v_expense,updated_at=now() where id=d.id;

  if d.source='employee_advance_settlement' then
    insert into private.employee_advance_settlements_v2(request_id,expense_document_id,branch_id,employee_id,settlement_type,amount,category_id,description,receipt_url,invoice_number,linked_expense_id,settled_by)
    values(d.advance_settlement_request_id,parent_doc.id,parent_doc.branch_id,parent_doc.employee_id,'expense_receipt',d.amount,d.category_id,d.description,d.receipt_url,d.invoice_number,v_expense,d.requested_by)
    returning * into s;
    perform private.expense_write_audit_v2(parent_doc.id,'advance_expense_settlement',p_actor,d.notes,jsonb_build_object('settlement_id',s.id,'expense_id',v_expense,'amount',d.amount,'category_id',d.category_id,'approval_document_id',d.id));
    perform private.employee_advance_notify_v2(parent_doc.id,'expense.advance_settlement','تم اعتماد تسوية من العهدة',parent_doc.document_number||' · مصروف مثبت '||round(d.amount,2)||' ج.م','settlement:'||s.id::text,'normal');
  end if;

  perform private.expense_write_audit_v2(d.id,'recognized',p_actor,null,jsonb_build_object('expense_id',v_expense,'accounting_treatment','opex'));
  return v_expense;
end $function$;

create or replace function public.settle_employee_advance_expense_v2(p_request_id uuid, p_document_id uuid, p_category_id uuid, p_amount numeric, p_description text, p_receipt_url text, p_invoice_number text default null::text, p_note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  parent_doc private.expense_documents_v2%rowtype;
  approval_doc private.expense_documents_v2%rowtype;
  c private.expense_categories_v2%rowtype;
  s private.employee_advance_settlements_v2%rowtype;
  v_outstanding numeric;
  v_auto boolean;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='REQUEST_ID_REQUIRED'; end if;
  select * into s from private.employee_advance_settlements_v2 where request_id=p_request_id;
  if s.id is not null then return to_jsonb(s)||jsonb_build_object('remaining_amount',private.employee_advance_outstanding_v2(s.expense_document_id),'approval_status','approved'); end if;
  select * into approval_doc from private.expense_documents_v2 where advance_settlement_request_id=p_request_id;
  if approval_doc.id is not null then
    return jsonb_build_object('approval_document_id',approval_doc.id,'document_number',approval_doc.document_number,'approval_status',approval_doc.status,'amount',approval_doc.amount,'remaining_amount',private.employee_advance_outstanding_v2(approval_doc.advance_parent_document_id));
  end if;
  select * into parent_doc from private.expense_documents_v2 where id=p_document_id for update;
  if parent_doc.id is null or parent_doc.accounting_treatment<>'employee_advance' or parent_doc.employee_id is null then raise exception using errcode='22023',message='EMPLOYEE_ADVANCE_NOT_FOUND'; end if;
  if parent_doc.status<>'paid' then raise exception using errcode='55000',message='EMPLOYEE_ADVANCE_NOT_DISBURSED'; end if;
  if not (public.staff_has_permission('expense.manage_advances',parent_doc.branch_id) or public.staff_has_permission('finance.manage',parent_doc.branch_id)) then raise exception using errcode='42501',message='EXPENSE_ADVANCE_MANAGE_DENIED'; end if;
  v_outstanding:=private.employee_advance_outstanding_v2(parent_doc.id);
  if coalesce(p_amount,0)<=0 or round(p_amount,2)>v_outstanding or nullif(trim(coalesce(p_description,'')),'') is null then raise exception using errcode='22023',message='INVALID_ADVANCE_SETTLEMENT_AMOUNT'; end if;
  select * into c from private.expense_categories_v2 where id=p_category_id and active and accounting_treatment='opex' and (branch_id is null or branch_id=parent_doc.branch_id);
  if c.id is null then raise exception using errcode='22023',message='ADVANCE_SETTLEMENT_CATEGORY_INVALID'; end if;
  if c.receipt_required_above>0 and p_amount>=c.receipt_required_above and nullif(trim(coalesce(p_receipt_url,'')),'') is null then raise exception using errcode='22023',message='EXPENSE_RECEIPT_REQUIRED'; end if;
  v_auto:=not c.require_independent_approval and (not c.approval_required or (c.auto_approve_limit>0 and p_amount<=c.auto_approve_limit));

  insert into private.expense_documents_v2(request_id,document_number,branch_id,category_id,category_code,category_name,accounting_treatment,amount,
    beneficiary_name,employee_id,invoice_number,description,notes,incurred_at,receipt_url,source,status,requested_by,submitted_at,approved_by,approved_at,
    advance_parent_document_id,advance_settlement_request_id)
  values(gen_random_uuid(),private.expense_document_number_v2(),parent_doc.branch_id,c.id,c.code,c.name_ar,'opex',round(p_amount,2),
    parent_doc.beneficiary_name,parent_doc.employee_id,nullif(trim(coalesce(p_invoice_number,'')),''),trim(p_description),nullif(trim(coalesce(p_note,'')),''),now(),nullif(trim(coalesce(p_receipt_url,'')),''),
    'employee_advance_settlement',case when v_auto then 'approved' else 'pending_approval' end,auth.uid(),now(),case when v_auto then auth.uid() end,case when v_auto then now() end,
    parent_doc.id,p_request_id)
  returning * into approval_doc;

  perform private.expense_write_audit_v2(approval_doc.id,'advance_settlement_submitted',auth.uid(),p_note,jsonb_build_object('parent_advance_id',parent_doc.id,'settlement_request_id',p_request_id,'independent_approval',c.require_independent_approval));
  if v_auto then
    perform private.expense_recognize_v2(approval_doc.id,auth.uid());
    perform private.expense_evaluate_budget_alerts_v2(approval_doc.id);
    select * into s from private.employee_advance_settlements_v2 where request_id=p_request_id;
    return to_jsonb(s)||jsonb_build_object('approval_document_id',approval_doc.id,'approval_status','approved','remaining_amount',private.employee_advance_outstanding_v2(parent_doc.id));
  else
    perform private.expense_create_approval_task_v2(approval_doc.id);
    return jsonb_build_object('approval_document_id',approval_doc.id,'document_number',approval_doc.document_number,'approval_status','pending_approval','amount',approval_doc.amount,'remaining_amount',v_outstanding);
  end if;
end $function$;

create or replace function public.reverse_employee_advance_settlement_v2(p_request_id uuid, p_settlement_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  s private.employee_advance_settlements_v2%rowtype;
  d private.expense_documents_v2%rowtype;
  v_cash public.cash_accounts%rowtype;
  v_pay public.payment_accounts%rowtype;
  v_cash_reversal uuid;
  v_payment_reversal uuid;
  v_balance numeric;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_request_id is null or p_settlement_id is null then raise exception using errcode='22023',message='REQUEST_ID_REQUIRED'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception using errcode='22023',message='REVERSAL_REASON_REQUIRED'; end if;

  select * into s from private.employee_advance_settlements_v2 where id=p_settlement_id for update;
  if s.id is null then raise exception using errcode='22023',message='ADVANCE_SETTLEMENT_NOT_FOUND'; end if;
  select * into d from private.expense_documents_v2 where id=s.expense_document_id for update;
  if d.id is null then raise exception using errcode='22023',message='EMPLOYEE_ADVANCE_NOT_FOUND'; end if;
  if not (public.staff_has_permission('expense.manage_advances',d.branch_id) or public.staff_has_permission('finance.manage',d.branch_id)) then raise exception using errcode='42501',message='EXPENSE_ADVANCE_MANAGE_DENIED'; end if;

  if s.status='reversed' then
    if s.reversal_request_id=p_request_id then return to_jsonb(s)||jsonb_build_object('remaining_amount',private.employee_advance_outstanding_v2(d.id)); end if;
    raise exception using errcode='22023',message='ADVANCE_SETTLEMENT_ALREADY_REVERSED';
  end if;

  if s.settlement_type='expense_receipt' then
    if s.linked_expense_id is null then raise exception using errcode='55000',message='ADVANCE_SETTLEMENT_EXPENSE_LINK_MISSING'; end if;
    update public.expenses
      set status='voided',voided_at=now(),voided_by=auth.uid(),void_reason=trim(p_reason),updated_at=now()
    where id=s.linked_expense_id and status='active';
    if not found then
      if not exists(select 1 from public.expenses where id=s.linked_expense_id and status='voided') then
        raise exception using errcode='55000',message='ADVANCE_SETTLEMENT_EXPENSE_NOT_ACTIVE';
      end if;
    end if;
  elsif s.settlement_type='cash_return' then
    if s.source_kind='branch_safe' then
      select * into v_cash from public.cash_accounts where id=s.source_account_id and branch_id=s.branch_id and active for update;
      if v_cash.id is null then raise exception using errcode='22023',message='EXPENSE_CASH_ACCOUNT_NOT_FOUND'; end if;
      v_balance:=private.cash_account_balance(v_cash.id);
      if v_balance<s.amount then raise exception using errcode='22023',message='INSUFFICIENT_CASH_FOR_ADVANCE_REVERSAL'; end if;
      insert into public.cash_ledger(account_id,branch_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by)
      values(v_cash.id,s.branch_id,auth.uid(),'employee_advance_return_reversal',-s.amount,'employee_advance_settlement',s.id,'عكس رد عهدة',jsonb_build_object('advance_document_id',d.id,'reversal_request_id',p_request_id,'reason',trim(p_reason)),auth.uid())
      returning id into v_cash_reversal;
    elsif s.source_kind in ('bank','payment_account') then
      select * into v_pay from public.payment_accounts where id=s.source_account_id and branch_id=s.branch_id and active for update;
      if v_pay.id is null then raise exception using errcode='22023',message='EXPENSE_PAYMENT_ACCOUNT_NOT_FOUND'; end if;
      v_balance:=private.payment_account_balance(v_pay.id);
      if v_balance<s.amount then raise exception using errcode='22023',message='INSUFFICIENT_PAYMENT_BALANCE_FOR_ADVANCE_REVERSAL'; end if;
      insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
      values(v_pay.id,s.branch_id,'employee_advance_return_reversal',-s.amount,coalesce(nullif(v_pay.provider_code,''),v_pay.account_type),s.provider_reference,'عكس رد عهدة',jsonb_build_object('advance_document_id',d.id,'settlement_id',s.id,'reversal_request_id',p_request_id,'reason',trim(p_reason)),auth.uid())
      returning id into v_payment_reversal;
    else
      raise exception using errcode='55000',message='ADVANCE_SETTLEMENT_SOURCE_INVALID';
    end if;
  else
    raise exception using errcode='55000',message='ADVANCE_SETTLEMENT_TYPE_UNSUPPORTED';
  end if;

  update private.employee_advance_settlements_v2
    set status='reversed',reversed_by=auth.uid(),reversed_at=now(),reverse_reason=trim(p_reason),reversal_request_id=p_request_id,
        reversal_cash_ledger_entry_id=v_cash_reversal,reversal_payment_ledger_entry_id=v_payment_reversal
  where id=s.id returning * into s;

  perform private.expense_write_audit_v2(d.id,'advance_settlement_reversed',auth.uid(),p_reason,jsonb_build_object('settlement_id',s.id,'settlement_type',s.settlement_type,'amount',s.amount,'reversal_request_id',p_request_id,'cash_ledger_entry_id',v_cash_reversal,'payment_ledger_entry_id',v_payment_reversal));
  perform private.employee_advance_notify_v2(d.id,'expense.advance_settlement_reversed','تم عكس تسوية عهدة',d.document_number||' · تم عكس '||round(s.amount,2)||' ج.م','reversal:'||s.id::text,'normal');
  return to_jsonb(s)||jsonb_build_object('remaining_amount',private.employee_advance_outstanding_v2(d.id));
end $function$;

revoke all on function public.reverse_employee_advance_settlement_v2(uuid,uuid,text) from public, anon;
grant execute on function public.reverse_employee_advance_settlement_v2(uuid,uuid,text) to authenticated;
