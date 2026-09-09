insert into public.staff_permissions(code,name_ar,module,description)
select 'notifications.send','إرسال الإشعارات','notifications','إرسال إشعارات تشغيلية أو تسويقية من مركز الإشعارات'
where not exists(select 1 from public.staff_permissions where code='notifications.send');

insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id
from public.staff_roles r
cross join public.staff_permissions p
where r.code in ('super_admin','branch_admin','branch_manager')
  and p.code='notifications.send'
  and not exists(
    select 1 from public.staff_role_permissions rp where rp.role_id=r.id and rp.permission_id=p.id
  );

create table if not exists private.notification_campaigns_v2 (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  branch_id uuid null,
  audience_type text not null check(audience_type in ('staff_branch','customers_all')),
  category text not null,
  severity text not null default 'normal' check(severity in ('critical','high','normal','info')),
  title text not null,
  body text not null,
  action_url text null,
  action_label text null,
  requested_channels text[] not null default array['in_app']::text[],
  delivery_type text not null default 'transactional' check(delivery_type in ('transactional','marketing')),
  status text not null default 'sent' check(status in ('draft','sent','cancelled')),
  recipient_count integer not null default 0,
  in_app_eligible_count integer not null default 0,
  whatsapp_eligible_count integer not null default 0,
  push_eligible_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists notification_campaigns_v2_created_idx on private.notification_campaigns_v2(created_at desc);
create index if not exists notification_campaigns_v2_branch_created_idx on private.notification_campaigns_v2(branch_id,created_at desc) where branch_id is not null;
revoke all on private.notification_campaigns_v2 from public,anon,authenticated;
grant all on private.notification_campaigns_v2 to service_role;

alter table private.notification_delivery_queue_v2 alter column notification_id drop not null;
alter table private.notification_delivery_queue_v2 alter column recipient_user_id drop not null;
alter table private.notification_delivery_queue_v2 add column if not exists campaign_id uuid null references private.notification_campaigns_v2(id) on delete cascade;
create unique index if not exists notification_delivery_queue_v2_campaign_customer_channel_uq
  on private.notification_delivery_queue_v2(campaign_id,customer_id,channel)
  where campaign_id is not null and customer_id is not null;
create index if not exists notification_delivery_queue_v2_campaign_idx
  on private.notification_delivery_queue_v2(campaign_id,created_at) where campaign_id is not null;

create table if not exists private.customer_whatsapp_consent_v2 (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  opted_in boolean not null default false,
  opted_in_at timestamptz null,
  opted_out_at timestamptz null,
  source text null,
  recorded_by uuid null,
  phone_snapshot text null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists customer_whatsapp_consent_v2_opted_in_idx
  on private.customer_whatsapp_consent_v2(opted_in,updated_at desc) where opted_in;
revoke all on private.customer_whatsapp_consent_v2 from public,anon,authenticated;
grant all on private.customer_whatsapp_consent_v2 to service_role;

create or replace function public.can_send_notifications_v2(p_branch_id uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if auth.uid() is null then return false; end if;
  if private.staff_is_super_admin(auth.uid()) then return true; end if;
  if p_branch_id is null then return false; end if;
  return public.has_branch_access(auth.uid(),p_branch_id)
    and public.staff_has_permission('notifications.send',p_branch_id);
end;
$function$;

create or replace function public.set_my_whatsapp_marketing_consent_v2(
  p_opt_in boolean,
  p_source text default 'customer_app'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_customer public.customers%rowtype;
  v_source text:=coalesce(nullif(trim(p_source),''),'customer_app');
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_customer from public.customers c where c.user_id=v_uid limit 1;
  if v_customer.id is null then raise exception using errcode='22023',message='CUSTOMER_PROFILE_REQUIRED'; end if;

  insert into private.customer_whatsapp_consent_v2(
    customer_id,opted_in,opted_in_at,opted_out_at,source,recorded_by,phone_snapshot,evidence,created_at,updated_at
  ) values (
    v_customer.id,p_opt_in,case when p_opt_in then now() else null end,case when p_opt_in then null else now() end,
    v_source,v_uid,v_customer.phone,jsonb_build_object('method','self_service','user_id',v_uid),now(),now()
  )
  on conflict(customer_id) do update set
    opted_in=excluded.opted_in,
    opted_in_at=case when excluded.opted_in then coalesce(private.customer_whatsapp_consent_v2.opted_in_at,now()) else null end,
    opted_out_at=case when excluded.opted_in then null else now() end,
    source=excluded.source,recorded_by=excluded.recorded_by,phone_snapshot=excluded.phone_snapshot,
    evidence=excluded.evidence,updated_at=now();

  insert into private.notification_preferences_v2(
    recipient_user_id,customer_id,whatsapp_marketing_opt_in,whatsapp_marketing_opt_in_at,whatsapp_marketing_opt_in_source,marketing_enabled
  ) values (
    v_uid,v_customer.id,p_opt_in,case when p_opt_in then now() else null end,case when p_opt_in then v_source else null end,p_opt_in
  )
  on conflict(recipient_user_id) do update set
    customer_id=coalesce(private.notification_preferences_v2.customer_id,excluded.customer_id),
    whatsapp_marketing_opt_in=p_opt_in,
    whatsapp_marketing_opt_in_at=case when p_opt_in then coalesce(private.notification_preferences_v2.whatsapp_marketing_opt_in_at,now()) else null end,
    whatsapp_marketing_opt_in_source=case when p_opt_in then v_source else null end,
    marketing_enabled=p_opt_in,updated_at=now();

  return jsonb_build_object('customer_id',v_customer.id,'opted_in',p_opt_in,'source',v_source,'updated_at',now());
end;
$function$;

create or replace function public.record_customer_whatsapp_consent_v2(
  p_customer_id uuid,
  p_opt_in boolean,
  p_source text,
  p_branch_id uuid default null,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_customer public.customers%rowtype;
  v_source text:=lower(coalesce(nullif(trim(p_source),''),'staff_confirmed'));
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.staff_is_super_admin(v_uid) then
    if p_branch_id is null or not public.has_branch_access(v_uid,p_branch_id) or not public.staff_has_permission('customers.manage',p_branch_id) then
      raise exception using errcode='42501',message='CUSTOMER_CONSENT_RECORD_FORBIDDEN';
    end if;
  end if;
  if v_source not in ('pos_checkbox','crm_phone_consent','paper_form','website_form','customer_request','staff_confirmed') then
    raise exception using errcode='22023',message='INVALID_CONSENT_SOURCE';
  end if;
  select * into v_customer from public.customers c where c.id=p_customer_id;
  if v_customer.id is null then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
  if p_opt_in and (v_customer.phone is null or trim(v_customer.phone)='') then raise exception using errcode='22023',message='CUSTOMER_PHONE_REQUIRED'; end if;

  insert into private.customer_whatsapp_consent_v2(
    customer_id,opted_in,opted_in_at,opted_out_at,source,recorded_by,phone_snapshot,evidence,created_at,updated_at
  ) values (
    v_customer.id,p_opt_in,case when p_opt_in then now() else null end,case when p_opt_in then null else now() end,
    v_source,v_uid,v_customer.phone,coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object('recorded_by',v_uid,'branch_id',p_branch_id),now(),now()
  )
  on conflict(customer_id) do update set
    opted_in=excluded.opted_in,
    opted_in_at=case when excluded.opted_in then coalesce(private.customer_whatsapp_consent_v2.opted_in_at,now()) else null end,
    opted_out_at=case when excluded.opted_in then null else now() end,
    source=excluded.source,recorded_by=excluded.recorded_by,phone_snapshot=excluded.phone_snapshot,
    evidence=excluded.evidence,updated_at=now();

  if v_customer.user_id is not null then
    insert into private.notification_preferences_v2(
      recipient_user_id,customer_id,whatsapp_marketing_opt_in,whatsapp_marketing_opt_in_at,whatsapp_marketing_opt_in_source,marketing_enabled
    ) values (
      v_customer.user_id,v_customer.id,p_opt_in,case when p_opt_in then now() else null end,case when p_opt_in then v_source else null end,p_opt_in
    )
    on conflict(recipient_user_id) do update set
      whatsapp_marketing_opt_in=p_opt_in,
      whatsapp_marketing_opt_in_at=case when p_opt_in then coalesce(private.notification_preferences_v2.whatsapp_marketing_opt_in_at,now()) else null end,
      whatsapp_marketing_opt_in_source=case when p_opt_in then v_source else null end,
      marketing_enabled=p_opt_in,updated_at=now();
  end if;

  return jsonb_build_object('customer_id',v_customer.id,'opted_in',p_opt_in,'source',v_source,'updated_at',now());
end;
$function$;

create or replace function public.preview_notification_audience_v2(
  p_audience_type text,
  p_branch_id uuid default null
)
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
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if v_audience not in ('staff_branch','customers_all') then raise exception using errcode='22023',message='INVALID_NOTIFICATION_AUDIENCE'; end if;
  if not public.can_send_notifications_v2(p_branch_id) then raise exception using errcode='42501',message='NOTIFICATION_SEND_FORBIDDEN'; end if;
  if v_audience='customers_all' and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='CUSTOMER_BROADCAST_SUPER_ADMIN_ONLY'; end if;

  if v_audience='staff_branch' then
    if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
    select count(distinct u.id) into v_total
    from public.users u
    join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
    where coalesce(u.active,true);
    v_in_app:=v_total;
    v_push:=v_total;
  else
    select count(*) into v_total from public.customers c where c.management_status='active';
    select count(*) into v_in_app from public.customers c where c.management_status='active' and c.user_id is not null;
    v_push:=v_in_app;
    select count(*) into v_whatsapp
    from public.customers c
    join private.customer_whatsapp_consent_v2 consent on consent.customer_id=c.id and consent.opted_in
    where c.management_status='active' and c.phone is not null and trim(c.phone)<>'';
  end if;

  return jsonb_build_object(
    'audience_type',v_audience,'branch_id',p_branch_id,'total',v_total,
    'in_app_eligible',v_in_app,'push_eligible',v_push,
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
    from public.users u join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
    where coalesce(u.active,true);

    insert into private.notification_events_v2(
      audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,
      action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at
    )
    select 'staff',u.id,p_branch_id,'campaign.staff',v_category,v_severity,v_title,v_body,'notification_campaign',v_campaign,
      nullif(trim(coalesce(p_action_url,'')),''),nullif(trim(coalesce(p_action_label,'')),''),false,
      'campaign:'||v_campaign::text,v_channels,'active',jsonb_build_object('campaign_id',v_campaign,'delivery_type',v_delivery,'sent_by',v_uid),now(),now()
    from public.users u join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
    where coalesce(u.active,true)
    on conflict(recipient_user_id,dedupe_key) do nothing;
    get diagnostics v_in_app_count=row_count;

    if 'push'=any(v_channels) then
      insert into private.notification_delivery_queue_v2(notification_id,campaign_id,recipient_user_id,channel,delivery_type,state)
      select e.id,v_campaign,e.recipient_user_id,'push','transactional','pending'
      from private.notification_events_v2 e where e.source_kind='notification_campaign' and e.source_id=v_campaign
      on conflict(notification_id,channel) do nothing;
      get diagnostics v_push_count=row_count;
    end if;
  else
    select count(*) into v_total from public.customers c where c.management_status='active';

    insert into private.notification_events_v2(
      audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,
      action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at
    )
    select 'customer',c.user_id,null,'campaign.customer',v_category,v_severity,v_title,v_body,'notification_campaign',v_campaign,
      nullif(trim(coalesce(p_action_url,'')),''),nullif(trim(coalesce(p_action_label,'')),''),false,
      'campaign:'||v_campaign::text,v_channels,'active',jsonb_build_object('campaign_id',v_campaign,'delivery_type','marketing','sent_by',v_uid),now(),now()
    from public.customers c
    where c.user_id is not null and c.management_status='active'
    on conflict(recipient_user_id,dedupe_key) do nothing;
    get diagnostics v_in_app_count=row_count;

    if 'push'=any(v_channels) then
      insert into private.notification_delivery_queue_v2(notification_id,campaign_id,recipient_user_id,customer_id,channel,delivery_type,state)
      select e.id,v_campaign,e.recipient_user_id,c.id,'push','marketing','pending'
      from private.notification_events_v2 e join public.customers c on c.user_id=e.recipient_user_id
      where e.source_kind='notification_campaign' and e.source_id=v_campaign
      on conflict(notification_id,channel) do nothing;
      get diagnostics v_push_count=row_count;
    end if;

    if 'whatsapp'=any(v_channels) then
      insert into private.notification_delivery_queue_v2(notification_id,campaign_id,recipient_user_id,customer_id,channel,delivery_type,state)
      select e.id,v_campaign,c.user_id,c.id,'whatsapp','marketing','suppressed'
      from public.customers c
      join private.customer_whatsapp_consent_v2 consent on consent.customer_id=c.id and consent.opted_in
      left join private.notification_events_v2 e on e.source_kind='notification_campaign' and e.source_id=v_campaign and e.recipient_user_id=c.user_id
      where c.management_status='active' and c.phone is not null and trim(c.phone)<>''
      on conflict do nothing;
      get diagnostics v_whatsapp_count=row_count;
    end if;
  end if;

  update private.notification_campaigns_v2 set
    recipient_count=v_total,in_app_eligible_count=v_in_app_count,
    whatsapp_eligible_count=v_whatsapp_count,push_eligible_count=v_push_count,
    metadata=jsonb_build_object('whatsapp_sender_ready',false,'delivery_queue_note','WhatsApp delivery remains suppressed until Meta Cloud API credentials and an approved template are configured')
  where id=v_campaign;

  return jsonb_build_object(
    'campaign_id',v_campaign,'recipient_count',v_total,'in_app_created',v_in_app_count,
    'push_queued',v_push_count,'whatsapp_eligible_suppressed',v_whatsapp_count,'whatsapp_sender_ready',false
  );
end;
$function$;

revoke all on function public.can_send_notifications_v2(uuid) from public,anon;
revoke all on function public.preview_notification_audience_v2(text,uuid) from public,anon;
revoke all on function public.send_notification_campaign_v2(text,uuid,text,text,text,text,text,text,text[],text) from public,anon;
revoke all on function public.set_my_whatsapp_marketing_consent_v2(boolean,text) from public,anon;
revoke all on function public.record_customer_whatsapp_consent_v2(uuid,boolean,text,uuid,jsonb) from public,anon;
grant execute on function public.can_send_notifications_v2(uuid) to authenticated,service_role;
grant execute on function public.preview_notification_audience_v2(text,uuid) to authenticated,service_role;
grant execute on function public.send_notification_campaign_v2(text,uuid,text,text,text,text,text,text,text[],text) to authenticated,service_role;
grant execute on function public.set_my_whatsapp_marketing_consent_v2(boolean,text) to authenticated,service_role;
grant execute on function public.record_customer_whatsapp_consent_v2(uuid,boolean,text,uuid,jsonb) to authenticated,service_role;
