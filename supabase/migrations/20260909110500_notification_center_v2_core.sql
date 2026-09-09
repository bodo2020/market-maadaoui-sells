create table if not exists private.notification_events_v2 (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('staff','customer')),
  recipient_user_id uuid not null,
  branch_id uuid null,
  event_key text not null,
  category text not null,
  severity text not null default 'normal' check (severity in ('critical','high','normal','info')),
  title text not null,
  body text not null,
  source_kind text not null,
  source_id uuid null,
  action_url text null,
  action_label text null,
  requires_action boolean not null default false,
  dedupe_key text not null,
  eligible_channels text[] not null default array['in_app']::text[],
  status text not null default 'active' check (status in ('active','resolved')),
  seen_at timestamptz null,
  read_at timestamptz null,
  archived_at timestamptz null,
  actioned_at timestamptz null,
  expires_at timestamptz null,
  resolved_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipient_user_id,dedupe_key)
);

create index if not exists notification_events_v2_user_feed_idx
  on private.notification_events_v2(recipient_user_id,status,created_at desc);
create index if not exists notification_events_v2_user_branch_feed_idx
  on private.notification_events_v2(recipient_user_id,branch_id,status,created_at desc);
create index if not exists notification_events_v2_user_unread_idx
  on private.notification_events_v2(recipient_user_id,created_at desc) where read_at is null and archived_at is null;
create index if not exists notification_events_v2_source_idx
  on private.notification_events_v2(source_kind,source_id) where source_id is not null;

create table if not exists private.notification_preferences_v2 (
  recipient_user_id uuid primary key,
  customer_id uuid null,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default true,
  whatsapp_transactional_enabled boolean not null default true,
  whatsapp_marketing_opt_in boolean not null default false,
  whatsapp_marketing_opt_in_at timestamptz null,
  whatsapp_marketing_opt_in_source text null,
  email_enabled boolean not null default false,
  marketing_enabled boolean not null default false,
  quiet_hours_enabled boolean not null default true,
  quiet_hours_start time not null default time '00:00',
  quiet_hours_end time not null default time '08:00',
  timezone text not null default 'Africa/Cairo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notification_preferences_v2_customer_idx
  on private.notification_preferences_v2(customer_id) where customer_id is not null;

create table if not exists private.notification_delivery_queue_v2 (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references private.notification_events_v2(id) on delete cascade,
  recipient_user_id uuid not null,
  customer_id uuid null,
  channel text not null check (channel in ('push','whatsapp','email')),
  delivery_type text not null check (delivery_type in ('transactional','marketing')),
  state text not null default 'pending' check (state in ('pending','processing','sent','delivered','failed','retrying','suppressed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz null,
  provider_reference text null,
  last_error text null,
  sent_at timestamptz null,
  delivered_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_id,channel)
);
create index if not exists notification_delivery_queue_v2_state_idx
  on private.notification_delivery_queue_v2(state,next_attempt_at,created_at);
create index if not exists notification_delivery_queue_v2_user_idx
  on private.notification_delivery_queue_v2(recipient_user_id,created_at desc);

revoke all on private.notification_events_v2 from public,anon,authenticated;
revoke all on private.notification_preferences_v2 from public,anon,authenticated;
revoke all on private.notification_delivery_queue_v2 from public,anon,authenticated;
grant all on private.notification_events_v2 to service_role;
grant all on private.notification_preferences_v2 to service_role;
grant all on private.notification_delivery_queue_v2 to service_role;

create or replace function private.bridge_customer_notification_v2()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_category text;
  v_delivery_type text;
begin
  v_category := case
    when lower(new.kind) like '%order%' or new.order_id is not null then 'orders'
    when lower(new.kind) like '%refund%' or lower(new.kind) like '%return%' then 'returns'
    when lower(new.kind) like '%loyal%' or lower(new.kind) like '%point%' or lower(new.kind) like '%reward%' then 'loyalty'
    when lower(new.kind) in ('offer','offers','marketing','campaign','promotion','promo') then 'marketing'
    else 'customers'
  end;
  v_delivery_type := case when v_category='marketing' then 'marketing' else 'transactional' end;

  insert into private.notification_events_v2(
    audience,recipient_user_id,branch_id,event_key,category,severity,title,body,
    source_kind,source_id,action_url,action_label,requires_action,dedupe_key,
    eligible_channels,status,read_at,metadata,created_at,updated_at
  ) values (
    'customer',new.user_id,null,'customer.'||new.kind,v_category,'normal',new.title,new.body,
    'customer_notification',new.id,
    case when new.order_id is not null then '/orders' else null end,
    case when new.order_id is not null then 'فتح الطلب' else null end,
    false,'customer:'||new.dedupe_key,
    array['in_app','push','whatsapp']::text[],'active',new.read_at,
    jsonb_build_object('legacy_notification_id',new.id,'order_id',new.order_id,'kind',new.kind,'status',new.status,'delivery_type',v_delivery_type),
    new.created_at,now()
  )
  on conflict(recipient_user_id,dedupe_key) do update set
    event_key=excluded.event_key,
    category=excluded.category,
    title=excluded.title,
    body=excluded.body,
    action_url=excluded.action_url,
    action_label=excluded.action_label,
    read_at=excluded.read_at,
    metadata=excluded.metadata,
    status='active',
    resolved_at=null,
    updated_at=now();
  return new;
end;
$function$;

revoke all on function private.bridge_customer_notification_v2() from public,anon,authenticated;

drop trigger if exists customer_notifications_bridge_v2 on public.customer_notifications;
create trigger customer_notifications_bridge_v2
after insert or update of title,body,status,read_at on public.customer_notifications
for each row execute function private.bridge_customer_notification_v2();

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
on conflict(recipient_user_id,dedupe_key) do update set
  title=excluded.title,body=excluded.body,read_at=excluded.read_at,metadata=excluded.metadata,updated_at=now();
