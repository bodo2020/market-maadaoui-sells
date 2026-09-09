create table if not exists public.notification_realtime_signals_v2 (
  id bigint generated always as identity primary key,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  notification_id uuid not null references private.notification_events_v2(id) on delete cascade,
  audience text not null check (audience in ('staff','customer')),
  branch_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists notification_realtime_signals_v2_recipient_idx
  on public.notification_realtime_signals_v2(recipient_user_id,created_at desc);

alter table public.notification_realtime_signals_v2 enable row level security;
revoke all on public.notification_realtime_signals_v2 from public,anon,authenticated;
grant select on public.notification_realtime_signals_v2 to authenticated;
grant all on public.notification_realtime_signals_v2 to service_role;

drop policy if exists notification_realtime_signals_v2_select_own on public.notification_realtime_signals_v2;
create policy notification_realtime_signals_v2_select_own
on public.notification_realtime_signals_v2
for select
to authenticated
using (recipient_user_id=auth.uid());

create or replace function private.emit_notification_realtime_signal_v2()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  insert into public.notification_realtime_signals_v2(recipient_user_id,notification_id,audience,branch_id)
  values(new.recipient_user_id,new.id,new.audience,new.branch_id);
  return new;
end;
$function$;

revoke all on function private.emit_notification_realtime_signal_v2() from public,anon,authenticated;

drop trigger if exists notification_events_realtime_signal_v2 on private.notification_events_v2;
create trigger notification_events_realtime_signal_v2
after insert on private.notification_events_v2
for each row execute function private.emit_notification_realtime_signal_v2();

do $do$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='notification_realtime_signals_v2'
  ) then
    alter publication supabase_realtime add table public.notification_realtime_signals_v2;
  end if;
end
$do$;

create or replace function public.preview_notification_audience_v2(p_audience_type text, p_branch_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_audience text:=lower(coalesce(trim(p_audience_type),''));
  v_total integer:=0;
  v_in_app integer:=0;
  v_whatsapp integer:=0;
  v_push integer:=0;
  v_push_ready boolean:=false;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if v_audience not in ('staff_branch','customers_all') then raise exception using errcode='22023',message='INVALID_NOTIFICATION_AUDIENCE'; end if;
  if not public.can_send_notifications_v2(p_branch_id) then raise exception using errcode='42501',message='NOTIFICATION_SEND_FORBIDDEN'; end if;
  if v_audience='customers_all' and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='CUSTOMER_BROADCAST_SUPER_ADMIN_ONLY'; end if;

  select coalesce((select s.value='true' from private.notification_worker_settings_v2 s where s.key='push_worker_enabled'),false)
  into v_push_ready;

  if v_audience='staff_branch' then
    if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
    select count(distinct u.id) into v_total
    from public.users u
    join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
    where coalesce(u.active,true);
    v_in_app:=v_total;
    select count(distinct u.id) into v_push
    from public.users u
    join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
    join private.notification_devices_v2 d on d.recipient_user_id=u.id and d.enabled and d.revoked_at is null and d.provider='fcm'
    left join private.notification_preferences_v2 p on p.recipient_user_id=u.id
    where coalesce(u.active,true) and coalesce(p.push_enabled,true);
  else
    select count(distinct c.user_id) into v_total
    from public.customers c
    where c.user_id is not null;
    v_in_app:=v_total;
    select count(distinct c.user_id) into v_push
    from public.customers c
    join private.notification_devices_v2 d on d.recipient_user_id=c.user_id and d.enabled and d.revoked_at is null and d.provider='fcm'
    join private.notification_preferences_v2 p on p.recipient_user_id=c.user_id
    where c.user_id is not null and p.push_enabled and p.marketing_enabled;
    select count(distinct c.id) into v_whatsapp
    from public.customers c
    join private.customer_whatsapp_consent_v2 consent on consent.customer_id=c.id and consent.opted_in
    where c.user_id is not null and c.phone is not null and trim(c.phone)<>'';
  end if;

  return jsonb_build_object(
    'audience_type',v_audience,'branch_id',p_branch_id,'total',v_total,
    'in_app_eligible',v_in_app,'push_eligible',v_push,'push_sender_ready',v_push_ready,
    'whatsapp_marketing_eligible',v_whatsapp,'whatsapp_sender_ready',false
  );
end;
$function$;

create or replace function public.send_notification_campaign_v2(
  p_audience_type text,
  p_branch_id uuid,
  p_title text,
  p_body text,
  p_category text default 'system',
  p_severity text default 'normal',
  p_action_url text default null,
  p_action_label text default null,
  p_channels text[] default array['in_app']::text[],
  p_delivery_type text default 'transactional'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_audience text:=lower(coalesce(trim(p_audience_type),''));
  v_title text:=trim(coalesce(p_title,''));
  v_body text:=trim(coalesce(p_body,''));
  v_category text:=lower(coalesce(nullif(trim(p_category),''),'system'));
  v_severity text:=lower(coalesce(nullif(trim(p_severity),''),'normal'));
  v_delivery text:=lower(coalesce(nullif(trim(p_delivery_type),''),'transactional'));
  v_channels text[];
  v_campaign uuid;
  v_total integer:=0;
  v_in_app_count integer:=0;
  v_whatsapp_count integer:=0;
  v_push_count integer:=0;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if v_audience not in ('staff_branch','customers_all') then raise exception using errcode='22023',message='INVALID_NOTIFICATION_AUDIENCE'; end if;
  if v_title='' or char_length(v_title)>120 then raise exception using errcode='22023',message='INVALID_NOTIFICATION_TITLE'; end if;
  if v_body='' or char_length(v_body)>1000 then raise exception using errcode='22023',message='INVALID_NOTIFICATION_BODY'; end if;
  if v_severity not in ('critical','high','normal','info') then raise exception using errcode='22023',message='INVALID_NOTIFICATION_SEVERITY'; end if;
  if v_delivery not in ('transactional','marketing') then raise exception using errcode='22023',message='INVALID_DELIVERY_TYPE'; end if;
  if not public.can_send_notifications_v2(p_branch_id) then raise exception using errcode='42501',message='NOTIFICATION_SEND_FORBIDDEN'; end if;
  if v_audience='customers_all' and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='CUSTOMER_BROADCAST_SUPER_ADMIN_ONLY'; end if;
  if v_audience='staff_branch' and p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if v_audience='customers_all' then v_delivery:='marketing'; end if;

  select coalesce(array_agg(distinct lower(x)),array['in_app']::text[]) into v_channels
  from unnest(coalesce(p_channels,array['in_app']::text[])) x
  where lower(x) in ('in_app','push','whatsapp','email');
  if not ('in_app'=any(v_channels)) then v_channels:=array_append(v_channels,'in_app'); end if;

  insert into private.notification_campaigns_v2(
    created_by,branch_id,audience_type,category,severity,title,body,action_url,action_label,
    requested_channels,delivery_type,status
  ) values (
    v_uid,case when v_audience='staff_branch' then p_branch_id else null end,v_audience,v_category,v_severity,
    v_title,v_body,nullif(trim(coalesce(p_action_url,'')),''),nullif(trim(coalesce(p_action_label,'')),''),
    v_channels,v_delivery,'sent'
  ) returning id into v_campaign;

  if v_audience='staff_branch' then
    select count(distinct u.id) into v_total
    from public.users u
    join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
    where coalesce(u.active,true);

    insert into private.notification_events_v2(
      audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,
      action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at
    )
    select 'staff',u.id,p_branch_id,'campaign.staff',v_category,v_severity,v_title,v_body,'notification_campaign',v_campaign,
      nullif(trim(coalesce(p_action_url,'')),''),nullif(trim(coalesce(p_action_label,'')),''),false,
      'campaign:'||v_campaign::text,v_channels,'active',jsonb_build_object('campaign_id',v_campaign,'delivery_type',v_delivery,'sent_by',v_uid),now(),now()
    from public.users u
    join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
    where coalesce(u.active,true)
    on conflict(recipient_user_id,dedupe_key) do nothing;
    get diagnostics v_in_app_count=row_count;
  else
    select count(distinct c.user_id) into v_total from public.customers c where c.user_id is not null;

    insert into private.notification_events_v2(
      audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,
      action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at
    )
    select 'customer',x.user_id,null,'campaign.customer',v_category,v_severity,v_title,v_body,'notification_campaign',v_campaign,
      nullif(trim(coalesce(p_action_url,'')),''),nullif(trim(coalesce(p_action_label,'')),''),false,
      'campaign:'||v_campaign::text,v_channels,'active',jsonb_build_object('campaign_id',v_campaign,'delivery_type','marketing','sent_by',v_uid),now(),now()
    from (select distinct c.user_id from public.customers c where c.user_id is not null) x
    on conflict(recipient_user_id,dedupe_key) do nothing;
    get diagnostics v_in_app_count=row_count;
  end if;

  select count(*) into v_push_count
  from private.notification_delivery_queue_v2 q
  where q.campaign_id=v_campaign and q.channel='push' and q.state in ('pending','retrying','processing','sent','delivered');

  update private.notification_campaigns_v2 set
    recipient_count=v_total,
    in_app_eligible_count=v_in_app_count,
    whatsapp_eligible_count=v_whatsapp_count,
    push_eligible_count=v_push_count,
    metadata=jsonb_build_object(
      'in_app_primary',true,
      'customer_status_filter','none',
      'push_queued',v_push_count,
      'whatsapp_sender_ready',false
    )
  where id=v_campaign;

  return jsonb_build_object(
    'campaign_id',v_campaign,
    'recipient_count',v_total,
    'in_app_created',v_in_app_count,
    'push_queued',v_push_count,
    'whatsapp_eligible_suppressed',v_whatsapp_count,
    'whatsapp_sender_ready',false
  );
end;
$function$;
