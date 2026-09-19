create table if not exists private.order_group_reprice_requests_v1 (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references private.order_groups_v1(id) on delete cascade,
  cancelled_order_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'pending'
    check (status in ('pending','processing','applied','failed')),
  reason text,
  old_total numeric(14,2) not null default 0,
  new_total numeric(14,2),
  route_quote_id uuid,
  route_snapshot jsonb not null default '{}'::jsonb,
  requested_by uuid,
  applied_by uuid,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists uq_order_group_reprice_open_v1
  on private.order_group_reprice_requests_v1(group_id)
  where resolved_at is null;

create index if not exists idx_order_group_reprice_status_v1
  on private.order_group_reprice_requests_v1(status,updated_at desc);

alter table private.order_group_reprice_requests_v1 enable row level security;
revoke all on table private.order_group_reprice_requests_v1 from public, anon, authenticated;

create table if not exists private.order_group_financial_adjustments_v1 (
  id uuid primary key default gen_random_uuid(),
  reprice_request_id uuid not null unique references private.order_group_reprice_requests_v1(id) on delete cascade,
  group_id uuid not null references private.order_groups_v1(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  direction text not null check (direction in ('refund','neutral')),
  signed_amount numeric(14,2) not null check (signed_amount <= 0),
  payment_method_snapshot text,
  payment_status_snapshot text,
  group_total_before numeric(14,2) not null,
  group_total_after numeric(14,2) not null,
  settlement_state text not null
    check (settlement_state in ('not_required','applied_to_group_total','pending_refund','settled')),
  operations_task_id uuid references public.operations_tasks(id) on delete set null,
  payment_ledger_id uuid references public.payment_ledger(id) on delete set null,
  provider_reference text,
  note text,
  created_by uuid,
  settled_by uuid,
  settled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_order_group_financial_adjustments_group_v1
  on private.order_group_financial_adjustments_v1(group_id,created_at desc);

alter table private.order_group_financial_adjustments_v1 enable row level security;
revoke all on table private.order_group_financial_adjustments_v1 from public, anon, authenticated;

create or replace function private.order_group_operator_allowed_v1(
  p_group_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_hub uuid;
begin
  if p_group_id is null or p_user_id is null then return false; end if;

  select g.hub_branch_id into v_hub
  from private.order_groups_v1 g
  where g.id=p_group_id;

  if v_hub is null then return false; end if;

  if private.staff_is_super_admin(p_user_id)
     or public.staff_has_permission('online_orders.manage',v_hub)
     or public.staff_has_permission('online_orders.intake',v_hub)
     or public.staff_has_permission('delivery.manage',v_hub) then
    return true;
  end if;

  return exists(
    select 1
    from private.order_group_orders_v1 go
    where go.group_id=p_group_id
      and go.source_kind='marketplace'
      and private.my_partner_portal_role_v1(go.merchant_id) in ('owner','admin','manager','staff')
      and private.partner_member_branch_allowed_v1(go.merchant_id,p_user_id,go.branch_id)
  );
end;
$function$;

revoke all on function private.order_group_operator_allowed_v1(uuid,uuid)
  from public, anon, authenticated;

create or replace function private.request_order_group_reprice_on_cancel_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_request private.order_group_reprice_requests_v1%rowtype;
  v_group private.order_groups_v1%rowtype;
  v_task_id uuid;
  v_reason text;
begin
  if new.order_group_id is null
     or new.status::text<>'cancelled'
     or old.status::text='cancelled' then
    return new;
  end if;

  select * into v_group
  from private.order_groups_v1
  where id=new.order_group_id
  for update;

  if v_group.id is null then return new; end if;

  v_reason:=coalesce(
    nullif(current_setting('app.order_cancel_reason',true),''),
    'suborder_cancelled'
  );

  select * into v_request
  from private.order_group_reprice_requests_v1
  where group_id=v_group.id
    and resolved_at is null
  for update;

  if v_request.id is null then
    insert into private.order_group_reprice_requests_v1(
      group_id,cancelled_order_ids,status,reason,old_total,requested_by,metadata
    ) values(
      v_group.id,array[new.id]::uuid[],'pending',v_reason,
      round(coalesce(v_group.total,0),2),auth.uid(),
      jsonb_build_object(
        'trigger','suborder_cancel',
        'cancelled_at',now(),
        'cancelled_branch_id',new.branch_id,
        'cancelled_merchant_id',new.merchant_id
      )
    )
    returning * into v_request;
  else
    update private.order_group_reprice_requests_v1
    set cancelled_order_ids=(
          select array_agg(distinct x)
          from unnest(cancelled_order_ids||array[new.id]::uuid[]) x
        ),
        status='pending',
        reason=v_reason,
        requested_by=coalesce(auth.uid(),requested_by),
        last_error=null,
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'latest_cancelled_order_id',new.id,
          'latest_cancelled_at',now()
        )
    where id=v_request.id
    returning * into v_request;
  end if;

  update private.order_groups_v1
  set metadata=jsonb_set(
        coalesce(metadata,'{}'::jsonb),
        '{reprice}',
        jsonb_build_object(
          'request_id',v_request.id,
          'status','pending',
          'reason',v_reason,
          'cancelled_order_ids',to_jsonb(v_request.cancelled_order_ids),
          'updated_at',now()
        ),
        true
      ),
      updated_at=now()
  where id=v_group.id;

  insert into public.operations_tasks(
    branch_id,task_type,source_kind,source_id,order_id,priority,status,
    title,description,due_at,metadata,created_by
  ) values(
    v_group.hub_branch_id,
    'order_group_reprice',
    'order_group_reprice',
    v_request.id,
    new.id,
    'high',
    'open',
    'إعادة تسعير طلب مجمّع',
    'تم إلغاء متجر من الطلب المجمّع ويجب تثبيت المسار والإجمالي الجديد قبل الإرسال.',
    now()+interval '10 minutes',
    jsonb_build_object(
      'group_id',v_group.id,
      'cancelled_order_id',new.id,
      'reason',v_reason,
      'workflow','order_group_reprice_v1'
    ),
    auth.uid()
  )
  on conflict(task_type,source_kind,source_id) do update
  set status=case when operations_tasks.status in ('completed','cancelled') then 'open' else operations_tasks.status end,
      priority='high',
      order_id=excluded.order_id,
      due_at=excluded.due_at,
      description=excluded.description,
      metadata=excluded.metadata,
      completed_at=null,
      completed_by=null,
      updated_at=now()
  returning id into v_task_id;

  update private.order_group_reprice_requests_v1
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('operations_task_id',v_task_id),
      updated_at=now()
  where id=v_request.id;

  insert into public.delivery_realtime_signals_v1(
    branch_id,recipient_user_id,event_type,entity_id
  ) values(
    v_group.hub_branch_id,null,'group_reprice_required',v_group.id
  );

  return new;
end;
$function$;

drop trigger if exists request_order_group_reprice_on_cancel_v1 on public.online_orders;
create trigger request_order_group_reprice_on_cancel_v1
after update of status
on public.online_orders
for each row
when (
  new.order_group_id is not null
  and new.status::text='cancelled'
  and old.status::text is distinct from 'cancelled'
)
execute function private.request_order_group_reprice_on_cancel_v1();

create or replace function public.get_order_group_reprice_context_v1(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_group private.order_groups_v1%rowtype;
  v_request private.order_group_reprice_requests_v1%rowtype;
  v_address public.customer_addresses%rowtype;
  v_partner_ids uuid[];
  v_has_owned boolean:=false;
  v_active_count integer:=0;
  v_single_source_kind text;
  v_single_branch_id uuid;
  v_subtotal numeric:=0;
begin
  if v_uid is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;

  select * into v_group
  from private.order_groups_v1 g
  where g.id=p_group_id;

  if v_group.id is null then
    raise exception using errcode='P0002',message='ORDER_GROUP_NOT_FOUND';
  end if;

  if not private.order_group_operator_allowed_v1(p_group_id,v_uid) then
    raise exception using errcode='42501',message='ORDER_GROUP_OPERATION_DENIED';
  end if;

  select * into v_request
  from private.order_group_reprice_requests_v1 r
  where r.group_id=p_group_id
    and r.resolved_at is null
  order by r.created_at desc
  limit 1;

  if v_request.id is null then
    raise exception using errcode='22023',message='ORDER_GROUP_REPRICE_NOT_REQUIRED';
  end if;

  select * into v_address
  from public.customer_addresses a
  where a.id=v_group.customer_address_id;

  if v_address.id is null
     or v_address.latitude is null
     or v_address.longitude is null then
    raise exception using errcode='22023',message='DELIVERY_ADDRESS_REQUIRED';
  end if;

  select
    count(*)::integer,
    coalesce(bool_or(go.source_kind='owned'),false),
    coalesce(array_agg(go.branch_id order by go.branch_id)
      filter(where go.source_kind='marketplace'),'{}'::uuid[]),
    coalesce(sum(greatest(0,coalesce(o.total,0)-coalesce(o.shipping_cost,0))),0)
  into v_active_count,v_has_owned,v_partner_ids,v_subtotal
  from private.order_group_orders_v1 go
  join public.online_orders o on o.id=go.order_id
  where go.group_id=p_group_id
    and o.status::text<>'cancelled';

  if v_active_count=1 then
    select go.source_kind,go.branch_id
    into v_single_source_kind,v_single_branch_id
    from private.order_group_orders_v1 go
    join public.online_orders o on o.id=go.order_id
    where go.group_id=p_group_id
      and o.status::text<>'cancelled'
    order by coalesce(go.pickup_sequence,999),go.created_at
    limit 1;
  end if;

  return jsonb_build_object(
    'request_id',v_request.id,
    'group_id',v_group.id,
    'hub_branch_id',v_group.hub_branch_id,
    'active_store_count',v_active_count,
    'has_owned',v_has_owned,
    'partner_branch_ids',to_jsonb(v_partner_ids),
    'single_source_kind',v_single_source_kind,
    'single_branch_id',v_single_branch_id,
    'latitude',v_address.latitude,
    'longitude',v_address.longitude,
    'subtotal',round(v_subtotal,2),
    'old_total',v_request.old_total,
    'payment_method',v_group.payment_method,
    'payment_status',v_group.payment_status,
    'request_status',v_request.status
  );
end;
$function$;

revoke all on function public.get_order_group_reprice_context_v1(uuid) from public, anon;
grant execute on function public.get_order_group_reprice_context_v1(uuid) to authenticated;

create or replace function public.mark_order_group_reprice_failed_v1(
  p_group_id uuid,
  p_request_id uuid,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_request private.order_group_reprice_requests_v1%rowtype;
  v_task_id uuid;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not private.order_group_operator_allowed_v1(p_group_id,v_uid) then
    raise exception using errcode='42501',message='ORDER_GROUP_OPERATION_DENIED';
  end if;

  update private.order_group_reprice_requests_v1
  set status='failed',
      last_error=left(coalesce(p_error,'ORDER_GROUP_REPRICE_FAILED'),300),
      updated_at=now()
  where id=p_request_id
    and group_id=p_group_id
    and resolved_at is null
  returning * into v_request;

  if v_request.id is null then
    raise exception using errcode='22023',message='ORDER_GROUP_REPRICE_REQUEST_NOT_FOUND';
  end if;

  v_task_id:=nullif(v_request.metadata->>'operations_task_id','')::uuid;

  update private.order_groups_v1
  set metadata=jsonb_set(
    coalesce(metadata,'{}'::jsonb),
    '{reprice}',
    jsonb_build_object(
      'request_id',v_request.id,
      'status','failed',
      'error',v_request.last_error,
      'updated_at',now()
    ),
    true
  ),
  updated_at=now()
  where id=p_group_id;

  if v_task_id is not null then
    update public.operations_tasks
    set status=case when status='completed' then 'open' else status end,
        priority='critical',
        description='تعذرت إعادة تسعير الطلب المجمّع تلقائيًا ويحتاج إعادة محاولة أو تدخل مسؤول.',
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'last_error',v_request.last_error,
          'reprice_status','failed'
        ),
        updated_at=now()
    where id=v_task_id;
  end if;

  return jsonb_build_object(
    'ok',true,'request_id',v_request.id,'status','failed','error',v_request.last_error
  );
end;
$function$;

revoke all on function public.mark_order_group_reprice_failed_v1(uuid,uuid,text) from public, anon;
grant execute on function public.mark_order_group_reprice_failed_v1(uuid,uuid,text) to authenticated;

create or replace function public.apply_order_group_reprice_v1(
  p_group_id uuid,
  p_request_id uuid,
  p_route_quote_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_group private.order_groups_v1%rowtype;
  v_request private.order_group_reprice_requests_v1%rowtype;
  v_address public.customer_addresses%rowtype;
  v_active_count integer:=0;
  v_has_owned boolean:=false;
  v_partner_ids uuid[];
  v_subtotal numeric(14,2):=0;
  v_delivery jsonb:='{}'::jsonb;
  v_delivery_cost numeric(14,2):=0;
  v_customer_fee_quoted numeric(14,2):=0;
  v_customer_fee numeric(14,2):=0;
  v_merchant_subsidy numeric(14,2):=0;
  v_elmadawy_subsidy numeric(14,2):=0;
  v_discount numeric(14,2):=0;
  v_old_total numeric(14,2):=0;
  v_new_total numeric(14,2):=0;
  v_delta numeric(14,2):=0;
  v_lead_order_id uuid;
  v_payment_state text;
  v_adjustment private.order_group_financial_adjustments_v1%rowtype;
  v_task_id uuid;
  v_reprice_task_id uuid;
begin
  if v_uid is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;

  if not private.order_group_operator_allowed_v1(p_group_id,v_uid) then
    raise exception using errcode='42501',message='ORDER_GROUP_OPERATION_DENIED';
  end if;

  select * into v_group
  from private.order_groups_v1 g
  where g.id=p_group_id
  for update;

  if v_group.id is null then
    raise exception using errcode='P0002',message='ORDER_GROUP_NOT_FOUND';
  end if;

  select * into v_request
  from private.order_group_reprice_requests_v1 r
  where r.id=p_request_id
    and r.group_id=p_group_id
    and r.resolved_at is null
  for update;

  if v_request.id is null then
    select * into v_request
    from private.order_group_reprice_requests_v1 r
    where r.id=p_request_id and r.group_id=p_group_id;
    if v_request.id is not null and v_request.status='applied' then
      return jsonb_build_object(
        'ok',true,'idempotent',true,'request_id',v_request.id,
        'group_id',p_group_id,'new_total',v_request.new_total,'status','applied'
      );
    end if;
    raise exception using errcode='22023',message='ORDER_GROUP_REPRICE_REQUEST_NOT_FOUND';
  end if;

  select * into v_address
  from public.customer_addresses a
  where a.id=v_group.customer_address_id;

  if v_address.id is null
     or v_address.latitude is null
     or v_address.longitude is null then
    raise exception using errcode='22023',message='DELIVERY_ADDRESS_REQUIRED';
  end if;

  select
    count(*)::integer,
    coalesce(bool_or(go.source_kind='owned'),false),
    coalesce(array_agg(go.branch_id order by go.branch_id)
      filter(where go.source_kind='marketplace'),'{}'::uuid[]),
    coalesce(sum(greatest(0,coalesce(o.total,0)-coalesce(o.shipping_cost,0))),0)
  into v_active_count,v_has_owned,v_partner_ids,v_subtotal
  from private.order_group_orders_v1 go
  join public.online_orders o on o.id=go.order_id
  where go.group_id=p_group_id
    and o.status::text<>'cancelled';

  v_subtotal:=round(v_subtotal,2);
  v_discount:=round(coalesce(v_group.discount_total,0),2);
  v_old_total:=round(coalesce(v_group.total,0),2);

  if v_active_count=0 then
    v_delivery:='{}'::jsonb;
    v_delivery_cost:=0;
    v_customer_fee_quoted:=0;
    v_merchant_subsidy:=0;
    v_elmadawy_subsidy:=0;
  else
    if p_route_quote_id is null then
      raise exception using errcode='22023',message='ROAD_QUOTE_REQUIRED';
    end if;

    perform set_config('app.delivery_route_quote_id',p_route_quote_id::text,true);

    v_delivery:=private.quote_combined_delivery_campaign_v1(
      v_group.hub_branch_id,
      v_partner_ids,
      v_has_owned,
      v_address.latitude::double precision,
      v_address.longitude::double precision,
      v_subtotal
    );

    perform set_config('app.delivery_route_quote_id','',true);

    v_delivery_cost:=round(coalesce((v_delivery->>'delivery_cost')::numeric,0),2);
    v_customer_fee_quoted:=round(coalesce((v_delivery->>'customer_delivery_fee')::numeric,0),2);
    v_merchant_subsidy:=round(coalesce((v_delivery->>'merchant_delivery_subsidy')::numeric,0),2);
  end if;

  v_customer_fee:=least(
    v_customer_fee_quoted,
    greatest(0,v_old_total-greatest(0,v_subtotal-v_discount))
  );
  v_customer_fee:=round(greatest(0,v_customer_fee),2);
  v_elmadawy_subsidy:=round(greatest(0,v_delivery_cost-v_customer_fee-v_merchant_subsidy),2);
  v_new_total:=round(greatest(0,v_subtotal-v_discount)+v_customer_fee,2);
  v_new_total:=least(v_old_total,v_new_total);
  v_delta:=round(v_new_total-v_old_total,2);

  update private.order_group_orders_v1 go
  set delivery_fee_allocated=0,
      customer_delivery_component=0,
      merchant_delivery_contribution=case
        when o.status::text='cancelled' then 0
        else coalesce((
          select (x->>'merchant_contribution')::numeric
          from jsonb_array_elements(coalesce(v_delivery->'fee_allocations','[]'::jsonb)) x
          where x->>'branch_id'=go.branch_id::text
          limit 1
        ),0)
      end,
      elmadawy_delivery_contribution=case
        when o.status::text='cancelled' then 0
        else coalesce((
          select (x->>'elmadawy_contribution')::numeric
          from jsonb_array_elements(coalesce(v_delivery->'fee_allocations','[]'::jsonb)) x
          where x->>'branch_id'=go.branch_id::text
          limit 1
        ),0)
      end
  from public.online_orders o
  where go.group_id=p_group_id
    and o.id=go.order_id;

  select go.order_id into v_lead_order_id
  from private.order_group_orders_v1 go
  join public.online_orders o on o.id=go.order_id
  where go.group_id=p_group_id
    and o.status::text<>'cancelled'
  order by coalesce(go.pickup_sequence,999),go.created_at
  limit 1;

  update public.online_orders o
  set total=greatest(0,coalesce(o.total,0)-coalesce(o.shipping_cost,0)),
      shipping_cost=0,
      shipping_snapshot=coalesce(o.shipping_snapshot,'{}'::jsonb)||jsonb_build_object(
        'group_reprice_request_id',v_request.id,
        'group_repriced_at',now()
      ),
      updated_at=now()
  where o.order_group_id=p_group_id
    and o.status::text<>'cancelled';

  if v_lead_order_id is not null then
    update public.online_orders
    set shipping_cost=v_customer_fee,
        total=total+v_customer_fee,
        shipping_snapshot=coalesce(shipping_snapshot,'{}'::jsonb)||jsonb_build_object(
          'combined_delivery_lead',true,
          'combined_customer_delivery_fee',v_customer_fee
        ),
        updated_at=now()
    where id=v_lead_order_id;

    update private.order_group_orders_v1
    set delivery_fee_allocated=v_customer_fee
    where group_id=p_group_id
      and order_id=v_lead_order_id;
  end if;

  update private.order_groups_v1
  set subtotal=v_subtotal,
      delivery_cost=v_delivery_cost,
      customer_delivery_fee=v_customer_fee,
      merchant_delivery_subsidy=v_merchant_subsidy,
      elmadawy_delivery_subsidy=v_elmadawy_subsidy,
      total=v_new_total,
      route_distance_km=case when v_active_count=0 then null else (v_delivery->>'route_distance_km')::numeric end,
      route_duration_minutes=case when v_active_count=0 then null else (v_delivery->>'estimated_route_minutes')::integer end,
      quote_snapshot=case
        when v_active_count=0 then coalesce(quote_snapshot,'{}'::jsonb)-'delivery'
        else jsonb_set(coalesce(quote_snapshot,'{}'::jsonb),'{delivery}',v_delivery,true)
      end,
      metadata=jsonb_set(
        coalesce(metadata,'{}'::jsonb),
        '{reprice}',
        jsonb_build_object(
          'request_id',v_request.id,
          'status','applied',
          'old_total',v_old_total,
          'new_total',v_new_total,
          'signed_delta',v_delta,
          'route_quote_id',p_route_quote_id,
          'updated_at',now()
        ),
        true
      ),
      updated_at=now()
  where id=p_group_id
  returning * into v_group;

  v_payment_state:=lower(coalesce(v_group.payment_status,'pending'));

  if abs(v_delta)<0.005 then
    insert into private.order_group_financial_adjustments_v1(
      reprice_request_id,group_id,branch_id,direction,signed_amount,
      payment_method_snapshot,payment_status_snapshot,
      group_total_before,group_total_after,settlement_state,
      created_by,settled_by,settled_at,note
    ) values(
      v_request.id,p_group_id,v_group.hub_branch_id,'neutral',0,
      v_group.payment_method,v_group.payment_status,
      v_old_total,v_new_total,'not_required',
      v_uid,v_uid,now(),'لا يوجد فرق مالي بعد إعادة التسعير'
    )
    on conflict(reprice_request_id) do update
      set group_total_after=excluded.group_total_after,
          settlement_state='not_required',
          updated_at=now()
    returning * into v_adjustment;
  elsif v_payment_state='paid' then
    insert into private.order_group_financial_adjustments_v1(
      reprice_request_id,group_id,branch_id,direction,signed_amount,
      payment_method_snapshot,payment_status_snapshot,
      group_total_before,group_total_after,settlement_state,
      created_by,note,metadata
    ) values(
      v_request.id,p_group_id,v_group.hub_branch_id,'refund',v_delta,
      v_group.payment_method,v_group.payment_status,
      v_old_total,v_new_total,'pending_refund',
      v_uid,'مطلوب رد فرق إلغاء متجر من الطلب المجمّع',
      jsonb_build_object('cancelled_order_ids',to_jsonb(v_request.cancelled_order_ids))
    )
    on conflict(reprice_request_id) do update
      set signed_amount=excluded.signed_amount,
          group_total_after=excluded.group_total_after,
          settlement_state='pending_refund',
          updated_at=now()
    returning * into v_adjustment;

    insert into public.operations_tasks(
      branch_id,task_type,source_kind,source_id,order_id,payment_method_code,amount,
      priority,status,title,description,due_at,metadata,created_by
    ) values(
      v_group.hub_branch_id,'financial_review','order_group_financial_adjustment',
      v_adjustment.id,v_lead_order_id,v_group.payment_method,abs(v_delta),
      'high','open','رد فرق طلب مجمّع',
      'تم إلغاء متجر من الطلب المجمّع بعد الدفع ويجب رد فرق القيمة للعميل.',
      now()+interval '30 minutes',
      jsonb_build_object(
        'group_id',p_group_id,
        'reprice_request_id',v_request.id,
        'signed_amount',v_delta,
        'group_total_before',v_old_total,
        'group_total_after',v_new_total
      ),
      v_uid
    )
    on conflict(task_type,source_kind,source_id) do update
      set amount=excluded.amount,
          status=case when operations_tasks.status='completed' then 'open' else operations_tasks.status end,
          metadata=excluded.metadata,
          updated_at=now()
    returning id into v_task_id;

    update private.order_group_financial_adjustments_v1
    set operations_task_id=v_task_id,updated_at=now()
    where id=v_adjustment.id;
  else
    insert into private.order_group_financial_adjustments_v1(
      reprice_request_id,group_id,branch_id,direction,signed_amount,
      payment_method_snapshot,payment_status_snapshot,
      group_total_before,group_total_after,settlement_state,
      created_by,settled_by,settled_at,note
    ) values(
      v_request.id,p_group_id,v_group.hub_branch_id,'refund',v_delta,
      v_group.payment_method,v_group.payment_status,
      v_old_total,v_new_total,'applied_to_group_total',
      v_uid,v_uid,now(),'تم خفض إجمالي الطلب قبل التحصيل'
    )
    on conflict(reprice_request_id) do update
      set signed_amount=excluded.signed_amount,
          group_total_after=excluded.group_total_after,
          settlement_state='applied_to_group_total',
          settled_by=v_uid,
          settled_at=now(),
          updated_at=now()
    returning * into v_adjustment;
  end if;

  v_reprice_task_id:=nullif(v_request.metadata->>'operations_task_id','')::uuid;

  if v_reprice_task_id is not null then
    update public.operations_tasks
    set status='completed',
        claimed_by=coalesce(claimed_by,v_uid),
        claimed_at=coalesce(claimed_at,now()),
        started_at=coalesce(started_at,now()),
        completed_by=v_uid,
        completed_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'decision','repriced',
          'group_total_before',v_old_total,
          'group_total_after',v_new_total,
          'route_quote_id',p_route_quote_id
        ),
        updated_at=now()
    where id=v_reprice_task_id;
  end if;

  update private.order_group_reprice_requests_v1
  set status='applied',
      new_total=v_new_total,
      route_quote_id=p_route_quote_id,
      route_snapshot=v_delivery,
      applied_by=v_uid,
      last_error=null,
      updated_at=now(),
      resolved_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'signed_delta',v_delta,
        'financial_adjustment_id',v_adjustment.id
      )
  where id=v_request.id
  returning * into v_request;

  perform private.refresh_order_group_operations_v1(p_group_id);

  if (select status from private.order_groups_v1 where id=p_group_id)='ready' then
    insert into public.delivery_realtime_signals_v1(
      branch_id,recipient_user_id,event_type,entity_id
    ) values(v_group.hub_branch_id,null,'group_dispatch_ready',p_group_id);
  end if;

  return jsonb_build_object(
    'ok',true,
    'request_id',v_request.id,
    'group_id',p_group_id,
    'active_store_count',v_active_count,
    'old_total',v_old_total,
    'new_total',v_new_total,
    'signed_delta',v_delta,
    'customer_delivery_fee',v_customer_fee,
    'delivery_cost',v_delivery_cost,
    'route_quote_id',p_route_quote_id,
    'financial_adjustment_id',v_adjustment.id,
    'financial_state',v_adjustment.settlement_state,
    'status','applied'
  );
exception when others then
  perform set_config('app.delivery_route_quote_id','',true);
  raise;
end;
$function$;

revoke all on function public.apply_order_group_reprice_v1(uuid,uuid,uuid) from public, anon;
grant execute on function public.apply_order_group_reprice_v1(uuid,uuid,uuid) to authenticated;

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

      if exists(
        select 1
        from private.order_group_reprice_requests_v1 r
        where r.group_id=new.order_group_id
          and r.resolved_at is null
      ) then
        return new;
      end if;

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
