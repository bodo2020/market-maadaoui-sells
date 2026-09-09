-- Inventory Audit V2 approval: manager-reviewed, movement-safe, atomic and idempotent adjustment.

alter table private.inventory_audit_counts_v2 drop constraint if exists inventory_audit_counts_v2_status_check;
alter table private.inventory_audit_counts_v2 add constraint inventory_audit_counts_v2_status_check
  check(status in ('assigned','counting','matched','discrepancy','resolved_no_adjustment','review_required','adjusted'));

create or replace function private.capture_inventory_movement_v2()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_source text:=nullif(current_setting('app.inventory_movement_source',true),'');
  v_task text:=nullif(current_setting('app.inventory_task_id',true),'');
begin
  if new.quantity is distinct from old.quantity then
    insert into private.inventory_movements_v2(inventory_branch_id,product_id,quantity_before,quantity_after,quantity_delta,actor_id,changed_at,metadata)
    values(new.branch_id,new.product_id,old.quantity,new.quantity,new.quantity-old.quantity,auth.uid(),clock_timestamp(),
      jsonb_strip_nulls(jsonb_build_object('inventory_row_id',new.id,'source',coalesce(v_source,'inventory_quantity_update'),'operations_task_id',v_task)));
  end if;
  return new;
end;
$function$;

create or replace function private.refresh_inventory_audit_session_v2(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare v_total int; v_done int; v_match int; v_diff int;
begin
  select count(*)::int,
         count(*) filter(where status in ('matched','discrepancy','resolved_no_adjustment','review_required','adjusted'))::int,
         count(*) filter(where status in ('matched','resolved_no_adjustment'))::int,
         count(*) filter(where status in ('discrepancy','review_required','adjusted'))::int
    into v_total,v_done,v_match,v_diff
  from private.inventory_audit_counts_v2 where session_id=p_session_id;
  update private.inventory_audit_sessions_v2
     set total_tasks=coalesce(v_total,0),completed_tasks=coalesce(v_done,0),matched_tasks=coalesce(v_match,0),discrepancy_tasks=coalesce(v_diff,0),
         status=case when coalesce(v_total,0)>0 and coalesce(v_done,0)>=coalesce(v_total,0) then 'completed' else 'active' end,
         completed_at=case when coalesce(v_total,0)>0 and coalesce(v_done,0)>=coalesce(v_total,0) then coalesce(completed_at,now()) else null end
   where id=p_session_id;
end;
$function$;

create or replace function public.get_inventory_audit_task_v2(p_task_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $function$
declare
  v_task public.operations_tasks%rowtype;
  v_result jsonb;
  v_current numeric;
  v_post_recount_movement numeric:=0;
  v_current_expected numeric;
  v_projected_physical numeric;
  v_current_delta numeric;
  v_current_gap numeric;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id;
  if v_task.id is null or v_task.source_kind not in ('inventory_count','inventory_recount','inventory_adjustment') then raise exception using errcode='22023',message='INVENTORY_TASK_NOT_FOUND'; end if;
  if not public.has_branch_access(auth.uid(),v_task.branch_id) then raise exception using errcode='42501',message='TASK_BRANCH_ACCESS_DENIED'; end if;

  if v_task.source_kind='inventory_count' then
    if v_task.claimed_by is distinct from auth.uid() and not public.staff_has_permission('inventory.manage_sessions',v_task.branch_id) then raise exception using errcode='42501',message='INVENTORY_TASK_NOT_OWNER'; end if;
    select jsonb_build_object(
      'task_id',v_task.id,'task_type',v_task.task_type,'source_kind',v_task.source_kind,'status',v_task.status,'due_at',v_task.due_at,
      'product_id',c.product_id,'product_name',p.name,'barcode',p.barcode,'image_url',case when cardinality(p.image_urls)>0 then p.image_urls[1] else null end,
      'shelf_location',p.shelf_location,'unit_of_measure',coalesce(p.unit_of_measure,p.base_unit,'قطعة'),'barcode_type',p.barcode_type,
      'blind_count',true,'audit_date',c.audit_date,'assigned_to',c.assigned_to,'assigned_at',c.assigned_at,'count_status',c.status
    ) into v_result from private.inventory_audit_counts_v2 c join public.products p on p.id=c.product_id where c.id=v_task.source_id;
  elsif v_task.source_kind='inventory_recount' then
    if v_task.claimed_by is distinct from auth.uid() and not public.staff_has_permission('inventory.manage_sessions',v_task.branch_id) then raise exception using errcode='42501',message='INVENTORY_TASK_NOT_OWNER'; end if;
    select jsonb_build_object(
      'task_id',v_task.id,'task_type',v_task.task_type,'source_kind',v_task.source_kind,'status',v_task.status,'due_at',v_task.due_at,
      'product_id',r.product_id,'product_name',p.name,'barcode',p.barcode,'image_url',case when cardinality(p.image_urls)>0 then p.image_urls[1] else null end,
      'shelf_location',p.shelf_location,'unit_of_measure',coalesce(p.unit_of_measure,p.base_unit,'قطعة'),'barcode_type',p.barcode_type,
      'blind_count',true,'assigned_to',r.assigned_to,'assigned_at',r.assigned_at,'count_status',r.status,'is_recount',true
    ) into v_result from private.inventory_audit_recounts_v2 r join public.products p on p.id=r.product_id where r.id=v_task.source_id;
  else
    if not public.staff_has_permission('inventory.approve_adjustment',v_task.branch_id) then raise exception using errcode='42501',message='INVENTORY_ADJUSTMENT_REVIEW_DENIED'; end if;
    select i.quantity into v_current
    from private.inventory_audit_recounts_v2 r join public.inventory i on i.branch_id=r.inventory_branch_id and i.product_id=r.product_id
    where r.id=v_task.source_id;
    select coalesce(sum(m.quantity_delta),0) into v_post_recount_movement
    from private.inventory_audit_recounts_v2 r
    left join private.inventory_movements_v2 m on m.inventory_branch_id=r.inventory_branch_id and m.product_id=r.product_id and m.changed_at>r.submitted_at and m.changed_at<=clock_timestamp()
    where r.id=v_task.source_id;
    select round(r.expected_at_submission+v_post_recount_movement,3),round(r.actual_count+v_post_recount_movement,3)
      into v_current_expected,v_projected_physical from private.inventory_audit_recounts_v2 r where r.id=v_task.source_id;
    v_current_gap:=round(coalesce(v_current,0)-coalesce(v_current_expected,0),3);
    v_current_delta:=round(coalesce(v_projected_physical,0)-coalesce(v_current,0),3);
    select jsonb_build_object(
      'task_id',v_task.id,'task_type',v_task.task_type,'source_kind',v_task.source_kind,'status',v_task.status,'due_at',v_task.due_at,
      'product_id',r.product_id,'product_name',p.name,'barcode',p.barcode,'image_url',case when cardinality(p.image_urls)>0 then p.image_urls[1] else null end,
      'shelf_location',p.shelf_location,'unit_of_measure',coalesce(p.unit_of_measure,p.base_unit,'قطعة'),'blind_count',false,
      'system_expected_at_recount',r.expected_at_submission,'first_count',c.actual_count,'first_variance',c.variance,
      'recount',r.actual_count,'recount_variance',r.variance,'verification_status',r.status,
      'purchase_price_snapshot',r.purchase_price_snapshot,'variance_value',r.variance_value,
      'post_recount_movement',round(v_post_recount_movement,3),'current_system_quantity',round(v_current,3),
      'current_expected_quantity',v_current_expected,'projected_physical_quantity',v_projected_physical,
      'current_adjustment_delta',v_current_delta,'movement_ledger_gap',v_current_gap,
      'allowed_reason_codes',jsonb_build_array('theft','damage','breakage','receiving_error','selling_error','previous_error','unknown')
    ) into v_result
    from private.inventory_audit_recounts_v2 r join private.inventory_audit_counts_v2 c on c.id=r.original_count_id join public.products p on p.id=r.product_id where r.id=v_task.source_id;
  end if;
  return coalesce(v_result,'{}'::jsonb);
end;
$function$;

create or replace function public.approve_inventory_adjustment_v2(p_task_id uuid,p_request_id uuid,p_reason_code text,p_note text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_task public.operations_tasks%rowtype; v_recount private.inventory_audit_recounts_v2%rowtype; v_count private.inventory_audit_counts_v2%rowtype;
  v_reason text:=lower(trim(coalesce(p_reason_code,''))); v_note text:=nullif(trim(coalesce(p_note,'')),''); v_now timestamptz:=clock_timestamp();
  v_post_movement numeric:=0; v_current numeric; v_expected_current numeric; v_projected_physical numeric; v_gap numeric; v_delta numeric; v_after numeric;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='REQUEST_ID_REQUIRED'; end if;
  if v_reason not in ('theft','damage','breakage','receiving_error','selling_error','previous_error','unknown') then raise exception using errcode='22023',message='INVALID_INVENTORY_ADJUSTMENT_REASON'; end if;
  if v_note is null or length(v_note)<3 then raise exception using errcode='22023',message='INVENTORY_ADJUSTMENT_NOTE_REQUIRED'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null or v_task.task_type<>'inventory_adjustment_review' or v_task.source_kind<>'inventory_adjustment' then raise exception using errcode='22023',message='INVENTORY_ADJUSTMENT_TASK_NOT_FOUND'; end if;
  if not public.staff_has_permission('inventory.approve_adjustment',v_task.branch_id) then raise exception using errcode='42501',message='INVENTORY_ADJUSTMENT_REVIEW_DENIED'; end if;
  if v_task.status='completed' then return to_jsonb(v_task)||jsonb_build_object('idempotent',true,'decision',v_task.metadata->>'inventory_adjustment_decision'); end if;
  if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER'; end if;
  if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TASK_NOT_COMPLETABLE'; end if;
  select * into v_recount from private.inventory_audit_recounts_v2 where id=v_task.source_id for update;
  select * into v_count from private.inventory_audit_counts_v2 where id=v_recount.original_count_id for update;
  if v_recount.id is null or v_count.id is null or v_recount.submitted_at is null or v_recount.actual_count is null or v_recount.expected_at_submission is null then raise exception using errcode='55000',message='INVENTORY_RECOUNT_INCOMPLETE'; end if;
  if v_recount.status not in ('confirmed_variance','conflicting') then raise exception using errcode='55000',message='INVENTORY_ADJUSTMENT_NOT_REQUIRED'; end if;
  select quantity into v_current from public.inventory where branch_id=v_recount.inventory_branch_id and product_id=v_recount.product_id for update;
  if v_current is null then raise exception using errcode='55000',message='INVENTORY_ROW_MISSING'; end if;
  select coalesce(sum(quantity_delta),0) into v_post_movement from private.inventory_movements_v2
  where inventory_branch_id=v_recount.inventory_branch_id and product_id=v_recount.product_id and changed_at>v_recount.submitted_at and changed_at<=v_now;
  v_expected_current:=round(v_recount.expected_at_submission+v_post_movement,3);
  v_projected_physical:=round(v_recount.actual_count+v_post_movement,3);
  v_gap:=round(v_current-v_expected_current,3);
  if abs(v_gap)>0.001 then raise exception using errcode='55000',message='INVENTORY_MOVEMENT_LEDGER_GAP',detail=jsonb_build_object('gap',v_gap)::text; end if;
  v_delta:=round(v_projected_physical-v_current,3);
  if abs(v_delta)<=0.001 then raise exception using errcode='55000',message='INVENTORY_ADJUSTMENT_ALREADY_RECONCILED'; end if;
  perform set_config('app.inventory_movement_source','inventory_audit_adjustment',true);
  perform set_config('app.inventory_task_id',v_task.id::text,true);
  v_after:=private.adjust_branch_inventory(p_request_id,v_recount.product_id,v_task.branch_id,v_delta);
  update private.inventory_audit_counts_v2 set status='adjusted',metadata=metadata||jsonb_build_object(
    'adjustment_decision','approved','adjustment_reason',v_reason,'adjustment_note',v_note,'adjustment_delta',v_delta,'adjustment_request_id',p_request_id,
    'adjusted_by',auth.uid(),'adjusted_at',now(),'quantity_before_adjustment',v_current,'quantity_after_adjustment',v_after) where id=v_count.id;
  update private.inventory_audit_recounts_v2 set metadata=metadata||jsonb_build_object(
    'adjustment_decision','approved','adjustment_reason',v_reason,'adjustment_note',v_note,'adjustment_delta',v_delta,'adjustment_request_id',p_request_id,
    'adjusted_by',auth.uid(),'adjusted_at',now()) where id=v_recount.id;
  update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),failure_reason=null,
    metadata=metadata||jsonb_build_object('inventory_adjustment_decision','approved','reason_code',v_reason,'resolution_note',v_note,
      'adjustment_request_id',p_request_id,'adjustment_delta',v_delta,'quantity_before',v_current,'quantity_after',v_after)
  where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
  values(v_task.id,'inventory_adjustment_approved',auth.uid(),v_note,jsonb_build_object('reason_code',v_reason,'adjustment_delta',v_delta,'quantity_before',v_current,'quantity_after',v_after,'request_id',p_request_id));
  perform private.refresh_inventory_audit_session_v2(v_count.session_id);
  return jsonb_build_object('task_id',v_task.id,'status','completed','decision','approved','adjustment_delta',v_delta,'quantity_before',v_current,'quantity_after',v_after,'request_id',p_request_id,'idempotent',false);
end;
$function$;

create or replace function public.reject_inventory_adjustment_v2(p_task_id uuid,p_reason_code text,p_note text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_task public.operations_tasks%rowtype; v_recount private.inventory_audit_recounts_v2%rowtype; v_count private.inventory_audit_counts_v2%rowtype;
  v_reason text:=lower(trim(coalesce(p_reason_code,''))); v_note text:=nullif(trim(coalesce(p_note,'')),'');
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
  update private.inventory_audit_counts_v2 set status='resolved_no_adjustment',metadata=metadata||jsonb_build_object(
    'adjustment_decision','rejected','rejection_reason',v_reason,'rejection_note',v_note,'resolved_by',auth.uid(),'resolved_at',now()) where id=v_count.id;
  update private.inventory_audit_recounts_v2 set metadata=metadata||jsonb_build_object(
    'adjustment_decision','rejected','rejection_reason',v_reason,'rejection_note',v_note,'resolved_by',auth.uid(),'resolved_at',now()) where id=v_recount.id;
  update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),failure_reason=null,
    metadata=metadata||jsonb_build_object('inventory_adjustment_decision','rejected','reason_code',v_reason,'resolution_note',v_note)
  where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
  values(v_task.id,'inventory_adjustment_rejected',auth.uid(),v_note,jsonb_build_object('reason_code',v_reason));
  perform private.refresh_inventory_audit_session_v2(v_count.session_id);
  return jsonb_build_object('task_id',v_task.id,'status','completed','decision','rejected','idempotent',false);
end;
$function$;

revoke all on function public.approve_inventory_adjustment_v2(uuid,uuid,text,text) from public,anon;
revoke all on function public.reject_inventory_adjustment_v2(uuid,text,text) from public,anon;
grant execute on function public.approve_inventory_adjustment_v2(uuid,uuid,text,text) to authenticated,service_role;
grant execute on function public.reject_inventory_adjustment_v2(uuid,text,text) to authenticated,service_role;
