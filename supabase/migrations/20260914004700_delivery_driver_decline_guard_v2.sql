create or replace function private.guard_checkout_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  x jsonb;
  inventory_branch uuid;
  v_customer_user uuid;
begin
  if old.checkout_version is distinct from 1 then
    return coalesce(new,old);
  end if;

  if tg_op='DELETE' then
    if auth.uid() is null or not (public.is_admin() or public.is_super_admin()) then
      raise exception using errcode='42501',message='ORDER_MANAGER_REQUIRED';
    end if;
    raise exception using errcode='22023',message='CANCEL_ORDER_INSTEAD';
  end if;

  if tg_op='UPDATE'
     and (to_jsonb(new)-array['loyalty_voucher_id','loyalty_voucher_amount','updated_at'])
         is not distinct from
         (to_jsonb(old)-array['loyalty_voucher_id','loyalty_voucher_amount','updated_at'])
     and new.loyalty_voucher_id is not null
     and coalesce(new.loyalty_voucher_amount,0) > 0 then

    select c.user_id into v_customer_user
    from public.customers c
    where c.id=new.customer_id;

    if v_customer_user=auth.uid()
       and exists (
         select 1
         from public.loyalty_voucher_usages u
         where u.source_type='online_order'
           and u.source_id=new.id
           and u.customer_id=new.customer_id
           and u.voucher_id=new.loyalty_voucher_id
           and abs(u.amount_egp-coalesce(new.loyalty_voucher_amount,0))<0.009
           and u.reversed_at is null
       ) then
      return new;
    end if;
  end if;

  if tg_op='UPDATE'
     and new.delivery_person is null
     and old.delivery_person is not null
     and (to_jsonb(new)-array['delivery_person','updated_at'])
         is not distinct from
         (to_jsonb(old)-array['delivery_person','updated_at'])
     and exists (
       select 1
       from private.delivery_order_assignments_v1 a
       where a.order_id=new.id
         and a.delivery_user_id=auth.uid()
         and a.unassigned_at is null
         and a.delivery_state='assigned'
     ) then
    return new;
  end if;

  if auth.uid() is null or not (public.is_admin() or public.is_super_admin()) then
    raise exception using errcode='42501',message='ORDER_MANAGER_REQUIRED';
  end if;

  if (to_jsonb(new)-array['status','payment_status','notes','delivery_person','updated_at','return_status'])
     is distinct from
     (to_jsonb(old)-array['status','payment_status','notes','delivery_person','updated_at','return_status']) then
    raise exception using errcode='22023',message='CHECKOUT_ORDER_IMMUTABLE';
  end if;

  if old.status='cancelled' and new.status<>'cancelled' then
    raise exception using errcode='22023',message='CANCELLED_ORDER_FINAL';
  end if;

  if new.status='cancelled' and old.status<>'cancelled' then
    if old.status in ('shipped','delivered') then
      raise exception using errcode='22023',message='USE_RETURN_PROCESS';
    end if;
    for x in select value from jsonb_array_elements(old.stock_deductions) order by value->>'branch_id',value->>'product_id' loop
      inventory_branch:=coalesce((x->>'branch_id')::uuid,old.branch_id);
      update public.inventory
      set quantity=quantity+(x->>'quantity')::numeric
      where branch_id=inventory_branch and product_id=(x->>'product_id')::uuid;
      if not found then
        raise exception using errcode='22023',message='STOCK_ROW_MISSING';
      end if;
    end loop;
    new.stock_released_at:=now();
  end if;

  return new;
end
$function$;

create or replace function public.decline_my_delivery_order_v1(
  p_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_assignment private.delivery_order_assignments_v1%rowtype;
  v_order public.online_orders%rowtype;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if v_uid is null then raise exception 'authentication_required'; end if;

  if not exists (
    select 1 from public.users u
    where u.id = v_uid and u.role = 'delivery' and coalesce(u.active, true)
  ) then raise exception 'delivery_access_required'; end if;

  if length(v_reason) < 5 then raise exception 'decline_reason_required'; end if;

  select * into v_assignment
  from private.delivery_order_assignments_v1
  where order_id = p_order_id and delivery_user_id = v_uid and unassigned_at is null
  order by assigned_at desc limit 1 for update;

  if v_assignment.id is null then raise exception 'delivery_assignment_not_found'; end if;
  if v_assignment.delivery_state <> 'assigned' then raise exception 'assignment_already_started'; end if;

  select * into v_order from public.online_orders where id = p_order_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;

  update public.online_orders
  set delivery_person = null, updated_at = now()
  where id = p_order_id;

  update private.delivery_order_assignments_v1
  set delivery_state = 'failed', failed_at = now(), failure_reason = v_reason,
      unassigned_at = now(), unassigned_by = v_uid, unassign_reason = v_reason, updated_at = now()
  where id = v_assignment.id;

  update private.delivery_driver_status_v1
  set availability = 'available', updated_at = now()
  where user_id = v_uid;

  insert into private.delivery_order_events_v1(
    order_id, assignment_id, driver_user_id, event_type, from_state, to_state, note, metadata
  ) values (
    p_order_id, v_assignment.id, v_uid, 'decline', 'assigned', 'failed', v_reason,
    jsonb_build_object('assignment_released', true)
  );

  return jsonb_build_object(
    'ok', true, 'order_id', p_order_id, 'assignment_id', v_assignment.id,
    'released', true, 'reason', v_reason
  );
end;
$function$;

revoke all on function public.decline_my_delivery_order_v1(uuid, text) from public, anon;
grant execute on function public.decline_my_delivery_order_v1(uuid, text) to authenticated, service_role;
