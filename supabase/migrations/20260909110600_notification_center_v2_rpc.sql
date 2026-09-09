create or replace function public.sync_my_notification_center_v2(p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_staff boolean := false;
  v_alert jsonb;
  v_transfer jsonb;
  v_transfer_keys text[] := '{}'::text[];
  v_low_stock_count integer := 0;
  v_task_count integer := 0;
  v_transfer_count integer := 0;
begin
  if v_uid is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;

  insert into private.notification_events_v2(
    audience,recipient_user_id,branch_id,event_key,category,severity,title,body,
    source_kind,source_id,action_url,action_label,requires_action,dedupe_key,
    eligible_channels,status,read_at,metadata,created_at,updated_at
  )
  select
    'customer',cn.user_id,null,'customer.'||cn.kind,
    case
      when lower(cn.kind) like '%order%' or cn.order_id is not null then 'orders'
      when lower(cn.kind) like '%refund%' or lower(cn.kind) like '%return%' then 'returns'
      when lower(cn.kind) like '%loyal%' or lower(cn.kind) like '%point%' or lower(cn.kind) like '%reward%' then 'loyalty'
      when lower(cn.kind) in ('offer','offers','marketing','campaign','promotion','promo') then 'marketing'
      else 'customers'
    end,
    'normal',cn.title,cn.body,'customer_notification',cn.id,
    case when cn.order_id is not null then '/orders' else null end,
    case when cn.order_id is not null then 'فتح الطلب' else null end,
    false,'customer:'||cn.dedupe_key,array['in_app','push','whatsapp']::text[],'active',cn.read_at,
    jsonb_build_object('legacy_notification_id',cn.id,'order_id',cn.order_id,'kind',cn.kind,'status',cn.status,
      'delivery_type',case when lower(cn.kind) in ('offer','offers','marketing','campaign','promotion','promo') then 'marketing' else 'transactional' end),
    cn.created_at,now()
  from public.customer_notifications cn
  where cn.user_id=v_uid
  on conflict(recipient_user_id,dedupe_key) do update set
    title=excluded.title,body=excluded.body,read_at=excluded.read_at,metadata=excluded.metadata,updated_at=now();

  select exists(select 1 from public.users u where u.id=v_uid and coalesce(u.active,true)) into v_is_staff;
  if not v_is_staff or p_branch_id is null then
    return jsonb_build_object('synced',true,'staff',v_is_staff,'branch_id',p_branch_id,'low_stock',0,'tasks',0,'transfer_alerts',0);
  end if;

  if not public.has_branch_access(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='NOTIFICATION_BRANCH_ACCESS_DENIED';
  end if;

  if public.staff_has_permission('inventory.view',p_branch_id)
     or public.staff_has_permission('inventory.manage',p_branch_id)
     or public.staff_has_permission('inventory.count',p_branch_id) then
    insert into private.notification_events_v2(
      audience,recipient_user_id,branch_id,event_key,category,severity,title,body,
      source_kind,source_id,action_url,action_label,requires_action,dedupe_key,
      eligible_channels,status,metadata,created_at,updated_at,resolved_at
    )
    select
      'staff',v_uid,p_branch_id,'inventory.low_stock','inventory',
      case when i.quantity<=0 then 'critical' else 'high' end,
      case when i.quantity<=0 then 'نفاد مخزون منتج' else 'مخزون منتج منخفض' end,
      case when i.quantity<=0
        then format('%s نفد من مخزون الفرع.',p.name)
        else format('%s متبقي منه %s فقط والحد الأدنى %s.',p.name,i.quantity,coalesce(i.min_stock_level,0)) end,
      'inventory_low_stock',i.product_id,'/inventory','فتح المخزون',true,
      'inventory.low_stock:'||i.product_id::text,array['in_app','push']::text[],'active',
      jsonb_build_object('product_id',i.product_id,'product_name',p.name,'quantity',i.quantity,'min_stock_level',i.min_stock_level),
      now(),now(),null
    from public.inventory i
    join public.products p on p.id=i.product_id and p.archived_at is null
    where i.branch_id=p_branch_id and i.alert_enabled and i.quantity<=coalesce(i.min_stock_level,0)
    on conflict(recipient_user_id,dedupe_key) do update set
      severity=excluded.severity,title=excluded.title,body=excluded.body,metadata=excluded.metadata,
      status='active',resolved_at=null,updated_at=now();
    get diagnostics v_low_stock_count = row_count;

    update private.notification_events_v2 e
      set status='resolved',resolved_at=now(),updated_at=now()
    where e.recipient_user_id=v_uid and e.branch_id=p_branch_id and e.source_kind='inventory_low_stock' and e.status='active'
      and not exists(
        select 1 from public.inventory i
        where i.branch_id=p_branch_id and i.product_id=e.source_id and i.alert_enabled and i.quantity<=coalesce(i.min_stock_level,0)
      );
  else
    update private.notification_events_v2 set status='resolved',resolved_at=now(),updated_at=now()
    where recipient_user_id=v_uid and branch_id=p_branch_id and source_kind='inventory_low_stock' and status='active';
  end if;

  insert into private.notification_events_v2(
    audience,recipient_user_id,branch_id,event_key,category,severity,title,body,
    source_kind,source_id,action_url,action_label,requires_action,dedupe_key,
    eligible_channels,status,metadata,created_at,updated_at,resolved_at
  )
  select
    'staff',v_uid,p_branch_id,'task.'||t.source_kind,
    case
      when t.source_kind like 'inventory_transfer%' then 'inventory_transfers'
      when t.source_kind like 'inventory_%' then 'inventory'
      when t.source_kind in ('shift_reconciliation','cash_handoff') then 'finance'
      when t.source_kind in ('pos_refund','online_refund') then 'returns'
      else 'tasks'
    end,
    case when (t.due_at is not null and t.due_at<now()) or t.priority='urgent' then 'critical'
         when t.priority='high' then 'high' else 'normal' end,
    case when t.due_at is not null and t.due_at<now() then 'مهمة تجاوزت وقت التنفيذ' else t.title end,
    coalesce(t.description,t.title),
    'operations_task',t.id,
    case
      when t.source_kind in ('inventory_transfer_dispatch','inventory_transfer_receive') then '/inventory-transfers'
      when t.source_kind like 'inventory_%' then '/tasks?type=inventory'
      when t.source_kind='shift_reconciliation' then '/tasks?type=shift'
      when t.source_kind='cash_handoff' then '/tasks?type=cash_handoff'
      when t.source_kind in ('pos_refund','online_refund') then '/tasks?type=refund'
      else '/tasks'
    end,
    case when t.claimed_by=v_uid then 'فتح مهمتي' else 'فتح المهمة' end,true,
    'task:'||t.id::text,array['in_app','push']::text[],'active',
    coalesce(t.metadata,'{}'::jsonb)||jsonb_build_object('task_type',t.task_type,'source_kind',t.source_kind,'priority',t.priority,'status',t.status,'due_at',t.due_at,'is_mine',t.claimed_by=v_uid),
    t.created_at,now(),null
  from public.operations_tasks t
  where t.branch_id=p_branch_id
    and t.status in ('open','claimed','in_progress','failed')
    and (
      (t.claimed_by=v_uid and t.status in ('claimed','in_progress','failed'))
      or (t.status='open' and private.operations_task_can_claim(t.source_kind,t.branch_id))
    )
  on conflict(recipient_user_id,dedupe_key) do update set
    category=excluded.category,severity=excluded.severity,title=excluded.title,body=excluded.body,
    action_url=excluded.action_url,action_label=excluded.action_label,metadata=excluded.metadata,
    status='active',resolved_at=null,updated_at=now();
  get diagnostics v_task_count = row_count;

  update private.notification_events_v2 e
    set status='resolved',resolved_at=now(),updated_at=now()
  where e.recipient_user_id=v_uid and e.branch_id=p_branch_id and e.source_kind='operations_task' and e.status='active'
    and not exists(
      select 1 from public.operations_tasks t
      where t.id=e.source_id and t.branch_id=p_branch_id
        and t.status in ('open','claimed','in_progress','failed')
        and ((t.claimed_by=v_uid and t.status in ('claimed','in_progress','failed'))
             or (t.status='open' and private.operations_task_can_claim(t.source_kind,t.branch_id)))
    );

  if public.staff_has_permission('reports.view',p_branch_id)
     or public.staff_has_permission('inventory.manage',p_branch_id)
     or public.staff_has_permission('inventory.approve_adjustment',p_branch_id) then
    v_transfer := public.get_inventory_transfer_smart_alerts_v2(p_branch_id,now()-interval '90 days',now());
    for v_alert in select value from jsonb_array_elements(coalesce(v_transfer->'alerts','[]'::jsonb)) loop
      v_transfer_keys := array_append(v_transfer_keys,'transfer.smart:'||(v_alert->>'id'));
      insert into private.notification_events_v2(
        audience,recipient_user_id,branch_id,event_key,category,severity,title,body,
        source_kind,source_id,action_url,action_label,requires_action,dedupe_key,
        eligible_channels,status,metadata,created_at,updated_at,resolved_at
      ) values (
        'staff',v_uid,p_branch_id,'transfer.'||coalesce(v_alert->>'alert_type','smart_alert'),'inventory_transfers',
        case when v_alert->>'severity'='critical' then 'critical' else 'high' end,
        coalesce(v_alert->>'title','تنبيه تحويل مخزون'),coalesce(v_alert->>'message','يوجد تحويل مخزون يحتاج مراجعة.'),
        'inventory_transfer_smart',null,coalesce(v_alert->>'href','/reports/inventory-transfers'),'فتح تقرير التحويلات',true,
        'transfer.smart:'||(v_alert->>'id'),array['in_app','push']::text[],'active',
        coalesce(v_alert,'{}'::jsonb),now(),now(),null
      )
      on conflict(recipient_user_id,dedupe_key) do update set
        severity=excluded.severity,title=excluded.title,body=excluded.body,metadata=excluded.metadata,
        status='active',resolved_at=null,updated_at=now();
      v_transfer_count := v_transfer_count+1;
    end loop;

    update private.notification_events_v2 e
      set status='resolved',resolved_at=now(),updated_at=now()
    where e.recipient_user_id=v_uid and e.branch_id=p_branch_id and e.source_kind='inventory_transfer_smart' and e.status='active'
      and not (e.dedupe_key=any(v_transfer_keys));
  else
    update private.notification_events_v2 set status='resolved',resolved_at=now(),updated_at=now()
    where recipient_user_id=v_uid and branch_id=p_branch_id and source_kind='inventory_transfer_smart' and status='active';
  end if;

  return jsonb_build_object('synced',true,'staff',true,'branch_id',p_branch_id,
    'low_stock',v_low_stock_count,'tasks',v_task_count,'transfer_alerts',v_transfer_count);
end;
$function$;

create or replace function public.get_my_notification_center_v2(
  p_branch_id uuid default null,
  p_filter text default 'all',
  p_category text default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_filter text:=lower(coalesce(nullif(trim(p_filter),''),'all'));
  v_limit integer:=least(greatest(coalesce(p_limit,100),1),250);
  v_items jsonb;
  v_summary jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if v_filter not in ('all','unread','critical','action') then raise exception using errcode='22023',message='INVALID_NOTIFICATION_FILTER'; end if;
  if p_branch_id is not null and exists(select 1 from public.users u where u.id=v_uid and coalesce(u.active,true))
     and not public.has_branch_access(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='NOTIFICATION_BRANCH_ACCESS_DENIED';
  end if;

  select jsonb_build_object(
    'total',count(*),
    'unread',count(*) filter(where read_at is null and archived_at is null and status='active'),
    'critical',count(*) filter(where severity='critical' and status='active'),
    'action_required',count(*) filter(where requires_action and status='active'),
    'today',count(*) filter(where created_at>=date_trunc('day',now()))
  ) into v_summary
  from private.notification_events_v2 e
  where e.recipient_user_id=v_uid and e.archived_at is null
    and ((p_branch_id is null and e.branch_id is null) or (p_branch_id is not null and e.branch_id=p_branch_id));

  select coalesce(jsonb_agg(x.item order by x.sort_active desc,x.sort_severity,x.sort_created desc),'[]'::jsonb)
  into v_items
  from (
    select jsonb_build_object(
      'id',e.id,'audience',e.audience,'branch_id',e.branch_id,'event_key',e.event_key,'category',e.category,
      'severity',e.severity,'title',e.title,'body',e.body,'source_kind',e.source_kind,'source_id',e.source_id,
      'action_url',e.action_url,'action_label',e.action_label,'requires_action',e.requires_action,
      'eligible_channels',e.eligible_channels,'status',e.status,'seen_at',e.seen_at,'read_at',e.read_at,
      'resolved_at',e.resolved_at,'metadata',e.metadata,'created_at',e.created_at,'updated_at',e.updated_at
    ) item,
    (e.status='active')::int sort_active,
    case e.severity when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end sort_severity,
    e.created_at sort_created
    from private.notification_events_v2 e
    where e.recipient_user_id=v_uid and e.archived_at is null
      and ((p_branch_id is null and e.branch_id is null) or (p_branch_id is not null and e.branch_id=p_branch_id))
      and (p_category is null or p_category='' or e.category=p_category)
      and (v_filter='all'
        or (v_filter='unread' and e.read_at is null and e.status='active')
        or (v_filter='critical' and e.severity='critical' and e.status='active')
        or (v_filter='action' and e.requires_action and e.status='active'))
      and (e.status='active' or e.resolved_at>=now()-interval '30 days')
    order by sort_active desc,sort_severity,e.created_at desc
    limit v_limit
  ) x;

  return jsonb_build_object('version',2,'generated_at',now(),'branch_id',p_branch_id,'filter',v_filter,
    'category',p_category,'summary',coalesce(v_summary,'{}'::jsonb),'items',v_items);
end;
$function$;

create or replace function public.mark_notification_read_v2(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  update private.notification_events_v2
    set read_at=coalesce(read_at,now()),seen_at=coalesce(seen_at,now()),updated_at=now()
  where id=p_notification_id and recipient_user_id=auth.uid() and archived_at is null;
  return found;
end;
$function$;

create or replace function public.mark_all_notifications_read_v2(p_branch_id uuid default null)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare v_count integer;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  update private.notification_events_v2
    set read_at=coalesce(read_at,now()),seen_at=coalesce(seen_at,now()),updated_at=now()
  where recipient_user_id=auth.uid() and archived_at is null and read_at is null
    and ((p_branch_id is null and branch_id is null) or (p_branch_id is not null and branch_id=p_branch_id));
  get diagnostics v_count=row_count;
  return v_count;
end;
$function$;

create or replace function public.get_my_notification_preferences_v2()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_customer uuid; v_row private.notification_preferences_v2;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select c.id into v_customer from public.customers c where c.user_id=v_uid limit 1;
  insert into private.notification_preferences_v2(recipient_user_id,customer_id)
  values(v_uid,v_customer)
  on conflict(recipient_user_id) do update set customer_id=coalesce(private.notification_preferences_v2.customer_id,excluded.customer_id),updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row)-'recipient_user_id';
end;
$function$;

create or replace function public.set_my_notification_preferences_v2(
  p_in_app_enabled boolean default null,
  p_push_enabled boolean default null,
  p_whatsapp_transactional_enabled boolean default null,
  p_whatsapp_marketing_opt_in boolean default null,
  p_whatsapp_marketing_opt_in_source text default null,
  p_email_enabled boolean default null,
  p_marketing_enabled boolean default null,
  p_quiet_hours_enabled boolean default null,
  p_quiet_hours_start time default null,
  p_quiet_hours_end time default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_customer uuid; v_row private.notification_preferences_v2;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select c.id into v_customer from public.customers c where c.user_id=v_uid limit 1;
  insert into private.notification_preferences_v2(recipient_user_id,customer_id)
  values(v_uid,v_customer)
  on conflict(recipient_user_id) do nothing;

  update private.notification_preferences_v2 p set
    customer_id=coalesce(p.customer_id,v_customer),
    in_app_enabled=coalesce(p_in_app_enabled,p.in_app_enabled),
    push_enabled=coalesce(p_push_enabled,p.push_enabled),
    whatsapp_transactional_enabled=coalesce(p_whatsapp_transactional_enabled,p.whatsapp_transactional_enabled),
    whatsapp_marketing_opt_in=coalesce(p_whatsapp_marketing_opt_in,p.whatsapp_marketing_opt_in),
    whatsapp_marketing_opt_in_at=case
      when p_whatsapp_marketing_opt_in=true and not p.whatsapp_marketing_opt_in then now()
      when p_whatsapp_marketing_opt_in=false then null
      else p.whatsapp_marketing_opt_in_at end,
    whatsapp_marketing_opt_in_source=case
      when p_whatsapp_marketing_opt_in=true then coalesce(nullif(trim(p_whatsapp_marketing_opt_in_source),''),'customer_app')
      when p_whatsapp_marketing_opt_in=false then null
      else p.whatsapp_marketing_opt_in_source end,
    email_enabled=coalesce(p_email_enabled,p.email_enabled),
    marketing_enabled=coalesce(p_marketing_enabled,p.marketing_enabled),
    quiet_hours_enabled=coalesce(p_quiet_hours_enabled,p.quiet_hours_enabled),
    quiet_hours_start=coalesce(p_quiet_hours_start,p.quiet_hours_start),
    quiet_hours_end=coalesce(p_quiet_hours_end,p.quiet_hours_end),
    updated_at=now()
  where p.recipient_user_id=v_uid
  returning * into v_row;
  return to_jsonb(v_row)-'recipient_user_id';
end;
$function$;

revoke all on function public.sync_my_notification_center_v2(uuid) from public,anon;
revoke all on function public.get_my_notification_center_v2(uuid,text,text,integer) from public,anon;
revoke all on function public.mark_notification_read_v2(uuid) from public,anon;
revoke all on function public.mark_all_notifications_read_v2(uuid) from public,anon;
revoke all on function public.get_my_notification_preferences_v2() from public,anon;
revoke all on function public.set_my_notification_preferences_v2(boolean,boolean,boolean,boolean,text,boolean,boolean,boolean,time,time) from public,anon;

grant execute on function public.sync_my_notification_center_v2(uuid) to authenticated,service_role;
grant execute on function public.get_my_notification_center_v2(uuid,text,text,integer) to authenticated,service_role;
grant execute on function public.mark_notification_read_v2(uuid) to authenticated,service_role;
grant execute on function public.mark_all_notifications_read_v2(uuid) to authenticated,service_role;
grant execute on function public.get_my_notification_preferences_v2() to authenticated,service_role;
grant execute on function public.set_my_notification_preferences_v2(boolean,boolean,boolean,boolean,text,boolean,boolean,boolean,time,time) to authenticated,service_role;
