-- M15a — substitution policy + inventory-reservation safety.
create table if not exists private.order_substitution_preferences_v1 (
  order_id uuid primary key references public.online_orders(id) on delete cascade,
  policy text not null check (policy in ('allow_substitutions','contact_me','remove_item')),
  customer_user_id uuid,
  snapshot_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
alter table private.order_substitution_preferences_v1 enable row level security;
revoke all on private.order_substitution_preferences_v1 from public, anon, authenticated;

create table if not exists private.product_substitution_rules_v1 (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete cascade,
  original_product_id uuid not null references public.products(id) on delete cascade,
  replacement_product_id uuid not null references public.products(id) on delete cascade,
  replacement_variant_id uuid references public.product_variants(id) on delete cascade,
  priority integer not null default 100 check (priority between 1 and 1000),
  active boolean not null default true,
  note text,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (original_product_id <> replacement_product_id or replacement_variant_id is not null)
);
alter table private.product_substitution_rules_v1 enable row level security;
revoke all on private.product_substitution_rules_v1 from public, anon, authenticated;

create unique index if not exists product_substitution_rules_unique_v1_idx
on private.product_substitution_rules_v1(
  coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid),
  original_product_id,replacement_product_id,
  coalesce(replacement_variant_id,'00000000-0000-0000-0000-000000000000'::uuid)
);
create index if not exists product_substitution_rules_lookup_v1_idx
on private.product_substitution_rules_v1(original_product_id,branch_id,active,priority);

alter table private.order_fulfillment_substitutions_v1
  add column if not exists approval_mode text not null default 'manager',
  add column if not exists resolution_source text,
  add column if not exists customer_resolved_by uuid,
  add column if not exists customer_decision_due_at timestamptz,
  add column if not exists replacement_inventory_state text not null default 'pending',
  add column if not exists replacement_inventory_consumed_at timestamptz,
  add column if not exists replacement_inventory_restocked_at timestamptz;

alter table private.order_fulfillment_substitutions_v1
  drop constraint if exists order_fulfillment_substitutions_v1_approval_mode_check;
alter table private.order_fulfillment_substitutions_v1
  add constraint order_fulfillment_substitutions_v1_approval_mode_check
  check (approval_mode in ('manager','customer','auto'));

alter table private.order_fulfillment_substitutions_v1
  drop constraint if exists order_fulfillment_substitutions_v1_resolution_source_check;
alter table private.order_fulfillment_substitutions_v1
  add constraint order_fulfillment_substitutions_v1_resolution_source_check
  check (resolution_source is null or resolution_source in ('manager','customer','auto','picker_cancelled'));

alter table private.order_fulfillment_substitutions_v1
  drop constraint if exists order_fulfillment_substitutions_v1_replacement_inventory_state_check;
alter table private.order_fulfillment_substitutions_v1
  add constraint order_fulfillment_substitutions_v1_replacement_inventory_state_check
  check (replacement_inventory_state in ('pending','consumed','restocked'));

create index if not exists order_substitutions_customer_pending_v2_idx
on private.order_fulfillment_substitutions_v1(order_id,customer_decision_due_at)
where status='pending' and approval_mode='customer';

CREATE OR REPLACE FUNCTION private.order_substitution_policy_v1(p_order_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    (select p.policy from private.order_substitution_preferences_v1 p where p.order_id=p_order_id),
    'manager'::text
  );
$function$;

CREATE OR REPLACE FUNCTION private.set_order_substitution_preference_v1(p_order_id uuid, p_policy text, p_customer_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_policy not in ('allow_substitutions','contact_me','remove_item') then
    raise exception using errcode='22023',message='INVALID_SUBSTITUTION_POLICY';
  end if;
  if not exists(select 1 from public.online_orders o where o.id=p_order_id) then
    raise exception using errcode='22023',message='ORDER_NOT_FOUND';
  end if;
  insert into private.order_substitution_preferences_v1(order_id,policy,customer_user_id,snapshot_at)
  values(p_order_id,p_policy,p_customer_user_id,now())
  on conflict(order_id) do update set
    policy=excluded.policy,
    customer_user_id=coalesce(private.order_substitution_preferences_v1.customer_user_id,excluded.customer_user_id),
    metadata=private.order_substitution_preferences_v1.metadata||jsonb_build_object('last_seen_at',now());
end;
$function$;

CREATE OR REPLACE FUNCTION private.fulfillment_item_stock_units_v1(p_item_id uuid, p_order_quantity numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_i private.order_fulfillment_items_v1%rowtype;
  v_snapshot jsonb;
  v_order_qty numeric;
  v_stock_qty numeric;
  v_factor numeric;
begin
  select * into v_i from private.order_fulfillment_items_v1 where id=p_item_id;
  if v_i.id is null then raise exception using errcode='22023',message='PICKING_ITEM_NOT_FOUND'; end if;
  if p_order_quantity is null or p_order_quantity<=0 then
    raise exception using errcode='22023',message='INVALID_RESERVATION_RELEASE_QUANTITY';
  end if;
  v_snapshot:=coalesce(v_i.metadata->'snapshot','{}'::jsonb);
  v_order_qty:=nullif(v_snapshot->>'quantity','')::numeric;
  v_stock_qty:=nullif(v_snapshot->>'stock_quantity','')::numeric;
  if v_order_qty is not null and v_order_qty>0 and v_stock_qty is not null and v_stock_qty>0 then
    v_factor:=v_stock_qty/v_order_qty;
  elsif v_i.is_bulk then
    v_factor:=greatest(coalesce(v_i.bulk_quantity,1),0.001);
  else
    v_factor:=1;
  end if;
  return round(p_order_quantity*v_factor,3);
end;
$function$;

CREATE OR REPLACE FUNCTION private.release_order_inventory_reservation_quantity_v1(p_order_id uuid, p_product_id uuid, p_stock_quantity numeric, p_reason text DEFAULT 'fulfillment_resolution'::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r private.inventory_reservations_v1%rowtype;
  v_left numeric:=round(coalesce(p_stock_quantity,0),3);
  v_release numeric;
  v_balance numeric;
  v_released numeric:=0;
  v_version smallint;
  v_prev_partial numeric;
begin
  if p_order_id is null or p_product_id is null or v_left<=0 then
    raise exception using errcode='22023',message='INVALID_RESERVATION_RELEASE_QUANTITY';
  end if;
  select coalesce(o.inventory_reservation_version,0) into v_version
  from public.online_orders o where o.id=p_order_id;
  if coalesce(v_version,0)<>1 then return 0; end if;

  for r in
    select * from private.inventory_reservations_v1
    where order_id=p_order_id and product_id=p_product_id and state='reserved'
    order by reserved_at,id for update
  loop
    exit when v_left<=0.0005;
    select b.reserved_quantity into v_balance
    from private.inventory_reservation_balances_v1 b
    where b.branch_id=r.branch_id and b.product_id=r.product_id for update;
    if coalesce(v_balance,0)<=0 then
      raise exception using errcode='55000',message='RESERVATION_BALANCE_CORRUPT',detail=p_product_id::text;
    end if;
    v_release:=least(r.quantity,v_left,coalesce(v_balance,0));
    update private.inventory_reservation_balances_v1
    set reserved_quantity=greatest(0,reserved_quantity-v_release),updated_at=now()
    where branch_id=r.branch_id and product_id=r.product_id;

    v_prev_partial:=coalesce(nullif(r.metadata->>'partial_released_quantity','')::numeric,0);
    if r.quantity-v_release<=0.0005 then
      update private.inventory_reservations_v1
      set state='released',released_at=now(),
          release_reason=coalesce(nullif(p_reason,''),'fulfillment_resolution'),
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
            'original_reserved_quantity',coalesce(nullif(metadata->>'original_reserved_quantity','')::numeric,r.quantity),
            'partial_released_quantity',v_prev_partial+v_release,
            'last_partial_release_reason',p_reason
          )
      where id=r.id;
    else
      update private.inventory_reservations_v1
      set quantity=round(quantity-v_release,3),
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
            'original_reserved_quantity',coalesce(nullif(metadata->>'original_reserved_quantity','')::numeric,r.quantity),
            'partial_released_quantity',v_prev_partial+v_release,
            'last_partial_release_reason',p_reason
          )
      where id=r.id;
    end if;
    v_left:=round(v_left-v_release,3);
    v_released:=v_released+v_release;
  end loop;

  if v_left>0.0005 then
    raise exception using errcode='55000',message='RESERVATION_RELEASE_SHORTFALL',
      detail=jsonb_build_object('order_id',p_order_id,'product_id',p_product_id,'required',p_stock_quantity,'released',v_released)::text;
  end if;
  return round(v_released,3);
end;
$function$;

CREATE OR REPLACE FUNCTION private.restock_order_substitution_inventory_v1(p_order_id uuid, p_reason text DEFAULT 'order_cancelled'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r private.order_fulfillment_substitutions_v1%rowtype;
  v_inventory_branch uuid;
  v_count integer:=0;
  v_total numeric:=0;
begin
  for r in
    select * from private.order_fulfillment_substitutions_v1
    where order_id=p_order_id and status='approved' and replacement_inventory_state='consumed'
    order by id for update
  loop
    select s.inventory_branch_id into v_inventory_branch
    from private.resolve_branch_sources(r.branch_id) s;
    perform set_config('app.inventory_movement_source','order_substitution_cancel_restock',true);
    perform set_config('app.inventory_reason_code',coalesce(nullif(p_reason,''),'order_cancelled'),true);
    perform set_config('app.inventory_note','Restock substitution for order '||p_order_id::text,true);
    update public.inventory
    set quantity=quantity+r.stock_units_required,updated_at=now()
    where branch_id=v_inventory_branch and product_id=r.replacement_product_id;
    if not found then
      raise exception using errcode='55000',message='SUBSTITUTION_STOCK_ROW_MISSING',detail=r.replacement_product_id::text;
    end if;
    update private.order_fulfillment_substitutions_v1
    set replacement_inventory_state='restocked',replacement_inventory_restocked_at=now(),updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('inventory_restock_reason',p_reason)
    where id=r.id;
    v_count:=v_count+1; v_total:=v_total+r.stock_units_required;
  end loop;
  return jsonb_build_object('order_id',p_order_id,'restocked_substitutions',v_count,'stock_units',v_total);
end;
$function$;

revoke execute on function private.order_substitution_policy_v1(uuid) from public,anon,authenticated;
revoke execute on function private.set_order_substitution_preference_v1(uuid,text,uuid) from public,anon,authenticated;
revoke execute on function private.fulfillment_item_stock_units_v1(uuid,numeric) from public,anon,authenticated;
revoke execute on function private.release_order_inventory_reservation_quantity_v1(uuid,uuid,numeric,text) from public,anon,authenticated;
revoke execute on function private.restock_order_substitution_inventory_v1(uuid,text) from public,anon,authenticated;
