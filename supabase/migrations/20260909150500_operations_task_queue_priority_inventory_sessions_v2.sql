create or replace function public.list_operations_tasks(p_branch_id uuid,p_scope text default 'active',p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_rows jsonb;
  v_limit integer:=least(greatest(coalesce(p_limit,100),1),250);
  v_scope text:=lower(coalesce(nullif(trim(p_scope),''),'active'));
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='TASK_BRANCH_ACCESS_DENIED'; end if;
  if v_scope not in ('available','mine','active','overdue','completed','all') then raise exception using errcode='22023',message='INVALID_TASK_SCOPE'; end if;

  select coalesce(jsonb_agg(row_data order by sort_bucket,sort_overdue desc,sort_priority,sort_due asc nulls last,sort_created desc),'[]'::jsonb)
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
      'inventory_session_kind',nullif(t.metadata->>'session_kind',''),
      'inventory_session_id',nullif(t.metadata->>'session_id',''),
      'invoice_number',s.invoice_number,
      'reference_number',case
        when t.source_kind='shift_reconciliation' then 'وردية '||left(coalesce(pr.shift_id::text,t.metadata->>'shift_id',''),8)
        when t.source_kind='cash_handoff' then 'تسليم وردية '||left(coalesce(ch.shift_id::text,t.metadata->>'shift_id',''),8)
        else coalesce(s.invoice_number,t.order_id::text,t.return_id::text)
      end,
      'customer_name',coalesce(s.customer_name,c.name),
      'customer_phone',coalesce(s.customer_phone,c.phone),
      'shift_id',coalesce(pr.shift_id,ch.shift_id),
      'cashier_name',coalesce(ch.cashier_name_snapshot,su.name),
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
    ) as row_data,
    case
      when t.status in ('open','claimed','in_progress','failed') and t.due_at is not null and t.due_at<now() then 0
      when t.status in ('claimed','in_progress') and t.source_kind='inventory_count' and coalesce((t.metadata->>'returned_from_approval')::boolean,false) then 1
      when t.status in ('open','claimed','in_progress','failed') and t.source_kind='inventory_adjustment' then 2
      when t.status in ('claimed','in_progress','failed') and t.claimed_by=auth.uid() and coalesce(t.metadata->>'session_kind','')<>'full' then 3
      when t.status='open' and coalesce(t.metadata->>'session_kind','')<>'full' then 4
      when t.status in ('claimed','in_progress','failed') and t.claimed_by=auth.uid() and t.metadata->>'session_kind'='full' then 5
      when t.status in ('open','claimed','in_progress','failed') and coalesce(t.metadata->>'session_kind','')<>'full' then 6
      when t.status in ('open','claimed','in_progress','failed') and t.metadata->>'session_kind'='full' then 7
      when t.status='completed' then 8
      else 9
    end as sort_bucket,
    (t.status not in ('completed','cancelled') and t.due_at is not null and t.due_at<now()) as sort_overdue,
    case t.priority when 'urgent' then 0 when 'high' then 1 else 2 end as sort_priority,
    t.due_at as sort_due,
    t.created_at as sort_created
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
    where t.branch_id=p_branch_id
      and (v_scope='all' or (v_scope='available' and t.status='open') or (v_scope='mine' and t.claimed_by=auth.uid() and t.status in ('claimed','in_progress','failed'))
        or (v_scope='active' and t.status in ('open','claimed','in_progress','failed'))
        or (v_scope='overdue' and t.status not in ('completed','cancelled') and t.due_at is not null and t.due_at<now())
        or (v_scope='completed' and t.status='completed'))
    order by sort_bucket,sort_overdue desc,sort_priority,sort_due asc nulls last,t.created_at desc
    limit v_limit
  ) q;
  return v_rows;
end;
$function$;

create or replace function public.get_operations_task_dashboard_v1(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_summary jsonb;
  v_by_source jsonb;
  v_inventory_kind jsonb;
  v_overdue jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(v_uid,p_branch_id) then raise exception using errcode='42501',message='TASK_BRANCH_ACCESS_DENIED'; end if;

  select jsonb_build_object(
    'active_total',count(*) filter(where t.status in ('open','claimed','in_progress','failed')),
    'my_active',count(*) filter(where t.claimed_by=v_uid and t.status in ('claimed','in_progress','failed')),
    'available_open',count(*) filter(where t.status='open'),
    'due_soon',count(*) filter(where t.status in ('open','claimed','in_progress','failed') and t.due_at>now() and t.due_at<=now()+interval '1 hour'),
    'overdue',count(*) filter(where t.status in ('open','claimed','in_progress','failed') and t.due_at is not null and t.due_at<=now()),
    'returned_for_recount',count(*) filter(where t.source_kind='inventory_count' and t.status in ('claimed','in_progress') and coalesce((t.metadata->>'returned_from_approval')::boolean,false)),
    'approval_pending',count(*) filter(where t.source_kind='inventory_adjustment' and t.status in ('open','claimed','in_progress','failed')),
    'high_or_urgent',count(*) filter(where t.status in ('open','claimed','in_progress','failed') and t.priority in ('high','urgent')),
    'inventory_daily_active',count(*) filter(where t.source_kind='inventory_count' and t.status in ('open','claimed','in_progress','failed') and coalesce(t.metadata->>'session_kind','daily')='daily'),
    'inventory_full_active',count(*) filter(where t.source_kind='inventory_count' and t.status in ('open','claimed','in_progress','failed') and t.metadata->>'session_kind'='full'),
    'inventory_spot_active',count(*) filter(where t.source_kind='inventory_count' and t.status in ('open','claimed','in_progress','failed') and t.metadata->>'session_kind'='spot'),
    'completed_today',count(*) filter(where t.status='completed' and t.completed_at>=date_trunc('day',timezone('Africa/Cairo',now())) at time zone 'Africa/Cairo')
  ) into v_summary from public.operations_tasks t where t.branch_id=p_branch_id;

  select coalesce(jsonb_object_agg(x.source_group,x.cnt),'{}'::jsonb) into v_by_source
  from (select case when t.source_kind like 'inventory_%' then 'inventory' when t.source_kind in ('pos_refund','online_refund') then 'refunds'
    when t.source_kind in ('shift_reconciliation','cash_handoff') then 'finance_reviews' else 'other' end source_group,count(*)::int cnt
    from public.operations_tasks t where t.branch_id=p_branch_id and t.status in ('open','claimed','in_progress','failed') group by 1) x;

  select coalesce(jsonb_object_agg(x.session_kind,x.cnt),'{}'::jsonb) into v_inventory_kind
  from (select coalesce(nullif(t.metadata->>'session_kind',''),'daily') session_kind,count(*)::int cnt
    from public.operations_tasks t where t.branch_id=p_branch_id and t.source_kind='inventory_count' and t.status in ('open','claimed','in_progress','failed') group by 1) x;

  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'source_kind',t.source_kind,'status',t.status,'priority',t.priority,
    'claimed_by',t.claimed_by,'claimed_by_name',u.name,'due_at',t.due_at,'minutes_overdue',greatest(0,floor(extract(epoch from (now()-t.due_at))/60))::int,
    'action_url',private.operations_task_action_url_v1(t.source_kind)) order by t.due_at asc),'[]'::jsonb)
  into v_overdue
  from (select * from public.operations_tasks where branch_id=p_branch_id and status in ('open','claimed','in_progress','failed') and due_at is not null and due_at<=now() order by due_at asc limit 10) t
  left join public.users u on u.id=t.claimed_by;

  return jsonb_build_object('branch_id',p_branch_id,'generated_at',now(),'summary',coalesce(v_summary,'{}'::jsonb),
    'by_source',coalesce(v_by_source,'{}'::jsonb),'inventory_by_session_kind',coalesce(v_inventory_kind,'{}'::jsonb),'top_overdue',coalesce(v_overdue,'[]'::jsonb));
end;
$function$;