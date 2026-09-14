create table if not exists private.order_fulfillment_state_v1 (
  order_id uuid primary key references public.online_orders(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  fulfillment_state text not null default 'awaiting_confirmation' check (fulfillment_state in ('awaiting_confirmation','queued','picking','packing','ready','handed_over','completed','cancelled','issue')),
  picker_user_id uuid references public.users(id),
  pick_task_id uuid references public.operations_tasks(id),
  items_total integer not null default 0 check (items_total >= 0),
  items_picked integer not null default 0 check (items_picked >= 0),
  shortage_count integer not null default 0 check (shortage_count >= 0),
  substitution_count integer not null default 0 check (substitution_count >= 0),
  bags_count integer not null default 0 check (bags_count >= 0),
  prep_target_minutes integer not null default 20 check (prep_target_minutes between 1 and 240),
  predicted_ready_at timestamptz,
  confirmed_at timestamptz,
  picking_started_at timestamptz,
  picking_completed_at timestamptz,
  packing_started_at timestamptz,
  ready_at timestamptz,
  handed_over_at timestamptz,
  completed_at timestamptz,
  issue_code text,
  issue_note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_fulfillment_branch_state_idx on private.order_fulfillment_state_v1(branch_id, fulfillment_state, predicted_ready_at);
create index if not exists order_fulfillment_picker_idx on private.order_fulfillment_state_v1(picker_user_id, fulfillment_state, updated_at desc);
revoke all on private.order_fulfillment_state_v1 from public, anon, authenticated;

create or replace function private.estimate_order_ready_at_v1(p_order_id uuid)
returns timestamptz language plpgsql stable security definer set search_path=''
as $function$
declare
  v_order public.online_orders%rowtype;
  v_eta private.order_eta_current_v1%rowtype;
  v_components jsonb;
  v_minutes integer := 20;
  v_elapsed integer := 0;
begin
  select * into v_order from public.online_orders where id=p_order_id;
  if v_order.id is null then return null; end if;
  if v_order.status::text='ready' then return coalesce(v_order.updated_at,now()); end if;
  if v_order.status::text in ('shipped','delivered','cancelled') then return coalesce(v_order.updated_at,now()); end if;
  select * into v_eta from private.order_eta_current_v1 where order_id=p_order_id;
  v_components := coalesce(v_eta.components,'{}'::jsonb);
  v_minutes := greatest(3,
    coalesce((v_components->>'queue_wait_minutes')::integer,0)
    + coalesce((v_components->>'picking_minutes')::integer,12)
    + coalesce((v_components->>'substitution_minutes')::integer,2)
    + coalesce((v_components->>'packing_minutes')::integer,5)
  );
  if v_order.status::text='confirmed' then
    v_minutes := greatest(3,
      coalesce((v_components->>'picking_minutes')::integer,12)
      + coalesce((v_components->>'substitution_minutes')::integer,2)
      + coalesce((v_components->>'packing_minutes')::integer,5)
    );
  elsif v_order.status::text='preparing' then
    v_elapsed := coalesce((v_components->>'elapsed_stage_minutes')::integer,0);
    v_minutes := greatest(3,
      coalesce((v_components->>'picking_minutes')::integer,12)
      + coalesce((v_components->>'substitution_minutes')::integer,2)
      + coalesce((v_components->>'packing_minutes')::integer,5)
      - v_elapsed
    );
  end if;
  return now()+make_interval(mins=>v_minutes);
end;
$function$;
revoke all on function private.estimate_order_ready_at_v1(uuid) from public, anon, authenticated;

create or replace function private.sync_order_fulfillment_v1(p_order_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare
  v_order public.online_orders%rowtype;
  v_state text;
  v_ready_at timestamptz;
  v_items integer := 0;
  v_task public.operations_tasks%rowtype;
  v_eta private.order_eta_current_v1%rowtype;
  v_priority text := 'normal';
  v_display text;
begin
  select * into v_order from public.online_orders where id=p_order_id;
  if v_order.id is null or v_order.branch_id is null then return; end if;
  perform private.recalculate_order_eta_v1(p_order_id,'fulfillment_sync');
  select * into v_eta from private.order_eta_current_v1 where order_id=p_order_id;
  v_ready_at := private.estimate_order_ready_at_v1(p_order_id);
  v_items := case when jsonb_typeof(v_order.items)='array' then jsonb_array_length(v_order.items) else 0 end;
  v_state := case v_order.status::text
    when 'pending' then 'awaiting_confirmation'
    when 'confirmed' then 'queued'
    when 'preparing' then 'picking'
    when 'ready' then 'ready'
    when 'shipped' then 'handed_over'
    when 'delivered' then 'completed'
    when 'cancelled' then 'cancelled'
    else 'awaiting_confirmation' end;

  insert into private.order_fulfillment_state_v1(
    order_id,branch_id,fulfillment_state,items_total,prep_target_minutes,predicted_ready_at,
    confirmed_at,ready_at,handed_over_at,completed_at,updated_at
  ) values (
    v_order.id,v_order.branch_id,v_state,v_items,
    greatest(3,ceil(extract(epoch from (v_ready_at-now()))/60)::integer),v_ready_at,
    case when v_order.status::text not in ('pending','cancelled') then coalesce(v_order.updated_at,now()) end,
    case when v_order.status::text='ready' then coalesce(v_order.updated_at,now()) end,
    case when v_order.status::text='shipped' then coalesce(v_order.updated_at,now()) end,
    case when v_order.status::text='delivered' then coalesce(v_order.updated_at,now()) end,
    now()
  ) on conflict(order_id) do update set
    branch_id=excluded.branch_id,
    fulfillment_state=case when private.order_fulfillment_state_v1.fulfillment_state='packing' and excluded.fulfillment_state='picking' then 'packing' else excluded.fulfillment_state end,
    items_total=excluded.items_total,
    prep_target_minutes=greatest(1,excluded.prep_target_minutes),
    predicted_ready_at=case when excluded.fulfillment_state in ('ready','handed_over','completed','cancelled') then coalesce(private.order_fulfillment_state_v1.ready_at,excluded.predicted_ready_at) else excluded.predicted_ready_at end,
    confirmed_at=coalesce(private.order_fulfillment_state_v1.confirmed_at,excluded.confirmed_at),
    ready_at=coalesce(private.order_fulfillment_state_v1.ready_at,excluded.ready_at),
    handed_over_at=coalesce(private.order_fulfillment_state_v1.handed_over_at,excluded.handed_over_at),
    completed_at=coalesce(private.order_fulfillment_state_v1.completed_at,excluded.completed_at),
    updated_at=now();

  if v_order.status::text in ('confirmed','preparing') then
    v_priority := case when coalesce(v_eta.risk,'on_track') in ('at_risk','late') then 'high' else 'normal' end;
    v_display := 'MD-'||upper(substr(replace(v_order.id::text,'-',''),1,6));
    insert into public.operations_tasks(
      branch_id,task_type,source_kind,source_id,order_id,priority,status,title,description,due_at,metadata
    ) values(
      v_order.branch_id,'online_order_fulfillment','online_order_fulfillment',v_order.id,v_order.id,v_priority,'open',
      'تجهيز الطلب '||v_display,'ابدأ جمع الأصناف والتعبئة قبل موعد الجاهزية المتوقع.',v_ready_at,
      jsonb_build_object('predicted_ready_at',v_ready_at,'eta_risk',v_eta.risk,'items_total',v_items,'workflow','fulfillment_v1')
    ) on conflict(task_type,source_kind,source_id) do update set
      priority=excluded.priority,due_at=excluded.due_at,metadata=excluded.metadata,title=excluded.title,description=excluded.description,
      status=case when operations_tasks.status in ('completed','cancelled') then 'open' else operations_tasks.status end,
      completed_at=case when operations_tasks.status in ('completed','cancelled') then null else operations_tasks.completed_at end,
      completed_by=case when operations_tasks.status in ('completed','cancelled') then null else operations_tasks.completed_by end,
      updated_at=now()
    returning * into v_task;
    update private.order_fulfillment_state_v1 set pick_task_id=v_task.id where order_id=v_order.id;
  elsif v_order.status::text in ('ready','shipped','delivered') then
    update public.operations_tasks set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
      where task_type='online_order_fulfillment' and source_kind='online_order_fulfillment' and source_id=v_order.id and status in ('open','claimed','in_progress','failed');
  elsif v_order.status::text='cancelled' then
    update public.operations_tasks set status='cancelled',updated_at=now()
      where task_type='online_order_fulfillment' and source_kind='online_order_fulfillment' and source_id=v_order.id and status not in ('completed','cancelled');
  end if;
end;
$function$;
revoke all on function private.sync_order_fulfillment_v1(uuid) from public, anon, authenticated;

create or replace function private.sync_order_fulfillment_trigger_v1()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin perform private.sync_order_fulfillment_v1(new.id); return new; end;
$function$;
revoke all on function private.sync_order_fulfillment_trigger_v1() from public, anon, authenticated;
drop trigger if exists sync_order_fulfillment_v1 on public.online_orders;
create trigger sync_order_fulfillment_v1 after insert or update of status,items,branch_id on public.online_orders for each row execute function private.sync_order_fulfillment_trigger_v1();

create or replace function public.claim_order_fulfillment_v1(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_state private.order_fulfillment_state_v1%rowtype; v_task public.operations_tasks%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  perform private.sync_order_fulfillment_v1(p_order_id);
  select * into v_state from private.order_fulfillment_state_v1 where order_id=p_order_id for update;
  if v_state.order_id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  if not private.staff_is_super_admin(v_uid) and not public.staff_has_permission('online_orders.manage',v_state.branch_id) then raise exception using errcode='42501',message='FULFILLMENT_PERMISSION_DENIED'; end if;
  if v_state.fulfillment_state not in ('queued','picking','packing') then raise exception using errcode='55000',message='FULFILLMENT_NOT_CLAIMABLE'; end if;
  select * into v_task from public.operations_tasks where id=v_state.pick_task_id for update;
  if v_task.id is null then raise exception using errcode='22023',message='FULFILLMENT_TASK_NOT_FOUND'; end if;
  if v_task.claimed_by is not null and v_task.claimed_by<>v_uid and v_task.status in ('claimed','in_progress') then raise exception using errcode='55000',message='FULFILLMENT_ALREADY_CLAIMED'; end if;
  update public.operations_tasks set status=case when status='in_progress' then 'in_progress' else 'claimed' end,claimed_by=v_uid,claimed_at=coalesce(claimed_at,now()),failure_reason=null,updated_at=now() where id=v_task.id returning * into v_task;
  update private.order_fulfillment_state_v1 set picker_user_id=v_uid,updated_at=now() where order_id=p_order_id returning * into v_state;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'claimed',v_uid,'تم استلام مهمة تجهيز الطلب');
  return jsonb_build_object('ok',true,'order_id',p_order_id,'picker_user_id',v_uid,'task_id',v_task.id,'state',v_state.fulfillment_state);
end;
$function$;
revoke all on function public.claim_order_fulfillment_v1(uuid) from public,anon;
grant execute on function public.claim_order_fulfillment_v1(uuid) to authenticated;

create or replace function public.start_order_picking_v1(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_state private.order_fulfillment_state_v1%rowtype; v_order public.online_orders%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_state from private.order_fulfillment_state_v1 where order_id=p_order_id for update;
  select * into v_order from public.online_orders where id=p_order_id for update;
  if v_state.order_id is null or v_order.id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  if not private.staff_is_super_admin(v_uid) and not public.staff_has_permission('online_orders.manage',v_state.branch_id) then raise exception using errcode='42501',message='FULFILLMENT_PERMISSION_DENIED'; end if;
  if v_state.picker_user_id is distinct from v_uid then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if v_order.status::text='confirmed' then perform private.process_online_order(p_order_id,'status','confirmed','preparing',null,null);
  elsif v_order.status::text<>'preparing' then raise exception using errcode='55000',message='ORDER_NOT_READY_FOR_PICKING'; end if;
  update private.order_fulfillment_state_v1 set fulfillment_state='picking',picking_started_at=coalesce(picking_started_at,now()),updated_at=now() where order_id=p_order_id returning * into v_state;
  update public.operations_tasks set status='in_progress',started_at=coalesce(started_at,now()),updated_at=now() where id=v_state.pick_task_id;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_state.pick_task_id,'started',v_uid,'بدأ جمع أصناف الطلب');
  return jsonb_build_object('ok',true,'order_id',p_order_id,'state','picking','started_at',v_state.picking_started_at);
end;
$function$;
revoke all on function public.start_order_picking_v1(uuid) from public,anon;
grant execute on function public.start_order_picking_v1(uuid) to authenticated;

create or replace function public.update_order_fulfillment_progress_v1(p_order_id uuid,p_items_picked integer,p_shortage_count integer default 0,p_substitution_count integer default 0,p_bags_count integer default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_state private.order_fulfillment_state_v1%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_state from private.order_fulfillment_state_v1 where order_id=p_order_id for update;
  if v_state.order_id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  if v_state.picker_user_id is distinct from v_uid and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if p_items_picked<0 or p_items_picked>v_state.items_total or p_shortage_count<0 or p_substitution_count<0 or coalesce(p_bags_count,0)<0 then raise exception using errcode='22023',message='INVALID_FULFILLMENT_PROGRESS'; end if;
  update private.order_fulfillment_state_v1 set items_picked=p_items_picked,shortage_count=p_shortage_count,substitution_count=p_substitution_count,bags_count=coalesce(p_bags_count,bags_count),issue_note=coalesce(nullif(trim(coalesce(p_note,'')),''),issue_note),updated_at=now() where order_id=p_order_id returning * into v_state;
  return jsonb_build_object('ok',true,'order_id',p_order_id,'items_total',v_state.items_total,'items_picked',v_state.items_picked,'shortage_count',v_state.shortage_count,'substitution_count',v_state.substitution_count,'bags_count',v_state.bags_count);
end;
$function$;
revoke all on function public.update_order_fulfillment_progress_v1(uuid,integer,integer,integer,integer,text) from public,anon;
grant execute on function public.update_order_fulfillment_progress_v1(uuid,integer,integer,integer,integer,text) to authenticated;

create or replace function public.start_order_packing_v1(p_order_id uuid,p_bags_count integer default 0)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_state private.order_fulfillment_state_v1%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_state from private.order_fulfillment_state_v1 where order_id=p_order_id for update;
  if v_state.order_id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  if v_state.picker_user_id is distinct from v_uid and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if p_bags_count<0 then raise exception using errcode='22023',message='INVALID_BAGS_COUNT'; end if;
  update private.order_fulfillment_state_v1 set fulfillment_state='packing',picking_completed_at=coalesce(picking_completed_at,now()),packing_started_at=coalesce(packing_started_at,now()),items_picked=greatest(items_picked,items_total-shortage_count),bags_count=greatest(bags_count,p_bags_count),updated_at=now() where order_id=p_order_id returning * into v_state;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_state.pick_task_id,'packing_started',v_uid,'بدأت تعبئة الطلب');
  return jsonb_build_object('ok',true,'order_id',p_order_id,'state','packing','bags_count',v_state.bags_count);
end;
$function$;
revoke all on function public.start_order_packing_v1(uuid,integer) from public,anon;
grant execute on function public.start_order_packing_v1(uuid,integer) to authenticated;

create or replace function public.mark_order_ready_v1(p_order_id uuid,p_bags_count integer default 1,p_note text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_state private.order_fulfillment_state_v1%rowtype; v_order public.online_orders%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_state from private.order_fulfillment_state_v1 where order_id=p_order_id for update;
  select * into v_order from public.online_orders where id=p_order_id for update;
  if v_state.order_id is null or v_order.id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  if v_state.picker_user_id is distinct from v_uid and not private.staff_is_super_admin(v_uid) then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if p_bags_count<1 then raise exception using errcode='22023',message='BAGS_REQUIRED'; end if;
  if v_order.status::text<>'preparing' then raise exception using errcode='55000',message='ORDER_NOT_IN_PREPARING'; end if;
  perform private.process_online_order(p_order_id,'status','preparing','ready',null,null);
  update private.order_fulfillment_state_v1 set fulfillment_state='ready',items_picked=greatest(items_picked,items_total-shortage_count),bags_count=p_bags_count,ready_at=coalesce(ready_at,now()),predicted_ready_at=now(),issue_note=coalesce(nullif(trim(coalesce(p_note,'')),''),issue_note),updated_at=now() where order_id=p_order_id returning * into v_state;
  update public.operations_tasks set status='completed',completed_by=v_uid,completed_at=coalesce(completed_at,now()),updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('bags_count',p_bags_count,'ready_at',now()) where id=v_state.pick_task_id;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_state.pick_task_id,'completed',v_uid,coalesce(nullif(trim(coalesce(p_note,'')),''),'الطلب جاهز لاستلام المندوب'));
  perform private.recalculate_order_eta_v1(p_order_id,'order_ready');
  return jsonb_build_object('ok',true,'order_id',p_order_id,'state','ready','ready_at',v_state.ready_at,'bags_count',v_state.bags_count);
end;
$function$;
revoke all on function public.mark_order_ready_v1(uuid,integer,text) from public,anon;
grant execute on function public.mark_order_ready_v1(uuid,integer,text) to authenticated;

create or replace function private.order_dispatch_recommendation_v1(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare
  v_order public.online_orders%rowtype;
  v_fulfill private.order_fulfillment_state_v1%rowtype;
  v_branch public.branches%rowtype;
  v_ready_at timestamptz;
  v_best record;
  v_candidates jsonb;
  v_dispatch_at timestamptz;
  v_dispatch_in integer;
  v_prep_remaining integer;
begin
  select * into v_order from public.online_orders where id=p_order_id;
  if v_order.id is null or v_order.branch_id is null or v_order.status::text in ('pending','delivered','cancelled','shipped') then return null; end if;
  select * into v_fulfill from private.order_fulfillment_state_v1 where order_id=p_order_id;
  select * into v_branch from public.branches where id=v_order.branch_id;
  v_ready_at := case when v_order.status::text='ready' then coalesce(v_fulfill.ready_at,now()) else coalesce(v_fulfill.predicted_ready_at,private.estimate_order_ready_at_v1(p_order_id)) end;
  v_prep_remaining := greatest(0,ceil(extract(epoch from (v_ready_at-now()))/60)::integer);
  with candidates as (
    select u.id,u.name,u.username,coalesce(ds.availability,'offline') availability,
      coalesce((select count(*) from private.delivery_order_assignments_v1 a where a.delivery_user_id=u.id and a.unassigned_at is null and a.delivery_state not in ('delivered','failed','return_to_branch')),0)::integer active_orders,
      ds.last_location_at,
      case when ds.last_latitude is not null and ds.last_longitude is not null and v_branch.latitude is not null and v_branch.longitude is not null then
        6371 * 2 * asin(sqrt(power(sin(radians(ds.last_latitude-v_branch.latitude)/2),2)+cos(radians(v_branch.latitude))*cos(radians(ds.last_latitude))*power(sin(radians(ds.last_longitude-v_branch.longitude)/2),2))) else null end distance_km
    from public.users u left join private.delivery_driver_status_v1 ds on ds.user_id=u.id
    where u.role='delivery' and coalesce(u.active,true) and coalesce(ds.availability,'offline') in ('available','busy')
      and (exists(select 1 from public.user_branch_roles ubr where ubr.user_id=u.id and ubr.branch_id=v_order.branch_id and ubr.active)
        or exists(select 1 from private.hr_employee_profiles ep where ep.user_id=u.id and ep.primary_branch_id=v_order.branch_id and coalesce(ep.employment_status,'active')<>'terminated'))
  ), ranked as (
    select c.*,case when c.distance_km is null then case when c.availability='available' then 6 else 10 end else greatest(1,ceil(c.distance_km/22*60)::integer) end travel_minutes,
      round((100+case when c.availability='available' then 25 else -10 end-c.active_orders*25-(case when c.distance_km is null then 12 else least(c.distance_km*4,40) end)-case when c.last_location_at is null or c.last_location_at<now()-interval '10 minutes' then 12 else 0 end)::numeric,2) score
    from candidates c
  ) select * into v_best from ranked order by score desc,travel_minutes asc,name limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('driver_id',r.id,'driver_name',r.name,'availability',r.availability,'active_orders',r.active_orders,'distance_km',case when r.distance_km is null then null else round(r.distance_km::numeric,2) end,'travel_minutes',r.travel_minutes,'score',r.score) order by r.score desc,r.travel_minutes asc),'[]'::jsonb) into v_candidates
  from (
    with candidates as (
      select u.id,u.name,coalesce(ds.availability,'offline') availability,
        coalesce((select count(*) from private.delivery_order_assignments_v1 a where a.delivery_user_id=u.id and a.unassigned_at is null and a.delivery_state not in ('delivered','failed','return_to_branch')),0)::integer active_orders,
        ds.last_location_at,
        case when ds.last_latitude is not null and ds.last_longitude is not null and v_branch.latitude is not null and v_branch.longitude is not null then 6371*2*asin(sqrt(power(sin(radians(ds.last_latitude-v_branch.latitude)/2),2)+cos(radians(v_branch.latitude))*cos(radians(ds.last_latitude))*power(sin(radians(ds.last_longitude-v_branch.longitude)/2),2))) else null end distance_km
      from public.users u left join private.delivery_driver_status_v1 ds on ds.user_id=u.id
      where u.role='delivery' and coalesce(u.active,true) and coalesce(ds.availability,'offline') in ('available','busy')
        and (exists(select 1 from public.user_branch_roles ubr where ubr.user_id=u.id and ubr.branch_id=v_order.branch_id and ubr.active)
          or exists(select 1 from private.hr_employee_profiles ep where ep.user_id=u.id and ep.primary_branch_id=v_order.branch_id and coalesce(ep.employment_status,'active')<>'terminated'))
    ) select c.*,case when c.distance_km is null then case when c.availability='available' then 6 else 10 end else greatest(1,ceil(c.distance_km/22*60)::integer) end travel_minutes,
      round((100+case when c.availability='available' then 25 else -10 end-c.active_orders*25-(case when c.distance_km is null then 12 else least(c.distance_km*4,40) end)-case when c.last_location_at is null or c.last_location_at<now()-interval '10 minutes' then 12 else 0 end)::numeric,2) score
    from candidates c order by score desc,travel_minutes asc limit 5
  ) r;
  if v_best.id is null then return jsonb_build_object('order_id',p_order_id,'predicted_ready_at',v_ready_at,'prep_remaining_minutes',v_prep_remaining,'dispatch_now',false,'reason','no_available_driver','candidates','[]'::jsonb); end if;
  v_dispatch_at := greatest(now(),v_ready_at-make_interval(mins=>v_best.travel_minutes+2));
  v_dispatch_in := greatest(0,ceil(extract(epoch from (v_dispatch_at-now()))/60)::integer);
  return jsonb_build_object('order_id',p_order_id,'predicted_ready_at',v_ready_at,'prep_remaining_minutes',v_prep_remaining,'recommended_driver',jsonb_build_object('id',v_best.id,'name',v_best.name,'availability',v_best.availability,'active_orders',v_best.active_orders,'travel_minutes',v_best.travel_minutes,'distance_km',case when v_best.distance_km is null then null else round(v_best.distance_km::numeric,2) end,'score',v_best.score),'dispatch_at',v_dispatch_at,'dispatch_in_minutes',v_dispatch_in,'dispatch_now',v_dispatch_in=0,'candidates',v_candidates,'reason',case when v_dispatch_in=0 then 'driver_should_move_now' else 'wait_for_prep_window' end);
end;
$function$;
revoke all on function private.order_dispatch_recommendation_v1(uuid) from public,anon,authenticated;

create or replace function public.get_my_order_operations_snapshot_v1(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_order public.online_orders%rowtype; v_f private.order_fulfillment_state_v1%rowtype; v_eta private.order_eta_current_v1%rowtype; v_a private.delivery_order_assignments_v1%rowtype; v_picker text; v_driver text;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_order from public.online_orders where id=p_order_id;
  if v_order.id is null then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  if not private.staff_is_super_admin(v_uid) and not public.staff_has_permission('online_orders.view',v_order.branch_id) and not public.staff_has_permission('online_orders.manage',v_order.branch_id) then raise exception using errcode='42501',message='ORDER_VIEW_DENIED'; end if;
  select * into v_f from private.order_fulfillment_state_v1 where order_id=p_order_id;
  select * into v_eta from private.order_eta_current_v1 where order_id=p_order_id;
  select * into v_a from private.delivery_order_assignments_v1 where order_id=p_order_id and unassigned_at is null order by assigned_at desc limit 1;
  select name into v_picker from public.users where id=v_f.picker_user_id;
  select name into v_driver from public.users where id=v_a.delivery_user_id;
  return jsonb_build_object('order_id',p_order_id,'order_status',v_order.status::text,'fulfillment',case when v_f.order_id is null then null else to_jsonb(v_f)||jsonb_build_object('picker_name',v_picker) end,'eta',case when v_eta.order_id is null then null else to_jsonb(v_eta)-'branch_id' end,'delivery_assignment',case when v_a.id is null then null else jsonb_build_object('id',v_a.id,'driver_id',v_a.delivery_user_id,'driver_name',v_driver,'state',v_a.delivery_state,'assigned_at',v_a.assigned_at,'accepted_at',v_a.accepted_at,'picked_up_at',v_a.picked_up_at) end,'dispatch_recommendation',case when v_a.id is null then private.order_dispatch_recommendation_v1(p_order_id) else null end);
end;
$function$;
revoke all on function public.get_my_order_operations_snapshot_v1(uuid) from public,anon;
grant execute on function public.get_my_order_operations_snapshot_v1(uuid) to authenticated;

create or replace function public.get_my_order_fulfillment_workspace_v1(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or (not private.staff_is_super_admin(v_uid) and not public.staff_has_permission('online_orders.view',p_branch_id) and not public.staff_has_permission('online_orders.manage',p_branch_id)) then raise exception using errcode='42501',message='ORDER_VIEW_DENIED'; end if;
  return jsonb_build_object('branch_id',p_branch_id,
    'summary',jsonb_build_object(
      'awaiting_confirmation',(select count(*) from private.order_fulfillment_state_v1 where branch_id=p_branch_id and fulfillment_state='awaiting_confirmation'),
      'queued',(select count(*) from private.order_fulfillment_state_v1 where branch_id=p_branch_id and fulfillment_state='queued'),
      'picking',(select count(*) from private.order_fulfillment_state_v1 where branch_id=p_branch_id and fulfillment_state='picking'),
      'packing',(select count(*) from private.order_fulfillment_state_v1 where branch_id=p_branch_id and fulfillment_state='packing'),
      'ready',(select count(*) from private.order_fulfillment_state_v1 where branch_id=p_branch_id and fulfillment_state='ready'),
      'at_risk',(select count(*) from private.order_fulfillment_state_v1 f join private.order_eta_current_v1 e on e.order_id=f.order_id where f.branch_id=p_branch_id and f.fulfillment_state not in ('completed','cancelled') and e.risk in ('at_risk','late'))
    ),
    'orders',coalesce((select jsonb_agg(jsonb_build_object(
      'order_id',o.id,'display_id','MD-'||upper(substr(replace(o.id::text,'-',''),1,6)),'order_status',o.status::text,'created_at',o.created_at,
      'customer_name',coalesce(o.customer_snapshot->>'name',c.name,'عميل'),'amount',o.total,'items_total',f.items_total,'items_picked',f.items_picked,
      'fulfillment_state',f.fulfillment_state,'picker_user_id',f.picker_user_id,'picker_name',pu.name,'predicted_ready_at',f.predicted_ready_at,'ready_at',f.ready_at,
      'bags_count',f.bags_count,'shortage_count',f.shortage_count,'substitution_count',f.substitution_count,'eta_risk',e.risk,
      'delivery_assigned',exists(select 1 from private.delivery_order_assignments_v1 a where a.order_id=o.id and a.unassigned_at is null),
      'dispatch_recommendation',case when o.status::text in ('confirmed','preparing','ready') and not exists(select 1 from private.delivery_order_assignments_v1 a where a.order_id=o.id and a.unassigned_at is null) then private.order_dispatch_recommendation_v1(o.id) else null end
    ) order by case f.fulfillment_state when 'ready' then 0 when 'packing' then 1 when 'picking' then 2 when 'queued' then 3 else 4 end,f.predicted_ready_at nulls last,o.created_at)
      from private.order_fulfillment_state_v1 f join public.online_orders o on o.id=f.order_id left join public.customers c on c.id=o.customer_id left join public.users pu on pu.id=f.picker_user_id left join private.order_eta_current_v1 e on e.order_id=o.id
      where f.branch_id=p_branch_id and o.status::text not in ('delivered','cancelled')),'[]'::jsonb)
  );
end;
$function$;
revoke all on function public.get_my_order_fulfillment_workspace_v1(uuid) from public,anon;
grant execute on function public.get_my_order_fulfillment_workspace_v1(uuid) to authenticated;

create or replace function public.assign_recommended_delivery_v1(p_order_id uuid,p_force boolean default false)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_uid uuid:=auth.uid(); v_order public.online_orders%rowtype; v_rec jsonb; v_driver uuid; v_dispatch_now boolean;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_order from public.online_orders where id=p_order_id;
  if v_order.id is null then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  if not private.staff_is_super_admin(v_uid) and not public.staff_has_permission('delivery.manage',v_order.branch_id) and not public.staff_has_permission('online_orders.manage',v_order.branch_id) then raise exception using errcode='42501',message='DISPATCH_PERMISSION_DENIED'; end if;
  if exists(select 1 from private.delivery_order_assignments_v1 where order_id=p_order_id and unassigned_at is null) then raise exception using errcode='55000',message='ORDER_ALREADY_ASSIGNED'; end if;
  v_rec := private.order_dispatch_recommendation_v1(p_order_id);
  v_driver := nullif(v_rec#>>'{recommended_driver,id}','')::uuid;
  v_dispatch_now := coalesce((v_rec->>'dispatch_now')::boolean,false);
  if v_driver is null then raise exception using errcode='55000',message='NO_DELIVERY_CANDIDATE'; end if;
  if not v_dispatch_now and not coalesce(p_force,false) then raise exception using errcode='55000',message='PREDICTIVE_DISPATCH_NOT_DUE'; end if;
  return public.set_delivery_order_assignment_v1(p_order_id,v_driver,null,'predictive_dispatch_v1')||jsonb_build_object('recommendation',v_rec);
end;
$function$;
revoke all on function public.assign_recommended_delivery_v1(uuid,boolean) from public,anon;
grant execute on function public.assign_recommended_delivery_v1(uuid,boolean) to authenticated;

do $backfill$
declare r record;
begin
  for r in select id from public.online_orders where branch_id is not null and status::text not in ('delivered','cancelled') loop
    perform private.sync_order_fulfillment_v1(r.id);
  end loop;
end
$backfill$;