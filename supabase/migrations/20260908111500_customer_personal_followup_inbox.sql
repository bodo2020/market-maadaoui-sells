drop function if exists public.get_my_customer_followup_inbox(uuid,integer);
create function public.get_my_customer_followup_inbox(
  p_branch_id uuid default null,
  p_upcoming_days integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_super boolean;
  v_days integer:=greatest(1,least(coalesce(p_upcoming_days,14),60));
  v_today date:=(now() at time zone 'Africa/Cairo')::date;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;

  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.manage',p_branch_id)) then
    raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED';
  end if;

  if p_branch_id is not null and not v_super and not exists(
    select 1 from public.user_branch_roles ubr
    where ubr.user_id=auth.uid() and ubr.branch_id=p_branch_id and ubr.active
  ) then
    raise exception using errcode='42501',message='FOLLOWUP_BRANCH_SCOPE_DENIED';
  end if;

  with base as (
    select
      i.id as interaction_id,
      i.customer_id,
      c.name as customer_name,
      c.phone as customer_phone,
      la.membership_number,
      c.management_status,
      i.type,
      i.subject,
      i.description,
      i.priority,
      i.scheduled_at,
      i.created_at,
      i.branch_id,
      greatest(0,floor(extract(epoch from (now()-i.scheduled_at))/3600))::integer as overdue_hours,
      case
        when i.scheduled_at < now() then 'overdue'
        when (i.scheduled_at at time zone 'Africa/Cairo')::date=v_today then 'today'
        else 'upcoming'
      end as bucket
    from public.customer_interactions i
    join public.customers c on c.id=i.customer_id
    left join public.customer_loyalty_accounts la on la.customer_id=c.id
    where i.status='pending'
      and i.assigned_to=auth.uid()
      and (p_branch_id is null or i.branch_id is not distinct from p_branch_id)
      and i.scheduled_at < ((v_today + (v_days+1))::timestamp at time zone 'Africa/Cairo')
  ), packed as (
    select
      coalesce(jsonb_agg(to_jsonb(b) order by case b.priority when 'high' then 1 when 'medium' then 2 else 3 end,b.scheduled_at) filter (where b.bucket='overdue'),'[]'::jsonb) as overdue,
      coalesce(jsonb_agg(to_jsonb(b) order by case b.priority when 'high' then 1 when 'medium' then 2 else 3 end,b.scheduled_at) filter (where b.bucket='today'),'[]'::jsonb) as today,
      coalesce(jsonb_agg(to_jsonb(b) order by b.scheduled_at) filter (where b.bucket='upcoming'),'[]'::jsonb) as upcoming,
      count(*) filter (where b.bucket='overdue')::integer as overdue_count,
      count(*) filter (where b.bucket='today')::integer as today_count,
      count(*) filter (where b.bucket='upcoming')::integer as upcoming_count,
      count(*) filter (where b.priority='high')::integer as high_priority_count
    from base b
  )
  select jsonb_build_object(
    'staff_id',auth.uid(),
    'branch_id',p_branch_id,
    'upcoming_days',v_days,
    'summary',jsonb_build_object(
      'overdue',p.overdue_count,
      'today',p.today_count,
      'upcoming',p.upcoming_count,
      'high_priority',p.high_priority_count,
      'total',p.overdue_count+p.today_count+p.upcoming_count
    ),
    'overdue',p.overdue,
    'today',p.today,
    'upcoming',p.upcoming
  ) into v_result
  from packed p;

  return v_result;
end $$;

revoke all on function public.get_my_customer_followup_inbox(uuid,integer) from public,anon;
grant execute on function public.get_my_customer_followup_inbox(uuid,integer) to authenticated;
