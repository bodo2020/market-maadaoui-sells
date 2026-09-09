create or replace function public.resend_notification_campaign_v3(
  p_campaign_id uuid,
  p_unread_only boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_source private.notification_campaigns_v2%rowtype;
  v_is_customer boolean := false;
  v_total integer := 0;
  v_created integer := 0;
  v_new_campaign uuid;
  v_target_label text;
  v_resend_mode text := case when coalesce(p_unread_only,true) then 'unread_only' else 'same_recipients' end;
begin
  if v_uid is null then raise exception using errcode='42501', message='AUTH_REQUIRED'; end if;

  select * into v_source from private.notification_campaigns_v2 where id=p_campaign_id;
  if not found then raise exception using errcode='P0002', message='NOTIFICATION_CAMPAIGN_NOT_FOUND'; end if;

  v_is_customer := v_source.audience_type like 'customers_%';

  if v_is_customer then
    if not private.staff_is_super_admin(v_uid) then
      raise exception using errcode='42501', message='CUSTOMER_NOTIFICATION_RESEND_DENIED';
    end if;

    select count(distinct e.recipient_user_id)::integer into v_total
    from private.notification_events_v2 e
    where e.source_kind='notification_campaign'
      and e.source_id=p_campaign_id
      and e.recipient_user_id is not null
      and (not coalesce(p_unread_only,true) or e.read_at is null)
      and exists (select 1 from public.customers c where c.user_id=e.recipient_user_id);
  else
    if v_source.branch_id is null or not public.can_send_notifications_v2(v_source.branch_id) then
      raise exception using errcode='42501', message='STAFF_NOTIFICATION_RESEND_DENIED';
    end if;

    select count(distinct e.recipient_user_id)::integer into v_total
    from private.notification_events_v2 e
    join public.users u on u.id=e.recipient_user_id and coalesce(u.active,true)
    join public.user_branch_roles ubr
      on ubr.user_id=e.recipient_user_id
     and ubr.branch_id=v_source.branch_id
     and ubr.active
    where e.source_kind='notification_campaign'
      and e.source_id=p_campaign_id
      and e.recipient_user_id is not null
      and (not coalesce(p_unread_only,true) or e.read_at is null);
  end if;

  if v_total<=0 then
    raise exception using errcode='22023', message='NO_NOTIFICATION_RECIPIENTS_TO_RESEND';
  end if;

  v_target_label := case
    when coalesce(p_unread_only,true)
      then 'غير المقروءين من: '||coalesce(v_source.metadata->>'target_label',v_source.audience_type)
    else 'نفس المستلمين المتاحين من: '||coalesce(v_source.metadata->>'target_label',v_source.audience_type)
  end;

  insert into private.notification_campaigns_v2(
    created_by,branch_id,audience_type,category,severity,title,body,action_url,action_label,
    requested_channels,delivery_type,status,recipient_count,in_app_eligible_count,metadata
  ) values (
    v_uid,v_source.branch_id,v_source.audience_type,v_source.category,v_source.severity,
    v_source.title,v_source.body,v_source.action_url,v_source.action_label,
    array['in_app']::text[],v_source.delivery_type,'sent',v_total,0,
    jsonb_build_object(
      'target',coalesce(v_source.metadata->'target','{}'::jsonb),
      'target_label',v_target_label,
      'in_app_primary',true,
      'resend_of',p_campaign_id,
      'resend_mode',v_resend_mode
    )
  ) returning id into v_new_campaign;

  if not v_is_customer then
    insert into private.notification_events_v2(
      audience,recipient_user_id,branch_id,event_key,category,severity,title,body,
      source_kind,source_id,action_url,action_label,requires_action,dedupe_key,
      eligible_channels,status,metadata,created_at,updated_at
    )
    select
      'staff',src.recipient_user_id,v_source.branch_id,'campaign.staff',v_source.category,v_source.severity,
      v_source.title,v_source.body,'notification_campaign',v_new_campaign,
      v_source.action_url,v_source.action_label,false,'campaign:'||v_new_campaign::text,
      array['in_app']::text[],'active',
      jsonb_build_object(
        'campaign_id',v_new_campaign,'delivery_type','transactional','sent_by',v_uid,
        'resend_of',p_campaign_id,'resend_mode',v_resend_mode
      ),now(),now()
    from (
      select distinct e.recipient_user_id
      from private.notification_events_v2 e
      join public.users u on u.id=e.recipient_user_id and coalesce(u.active,true)
      join public.user_branch_roles ubr
        on ubr.user_id=e.recipient_user_id
       and ubr.branch_id=v_source.branch_id
       and ubr.active
      where e.source_kind='notification_campaign'
        and e.source_id=p_campaign_id
        and e.recipient_user_id is not null
        and (not coalesce(p_unread_only,true) or e.read_at is null)
    ) src
    on conflict(recipient_user_id,dedupe_key) do nothing;
    get diagnostics v_created=row_count;
  else
    insert into public.customer_notifications(
      user_id,order_id,kind,status,title,body,dedupe_key,read_at,created_at
    )
    select
      src.recipient_user_id,null,'campaign','sent',v_source.title,v_source.body,
      'campaign:'||v_new_campaign::text||':'||src.recipient_user_id::text,null,now()
    from (
      select distinct e.recipient_user_id
      from private.notification_events_v2 e
      where e.source_kind='notification_campaign'
        and e.source_id=p_campaign_id
        and e.recipient_user_id is not null
        and (not coalesce(p_unread_only,true) or e.read_at is null)
        and exists (select 1 from public.customers c where c.user_id=e.recipient_user_id)
    ) src
    on conflict(dedupe_key) do nothing;
    get diagnostics v_created=row_count;

    update private.notification_events_v2 e
    set source_kind='notification_campaign',
        source_id=v_new_campaign,
        event_key='campaign.customer',
        category=v_source.category,
        severity=v_source.severity,
        action_url=v_source.action_url,
        action_label=v_source.action_label,
        eligible_channels=array['in_app']::text[],
        metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object(
          'campaign_id',v_new_campaign,'delivery_type','marketing','sent_by',v_uid,
          'resend_of',p_campaign_id,'resend_mode',v_resend_mode
        ),
        updated_at=now()
    from public.customer_notifications cn
    where e.source_kind='customer_notification'
      and e.source_id=cn.id
      and cn.dedupe_key like 'campaign:'||v_new_campaign::text||':%';
  end if;

  update private.notification_campaigns_v2
  set in_app_eligible_count=v_created,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('created_count',v_created)
  where id=v_new_campaign;

  return jsonb_build_object(
    'campaign_id',v_new_campaign,'resend_of',p_campaign_id,'resend_mode',v_resend_mode,
    'recipient_count',v_total,'in_app_created',v_created,'in_app_primary',true
  );
end;
$$;

revoke all on function public.resend_notification_campaign_v3(uuid,boolean) from public,anon;
grant execute on function public.resend_notification_campaign_v3(uuid,boolean) to authenticated;
