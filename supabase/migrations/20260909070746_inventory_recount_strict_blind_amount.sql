create or replace function public.submit_inventory_count_v2(p_task_id uuid,p_actual_count numeric,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_task public.operations_tasks%rowtype;
  v_count private.inventory_audit_counts_v2%rowtype;
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
         note=nullif(trim(coalesce(p_note,'')),''),metadata=metadata||jsonb_build_object('movement_ledger_gap',v_gap,'submitted_by',auth.uid())
   where id=v_count.id returning * into v_count;
  update public.operations_tasks
     set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),
         metadata=metadata||jsonb_build_object('count_result',case when abs(v_variance)<=0.001 then 'matched' else 'discrepancy' end,'variance_detected',abs(v_variance)>0.001)
   where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
  values(v_task.id,'count_submitted',auth.uid(),nullif(trim(coalesce(p_note,'')),''),jsonb_build_object('result',case when abs(v_variance)<=0.001 then 'matched' else 'discrepancy' end));

  if abs(v_variance)>0.001 then
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
    values(v_count.branch_id,'inventory_variance_recount','inventory_recount',v_recount_id,0,'high',
      case when v_peer is null then 'open' else 'claimed' end,'إعادة عد فرق جرد: '||coalesce(v_product_name,'منتج'),
      'أعد عدّ المنتج بشكل مستقل. نتيجة العد الأول ورصيد النظام مخفيان عنك.',v_peer,case when v_peer is null then null else now() end,
      now()+interval '4 hours',jsonb_build_object('product_id',v_count.product_id,'blind_count',true,'peer_review',true),auth.uid())
    returning id into v_recount_task_id;
    update private.inventory_audit_recounts_v2 set task_id=v_recount_task_id where id=v_recount_id;
    insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
    values(v_recount_task_id,'assigned',auth.uid(),'تم إنشاء إعادة عد مستقلة بسبب فرق الجرد',jsonb_build_object('assigned_to',v_peer));
  end if;
  perform private.refresh_inventory_audit_session_v2(v_count.session_id);
  return jsonb_build_object('task_id',v_task.id,'status','completed','result',case when abs(v_variance)<=0.001 then 'matched' else 'discrepancy' end,'recount_task_id',v_recount_task_id,'idempotent',false);
end;
$function$;
