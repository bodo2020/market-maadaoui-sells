-- Atomic return approval: status + inventory source + refund booking in one transaction.

alter table public.returns add column if not exists refund_method text;
alter table public.returns add column if not exists refund_status text not null default 'none';
alter table public.returns add column if not exists refund_account_id uuid;
alter table public.returns add column if not exists approved_by uuid references public.users(id);
alter table public.returns add column if not exists approved_at timestamptz;
alter table public.returns add column if not exists inventory_restored_at timestamptz;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='returns_refund_status_check') then
    alter table public.returns add constraint returns_refund_status_check check(refund_status in ('none','completed','pending_provider','failed'));
  end if;
end $$;

alter table public.payment_ledger add column if not exists return_id uuid references public.returns(id);
drop index if exists public.payment_ledger_order_once_idx;
create unique index if not exists payment_ledger_order_payment_once_idx on public.payment_ledger(account_id,order_id,entry_type) where order_id is not null and entry_type='online_payment';
create unique index if not exists payment_ledger_return_once_idx on public.payment_ledger(account_id,return_id,entry_type) where return_id is not null;

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null unique references public.returns(id),
  order_id uuid not null references public.online_orders(id),
  branch_id uuid not null references public.branches(id),
  payment_method text not null,
  clearing_account_id uuid not null references public.payment_accounts(id),
  amount numeric(14,2) not null check(amount>0),
  status text not null default 'pending' check(status in ('pending','confirmed','failed')),
  provider_reference text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  confirmed_by uuid references public.users(id),
  confirmed_at timestamptz
);
alter table public.payment_refunds enable row level security;
revoke all on public.payment_refunds from anon,authenticated;

create or replace function public.approve_return_atomic(p_return_id uuid,p_refund_source text default 'auto')
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_return public.returns%rowtype; v_order public.online_orders%rowtype; v_branch uuid; v_inventory_branch uuid;
  v_item record; v_refund_method text; v_cash_account uuid; v_payment_account uuid; v_balance numeric; v_refund uuid; v_ledger uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_return from public.returns where id=p_return_id for update;
  if v_return.id is null then raise exception using errcode='22023',message='RETURN_NOT_FOUND'; end if;
  if v_return.status='approved' then return to_jsonb(v_return); end if;
  if v_return.status<>'pending' then raise exception using errcode='22023',message='RETURN_NOT_PENDING'; end if;
  if v_return.order_id is not null then select * into v_order from public.online_orders where id=v_return.order_id; end if;
  v_branch:=coalesce(v_return.branch_id,v_order.branch_id);
  if v_branch is null then raise exception using errcode='22023',message='RETURN_BRANCH_REQUIRED'; end if;
  if not (public.staff_has_permission('finance.manage',v_branch) or private.can_manage_financial_branch(v_branch)) then raise exception using errcode='42501',message='RETURN_MANAGE_DENIED'; end if;
  select coalesce(inventory_source_branch_id,id) into v_inventory_branch from public.branches where id=v_branch and active;
  if v_inventory_branch is null then raise exception using errcode='22023',message='RETURN_BRANCH_REQUIRED'; end if;
  if not exists(select 1 from public.return_items where return_id=v_return.id) then raise exception using errcode='22023',message='RETURN_ITEMS_REQUIRED'; end if;

  perform 1 from public.products p where p.id in(select ri.product_id from public.return_items ri where ri.return_id=v_return.id) order by p.id for update;
  for v_item in select product_id,quantity from public.return_items where return_id=v_return.id order by product_id loop
    if v_item.product_id is null or v_item.quantity<=0 then raise exception using errcode='22023',message='INVALID_RETURN_ITEM'; end if;
    insert into public.inventory(product_id,branch_id,quantity,updated_at)
    values(v_item.product_id,v_inventory_branch,v_item.quantity,now())
    on conflict(product_id,branch_id) do update set quantity=public.inventory.quantity+excluded.quantity,updated_at=now();
  end loop;

  v_refund_method:=case
    when p_refund_source<>'auto' then p_refund_source
    when v_order.id is not null and v_order.payment_method in ('wallet','card','bank_transfer') then 'digital'
    else 'safe'
  end;
  if v_refund_method not in ('safe','digital','none') then raise exception using errcode='22023',message='INVALID_REFUND_SOURCE'; end if;

  if v_return.total_amount>0 and v_refund_method='safe' then
    v_cash_account:=private.ensure_branch_safe_account(v_branch);
    perform pg_advisory_xact_lock(hashtextextended('cash-account:'||v_cash_account::text,61));
    v_balance:=private.cash_account_balance(v_cash_account);
    if round(v_return.total_amount,2)>v_balance then raise exception using errcode='22023',message='INSUFFICIENT_SAFE_CASH|'||to_char(v_balance,'FM9999999990.00'); end if;
    insert into public.cash_ledger(account_id,branch_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,created_by)
    values(v_cash_account,v_branch,auth.uid(),'refund_cash',-round(v_return.total_amount,2),'return',v_return.id,'رد نقدي للمرتجع #'||v_return.id::text,auth.uid()) returning id into v_ledger;
    update public.returns set branch_id=v_branch,status='approved',refund_method='cash',refund_status='completed',refund_account_id=v_cash_account,
      approved_by=auth.uid(),approved_at=now(),inventory_restored_at=now(),updated_at=now() where id=v_return.id returning * into v_return;
  elsif v_return.total_amount>0 and v_refund_method='digital' then
    if v_order.id is null or v_order.payment_method not in ('wallet','card','bank_transfer') then raise exception using errcode='22023',message='DIGITAL_REFUND_ORDER_REQUIRED'; end if;
    v_payment_account:=private.ensure_payment_account(v_branch,'gateway_clearing',v_order.payment_method);
    insert into public.payment_refunds(return_id,order_id,branch_id,payment_method,clearing_account_id,amount,status,created_by)
    values(v_return.id,v_order.id,v_branch,v_order.payment_method,v_payment_account,round(v_return.total_amount,2),'pending',auth.uid()) returning id into v_refund;
    insert into public.payment_ledger(account_id,branch_id,order_id,return_id,entry_type,signed_amount,payment_method,description,metadata,created_by)
    values(v_payment_account,v_branch,v_order.id,v_return.id,'refund_pending',-round(v_return.total_amount,2),v_order.payment_method,'Refund pending للمرتجع #'||v_return.id::text,jsonb_build_object('refund_id',v_refund),auth.uid());
    update public.returns set branch_id=v_branch,status='approved',refund_method=v_order.payment_method,refund_status='pending_provider',refund_account_id=null,
      approved_by=auth.uid(),approved_at=now(),inventory_restored_at=now(),updated_at=now() where id=v_return.id returning * into v_return;
  else
    update public.returns set branch_id=v_branch,status='approved',refund_method='none',refund_status='completed',approved_by=auth.uid(),approved_at=now(),inventory_restored_at=now(),updated_at=now()
    where id=v_return.id returning * into v_return;
  end if;

  return to_jsonb(v_return)||jsonb_build_object('inventory_branch_id',v_inventory_branch,'refund_ledger_entry_id',v_ledger,'payment_refund_id',v_refund);
end; $$;
revoke all on function public.approve_return_atomic(uuid,text) from public,anon;
grant execute on function public.approve_return_atomic(uuid,text) to authenticated;

create or replace function public.confirm_online_refund(p_refund_id uuid,p_provider_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_refund public.payment_refunds%rowtype; v_total_refunded numeric; v_order_total numeric;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_refund from public.payment_refunds where id=p_refund_id for update;
  if v_refund.id is null then raise exception using errcode='22023',message='REFUND_NOT_FOUND'; end if;
  if not public.staff_has_permission('online_money.settle_digital',v_refund.branch_id) then raise exception using errcode='42501',message='ONLINE_DIGITAL_SETTLE_DENIED'; end if;
  if v_refund.status='confirmed' then return to_jsonb(v_refund); end if;
  if v_refund.status<>'pending' then raise exception using errcode='22023',message='REFUND_NOT_PENDING'; end if;
  update public.payment_refunds set status='confirmed',provider_reference=nullif(trim(coalesce(p_provider_reference,'')),''),confirmed_by=auth.uid(),confirmed_at=now()
    where id=v_refund.id returning * into v_refund;
  update public.returns set refund_status='completed',updated_at=now() where id=v_refund.return_id;
  select coalesce(sum(amount),0) into v_total_refunded from public.payment_refunds where order_id=v_refund.order_id and status='confirmed';
  select total into v_order_total from public.online_orders where id=v_refund.order_id;
  if v_total_refunded>=v_order_total then update public.online_orders set payment_status='refunded',updated_at=now() where id=v_refund.order_id; end if;
  return to_jsonb(v_refund)||jsonb_build_object('confirmed_refunds_total',v_total_refunded,'order_total',v_order_total);
end; $$;
revoke all on function public.confirm_online_refund(uuid,text) from public,anon;
grant execute on function public.confirm_online_refund(uuid,text) to authenticated;
