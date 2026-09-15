create or replace function public.submit_expense_draft_v3(p_document_id uuid,p_receipt_url text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d private.expense_documents_v2%rowtype; c private.expense_categories_v2%rowtype; v_auto boolean; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into d from private.expense_documents_v2 where id=p_document_id for update;
  if d.id is null then raise exception using errcode='22023',message='EXPENSE_DOCUMENT_NOT_FOUND'; end if;
  if d.status<>'draft' then raise exception using errcode='22023',message='EXPENSE_NOT_DRAFT'; end if;
  if d.requested_by<>auth.uid() and not (public.staff_has_permission('expense.manage_recurring',d.branch_id) or public.staff_has_permission('finance.manage',d.branch_id)) then
    raise exception using errcode='42501',message='EXPENSE_DRAFT_SUBMIT_DENIED';
  end if;
  select * into c from private.expense_categories_v2 where id=d.category_id and active and (branch_id is null or branch_id=d.branch_id);
  if c.id is null then raise exception using errcode='22023',message='EXPENSE_CATEGORY_NOT_FOUND'; end if;
  if c.receipt_required_above>0 and d.amount>=c.receipt_required_above and nullif(trim(coalesce(p_receipt_url,d.receipt_url,'')),'') is null then
    raise exception using errcode='22023',message='EXPENSE_RECEIPT_REQUIRED';
  end if;
  v_auto:=not c.require_independent_approval and (not c.approval_required or (c.auto_approve_limit>0 and d.amount<=c.auto_approve_limit));
  update private.expense_documents_v2 set
    receipt_url=coalesce(nullif(trim(coalesce(p_receipt_url,'')),''),receipt_url),
    status=case when v_auto then 'approved' else 'pending_approval' end,
    submitted_at=now(),approved_by=case when v_auto then auth.uid() else null end,approved_at=case when v_auto then now() else null end,updated_at=now()
  where id=d.id returning * into d;
  perform private.expense_write_audit_v2(d.id,'draft_submitted',auth.uid(),p_note,jsonb_build_object('status',d.status,'receipt_attached',d.receipt_url is not null));
  if v_auto then
    perform private.expense_recognize_v2(d.id,auth.uid());
    perform private.expense_evaluate_budget_alerts_v2(d.id);
  else
    perform private.expense_create_approval_task_v2(d.id);
  end if;
  update private.notification_events_v2 set status='resolved',resolved_at=coalesce(resolved_at,now()),updated_at=now()
  where recipient_user_id=auth.uid() and source_kind='expense_document' and source_id=d.id and event_key='expense.recurring_draft' and status='active';
  select * into d from private.expense_documents_v2 where id=d.id;
  return to_jsonb(d);
end $$;

revoke all on function public.submit_expense_draft_v3(uuid,text,text) from public,anon;
grant execute on function public.submit_expense_draft_v3(uuid,text,text) to authenticated;
