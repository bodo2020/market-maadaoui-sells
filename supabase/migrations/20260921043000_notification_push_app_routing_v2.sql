-- Route Push deliveries to the correct application surface.
-- Prevents staff operational notifications from being sent to customer app devices
-- when one auth user has registrations across multiple app kinds.

create or replace function public.claim_push_delivery_batch_v2(p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path=''
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
    set state='processing',
        attempts=q.attempts+1,
        processing_started_at=now(),
        updated_at=now()
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
    'audience',e.audience,
    'title',e.title,
    'body',e.body,
    'action_url',e.action_url,
    'category',e.category,
    'severity',e.severity,
    'event_key',e.event_key,
    'metadata',e.metadata,
    'devices',coalesce((
      select jsonb_agg(jsonb_build_object(
        'device_id',d.id,
        'token',d.token,
        'platform',d.platform,
        'app_kind',d.app_kind,
        'locale',d.locale
      ))
      from private.notification_devices_v2 d
      where d.recipient_user_id=q.recipient_user_id
        and d.provider='fcm'
        and d.enabled
        and d.revoked_at is null
        and (
          q.notification_id is null
          or e.audience is null
          or (e.audience='customer' and d.app_kind='customer')
          or (e.audience='staff' and d.app_kind in ('staff','admin'))
        )
    ),'[]'::jsonb)
  )),'[]'::jsonb) into v_result
  from claimed q
  left join private.notification_events_v2 e on e.id=q.notification_id;

  return v_result;
end;
$function$;

revoke all on function public.claim_push_delivery_batch_v2(integer) from public,anon,authenticated;
grant execute on function public.claim_push_delivery_batch_v2(integer) to service_role;
