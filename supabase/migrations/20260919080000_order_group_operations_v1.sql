create table if not exists private.order_group_operation_events_v1 (
  id bigint generated always as identity primary key,
  group_id uuid not null references private.order_groups_v1(id) on delete cascade,
  order_id uuid not null references public.online_orders(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  merchant_id uuid not null references public.merchants(id),
  source_kind text not null check (source_kind in ('owned','marketplace')),
  event_type text not null,
  from_status text,
  to_status text,
  actor_user_id uuid,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_group_operation_events_group_created_v1
  on private.order_group_operation_events_v1(group_id,created_at desc);
create index if not exists idx_order_group_operation_events_order_created_v1
  on private.order_group_operation_events_v1(order_id,created_at desc);

alter table private.order_group_operation_events_v1 enable row level security;
revoke all on table private.order_group_operation_events_v1 from public, anon, authenticated;

create or replace function private.refresh_order_group_operations_v1(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_total integer:=0;
  v_pending integer:=0;
  v_confirmed integer:=0;
  v_preparing integer:=0;
  v_ready integer:=0;
  v_shipped integer:=0;
  v_delivered integer:=0;
  v_cancelled integer:=0;
  v_active integer:=0;
  v_group_status text:='pending';
  v_summary jsonb;
begin
  if p_group_id is null then return '{}'::jsonb; end if;

  if not exists(select 1 from private.order_groups_v1 g where g.id=p_group_id) then
    return '{}'::jsonb;
  end if;

  select
    count(*)::integer,
    count(*) filter(where o.status::text='pending')::integer,
    count(*) filter(where o.status::text='confirmed')::integer,
    count(*) filter(where o.status::text='preparing')::integer,
    count(*) filter(where o.status::text='ready')::integer,
    count(*) filter(where o.status::text='shipped')::integer,
    count(*) filter(where o.status::text='delivered')::integer,
    count(*) filter(where o.status::text='cancelled')::integer
  into v_total,v_pending,v_confirmed,v_preparing,v_ready,v_shipped,v_delivered,v_cancelled
  from private.order_group_orders_v1 go
  join public.online_orders o on o.id=go.order_id
  where go.group_id=p_group_id;

  v_active:=greatest(v_total-v_cancelled,0);

  if v_total=0 then
    v_group_status:='pending';
  elsif v_active=0 then
    v_group_status:='cancelled';
  elsif v_delivered=v_active then
    v_group_status:='delivered';
  elsif (v_shipped+v_delivered)>0 then
    v_group_status:='shipped';
  elsif (v_ready+v_shipped+v_delivered)=v_active then
    v_group_status:='ready';
  elsif (v_preparing+v_ready+v_shipped+v_delivered)>0 then
    v_group_status:='preparing';
  elsif v_pending=0 then
    v_group_status:='confirmed';
  else
    v_group_status:='pending';
  end if;

  v_summary:=jsonb_build_object(
    'status',v_group_status,
    'stores_total',v_total,
    'stores_active',v_active,
    'pending',v_pending,
    'confirmed',v_confirmed,
    'preparing',v_preparing,
    'ready',v_ready,
    'shipped',v_shipped,
    'delivered',v_delivered,
    'cancelled',v_cancelled,
    'all_active_ready',v_active>0 and (v_ready+v_shipped+v_delivered)=v_active,
    'partially_cancelled',v_cancelled>0 and v_active>0,
    'updated_at',now()
  );

  update private.order_groups_v1
  set status=v_group_status,
      metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),'{operations}',v_summary,true),
      updated_at=now()
  where id=p_group_id;

  return v_summary;
end;
$function$;

revoke all on function private.refresh_order_group_operations_v1(uuid) from public, anon, authenticated;

create or replace function private.canonicalize_order_group_member_status_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_status text;
begin
  select o.status::text into v_status
  from public.online_orders o
  where o.id=new.order_id;

  if v_status is null then
    raise exception using errcode='P0002',message='ORDER_GROUP_MEMBER_ORDER_NOT_FOUND';
  end if;

  new.status:=v_status;
  return new;
end;
$function$;

drop trigger if exists canonicalize_order_group_member_status_v1 on private.order_group_orders_v1;
create trigger canonicalize_order_group_member_status_v1
before insert or update of order_id
on private.order_group_orders_v1
for each row execute function private.canonicalize_order_group_member_status_v1();

create or replace function private.refresh_order_group_member_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_group_id uuid:=coalesce(new.group_id,old.group_id);
begin
  if tg_op='INSERT' then
    insert into private.order_group_operation_events_v1(
      group_id,order_id,branch_id,merchant_id,source_kind,event_type,to_status,actor_user_id,metadata
    ) values(
      new.group_id,new.order_id,new.branch_id,new.merchant_id,new.source_kind,
      'suborder_attached',new.status,auth.uid(),
      jsonb_build_object('pickup_sequence',new.pickup_sequence)
    );
  end if;

  perform private.refresh_order_group_operations_v1(v_group_id);
  return coalesce(new,old);
end;
$function$;

drop trigger if exists refresh_order_group_member_v1 on private.order_group_orders_v1;
create trigger refresh_order_group_member_v1
after insert or update of status or delete
on private.order_group_orders_v1
for each row execute function private.refresh_order_group_member_trigger_v1();

create or replace function private.sync_order_group_child_status_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_group_id uuid:=coalesce(new.order_group_id,old.order_group_id);
  v_source_kind text;
  v_branch uuid;
  v_merchant uuid;
  v_updated integer:=0;
begin
  if v_group_id is null then return new; end if;

  update private.order_group_orders_v1 go
  set status=new.status::text
  where go.group_id=v_group_id
    and go.order_id=new.id;
  get diagnostics v_updated=row_count;

  if v_updated>0 and (
    tg_op='INSERT'
    or new.status is distinct from old.status
    or new.order_group_id is distinct from old.order_group_id
  ) then
    select go.source_kind,go.branch_id,go.merchant_id
    into v_source_kind,v_branch,v_merchant
    from private.order_group_orders_v1 go
    where go.group_id=v_group_id and go.order_id=new.id;

    insert into private.order_group_operation_events_v1(
      group_id,order_id,branch_id,merchant_id,source_kind,event_type,
      from_status,to_status,actor_user_id,metadata
    ) values(
      v_group_id,new.id,v_branch,v_merchant,v_source_kind,'suborder_status_changed',
      case when tg_op='UPDATE' then old.status::text else null end,
      new.status::text,auth.uid(),
      jsonb_build_object('source_channel',new.source_channel,'payment_status',new.payment_status::text)
    );
  end if;

  perform private.refresh_order_group_operations_v1(v_group_id);
  return new;
end;
$function$;

drop trigger if exists sync_order_group_child_status_v1 on public.online_orders;
create trigger sync_order_group_child_status_v1
after insert or update of status,order_group_id
on public.online_orders
for each row execute function private.sync_order_group_child_status_v1();

create or replace function private.auto_confirm_online_order_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_method text:=lower(trim(coalesce(new.payment_method,'cash')));
  v_payment text:=new.payment_status::text;
begin
  if new.status::text <> 'pending' or new.branch_id is null then
    return new;
  end if;

  if coalesce(new.source_channel,'')='marketplace' then
    return new;
  end if;

  if not (
    (v_method in ('cash','كاش','cod','cash_on_delivery') and v_payment in ('pending','paid'))
    or v_payment='paid'
  ) then
    return new;
  end if;

  perform set_config('app.checkout_auto_confirm_write',new.id::text,true);

  update public.online_orders
  set status='confirmed'::public.order_status,
      updated_at=now()
  where id=new.id
    and status::text='pending';

  perform set_config('app.checkout_auto_confirm_write','',true);
  return new;
exception when others then
  perform set_config('app.checkout_auto_confirm_write','',true);
  raise;
end;
$function$;

create or replace function private.auto_dispatch_ready_order_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_summary jsonb;
  v_hub_branch uuid;
begin
  if new.status::text='ready' and old.status::text is distinct from 'ready' then
    if new.order_group_id is not null then
      v_summary:=private.refresh_order_group_operations_v1(new.order_group_id);

      if coalesce(v_summary->>'status','')='ready' then
        select g.hub_branch_id into v_hub_branch
        from private.order_groups_v1 g
        where g.id=new.order_group_id;

        if v_hub_branch is not null then
          insert into public.delivery_realtime_signals_v1(
            branch_id,recipient_user_id,event_type,entity_id
          )
          values(v_hub_branch,null,'group_dispatch_ready',new.order_group_id);
        end if;
      end if;

      return new;
    end if;

    begin
      perform private.auto_assign_ready_delivery_order_v1(new.id,auth.uid());
    exception when others then
      insert into public.delivery_realtime_signals_v1(branch_id,recipient_user_id,event_type,entity_id)
      values(new.branch_id,null,'dispatch_needed',new.id);
    end;
  end if;
  return new;
end;
$function$;

create or replace function public.get_customer_order_group_operations_v1(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_customer_id uuid;
  v_group private.order_groups_v1%rowtype;
  v_stores jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;

  select c.id into v_customer_id
  from public.customers c
  where c.user_id=auth.uid()
  order by c.created_at desc
  limit 1;

  select * into v_group
  from private.order_groups_v1 g
  where g.id=p_group_id
    and g.customer_id=v_customer_id;

  if v_group.id is null then
    raise exception using errcode='P0002',message='ORDER_GROUP_NOT_FOUND';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id',go.order_id,
    'source_kind',go.source_kind,
    'branch_id',go.branch_id,
    'branch_name',b.name,
    'merchant_id',go.merchant_id,
    'merchant_name',m.name,
    'pickup_sequence',go.pickup_sequence,
    'status',o.status::text,
    'fulfillment_state',f.fulfillment_state,
    'predicted_ready_at',f.predicted_ready_at,
    'ready_at',f.ready_at,
    'updated_at',o.updated_at
  ) order by coalesce(go.pickup_sequence,999),go.created_at),'[]'::jsonb)
  into v_stores
  from private.order_group_orders_v1 go
  join public.online_orders o on o.id=go.order_id
  join public.branches b on b.id=go.branch_id
  join public.merchants m on m.id=go.merchant_id
  left join private.order_fulfillment_state_v1 f on f.order_id=go.order_id
  where go.group_id=p_group_id;

  return jsonb_build_object(
    'group_id',v_group.id,
    'status',v_group.status,
    'stores_count',v_group.stores_count,
    'partner_stores_count',v_group.partner_stores_count,
    'route_distance_km',v_group.route_distance_km,
    'route_duration_minutes',v_group.route_duration_minutes,
    'operations',coalesce(v_group.metadata->'operations','{}'::jsonb),
    'stores',v_stores,
    'updated_at',v_group.updated_at
  );
end;
$function$;

revoke all on function public.get_customer_order_group_operations_v1(uuid) from public, anon;
grant execute on function public.get_customer_order_group_operations_v1(uuid) to authenticated;

update private.order_group_orders_v1 go
set status=o.status::text
from public.online_orders o
where o.id=go.order_id
  and go.status is distinct from o.status::text;

do $$
declare r record;
begin
  for r in select id from private.order_groups_v1 loop
    perform private.refresh_order_group_operations_v1(r.id);
  end loop;
end $$;
