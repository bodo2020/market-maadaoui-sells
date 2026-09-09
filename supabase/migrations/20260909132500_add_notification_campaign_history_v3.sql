create or replace function public.get_notification_campaign_history_v3(
  p_branch_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_super boolean := false;
  v_limit integer := greatest(1, least(coalesce(p_limit,50),100));
  v_offset integer := greatest(0, coalesce(p_offset,0));
  v_total integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception using errcode='42501', message='AUTH_REQUIRED'; end if;
  v_is_super := private.staff_is_super_admin(v_uid);
  if not v_is_super then
    if p_branch_id is null or not public.can_send_notifications_v2(p_branch_id) then
      raise exception using errcode='42501', message='NOTIFICATION_CAMPAIGN_HISTORY_DENIED';
    end if;
  end if;
  select count(*)::integer into v_total from private.notification_campaigns_v2 c where v_is_super or c.branch_id=p_branch_id;
  select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb) into v_items
  from (
    select c.created_at,
      jsonb_build_object(
        'id',c.id,'created_at',c.created_at,'created_by',c.created_by,
        'created_by_name',coalesce(u.name,u.email,'مستخدم'),'branch_id',c.branch_id,
        'audience_type',c.audience_type,'target_type',coalesce(c.metadata->'target'->>'type',c.audience_type),
        'target_label',coalesce(c.metadata->>'target_label',case when c.audience_type='customers_all' then 'كل عملاء التطبيق' when c.audience_type='staff_branch' then 'كل موظفي الفرع' else c.audience_type end),
        'category',c.category,'severity',c.severity,'title',c.title,'body',c.body,
        'action_url',c.action_url,'action_label',c.action_label,'delivery_type',c.delivery_type,'status',c.status,
        'recipient_count',c.recipient_count,'created_count',coalesce(stats.created_count,0),'read_count',coalesce(stats.read_count,0),
        'unread_count',coalesce(stats.unread_count,0),'seen_count',coalesce(stats.seen_count,0),'actioned_count',coalesce(stats.actioned_count,0),
        'read_rate',case when coalesce(stats.created_count,0)>0 then round((stats.read_count::numeric*100.0)/stats.created_count,1) else 0 end,
        'target',coalesce(c.metadata->'target','{}'::jsonb)
      ) row_data
    from private.notification_campaigns_v2 c
    left join public.users u on u.id=c.created_by
    left join lateral (
      select count(*)::integer created_count,
        count(*) filter(where e.read_at is not null)::integer read_count,
        count(*) filter(where e.read_at is null)::integer unread_count,
        count(*) filter(where e.seen_at is not null)::integer seen_count,
        count(*) filter(where e.actioned_at is not null)::integer actioned_count
      from private.notification_events_v2 e where e.source_kind='notification_campaign' and e.source_id=c.id
    ) stats on true
    where v_is_super or c.branch_id=p_branch_id
    order by c.created_at desc limit v_limit offset v_offset
  ) q;
  return jsonb_build_object('version',3,'total',v_total,'limit',v_limit,'offset',v_offset,'items',v_items);
end;
$$;

create or replace function public.get_notification_campaign_details_v3(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_campaign private.notification_campaigns_v2%rowtype;
  v_is_super boolean := false;
  v_recipients jsonb := '[]'::jsonb;
  v_stats jsonb := '{}'::jsonb;
  v_creator_name text;
begin
  if v_uid is null then raise exception using errcode='42501', message='AUTH_REQUIRED'; end if;
  select * into v_campaign from private.notification_campaigns_v2 where id=p_campaign_id;
  if not found then raise exception using errcode='P0002', message='NOTIFICATION_CAMPAIGN_NOT_FOUND'; end if;
  v_is_super := private.staff_is_super_admin(v_uid);
  if not v_is_super then
    if v_campaign.branch_id is null or not public.can_send_notifications_v2(v_campaign.branch_id) then
      raise exception using errcode='42501', message='NOTIFICATION_CAMPAIGN_DETAILS_DENIED';
    end if;
  end if;
  select coalesce(u.name,u.email,'مستخدم') into v_creator_name from public.users u where u.id=v_campaign.created_by;
  select jsonb_build_object(
    'created_count',count(*)::integer,
    'read_count',count(*) filter(where e.read_at is not null)::integer,
    'unread_count',count(*) filter(where e.read_at is null)::integer,
    'seen_count',count(*) filter(where e.seen_at is not null)::integer,
    'actioned_count',count(*) filter(where e.actioned_at is not null)::integer,
    'archived_count',count(*) filter(where e.archived_at is not null)::integer
  ) into v_stats
  from private.notification_events_v2 e where e.source_kind='notification_campaign' and e.source_id=p_campaign_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'notification_id',e.id,'recipient_user_id',e.recipient_user_id,'audience',e.audience,
    'recipient_name',case when e.audience='staff' then coalesce(su.name,su.email,'موظف') else coalesce(cu.name,cu.phone,'عميل') end,
    'recipient_role',case when e.audience='staff' then su.role else null end,
    'read_at',e.read_at,'seen_at',e.seen_at,'actioned_at',e.actioned_at,'archived_at',e.archived_at,
    'status',e.status,'created_at',e.created_at
  ) order by e.read_at nulls first,e.created_at desc),'[]'::jsonb) into v_recipients
  from private.notification_events_v2 e
  left join public.users su on e.audience='staff' and su.id=e.recipient_user_id
  left join lateral (
    select c.name,c.phone from public.customers c where e.audience='customer' and c.user_id=e.recipient_user_id order by c.created_at desc limit 1
  ) cu on true
  where e.source_kind='notification_campaign' and e.source_id=p_campaign_id;
  return jsonb_build_object(
    'version',3,
    'campaign',jsonb_build_object(
      'id',v_campaign.id,'created_at',v_campaign.created_at,'created_by',v_campaign.created_by,'created_by_name',coalesce(v_creator_name,'مستخدم'),
      'branch_id',v_campaign.branch_id,'audience_type',v_campaign.audience_type,'target_type',coalesce(v_campaign.metadata->'target'->>'type',v_campaign.audience_type),
      'target_label',coalesce(v_campaign.metadata->>'target_label',case when v_campaign.audience_type='customers_all' then 'كل عملاء التطبيق' when v_campaign.audience_type='staff_branch' then 'كل موظفي الفرع' else v_campaign.audience_type end),
      'target',coalesce(v_campaign.metadata->'target','{}'::jsonb),'category',v_campaign.category,'severity',v_campaign.severity,
      'title',v_campaign.title,'body',v_campaign.body,'action_url',v_campaign.action_url,'action_label',v_campaign.action_label,
      'delivery_type',v_campaign.delivery_type,'status',v_campaign.status,'recipient_count',v_campaign.recipient_count
    ),
    'stats',v_stats,'recipients',v_recipients
  );
end;
$$;

revoke all on function public.get_notification_campaign_history_v3(uuid,integer,integer) from public,anon;
revoke all on function public.get_notification_campaign_details_v3(uuid) from public,anon;
grant execute on function public.get_notification_campaign_history_v3(uuid,integer,integer) to authenticated;
grant execute on function public.get_notification_campaign_details_v3(uuid) to authenticated;
