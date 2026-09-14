create table if not exists private.order_picker_assignment_shadow_v1 (
  order_id uuid primary key references public.online_orders(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  recommended_user_id uuid references public.users(id) on delete set null,
  recommended_score numeric(10,2),
  reason text not null default 'pending',
  candidate_snapshot jsonb not null default '[]'::jsonb,
  first_generated_at timestamptz not null default now(),
  generated_at timestamptz not null default now(),
  generation_count integer not null default 1 check (generation_count > 0),
  actual_picker_user_id uuid references public.users(id) on delete set null,
  actual_claimed_at timestamptz,
  resolved_at timestamptz,
  outcome text not null default 'pending' check (outcome in ('pending','matched','different','no_recommendation','cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists order_picker_assignment_shadow_branch_idx
  on private.order_picker_assignment_shadow_v1(branch_id, generated_at desc);
create index if not exists order_picker_assignment_shadow_recommended_idx
  on private.order_picker_assignment_shadow_v1(recommended_user_id, outcome, generated_at desc);

revoke all on private.order_picker_assignment_shadow_v1 from anon, authenticated;

create or replace function private.order_picker_candidates_v1(p_order_id uuid)
returns table(
  user_id uuid,
  user_name text,
  on_shift boolean,
  active_orders integer,
  active_tasks integer,
  idle_minutes integer,
  can_accept boolean,
  score numeric
)
language sql
stable
security definer
set search_path=''
as $function$
with order_ctx as (
  select o.id as order_id, o.branch_id
  from public.online_orders o
  where o.id=p_order_id and o.branch_id is not null
), candidates as (
  select distinct u.id as user_id, u.name as user_name, oc.branch_id
  from order_ctx oc
  join public.user_branch_roles ubr on ubr.branch_id=oc.branch_id and ubr.active
  join public.users u on u.id=ubr.user_id and coalesce(u.active,true)
  where private.staff_user_has_permission_v3(u.id,'online_orders.prepare',oc.branch_id)
     or private.staff_user_has_permission_v3(u.id,'online_orders.manage',oc.branch_id)
), metrics as (
  select c.*,
    exists(
      select 1 from private.hr_attendance_sessions s
      where s.user_id=c.user_id and s.branch_id=c.branch_id
        and s.status='active' and s.check_in_at is not null and s.check_out_at is null
    ) as on_shift,
    (select count(*)::integer from private.order_fulfillment_state_v1 f
      where f.branch_id=c.branch_id and f.picker_user_id=c.user_id
        and f.fulfillment_state in ('queued','picking','packing')) as active_orders,
    (select count(*)::integer from public.operations_tasks t
      where t.branch_id=c.branch_id and t.claimed_by=c.user_id
        and t.status in ('claimed','in_progress','failed')) as active_tasks,
    (select floor(extract(epoch from (now()-max(coalesce(f.completed_at,f.handed_over_at,f.ready_at))))/60)::integer
      from private.order_fulfillment_state_v1 f
      where f.branch_id=c.branch_id and f.picker_user_id=c.user_id
        and coalesce(f.completed_at,f.handed_over_at,f.ready_at) is not null) as idle_minutes
  from candidates c
)
select
  m.user_id,
  m.user_name,
  m.on_shift,
  m.active_orders,
  m.active_tasks,
  coalesce(m.idle_minutes,180) as idle_minutes,
  (m.on_shift and m.active_orders=0) as can_accept,
  round((
    (case when m.on_shift then 120 else 0 end)
    - (m.active_orders * 35)
    - (m.active_tasks * 4)
    + least(greatest(coalesce(m.idle_minutes,180),0),180)::numeric / 9
  )::numeric,2) as score
from metrics m
order by (m.on_shift and m.active_orders=0) desc,
         ((case when m.on_shift then 120 else 0 end) - (m.active_orders*35) - (m.active_tasks*4) + least(greatest(coalesce(m.idle_minutes,180),0),180)::numeric/9) desc,
         m.user_name;
$function$;

create or replace function private.refresh_order_picker_assignment_shadow_v1(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_state private.order_fulfillment_state_v1%rowtype;
  v_order public.online_orders%rowtype;
  v_best record;
  v_snapshot jsonb:='[]'::jsonb;
  v_reason text:='pending';
  v_total integer:=0;
  v_on_shift integer:=0;
  v_available integer:=0;
begin
  select * into v_order from public.online_orders where id=p_order_id;
  select * into v_state from private.order_fulfillment_state_v1 where order_id=p_order_id;
  if v_order.id is null or v_state.order_id is null or v_order.branch_id is null then return; end if;

  if v_order.status::text='cancelled' or v_state.fulfillment_state='cancelled' then
    update private.order_picker_assignment_shadow_v1
      set outcome='cancelled',resolved_at=coalesce(resolved_at,now()),updated_at=now()
    where order_id=p_order_id and outcome='pending';
    return;
  end if;

  if v_state.picker_user_id is not null then
    insert into private.order_picker_assignment_shadow_v1(
      order_id,branch_id,recommended_user_id,recommended_score,reason,candidate_snapshot,
      actual_picker_user_id,actual_claimed_at,resolved_at,outcome,metadata
    ) values(
      p_order_id,v_state.branch_id,null,null,'claimed_before_shadow','[]'::jsonb,
      v_state.picker_user_id,now(),now(),'no_recommendation',jsonb_build_object('fulfillment_state',v_state.fulfillment_state)
    )
    on conflict(order_id) do update set
      actual_picker_user_id=excluded.actual_picker_user_id,
      actual_claimed_at=coalesce(private.order_picker_assignment_shadow_v1.actual_claimed_at,excluded.actual_claimed_at),
      resolved_at=coalesce(private.order_picker_assignment_shadow_v1.resolved_at,excluded.resolved_at),
      outcome=case
        when private.order_picker_assignment_shadow_v1.recommended_user_id is null then 'no_recommendation'
        when private.order_picker_assignment_shadow_v1.recommended_user_id=excluded.actual_picker_user_id then 'matched'
        else 'different' end,
      updated_at=now();
    return;
  end if;

  if v_state.fulfillment_state<>'queued' or v_order.status::text not in ('confirmed','preparing') then return; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',c.user_id,'name',c.user_name,'on_shift',c.on_shift,'active_orders',c.active_orders,
    'active_tasks',c.active_tasks,'idle_minutes',c.idle_minutes,'can_accept',c.can_accept,'score',c.score
  ) order by c.can_accept desc,c.score desc),'[]'::jsonb),
  count(*)::integer,
  count(*) filter(where c.on_shift)::integer,
  count(*) filter(where c.can_accept)::integer
  into v_snapshot,v_total,v_on_shift,v_available
  from private.order_picker_candidates_v1(p_order_id) c;

  select * into v_best
  from private.order_picker_candidates_v1(p_order_id) c
  where c.can_accept
  order by c.score desc,c.idle_minutes desc,c.user_name
  limit 1;

  if v_best.user_id is not null then v_reason:='recommended';
  elsif v_total=0 then v_reason:='no_picker_role';
  elsif v_on_shift=0 then v_reason:='no_on_shift_picker';
  elsif v_available=0 then v_reason:='all_pickers_busy';
  else v_reason:='no_candidate'; end if;

  insert into private.order_picker_assignment_shadow_v1(
    order_id,branch_id,recommended_user_id,recommended_score,reason,candidate_snapshot,metadata
  ) values(
    p_order_id,v_state.branch_id,v_best.user_id,v_best.score,v_reason,v_snapshot,
    jsonb_build_object('fulfillment_state',v_state.fulfillment_state,'predicted_ready_at',v_state.predicted_ready_at)
  )
  on conflict(order_id) do update set
    branch_id=excluded.branch_id,
    recommended_user_id=excluded.recommended_user_id,
    recommended_score=excluded.recommended_score,
    reason=excluded.reason,
    candidate_snapshot=excluded.candidate_snapshot,
    generated_at=now(),
    generation_count=private.order_picker_assignment_shadow_v1.generation_count+1,
    metadata=excluded.metadata,
    updated_at=now()
  where private.order_picker_assignment_shadow_v1.outcome='pending';
end;
$function$;

create or replace function private.sync_order_picker_assignment_shadow_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.picker_user_id is distinct from old.picker_user_id and new.picker_user_id is not null then
    perform private.refresh_order_picker_assignment_shadow_v1(new.order_id);
  elsif new.fulfillment_state='queued' and new.picker_user_id is null
    and (new.fulfillment_state is distinct from old.fulfillment_state or new.predicted_ready_at is distinct from old.predicted_ready_at) then
    perform private.refresh_order_picker_assignment_shadow_v1(new.order_id);
  elsif new.fulfillment_state='cancelled' and new.fulfillment_state is distinct from old.fulfillment_state then
    perform private.refresh_order_picker_assignment_shadow_v1(new.order_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_order_picker_assignment_shadow_v1 on private.order_fulfillment_state_v1;
create trigger trg_order_picker_assignment_shadow_v1
after update of fulfillment_state,picker_user_id,predicted_ready_at on private.order_fulfillment_state_v1
for each row execute function private.sync_order_picker_assignment_shadow_trigger_v1();

create or replace function public.get_my_picker_assignment_shadow_v1(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  r record;
  v_next jsonb;
  v_orders jsonb;
  v_resolved integer:=0;
  v_matched integer:=0;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('online_orders.prepare',p_branch_id)
     and not public.staff_has_permission('online_orders.manage',p_branch_id)
     and not public.staff_has_permission('online_orders.view',p_branch_id) then
    raise exception using errcode='42501',message='ORDER_ASSIGNMENT_SHADOW_DENIED';
  end if;

  for r in
    select f.order_id from private.order_fulfillment_state_v1 f
    join public.online_orders o on o.id=f.order_id
    where f.branch_id=p_branch_id and f.fulfillment_state='queued' and f.picker_user_id is null
      and o.status::text in ('confirmed','preparing')
  loop
    perform private.refresh_order_picker_assignment_shadow_v1(r.order_id);
  end loop;

  select jsonb_build_object(
    'order_id',o.id,'display_id','MD-'||upper(substr(replace(o.id::text,'-',''),1,6)),
    'customer_name',coalesce(o.customer_snapshot->>'name',c.name,'عميل'),
    'items_total',f.items_total,'predicted_ready_at',f.predicted_ready_at,
    'eta_risk',coalesce(e.risk,'on_track'),'score',s.recommended_score,'reason',s.reason
  ) into v_next
  from private.order_picker_assignment_shadow_v1 s
  join public.online_orders o on o.id=s.order_id
  join private.order_fulfillment_state_v1 f on f.order_id=o.id
  left join public.customers c on c.id=o.customer_id
  left join private.order_eta_current_v1 e on e.order_id=o.id
  where s.branch_id=p_branch_id and s.outcome='pending' and s.recommended_user_id=v_uid
    and f.fulfillment_state='queued' and f.picker_user_id is null
  order by case coalesce(e.risk,'on_track') when 'late' then 0 when 'at_risk' then 1 else 2 end,
           f.predicted_ready_at nulls last,o.created_at
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',o.id,'display_id','MD-'||upper(substr(replace(o.id::text,'-',''),1,6)),
    'created_at',o.created_at,'customer_name',coalesce(o.customer_snapshot->>'name',c.name,'عميل'),
    'items_total',f.items_total,'predicted_ready_at',f.predicted_ready_at,'eta_risk',coalesce(e.risk,'on_track'),
    'recommended_user_id',s.recommended_user_id,'recommended_name',ru.name,
    'recommended_score',s.recommended_score,'reason',s.reason,
    'is_recommended_to_me',s.recommended_user_id=v_uid,'generation_count',s.generation_count
  ) order by case coalesce(e.risk,'on_track') when 'late' then 0 when 'at_risk' then 1 else 2 end,
             f.predicted_ready_at nulls last,o.created_at),'[]'::jsonb)
  into v_orders
  from private.order_picker_assignment_shadow_v1 s
  join public.online_orders o on o.id=s.order_id
  join private.order_fulfillment_state_v1 f on f.order_id=o.id
  left join public.customers c on c.id=o.customer_id
  left join public.users ru on ru.id=s.recommended_user_id
  left join private.order_eta_current_v1 e on e.order_id=o.id
  where s.branch_id=p_branch_id and s.outcome='pending'
    and f.fulfillment_state='queued' and f.picker_user_id is null;

  select count(*)::integer,count(*) filter(where outcome='matched')::integer
    into v_resolved,v_matched
  from private.order_picker_assignment_shadow_v1
  where branch_id=p_branch_id and resolved_at>=now()-interval '7 days'
    and outcome in ('matched','different');

  return jsonb_build_object(
    'mode','shadow','branch_id',p_branch_id,'generated_at',now(),
    'summary',jsonb_build_object(
      'queued_unassigned',(select count(*) from private.order_fulfillment_state_v1 where branch_id=p_branch_id and fulfillment_state='queued' and picker_user_id is null),
      'recommended_to_me',(select count(*) from private.order_picker_assignment_shadow_v1 s join private.order_fulfillment_state_v1 f on f.order_id=s.order_id where s.branch_id=p_branch_id and s.outcome='pending' and s.recommended_user_id=v_uid and f.fulfillment_state='queued' and f.picker_user_id is null),
      'without_candidate',(select count(*) from private.order_picker_assignment_shadow_v1 s join private.order_fulfillment_state_v1 f on f.order_id=s.order_id where s.branch_id=p_branch_id and s.outcome='pending' and s.recommended_user_id is null and f.fulfillment_state='queued' and f.picker_user_id is null),
      'resolved_7d',v_resolved,'matched_7d',v_matched,
      'match_rate_7d',case when v_resolved=0 then null else round((v_matched::numeric/v_resolved::numeric)*100,1) end
    ),
    'next_for_me',v_next,
    'orders',coalesce(v_orders,'[]'::jsonb)
  );
end;
$function$;

grant execute on function public.get_my_picker_assignment_shadow_v1(uuid) to authenticated;
revoke all on function private.order_picker_candidates_v1(uuid) from public, anon, authenticated;
revoke all on function private.refresh_order_picker_assignment_shadow_v1(uuid) from public, anon, authenticated;
revoke all on function private.sync_order_picker_assignment_shadow_trigger_v1() from public, anon, authenticated;

comment on table private.order_picker_assignment_shadow_v1 is 'Shadow-only picker recommendations for measuring smart assignment before automatic dispatch is enabled.';
comment on function public.get_my_picker_assignment_shadow_v1(uuid) is 'Returns non-enforcing smart picker recommendations for the current branch and refreshes queued order recommendations.';
