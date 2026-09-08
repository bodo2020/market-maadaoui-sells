drop function if exists public.get_customer_followup_team_workload(uuid);
create function public.get_customer_followup_team_workload(p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_super boolean;
  v_rows jsonb;
  v_summary jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not (public.staff_has_permission('customers.view',p_branch_id) or public.staff_has_permission('customers.manage',p_branch_id))) then
    raise exception using errcode='42501',message='CUSTOMER_ACCESS_DENIED';
  end if;

  if p_branch_id is null then
    with eligible as (
      select distinct u.id,u.name,u.phone,
        case when private.staff_is_super_admin(u.id) then coalesce(sysr.name_ar,'مدير النظام') else coalesce(sysr.name_ar,u.role) end role
      from public.users u
      left join public.staff_roles sysr on sysr.id=u.system_role_id
      where coalesce(u.active,true)
        and (
          private.staff_is_super_admin(u.id)
          or exists(
            select 1 from public.user_branch_roles x
            join public.staff_role_permissions srp on srp.role_id=x.role_id
            join public.staff_permissions sp on sp.id=srp.permission_id and sp.code='customers.manage'
            where x.user_id=u.id and x.active
          )
        )
    ), metrics as (
      select e.id,e.name,e.phone,e.role,
        count(i.id) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp'))::bigint pending_count,
        count(i.id) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.scheduled_at<now())::bigint overdue_count,
        count(i.id) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.scheduled_at>=date_trunc('day',now()) and i.scheduled_at<date_trunc('day',now())+interval '1 day')::bigint due_today_count,
        count(i.id) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.scheduled_at>=now() and i.scheduled_at<=now()+interval '7 days')::bigint next_7d_count,
        count(i.id) filter(where i.status='completed' and i.type in ('call','email','meeting','whatsapp') and i.completed_at>=now()-interval '7 days')::bigint completed_7d_count,
        min(i.scheduled_at) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp')) next_due_at
      from eligible e left join public.customer_interactions i on i.assigned_to=e.id
      group by e.id,e.name,e.phone,e.role
    ), q as (
      select *,least(100,(overdue_count*12+due_today_count*6+pending_count*2))::int workload_score,
        case when overdue_count>=3 or pending_count>=10 then 'high' when overdue_count>0 or pending_count>=5 then 'medium' else 'available' end workload_level
      from metrics order by workload_score desc,overdue_count desc,pending_count desc,name
    ) select coalesce(jsonb_agg(to_jsonb(q) order by q.workload_score desc,q.name),'[]'::jsonb) into v_rows from q;
  else
    with eligible as (
      select distinct u.id,u.name,u.phone,
        case when private.staff_is_super_admin(u.id) then coalesce(sysr.name_ar,'مدير النظام') else coalesce(sr.name_ar,ubr.role,u.role) end role
      from public.users u
      join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
      left join public.staff_roles sr on sr.id=ubr.role_id
      left join public.staff_roles sysr on sysr.id=u.system_role_id
      where coalesce(u.active,true)
        and (
          private.staff_is_super_admin(u.id)
          or exists(
            select 1 from public.staff_role_permissions srp
            join public.staff_permissions sp on sp.id=srp.permission_id and sp.code='customers.manage'
            where srp.role_id=ubr.role_id
          )
        )
    ), metrics as (
      select e.id,e.name,e.phone,e.role,
        count(i.id) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp'))::bigint pending_count,
        count(i.id) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.scheduled_at<now())::bigint overdue_count,
        count(i.id) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.scheduled_at>=date_trunc('day',now()) and i.scheduled_at<date_trunc('day',now())+interval '1 day')::bigint due_today_count,
        count(i.id) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.scheduled_at>=now() and i.scheduled_at<=now()+interval '7 days')::bigint next_7d_count,
        count(i.id) filter(where i.status='completed' and i.type in ('call','email','meeting','whatsapp') and i.completed_at>=now()-interval '7 days')::bigint completed_7d_count,
        min(i.scheduled_at) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp')) next_due_at
      from eligible e left join public.customer_interactions i on i.assigned_to=e.id and i.branch_id=p_branch_id
      group by e.id,e.name,e.phone,e.role
    ), q as (
      select *,least(100,(overdue_count*12+due_today_count*6+pending_count*2))::int workload_score,
        case when overdue_count>=3 or pending_count>=10 then 'high' when overdue_count>0 or pending_count>=5 then 'medium' else 'available' end workload_level
      from metrics order by workload_score desc,overdue_count desc,pending_count desc,name
    ) select coalesce(jsonb_agg(to_jsonb(q) order by q.workload_score desc,q.name),'[]'::jsonb) into v_rows from q;
  end if;

  select jsonb_build_object(
    'staff_count',(select count(*) from jsonb_array_elements(v_rows)),
    'pending_total',coalesce((select sum((x->>'pending_count')::bigint) from jsonb_array_elements(v_rows) x),0),
    'overdue_total',coalesce((select sum((x->>'overdue_count')::bigint) from jsonb_array_elements(v_rows) x),0),
    'due_today_total',coalesce((select sum((x->>'due_today_count')::bigint) from jsonb_array_elements(v_rows) x),0),
    'completed_7d_total',coalesce((select sum((x->>'completed_7d_count')::bigint) from jsonb_array_elements(v_rows) x),0)
  ) into v_summary;
  return jsonb_build_object('summary',v_summary,'staff',v_rows);
end $$;
revoke all on function public.get_customer_followup_team_workload(uuid) from public,anon;
grant execute on function public.get_customer_followup_team_workload(uuid) to authenticated;
