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

  if tg_op='UPDATE'
     and new.status::text='shipped'
     and old.status::text <> 'delivered'
     and (to_jsonb(new)-array['status','updated_at'])
         is not distinct from
         (to_jsonb(old)-array['status','updated_at'])
     and exists (
       select 1
       from private.delivery_order_assignments_v1 a
       where a.order_id=new.id
         and a.delivery_user_id=auth.uid()
         and a.unassigned_at is null
         and a.delivery_state='on_the_way'
         and a.departed_at is not null
     ) then
    return new;
  end if;

  if tg_op='UPDATE'
     and new.status::text='delivered'
     and (to_jsonb(new)-array['status','payment_status','updated_at'])
         is not distinct from
         (to_jsonb(old)-array['status','payment_status','updated_at'])
     and exists (
       select 1
       from private.delivery_order_assignments_v1 a
       where a.order_id=new.id
         and a.delivery_user_id=auth.uid()
         and a.unassigned_at is null
         and a.delivery_state='delivered'
         and a.delivered_at is not null
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
