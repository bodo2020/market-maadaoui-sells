-- Task Engine: create an audit/review task when Finance receives shift cash with a non-zero variance.
-- The cash handoff financial posting remains authoritative; completing this task records a resolution only.

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
    when p_source_kind='cash_handoff' then
      public.staff_has_permission('finance.manage',p_branch_id)
      or public.staff_has_permission('pos.manage_shifts',p_branch_id)
    else false
  end;
$function$;

revoke all on function private.operations_task_can_claim(text,uuid) from public,anon,authenticated,service_role;

create or replace function private.create_cash_handoff_variance_task_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_task_id uuid;
  v_description text;
begin
  if new.status <> 'completed' or abs(coalesce(new.variance_amount,0)) <= 0.005 then
    return new;
  end if;

  v_description := format(
    'فرق استلام نقدية وردية: المتوقع %s، المستلم فعليًا %s، الفرق %s. السبب: %s',
    round(new.expected_handoff_amount,2),round(new.received_amount,2),round(new.variance_amount,2),coalesce(nullif(new.variance_reason,''),'غير موضح')
  );

  insert into public.operations_tasks(
    branch_id,task_type,source_kind,source_id,payment_method_code,payment_method_name,
    amount,priority,status,title,description,due_at,metadata,created_by
  ) values (
    new.branch_id,'cash_handoff_variance_review','cash_handoff',new.id,'cash','نقدي',
    abs(new.variance_amount),'high','open','مراجعة فرق استلام نقدية وردية',v_description,
    coalesce(new.received_at,now()) + interval '4 hours',
    jsonb_build_object(
      'handoff_id',new.id,'shift_id',new.shift_id,'cashier_id',new.cashier_id,
      'cashier_name',new.cashier_name_snapshot,'device_id',new.device_id,'device_name',new.device_name_snapshot,
      'expected_amount',round(new.expected_handoff_amount,2),'received_amount',round(new.received_amount,2),
      'variance_amount',round(new.variance_amount,2),'variance_reason',new.variance_reason,
      'received_by',new.received_by,'received_by_name',new.received_by_name_snapshot,
      'received_at',new.received_at,'transfer_id',new.transfer_id,'sla_hours',4
    ),
    new.received_by
  )
  on conflict (task_type,source_kind,source_id) do nothing
  returning id into v_task_id;

  if v_task_id is not null then
    insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
    values(v_task_id,'created',new.received_by,'تم إنشاء مهمة تلقائيًا بسبب فرق في استلام نقدية الوردية',
      jsonb_build_object('handoff_id',new.id,'shift_id',new.shift_id,'variance_amount',round(new.variance_amount,2)));
  end if;
  return new;
end;
$function$;

revoke all on function private.create_cash_handoff_variance_task_v2() from public,anon,authenticated,service_role;

drop trigger if exists create_cash_handoff_variance_task_after_receive on public.pos_shift_cash_handoffs;
create trigger create_cash_handoff_variance_task_after_receive
after update of status,variance_amount on public.pos_shift_cash_handoffs
for each row
when (new.status='completed' and abs(coalesce(new.variance_amount,0))>0.005)
execute function private.create_cash_handoff_variance_task_v2();

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
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='TASK_BRANCH_ACCESS_DENIED'; end if;
  if v_scope not in ('available','mine','active','overdue','completed','all') then raise exception using errcode='22023',message='INVALID_TASK_SCOPE'; end if;

  select coalesce(jsonb_agg(row_data order by sort_overdue desc,sort_priority,sort_created desc),'[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
      'id',t.id,'branch_id',t.branch_id,'task_type',t.task_type,'source_kind',t.source_kind,'source_id',t.source_id,
      'return_id',t.return_id,'sale_id',t.sale_id,'order_id',t.order_id,
      'payment_method_id',t.payment_method_id,'payment_method_code',t.payment_method_code,'payment_method_name',t.payment_method_name,
      'amount',t.amount,'priority',t.priority,'status',t.status,'title',t.title,'description',t.description,
      'claimed_by',t.claimed_by,'claimed_by_name',cu.name,'claimed_at',t.claimed_at,'started_at',t.started_at,
      'completed_by',t.completed_by,'completed_by_name',du.name,'completed_at',t.completed_at,
      'due_at',t.due_at,'provider_reference',t.provider_reference,'failure_reason',t.failure_reason,
      'created_at',t.created_at,'updated_at',t.updated_at,'metadata',t.metadata,'invoice_number',s.invoice_number,
      'reference_number',case
        when t.source_kind='shift_reconciliation' then 'وردية '||left(coalesce(pr.shift_id::text,t.metadata->>'shift_id',''),8)
        when t.source_kind='cash_handoff' then 'تسليم وردية '||left(coalesce(ch.shift_id::text,t.metadata->>'shift_id',''),8)
        else coalesce(s.invoice_number,t.order_id::text,t.return_id::text)
      end,
      'customer_name',coalesce(s.customer_name,c.name),'customer_phone',coalesce(s.customer_phone,c.phone),
      'shift_id',coalesce(pr.shift_id,ch.shift_id),'cashier_name',coalesce(ch.cashier_name_snapshot,su.name),
      'method_code',coalesce(pr.method_code,t.payment_method_code),
      'expected_amount',coalesce(pr.expected_amount,ch.expected_handoff_amount),
      'counted_amount',coalesce(pr.counted_amount,ch.received_amount),
      'variance_amount',coalesce(pr.variance_amount,ch.variance_amount),
      'variance_reason',coalesce(pr.variance_reason,ch.variance_reason),
      'is_mine',t.claimed_by=auth.uid(),
      'is_overdue',t.status not in ('completed','cancelled') and t.due_at is not null and t.due_at<now(),
      'can_claim',private.operations_task_can_claim(t.source_kind,t.branch_id),
      'can_release',t.claimed_by=auth.uid() or public.staff_has_permission('finance.manage',t.branch_id)
        or (t.source_kind in ('shift_reconciliation','cash_handoff') and public.staff_has_permission('pos.manage_shifts',t.branch_id))
    ) row_data,
    (t.status not in ('completed','cancelled') and t.due_at is not null and t.due_at<now()) sort_overdue,
    case t.priority when 'urgent' then 0 when 'high' then 1 else 2 end sort_priority,t.created_at sort_created
    from public.operations_tasks t
    left join public.sales s on s.id=t.sale_id
    left join public.online_orders o on o.id=t.order_id
    left join public.customers c on c.id=o.customer_id
    left join public.users cu on cu.id=t.claimed_by
    left join public.users du on du.id=t.completed_by
    left join public.pos_shift_payment_reconciliations pr on t.source_kind='shift_reconciliation' and pr.id=t.source_id
    left join public.pos_shift_cash_handoffs ch on t.source_kind='cash_handoff' and ch.id=t.source_id
    left join public.pos_shifts ps on ps.id=coalesce(pr.shift_id,ch.shift_id)
    left join public.users su on su.id=ps.user_id
    where t.branch_id=p_branch_id and (
      v_scope='all' or (v_scope='available' and t.status='open')
      or (v_scope='mine' and t.claimed_by=auth.uid() and t.status in ('claimed','in_progress','failed'))
      or (v_scope='active' and t.status in ('open','claimed','in_progress','failed'))
      or (v_scope='overdue' and t.status not in ('completed','cancelled') and t.due_at is not null and t.due_at<now())
      or (v_scope='completed' and t.status='completed')
    )
    order by sort_overdue desc,sort_priority,t.created_at desc limit v_limit
  ) q;
  return v_rows;
end;
$function$;

revoke all on function public.list_operations_tasks(uuid,text,integer) from public,anon;
grant execute on function public.list_operations_tasks(uuid,text,integer) to authenticated,service_role;
