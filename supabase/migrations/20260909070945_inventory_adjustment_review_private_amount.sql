create or replace function public.submit_inventory_recount_v2(p_task_id uuid,p_actual_count numeric,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_task public.operations_tasks%rowtype;
  v_recount private.inventory_audit_recounts_v2%rowtype;
  v_count private.inventory_audit_counts_v2%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_movement numeric:=0;
  v_expected numeric;
  v_current numeric;
  v_variance numeric;
  v_gap numeric;
  v_review_task_id uuid;
  v_product_name text;
  v_verification text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_actual_count is null or p_actual_count<0 or p_actual_count::text in ('NaN','Infinity','-Infinity') or round(p_actual_count,3)<>p_actual_count then raise exception using errcode='22023',message='INVALID_ACTUAL_COUNT'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null or v_task.task_type<>'inventory_variance_recount' or v_task.source_kind<>'inventory_recount' then raise exception using errcode='22023',message='INVENTORY_RECOUNT_TASK_NOT_FOUND'; end if;
  if v_task.status='completed' then return to_jsonb(v_task)||jsonb_build_object('idempotent',true); end if;
  if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER'; end if;
  if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TASK_NOT_SUBMITTABLE'; end if;
  select * into v_recount from private.inventory_audit_recounts_v2 where id=v_task.source_id for update;
  select * into v_count from private.inventory_audit_counts_v2 where id=v_recount.original_count_id for update;
  if v_recount.id is null or v_count.id is null then raise exception using errcode='22023',message='INVENTORY_RECOUNT_NOT_FOUND'; end if;
  if v_count.assigned_to=auth.uid() then raise exception using errcode='42501',message='INVENTORY_SELF_RECOUNT_DENIED'; end if;
  select quantity into v_current from public.inventory where branch_id=v_recount.inventory_branch_id and product_id=v_recount.product_id for update;
  if v_current is null then raise exception using errcode='55000',message='INVENTORY_ROW_MISSING'; end if;
  select coalesce(sum(quantity_delta),0) into v_movement from private.inventory_movements_v2
  where inventory_branch_id=v_recount.inventory_branch_id and product_id=v_recount.product_id and changed_at>v_recount.assigned_at and changed_at<=v_now;
  v_expected:=round(v_recount.expected_at_assignment+v_movement,3);
  v_gap:=round(v_current-v_expected,3);
  if abs(v_gap)>0.001 then raise exception using errcode='55000',message='INVENTORY_MOVEMENT_LEDGER_GAP',detail=jsonb_build_object('gap',v_gap)::text; end if;
  v_variance:=round(p_actual_count-v_expected,3);
  if abs(v_variance)<=0.001 then v_verification:='matched_system';
  elsif abs(v_variance-coalesce(v_count.variance,0))<=0.001 then v_verification:='confirmed_variance';
  else v_verification:='conflicting'; end if;
  update private.inventory_audit_recounts_v2
     set submitted_at=v_now,actual_count=p_actual_count,expected_at_submission=v_expected,movement_delta=v_movement,
         variance=v_variance,variance_value=round(v_variance*purchase_price_snapshot,2),status=v_verification,
         note=nullif(trim(coalesce(p_note,'')),''),metadata=metadata||jsonb_build_object('movement_ledger_gap',v_gap,'submitted_by',auth.uid())
   where id=v_recount.id returning * into v_recount;
  update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),metadata=metadata||jsonb_build_object('recount_result',v_verification)
  where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
  values(v_task.id,'recount_submitted',auth.uid(),nullif(trim(coalesce(p_note,'')),''),jsonb_build_object('result',v_verification));
  if v_verification='matched_system' then
    update private.inventory_audit_counts_v2 set status='resolved_no_adjustment',metadata=metadata||jsonb_build_object('resolution','peer_recount_matched_system') where id=v_count.id;
  else
    update private.inventory_audit_counts_v2 set status='review_required',metadata=metadata||jsonb_build_object('verification',v_verification) where id=v_count.id;
    select name into v_product_name from public.products where id=v_recount.product_id;
    insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,due_at,metadata,created_by)
    values(v_recount.branch_id,'inventory_adjustment_review','inventory_adjustment',v_recount.id,0,'high','open',
      'اعتماد فرق مخزون: '||coalesce(v_product_name,'منتج'),'راجع العد الأول وإعادة العد والحركات قبل اعتماد أي تسوية للمخزون. لا يتم تعديل المخزون تلقائيًا.',
      now()+interval '4 hours',jsonb_build_object('product_id',v_recount.product_id,'verification_status',v_verification,'requires_manager_approval',true),auth.uid())
    on conflict(task_type,source_kind,source_id) do update set updated_at=now()
    returning id into v_review_task_id;
    if v_review_task_id is not null then
      insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
      values(v_review_task_id,'created',auth.uid(),'تم إنشاء مراجعة تسوية مخزون بعد إعادة العد',jsonb_build_object('verification_status',v_verification));
    end if;
  end if;
  perform private.refresh_inventory_audit_session_v2(v_count.session_id);
  return jsonb_build_object('task_id',v_task.id,'status','completed','result',v_verification,'adjustment_review_task_id',v_review_task_id,'idempotent',false);
end;
$function$;
