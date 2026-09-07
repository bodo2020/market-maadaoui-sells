-- Additive API. Deploy all POS callers together; no historic cash/stock backfill.
create table private.online_order_receipts (
  order_id uuid primary key references public.online_orders(id),
  confirmed_by uuid not null,
  payment_reference text,
  confirmed_at timestamptz not null default now(),
  cash_recorded boolean not null default false
);
alter table private.online_order_receipts enable row level security;
create policy no_client_order_receipts on private.online_order_receipts for all to anon,authenticated using(false) with check(false);
revoke all on private.online_order_receipts from public,anon,authenticated;

create function private.process_online_order(p_order_id uuid,p_action text,p_expected_status text,p_target_status text,p_payment_method text,p_payment_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.online_orders%rowtype; x jsonb; p public.products%rowtype;
  qty numeric; deductions jsonb:='[]'; record_cash boolean:=false; already_recorded boolean;
  stages text[]:=array['pending','confirmed','preparing','ready','shipped','delivered']; method text;
begin
  if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid() and coalesce(active,true) and role in ('admin','super_admin')) then
    raise exception using errcode='42501',message='ORDER_MANAGER_REQUIRED'; end if;
  select * into o from public.online_orders where id=p_order_id for update;
  if not found then raise exception using errcode='22023',message='ORDER_NOT_FOUND';end if;
  if o.branch_id is null or not private.can_operate_cash_branch(o.branch_id) then
    raise exception using errcode='42501',message='ORDER_BRANCH_REQUIRED';end if;
  if p_action='payment' then
    if o.status='cancelled' or o.payment_status='refunded' then raise exception using errcode='22023',message='PAYMENT_NOT_ALLOWED';end if;
    -- A repeated confirmation of a historical paid order must not post a new receipt.
    if o.payment_status='paid' then return to_jsonb(o);end if;
    method:=case when o.checkout_version=1 then o.payment_method else coalesce(p_payment_method,o.payment_method) end;
    if method is null or method not in ('cash','card','bank_transfer','wallet') then raise exception using errcode='22023',message='INVALID_PAYMENT_METHOD';end if;
    if length(coalesce(p_payment_reference,''))>120 then raise exception using errcode='22023',message='INVALID_PAYMENT_REFERENCE';end if;
    insert into private.online_order_receipts(order_id,confirmed_by,payment_reference)
      values(o.id,auth.uid(),nullif(btrim(p_payment_reference),'')) on conflict(order_id) do nothing;
    update public.online_orders set payment_status='paid',payment_method=method,updated_at=now() where id=o.id returning * into o;
    record_cash:=o.status='delivered' and method='cash';
  elsif p_action='status' then
    if p_target_status is null or not (p_target_status=any(stages) or p_target_status='cancelled') then raise exception using errcode='22023',message='INVALID_STATUS';end if;
    if o.status::text=p_target_status then return to_jsonb(o);end if;
    if o.status::text is distinct from p_expected_status then raise exception using errcode='40001',message='ORDER_STATUS_CHANGED';end if;
    if o.status in ('delivered','cancelled') then raise exception using errcode='22023',message='ORDER_FINAL';end if;
    if p_target_status='cancelled' then
      if o.status='shipped' then raise exception using errcode='22023',message='USE_RETURN_PROCESS';end if;
      -- Lock products before inventory, matching POS/checkout lock ordering.
      if o.checkout_version=1 then
        perform 1 from public.products where id in(select (value->>'product_id')::uuid from jsonb_array_elements(o.stock_deductions)) order by id for update;
      end if;
    elsif array_position(stages,p_target_status)<>array_position(stages,o.status::text)+1 then
      raise exception using errcode='22023',message='INVALID_STATUS_TRANSITION';
    end if;
    if p_target_status='delivered' and o.checkout_version is distinct from 1 then
      if jsonb_typeof(o.items) is distinct from 'array' or jsonb_array_length(o.items)=0 then raise exception using errcode='22023',message='INVALID_ORDER_ITEMS';end if;
      for x in select value from jsonb_array_elements(o.items) order by value->>'product_id' loop
        select * into p from public.products where id=(x->>'product_id')::uuid for update;
        if not found then raise exception using errcode='22023',message='PRODUCT_UNAVAILABLE';end if;
        -- Legacy customer Payment stores weights in kg; version 1 already deducted at placement.
        qty:=(x->>'quantity')::numeric;
        if coalesce((x->>'is_bulk')::boolean,false) then
          if coalesce((x->>'bulk_quantity')::numeric,0)<=0 then raise exception using errcode='22023',message='INVALID_BULK_QUANTITY';end if;
          qty:=qty*(x->>'bulk_quantity')::numeric;
        end if;
        if qty is null or qty<=0 or qty::text in ('NaN','Infinity') or round(qty,3)<>qty then raise exception using errcode='22023',message='INVALID_QUANTITY';end if;
        deductions:=deductions||jsonb_build_array(jsonb_build_object('id',p.id,'quantity',qty));
      end loop;
      for x in select jsonb_build_object('id',value->>'id','quantity',sum((value->>'quantity')::numeric)) from jsonb_array_elements(deductions) group by value->>'id' order by value->>'id' loop
        update public.inventory set quantity=quantity-(x->>'quantity')::numeric where product_id=(x->>'id')::uuid and branch_id=o.branch_id and quantity>=(x->>'quantity')::numeric;
        if not found then raise exception using errcode='22023',message='INSUFFICIENT_STOCK';end if;
      end loop;
    end if;
    update public.online_orders set status=p_target_status::public.order_status,updated_at=now() where id=o.id returning * into o;
    record_cash:=o.status='delivered' and o.payment_status='paid' and o.payment_method='cash';
  else raise exception using errcode='22023',message='INVALID_ORDER_ACTION';end if;
  if record_cash and o.total>0 then
    insert into private.online_order_receipts(order_id,confirmed_by) values(o.id,auth.uid()) on conflict(order_id) do nothing;
    select cash_recorded into already_recorded from private.online_order_receipts where order_id=o.id;
    if not already_recorded then
      perform public.add_cash_transaction_api(o.total,'deposit','online','تحصيل الطلب #'||o.id::text,auth.uid(),o.branch_id);
      update private.online_order_receipts set cash_recorded=true where order_id=o.id;
    end if;
  end if;
  return to_jsonb(o);
end $$;
revoke all on function private.process_online_order(uuid,text,text,text,text,text) from public,anon;
grant execute on function private.process_online_order(uuid,text,text,text,text,text) to authenticated;
create function public.process_online_order(p_order_id uuid,p_action text,p_expected_status text default null,p_target_status text default null,p_payment_method text default null,p_payment_reference text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.process_online_order(p_order_id,p_action,p_expected_status,p_target_status,p_payment_method,p_payment_reference); $$;
revoke all on function public.process_online_order(uuid,text,text,text,text,text) from public,anon;
grant execute on function public.process_online_order(uuid,text,text,text,text,text) to authenticated;
