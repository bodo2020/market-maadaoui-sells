-- Expense V3 follow-up:
-- - notify all users who can actually decide expense approvals
-- - reserve pending employee-advance settlement amounts so pending approvals cannot overbook an advance

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
    and (
      private.staff_user_has_permission_v3(u.id,'expense.approve',d.branch_id)
      or private.staff_user_has_permission_v3(u.id,'finance.manage',d.branch_id)
    )
    and (not coalesce(c.require_independent_approval,false) or u.id<>d.requested_by)
  on conflict(recipient_user_id,dedupe_key) do update
    set status='active',resolved_at=null,updated_at=now(),body=excluded.body,metadata=excluded.metadata;
  return v_task;
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
  v_pending numeric;
  v_available numeric;
  v_auto boolean;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='REQUEST_ID_REQUIRED'; end if;

  select * into s from private.employee_advance_settlements_v2 where request_id=p_request_id;
  if s.id is not null then
    return to_jsonb(s)||jsonb_build_object('remaining_amount',private.employee_advance_outstanding_v2(s.expense_document_id),'approval_status','approved');
  end if;

  select * into approval_doc from private.expense_documents_v2 where advance_settlement_request_id=p_request_id;
  if approval_doc.id is not null then
    return jsonb_build_object(
      'approval_document_id',approval_doc.id,
      'document_number',approval_doc.document_number,
      'approval_status',approval_doc.status,
      'amount',approval_doc.amount,
      'remaining_amount',private.employee_advance_outstanding_v2(approval_doc.advance_parent_document_id)
    );
  end if;

  select * into parent_doc from private.expense_documents_v2 where id=p_document_id for update;
  if parent_doc.id is null or parent_doc.accounting_treatment<>'employee_advance' or parent_doc.employee_id is null then
    raise exception using errcode='22023',message='EMPLOYEE_ADVANCE_NOT_FOUND';
  end if;
  if parent_doc.status<>'paid' then raise exception using errcode='55000',message='EMPLOYEE_ADVANCE_NOT_DISBURSED'; end if;
  if not (public.staff_has_permission('expense.manage_advances',parent_doc.branch_id) or public.staff_has_permission('finance.manage',parent_doc.branch_id)) then
    raise exception using errcode='42501',message='EXPENSE_ADVANCE_MANAGE_DENIED';
  end if;

  v_outstanding:=private.employee_advance_outstanding_v2(parent_doc.id);
  select coalesce(sum(x.amount),0)::numeric
    into v_pending
  from private.expense_documents_v2 x
  where x.source='employee_advance_settlement'
    and x.advance_parent_document_id=parent_doc.id
    and x.status='pending_approval';
  v_available:=greatest(v_outstanding-v_pending,0);

  if coalesce(p_amount,0)<=0 or round(p_amount,2)>v_available or nullif(trim(coalesce(p_description,'')),'') is null then
    raise exception using errcode='22023',message='INVALID_ADVANCE_SETTLEMENT_AMOUNT';
  end if;

  select * into c from private.expense_categories_v2
  where id=p_category_id and active and accounting_treatment='opex' and (branch_id is null or branch_id=parent_doc.branch_id);
  if c.id is null then raise exception using errcode='22023',message='ADVANCE_SETTLEMENT_CATEGORY_INVALID'; end if;
  if c.receipt_required_above>0 and p_amount>=c.receipt_required_above and nullif(trim(coalesce(p_receipt_url,'')),'') is null then
    raise exception using errcode='22023',message='EXPENSE_RECEIPT_REQUIRED';
  end if;

  v_auto:=not c.require_independent_approval and (not c.approval_required or (c.auto_approve_limit>0 and p_amount<=c.auto_approve_limit));

  insert into private.expense_documents_v2(request_id,document_number,branch_id,category_id,category_code,category_name,accounting_treatment,amount,
    beneficiary_name,employee_id,invoice_number,description,notes,incurred_at,receipt_url,source,status,requested_by,submitted_at,approved_by,approved_at,
    advance_parent_document_id,advance_settlement_request_id)
  values(gen_random_uuid(),private.expense_document_number_v2(),parent_doc.branch_id,c.id,c.code,c.name_ar,'opex',round(p_amount,2),
    parent_doc.beneficiary_name,parent_doc.employee_id,nullif(trim(coalesce(p_invoice_number,'')),''),trim(p_description),nullif(trim(coalesce(p_note,'')),''),now(),nullif(trim(coalesce(p_receipt_url,'')),''),
    'employee_advance_settlement',case when v_auto then 'approved' else 'pending_approval' end,auth.uid(),now(),case when v_auto then auth.uid() end,case when v_auto then now() end,
    parent_doc.id,p_request_id)
  returning * into approval_doc;

  perform private.expense_write_audit_v2(
    approval_doc.id,'advance_settlement_submitted',auth.uid(),p_note,
    jsonb_build_object(
      'parent_advance_id',parent_doc.id,
      'settlement_request_id',p_request_id,
      'independent_approval',c.require_independent_approval,
      'outstanding_before',v_outstanding,
      'pending_before',v_pending,
      'available_before',v_available
    )
  );

  if v_auto then
    perform private.expense_recognize_v2(approval_doc.id,auth.uid());
    perform private.expense_evaluate_budget_alerts_v2(approval_doc.id);
    select * into s from private.employee_advance_settlements_v2 where request_id=p_request_id;
    return to_jsonb(s)||jsonb_build_object('approval_document_id',approval_doc.id,'approval_status','approved','remaining_amount',private.employee_advance_outstanding_v2(parent_doc.id));
  else
    perform private.expense_create_approval_task_v2(approval_doc.id);
    return jsonb_build_object(
      'approval_document_id',approval_doc.id,
      'document_number',approval_doc.document_number,
      'approval_status','pending_approval',
      'amount',approval_doc.amount,
      'remaining_amount',v_outstanding,
      'available_for_new_settlement',greatest(v_available-approval_doc.amount,0)
    );
  end if;
end $function$;
