create table if not exists private.order_staging_locations_v1 (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  code text not null,
  label text not null,
  zone text not null check (zone in ('ambient','chilled','frozen')),
  capacity_bags integer not null default 20 check (capacity_bags between 1 and 500),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(branch_id,code)
);

create table if not exists private.order_fulfillment_bags_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.online_orders(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  bag_no integer not null check (bag_no between 1 and 50),
  bag_code text not null unique,
  zone text not null check (zone in ('ambient','chilled','frozen')),
  status text not null default 'created' check (status in ('created','staged','handed_over','cancelled')),
  staging_location_id uuid references private.order_staging_locations_v1(id) on delete set null,
  packed_by uuid references public.users(id) on delete set null,
  packed_at timestamptz,
  staged_by uuid references public.users(id) on delete set null,
  staged_at timestamptz,
  handed_over_by uuid references public.users(id) on delete set null,
  handed_over_to uuid references public.users(id) on delete set null,
  handed_over_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(order_id,bag_no)
);

create index if not exists order_staging_locations_branch_zone_idx on private.order_staging_locations_v1(branch_id,zone,active,sort_order);
create index if not exists order_fulfillment_bags_order_status_idx on private.order_fulfillment_bags_v1(order_id,status,bag_no);
create index if not exists order_fulfillment_bags_location_status_idx on private.order_fulfillment_bags_v1(staging_location_id,status);

revoke all on private.order_staging_locations_v1 from anon,authenticated;
revoke all on private.order_fulfillment_bags_v1 from anon,authenticated;

insert into private.order_staging_locations_v1(branch_id,code,label,zone,capacity_bags,sort_order)
select b.id,v.code,v.label,v.zone,v.capacity_bags,v.sort_order
from public.branches b
cross join (values
  ('A-01','رف الطلبات A-01','ambient',40,10),
  ('C-01','ثلاجة الطلبات C-01','chilled',20,20),
  ('F-01','فريزر الطلبات F-01','frozen',20,30)
) as v(code,label,zone,capacity_bags,sort_order)
where coalesce(b.active,true)
on conflict(branch_id,code) do nothing;

create or replace function private.order_staging_summary_v1(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select jsonb_build_object(
    'total_bags',count(*) filter(where b.status<>'cancelled'),
    'created_bags',count(*) filter(where b.status='created'),
    'staged_bags',count(*) filter(where b.status='staged'),
    'handed_over_bags',count(*) filter(where b.status='handed_over'),
    'ready_to_finalize',count(*) filter(where b.status<>'cancelled')>0
      and count(*) filter(where b.status='staged')=count(*) filter(where b.status<>'cancelled')
  )
  from private.order_fulfillment_bags_v1 b
  where b.order_id=p_order_id;
$function$;

create or replace function public.get_my_order_staging_session_v1(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_order public.online_orders%rowtype;
  v_state private.order_fulfillment_state_v1%rowtype;
  v_bags jsonb;
  v_locations jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_order from public.online_orders where id=p_order_id;
  select * into v_state from private.order_fulfillment_state_v1 where order_id=p_order_id;
  if v_order.id is null or v_state.order_id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('online_orders.prepare',v_state.branch_id)
     and not public.staff_has_permission('online_orders.manage',v_state.branch_id)
     and not public.staff_has_permission('online_orders.view',v_state.branch_id) then
    raise exception using errcode='42501',message='STAGING_VIEW_DENIED';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'bag_no',b.bag_no,'bag_code',b.bag_code,'zone',b.zone,'status',b.status,
    'location_id',l.id,'location_code',l.code,'location_label',l.label,
    'packed_at',b.packed_at,'staged_at',b.staged_at,'handed_over_at',b.handed_over_at
  ) order by b.bag_no),'[]'::jsonb)
  into v_bags
  from private.order_fulfillment_bags_v1 b
  left join private.order_staging_locations_v1 l on l.id=b.staging_location_id
  where b.order_id=p_order_id and b.status<>'cancelled';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',l.id,'code',l.code,'label',l.label,'zone',l.zone,'capacity_bags',l.capacity_bags,
    'occupied_bags',(select count(*) from private.order_fulfillment_bags_v1 b where b.staging_location_id=l.id and b.status='staged'),
    'available_bags',greatest(0,l.capacity_bags-(select count(*) from private.order_fulfillment_bags_v1 b where b.staging_location_id=l.id and b.status='staged'))
  ) order by l.sort_order,l.code),'[]'::jsonb)
  into v_locations
  from private.order_staging_locations_v1 l
  where l.branch_id=v_state.branch_id and l.active;

  return jsonb_build_object(
    'order_id',p_order_id,'branch_id',v_state.branch_id,'fulfillment_state',v_state.fulfillment_state,
    'picker_user_id',v_state.picker_user_id,'summary',private.order_staging_summary_v1(p_order_id),
    'bags',v_bags,'locations',v_locations
  );
end;
$function$;

create or replace function public.prepare_order_staging_bags_v1(p_order_id uuid,p_bags jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_state private.order_fulfillment_state_v1%rowtype;
  v_count integer;
  v_existing_locked integer;
  v_index integer:=0;
  v_entry jsonb;
  v_zone text;
  v_code text;
  v_is_manager boolean:=false;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_state from private.order_fulfillment_state_v1 where order_id=p_order_id for update;
  if v_state.order_id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  v_is_manager:=private.staff_is_super_admin(v_uid) or public.staff_has_permission('online_orders.manage',v_state.branch_id);
  if not private.fulfillment_actor_allowed_v1(v_uid,v_state.branch_id) then raise exception using errcode='42501',message='FULFILLMENT_PERMISSION_DENIED'; end if;
  if v_state.picker_user_id is distinct from v_uid and not v_is_manager then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if v_state.fulfillment_state<>'packing' then raise exception using errcode='55000',message='ORDER_NOT_IN_PACKING'; end if;
  if p_bags is null or jsonb_typeof(p_bags)<>'array' then raise exception using errcode='22023',message='INVALID_BAG_PLAN'; end if;
  v_count:=jsonb_array_length(p_bags);
  if v_count<1 or v_count>30 then raise exception using errcode='22023',message='INVALID_BAG_COUNT'; end if;
  if exists(select 1 from jsonb_array_elements(p_bags) e where lower(coalesce(nullif(trim(e->>'zone'),''),'ambient')) not in ('ambient','chilled','frozen')) then
    raise exception using errcode='22023',message='INVALID_BAG_ZONE';
  end if;

  select count(*)::integer into v_existing_locked from private.order_fulfillment_bags_v1 where order_id=p_order_id and status in ('staged','handed_over');
  if v_existing_locked>0 then raise exception using errcode='55000',message='STAGING_BAGS_LOCKED'; end if;
  delete from private.order_fulfillment_bags_v1 where order_id=p_order_id and status in ('created','cancelled');

  for v_entry in select value from jsonb_array_elements(p_bags) loop
    v_index:=v_index+1;
    v_zone:=lower(coalesce(nullif(trim(v_entry->>'zone'),''),'ambient'));
    v_code:='MD-'||upper(substr(replace(p_order_id::text,'-',''),1,12))||'-B'||lpad(v_index::text,2,'0');
    insert into private.order_fulfillment_bags_v1(order_id,branch_id,bag_no,bag_code,zone,status,packed_by,packed_at,metadata)
    values(p_order_id,v_state.branch_id,v_index,v_code,v_zone,'created',v_uid,now(),jsonb_build_object('source','packing','prepared_by',v_uid));
  end loop;

  update private.order_fulfillment_state_v1 set bags_count=v_count,updated_at=now() where order_id=p_order_id;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_state.pick_task_id,'bags_prepared',v_uid,'تم تجهيز '||v_count||' كيس للتسكين');
  insert into public.order_operations_realtime_signals_v1(branch_id,order_id,event_type) values(v_state.branch_id,p_order_id,'staging_bags_prepared');
  return public.get_my_order_staging_session_v1(p_order_id);
end;
$function$;

create or replace function public.stage_order_bag_v1(p_order_id uuid,p_bag_code text,p_location_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_state private.order_fulfillment_state_v1%rowtype;
  v_bag private.order_fulfillment_bags_v1%rowtype;
  v_location private.order_staging_locations_v1%rowtype;
  v_occupied integer:=0;
  v_is_manager boolean:=false;
  v_bag_code text:=upper(trim(coalesce(p_bag_code,'')));
  v_location_code text:=upper(trim(coalesce(p_location_code,'')));
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_state from private.order_fulfillment_state_v1 where order_id=p_order_id for update;
  if v_state.order_id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  v_is_manager:=private.staff_is_super_admin(v_uid) or public.staff_has_permission('online_orders.manage',v_state.branch_id);
  if not private.fulfillment_actor_allowed_v1(v_uid,v_state.branch_id) then raise exception using errcode='42501',message='FULFILLMENT_PERMISSION_DENIED'; end if;
  if v_state.picker_user_id is distinct from v_uid and not v_is_manager then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if v_state.fulfillment_state<>'packing' then raise exception using errcode='55000',message='ORDER_NOT_IN_PACKING'; end if;
  if v_bag_code='' or v_location_code='' then raise exception using errcode='22023',message='BAG_AND_LOCATION_REQUIRED'; end if;

  select * into v_bag from private.order_fulfillment_bags_v1 where order_id=p_order_id and upper(bag_code)=v_bag_code for update;
  if v_bag.id is null or v_bag.status='cancelled' then raise exception using errcode='22023',message='BAG_NOT_FOUND'; end if;
  if v_bag.status='handed_over' then raise exception using errcode='55000',message='BAG_ALREADY_HANDED_OVER'; end if;
  select * into v_location from private.order_staging_locations_v1 where branch_id=v_state.branch_id and upper(code)=v_location_code and active for update;
  if v_location.id is null then raise exception using errcode='22023',message='STAGING_LOCATION_NOT_FOUND'; end if;
  if v_location.zone<>v_bag.zone then raise exception using errcode='22023',message='STAGING_ZONE_MISMATCH'; end if;

  if v_bag.status='staged' and v_bag.staging_location_id=v_location.id then
    return public.get_my_order_staging_session_v1(p_order_id)||jsonb_build_object('idempotent',true);
  end if;
  select count(*)::integer into v_occupied from private.order_fulfillment_bags_v1 b where b.staging_location_id=v_location.id and b.status='staged' and b.id<>v_bag.id;
  if v_occupied>=v_location.capacity_bags then raise exception using errcode='55000',message='STAGING_LOCATION_FULL'; end if;

  update private.order_fulfillment_bags_v1 set status='staged',staging_location_id=v_location.id,staged_by=v_uid,staged_at=now(),updated_at=now() where id=v_bag.id;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_state.pick_task_id,'bag_staged',v_uid,v_bag.bag_code||' → '||v_location.code);
  insert into public.order_operations_realtime_signals_v1(branch_id,order_id,event_type) values(v_state.branch_id,p_order_id,'bag_staged');
  return public.get_my_order_staging_session_v1(p_order_id)||jsonb_build_object('idempotent',false);
end;
$function$;

create or replace function public.unstage_order_bag_v1(p_order_id uuid,p_bag_code text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_state private.order_fulfillment_state_v1%rowtype;
  v_bag private.order_fulfillment_bags_v1%rowtype;
  v_is_manager boolean:=false;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_state from private.order_fulfillment_state_v1 where order_id=p_order_id for update;
  if v_state.order_id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  v_is_manager:=private.staff_is_super_admin(v_uid) or public.staff_has_permission('online_orders.manage',v_state.branch_id);
  if not private.fulfillment_actor_allowed_v1(v_uid,v_state.branch_id) then raise exception using errcode='42501',message='FULFILLMENT_PERMISSION_DENIED'; end if;
  if v_state.picker_user_id is distinct from v_uid and not v_is_manager then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if v_state.fulfillment_state<>'packing' then raise exception using errcode='55000',message='ORDER_NOT_IN_PACKING'; end if;
  select * into v_bag from private.order_fulfillment_bags_v1 where order_id=p_order_id and upper(bag_code)=upper(trim(coalesce(p_bag_code,''))) for update;
  if v_bag.id is null then raise exception using errcode='22023',message='BAG_NOT_FOUND'; end if;
  if v_bag.status='handed_over' then raise exception using errcode='55000',message='BAG_ALREADY_HANDED_OVER'; end if;
  update private.order_fulfillment_bags_v1 set status='created',staging_location_id=null,staged_by=null,staged_at=null,updated_at=now() where id=v_bag.id;
  insert into public.order_operations_realtime_signals_v1(branch_id,order_id,event_type) values(v_state.branch_id,p_order_id,'bag_unstaged');
  return public.get_my_order_staging_session_v1(p_order_id);
end;
$function$;

create or replace function public.finalize_order_staging_v1(p_order_id uuid,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_state private.order_fulfillment_state_v1%rowtype;
  v_order public.online_orders%rowtype;
  v_total integer:=0;
  v_staged integer:=0;
  v_is_manager boolean:=false;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_state from private.order_fulfillment_state_v1 where order_id=p_order_id for update;
  select * into v_order from public.online_orders where id=p_order_id for update;
  if v_state.order_id is null or v_order.id is null then raise exception using errcode='22023',message='FULFILLMENT_NOT_FOUND'; end if;
  v_is_manager:=private.staff_is_super_admin(v_uid) or public.staff_has_permission('online_orders.manage',v_state.branch_id);
  if not private.fulfillment_actor_allowed_v1(v_uid,v_state.branch_id) then raise exception using errcode='42501',message='FULFILLMENT_PERMISSION_DENIED'; end if;
  if v_state.picker_user_id is distinct from v_uid and not v_is_manager then raise exception using errcode='42501',message='FULFILLMENT_NOT_OWNER'; end if;
  if v_state.fulfillment_state='ready' and v_order.status::text='ready' then
    return public.get_my_order_staging_session_v1(p_order_id)||jsonb_build_object('ok',true,'idempotent',true,'state','ready');
  end if;
  if v_state.fulfillment_state<>'packing' or v_order.status::text<>'preparing' then raise exception using errcode='55000',message='ORDER_NOT_IN_PACKING'; end if;

  select count(*) filter(where status<>'cancelled')::integer,count(*) filter(where status='staged')::integer into v_total,v_staged from private.order_fulfillment_bags_v1 where order_id=p_order_id;
  if v_total<1 then raise exception using errcode='55000',message='STAGING_BAGS_REQUIRED'; end if;
  if v_staged<>v_total then raise exception using errcode='55000',message='STAGING_INCOMPLETE'; end if;

  if v_is_manager then perform private.process_online_order(p_order_id,'status','preparing','ready',null,null);
  else update public.online_orders set status='ready'::public.order_status,updated_at=now() where id=p_order_id;
  end if;

  update private.order_fulfillment_state_v1
    set fulfillment_state='ready',items_picked=greatest(items_picked,items_total-shortage_count),bags_count=v_total,
        ready_at=coalesce(ready_at,now()),predicted_ready_at=now(),issue_note=coalesce(nullif(trim(coalesce(p_note,'')),''),issue_note),updated_at=now()
  where order_id=p_order_id returning * into v_state;

  update public.operations_tasks
    set status='completed',completed_by=v_uid,completed_at=coalesce(completed_at,now()),updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('bags_count',v_total,'ready_at',now(),'staging_complete',true)
  where id=v_state.pick_task_id and status<>'completed';
  insert into public.operations_task_events(task_id,event_type,actor_id,note)
  values(v_state.pick_task_id,'staging_completed',v_uid,coalesce(nullif(trim(coalesce(p_note,'')),''),'كل الأكياس تم تسكينها والطلب جاهز للمندوب'));
  perform private.recalculate_order_eta_v1(p_order_id,'order_ready');
  insert into public.order_operations_realtime_signals_v1(branch_id,order_id,event_type) values(v_state.branch_id,p_order_id,'order_staged_ready');
  return public.get_my_order_staging_session_v1(p_order_id)||jsonb_build_object('ok',true,'idempotent',false,'state','ready','ready_at',v_state.ready_at);
end;
$function$;

create or replace function public.mark_order_ready_v1(p_order_id uuid,p_bags_count integer default 1,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_total integer:=0;
begin
  select count(*) filter(where status<>'cancelled')::integer into v_total from private.order_fulfillment_bags_v1 where order_id=p_order_id;
  if v_total<1 then raise exception using errcode='55000',message='STAGING_BAGS_REQUIRED'; end if;
  if p_bags_count is distinct from v_total then raise exception using errcode='22023',message='BAGS_COUNT_MISMATCH'; end if;
  return public.finalize_order_staging_v1(p_order_id,p_note);
end;
$function$;

create or replace function public.get_my_order_operations_snapshot_v1(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_order public.online_orders%rowtype;
  v_f private.order_fulfillment_state_v1%rowtype;
  v_eta private.order_eta_current_v1%rowtype;
  v_a private.delivery_order_assignments_v1%rowtype;
  v_s private.order_picker_assignment_shadow_v1%rowtype;
  v_picker text;
  v_driver text;
  v_shadow_name text;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_order from public.online_orders where id=p_order_id;
  if v_order.id is null then raise exception using errcode='22023',message='ORDER_NOT_FOUND'; end if;
  if not private.staff_is_super_admin(v_uid) and not public.staff_has_permission('online_orders.view',v_order.branch_id) and not public.staff_has_permission('online_orders.manage',v_order.branch_id) then raise exception using errcode='42501',message='ORDER_VIEW_DENIED'; end if;
  select * into v_f from private.order_fulfillment_state_v1 where order_id=p_order_id;
  select * into v_eta from private.order_eta_current_v1 where order_id=p_order_id;
  select * into v_a from private.delivery_order_assignments_v1 where order_id=p_order_id and unassigned_at is null order by assigned_at desc limit 1;
  select * into v_s from private.order_picker_assignment_shadow_v1 where order_id=p_order_id;
  select name into v_picker from public.users where id=v_f.picker_user_id;
  select name into v_driver from public.users where id=v_a.delivery_user_id;
  select name into v_shadow_name from public.users where id=v_s.recommended_user_id;
  return jsonb_build_object(
    'order_id',p_order_id,'order_status',v_order.status::text,
    'fulfillment',case when v_f.order_id is null then null else to_jsonb(v_f)||jsonb_build_object('picker_name',v_picker) end,
    'staging',private.order_staging_summary_v1(p_order_id),
    'picker_shadow',case when v_s.order_id is null then null else jsonb_build_object('recommended_user_id',v_s.recommended_user_id,'recommended_name',v_shadow_name,'score',v_s.recommended_score,'reason',v_s.reason,'generated_at',v_s.generated_at,'outcome',v_s.outcome) end,
    'eta',case when v_eta.order_id is null then null else to_jsonb(v_eta)-'branch_id' end,
    'delivery_assignment',case when v_a.id is null then null else jsonb_build_object('id',v_a.id,'driver_id',v_a.delivery_user_id,'driver_name',v_driver,'state',v_a.delivery_state,'assigned_at',v_a.assigned_at,'accepted_at',v_a.accepted_at,'arrived_branch_at',v_a.arrived_branch_at,'handover_at',v_a.handover_at,'rider_wait_seconds',v_a.rider_wait_seconds,'picked_up_at',v_a.picked_up_at) end,
    'dispatch_recommendation',case when v_a.id is null then private.order_dispatch_recommendation_v1(p_order_id) else null end
  );
end;
$function$;

grant execute on function public.get_my_order_staging_session_v1(uuid) to authenticated;
grant execute on function public.prepare_order_staging_bags_v1(uuid,jsonb) to authenticated;
grant execute on function public.stage_order_bag_v1(uuid,text,text) to authenticated;
grant execute on function public.unstage_order_bag_v1(uuid,text) to authenticated;
grant execute on function public.finalize_order_staging_v1(uuid,text) to authenticated;
grant execute on function public.mark_order_ready_v1(uuid,integer,text) to authenticated;
revoke all on function private.order_staging_summary_v1(uuid) from public,anon,authenticated;

comment on table private.order_staging_locations_v1 is 'Branch staging slots for ambient, chilled, and frozen online-order bags.';
comment on table private.order_fulfillment_bags_v1 is 'Physical bag-level fulfillment ledger used to prevent ready/handoff before every bag is staged.';
comment on function public.finalize_order_staging_v1(uuid,text) is 'Marks an order ready only after every active bag is staged in a compatible branch location.';
