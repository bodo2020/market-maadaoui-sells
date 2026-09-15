drop function if exists private.generate_due_recurring_expenses_v2();
create or replace function private.generate_due_recurring_expenses_v2(p_branch_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare r private.expense_recurring_rules_v2%rowtype; c private.expense_categories_v2%rowtype; v_run_id uuid; v_doc private.expense_documents_v2%rowtype; v_status text; v_auto boolean; v_today date:=timezone('Africa/Cairo',now())::date; v_count int:=0; v_guard int; begin
  for r in select * from private.expense_recurring_rules_v2 where active and next_run_date<=v_today and (p_branch_id is null or branch_id=p_branch_id) order by next_run_date,id for update skip locked loop
    v_guard:=0;
    while r.active and r.next_run_date<=v_today and v_guard<24 loop
      v_guard:=v_guard+1;
      if r.end_date is not null and r.next_run_date>r.end_date then update private.expense_recurring_rules_v2 set active=false,updated_at=now() where id=r.id; exit; end if;
      select * into c from private.expense_categories_v2 where id=r.category_id and active and (branch_id is null or branch_id=r.branch_id);
      if c.id is null then update private.expense_recurring_rules_v2 set active=false,updated_at=now() where id=r.id; exit; end if;
      insert into private.expense_recurring_runs_v2(rule_id,run_date,status) values(r.id,r.next_run_date,'creating') on conflict(rule_id,run_date) do nothing returning id into v_run_id;
      if v_run_id is not null then
        v_auto:=r.auto_submit and not (c.receipt_required_above>0 and r.amount>=c.receipt_required_above) and (not c.approval_required or (c.auto_approve_limit>0 and r.amount<=c.auto_approve_limit));
        v_status:=case when not r.auto_submit or (c.receipt_required_above>0 and r.amount>=c.receipt_required_above) then 'draft' when v_auto then 'approved' else 'pending_approval' end;
        insert into private.expense_documents_v2(request_id,document_number,branch_id,category_id,category_code,category_name,accounting_treatment,amount,beneficiary_name,tax_amount,description,notes,incurred_at,source,status,requested_by,submitted_at,approved_by,approved_at,recurring_rule_id,recurring_run_date)
        values(gen_random_uuid(),private.expense_document_number_v2(),r.branch_id,c.id,c.code,c.name_ar,c.accounting_treatment,r.amount,r.beneficiary_name,r.tax_amount,r.description,r.notes,
          (r.next_run_date::timestamp at time zone 'Africa/Cairo'),'business',v_status,r.created_by,case when v_status<>'draft' then now() end,case when v_auto then r.created_by end,case when v_auto then now() end,r.id,r.next_run_date)
        returning * into v_doc;
        update private.expense_recurring_runs_v2 set expense_document_id=v_doc.id,status=v_status where id=v_run_id;
        perform private.expense_write_audit_v2(v_doc.id,'recurring_generated',r.created_by,null,jsonb_build_object('recurring_rule_id',r.id,'run_date',r.next_run_date,'status',v_status));
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
end $$;

create or replace function public.run_due_recurring_expenses_v2(p_branch_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count int; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.manage_recurring',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_RECURRING_MANAGE_DENIED'; end if;
  v_count:=private.generate_due_recurring_expenses_v2(p_branch_id);
  return jsonb_build_object('generated',v_count,'branch_id',p_branch_id,'ran_at',now());
end $$;

do $$ declare v_job bigint; begin
  select jobid into v_job from cron.job where jobname='expense-recurring-v2' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('expense-recurring-v2','17 * * * *','select private.generate_due_recurring_expenses_v2(null);');
end $$;

revoke all on function private.generate_due_recurring_expenses_v2(uuid) from public,anon,authenticated;
revoke all on function public.run_due_recurring_expenses_v2(uuid) from public,anon;
grant execute on function public.run_due_recurring_expenses_v2(uuid) to authenticated;
