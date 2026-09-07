-- Online money settlement foundation.
-- Depends on the branch cash accounts / immutable cash ledger migration.

alter table public.cash_accounts drop constraint if exists cash_accounts_account_type_check;
alter table public.cash_accounts drop constraint if exists cash_accounts_check;
alter table public.cash_accounts add constraint cash_accounts_account_type_check check (account_type in ('branch_safe','pos_drawer','online_collection'));
alter table public.cash_accounts add constraint cash_accounts_check check (
  (account_type='pos_drawer' and device_id is not null)
  or (account_type in ('branch_safe','online_collection') and device_id is null)
);
create unique index if not exists cash_accounts_one_online_collection_per_branch
  on public.cash_accounts(branch_id) where account_type='online_collection' and active;

create or replace function private.ensure_online_collection_account(p_branch_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_name text;
begin
  select id into v_id from public.cash_accounts where branch_id=p_branch_id and account_type='online_collection' and active limit 1;
  if v_id is not null then return v_id; end if;
  select name into v_name from public.branches where id=p_branch_id;
  if v_name is null then raise exception using errcode='22023',message='BRANCH_NOT_FOUND'; end if;
  insert into public.cash_accounts(branch_id,account_type,name)
  values(p_branch_id,'online_collection','تحصيل طلبات الأونلاين - '||v_name) on conflict do nothing;
  select id into v_id from public.cash_accounts where branch_id=p_branch_id and account_type='online_collection' and active limit 1;
  return v_id;
end; $$;
revoke all on function private.ensure_online_collection_account(uuid) from public,anon,authenticated;

insert into public.cash_accounts(branch_id,account_type,name)
select b.id,'online_collection','تحصيل طلبات الأونلاين - '||b.name
from public.branches b
where not exists(select 1 from public.cash_accounts ca where ca.branch_id=b.id and ca.account_type='online_collection' and ca.active)
on conflict do nothing;

create table if not exists public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  account_type text not null check(account_type in ('gateway_clearing','bank')),
  provider_code text not null,
  name text not null,
  currency text not null default 'EGP',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payment_accounts_unique_active on public.payment_accounts(branch_id,account_type,provider_code) where active;

create table if not exists public.payment_settlements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  payment_method text not null,
  clearing_account_id uuid not null references public.payment_accounts(id),
  bank_account_id uuid not null references public.payment_accounts(id),
  gross_amount numeric(14,2) not null check(gross_amount>0),
  fee_amount numeric(14,2) not null default 0 check(fee_amount>=0),
  net_amount numeric(14,2) not null check(net_amount>=0),
  provider_reference text,
  note text,
  settled_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  check(round(gross_amount-fee_amount,2)=net_amount)
);
create unique index if not exists payment_settlements_reference_unique on public.payment_settlements(branch_id,payment_method,provider_reference) where provider_reference is not null;

create table if not exists public.payment_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.payment_accounts(id),
  branch_id uuid not null references public.branches(id),
  order_id uuid references public.online_orders(id),
  settlement_id uuid references public.payment_settlements(id),
  entry_type text not null,
  signed_amount numeric(14,2) not null check(signed_amount<>0),
  payment_method text,
  external_reference text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists payment_ledger_account_created_idx on public.payment_ledger(account_id,created_at);
create index if not exists payment_ledger_branch_created_idx on public.payment_ledger(branch_id,created_at);
create unique index if not exists payment_ledger_order_payment_once_idx on public.payment_ledger(account_id,order_id,entry_type) where order_id is not null and entry_type='online_payment';

alter table public.payment_accounts enable row level security;
alter table public.payment_settlements enable row level security;
alter table public.payment_ledger enable row level security;
revoke all on public.payment_accounts,public.payment_settlements,public.payment_ledger from anon,authenticated;

create or replace function private.prevent_payment_ledger_mutation()
returns trigger language plpgsql set search_path='' as $$ begin raise exception using errcode='55000',message='PAYMENT_LEDGER_IMMUTABLE'; end; $$;
drop trigger if exists payment_ledger_immutable on public.payment_ledger;
create trigger payment_ledger_immutable before update or delete on public.payment_ledger for each row execute function private.prevent_payment_ledger_mutation();

create or replace function private.ensure_payment_account(p_branch_id uuid,p_type text,p_provider text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_branch text; v_name text;
begin
  if p_type not in ('gateway_clearing','bank') then raise exception using errcode='22023',message='INVALID_PAYMENT_ACCOUNT_TYPE'; end if;
  select id into v_id from public.payment_accounts where branch_id=p_branch_id and account_type=p_type and provider_code=p_provider and active limit 1;
  if v_id is not null then return v_id; end if;
  select name into v_branch from public.branches where id=p_branch_id;
  if v_branch is null then raise exception using errcode='22023',message='BRANCH_NOT_FOUND'; end if;
  v_name:=case when p_type='gateway_clearing' then 'تسويات '||p_provider||' - '||v_branch else 'حساب البنك - '||v_branch end;
  insert into public.payment_accounts(branch_id,account_type,provider_code,name) values(p_branch_id,p_type,p_provider,v_name) on conflict do nothing;
  select id into v_id from public.payment_accounts where branch_id=p_branch_id and account_type=p_type and provider_code=p_provider and active limit 1;
  return v_id;
end; $$;
revoke all on function private.ensure_payment_account(uuid,text,text) from public,anon,authenticated;

create or replace function private.payment_account_balance(p_account_id uuid)
returns numeric language sql stable security definer set search_path='' as $$ select coalesce(sum(signed_amount),0)::numeric(14,2) from public.payment_ledger where account_id=p_account_id; $$;
revoke all on function private.payment_account_balance(uuid) from public,anon,authenticated;

alter table private.online_order_receipts add column if not exists financial_recorded boolean not null default false;
alter table private.online_order_receipts add column if not exists financial_recorded_at timestamptz;

create or replace function private.record_online_order_money()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_cash_account uuid; v_payment_account uuid; v_actor uuid;
begin
  v_actor:=auth.uid();
  if new.branch_id is null or new.total is null or new.total<=0 then return new; end if;
  if new.payment_method='cash' and new.payment_status='paid' and new.status='delivered'
     and (old.payment_status is distinct from new.payment_status or old.status is distinct from new.status) then
    v_cash_account:=private.ensure_online_collection_account(new.branch_id);
    insert into public.cash_ledger(account_id,branch_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,created_by)
    values(v_cash_account,new.branch_id,v_actor,'online_cod_collection',round(new.total,2),'online_order',new.id,'تحصيل نقدي طلب أونلاين #'||new.id::text,v_actor) on conflict do nothing;
    if v_actor is not null then
      insert into private.online_order_receipts(order_id,confirmed_by,cash_recorded,financial_recorded,financial_recorded_at)
      values(new.id,v_actor,true,true,now())
      on conflict(order_id) do update set cash_recorded=true,financial_recorded=true,financial_recorded_at=coalesce(private.online_order_receipts.financial_recorded_at,now());
    else
      update private.online_order_receipts set cash_recorded=true,financial_recorded=true,financial_recorded_at=coalesce(financial_recorded_at,now()) where order_id=new.id;
    end if;
  elsif new.payment_method in ('wallet','card','bank_transfer') and new.payment_status='paid' and old.payment_status is distinct from 'paid' then
    v_payment_account:=private.ensure_payment_account(new.branch_id,'gateway_clearing',new.payment_method);
    insert into public.payment_ledger(account_id,branch_id,order_id,entry_type,signed_amount,payment_method,description,created_by)
    values(v_payment_account,new.branch_id,new.id,'online_payment',round(new.total,2),new.payment_method,'تحصيل إلكتروني طلب #'||new.id::text,v_actor) on conflict do nothing;
    if v_actor is not null then
      insert into private.online_order_receipts(order_id,confirmed_by,financial_recorded,financial_recorded_at)
      values(new.id,v_actor,true,now())
      on conflict(order_id) do update set financial_recorded=true,financial_recorded_at=coalesce(private.online_order_receipts.financial_recorded_at,now());
    else
      update private.online_order_receipts set financial_recorded=true,financial_recorded_at=coalesce(financial_recorded_at,now()) where order_id=new.id;
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists record_online_order_money on public.online_orders;
create trigger record_online_order_money after update of status,payment_status,payment_method on public.online_orders for each row execute function private.record_online_order_money();

insert into public.staff_permissions(code,name_ar,module,description) values
 ('online_money.settle_cash','توريد تحصيل الأونلاين','online_orders','توريد النقد المحصل من طلبات الأونلاين إلى خزنة الفرع'),
 ('online_money.settle_digital','تسوية المدفوعات الإلكترونية','online_orders','تسجيل تحويلات شركات الدفع والعمولات إلى البنك')
on conflict(code) do nothing;
insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r cross join public.staff_permissions p
where r.code in ('branch_manager','branch_admin','super_admin') and p.code in ('online_money.settle_cash','online_money.settle_digital') on conflict do nothing;

create or replace function public.deposit_online_cash_to_safe(p_branch_id uuid,p_amount numeric,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_from uuid; v_to uuid; v_balance numeric; v_transfer uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not public.staff_has_permission('online_money.settle_cash',p_branch_id) then raise exception using errcode='42501',message='ONLINE_CASH_SETTLE_DENIED'; end if;
  if p_amount is null or p_amount<=0 then raise exception using errcode='22023',message='INVALID_AMOUNT'; end if;
  v_from:=private.ensure_online_collection_account(p_branch_id); v_to:=private.ensure_branch_safe_account(p_branch_id);
  perform pg_advisory_xact_lock(hashtextextended('cash-account:'||v_from::text,41));
  v_balance:=private.cash_account_balance(v_from);
  if round(p_amount,2)>v_balance then raise exception using errcode='22023',message='INSUFFICIENT_ONLINE_CASH'; end if;
  insert into public.cash_transfers(branch_id,amount,from_register,to_register,notes,created_by,from_account_id,to_account_id,status)
  values(p_branch_id,round(p_amount,2),'online','safe',nullif(trim(coalesce(p_note,'')),''),auth.uid(),v_from,v_to,'completed') returning id into v_transfer;
  insert into public.cash_ledger(account_id,branch_id,user_id,entry_type,signed_amount,reference_type,reference_id,transfer_id,description,created_by) values
   (v_from,p_branch_id,auth.uid(),'transfer_out',-round(p_amount,2),'cash_transfer',v_transfer,v_transfer,'توريد تحصيل الأونلاين للخزنة',auth.uid()),
   (v_to,p_branch_id,auth.uid(),'transfer_in',round(p_amount,2),'cash_transfer',v_transfer,v_transfer,'استلام تحصيل طلبات الأونلاين',auth.uid());
  return jsonb_build_object('transfer_id',v_transfer,'online_cash_balance',private.cash_account_balance(v_from),'safe_balance',private.cash_account_balance(v_to));
end; $$;
revoke all on function public.deposit_online_cash_to_safe(uuid,numeric,text) from public,anon;
grant execute on function public.deposit_online_cash_to_safe(uuid,numeric,text) to authenticated;

create or replace function public.record_online_gateway_settlement(p_branch_id uuid,p_payment_method text,p_gross numeric,p_fee numeric default 0,p_provider_reference text default null,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_clear uuid; v_bank uuid; v_balance numeric; v_settlement uuid; v_net numeric;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not public.staff_has_permission('online_money.settle_digital',p_branch_id) then raise exception using errcode='42501',message='ONLINE_DIGITAL_SETTLE_DENIED'; end if;
  if p_payment_method not in ('wallet','card','bank_transfer') then raise exception using errcode='22023',message='INVALID_PAYMENT_METHOD'; end if;
  if p_gross is null or p_gross<=0 or coalesce(p_fee,0)<0 then raise exception using errcode='22023',message='INVALID_AMOUNT'; end if;
  v_net:=round(p_gross-coalesce(p_fee,0),2); if v_net<0 then raise exception using errcode='22023',message='INVALID_FEE'; end if;
  v_clear:=private.ensure_payment_account(p_branch_id,'gateway_clearing',p_payment_method);
  v_bank:=private.ensure_payment_account(p_branch_id,'bank','branch_bank');
  perform pg_advisory_xact_lock(hashtextextended('payment-account:'||v_clear::text,42));
  v_balance:=private.payment_account_balance(v_clear);
  if round(p_gross,2)>v_balance then raise exception using errcode='22023',message='INSUFFICIENT_CLEARING_BALANCE'; end if;
  insert into public.payment_settlements(branch_id,payment_method,clearing_account_id,bank_account_id,gross_amount,fee_amount,net_amount,provider_reference,note,created_by)
  values(p_branch_id,p_payment_method,v_clear,v_bank,round(p_gross,2),round(coalesce(p_fee,0),2),v_net,nullif(trim(coalesce(p_provider_reference,'')),''),nullif(trim(coalesce(p_note,'')),''),auth.uid()) returning id into v_settlement;
  if v_net>0 then insert into public.payment_ledger(account_id,branch_id,settlement_id,entry_type,signed_amount,payment_method,external_reference,description,created_by) values
    (v_clear,p_branch_id,v_settlement,'settlement_net_out',-v_net,p_payment_method,p_provider_reference,'تحويل صافي التسوية إلى البنك',auth.uid()),
    (v_bank,p_branch_id,v_settlement,'settlement_net_in',v_net,p_payment_method,p_provider_reference,'استلام صافي تسوية '||p_payment_method,auth.uid()); end if;
  if coalesce(p_fee,0)>0 then insert into public.payment_ledger(account_id,branch_id,settlement_id,entry_type,signed_amount,payment_method,external_reference,description,created_by)
    values(v_clear,p_branch_id,v_settlement,'gateway_fee',-round(p_fee,2),p_payment_method,p_provider_reference,'عمولة/رسوم مزود الدفع',auth.uid()); end if;
  return jsonb_build_object('settlement_id',v_settlement,'gross_amount',round(p_gross,2),'fee_amount',round(coalesce(p_fee,0),2),'net_amount',v_net,'clearing_balance',private.payment_account_balance(v_clear),'bank_balance',private.payment_account_balance(v_bank));
end; $$;
revoke all on function public.record_online_gateway_settlement(uuid,text,numeric,numeric,text,text) from public,anon;
grant execute on function public.record_online_gateway_settlement(uuid,text,numeric,numeric,text,text) to authenticated;

create or replace function public.get_online_money_overview(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_cash uuid; v_cash_balance numeric; v_safe uuid; v_safe_balance numeric; v_accounts jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('online_orders.view',p_branch_id) or public.staff_has_permission('finance.view',p_branch_id)) then raise exception using errcode='42501',message='ONLINE_MONEY_VIEW_DENIED'; end if;
  select id into v_cash from public.cash_accounts where branch_id=p_branch_id and account_type='online_collection' and active limit 1;
  select id into v_safe from public.cash_accounts where branch_id=p_branch_id and account_type='branch_safe' and active limit 1;
  v_cash_balance:=coalesce(private.cash_account_balance(v_cash),0); v_safe_balance:=coalesce(private.cash_account_balance(v_safe),0);
  select coalesce(jsonb_agg(jsonb_build_object('account_id',pa.id,'account_type',pa.account_type,'provider_code',pa.provider_code,'name',pa.name,'balance',private.payment_account_balance(pa.id)) order by pa.account_type,pa.provider_code),'[]'::jsonb)
    into v_accounts from public.payment_accounts pa where pa.branch_id=p_branch_id and pa.active;
  return jsonb_build_object('branch_id',p_branch_id,'online_cash_account_id',v_cash,'online_cash_balance',v_cash_balance,'safe_account_id',v_safe,'safe_balance',v_safe_balance,'payment_accounts',v_accounts);
end; $$;
revoke all on function public.get_online_money_overview(uuid) from public,anon;
grant execute on function public.get_online_money_overview(uuid) to authenticated;
