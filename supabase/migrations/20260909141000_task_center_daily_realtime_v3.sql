-- Task Center V3: realtime task notifications + randomized daily inventory audits (5-10 items per employee).

create or replace function private.staff_user_has_permission_v3(
  p_user_id uuid,
  p_permission_code text,
  p_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select case
    when p_user_id is null then false
    when not exists(select 1 from public.users u where u.id=p_user_id and coalesce(u.active,true)) then false
    when private.staff_is_super_admin(p_user_id) then true
    when p_branch_id is null then false
    else exists(
      select 1
      from public.user_branch_roles ubr
      join public.staff_roles r on r.id=ubr.role_id and r.active and r.scope='branch'
      join public.staff_role_permissions rp on rp.role_id=r.id
      join public.staff_permissions sp on sp.id=rp.permission_id and sp.code=p_permission_code
      where ubr.user_id=p_user_id and ubr.branch_id=p_branch_id and ubr.active
    )
  end;
$function$;

create or replace function private.operations_task_can_claim_for_user_v3(
  p_user_id uuid,
  p_source_kind text,
  p_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select case
    when p_source_kind='pos_refund' then
      private.staff_user_has_permission_v3(p_user_id,'sales.refund',p_branch_id)
      or private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
    when p_source_kind='online_refund' then
      private.staff_user_has_permission_v3(p_user_id,'online_money.settle_digital',p_branch_id)
    when p_source_kind='shift_reconciliation' then
      private.staff_user_has_permission_v3(p_user_id,'pos.manage_shifts',p_branch_id)
      or private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
    when p_source_kind='cash_handoff' then
      private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
      or private.staff_user_has_permission_v3(p_user_id,'pos.manage_shifts',p_branch_id)
    when p_source_kind='inventory_count' then
      private.staff_user_has_permission_v3(p_user_id,'inventory.count',p_branch_id)
    when p_source_kind='inventory_recount' then
      private.staff_user_has_permission_v3(p_user_id,'inventory.recount',p_branch_id)
    when p_source_kind='inventory_adjustment' then
      private.staff_user_has_permission_v3(p_user_id,'inventory.approve_adjustment',p_branch_id)
    when p_source_kind in ('inventory_transfer_dispatch','inventory_transfer_receive') then
      private.staff_user_has_permission_v3(p_user_id,'inventory.transfer',p_branch_id)
    when p_source_kind='inventory_transfer_variance' then
      private.staff_user_has_permission_v3(p_user_id,'inventory.manage',p_branch_id)
      or private.staff_user_has_permission_v3(p_user_id,'inventory.approve_adjustment',p_branch_id)
    else false
  end;
$function$;

create or replace function private.sync_operations_task_notification_v3()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_category text;
  v_severity text;
  v_action_url text;
  v_action_label text;
begin
  if new.status in ('completed','cancelled') then
    update private.notification_events_v2
       set status='resolved',resolved_at=coalesce(resolved_at,now()),updated_at=now()
     where source_kind='operations_task' and source_id=new.id and status='active';
    return new;
  end if;

  if new.status not in ('open','claimed','in_progress','failed') then return new; end if;

  v_category:=case
    when new.source_kind like 'inventory_transfer%' then 'inventory_transfers'
    when new.source_kind like 'inventory_%' then 'inventory'
    when new.source_kind in ('shift_reconciliation','cash_handoff') then 'finance'
    when new.source_kind in ('pos_refund','online_refund') then 'returns'
    else 'tasks'
  end;
  v_severity:=case
    when (new.due_at is not null and new.due_at<now()) or new.priority='urgent' then 'critical'
    when new.priority='high' then 'high'
    else 'normal'
  end;
  v_action_url:=case
    when new.source_kind in ('inventory_transfer_dispatch','inventory_transfer_receive') then '/inventory-transfers'
    when new.source_kind like 'inventory_%' then '/tasks?type=inventory'
    when new.source_kind='shift_reconciliation' then '/tasks?type=shift'
    when new.source_kind='cash_handoff' then '/tasks?type=cash_handoff'
    when new.source_kind in ('pos_refund','online_refund') then '/tasks?type=refund'
    else '/tasks'
  end;
  v_action_label:=case when new.claimed_by is not null then 'فتح مهمتي' else 'فتح المهمة' end;

  if new.claimed_by is not null then
    update private.notification_events_v2
       set status='resolved',resolved_at=coalesce(resolved_at,now()),updated_at=now()
     where source_kind='operations_task' and source_id=new.id and status='active'
       and recipient_user_id is distinct from new.claimed_by;
  end if;

  insert into private.notification_events_v2(
    audience,recipient_user_id,branch_id,event_key,category,severity,title,body,
    source_kind,source_id,action_url,action_label,requires_action,dedupe_key,
    eligible_channels,status,metadata,created_at,updated_at,resolved_at
  )
  select
    'staff',r.user_id,new.branch_id,'task.'||new.source_kind,v_category,v_severity,
    case when new.due_at is not null and new.due_at<now() then 'مهمة تجاوزت وقت التنفيذ' else new.title end,
    coalesce(new.description,new.title),'operations_task',new.id,v_action_url,v_action_label,true,
    'task:'||new.id::text,array['in_app']::text[],'active',
    coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
      'task_type',new.task_type,'source_kind',new.source_kind,'priority',new.priority,
      'status',new.status,'due_at',new.due_at,'is_mine',new.claimed_by=r.user_id,'realtime_task_event',true
    ),new.created_at,now(),null
  from (
    select new.claimed_by as user_id where new.claimed_by is not null
    union
    select u.id
    from public.users u
    where new.claimed_by is null and new.status='open' and coalesce(u.active,true)
      and private.operations_task_can_claim_for_user_v3(u.id,new.source_kind,new.branch_id)
      and not (
        new.source_kind='inventory_recount'
        and exists(
          select 1
          from private.inventory_audit_recounts_v2 rr
          join private.inventory_audit_counts_v2 cc on cc.id=rr.original_count_id
          where rr.id=new.source_id and cc.assigned_to=u.id
        )
      )
  ) r
  where r.user_id is not null
  on conflict(recipient_user_id,dedupe_key) do update set
    branch_id=excluded.branch_id,event_key=excluded.event_key,category=excluded.category,
    severity=excluded.severity,title=excluded.title,body=excluded.body,
    action_url=excluded.action_url,action_label=excluded.action_label,requires_action=true,
    eligible_channels=excluded.eligible_channels,status='active',resolved_at=null,
    metadata=excluded.metadata,updated_at=now();

  return new;
end;
$function$;

drop trigger if exists operations_tasks_notification_v3 on public.operations_tasks;
create trigger operations_tasks_notification_v3
after insert or update of status,claimed_by,due_at,title,description,priority
on public.operations_tasks
for each row execute function private.sync_operations_task_notification_v3();

create or replace function public.ensure_daily_inventory_audit_tasks_v3(
  p_branch_id uuid,
  p_audit_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_date date:=coalesce(p_audit_date,timezone('Africa/Cairo',now())::date);
  v_items integer;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_items:=5+mod(
    hashtextextended(p_branch_id::text||':'||v_date::text,1203)::numeric+9223372036854775808::numeric,
    6::numeric
  )::integer;
  v_result:=public.ensure_daily_inventory_audit_tasks_v2(p_branch_id,v_items,v_date);
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('items_per_employee_requested',v_items,'generator_version',3);
end;
$function$;

revoke all on function public.ensure_daily_inventory_audit_tasks_v3(uuid,date) from public,anon;
grant execute on function public.ensure_daily_inventory_audit_tasks_v3(uuid,date) to authenticated,service_role;

create or replace function private.run_daily_inventory_audit_scheduler_v3(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_cairo_now timestamp:=timezone('Africa/Cairo',now());
  v_date date:=timezone('Africa/Cairo',now())::date;
  v_hour integer:=extract(hour from timezone('Africa/Cairo',now()))::integer;
  v_branch record;
  v_actor uuid;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_previous_sub text:=current_setting('request.jwt.claim.sub',true);
begin
  if not coalesce(p_force,false) and (v_hour<6 or v_hour>19) then
    return jsonb_build_object('ran',false,'reason','OUTSIDE_CAIRO_WINDOW','cairo_time',v_cairo_now);
  end if;

  for v_branch in select b.id,b.name from public.branches b where b.active order by b.id loop
    select u.id into v_actor
    from public.users u
    join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=v_branch.id and ubr.active
    where coalesce(u.active,true)
      and (
        private.staff_user_has_permission_v3(u.id,'inventory.manage_sessions',v_branch.id)
        or private.staff_user_has_permission_v3(u.id,'inventory.count',v_branch.id)
      )
    order by case when private.staff_user_has_permission_v3(u.id,'inventory.manage_sessions',v_branch.id) then 0 else 1 end,u.id
    limit 1;

    if v_actor is null then
      v_results:=v_results||jsonb_build_array(jsonb_build_object('branch_id',v_branch.id,'branch_name',v_branch.name,'generated',0,'reason','NO_ELIGIBLE_STAFF'));
      continue;
    end if;

    begin
      perform set_config('request.jwt.claim.sub',v_actor::text,true);
      v_result:=public.ensure_daily_inventory_audit_tasks_v3(v_branch.id,v_date);
      v_results:=v_results||jsonb_build_array(coalesce(v_result,'{}'::jsonb)||jsonb_build_object('branch_name',v_branch.name,'scheduler_actor',v_actor));
    exception when others then
      v_results:=v_results||jsonb_build_array(jsonb_build_object('branch_id',v_branch.id,'branch_name',v_branch.name,'generated',0,'error',sqlerrm));
    end;
  end loop;

  perform set_config('request.jwt.claim.sub',coalesce(v_previous_sub,''),true);
  return jsonb_build_object('ran',true,'audit_date',v_date,'cairo_time',v_cairo_now,'branches',v_results);
end;
$function$;

revoke all on function private.run_daily_inventory_audit_scheduler_v3(boolean) from public,anon,authenticated;
grant execute on function private.run_daily_inventory_audit_scheduler_v3(boolean) to service_role;

-- Backfill notifications for already-active tasks without changing their business state.
update public.operations_tasks set priority=priority where status in ('open','claimed','in_progress','failed');

do $do$
begin
  if exists(select 1 from cron.job where jobname='inventory-daily-audit-v3') then
    perform cron.unschedule('inventory-daily-audit-v3');
  end if;
  perform cron.schedule('inventory-daily-audit-v3','5 * * * *','select private.run_daily_inventory_audit_scheduler_v3(false);');
end
$do$;