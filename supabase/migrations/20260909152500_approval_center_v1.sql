create or replace function private.approval_center_is_review_task_v1(p_source_kind text)
returns boolean
language sql
immutable
set search_path=''
as $function$
  select coalesce(p_source_kind,'') in ('inventory_adjustment','shift_reconciliation','cash_handoff','inventory_transfer_variance');
$function$;

create or replace function private.approval_center_action_url_v1(p_source_kind text)
returns text
language sql
immutable
set search_path=''
as $function$
  select case
    when p_source_kind='inventory_adjustment' then '/approvals'
    when p_source_kind='shift_reconciliation' then '/tasks?type=shift'
    when p_source_kind='cash_handoff' then '/tasks?type=cash_handoff'
    when p_source_kind='inventory_transfer_variance' then '/inventory-transfers'
    else '/tasks'
  end;
$function$;

create or replace function public.get_approval_center_v1(p_branch_id uuid,p_scope text default 'pending',p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_scope text:=lower(coalesce(nullif(trim(p_scope),''),'pending'));
  v_limit integer:=least(greatest(coalesce(p_limit,100),1),250);
  v_summary jsonb;
  v_items jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(v_uid,p_branch_id) then raise exception using errcode='42501',message='APPROVAL_BRANCH_ACCESS_DENIED'; end if;
  if v_scope not in ('pending','mine','overdue','completed','all') then raise exception using errcode='22023',message='INVALID_APPROVAL_SCOPE'; end if;

  select jsonb_build_object(
    'pending',count(*) filter(where t.status in ('open','claimed','in_progress','failed') and (t.claimed_by=v_uid or private.operations_task_can_claim(t.source_kind,t.branch_id))),
    'mine',count(*) filter(where t.claimed_by=v_uid and t.status in ('claimed','in_progress','failed')),
    'overdue',count(*) filter(where t.status in ('open','claimed','in_progress','failed') and t.due_at is not null and t.due_at<=now() and (t.claimed_by=v_uid or private.operations_task_can_claim(t.source_kind,t.branch_id))),
    'critical',count(*) filter(where t.status in ('open','claimed','in_progress','failed') and (t.priority='urgent' or (t.due_at is not null and t.due_at<=now())) and (t.claimed_by=v_uid or private.operations_task_can_claim(t.source_kind,t.branch_id))),
    'inventory',count(*) filter(where t.source_kind='inventory_adjustment' and t.status in ('open','claimed','in_progress','failed') and (t.claimed_by=v_uid or private.operations_task_can_claim(t.source_kind,t.branch_id))),
    'finance',count(*) filter(where t.source_kind in ('shift_reconciliation','cash_handoff') and t.status in ('open','claimed','in_progress','failed') and (t.claimed_by=v_uid or private.operations_task_can_claim(t.source_kind,t.branch_id))),
    'transfers',count(*) filter(where t.source_kind='inventory_transfer_variance' and t.status in ('open','claimed','in_progress','failed') and (t.claimed_by=v_uid or private.operations_task_can_claim(t.source_kind,t.branch_id))),
    'completed_today',count(*) filter(where t.status='completed' and t.completed_at>=date_trunc('day',timezone('Africa/Cairo',now())) at time zone 'Africa/Cairo' and (t.completed_by=v_uid or private.operations_task_can_claim(t.source_kind,t.branch_id)))
  ) into v_summary
  from public.operations_tasks t
  where t.branch_id=p_branch_id and private.approval_center_is_review_task_v1(t.source_kind);

  select coalesce(jsonb_agg(x.item order by x.sort_active desc,x.sort_overdue desc,x.sort_priority,x.sort_due asc nulls last,x.sort_created desc),'[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'id',t.id,'branch_id',t.branch_id,'task_type',t.task_type,'source_kind',t.source_kind,'source_id',t.source_id,
      'title',t.title,'description',t.description,'status',t.status,'priority',t.priority,'amount',t.amount,
      'claimed_by',t.claimed_by,'claimed_by_name',cu.name,'claimed_at',t.claimed_at,'started_at',t.started_at,
      'completed_by',t.completed_by,'completed_by_name',du.name,'completed_at',t.completed_at,'due_at',t.due_at,
      'failure_reason',t.failure_reason,'created_at',t.created_at,'updated_at',t.updated_at,'metadata',t.metadata,
      'is_mine',t.claimed_by=v_uid,'can_claim',t.status='open' and private.operations_task_can_claim(t.source_kind,t.branch_id),
      'can_decide',(t.claimed_by=v_uid and t.status in ('claimed','in_progress')),
      'is_overdue',t.status in ('open','claimed','in_progress','failed') and t.due_at is not null and t.due_at<=now(),
      'decision',coalesce(t.metadata->>'inventory_adjustment_decision',t.metadata->>'decision'),
      'resolution_note',t.metadata->>'resolution_note','action_url',private.approval_center_action_url_v1(t.source_kind)
    ) item,
    (t.status in ('open','claimed','in_progress','failed'))::int sort_active,
    (t.status in ('open','claimed','in_progress','failed') and t.due_at is not null and t.due_at<=now())::int sort_overdue,
    case t.priority when 'urgent' then 0 when 'high' then 1 else 2 end sort_priority,
    t.due_at sort_due,t.created_at sort_created
    from public.operations_tasks t
    left join public.users cu on cu.id=t.claimed_by
    left join public.users du on du.id=t.completed_by
    where t.branch_id=p_branch_id and private.approval_center_is_review_task_v1(t.source_kind)
      and ((t.status in ('open','claimed','in_progress','failed') and (t.claimed_by=v_uid or private.operations_task_can_claim(t.source_kind,t.branch_id)))
        or (t.status='completed' and (t.completed_by=v_uid or private.operations_task_can_claim(t.source_kind,t.branch_id))))
      and (v_scope='all' or (v_scope='pending' and t.status in ('open','claimed','in_progress','failed'))
        or (v_scope='mine' and t.claimed_by=v_uid and t.status in ('claimed','in_progress','failed'))
        or (v_scope='overdue' and t.status in ('open','claimed','in_progress','failed') and t.due_at is not null and t.due_at<=now())
        or (v_scope='completed' and t.status='completed'))
    order by sort_active desc,sort_overdue desc,sort_priority,sort_due asc nulls last,t.created_at desc
    limit v_limit
  ) x;

  return jsonb_build_object('version',1,'branch_id',p_branch_id,'scope',v_scope,'generated_at',now(),
    'summary',coalesce(v_summary,'{}'::jsonb),'items',coalesce(v_items,'[]'::jsonb));
end;
$function$;

revoke all on function public.get_approval_center_v1(uuid,text,integer) from public,anon;
grant execute on function public.get_approval_center_v1(uuid,text,integer) to authenticated,service_role;