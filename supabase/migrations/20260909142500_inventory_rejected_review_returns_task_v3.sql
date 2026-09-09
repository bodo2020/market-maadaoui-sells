-- Return rejected inventory adjustment reviews to the original counter for a fresh blind count.

create or replace function public.submit_inventory_count_v2(p_task_id uuid,p_actual_count numeric,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_task public.operations_tasks%rowtype;
  v_count private.inventory_audit_counts_v2%rowtype;
  v_existing_recount private.inventory_audit_recounts_v2%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_movement numeric:=0;
  v_expected numeric;
  v_current numeric;
  v_variance numeric;
  v_gap numeric;
  v_recount_id uuid;
  v_recount_task_id uuid;
  v_peer uuid;
  v_product_name text;
  v_retry_attempt integer:=0;
  v_post_recount_movement numeric:=0;
  v_peer_projected numeric;
  v_verification text;
  v_review_task_id uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_actual_count is null or p_actual_count<0 or p_actual_count::text in ('NaN','Infinity','-Infinity') or round(p_actual_count,3)<>p_actual_count then raise exception using errcode='22023',message='INVALID_ACTUAL_COUNT'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null or v_task.task_type<>'inventory_daily_count' or v_task.source_kind<>'inventory_count' then raise exception using errcode='22023',message='INVENTORY_COUNT_TASK_NOT_FOUND'; end if;
  if v_task.status='completed' then return to_jsonb(v_task)||jsonb_build_object('idempotent',true); end if;
  if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER'; end if;
  if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TASK_NOT_SUBMITTABLE'; end if;
  select * into v_count from private.inventory_audit_counts_v2 where id=v_task.source_id for update;
  if v_count.id is null then raise exception using errcode='22023',message='INVENTORY_COUNT_NOT_FOUND'; end if;
  v_retry_attempt:=coalesce((v_count.metadata->>'retry_attempt')::integer,0);

  select quantity into v_current from public.inventory where branch_id=v_count.inventory_branch_id and product_id=v_count.product_id for update;
  if v_current is null then raise exception using errcode='55000',message='INVENTORY_ROW_MISSING'; end if;
  select coalesce(sum(quantity_delta),0) into v_movement from private.inventory_movements_v2
  where inventory_branch_id=v_count.inventory_branch_id and product_id=v_count.product_id and changed_at>v_count.assigned_at and changed_at<=v_now;
  v_expected:=round(v_count.expected_at_assignment+v_movement,3);
  v_gap:=round(v_current-v_expected,3);
  if abs(v_gap)>0.001 then raise exception using errcode='55000',message='INVENTORY_MOVEMENT_LEDGER_GAP',detail=jsonb_build_object('gap',v_gap)::text; end if;
  v_variance:=round(p_actual_count-v_expected,3);

  update private.inventory_audit_counts_v2
     set submitted_at=v_now,actual_count=p_actual_count,expected_at_submission=v_expected,movement_delta=v_movement,
         variance=v_variance,variance_value=round(v_variance*purchase_price_snapshot,2),
         status=case when abs(v_variance)<=0.001 then 'matched' else 'discrepancy' end,
         note=nullif(trim(coalesce(p_note,'')),''),metadata=metadata||jsonb_build_object('movement_ledger_gap',v_gap,'submitted_by',auth.uid(),'last_retry_attempt',v_retry_attempt)
   where id=v_count.id returning * into v_count;

  update public.operations_tasks
     set status='completed',completed_by=auth.uid(),completed_at=now(),failure_reason=null,updated_at=now(),
         metadata=metadata||jsonb_build_object('count_result',case when abs(v_variance)<=0.001 then 'matched' else 'discrepancy' end,'variance_detected',abs(v_variance)>0.001,'retry_attempt',v_retry_attempt)
   where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
  values(v_task.id,case when v_retry_attempt>0 then 'returned_count_submitted' else 'count_submitted' end,auth.uid(),nullif(trim(coalesce(p_note,'')),''),
    jsonb_build_object('result',case when abs(v_variance)<=0.001 then 'matched' else 'discrepancy' end,'retry_attempt',v_retry_attempt));

  if abs(v_variance)>0.001 then
    select * into v_existing_recount from private.inventory_audit_recounts_v2 where original_count_id=v_count.id limit 1;

    if v_retry_attempt>0 and v_existing_recount.id is not null and v_existing_recount.submitted_at is not null and v_existing_recount.actual_count is not null then
      select coalesce(sum(quantity_delta),0) into v_post_recount_movement
      from private.inventory_movements_v2
      where inventory_branch_id=v_existing_recount.inventory_branch_id and product_id=v_existing_recount.product_id
        and changed_at>v_existing_recount.submitted_at and changed_at<=v_now;
      v_peer_projected:=round(v_existing_recount.actual_count+v_post_recount_movement,3);
      v_verification:=case when abs(p_actual_count-v_peer_projected)<=0.001 then 'confirmed_variance' else 'conflicting' end;

      update private.inventory_audit_recounts_v2
         set status=v_verification,
             metadata=metadata||jsonb_build_object('retry_attempt',v_retry_attempt,'retry_count',p_actual_count,'retry_expected',v_expected,
               'peer_projected_at_retry',v_peer_projected,'retry_verification',v_verification,'retry_submitted_at',v_now)
       where id=v_existing_recount.id;
      update private.inventory_audit_counts_v2
         set status='review_required',metadata=metadata||jsonb_build_object('verification',v_verification,'retry_attempt',v_retry_attempt,'peer_projected_at_retry',v_peer_projected)
       where id=v_count.id;

      update public.operations_tasks
         set status='open',claimed_by=null,claimed_at=null,started_at=null,completed_by=null,completed_at=null,failure_reason=null,
             due_at=now()+interval '4 hours',updated_at=now(),
             metadata=metadata||jsonb_build_object('verification_status',v_verification,'retry_attempt',v_retry_attempt,'reopened_after_returned_count',true)
       where task_type='inventory_adjustment_review' and source_kind='inventory_adjustment' and source_id=v_existing_recount.id
       returning id into v_review_task_id;

      if v_review_task_id is null then
        select name into v_product_name from public.products where id=v_count.product_id;
        insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,due_at,metadata,created_by)
        values(v_count.branch_id,'inventory_adjustment_review','inventory_adjustment',v_existing_recount.id,0,'high','open',
          'اعتماد فرق مخزون: '||coalesce(v_product_name,'منتج'),
          'تمت إعادة الجرد بعد رفض سابق. راجع العد الجديد مع إعادة العد المستقلة والحركات قبل أي تسوية.',
          now()+interval '4 hours',jsonb_build_object('product_id',v_count.product_id,'verification_status',v_verification,'requires_manager_approval',true,'retry_attempt',v_retry_attempt),auth.uid())
        returning id into v_review_task_id;
      end if;

      insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
      values(v_review_task_id,'reopened_after_returned_count',auth.uid(),'تمت إعادة الجرد بعد رفض المراجعة السابقة',jsonb_build_object('verification_status',v_verification,'retry_attempt',v_retry_attempt));

      insert into private.notification_events_v2(
        audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,
        action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at
      )
      select 'staff',u.id,v_count.branch_id,'task.inventory_adjustment.retry','inventory','high',
        'مراجعة فرق مخزون عادت بعد إعادة الجرد','تمت إعادة عد المنتج بعد رفض سابق والمراجعة تحتاج قرارًا جديدًا.',
        'operations_task',v_review_task_id,'/tasks?type=inventory','فتح المراجعة',true,
        'task-review-reopened:'||v_review_task_id::text||':'||v_retry_attempt::text,array['in_app']::text[],'active',
        jsonb_build_object('retry_attempt',v_retry_attempt,'verification_status',v_verification,'product_id',v_count.product_id),now(),now()
      from public.users u
      where coalesce(u.active,true) and private.staff_user_has_permission_v3(u.id,'inventory.approve_adjustment',v_count.branch_id)
      on conflict(recipient_user_id,dedupe_key) do nothing;
    else
      select u.id into v_peer
      from public.user_branch_roles ubr
      join public.users u on u.id=ubr.user_id and coalesce(u.active,true)
      join public.staff_role_permissions rp on rp.role_id=ubr.role_id
      join public.staff_permissions sp on sp.id=rp.permission_id and sp.code='inventory.recount'
      where ubr.branch_id=v_count.branch_id and ubr.active and u.id<>v_count.assigned_to
      group by u.id
      order by hashtextextended(u.id::text||':'||v_count.id::text,83)
      limit 1;
      insert into private.inventory_audit_recounts_v2(original_count_id,branch_id,inventory_branch_id,product_id,assigned_to,expected_at_assignment,purchase_price_snapshot,assigned_at,metadata)
      values(v_count.id,v_count.branch_id,v_count.inventory_branch_id,v_count.product_id,v_peer,v_expected,v_count.purchase_price_snapshot,v_now,jsonb_build_object('blind_recount',true,'original_variance_hidden',true))
      returning id into v_recount_id;
      select name into v_product_name from public.products where id=v_count.product_id;
      insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,claimed_by,claimed_at,due_at,metadata,created_by)
      values(v_count.branch_id,'inventory_variance_recount','inventory_recount',v_recount_id,0,'high',case when v_peer is null then 'open' else 'claimed' end,
        'إعادة عد فرق جرد: '||coalesce(v_product_name,'منتج'),'أعد عدّ المنتج بشكل مستقل. نتيجة العد الأول ورصيد النظام مخفيان عنك.',
        v_peer,case when v_peer is null then null else now() end,now()+interval '4 hours',jsonb_build_object('product_id',v_count.product_id,'blind_count',true,'peer_review',true),auth.uid())
      returning id into v_recount_task_id;
      update private.inventory_audit_recounts_v2 set task_id=v_recount_task_id where id=v_recount_id;
      insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
      values(v_recount_task_id,'assigned',auth.uid(),'تم إنشاء إعادة عد مستقلة بسبب فرق الجرد',jsonb_build_object('assigned_to',v_peer));
    end if;
  end if;

  perform private.refresh_inventory_audit_session_v2(v_count.session_id);
  return jsonb_build_object('task_id',v_task.id,'status','completed',
    'result',case when abs(v_variance)<=0.001 then 'matched' when v_review_task_id is not null then coalesce(v_verification,'review_required') else 'discrepancy' end,
    'recount_task_id',v_recount_task_id,'adjustment_review_task_id',v_review_task_id,'retry_attempt',v_retry_attempt,'idempotent',false);
end;
$function$;

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
  v_retry_attempt:=coalesce((v_count.metadata->>'retry_attempt')::integer,0)+1;
  v_history:=coalesce(v_count.metadata->'retry_history','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
    'retry_attempt',v_retry_attempt,'previous_count',v_count.actual_count,'previous_expected',v_count.expected_at_submission,'previous_variance',v_count.variance,
    'peer_count',v_recount.actual_count,'peer_expected',v_recount.expected_at_submission,'peer_variance',v_recount.variance,
    'rejection_reason',v_reason,'rejection_note',v_note,'rejected_by',auth.uid(),'rejected_at',now()));

  update private.inventory_audit_counts_v2
     set expected_at_assignment=v_current,assigned_at=clock_timestamp(),submitted_at=null,actual_count=null,expected_at_submission=null,
         movement_delta=null,variance=null,variance_value=null,status='assigned',note=null,
         metadata=metadata||jsonb_build_object('adjustment_decision','rejected','rejection_reason',v_reason,'rejection_note',v_note,
           'returned_by',auth.uid(),'returned_at',now(),'retry_attempt',v_retry_attempt,'retry_history',v_history)
   where id=v_count.id returning * into v_count;

  update private.inventory_audit_recounts_v2
     set metadata=metadata||jsonb_build_object('adjustment_decision','rejected','rejection_reason',v_reason,'rejection_note',v_note,'resolved_by',auth.uid(),'resolved_at',now(),'retry_attempt',v_retry_attempt)
   where id=v_recount.id;

  update public.operations_tasks
     set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),failure_reason=null,
         metadata=metadata||jsonb_build_object('inventory_adjustment_decision','rejected','reason_code',v_reason,'resolution_note',v_note,'retry_attempt',v_retry_attempt,'returned_to_counter',true)
   where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
  values(v_task.id,'inventory_adjustment_rejected',auth.uid(),v_note,jsonb_build_object('reason_code',v_reason,'retry_attempt',v_retry_attempt,'returned_to_counter',true));

  update public.operations_tasks
     set status='failed',failure_reason='تم إرجاع الجرد من المراجعة: '||v_note,completed_by=null,completed_at=null,started_at=null,
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
    'تم إرجاع مهمة جرد لإعادة العد',v_note,'operations_task',v_returned_task_id,'/tasks?type=inventory','إعادة العد',true,
    'task-returned:'||v_returned_task_id::text||':'||v_retry_attempt::text,array['in_app']::text[],'active',
    jsonb_build_object('retry_attempt',v_retry_attempt,'reason_code',v_reason,'approval_task_id',v_task.id,'product_id',v_count.product_id),now(),now()
  ) on conflict(recipient_user_id,dedupe_key) do nothing;

  perform private.refresh_inventory_audit_session_v2(v_count.session_id);
  return jsonb_build_object('task_id',v_task.id,'status','completed','decision','rejected','returned_task_id',v_returned_task_id,'retry_attempt',v_retry_attempt,'idempotent',false);
end;
$function$;