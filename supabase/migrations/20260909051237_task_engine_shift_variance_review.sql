-- Task Engine: automatically create a review task for non-zero shift payment variances.
-- Generic completion records a review resolution only; refund transfers keep their dedicated financial completion path.

create or replace function private.operations_task_can_claim(p_source_kind text, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when p_source_kind='pos_refund' then
      public.staff_has_permission('sales.refund',p_branch_id)
      or public.staff_has_permission('finance.manage',p_branch_id)
    when p_source_kind='online_refund' then
      public.staff_has_permission('online_money.settle_digital',p_branch_id)
    when p_source_kind='shift_reconciliation' then
      public.staff_has_permission('pos.manage_shifts',p_branch_id)
      or public.staff_has_permission('finance.manage',p_branch_id)
    else false
  end;
$function$;

revoke all on function private.operations_task_can_claim(text,uuid) from public,anon,authenticated,service_role;

create or replace function private.create_shift_variance_task_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_task_id uuid;
  v_priority text := 'high';
  v_method_name text;
  v_description text;
begin
  if abs(coalesce(new.variance_amount,0)) <= 0.005 then
    return new;
  end if;

  v_method_name := coalesce(nullif(new.method_name_snapshot,''),new.method_code,'وسيلة دفع');
  v_description := format(
    'فرق تسوية في نهاية الوردية: المتوقع %s، المؤكد %s، الفرق %s. السبب: %s',
    round(new.expected_amount,2),round(new.counted_amount,2),round(new.variance_amount,2),coalesce(nullif(new.variance_reason,''),'غير موضح')
  );

  insert into public.operations_tasks(
    branch_id,task_type,source_kind,source_id,payment_method_id,payment_method_code,payment_method_name,
    amount,priority,status,title,description,due_at,metadata,created_by
  ) values (
    new.branch_id,'shift_variance_review','shift_reconciliation',new.id,new.payment_method_id,new.method_code,v_method_name,
    abs(new.variance_amount),v_priority,'open','مراجعة فرق تسوية وردية',v_description,
    coalesce(new.confirmed_at,now()) + interval '4 hours',
    jsonb_build_object(
      'shift_id',new.shift_id,
      'reconciliation_id',new.id,
      'method_code',new.method_code,
      'method_name',v_method_name,
      'method_type',new.method_type_snapshot,
      'expected_amount',round(new.expected_amount,2),
      'counted_amount',round(new.counted_amount,2),
      'variance_amount',round(new.variance_amount,2),
      'variance_reason',new.variance_reason,
      'expected_source',new.expected_source,
      'confirmed_by',new.confirmed_by,
      'confirmed_by_name',new.confirmed_by_name_snapshot,
      'confirmed_at',new.confirmed_at,
      'sla_hours',4
    ),
    new.confirmed_by
  )
  on conflict (task_type,source_kind,source_id) do nothing
  returning id into v_task_id;

  if v_task_id is not null then
    insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
    values(
      v_task_id,'created',new.confirmed_by,'تم إنشاء مهمة تلقائيًا بسبب فرق في تسوية الوردية',
      jsonb_build_object('variance_amount',round(new.variance_amount,2),'method_code',new.method_code,'shift_id',new.shift_id)
    );
  end if;

  return new;
end;
$function$;

revoke all on function private.create_shift_variance_task_v2() from public,anon,authenticated,service_role;

drop trigger if exists create_shift_variance_task_after_reconciliation on public.pos_shift_payment_reconciliations;
create trigger create_shift_variance_task_after_reconciliation
after insert on public.pos_shift_payment_reconciliations
for each row execute function private.create_shift_variance_task_v2();

create or replace function public.complete_operations_task(p_task_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_task public.operations_tasks%rowtype;
  v_note text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_note:=nullif(trim(coalesce(p_note,'')),'');
  if v_note is null or length(v_note)<3 then raise exception using errcode='22023',message='TASK_COMPLETION_NOTE_REQUIRED'; end if;

  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null then raise exception using errcode='22023',message='TASK_NOT_FOUND'; end if;
  if v_task.task_type='refund_transfer' then raise exception using errcode='55000',message='TASK_REQUIRES_SPECIAL_COMPLETION'; end if;
  if v_task.status='completed' then return to_jsonb(v_task)||jsonb_build_object('idempotent',true); end if;
  if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER'; end if;
  if not private.operations_task_can_claim(v_task.source_kind,v_task.branch_id) then raise exception using errcode='42501',message='TASK_ACTION_DENIED'; end if;
  if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TASK_NOT_COMPLETABLE'; end if;

  update public.operations_tasks
     set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),
         failure_reason=null,
         metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('resolution_note',v_note,'resolved_at',now(),'resolved_by',auth.uid())
   where id=v_task.id returning * into v_task;

  insert into public.operations_task_events(task_id,event_type,actor_id,note)
  values(v_task.id,'completed',auth.uid(),v_note);

  return to_jsonb(v_task)||jsonb_build_object('idempotent',false);
end;
$function$;

revoke all on function public.complete_operations_task(uuid,text) from public,anon;
grant execute on function public.complete_operations_task(uuid,text) to authenticated,service_role;

create or replace function public.list_operations_tasks(p_branch_id uuid, p_scope text default 'active'::text, p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rows jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,100),1),250);
  v_scope text:=lower(coalesce(nullif(trim(p_scope),''),'active'));
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then
    raise exception using errcode='42501',message='TASK_BRANCH_ACCESS_DENIED';
  end if;
  if v_scope not in ('available','mine','active','overdue','completed','all') then
    raise exception using errcode='22023',message='INVALID_TASK_SCOPE';
  end if;

  select coalesce(jsonb_agg(row_data order by sort_overdue desc,sort_priority,sort_created desc),'[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'id',t.id,'branch_id',t.branch_id,'task_type',t.task_type,'source_kind',t.source_kind,'source_id',t.source_id,
      'return_id',t.return_id,'sale_id',t.sale_id,'order_id',t.order_id,
      'payment_method_id',t.payment_method_id,'payment_method_code',t.payment_method_code,'payment_method_name',t.payment_method_name,
      'amount',t.amount,'priority',t.priority,'status',t.status,'title',t.title,'description',t.description,
      'claimed_by',t.claimed_by,'claimed_by_name',cu.name,'claimed_at',t.claimed_at,'started_at',t.started_at,
      'completed_by',t.completed_by,'completed_by_name',du.name,'completed_at',t.completed_at,
      'due_at',t.due_at,'provider_reference',t.provider_reference,'failure_reason',t.failure_reason,
      'created_at',t.created_at,'updated_at',t.updated_at,'metadata',t.metadata,
      'invoice_number',s.invoice_number,
      'reference_number',case
        when t.source_kind='shift_reconciliation' then 'وردية '||left(coalesce(pr.shift_id::text,t.metadata->>'shift_id',''),8)
        else coalesce(s.invoice_number,t.order_id::text,t.return_id::text)
      end,
      'customer_name',coalesce(s.customer_name,c.name),
      'customer_phone',coalesce(s.customer_phone,c.phone),
      'shift_id',pr.shift_id,
      'cashier_name',su.name,
      'method_code',coalesce(pr.method_code,t.payment_method_code),
      'expected_amount',pr.expected_amount,
      'counted_amount',pr.counted_amount,
      'variance_amount',pr.variance_amount,
      'variance_reason',pr.variance_reason,
      'is_mine',t.claimed_by=auth.uid(),
      'is_overdue',t.status not in ('completed','cancelled') and t.due_at is not null and t.due_at<now(),
      'can_claim',private.operations_task_can_claim(t.source_kind,t.branch_id),
      'can_release',t.claimed_by=auth.uid()
        or public.staff_has_permission('finance.manage',t.branch_id)
        or (t.source_kind='shift_reconciliation' and public.staff_has_permission('pos.manage_shifts',t.branch_id))
    ) as row_data,
    (t.status not in ('completed','cancelled') and t.due_at is not null and t.due_at<now()) as sort_overdue,
    case t.priority when 'urgent' then 0 when 'high' then 1 else 2 end as sort_priority,
    t.created_at as sort_created
    from public.operations_tasks t
    left join public.sales s on s.id=t.sale_id
    left join public.online_orders o on o.id=t.order_id
    left join public.customers c on c.id=o.customer_id
    left join public.users cu on cu.id=t.claimed_by
    left join public.users du on du.id=t.completed_by
    left join public.pos_shift_payment_reconciliations pr
      on t.source_kind='shift_reconciliation' and pr.id=t.source_id
    left join public.pos_shifts ps on ps.id=pr.shift_id
    left join public.users su on su.id=ps.user_id
    where t.branch_id=p_branch_id
      and (
        v_scope='all'
        or (v_scope='available' and t.status='open')
        or (v_scope='mine' and t.claimed_by=auth.uid() and t.status in ('claimed','in_progress','failed'))
        or (v_scope='active' and t.status in ('open','claimed','in_progress','failed'))
        or (v_scope='overdue' and t.status not in ('completed','cancelled') and t.due_at is not null and t.due_at<now())
        or (v_scope='completed' and t.status='completed')
      )
    order by sort_overdue desc,sort_priority,t.created_at desc
    limit v_limit
  ) q;
  return v_rows;
end;
$function$;

revoke all on function public.list_operations_tasks(uuid,text,integer) from public,anon;
grant execute on function public.list_operations_tasks(uuid,text,integer) to authenticated,service_role;
