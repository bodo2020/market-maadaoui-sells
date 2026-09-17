create or replace function private.approval_center_action_url_v1(p_source_kind text)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when p_source_kind='franchise_operation' then '/franchise-operations-approvals'
    else private.approval_center_action_url_phase16_v1(p_source_kind)
  end
$$;

create or replace function public.complete_operations_task(p_task_id uuid,p_note text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_task public.operations_tasks%rowtype;
  v_note text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_note:=nullif(trim(coalesce(p_note,'')),'');
  if v_note is null or length(v_note)<3 then raise exception using errcode='22023',message='TASK_COMPLETION_NOTE_REQUIRED'; end if;

  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null then raise exception using errcode='22023',message='TASK_NOT_FOUND'; end if;

  if v_task.status='completed' then return to_jsonb(v_task)||jsonb_build_object('idempotent',true); end if;
  if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER'; end if;
  if not private.operations_task_can_claim(v_task.source_kind,v_task.branch_id) then raise exception using errcode='42501',message='TASK_ACTION_DENIED'; end if;
  if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TASK_NOT_COMPLETABLE'; end if;

  if v_task.source_kind='franchise_operation' then
    perform public.decide_franchise_operation_v1(v_task.source_id,'approve',v_note);
    select * into v_task from public.operations_tasks where id=p_task_id;
    return to_jsonb(v_task)||jsonb_build_object('idempotent',false,'franchise_operation_applied',true);
  end if;

  if v_task.source_kind in ('order_substitution','order_substitution_financial_adjustment','order_shortage_financial_adjustment') then
    raise exception using errcode='55000',message='TASK_REQUIRES_SPECIAL_COMPLETION';
  end if;
  if v_task.task_type in ('refund_transfer','inventory_daily_count','inventory_variance_recount','inventory_adjustment_review','inventory_transfer_dispatch','inventory_transfer_receive','hr_request_review','hr_salary_advance_payout','hr_attendance_correction_apply','treasury_disbursement','finance_transfer','finance_transfer_retry') then
    raise exception using errcode='55000',message='TASK_REQUIRES_SPECIAL_COMPLETION';
  end if;

  update public.operations_tasks
  set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),failure_reason=null,
      metadata=coalesce(metadata,'{}')||jsonb_build_object('resolution_note',v_note,'resolved_at',now(),'resolved_by',auth.uid())
  where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note)
  values(v_task.id,'completed',auth.uid(),v_note);
  return to_jsonb(v_task)||jsonb_build_object('idempotent',false);
end;
$$;

revoke all on function public.complete_operations_task(uuid,text) from public,anon;
grant execute on function public.complete_operations_task(uuid,text) to authenticated,service_role;
