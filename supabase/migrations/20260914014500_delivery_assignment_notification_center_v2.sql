create or replace function public.claim_push_delivery_batch_v2(p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>100 then p_limit:=25; end if;

  update private.notification_delivery_queue_v2 q
  set state='suppressed',
      last_error='NOTIFICATION_INACTIVE_OR_EXPIRED',
      updated_at=now()
  from private.notification_events_v2 e
  where q.notification_id=e.id
    and q.channel='push'
    and q.state in ('pending','retrying')
    and (
      e.status<>'active'
      or e.resolved_at is not null
      or (e.expires_at is not null and e.expires_at<=now())
    );

  with picked as (
    select q.id
    from private.notification_delivery_queue_v2 q
    where q.channel='push'
      and q.state in ('pending','retrying')
      and coalesce(q.next_attempt_at,now())<=now()
      and q.attempts<6
      and (
        q.notification_id is null
        or exists (
          select 1
          from private.notification_events_v2 e
          where e.id=q.notification_id
            and e.status='active'
            and e.resolved_at is null
            and (e.expires_at is null or e.expires_at>now())
        )
      )
    order by coalesce(q.next_attempt_at,q.created_at),q.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update private.notification_delivery_queue_v2 q
    set state='processing',attempts=q.attempts+1,processing_started_at=now(),updated_at=now()
    from picked
    where q.id=picked.id
    returning q.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'queue_id',q.id,
    'attempts',q.attempts,
    'delivery_type',q.delivery_type,
    'recipient_user_id',q.recipient_user_id,
    'notification_id',q.notification_id,
    'title',e.title,
    'body',e.body,
    'action_url',e.action_url,
    'category',e.category,
    'severity',e.severity,
    'event_key',e.event_key,
    'metadata',e.metadata,
    'devices',coalesce((
      select jsonb_agg(jsonb_build_object(
        'device_id',d.id,'token',d.token,'platform',d.platform,'app_kind',d.app_kind,'locale',d.locale
      ))
      from private.notification_devices_v2 d
      where d.recipient_user_id=q.recipient_user_id
        and d.provider='fcm' and d.enabled and d.revoked_at is null
    ),'[]'::jsonb)
  )),'[]'::jsonb) into v_result
  from claimed q
  left join private.notification_events_v2 e on e.id=q.notification_id;

  return v_result;
end;
$function$;

create or replace function private.emit_delivery_assignment_signal_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_event text;
  v_recipient uuid;
  v_dedupe text;
  v_display_id text;
begin
  if tg_op = 'INSERT' then
    v_event := 'assignment_created';
    v_recipient := new.delivery_user_id;
  elsif new.unassigned_at is not null and old.unassigned_at is null then
    v_event := 'assignment_removed';
    v_recipient := old.delivery_user_id;
  elsif new.delivery_state is distinct from old.delivery_state then
    v_event := 'order_state_changed';
    v_recipient := new.delivery_user_id;
  else
    v_event := 'assignment_updated';
    v_recipient := new.delivery_user_id;
  end if;

  insert into public.delivery_realtime_signals_v1(branch_id, recipient_user_id, event_type, entity_id)
  values (coalesce(new.branch_id, old.branch_id), v_recipient, v_event, coalesce(new.order_id, old.order_id));

  if tg_op='INSERT' then
    v_dedupe := 'delivery-assignment:' || new.id::text;
    v_display_id := 'MD-' || upper(substr(replace(new.order_id::text,'-',''),1,6));

    insert into private.notification_events_v2(
      audience,recipient_user_id,branch_id,event_key,category,severity,title,body,
      source_kind,source_id,action_url,action_label,requires_action,dedupe_key,
      eligible_channels,status,expires_at,metadata
    ) values (
      'staff',new.delivery_user_id,new.branch_id,'delivery.assignment_created','orders','high',
      'طلب توصيل جديد',
      'تم تعيين الطلب ' || v_display_id || ' لك. افتح الطلب وابدأ الرحلة.',
      'delivery_assignment',new.id,
      '/order/' || new.order_id::text,'فتح الطلب',true,v_dedupe,
      array['in_app','push']::text[],'active',now()+interval '6 hours',
      jsonb_build_object(
        'delivery_type','transactional',
        'order_id',new.order_id,
        'assignment_id',new.id,
        'tracking_number',new.tracking_number
      )
    ) on conflict(recipient_user_id,dedupe_key) do nothing;

  elsif new.unassigned_at is not null and old.unassigned_at is null then
    v_dedupe := 'delivery-assignment:' || old.id::text;
    update private.notification_events_v2
    set status='resolved',
        resolved_at=coalesce(resolved_at,now()),
        read_at=coalesce(read_at,now()),
        updated_at=now(),
        metadata=metadata || jsonb_build_object('resolution','assignment_removed','reason',new.unassign_reason)
    where recipient_user_id=old.delivery_user_id
      and dedupe_key=v_dedupe
      and status='active';

  elsif new.delivery_state='accepted' and old.delivery_state='assigned' then
    v_dedupe := 'delivery-assignment:' || new.id::text;
    update private.notification_events_v2
    set status='resolved',
        actioned_at=coalesce(actioned_at,now()),
        resolved_at=coalesce(resolved_at,now()),
        read_at=coalesce(read_at,now()),
        updated_at=now(),
        metadata=metadata || jsonb_build_object('resolution','accepted')
    where recipient_user_id=new.delivery_user_id
      and dedupe_key=v_dedupe
      and status='active';
  end if;

  return new;
end;
$function$;
