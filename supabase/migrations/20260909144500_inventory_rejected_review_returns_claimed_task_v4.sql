create or replace function public.reject_inventory_adjustment_v2(p_task_id uuid,p_reason_code text,p_note text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_task public.operations_tasks%rowtype;
  v_recount private.inventory_audit_recounts_v2%rowtype;
  v_count private.inventory_audit_counts_v2%rowtype;
  v_reason text:=lower(trim(coalesce(p_reason_code,'')));
  v_note text:=nullif(trim(coalesce(p_note,'')),'');
  v_current numeric;
  v_retry_attempt integer;
  v_returned_task_id uuid;
  v_history jsonb;
  v_product_name text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if v_reason not in ('counting_error','insufficient_evidence','investigation_required','other') then raise exception using errcode='22023',message='INVALID_INVENTORY_REJECTION_REASON'; end if;
  if v_note is null or length(v_note)<3 then raise exception using errcode='22023',message='INVENTORY_ADJUSTMENT_NOTE_REQUIRED'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null or v_task.task_type<>'inventory_adjustment_review' or v_task.source_kind<>'inventory_adjustment' then raise exception using errcode='22023',message='INVENTORY_ADJUSTMENT_TASK_NOT_FOUND'; end if;
  if not public.staff_has_permission('inventory.approve_adjustment',v_task.branch_id) then raise exception using errcode='42501',message='INVENTORY_ADJUSTMENT_REVIEW_DENIED'; end if;
  if v_task.status='completed' then return to_jsonb(v_task)||jsonb_build_object('idempotent',true,'decision',v_task.metadata->>'inventory_adjustment_decision'); end if;
  if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER'; end if;
  if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TASK_NOT_COMPLETABLE'; end if;
  select * into v_recount from private.inventory_audit_recounts_v2 where id=v_task.source_id for update;
  select * into v_count from private.inventory_audit_counts_v2 where id=v_recount.original_count_id for update;
  if v_recount.id is null or v_count.id is null then raise exception using errcode='22023',message='INVENTORY_RECOUNT_NOT_FOUND'; end if;

  select quantity into v_current from public.inventory where branch_id=v_count.inventory_branch_id and product_id=v_count.product_id for update;
  if v_current is null then raise exception using errcode='55000',message='INVENTORY_ROW_MISSING'; end if;
  select name into v_product_name from public.products where id=v_count.product_id;

  v_retry_attempt:=coalesce((v_count.metadata->>'retry_attempt')::integer,0)+1;
  v_history:=coalesce(v_count.metadata->'retry_history','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
    'retry_attempt',v_retry_attempt,
    'previous_count',v_count.actual_count,'previous_expected',v_count.expected_at_submission,'previous_variance',v_count.variance,
    'peer_count',v_recount.actual_count,'peer_expected',v_recount.expected_at_submission,'peer_variance',v_recount.variance,
    'rejection_reason',v_reason,'rejection_note',v_note,'rejected_by',auth.uid(),'rejected_at',now()
  ));

  update private.inventory_audit_counts_v2
     set expected_at_assignment=v_current,assigned_at=clock_timestamp(),submitted_at=null,actual_count=null,expected_at_submission=null,
         movement_delta=null,variance=null,variance_value=null,status='assigned',note=null,
         metadata=metadata||jsonb_build_object(
           'adjustment_decision','rejected','rejection_reason',v_reason,'rejection_note',v_note,
           'returned_by',auth.uid(),'returned_at',now(),'retry_attempt',v_retry_attempt,'retry_history',v_history
         )
   where id=v_count.id returning * into v_count;

  update private.inventory_audit_recounts_v2
     set metadata=metadata||jsonb_build_object(
       'adjustment_decision','rejected','rejection_reason',v_reason,'rejection_note',v_note,'resolved_by',auth.uid(),'resolved_at',now(),'retry_attempt',v_retry_attempt
     )
   where id=v_recount.id;

  update public.operations_tasks
     set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),failure_reason=null,
         metadata=metadata||jsonb_build_object('inventory_adjustment_decision','rejected','reason_code',v_reason,'resolution_note',v_note,'retry_attempt',v_retry_attempt,'returned_to_counter',true)
   where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
  values(v_task.id,'inventory_adjustment_rejected',auth.uid(),v_note,jsonb_build_object('reason_code',v_reason,'retry_attempt',v_retry_attempt,'returned_to_counter',true));

  update public.operations_tasks
     set status='claimed',
         title='مطلوب إعادة جرد: '||coalesce(v_product_name,'منتج'),
         description='تم رفض تسوية فرق الجرد وإرجاع المهمة لك لإعادة العد بشكل أعمى. ملاحظة المراجع: '||v_note,
         failure_reason=null,claimed_by=v_count.assigned_to,claimed_at=now(),completed_by=null,completed_at=null,started_at=null,
         due_at=now()+interval '4 hours',updated_at=now(),
         metadata=metadata||jsonb_build_object('returned_from_approval',true,'return_reason',v_reason,'return_note',v_note,'retry_attempt',v_retry_attempt,'returned_by',auth.uid(),'returned_at',now())
   where id=v_count.task_id and source_kind='inventory_count'
   returning id into v_returned_task_id;

  if v_returned_task_id is null then raise exception using errcode='55000',message='INVENTORY_ORIGINAL_COUNT_TASK_MISSING'; end if;

  insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
  values(v_returned_task_id,'returned_for_recount',auth.uid(),v_note,jsonb_build_object('reason_code',v_reason,'retry_attempt',v_retry_attempt,'approval_task_id',v_task.id));

  insert into private.notification_events_v2(
    audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,
    action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at
  ) values (
    'staff',v_count.assigned_to,v_count.branch_id,'task.inventory_count.returned','inventory','high',
    'مطلوب إعادة جرد منتج',v_note,'operations_task',v_returned_task_id,
    '/tasks?type=inventory','إعادة الجرد',true,
    'task-returned:'||v_returned_task_id::text||':'||v_retry_attempt::text,array['in_app']::text[],'active',
    jsonb_build_object('retry_attempt',v_retry_attempt,'reason_code',v_reason,'approval_task_id',v_task.id,'product_id',v_count.product_id),now(),now()
  ) on conflict(recipient_user_id,dedupe_key) do nothing;

  perform private.refresh_inventory_audit_session_v2(v_count.session_id);
  return jsonb_build_object('task_id',v_task.id,'status','completed','decision','rejected','returned_task_id',v_returned_task_id,'retry_attempt',v_retry_attempt,'returned_status','claimed','idempotent',false);
end;
$function$;

update public.operations_tasks
set status='claimed',
    title=case when coalesce(metadata->>'return_note','')<>'' then 'مطلوب إعادة جرد: '||regexp_replace(title,'^جرد يومي:\s*','','i') else title end,
    description=case when coalesce(metadata->>'return_note','')<>'' then 'تم رفض تسوية فرق الجرد وإرجاع المهمة لك لإعادة العد بشكل أعمى. ملاحظة المراجع: '||(metadata->>'return_note') else description end,
    failure_reason=null,
    claimed_at=coalesce(claimed_at,now()),
    updated_at=now()
where source_kind='inventory_count' and status='failed' and coalesce((metadata->>'returned_from_approval')::boolean,false);