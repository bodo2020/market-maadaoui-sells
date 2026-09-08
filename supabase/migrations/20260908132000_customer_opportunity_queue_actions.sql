create table if not exists public.customer_opportunity_queue_actions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  action_type text not null check (action_type in ('handled','snoozed')),
  suppress_until timestamptz not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists customer_opportunity_queue_actions_active_idx
  on public.customer_opportunity_queue_actions(branch_id,customer_id,suppress_until desc);

revoke all on public.customer_opportunity_queue_actions from anon,authenticated;

drop function if exists public.set_customer_opportunity_queue_action(uuid,text,integer,text,uuid);
create function public.set_customer_opportunity_queue_action(
  p_customer_id uuid,
  p_action_type text,
  p_snooze_hours integer default null,
  p_note text default null,
  p_branch_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_super boolean;
  v_action text:=lower(btrim(coalesce(p_action_type,'')));
  v_hours integer;
  v_until timestamptz;
  v_note text:=nullif(btrim(coalesce(p_note,'')),'');
  v_id uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.manage',p_branch_id)) then raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id) then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
  if v_action not in ('handled','snoozed') then raise exception using errcode='22023',message='INVALID_OPPORTUNITY_ACTION'; end if;
  if v_note is not null and length(v_note)>500 then raise exception using errcode='22023',message='OPPORTUNITY_NOTE_TOO_LONG'; end if;
  v_hours:=case when v_action='handled' then 24 else coalesce(p_snooze_hours,24) end;
  if v_hours not in (4,24,72,168) then raise exception using errcode='22023',message='INVALID_SNOOZE_HOURS'; end if;
  v_until:=now()+make_interval(hours=>v_hours);
  insert into public.customer_opportunity_queue_actions(customer_id,branch_id,action_type,suppress_until,note,created_by)
  values(p_customer_id,p_branch_id,v_action,v_until,v_note,auth.uid()) returning id into v_id;
  insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata)
  values(p_customer_id,case when v_action='handled' then 'opportunity_handled' else 'opportunity_snoozed' end,p_branch_id,auth.uid(),jsonb_build_object('action_id',v_id,'suppress_until',v_until,'hours',v_hours,'note',v_note));
  return jsonb_build_object('id',v_id,'customer_id',p_customer_id,'action_type',v_action,'suppress_until',v_until,'hours',v_hours);
end $$;
revoke all on function public.set_customer_opportunity_queue_action(uuid,text,integer,text,uuid) from public,anon;
grant execute on function public.set_customer_opportunity_queue_action(uuid,text,integer,text,uuid) to authenticated;

drop function if exists public.clear_customer_opportunity_queue_action(uuid,uuid);
create function public.clear_customer_opportunity_queue_action(p_customer_id uuid,p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_super boolean; v_count integer;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.manage',p_branch_id)) then raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED'; end if;
  update public.customer_opportunity_queue_actions set suppress_until=now()
  where customer_id=p_customer_id and suppress_until>now() and branch_id is not distinct from p_branch_id;
  get diagnostics v_count=row_count;
  if v_count>0 then
    insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata)
    values(p_customer_id,'opportunity_resumed',p_branch_id,auth.uid(),jsonb_build_object('cleared_actions',v_count));
  end if;
  return jsonb_build_object('customer_id',p_customer_id,'cleared',v_count);
end $$;
revoke all on function public.clear_customer_opportunity_queue_action(uuid,uuid) from public,anon;
grant execute on function public.clear_customer_opportunity_queue_action(uuid,uuid) to authenticated;

drop function if exists public.get_customer_opportunity_queue_state(uuid);
create function public.get_customer_opportunity_queue_state(p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_super boolean; v_active jsonb; v_summary jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not (public.staff_has_permission('customers.view',p_branch_id) or public.staff_has_permission('sales.view',p_branch_id))) then raise exception using errcode='42501',message='CUSTOMER_ACCESS_DENIED'; end if;
  with ranked as (
    select a.*,u.name created_by_name,row_number() over(partition by a.customer_id order by a.created_at desc,a.id) rn
    from public.customer_opportunity_queue_actions a left join public.users u on u.id=a.created_by
    where a.suppress_until>now() and a.branch_id is not distinct from p_branch_id
  ), q as (select * from ranked where rn=1 order by suppress_until asc)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'customer_id',customer_id,'action_type',action_type,'suppress_until',suppress_until,'note',note,'created_by',created_by,'created_by_name',created_by_name,'created_at',created_at) order by suppress_until asc),'[]'::jsonb) into v_active from q;
  select jsonb_build_object(
    'active_count',(select count(*) from public.customer_opportunity_queue_actions a where a.suppress_until>now() and a.branch_id is not distinct from p_branch_id),
    'handled_today',(select count(*) from public.customer_opportunity_queue_actions a where a.action_type='handled' and a.created_at>=date_trunc('day',now()) and a.branch_id is not distinct from p_branch_id),
    'snoozed_active',(select count(*) from public.customer_opportunity_queue_actions a where a.action_type='snoozed' and a.suppress_until>now() and a.branch_id is not distinct from p_branch_id)
  ) into v_summary;
  return jsonb_build_object('active',v_active,'summary',v_summary);
end $$;
revoke all on function public.get_customer_opportunity_queue_state(uuid) from public,anon;
grant execute on function public.get_customer_opportunity_queue_state(uuid) to authenticated;

drop function if exists public.get_customer_operations_center_v2(uuid,integer,integer);
create function public.get_customer_operations_center_v2(p_branch_id uuid default null,p_days integer default 30,p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_base jsonb;
  v_queue jsonb;
  v_state jsonb;
begin
  v_base:=public.get_customer_operations_center(p_branch_id,p_days,p_limit);
  select coalesce(jsonb_agg(q.item order by (q.item->>'priority_score')::numeric desc,(q.item->>'signal_count')::numeric desc),'[]'::jsonb)
  into v_queue
  from jsonb_array_elements(coalesce(v_base->'priority_queue','[]'::jsonb)) q(item)
  where not exists (
    select 1 from public.customer_opportunity_queue_actions a
    where a.customer_id=(q.item->>'id')::uuid
      and a.suppress_until>now()
      and a.branch_id is not distinct from p_branch_id
  );
  v_state:=public.get_customer_opportunity_queue_state(p_branch_id);
  return jsonb_set(v_base,'{priority_queue}',v_queue,true) || jsonb_build_object('queue_state',v_state);
end $$;
revoke all on function public.get_customer_operations_center_v2(uuid,integer,integer) from public,anon;
grant execute on function public.get_customer_operations_center_v2(uuid,integer,integer) to authenticated;
