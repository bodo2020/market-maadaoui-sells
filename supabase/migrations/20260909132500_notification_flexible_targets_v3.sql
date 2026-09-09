alter table private.notification_campaigns_v2 drop constraint if exists notification_campaigns_v2_audience_type_check;
alter table private.notification_campaigns_v2 add constraint notification_campaigns_v2_audience_type_check
  check (audience_type = any (array['staff_branch'::text,'staff_roles'::text,'staff_selected'::text,'customers_all'::text,'customers_selected'::text]));

create or replace function public.get_notification_recipient_options_v3(
  p_scope text,
  p_branch_id uuid default null,
  p_search text default null,
  p_limit integer default 100
) returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_scope text:=lower(coalesce(trim(p_scope),''));
  v_search text:=nullif(trim(coalesce(p_search,'')),'');
  v_limit integer:=least(greatest(coalesce(p_limit,100),1),200);
  v_items jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if v_scope not in ('staff','customers') then raise exception using errcode='22023',message='INVALID_RECIPIENT_SCOPE'; end if;

  if v_scope='staff' then
    if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
    if not public.can_send_notifications_v2(p_branch_id) then raise exception using errcode='42501',message='NOTIFICATION_SEND_FORBIDDEN'; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'user_id',x.id,'name',x.name,'role',x.role,'phone',x.phone,'kind','staff'
    ) order by x.name),'[]'::jsonb)
    into v_items
    from (
      select distinct u.id,u.name,u.role,u.phone
      from public.users u
      join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
      where coalesce(u.active,true)
        and (v_search is null or coalesce(u.name,'') ilike '%'||v_search||'%' or coalesce(u.role,'') ilike '%'||v_search||'%' or coalesce(u.phone,'') ilike '%'||v_search||'%')
      order by u.name
      limit v_limit
    ) x;
  else
    if not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='CUSTOMER_RECIPIENT_LIST_SUPER_ADMIN_ONLY'; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'user_id',x.user_id,'name',x.name,'phone',x.phone,'management_status',x.management_status,'kind','customer'
    ) order by x.name),'[]'::jsonb)
    into v_items
    from (
      select distinct on (c.user_id) c.id,c.user_id,c.name,c.phone,c.management_status,c.created_at
      from public.customers c
      where c.user_id is not null
        and (v_search is null or coalesce(c.name,'') ilike '%'||v_search||'%' or coalesce(c.phone,'') ilike '%'||v_search||'%')
      order by c.user_id,c.created_at desc
      limit v_limit
    ) x;
  end if;

  return jsonb_build_object('scope',v_scope,'items',v_items,'count',jsonb_array_length(v_items));
end;
$$;

create or replace function public.preview_notification_target_v3(
  p_target jsonb,
  p_branch_id uuid default null
) returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_type text:=lower(coalesce(trim(p_target->>'type'),''));
  v_total integer:=0;
  v_label text;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if v_type not in ('staff_branch','staff_roles','staff_selected','customers_all','customers_selected') then
    raise exception using errcode='22023',message='INVALID_NOTIFICATION_TARGET';
  end if;

  if v_type like 'staff_%' then
    if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
    if not public.can_send_notifications_v2(p_branch_id) then raise exception using errcode='42501',message='NOTIFICATION_SEND_FORBIDDEN'; end if;

    select count(distinct u.id) into v_total
    from public.users u
    join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
    where coalesce(u.active,true)
      and (
        v_type='staff_branch'
        or (v_type='staff_roles' and exists(
          select 1 from jsonb_array_elements_text(coalesce(p_target->'roles','[]'::jsonb)) r(value)
          where r.value=coalesce(u.role,'')
        ))
        or (v_type='staff_selected' and exists(
          select 1 from jsonb_array_elements_text(coalesce(p_target->'user_ids','[]'::jsonb)) r(value)
          where r.value=u.id::text
        ))
      );
    v_label:=case v_type when 'staff_branch' then 'كل موظفي الفرع' when 'staff_roles' then 'موظفون حسب الوظيفة' else 'موظفون محددون' end;
  else
    if not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='CUSTOMER_BROADCAST_SUPER_ADMIN_ONLY'; end if;

    select count(distinct c.user_id) into v_total
    from public.customers c
    where c.user_id is not null
      and (
        v_type='customers_all'
        or (v_type='customers_selected' and exists(
          select 1 from jsonb_array_elements_text(coalesce(p_target->'customer_ids','[]'::jsonb)) r(value)
          where r.value=c.id::text
        ))
      );
    v_label:=case v_type when 'customers_all' then 'كل عملاء التطبيق' else 'عملاء محددون' end;
  end if;

  return jsonb_build_object(
    'target_type',v_type,
    'label',v_label,
    'total',v_total,
    'in_app_eligible',v_total,
    'branch_id',p_branch_id,
    'in_app_primary',true
  );
end;
$$;

create or replace function public.send_notification_campaign_v3(
  p_target jsonb,
  p_branch_id uuid,
  p_title text,
  p_body text,
  p_category text default 'system',
  p_severity text default 'normal',
  p_action_url text default null,
  p_action_label text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid:=auth.uid();
  v_type text:=lower(coalesce(trim(p_target->>'type'),''));
  v_title text:=trim(coalesce(p_title,''));
  v_body text:=trim(coalesce(p_body,''));
  v_category text:=lower(coalesce(nullif(trim(p_category),''),'system'));
  v_severity text:=lower(coalesce(nullif(trim(p_severity),''),'normal'));
  v_preview jsonb;
  v_total integer:=0;
  v_created integer:=0;
  v_campaign uuid;
  v_delivery text;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if v_title='' or char_length(v_title)>120 then raise exception using errcode='22023',message='INVALID_NOTIFICATION_TITLE'; end if;
  if v_body='' or char_length(v_body)>1000 then raise exception using errcode='22023',message='INVALID_NOTIFICATION_BODY'; end if;
  if v_severity not in ('critical','high','normal','info') then raise exception using errcode='22023',message='INVALID_NOTIFICATION_SEVERITY'; end if;

  v_preview:=public.preview_notification_target_v3(p_target,p_branch_id);
  v_total:=coalesce((v_preview->>'total')::integer,0);
  if v_total<=0 then raise exception using errcode='22023',message='NO_NOTIFICATION_RECIPIENTS'; end if;
  v_delivery:=case when v_type like 'customers_%' then 'marketing' else 'transactional' end;

  insert into private.notification_campaigns_v2(
    created_by,branch_id,audience_type,category,severity,title,body,action_url,action_label,
    requested_channels,delivery_type,status,recipient_count,in_app_eligible_count,metadata
  ) values (
    v_uid,case when v_type like 'staff_%' then p_branch_id else null end,v_type,v_category,v_severity,
    v_title,v_body,nullif(trim(coalesce(p_action_url,'')),''),nullif(trim(coalesce(p_action_label,'')),''),
    array['in_app']::text[],v_delivery,'sent',v_total,0,
    jsonb_build_object('target',p_target,'target_label',v_preview->>'label','in_app_primary',true)
  ) returning id into v_campaign;

  if v_type like 'staff_%' then
    insert into private.notification_events_v2(
      audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,
      action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at
    )
    select 'staff',u.id,p_branch_id,'campaign.staff',v_category,v_severity,v_title,v_body,'notification_campaign',v_campaign,
      nullif(trim(coalesce(p_action_url,'')),''),nullif(trim(coalesce(p_action_label,'')),''),false,
      'campaign:'||v_campaign::text,array['in_app']::text[],'active',
      jsonb_build_object('campaign_id',v_campaign,'delivery_type','transactional','sent_by',v_uid,'target',p_target),now(),now()
    from public.users u
    join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
    where coalesce(u.active,true)
      and (
        v_type='staff_branch'
        or (v_type='staff_roles' and exists(
          select 1 from jsonb_array_elements_text(coalesce(p_target->'roles','[]'::jsonb)) r(value)
          where r.value=coalesce(u.role,'')
        ))
        or (v_type='staff_selected' and exists(
          select 1 from jsonb_array_elements_text(coalesce(p_target->'user_ids','[]'::jsonb)) r(value)
          where r.value=u.id::text
        ))
      )
    on conflict(recipient_user_id,dedupe_key) do nothing;
    get diagnostics v_created=row_count;
  else
    insert into public.customer_notifications(user_id,order_id,kind,status,title,body,dedupe_key,read_at,created_at)
    select distinct on (c.user_id)
      c.user_id,null,'campaign','sent',v_title,v_body,
      'campaign:'||v_campaign::text||':'||c.user_id::text,null,now()
    from public.customers c
    where c.user_id is not null
      and (
        v_type='customers_all'
        or (v_type='customers_selected' and exists(
          select 1 from jsonb_array_elements_text(coalesce(p_target->'customer_ids','[]'::jsonb)) r(value)
          where r.value=c.id::text
        ))
      )
    order by c.user_id,c.created_at desc
    on conflict(dedupe_key) do nothing;
    get diagnostics v_created=row_count;

    update private.notification_events_v2 e
      set source_kind='notification_campaign',
          source_id=v_campaign,
          event_key='campaign.customer',
          category=v_category,
          severity=v_severity,
          action_url=nullif(trim(coalesce(p_action_url,'')),''),
          action_label=nullif(trim(coalesce(p_action_label,'')),''),
          eligible_channels=array['in_app']::text[],
          metadata=coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object('campaign_id',v_campaign,'delivery_type','marketing','sent_by',v_uid,'target',p_target),
          updated_at=now()
    from public.customer_notifications cn
    where e.source_kind='customer_notification'
      and e.source_id=cn.id
      and cn.dedupe_key like 'campaign:'||v_campaign::text||':%';
  end if;

  update private.notification_campaigns_v2
  set in_app_eligible_count=v_created,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('created_count',v_created)
  where id=v_campaign;

  return jsonb_build_object(
    'campaign_id',v_campaign,
    'target_type',v_type,
    'recipient_count',v_total,
    'in_app_created',v_created,
    'in_app_primary',true
  );
end;
$$;

revoke all on function public.get_notification_recipient_options_v3(text,uuid,text,integer) from public, anon;
revoke all on function public.preview_notification_target_v3(jsonb,uuid) from public, anon;
revoke all on function public.send_notification_campaign_v3(jsonb,uuid,text,text,text,text,text,text) from public, anon;
grant execute on function public.get_notification_recipient_options_v3(text,uuid,text,integer) to authenticated,service_role;
grant execute on function public.preview_notification_target_v3(jsonb,uuid) to authenticated,service_role;
grant execute on function public.send_notification_campaign_v3(jsonb,uuid,text,text,text,text,text,text) to authenticated,service_role;