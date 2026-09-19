-- M17a — immutable delivery proof ledger + persistent PIN-attempt lockout v2.

create table if not exists private.delivery_order_delivery_proofs_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.online_orders(id) on delete restrict,
  assignment_id uuid not null references private.delivery_order_assignments_v1(id) on delete restrict,
  event_id uuid not null unique references private.delivery_order_events_v1(id) on delete restrict,
  order_group_id uuid references private.order_groups_v1(id) on delete restrict,
  route_id uuid references private.delivery_routes_v1(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  driver_user_id uuid not null references public.users(id) on delete restrict,
  verification_order_id uuid not null references public.online_orders(id) on delete restrict,
  verification_method text not null check (verification_method in ('pin','group_lead_pin')),
  pin_verified boolean not null default false,
  pin_consumed_at timestamptz,
  delivered_at timestamptz not null,
  latitude double precision,
  longitude double precision,
  accuracy_m numeric,
  dropoff_latitude double precision,
  dropoff_longitude double precision,
  distance_to_dropoff_m numeric,
  location_status text not null check (location_status in ('verified','low_accuracy','far_from_dropoff','missing')),
  payment_method_snapshot text,
  payment_status_snapshot text,
  order_total_snapshot numeric(14,2),
  collected_amount numeric(14,2) not null default 0,
  payment_reference text,
  proof_source text not null default 'delivery_event_v1',
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table private.delivery_order_delivery_proofs_v1 enable row level security;
revoke all on private.delivery_order_delivery_proofs_v1 from public,anon,authenticated;

create index if not exists delivery_order_proofs_branch_delivered_v1_idx
on private.delivery_order_delivery_proofs_v1(branch_id,delivered_at desc);

create index if not exists delivery_order_proofs_driver_delivered_v1_idx
on private.delivery_order_delivery_proofs_v1(driver_user_id,delivered_at desc);

CREATE OR REPLACE FUNCTION private.capture_delivery_order_proof_event_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.event_type='deliver' and new.to_state='delivered' then
    perform private.capture_delivery_order_proof_from_event_v1(new.id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.capture_delivery_order_proof_from_event_v1(p_event_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_event private.delivery_order_events_v1%rowtype;
  v_order public.online_orders%rowtype;
  v_assignment private.delivery_order_assignments_v1%rowtype;
  v_pin private.delivery_order_pins_v1%rowtype;
  v_proof_id uuid;
  v_verification_order uuid;
  v_route_id uuid;
  v_drop_lat double precision;
  v_drop_lng double precision;
  v_distance_m numeric;
  v_location_status text;
  v_reference text;
  v_group_collection numeric:=0;
begin
  select * into v_event
  from private.delivery_order_events_v1
  where id=p_event_id;

  if v_event.id is null or v_event.event_type<>'deliver' or v_event.to_state<>'delivered' then
    return null;
  end if;

  select id into v_proof_id
  from private.delivery_order_delivery_proofs_v1
  where event_id=v_event.id or order_id=v_event.order_id
  limit 1;
  if v_proof_id is not null then return v_proof_id; end if;

  select * into v_order
  from public.online_orders
  where id=v_event.order_id;
  if v_order.id is null then
    raise exception using errcode='55000',message='DELIVERY_PROOF_ORDER_MISSING';
  end if;

  select * into v_assignment
  from private.delivery_order_assignments_v1
  where id=v_event.assignment_id;
  if v_assignment.id is null or v_assignment.delivered_at is null then
    raise exception using errcode='55000',message='DELIVERY_PROOF_ASSIGNMENT_MISSING';
  end if;

  v_verification_order:=v_order.id;

  if v_order.order_group_id is not null then
    select go.order_id
    into v_verification_order
    from private.order_group_orders_v1 go
    where go.group_id=v_order.order_group_id
    order by (go.delivery_fee_allocated>0) desc,
             coalesce(go.pickup_sequence,999),
             go.created_at
    limit 1;

    select r.id into v_route_id
    from private.delivery_routes_v1 r
    where r.order_group_id=v_order.order_group_id
    order by r.created_at desc
    limit 1;
  end if;

  v_verification_order:=coalesce(v_verification_order,v_order.id);

  select * into v_pin
  from private.delivery_order_pins_v1
  where order_id=v_verification_order;

  if coalesce(v_order.shipping_snapshot->>'latitude','') ~ '^-?[0-9]+([.][0-9]+)?$' then
    v_drop_lat:=(v_order.shipping_snapshot->>'latitude')::double precision;
  end if;
  if coalesce(v_order.shipping_snapshot->>'longitude','') ~ '^-?[0-9]+([.][0-9]+)?$' then
    v_drop_lng:=(v_order.shipping_snapshot->>'longitude')::double precision;
  end if;

  if v_event.latitude is not null and v_event.longitude is not null
     and v_drop_lat is not null and v_drop_lng is not null then
    v_distance_m:=6371000*2*asin(sqrt(
      power(sin(radians(v_event.latitude-v_drop_lat)/2),2)
      +cos(radians(v_drop_lat))*cos(radians(v_event.latitude))
      *power(sin(radians(v_event.longitude-v_drop_lng)/2),2)
    ));
  end if;

  v_location_status:=case
    when v_event.latitude is null or v_event.longitude is null then 'missing'
    when v_event.accuracy_m is null or v_event.accuracy_m>250 then 'low_accuracy'
    when v_distance_m is not null and v_distance_m>500 then 'far_from_dropoff'
    else 'verified'
  end;

  select l.reference,l.amount
  into v_reference,v_group_collection
  from private.delivery_cash_ledger_v1 l
  where l.order_id=v_verification_order
    and l.driver_user_id=v_event.driver_user_id
    and l.entry_type='collection'
  order by l.created_at desc
  limit 1;

  insert into private.delivery_order_delivery_proofs_v1(
    order_id,assignment_id,event_id,order_group_id,route_id,branch_id,
    driver_user_id,verification_order_id,verification_method,pin_verified,pin_consumed_at,
    delivered_at,latitude,longitude,accuracy_m,dropoff_latitude,dropoff_longitude,
    distance_to_dropoff_m,location_status,payment_method_snapshot,payment_status_snapshot,
    order_total_snapshot,collected_amount,payment_reference,proof_source,note,metadata
  ) values(
    v_order.id,v_assignment.id,v_event.id,v_order.order_group_id,v_route_id,v_assignment.branch_id,
    v_event.driver_user_id,v_verification_order,
    case when v_order.order_group_id is null then 'pin' else 'group_lead_pin' end,
    (v_pin.order_id is not null and v_pin.consumed_at is not null),
    v_pin.consumed_at,
    coalesce(v_assignment.delivered_at,v_event.created_at),
    v_event.latitude,v_event.longitude,v_event.accuracy_m,
    v_drop_lat,v_drop_lng,round(v_distance_m,1),v_location_status,
    v_order.payment_method,v_order.payment_status::text,round(coalesce(v_order.total,0),2),
    coalesce(v_assignment.cash_collected,0),v_reference,'delivery_event_v1',
    v_event.note,
    jsonb_build_object(
      'event_type',v_event.event_type,
      'from_state',v_event.from_state,
      'to_state',v_event.to_state,
      'event_metadata',coalesce(v_event.metadata,'{}'::jsonb),
      'group_collection_amount',coalesce(v_group_collection,0),
      'pin_failed_attempts_snapshot',coalesce(v_pin.failed_attempts,0),
      'proof_version',1
    )
  )
  on conflict(order_id) do nothing
  returning id into v_proof_id;

  if v_proof_id is null then
    select id into v_proof_id
    from private.delivery_order_delivery_proofs_v1
    where order_id=v_order.id;
  end if;

  return v_proof_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.delivery_pin_attempt_v2(p_order_id uuid, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pin private.delivery_order_pins_v1%rowtype;
  v_attempts integer;
  v_locked_until timestamptz;
begin
  select * into v_pin
  from private.delivery_order_pins_v1
  where order_id=p_order_id
  for update;

  if v_pin.order_id is null or v_pin.consumed_at is not null or v_pin.expires_at<now() then
    return jsonb_build_object('ok',false,'code','delivery_pin_unavailable');
  end if;

  if v_pin.locked_until is not null and v_pin.locked_until>now() then
    return jsonb_build_object(
      'ok',false,'code','delivery_pin_locked',
      'failed_attempts',v_pin.failed_attempts,
      'locked_until',v_pin.locked_until
    );
  end if;

  if coalesce(trim(p_pin),'')<>v_pin.pin_code then
    v_attempts:=v_pin.failed_attempts+1;
    v_locked_until:=case when v_attempts>=5 then now()+interval '15 minutes' else null end;

    update private.delivery_order_pins_v1
    set failed_attempts=v_attempts,
        locked_until=v_locked_until,
        updated_at=now()
    where order_id=p_order_id;

    return jsonb_build_object(
      'ok',false,
      'code',case when v_locked_until is null then 'delivery_pin_invalid' else 'delivery_pin_locked' end,
      'failed_attempts',v_attempts,
      'attempts_remaining',greatest(0,5-v_attempts),
      'locked_until',v_locked_until
    );
  end if;

  update private.delivery_order_pins_v1
  set failed_attempts=0,locked_until=null,updated_at=now()
  where order_id=p_order_id;

  return jsonb_build_object('ok',true,'code','delivery_pin_valid');
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_delivery_order_proof_immutable_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  raise exception using errcode='55000',message='DELIVERY_PROOF_IMMUTABLE';
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_order_delivery_proof_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_p private.delivery_order_delivery_proofs_v1%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists(
    select 1 from public.online_orders o
    join public.customers c on c.id=o.customer_id
    where o.id=p_order_id and c.user_id=v_uid
  ) then raise exception 'order_access_denied'; end if;

  select * into v_p
  from private.delivery_order_delivery_proofs_v1
  where order_id=p_order_id;

  if v_p.id is null then return null; end if;

  return jsonb_build_object(
    'order_id',v_p.order_id,
    'delivered_at',v_p.delivered_at,
    'verification_method',v_p.verification_method,
    'pin_verified',v_p.pin_verified,
    'location_status',v_p.location_status,
    'distance_to_dropoff_m',v_p.distance_to_dropoff_m,
    'payment_method',v_p.payment_method_snapshot,
    'payment_status',v_p.payment_status_snapshot,
    'collected_amount',v_p.collected_amount,
    'proof_source',v_p.proof_source
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_order_delivery_proof_v1(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_p private.delivery_order_delivery_proofs_v1%rowtype;
  v_driver_name text;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;

  select * into v_p
  from private.delivery_order_delivery_proofs_v1
  where order_id=p_order_id;

  if v_p.id is null then return null; end if;

  if not (
    private.staff_is_super_admin(v_uid)
    or public.staff_has_permission('online_orders.view',v_p.branch_id)
    or public.staff_has_permission('online_orders.manage',v_p.branch_id)
    or public.staff_has_permission('delivery.manage',v_p.branch_id)
  ) then raise exception using errcode='42501',message='DELIVERY_PROOF_ACCESS_DENIED'; end if;

  select u.name into v_driver_name from public.users u where u.id=v_p.driver_user_id;

  return jsonb_build_object(
    'id',v_p.id,
    'order_id',v_p.order_id,
    'assignment_id',v_p.assignment_id,
    'event_id',v_p.event_id,
    'order_group_id',v_p.order_group_id,
    'route_id',v_p.route_id,
    'branch_id',v_p.branch_id,
    'driver_name',v_driver_name,
    'verification_order_id',v_p.verification_order_id,
    'verification_method',v_p.verification_method,
    'pin_verified',v_p.pin_verified,
    'pin_consumed_at',v_p.pin_consumed_at,
    'delivered_at',v_p.delivered_at,
    'latitude',v_p.latitude,
    'longitude',v_p.longitude,
    'accuracy_m',v_p.accuracy_m,
    'distance_to_dropoff_m',v_p.distance_to_dropoff_m,
    'location_status',v_p.location_status,
    'payment_method',v_p.payment_method_snapshot,
    'payment_status',v_p.payment_status_snapshot,
    'order_total',v_p.order_total_snapshot,
    'collected_amount',v_p.collected_amount,
    'payment_reference',v_p.payment_reference,
    'proof_source',v_p.proof_source,
    'note',v_p.note,
    'created_at',v_p.created_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.transition_my_delivery_order_v2(p_order_id uuid, p_action text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_accuracy_m numeric DEFAULT NULL::numeric, p_pin text DEFAULT NULL::text, p_collected_amount numeric DEFAULT NULL::numeric, p_payment_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_assignment private.delivery_order_assignments_v1%rowtype;
  v_check jsonb;
begin
  if lower(trim(coalesce(p_action,'')))<>'deliver' then
    return public.transition_my_delivery_order_v1(
      p_order_id,p_action,p_latitude,p_longitude,p_accuracy_m,p_pin,
      p_collected_amount,p_payment_reference,p_note
    );
  end if;

  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists(
    select 1 from public.users u
    where u.id=v_uid and u.role='delivery' and coalesce(u.active,true)
  ) then raise exception 'delivery_access_required'; end if;

  select * into v_assignment
  from private.delivery_order_assignments_v1
  where order_id=p_order_id and delivery_user_id=v_uid and unassigned_at is null
  for update;

  if v_assignment.id is null then raise exception 'delivery_assignment_not_found'; end if;
  if v_assignment.delivery_state<>'arrived' then raise exception 'invalid_delivery_transition'; end if;

  v_check:=private.delivery_pin_attempt_v2(p_order_id,p_pin);
  if not coalesce((v_check->>'ok')::boolean,false) then
    return v_check||jsonb_build_object(
      'order_id',p_order_id,
      'delivery_state',v_assignment.delivery_state
    );
  end if;

  return public.transition_my_delivery_order_v1(
    p_order_id,p_action,p_latitude,p_longitude,p_accuracy_m,p_pin,
    p_collected_amount,p_payment_reference,p_note
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.transition_my_delivery_route_v2(p_order_id uuid, p_action text, p_stop_id uuid DEFAULT NULL::uuid, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_accuracy_m numeric DEFAULT NULL::numeric, p_pin text DEFAULT NULL::text, p_collected_amount numeric DEFAULT NULL::numeric, p_payment_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_order public.online_orders%rowtype;
  v_route private.delivery_routes_v1%rowtype;
  v_verification_order uuid;
  v_check jsonb;
begin
  if lower(trim(coalesce(p_action,'')))<>'deliver' then
    return public.transition_my_delivery_route_v1(
      p_order_id,p_action,p_stop_id,p_latitude,p_longitude,p_accuracy_m,p_pin,
      p_collected_amount,p_payment_reference,p_note
    );
  end if;

  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists(
    select 1 from public.users u
    where u.id=v_uid and u.role='delivery' and coalesce(u.active,true)
  ) then raise exception 'delivery_access_required'; end if;

  select * into v_order from public.online_orders where id=p_order_id;
  if v_order.id is null then raise exception 'order_not_found'; end if;

  if v_order.order_group_id is null then
    return public.transition_my_delivery_order_v2(
      p_order_id,p_action,p_latitude,p_longitude,p_accuracy_m,p_pin,
      p_collected_amount,p_payment_reference,p_note
    );
  end if;

  select * into v_route
  from private.delivery_routes_v1
  where order_group_id=v_order.order_group_id
  for update;

  if v_route.id is null or v_route.assigned_driver_id is distinct from v_uid then
    raise exception 'delivery_assignment_not_found';
  end if;
  if v_route.status<>'arrived' then raise exception 'invalid_delivery_transition'; end if;

  select go.order_id into v_verification_order
  from private.order_group_orders_v1 go
  where go.group_id=v_order.order_group_id
  order by (go.delivery_fee_allocated>0) desc,
           coalesce(go.pickup_sequence,999),
           go.created_at
  limit 1;

  v_check:=private.delivery_pin_attempt_v2(v_verification_order,p_pin);
  if not coalesce((v_check->>'ok')::boolean,false) then
    return v_check||jsonb_build_object(
      'order_id',p_order_id,
      'order_group_id',v_order.order_group_id,
      'route_id',v_route.id,
      'delivery_state',v_route.status,
      'verification_order_id',v_verification_order
    );
  end if;

  return public.transition_my_delivery_route_v1(
    p_order_id,p_action,p_stop_id,p_latitude,p_longitude,p_accuracy_m,p_pin,
    p_collected_amount,p_payment_reference,p_note
  );
end;
$function$;

drop trigger if exists delivery_order_proof_immutable_v1
on private.delivery_order_delivery_proofs_v1;
create trigger delivery_order_proof_immutable_v1
before update or delete on private.delivery_order_delivery_proofs_v1
for each row execute function private.guard_delivery_order_proof_immutable_v1();

drop trigger if exists capture_delivery_order_proof_event_v1
on private.delivery_order_events_v1;
create trigger capture_delivery_order_proof_event_v1
after insert on private.delivery_order_events_v1
for each row execute function private.capture_delivery_order_proof_event_v1();

revoke execute on function private.guard_delivery_order_proof_immutable_v1() from public,anon,authenticated;
revoke execute on function private.capture_delivery_order_proof_from_event_v1(uuid) from public,anon,authenticated;
revoke execute on function private.capture_delivery_order_proof_event_v1() from public,anon,authenticated;
revoke execute on function private.delivery_pin_attempt_v2(uuid,text) from public,anon,authenticated;

revoke all on function public.transition_my_delivery_order_v2(uuid,text,double precision,double precision,numeric,text,numeric,text,text) from public;
revoke all on function public.transition_my_delivery_route_v2(uuid,text,uuid,double precision,double precision,numeric,text,numeric,text,text) from public;
revoke all on function public.get_my_order_delivery_proof_v1(uuid) from public;
revoke all on function public.get_order_delivery_proof_v1(uuid) from public;

grant execute on function public.transition_my_delivery_order_v2(uuid,text,double precision,double precision,numeric,text,numeric,text,text) to authenticated;
grant execute on function public.transition_my_delivery_route_v2(uuid,text,uuid,double precision,double precision,numeric,text,numeric,text,text) to authenticated;
grant execute on function public.get_my_order_delivery_proof_v1(uuid) to authenticated;
grant execute on function public.get_order_delivery_proof_v1(uuid) to authenticated;

do $$
declare r record;
begin
  for r in
    select id from private.delivery_order_events_v1
    where event_type='deliver' and to_state='delivered'
    order by created_at,id
  loop
    perform private.capture_delivery_order_proof_from_event_v1(r.id);
  end loop;
end $$;
