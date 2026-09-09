create or replace function private.operations_task_action_url_v1(p_source_kind text)
returns text
language sql
immutable
set search_path=''
as $function$
  select case
    when p_source_kind in ('inventory_transfer_dispatch','inventory_transfer_receive') then '/inventory-transfers'
    when p_source_kind like 'inventory_%' then '/tasks?type=inventory'
    when p_source_kind='shift_reconciliation' then '/tasks?type=shift'
    when p_source_kind='cash_handoff' then '/tasks?type=cash_handoff'
    when p_source_kind in ('pos_refund','online_refund') then '/tasks?type=refund'
    else '/tasks'
  end;
$function$;

create or replace function private.run_operations_task_sla_escalation_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_warning_count integer:=0;
  v_overdue_assignee_count integer:=0;
  v_manager_count integer:=0;
  v_resolved_count integer:=0;
  v_task record;
  v_manager record;
  v_due_key text;
  v_action text;
begin
  update private.notification_events_v2 e
     set status='resolved',resolved_at=coalesce(resolved_at,now()),updated_at=now()
   where e.source_kind='operations_task_sla'
     and e.status='active'
     and not exists(
       select 1 from public.operations_tasks t
       where t.id=e.source_id and t.status in ('open','claimed','in_progress','failed')
     );
  get diagnostics v_resolved_count=row_count;

  for v_task in
    select t.*
    from public.operations_tasks t
    where t.status in ('claimed','in_progress','failed')
      and t.claimed_by is not null
      and t.due_at is not null
      and t.due_at>now()
      and t.due_at<=now()+interval '1 hour'
  loop
    v_due_key:=floor(extract(epoch from v_task.due_at))::bigint::text;
    v_action:=private.operations_task_action_url_v1(v_task.source_kind);
    insert into private.notification_events_v2(
      audience,recipient_user_id,branch_id,event_key,category,severity,title,body,
      source_kind,source_id,action_url,action_label,requires_action,dedupe_key,
      eligible_channels,status,metadata,created_at,updated_at
    ) values (
      'staff',v_task.claimed_by,v_task.branch_id,'task.sla.warning','tasks','high',
      'المهمة تقترب من موعدها',
      coalesce(v_task.title,'مهمة تشغيلية')||' — متبقي أقل من ساعة على موعد التنفيذ.',
      'operations_task_sla',v_task.id,v_action,'فتح المهمة',true,
      'task-sla-warning:'||v_task.id::text||':'||v_due_key,
      array['in_app']::text[],'active',
      jsonb_build_object('sla_kind','warning','due_at',v_task.due_at,'task_status',v_task.status,'task_source_kind',v_task.source_kind),
      now(),now()
    ) on conflict(recipient_user_id,dedupe_key) do update set
      title=excluded.title,body=excluded.body,status='active',resolved_at=null,updated_at=now(),metadata=excluded.metadata;
    v_warning_count:=v_warning_count+1;
  end loop;

  for v_task in
    select t.*
    from public.operations_tasks t
    where t.status in ('open','claimed','in_progress','failed')
      and t.due_at is not null
      and t.due_at<=now()
  loop
    v_due_key:=floor(extract(epoch from v_task.due_at))::bigint::text;
    v_action:=private.operations_task_action_url_v1(v_task.source_kind);

    if v_task.claimed_by is not null then
      insert into private.notification_events_v2(
        audience,recipient_user_id,branch_id,event_key,category,severity,title,body,
        source_kind,source_id,action_url,action_label,requires_action,dedupe_key,
        eligible_channels,status,metadata,created_at,updated_at
      ) values (
        'staff',v_task.claimed_by,v_task.branch_id,'task.sla.overdue','tasks','critical',
        'مهمة تجاوزت موعد التنفيذ',
        coalesce(v_task.title,'مهمة تشغيلية')||' تجاوزت وقت التنفيذ المحدد وتحتاج إجراء الآن.',
        'operations_task_sla',v_task.id,v_action,'فتح المهمة',true,
        'task-sla-overdue:'||v_task.id::text||':'||v_due_key,
        array['in_app']::text[],'active',
        jsonb_build_object('sla_kind','overdue','due_at',v_task.due_at,'task_status',v_task.status,'task_source_kind',v_task.source_kind),
        now(),now()
      ) on conflict(recipient_user_id,dedupe_key) do update set
        title=excluded.title,body=excluded.body,status='active',resolved_at=null,updated_at=now(),metadata=excluded.metadata;
      v_overdue_assignee_count:=v_overdue_assignee_count+1;
    end if;

    for v_manager in
      select u.id
      from public.users u
      where coalesce(u.active,true)
        and u.id is distinct from v_task.claimed_by
        and private.staff_user_has_permission_v3(u.id,'branch.manage_staff',v_task.branch_id)
    loop
      insert into private.notification_events_v2(
        audience,recipient_user_id,branch_id,event_key,category,severity,title,body,
        source_kind,source_id,action_url,action_label,requires_action,dedupe_key,
        eligible_channels,status,metadata,created_at,updated_at
      ) values (
        'staff',v_manager.id,v_task.branch_id,'task.sla.escalated','tasks','critical',
        'تصعيد: مهمة متأخرة في الفرع',
        coalesce(v_task.title,'مهمة تشغيلية')||case when v_task.claimed_by is null then ' لم يتم استلامها حتى الآن.' else ' تجاوزت موعدها وتحتاج متابعة المسؤول.' end,
        'operations_task_sla',v_task.id,v_action,'فتح المهمة',true,
        'task-sla-manager:'||v_task.id::text||':'||v_due_key,
        array['in_app']::text[],'active',
        jsonb_build_object('sla_kind','manager_escalation','due_at',v_task.due_at,'task_status',v_task.status,'task_source_kind',v_task.source_kind,'claimed_by',v_task.claimed_by),
        now(),now()
      ) on conflict(recipient_user_id,dedupe_key) do update set
        title=excluded.title,body=excluded.body,status='active',resolved_at=null,updated_at=now(),metadata=excluded.metadata;
      v_manager_count:=v_manager_count+1;
    end loop;
  end loop;

  update private.notification_events_v2 e
     set status='resolved',resolved_at=coalesce(resolved_at,now()),updated_at=now()
   where e.source_kind='operations_task_sla' and e.status='active' and e.event_key='task.sla.warning'
     and exists(select 1 from public.operations_tasks t where t.id=e.source_id and t.due_at<=now());

  return jsonb_build_object('warnings',v_warning_count,'overdue_assignees',v_overdue_assignee_count,
    'manager_escalations',v_manager_count,'resolved',v_resolved_count,'ran_at',now());
end;
$function$;

revoke all on function private.run_operations_task_sla_escalation_v1() from public,anon,authenticated;
grant execute on function private.run_operations_task_sla_escalation_v1() to service_role;

do $do$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='operations-task-sla-escalation-v1' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('operations-task-sla-escalation-v1','*/15 * * * *','select private.run_operations_task_sla_escalation_v1();');
end;
$do$;