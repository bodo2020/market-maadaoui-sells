alter table public.customer_notifications drop constraint if exists customer_notifications_kind_check;
alter table public.customer_notifications add constraint customer_notifications_kind_check
  check (kind = any (array['order_status'::text,'payment_status'::text,'campaign'::text]));

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
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
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
    select count(distinct c.user_id) into v_total
    from public.customers c
    where c.user_id is not null;

    insert into public.customer_notifications(user_id,order_id,kind,status,title,body,dedupe_key,read_at,created_at)
    select distinct on (c.user_id)
      c.user_id,null,'campaign','sent',v_title,v_body,
      'campaign:'||v_campaign::text||':'||c.user_id::text,null,now()
    from public.customers c
    where c.user_id is not null
    order by c.user_id,c.created_at desc
    on conflict(dedupe_key) do nothing;
    get diagnostics v_in_app_count=row_count;

    update private.notification_events_v2 e
      set source_kind='notification_campaign',
          source_id=v_campaign,
          event_key='campaign.customer',
          category=v_category,
          severity=v_severity,
          action_url=nullif(trim(coalesce(p_action_url,'')),''),
          action_label=nullif(trim(coalesce(p_action_label,'')),''),
          eligible_channels=v_channels,
          metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object('campaign_id',v_campaign,'delivery_type','marketing','sent_by',v_uid),
          updated_at=now()
    from public.customer_notifications cn
    where e.source_kind='customer_notification'
      and e.source_id=cn.id
      and cn.dedupe_key like 'campaign:'||v_campaign::text||':%';
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
      'legacy_customer_bridge',v_audience='customers_all',
      'push_queued',v_push_count,
      'whatsapp_sender_ready',false
    )
  where id=v_campaign;

  return jsonb_build_object(
    'campaign_id',v_campaign,'recipient_count',v_total,'in_app_created',v_in_app_count,
    'push_queued',v_push_count,'whatsapp_eligible_suppressed',v_whatsapp_count,'whatsapp_sender_ready',false
  );
end;
$$;

revoke all on function public.send_notification_campaign_v2(text,uuid,text,text,text,text,text,text,text[],text) from public, anon;
grant execute on function public.send_notification_campaign_v2(text,uuid,text,text,text,text,text,text,text[],text) to authenticated, service_role;

insert into public.customer_notifications(user_id,order_id,kind,status,title,body,dedupe_key,read_at,created_at)
select e.recipient_user_id,null,'campaign','sent',e.title,e.body,
       'campaign:'||e.source_id::text||':'||e.recipient_user_id::text,e.read_at,e.created_at
from private.notification_events_v2 e
where e.audience='customer'
  and e.source_kind='notification_campaign'
  and e.source_id is not null
on conflict(dedupe_key) do nothing;

update private.notification_events_v2 bridged
set source_kind='notification_campaign',
    source_id=original.source_id,
    event_key='campaign.customer',
    category=original.category,
    severity=original.severity,
    action_url=original.action_url,
    action_label=original.action_label,
    eligible_channels=original.eligible_channels,
    metadata=coalesce(bridged.metadata,'{}'::jsonb)||coalesce(original.metadata,'{}'::jsonb),
    read_at=coalesce(bridged.read_at,original.read_at),
    updated_at=now()
from public.customer_notifications cn
join private.notification_events_v2 original
  on original.audience='customer'
 and original.source_kind='notification_campaign'
 and cn.dedupe_key='campaign:'||original.source_id::text||':'||original.recipient_user_id::text
where bridged.source_kind='customer_notification'
  and bridged.source_id=cn.id
  and bridged.recipient_user_id=original.recipient_user_id;

delete from private.notification_events_v2 e
where e.audience='customer'
  and e.source_kind='notification_campaign'
  and e.source_id is not null
  and e.dedupe_key='campaign:'||e.source_id::text;