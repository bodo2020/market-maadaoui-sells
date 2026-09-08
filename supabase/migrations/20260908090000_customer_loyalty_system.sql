-- Customer identity + loyalty system.
-- Rules: 1 EGP eligible spend = 1 point; 1000 points = 5 EGP redeemable credit.

create sequence if not exists public.customer_membership_seq start with 1 increment by 1;

create table if not exists public.loyalty_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  points_per_egp numeric(10,4) not null default 1 check (points_per_egp >= 0),
  redemption_points bigint not null default 1000 check (redemption_points > 0),
  redemption_value_egp numeric(12,2) not null default 5 check (redemption_value_egp >= 0),
  earn_on_shipping boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.loyalty_settings(singleton,enabled,points_per_egp,redemption_points,redemption_value_egp,earn_on_shipping)
values(true,true,1,1000,5,false)
on conflict (singleton) do update set
  points_per_egp=excluded.points_per_egp,
  redemption_points=excluded.redemption_points,
  redemption_value_egp=excluded.redemption_value_egp,
  earn_on_shipping=excluded.earn_on_shipping,
  updated_at=now();

create table if not exists public.customer_loyalty_accounts (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  membership_number text not null unique,
  barcode_token text not null unique,
  points_balance bigint not null default 0,
  lifetime_points_earned bigint not null default 0 check (lifetime_points_earned >= 0),
  lifetime_points_redeemed bigint not null default 0 check (lifetime_points_redeemed >= 0),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  entry_type text not null check (entry_type in ('earn','redeem','reversal','adjustment','bonus')),
  points_delta bigint not null check (points_delta <> 0),
  value_egp numeric(12,2),
  source_type text not null,
  source_id uuid,
  branch_id uuid references public.branches(id) on delete set null,
  reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists loyalty_ledger_source_once_idx
  on public.loyalty_ledger(source_type,source_id,entry_type)
  where source_id is not null;
create index if not exists loyalty_ledger_customer_created_idx
  on public.loyalty_ledger(customer_id,created_at desc);

alter table public.customer_loyalty_accounts enable row level security;
alter table public.loyalty_ledger enable row level security;
alter table public.loyalty_settings enable row level security;
revoke all on public.customer_loyalty_accounts from anon,authenticated;
revoke all on public.loyalty_ledger from anon,authenticated;
revoke all on public.loyalty_settings from anon,authenticated;

create or replace function private.ean13_check_digit(p_base12 text)
returns text language plpgsql immutable set search_path=''
as $$
declare i int; s int:=0; d int;
begin
  if p_base12 !~ '^[0-9]{12}$' then raise exception using errcode='22023',message='INVALID_EAN12'; end if;
  for i in 1..12 loop
    d:=substr(p_base12,i,1)::int;
    s:=s+d*case when mod(i,2)=0 then 3 else 1 end;
  end loop;
  return ((10-mod(s,10))%10)::text;
end;
$$;

create or replace function private.loyalty_ean13(p_membership_number text)
returns text language plpgsql immutable set search_path=''
as $$
declare v_digits text; v_base text;
begin
  v_digits:=regexp_replace(coalesce(p_membership_number,''),'[^0-9]','','g');
  if v_digits='' then raise exception using errcode='22023',message='INVALID_MEMBERSHIP_NUMBER'; end if;
  v_base:='299'||lpad(right(v_digits,9),9,'0');
  return v_base||private.ean13_check_digit(v_base);
end;
$$;

create or replace function private.prepare_customer_loyalty_identity()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_seq bigint;
begin
  if nullif(btrim(new.membership_number),'') is null then
    v_seq:=nextval('public.customer_membership_seq');
    new.membership_number:='EMD'||lpad(v_seq::text,8,'0');
  end if;
  if nullif(btrim(new.barcode_token),'') is null or new.barcode_token !~ '^[0-9]{13}$' then
    new.barcode_token:=private.loyalty_ean13(new.membership_number);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_prepare_customer_loyalty_identity on public.customer_loyalty_accounts;
create trigger trg_prepare_customer_loyalty_identity
before insert on public.customer_loyalty_accounts
for each row execute function private.prepare_customer_loyalty_identity();

create or replace function private.ensure_customer_loyalty_account(p_customer_id uuid)
returns public.customer_loyalty_accounts
language plpgsql security definer set search_path=''
as $$
declare v_account public.customer_loyalty_accounts%rowtype;
begin
  if p_customer_id is null or not exists(select 1 from public.customers c where c.id=p_customer_id) then
    raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND';
  end if;
  insert into public.customer_loyalty_accounts(customer_id,membership_number,barcode_token)
  values(p_customer_id,'','') on conflict(customer_id) do nothing;
  select * into v_account from public.customer_loyalty_accounts where customer_id=p_customer_id;
  return v_account;
end;
$$;

create or replace function private.post_loyalty_entry(
  p_customer_id uuid,p_entry_type text,p_points_delta bigint,p_value_egp numeric,
  p_source_type text,p_source_id uuid,p_branch_id uuid,p_reference text,
  p_metadata jsonb default '{}'::jsonb,p_created_by uuid default null
)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_inserted uuid; v_account public.customer_loyalty_accounts%rowtype;
begin
  if p_customer_id is null or p_points_delta=0 then return false; end if;
  v_account:=private.ensure_customer_loyalty_account(p_customer_id);
  if v_account.status<>'active' and p_entry_type in ('earn','bonus','redeem') then return false; end if;
  perform 1 from public.customer_loyalty_accounts where customer_id=p_customer_id for update;
  insert into public.loyalty_ledger(customer_id,entry_type,points_delta,value_egp,source_type,source_id,branch_id,reference,metadata,created_by)
  values(p_customer_id,p_entry_type,p_points_delta,p_value_egp,p_source_type,p_source_id,p_branch_id,p_reference,coalesce(p_metadata,'{}'::jsonb),p_created_by)
  on conflict do nothing returning id into v_inserted;
  if v_inserted is null then return false; end if;
  update public.customer_loyalty_accounts
  set points_balance=points_balance+p_points_delta,
      lifetime_points_earned=lifetime_points_earned+case when p_points_delta>0 then p_points_delta else 0 end,
      lifetime_points_redeemed=lifetime_points_redeemed+case when p_entry_type='redeem' and p_points_delta<0 then abs(p_points_delta) else 0 end,
      updated_at=now()
  where customer_id=p_customer_id;
  return true;
end;
$$;

create or replace function private.ensure_customer_loyalty_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform private.ensure_customer_loyalty_account(new.id);
  return new;
end;
$$;
drop trigger if exists trg_customer_loyalty_account on public.customers;
create trigger trg_customer_loyalty_account after insert on public.customers
for each row execute function private.ensure_customer_loyalty_trigger();

insert into public.customer_loyalty_accounts(customer_id,membership_number,barcode_token)
select c.id,'','' from public.customers c on conflict(customer_id) do nothing;
update public.customer_loyalty_accounts
set barcode_token=private.loyalty_ean13(membership_number),updated_at=now()
where barcode_token is distinct from private.loyalty_ean13(membership_number);

alter table public.sales add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.sales add column if not exists source_channel text not null default 'store';
alter table public.sales add column if not exists loyalty_points_earned bigint not null default 0;
create index if not exists sales_customer_date_idx on public.sales(customer_id,date desc) where customer_id is not null;

alter table public.online_orders add column if not exists source_channel text not null default 'online';
alter table public.online_orders add column if not exists loyalty_points_earned bigint not null default 0;
create index if not exists online_orders_customer_created_idx on public.online_orders(customer_id,created_at desc) where customer_id is not null;

create or replace function private.prepare_pos_sale_loyalty()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_settings public.loyalty_settings%rowtype; v_customer public.customers%rowtype;
begin
  new.source_channel:='store';
  if new.customer_id is null then new.loyalty_points_earned:=0; return new; end if;
  select * into v_customer from public.customers where id=new.customer_id;
  if v_customer.id is null then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
  new.customer_name:=v_customer.name;
  new.customer_phone:=v_customer.phone;
  perform private.ensure_customer_loyalty_account(new.customer_id);
  select * into v_settings from public.loyalty_settings where singleton=true;
  new.loyalty_points_earned:=case when coalesce(v_settings.enabled,false)
    then floor(greatest(coalesce(new.total,0),0)*coalesce(v_settings.points_per_egp,0))::bigint else 0 end;
  return new;
end;
$$;
drop trigger if exists trg_prepare_pos_sale_loyalty_insert on public.sales;
create trigger trg_prepare_pos_sale_loyalty_insert before insert on public.sales
for each row execute function private.prepare_pos_sale_loyalty();
drop trigger if exists trg_prepare_pos_sale_loyalty_customer on public.sales;
create trigger trg_prepare_pos_sale_loyalty_customer before update of customer_id on public.sales
for each row when (old.customer_id is distinct from new.customer_id)
execute function private.prepare_pos_sale_loyalty();

create or replace function private.post_pos_sale_loyalty()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.customer_id is not null and new.loyalty_points_earned>0
     and (tg_op='INSERT' or old.customer_id is distinct from new.customer_id) then
    perform private.post_loyalty_entry(new.customer_id,'earn',new.loyalty_points_earned,new.total,'pos_sale',new.id,new.branch_id,new.invoice_number,
      jsonb_build_object('channel','store','sale_total',new.total),new.cashier_id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_post_pos_sale_loyalty_insert on public.sales;
create trigger trg_post_pos_sale_loyalty_insert after insert on public.sales
for each row execute function private.post_pos_sale_loyalty();
drop trigger if exists trg_post_pos_sale_loyalty_customer on public.sales;
create trigger trg_post_pos_sale_loyalty_customer after update of customer_id on public.sales
for each row when (old.customer_id is distinct from new.customer_id)
execute function private.post_pos_sale_loyalty();

create or replace function private.prepare_online_order_loyalty()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_settings public.loyalty_settings%rowtype; v_eligible numeric;
begin
  new.source_channel:='online';
  if new.customer_id is null then new.loyalty_points_earned:=0; return new; end if;
  if old.status is distinct from new.status and new.status::text='delivered' then
    select * into v_settings from public.loyalty_settings where singleton=true;
    v_eligible:=greatest(coalesce(new.total,0)-case when coalesce(v_settings.earn_on_shipping,false) then 0 else coalesce(new.shipping_cost,0) end,0);
    new.loyalty_points_earned:=case when coalesce(v_settings.enabled,false)
      then floor(v_eligible*coalesce(v_settings.points_per_egp,0))::bigint else 0 end;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_prepare_online_order_loyalty on public.online_orders;
create trigger trg_prepare_online_order_loyalty before update of status,payment_status on public.online_orders
for each row execute function private.prepare_online_order_loyalty();

create or replace function private.post_online_order_loyalty()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_value numeric;
begin
  if new.customer_id is null then return new; end if;
  if old.status::text is distinct from new.status::text and new.status::text='delivered' and new.loyalty_points_earned>0 then
    v_value:=greatest(coalesce(new.total,0)-coalesce(new.shipping_cost,0),0);
    perform private.post_loyalty_entry(new.customer_id,'earn',new.loyalty_points_earned,v_value,'online_order',new.id,new.branch_id,new.tracking_number,
      jsonb_build_object('channel','online','order_total',new.total,'shipping_cost',new.shipping_cost),null);
  elsif old.status::text='delivered' and new.status::text<>'delivered' and coalesce(old.loyalty_points_earned,0)>0 then
    perform private.post_loyalty_entry(new.customer_id,'reversal',-old.loyalty_points_earned,-greatest(coalesce(old.total,0)-coalesce(old.shipping_cost,0),0),'online_order_reversal',new.id,new.branch_id,new.tracking_number,
      jsonb_build_object('reason','status_reversed','from',old.status::text,'to',new.status::text),null);
  elsif old.payment_status::text is distinct from new.payment_status::text and new.payment_status::text='refunded' and old.status::text='delivered' and coalesce(old.loyalty_points_earned,0)>0 then
    perform private.post_loyalty_entry(new.customer_id,'reversal',-old.loyalty_points_earned,-greatest(coalesce(old.total,0)-coalesce(old.shipping_cost,0),0),'online_order_refund',new.id,new.branch_id,new.tracking_number,
      jsonb_build_object('reason','refunded'),null);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_post_online_order_loyalty on public.online_orders;
create trigger trg_post_online_order_loyalty after update of status,payment_status on public.online_orders
for each row execute function private.post_online_order_loyalty();

create or replace function public.get_my_loyalty_card()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_customer public.customers%rowtype; v_account public.customer_loyalty_accounts%rowtype; v_settings public.loyalty_settings%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_customer from public.customers where user_id=auth.uid() order by created_at desc limit 1;
  if v_customer.id is null then raise exception using errcode='22023',message='PROFILE_REQUIRED'; end if;
  v_account:=private.ensure_customer_loyalty_account(v_customer.id);
  select * into v_settings from public.loyalty_settings where singleton=true;
  return jsonb_build_object(
    'customer_id',v_customer.id,'name',v_customer.name,'phone',v_customer.phone,
    'membership_number',v_account.membership_number,'barcode_token',v_account.barcode_token,
    'points_balance',v_account.points_balance,'lifetime_points_earned',v_account.lifetime_points_earned,
    'lifetime_points_redeemed',v_account.lifetime_points_redeemed,'status',v_account.status,
    'points_per_egp',v_settings.points_per_egp,'redemption_points',v_settings.redemption_points,
    'redemption_value_egp',v_settings.redemption_value_egp,
    'redeemable_credit_egp',floor(greatest(v_account.points_balance,0)::numeric/v_settings.redemption_points)*v_settings.redemption_value_egp
  );
end;
$$;

create or replace function public.get_my_loyalty_history(p_limit integer default 50)
returns setof jsonb language sql security definer set search_path=''
as $$
  select jsonb_build_object('id',l.id,'entry_type',l.entry_type,'points_delta',l.points_delta,'value_egp',l.value_egp,
    'source_type',l.source_type,'source_id',l.source_id,'branch_id',l.branch_id,'reference',l.reference,'metadata',l.metadata,'created_at',l.created_at)
  from public.loyalty_ledger l join public.customers c on c.id=l.customer_id
  where c.user_id=auth.uid() order by l.created_at desc,l.id desc
  limit greatest(1,least(coalesce(p_limit,50),200));
$$;

create or replace function public.lookup_customer_loyalty(p_code text,p_branch_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_account public.customer_loyalty_accounts%rowtype; v_customer public.customers%rowtype; v_settings public.loyalty_settings%rowtype; v_code text;
begin
  if auth.uid() is null or p_branch_id is null or not private.can_operate_cash_branch(p_branch_id) then
    raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED';
  end if;
  v_code:=upper(btrim(coalesce(p_code,'')));
  if v_code='' then raise exception using errcode='22023',message='CUSTOMER_CODE_REQUIRED'; end if;
  select * into v_account from public.customer_loyalty_accounts a
  where upper(a.barcode_token)=v_code or upper(a.membership_number)=v_code limit 1;
  if v_account.customer_id is null or v_account.status<>'active' then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
  select * into v_customer from public.customers where id=v_account.customer_id;
  select * into v_settings from public.loyalty_settings where singleton=true;
  return jsonb_build_object(
    'customer_id',v_customer.id,'name',v_customer.name,'phone',v_customer.phone,
    'membership_number',v_account.membership_number,'barcode_token',v_account.barcode_token,
    'points_balance',v_account.points_balance,'lifetime_points_earned',v_account.lifetime_points_earned,
    'redeemable_credit_egp',floor(greatest(v_account.points_balance,0)::numeric/v_settings.redemption_points)*v_settings.redemption_value_egp,
    'redemption_points',v_settings.redemption_points,'redemption_value_egp',v_settings.redemption_value_egp
  );
end;
$$;

revoke all on function public.get_my_loyalty_card() from public,anon;
grant execute on function public.get_my_loyalty_card() to authenticated;
revoke all on function public.get_my_loyalty_history(integer) from public,anon;
grant execute on function public.get_my_loyalty_history(integer) to authenticated;
revoke all on function public.lookup_customer_loyalty(text,uuid) from public,anon;
grant execute on function public.lookup_customer_loyalty(text,uuid) to authenticated;

-- Extend the public POS wrapper only; the existing private sale engine remains authoritative
-- for pricing, stock, payment, device and shift validation.
create or replace function public.create_pos_sale(p_request_id uuid,p_branch_id uuid,p_sale jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_device_id uuid; v_device_token text; v_device public.pos_devices%rowtype; v_shift_id uuid;
  v_customer_id uuid; v_customer_code text; v_customer public.customers%rowtype;
  v_account public.customer_loyalty_accounts%rowtype; v_result jsonb; v_saved jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  begin v_device_id:=nullif(p_sale->>'device_id','')::uuid; exception when others then raise exception using errcode='22023',message='DEVICE_REQUIRED'; end;
  v_device_token:=nullif(p_sale->>'device_token','');
  if v_device_id is null or v_device_token is null then raise exception using errcode='22023',message='DEVICE_REQUIRED'; end if;
  select * into v_device from public.pos_devices where id=v_device_id;
  if v_device.id is null or not coalesce(v_device.active,false) or v_device.revoked_at is not null
     or v_device.branch_id is distinct from p_branch_id
     or encode(extensions.digest(v_device_token,'sha256'),'hex') is distinct from v_device.device_token_hash then
    raise exception using errcode='42501',message='DEVICE_UNAVAILABLE';
  end if;
  select s.id into v_shift_id from public.pos_shifts s
  where s.user_id=auth.uid() and s.branch_id=p_branch_id and s.device_id=v_device_id and s.status='open'
  order by s.opened_at desc limit 1;
  if v_shift_id is null then raise exception using errcode='55000',message='POS_DEVICE_SHIFT_MISMATCH'; end if;

  begin v_customer_id:=nullif(p_sale->>'customer_id','')::uuid; exception when others then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end;
  v_customer_code:=upper(btrim(coalesce(p_sale->>'customer_barcode','')));
  if v_customer_id is null and v_customer_code<>'' then
    select a.customer_id into v_customer_id from public.customer_loyalty_accounts a
    where upper(a.barcode_token)=v_customer_code or upper(a.membership_number)=v_customer_code limit 1;
  end if;
  if v_customer_id is not null then
    select * into v_customer from public.customers where id=v_customer_id;
    if v_customer.id is null then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
    v_account:=private.ensure_customer_loyalty_account(v_customer_id);
    if v_account.status<>'active' then raise exception using errcode='22023',message='LOYALTY_ACCOUNT_SUSPENDED'; end if;
    if v_customer_code<>'' and upper(v_account.barcode_token)<>v_customer_code and upper(v_account.membership_number)<>v_customer_code then
      raise exception using errcode='22023',message='CUSTOMER_CODE_MISMATCH';
    end if;
  end if;

  update public.pos_devices set last_seen_at=now(),updated_at=now() where id=v_device_id;
  v_result:=private.create_pos_sale(p_request_id,p_branch_id,p_sale-'device_token');

  if v_customer_id is not null then
    update public.sales set customer_id=v_customer_id
    where id=p_request_id and (customer_id is null or customer_id=v_customer_id);
    if not found then raise exception using errcode='42501',message='CUSTOMER_SALE_CONFLICT'; end if;
    select to_jsonb(s) into v_saved from public.sales s where s.id=p_request_id;
    v_result:=v_result||coalesce(v_saved,'{}'::jsonb);
  end if;
  return v_result;
end;
$$;
