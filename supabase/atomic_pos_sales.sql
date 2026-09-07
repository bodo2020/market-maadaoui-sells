-- Shared branch inventory arithmetic for POS and online checkout.
create table private.pos_inventory_requests (
  id uuid primary key,user_id uuid not null,fingerprint text not null,result numeric not null
);
alter table private.pos_inventory_requests enable row level security;
create policy no_client_inventory_requests on private.pos_inventory_requests for all to anon,authenticated using(false) with check(false);
revoke all on private.pos_inventory_requests from public,anon,authenticated;
alter table public.sales add column request_fingerprint text;
create function private.adjust_branch_inventory(p_request_id uuid,p_product_id uuid,p_branch_id uuid,p_delta numeric)
returns numeric language plpgsql security definer set search_path='' as $$
declare previous private.pos_inventory_requests%rowtype; fingerprint text; result numeric;
begin
  if auth.uid() is null or not (private.can_manage_inventory_branch(p_branch_id) or private.can_operate_cash_branch(p_branch_id)) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED'; end if;
  if p_request_id is null or p_product_id is null or p_branch_id is null or p_delta is null or p_delta::text in ('NaN','Infinity','-Infinity') or p_delta=0 or round(p_delta,3)<>p_delta then
    raise exception using errcode='22023',message='INVALID_STOCK_CHANGE'; end if;
  fingerprint:=md5(jsonb_build_array(p_product_id,p_branch_id,p_delta)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,7));
  select * into previous from private.pos_inventory_requests where id=p_request_id;
  if found then
    if previous.user_id<>auth.uid() or previous.fingerprint<>fingerprint then raise exception using errcode='42501',message='REQUEST_CONFLICT'; end if;
    return previous.result;
  end if;
  perform 1 from public.products where id=p_product_id for update;
  update public.inventory set quantity=quantity+p_delta where product_id=p_product_id and branch_id=p_branch_id and quantity+p_delta>=0 returning quantity into result;
  if not found then raise exception using errcode='22023',message='INSUFFICIENT_STOCK'; end if;
  insert into private.pos_inventory_requests values(p_request_id,auth.uid(),fingerprint,result);
  return result;
end $$;
revoke all on function private.adjust_branch_inventory(uuid,uuid,uuid,numeric) from public,anon;
grant execute on function private.adjust_branch_inventory(uuid,uuid,uuid,numeric) to authenticated;
create function public.adjust_branch_inventory(p_request_id uuid,p_product_id uuid,p_branch_id uuid,p_delta numeric)
returns numeric language sql security invoker set search_path='' as $$
  select private.adjust_branch_inventory(p_request_id,p_product_id,p_branch_id,p_delta);
$$;
revoke all on function public.adjust_branch_inventory(uuid,uuid,uuid,numeric) from public,anon;
grant execute on function public.adjust_branch_inventory(uuid,uuid,uuid,numeric) to authenticated;

create function private.create_pos_sale(p_request_id uuid,p_branch_id uuid,p_sale jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.sales%rowtype; saved public.sales%rowtype; p public.products%rowtype;
  x jsonb; deductions jsonb:='[]'; amount numeric; quantity numeric; total numeric; subtotal numeric; discount numeric;
  cash numeric; card numeric; fingerprint text; method text;
begin
  if auth.uid() is null or p_branch_id is null or not private.can_operate_cash_branch(p_branch_id) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED'; end if;
  if p_request_id is null or jsonb_typeof(p_sale->'items') is distinct from 'array' then raise exception using errcode='22023',message='INVALID_SALE'; end if;
  fingerprint:=md5(jsonb_build_array(p_branch_id,p_sale)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,8));
  select * into previous from public.sales where id=p_request_id;
  if found then
    if previous.cashier_id<>auth.uid() or previous.request_fingerprint is distinct from fingerprint then raise exception using errcode='42501',message='REQUEST_CONFLICT'; end if;
    return to_jsonb(previous);
  end if;
  if jsonb_array_length(p_sale->'items') not between 1 and 300 then raise exception using errcode='22023',message='INVALID_SALE'; end if;
  total:=(p_sale->>'total')::numeric; subtotal:=(p_sale->>'subtotal')::numeric; discount:=coalesce((p_sale->>'discount')::numeric,0);
  cash:=coalesce((p_sale->>'cash_amount')::numeric,0);card:=coalesce((p_sale->>'card_amount')::numeric,0);method:=p_sale->>'payment_method';
  if total is null or subtotal is null or method is null or method not in ('cash','card','mixed') or total<0 or subtotal<0 or discount<0 or cash<0 or card<0
    or total::text in ('NaN','Infinity') or subtotal::text in ('NaN','Infinity') or discount::text in ('NaN','Infinity') or cash::text in ('NaN','Infinity') or card::text in ('NaN','Infinity')
    or round(subtotal-discount,2)<>round(total,2) then raise exception using errcode='22023',message='INVALID_SALE_TOTAL'; end if;
  if method='cash' and cash=0 and card=0 then cash:=total; end if;
  if method='card' and cash=0 and card=0 then card:=total; end if;
  if round(cash+card,2)<>round(total,2) then raise exception using errcode='22023',message='INVALID_PAYMENT_SPLIT'; end if;
  for x in select value from jsonb_array_elements(p_sale->'items') order by value->'product'->>'id' loop
    select * into p from public.products where id=(x->'product'->>'id')::uuid for update;
    if p.id is null then raise exception using errcode='22023',message='PRODUCT_UNAVAILABLE'; end if;
    quantity:=(x->>'quantity')::numeric;
    if p.barcode_type='scale' then quantity:=coalesce((x->>'weight')::numeric,quantity);
    elsif coalesce((x->>'isBulk')::boolean,false) then
      if not coalesce(p.bulk_enabled,false) or coalesce(p.bulk_quantity,0)<=0 then raise exception using errcode='22023',message='BULK_UNAVAILABLE'; end if;
      quantity:=quantity*p.bulk_quantity;
    end if;
    if quantity is null or quantity<=0 or quantity::text in ('NaN','Infinity') or round(quantity,3)<>quantity then raise exception using errcode='22023',message='INVALID_QUANTITY'; end if;
    deductions:=deductions||jsonb_build_array(jsonb_build_object('id',p.id,'quantity',quantity));
  end loop;
  for x in select jsonb_build_object('id',value->>'id','quantity',sum((value->>'quantity')::numeric)) from jsonb_array_elements(deductions) group by value->>'id' order by value->>'id' loop
    update public.inventory set quantity=inventory.quantity-(x->>'quantity')::numeric where product_id=(x->>'id')::uuid and branch_id=p_branch_id and inventory.quantity>=(x->>'quantity')::numeric;
    if not found then raise exception using errcode='22023',message='INSUFFICIENT_STOCK'; end if;
  end loop;
  insert into public.sales(id,items,cashier_id,cashier_name,branch_id,subtotal,discount,total,profit,payment_method,cash_amount,card_amount,customer_name,customer_phone,invoice_number,request_fingerprint)
  values(p_request_id,p_sale->'items',auth.uid(),(select name from public.users where id=auth.uid()),p_branch_id,subtotal,discount,total,
    coalesce((p_sale->>'profit')::numeric,0),method,cash,card,p_sale->>'customer_name',p_sale->>'customer_phone',p_sale->>'invoice_number',fingerprint) returning * into saved;
  if cash>0 then
    perform public.add_cash_transaction_api(cash,'deposit','store','مبيعات - فاتورة '||coalesce(saved.invoice_number,saved.id::text),auth.uid(),p_branch_id);
  end if;
  return to_jsonb(saved);
end $$;
revoke all on function private.create_pos_sale(uuid,uuid,jsonb) from public,anon;
grant execute on function private.create_pos_sale(uuid,uuid,jsonb) to authenticated;
create function public.create_pos_sale(p_request_id uuid,p_branch_id uuid,p_sale jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.create_pos_sale(p_request_id,p_branch_id,p_sale); $$;
revoke all on function public.create_pos_sale(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_pos_sale(uuid,uuid,jsonb) to authenticated;
