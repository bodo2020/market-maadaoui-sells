-- A separate, auditable exception for deliveries completed outside the driver app.
-- Cash collection and combined orders have separate ledgers and are deliberately
-- excluded until their handover/reconciliation flows can be recorded atomically.
create table private.manual_order_deliveries_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.online_orders(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  recorded_by uuid not null references public.users(id) on delete restrict,
  delivery_method text not null check (delivery_method in ('staff','partner','external','customer_pickup')),
  handler_name text not null check (length(btrim(handler_name)) between 2 and 120),
  recipient_name text not null check (length(btrim(recipient_name)) between 2 and 120),
  confirmation_reference text not null check (length(btrim(confirmation_reference)) between 3 and 120),
  note text check (note is null or length(note) <= 500),
  payment_method_snapshot text not null,
  payment_status_snapshot text not null,
  delivered_at timestamptz not null default now()
);

alter table private.manual_order_deliveries_v1 enable row level security;
revoke all on private.manual_order_deliveries_v1 from public, anon, authenticated;
create index manual_order_deliveries_v1_branch_time_idx
  on private.manual_order_deliveries_v1(branch_id, delivered_at desc);

create function public.get_manual_order_delivery_v1(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $function$
declare
  v_order public.online_orders%rowtype;
  v_proof private.manual_order_deliveries_v1%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_order from public.online_orders where id = p_order_id;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.branch_id is null or not (
    private.staff_is_super_admin(auth.uid())
    or public.staff_has_permission('online_orders.manage', v_order.branch_id)
    or public.staff_has_permission('delivery.manage', v_order.branch_id)
  ) then raise exception 'permission_denied'; end if;
  select * into v_proof from private.manual_order_deliveries_v1 where order_id = p_order_id;
  return jsonb_build_object(
    'order_status', v_order.status::text,
    'payment_status', v_order.payment_status,
    'payment_method', v_order.payment_method,
    'combined_order', v_order.order_group_id is not null,
    'assigned_driver', nullif(btrim(v_order.delivery_person), '') is not null or exists (
      select 1 from private.delivery_order_assignments_v1 a
      where a.order_id = p_order_id and a.unassigned_at is null
    ),
    'proof', case when v_proof.id is null then null else jsonb_build_object(
      'method', v_proof.delivery_method,
      'handler_name', v_proof.handler_name,
      'recipient_name', v_proof.recipient_name,
      'confirmation_reference', v_proof.confirmation_reference,
      'recorded_by', v_proof.recorded_by,
      'delivered_at', v_proof.delivered_at
    ) end
  );
end;
$function$;

create function public.complete_order_without_driver_v1(
  p_order_id uuid,
  p_delivery_method text,
  p_handler_name text,
  p_recipient_name text,
  p_confirmation_reference text,
  p_note text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_order public.online_orders%rowtype;
  v_proof private.manual_order_deliveries_v1%rowtype;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  select * into v_order from public.online_orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.branch_id is null or not (
    private.staff_is_super_admin(auth.uid())
    or public.staff_has_permission('online_orders.manage', v_order.branch_id)
  ) then raise exception 'permission_denied'; end if;

  select * into v_proof from private.manual_order_deliveries_v1 where order_id = p_order_id;
  if v_proof.id is not null then
    if v_order.status::text = 'delivered' then
      return jsonb_build_object('order_id', p_order_id, 'idempotent', true);
    end if;
    raise exception 'delivery_proof_conflict';
  end if;

  if v_order.status::text <> 'shipped' then raise exception 'order_not_shipped'; end if;
  if v_order.order_group_id is not null then raise exception 'combined_order_requires_route'; end if;
  if nullif(btrim(v_order.delivery_person), '') is not null or exists (
    select 1 from private.delivery_order_assignments_v1 a
    where a.order_id = p_order_id and a.unassigned_at is null
  ) then raise exception 'driver_already_assigned'; end if;
  if v_order.payment_status::text is distinct from 'paid'
     or v_order.payment_method is null
     or v_order.payment_method::text = 'cash' then
    raise exception 'payment_reconciliation_required';
  end if;
  if p_delivery_method is null or p_delivery_method not in ('staff','partner','external','customer_pickup')
    or length(btrim(coalesce(p_handler_name,''))) not between 2 and 120
    or length(btrim(coalesce(p_recipient_name,''))) not between 2 and 120
    or length(btrim(coalesce(p_confirmation_reference,''))) not between 3 and 120
    or length(coalesce(p_note,'')) > 500 then
    raise exception 'invalid_delivery_proof';
  end if;

  -- The existing order transition retains its stock, loyalty and payment checks.
  perform private.process_online_order(p_order_id, 'status', 'shipped', 'delivered', null, null);
  insert into private.manual_order_deliveries_v1 (
    order_id, branch_id, recorded_by, delivery_method, handler_name,
    recipient_name, confirmation_reference, note,
    payment_method_snapshot, payment_status_snapshot
  ) values (
    p_order_id, v_order.branch_id, auth.uid(), p_delivery_method, btrim(p_handler_name),
    btrim(p_recipient_name), btrim(p_confirmation_reference), nullif(btrim(p_note), ''),
    v_order.payment_method::text, v_order.payment_status::text
  );
  return jsonb_build_object('order_id', p_order_id, 'idempotent', false);
end;
$function$;

revoke all on function public.get_manual_order_delivery_v1(uuid) from public, anon;
grant execute on function public.get_manual_order_delivery_v1(uuid) to authenticated;
revoke all on function public.complete_order_without_driver_v1(uuid,text,text,text,text,text) from public, anon;
grant execute on function public.complete_order_without_driver_v1(uuid,text,text,text,text,text) to authenticated;
