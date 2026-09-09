create extension if not exists pg_net with schema extensions;

create table if not exists private.notification_devices_v2 (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid null references public.customers(id) on delete set null,
  app_kind text not null default 'customer' check (app_kind in ('customer','staff','admin')),
  platform text not null check (platform in ('android','ios','web')),
  provider text not null default 'fcm' check (provider in ('fcm','apns')),
  token text not null,
  device_key text null,
  locale text not null default 'ar-EG',
  permission_status text not null default 'granted' check (permission_status in ('granted','denied','prompt')),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz null,
  last_error text null,
  unique(provider,token)
);

create index if not exists notification_devices_v2_user_active_idx
  on private.notification_devices_v2(recipient_user_id,last_seen_at desc)
  where enabled and revoked_at is null;
create index if not exists notification_devices_v2_customer_active_idx
  on private.notification_devices_v2(customer_id,last_seen_at desc)
  where customer_id is not null and enabled and revoked_at is null;

create table if not exists private.notification_worker_settings_v2 (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into private.notification_worker_settings_v2(key,value)
values ('push_worker_enabled','false')
on conflict(key) do nothing;

-- Generate a per-environment worker secret without ever committing a production secret.
insert into private.notification_worker_settings_v2(key,value)
values ('push_worker_secret',encode(extensions.gen_random_bytes(32),'hex'))
on conflict(key) do nothing;

alter table private.notification_delivery_queue_v2
  add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table private.notification_delivery_queue_v2
  add column if not exists processing_started_at timestamptz null;

revoke all on private.notification_devices_v2 from public,anon,authenticated;
revoke all on private.notification_worker_settings_v2 from public,anon,authenticated;
grant all on private.notification_devices_v2 to service_role;
grant all on private.notification_worker_settings_v2 to service_role;

create or replace function public.register_push_device_v2(
  p_token text,
  p_platform text,
  p_app_kind text default 'customer',
  p_device_key text default null,
  p_locale text default 'ar-EG'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_token text:=trim(coalesce(p_token,''));
  v_platform text:=lower(trim(coalesce(p_platform,'')));
  v_app_kind text:=lower(trim(coalesce(p_app_kind,'customer')));
  v_provider text;
  v_customer_id uuid;
  v_row private.notification_devices_v2;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if char_length(v_token)<20 or char_length(v_token)>4096 then raise exception using errcode='22023',message='INVALID_PUSH_TOKEN'; end if;
  if v_platform not in ('android','ios','web') then raise exception using errcode='22023',message='INVALID_PUSH_PLATFORM'; end if;
  if v_app_kind not in ('customer','staff','admin') then raise exception using errcode='22023',message='INVALID_PUSH_APP_KIND'; end if;
  v_provider:=case when v_platform='ios' then 'apns' else 'fcm' end;

  select c.id into v_customer_id from public.customers c where c.user_id=v_uid limit 1;
  if v_app_kind='customer' and v_customer_id is null then raise exception using errcode='22023',message='CUSTOMER_PROFILE_REQUIRED'; end if;
  if v_app_kind in ('staff','admin') and not exists(select 1 from public.users u where u.id=v_uid and coalesce(u.active,true)) then
    raise exception using errcode='42501',message='STAFF_PROFILE_REQUIRED';
  end if;

  insert into private.notification_devices_v2(
    recipient_user_id,customer_id,app_kind,platform,provider,token,device_key,locale,
    permission_status,enabled,last_seen_at,registered_at,updated_at,revoked_at,last_error
  ) values (
    v_uid,v_customer_id,v_app_kind,v_platform,v_provider,v_token,
    nullif(trim(coalesce(p_device_key,'')),''),coalesce(nullif(trim(p_locale),''),'ar-EG'),
    'granted',true,now(),now(),now(),null,null
  )
  on conflict(provider,token) do update set
    recipient_user_id=excluded.recipient_user_id,
    customer_id=excluded.customer_id,
    app_kind=excluded.app_kind,
    platform=excluded.platform,
    device_key=excluded.device_key,
    locale=excluded.locale,
    permission_status='granted',
    enabled=true,
    last_seen_at=now(),
    updated_at=now(),
    revoked_at=null,
    last_error=null
  returning * into v_row;

  insert into private.notification_preferences_v2(recipient_user_id,customer_id)
  values(v_uid,v_customer_id)
  on conflict(recipient_user_id) do update set
    customer_id=coalesce(private.notification_preferences_v2.customer_id,excluded.customer_id),
    updated_at=now();

  return jsonb_build_object(
    'device_id',v_row.id,'platform',v_row.platform,'provider',v_row.provider,'app_kind',v_row.app_kind,
    'enabled',v_row.enabled,'permission_status',v_row.permission_status,
    'registered_at',v_row.registered_at,'last_seen_at',v_row.last_seen_at
  );
end;
$function$;

create or replace function public.unregister_push_device_v2(p_token text)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_count integer;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  update private.notification_devices_v2 d
  set enabled=false,permission_status='denied',revoked_at=now(),updated_at=now()
  where d.recipient_user_id=v_uid and d.token=trim(coalesce(p_token,''));
  get diagnostics v_count=row_count;
  return v_count>0;
end;
$function$;

create or replace function public.get_my_push_device_status_v2()
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select case when auth.uid() is null then
    jsonb_build_object('registered',false,'device_count',0,'platforms','[]'::jsonb,'providers','[]'::jsonb)
  else jsonb_build_object(
    'registered',exists(select 1 from private.notification_devices_v2 d where d.recipient_user_id=auth.uid() and d.enabled and d.revoked_at is null),
    'device_count',(select count(*) from private.notification_devices_v2 d where d.recipient_user_id=auth.uid() and d.enabled and d.revoked_at is null),
    'platforms',coalesce((select jsonb_agg(distinct d.platform) from private.notification_devices_v2 d where d.recipient_user_id=auth.uid() and d.enabled and d.revoked_at is null),'[]'::jsonb),
    'providers',coalesce((select jsonb_agg(distinct d.provider) from private.notification_devices_v2 d where d.recipient_user_id=auth.uid() and d.enabled and d.revoked_at is null),'[]'::jsonb)
  ) end;
$function$;

revoke all on function public.register_push_device_v2(text,text,text,text,text) from public,anon;
revoke all on function public.unregister_push_device_v2(text) from public,anon;
revoke all on function public.get_my_push_device_status_v2() from public,anon;
grant execute on function public.register_push_device_v2(text,text,text,text,text) to authenticated,service_role;
grant execute on function public.unregister_push_device_v2(text) to authenticated,service_role;
grant execute on function public.get_my_push_device_status_v2() to authenticated,service_role;

create or replace function private.notification_next_push_at_v2(p_recipient_user_id uuid,p_delivery_type text)
returns timestamptz
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_pref private.notification_preferences_v2;
  v_local timestamp;
  v_local_time time;
  v_target_local timestamp;
begin
  if lower(coalesce(p_delivery_type,'transactional')) <> 'marketing' then return now(); end if;
  select * into v_pref from private.notification_preferences_v2 p where p.recipient_user_id=p_recipient_user_id;
  if v_pref.recipient_user_id is null or not v_pref.quiet_hours_enabled then return now(); end if;
  if v_pref.quiet_hours_start=v_pref.quiet_hours_end then return now(); end if;

  v_local := now() at time zone v_pref.timezone;
  v_local_time := v_local::time;

  if v_pref.quiet_hours_start < v_pref.quiet_hours_end then
    if v_local_time >= v_pref.quiet_hours_start and v_local_time < v_pref.quiet_hours_end then
      v_target_local := v_local::date + v_pref.quiet_hours_end;
      return v_target_local at time zone v_pref.timezone;
    end if;
  else
    if v_local_time >= v_pref.quiet_hours_start then
      v_target_local := (v_local::date + 1) + v_pref.quiet_hours_end;
      return v_target_local at time zone v_pref.timezone;
    elsif v_local_time < v_pref.quiet_hours_end then
      v_target_local := v_local::date + v_pref.quiet_hours_end;
      return v_target_local at time zone v_pref.timezone;
    end if;
  end if;
  return now();
exception when others then
  return now();
end;
$function$;

create or replace function private.enqueue_notification_push_v2()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_delivery text:=lower(coalesce(new.metadata->>'delivery_type','transactional'));
  v_pref private.notification_preferences_v2;
  v_customer_id uuid;
  v_has_device boolean:=false;
  v_next timestamptz;
begin
  if new.recipient_user_id is null or new.status<>'active' or not ('push'=any(new.eligible_channels)) then return new; end if;
  select * into v_pref from private.notification_preferences_v2 p where p.recipient_user_id=new.recipient_user_id;
  if v_pref.recipient_user_id is null then
    insert into private.notification_preferences_v2(recipient_user_id,customer_id)
    select new.recipient_user_id,c.id from public.customers c where c.user_id=new.recipient_user_id
    on conflict(recipient_user_id) do nothing;
    select * into v_pref from private.notification_preferences_v2 p where p.recipient_user_id=new.recipient_user_id;
  end if;
  if not coalesce(v_pref.push_enabled,true) then return new; end if;
  if v_delivery='marketing' and not coalesce(v_pref.marketing_enabled,false) then return new; end if;

  select exists(
    select 1 from private.notification_devices_v2 d
    where d.recipient_user_id=new.recipient_user_id and d.provider='fcm' and d.enabled and d.revoked_at is null
  ) into v_has_device;
  if not v_has_device then return new; end if;

  select c.id into v_customer_id from public.customers c where c.user_id=new.recipient_user_id limit 1;
  v_next:=private.notification_next_push_at_v2(new.recipient_user_id,v_delivery);

  insert into private.notification_delivery_queue_v2(
    notification_id,campaign_id,recipient_user_id,customer_id,channel,delivery_type,state,next_attempt_at,metadata,created_at,updated_at
  ) values (
    new.id,case when new.source_kind='notification_campaign' then new.source_id else null end,new.recipient_user_id,v_customer_id,
    'push',case when v_delivery='marketing' then 'marketing' else 'transactional' end,'pending',v_next,
    jsonb_build_object('source_kind',new.source_kind,'category',new.category,'severity',new.severity),now(),now()
  ) on conflict(notification_id,channel) do nothing;
  return new;
end;
$function$;

revoke all on function private.notification_next_push_at_v2(uuid,text) from public,anon,authenticated;
revoke all on function private.enqueue_notification_push_v2() from public,anon,authenticated;

drop trigger if exists notification_events_push_queue_v2 on private.notification_events_v2;
create trigger notification_events_push_queue_v2
after insert on private.notification_events_v2
for each row execute function private.enqueue_notification_push_v2();

create or replace function public.verify_notification_worker_secret_v2(p_secret text)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists(
    select 1 from private.notification_worker_settings_v2 s
    where s.key='push_worker_secret' and s.value=coalesce(p_secret,'')
  );
$function$;

create or replace function public.claim_push_delivery_batch_v2(p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if p_limit is null or p_limit<1 or p_limit>100 then p_limit:=25; end if;
  with picked as (
    select q.id
    from private.notification_delivery_queue_v2 q
    where q.channel='push'
      and q.state in ('pending','retrying')
      and coalesce(q.next_attempt_at,now())<=now()
      and q.attempts<6
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
      select jsonb_agg(jsonb_build_object('device_id',d.id,'token',d.token,'platform',d.platform,'app_kind',d.app_kind,'locale',d.locale))
      from private.notification_devices_v2 d
      where d.recipient_user_id=q.recipient_user_id and d.provider='fcm' and d.enabled and d.revoked_at is null
    ),'[]'::jsonb)
  )),'[]'::jsonb) into v_result
  from claimed q
  left join private.notification_events_v2 e on e.id=q.notification_id;
  return v_result;
end;
$function$;

create or replace function public.complete_push_delivery_v2(
  p_queue_id uuid,
  p_state text,
  p_provider_reference text default null,
  p_error text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_state text:=lower(coalesce(trim(p_state),''));
  v_count integer;
begin
  if v_state not in ('sent','failed','retrying','suppressed') then raise exception using errcode='22023',message='INVALID_PUSH_DELIVERY_STATE'; end if;
  update private.notification_delivery_queue_v2 q
  set state=v_state,
      provider_reference=coalesce(nullif(trim(coalesce(p_provider_reference,'')),''),q.provider_reference),
      last_error=nullif(left(coalesce(p_error,''),2000),''),
      sent_at=case when v_state='sent' then now() else q.sent_at end,
      next_attempt_at=case when v_state='retrying' then now() + make_interval(secs => least(3600,(30*power(2,least(q.attempts,6)))::integer)) else null end,
      processing_started_at=null,
      metadata=coalesce(q.metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),
      updated_at=now()
  where q.id=p_queue_id and q.channel='push';
  get diagnostics v_count=row_count;
  return v_count>0;
end;
$function$;

create or replace function public.disable_push_device_token_v2(p_token text,p_error text default null)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare v_count integer;
begin
  update private.notification_devices_v2 d
  set enabled=false,revoked_at=now(),last_error=nullif(left(coalesce(p_error,''),1000),''),updated_at=now()
  where d.provider='fcm' and d.token=trim(coalesce(p_token,''));
  get diagnostics v_count=row_count;
  return v_count>0;
end;
$function$;

revoke all on function public.verify_notification_worker_secret_v2(text) from public,anon,authenticated;
revoke all on function public.claim_push_delivery_batch_v2(integer) from public,anon,authenticated;
revoke all on function public.complete_push_delivery_v2(uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.disable_push_device_token_v2(text,text) from public,anon,authenticated;
grant execute on function public.verify_notification_worker_secret_v2(text) to service_role;
grant execute on function public.claim_push_delivery_batch_v2(integer) to service_role;
grant execute on function public.complete_push_delivery_v2(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.disable_push_device_token_v2(text,text) to service_role;

create or replace function private.wake_push_worker_v2()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_enabled text;
  v_secret text;
begin
  select s.value into v_enabled from private.notification_worker_settings_v2 s where s.key='push_worker_enabled';
  if coalesce(v_enabled,'false')<>'true' then return null; end if;
  if not exists(
    select 1 from private.notification_delivery_queue_v2 q
    where q.channel='push' and q.state in ('pending','retrying') and coalesce(q.next_attempt_at,now())<=now()
  ) then return null; end if;
  select s.value into v_secret from private.notification_worker_settings_v2 s where s.key='push_worker_secret';
  if v_secret is null then return null; end if;
  perform net.http_post(
    url:='https://qzvpayjaadbmpayeglon.supabase.co/functions/v1/process-push-notifications',
    body:=jsonb_build_object('reason','queue_insert','at',now()),
    params:='{}'::jsonb,
    headers:=jsonb_build_object('content-type','application/json','x-notification-worker-secret',v_secret),
    timeout_milliseconds:=5000
  );
  return null;
end;
$function$;

revoke all on function private.wake_push_worker_v2() from public,anon,authenticated;

drop trigger if exists notification_delivery_queue_wake_push_v2 on private.notification_delivery_queue_v2;
create trigger notification_delivery_queue_wake_push_v2
after insert on private.notification_delivery_queue_v2
for each statement execute function private.wake_push_worker_v2();
