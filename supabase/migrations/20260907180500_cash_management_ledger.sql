-- Branch cash management source of truth.
-- Legacy cash_transactions / cash_transfers stay for compatibility; new runtime uses cash_accounts + cash_ledger.

create table if not exists public.cash_accounts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  account_type text not null check (account_type in ('branch_safe','pos_drawer')),
  device_id uuid references public.pos_devices(id) on delete restrict,
  name text not null,
  currency text not null default 'EGP',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((account_type='pos_drawer' and device_id is not null) or (account_type='branch_safe' and device_id is null))
);
create unique index if not exists cash_accounts_one_safe_per_branch on public.cash_accounts(branch_id) where account_type='branch_safe' and active;
create unique index if not exists cash_accounts_one_drawer_per_device on public.cash_accounts(device_id) where account_type='pos_drawer' and active;

-- cash_transfers predates the ledger. Extend it instead of replacing historical data.
alter table public.cash_transfers add column if not exists from_account_id uuid references public.cash_accounts(id);
alter table public.cash_transfers add column if not exists to_account_id uuid references public.cash_accounts(id);
alter table public.cash_transfers add column if not exists status text not null default 'completed';
alter table public.cash_transfers add column if not exists shift_id uuid references public.pos_shifts(id);
alter table public.cash_transfers drop constraint if exists cash_transfers_from_register_check;
alter table public.cash_transfers drop constraint if exists cash_transfers_to_register_check;
alter table public.cash_transfers add constraint cash_transfers_from_register_check check (from_register in ('store','online','safe','drawer'));
alter table public.cash_transfers add constraint cash_transfers_to_register_check check (to_register in ('store','online','safe','drawer'));
create index if not exists cash_transfers_from_account_idx on public.cash_transfers(from_account_id) where from_account_id is not null;
create index if not exists cash_transfers_to_account_idx on public.cash_transfers(to_account_id) where to_account_id is not null;
create index if not exists cash_transfers_shift_idx on public.cash_transfers(shift_id) where shift_id is not null;

create table if not exists public.cash_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.cash_accounts(id),
  branch_id uuid not null references public.branches(id),
  shift_id uuid references public.pos_shifts(id),
  device_id uuid references public.pos_devices(id),
  user_id uuid references public.users(id),
  entry_type text not null,
  signed_amount numeric(14,2) not null check (signed_amount<>0),
  reference_type text,
  reference_id uuid,
  transfer_id uuid references public.cash_transfers(id),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);
create index if not exists cash_ledger_account_created_idx on public.cash_ledger(account_id,created_at);
create index if not exists cash_ledger_shift_idx on public.cash_ledger(shift_id) where shift_id is not null;
create index if not exists cash_ledger_branch_created_idx on public.cash_ledger(branch_id,created_at);
create unique index if not exists cash_ledger_reference_once_idx on public.cash_ledger(account_id,reference_type,reference_id,entry_type) where reference_id is not null;

alter table public.cash_accounts enable row level security;
alter table public.cash_transfers enable row level security;
alter table public.cash_ledger enable row level security;
revoke all on public.cash_accounts,public.cash_transfers,public.cash_ledger from anon,authenticated;

create or replace function private.prevent_cash_ledger_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception using errcode='55000',message='CASH_LEDGER_IMMUTABLE';
end; $$;
drop trigger if exists cash_ledger_immutable on public.cash_ledger;
create trigger cash_ledger_immutable before update or delete on public.cash_ledger for each row execute function private.prevent_cash_ledger_mutation();

create or replace function private.cash_account_balance(p_account_id uuid)
returns numeric language sql stable security definer set search_path='' as $$
  select coalesce(sum(l.signed_amount),0)::numeric(14,2) from public.cash_ledger l where l.account_id=p_account_id;
$$;
revoke all on function private.cash_account_balance(uuid) from public,anon,authenticated;

create or replace function private.ensure_branch_safe_account(p_branch_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_name text;
begin
  select id into v_id from public.cash_accounts where branch_id=p_branch_id and account_type='branch_safe' and active limit 1;
  if v_id is not null then return v_id; end if;
  select name into v_name from public.branches where id=p_branch_id;
  if v_name is null then raise exception using errcode='22023',message='BRANCH_NOT_FOUND'; end if;
  insert into public.cash_accounts(branch_id,account_type,name) values(p_branch_id,'branch_safe','الخزنة الرئيسية - '||v_name) on conflict do nothing;
  select id into v_id from public.cash_accounts where branch_id=p_branch_id and account_type='branch_safe' and active limit 1;
  return v_id;
end; $$;
revoke all on function private.ensure_branch_safe_account(uuid) from public,anon,authenticated;

create or replace function private.ensure_pos_drawer_account(p_device_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_device public.pos_devices%rowtype;
begin
  select id into v_id from public.cash_accounts where device_id=p_device_id and account_type='pos_drawer' and active limit 1;
  if v_id is not null then return v_id; end if;
  select * into v_device from public.pos_devices where id=p_device_id;
  if v_device.id is null then raise exception using errcode='22023',message='DEVICE_NOT_FOUND'; end if;
  insert into public.cash_accounts(branch_id,account_type,device_id,name) values(v_device.branch_id,'pos_drawer',v_device.id,'درج '||v_device.name) on conflict do nothing;
  select id into v_id from public.cash_accounts where device_id=p_device_id and account_type='pos_drawer' and active limit 1;
  return v_id;
end; $$;
revoke all on function private.ensure_pos_drawer_account(uuid) from public,anon,authenticated;

insert into public.cash_accounts(branch_id,account_type,name)
select b.id,'branch_safe','الخزنة الرئيسية - '||b.name from public.branches b
where not exists(select 1 from public.cash_accounts ca where ca.branch_id=b.id and ca.account_type='branch_safe' and ca.active)
on conflict do nothing;
insert into public.cash_accounts(branch_id,account_type,device_id,name)
select d.branch_id,'pos_drawer',d.id,'درج '||d.name from public.pos_devices d
where not exists(select 1 from public.cash_accounts ca where ca.device_id=d.id and ca.account_type='pos_drawer' and ca.active)
on conflict do nothing;

alter table public.pos_shifts add column if not exists drawer_account_id uuid references public.cash_accounts(id);
alter table public.pos_shifts add column if not exists opening_system_balance numeric(14,2);
alter table public.pos_shifts add column if not exists opening_variance numeric(14,2) not null default 0;
update public.pos_shifts s set drawer_account_id=ca.id from public.cash_accounts ca
where s.drawer_account_id is null and ca.device_id=s.device_id and ca.account_type='pos_drawer' and ca.active;

insert into public.cash_ledger(account_id,branch_id,shift_id,device_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,created_by,created_at)
select s.drawer_account_id,s.branch_id,s.id,s.device_id,s.user_id,'initial_float',s.opening_cash,'pos_shift',s.id,'رصيد بداية النظام النقدي',s.user_id,s.opened_at
from public.pos_shifts s
where s.status='open' and s.drawer_account_id is not null and s.opening_cash<>0
  and not exists(select 1 from public.cash_ledger l where l.account_id=s.drawer_account_id)
on conflict do nothing;
update public.pos_shifts s set opening_system_balance=private.cash_account_balance(s.drawer_account_id)
where s.status='open' and s.drawer_account_id is not null and s.opening_system_balance is null;

insert into public.staff_permissions(code,name_ar,module,description) values
 ('pos.cash_drop','توريد نقدية للخزنة','pos','تحويل نقدية من درج الكاشير إلى خزنة الفرع'),
 ('pos.cash_float','إضافة فكة للدرج','pos','تحويل نقدية من خزنة الفرع إلى درج الكاشير'),
 ('pos.reconcile_cash','تسوية رصيد الدرج','pos','اعتماد فروق العد عند فتح أو إغلاق الوردية')
on conflict (code) do nothing;
insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r cross join public.staff_permissions p where r.code='cashier' and p.code='pos.cash_drop' on conflict do nothing;
insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r cross join public.staff_permissions p
where r.code in ('branch_manager','branch_admin','super_admin') and p.code in ('pos.cash_drop','pos.cash_float','pos.reconcile_cash') on conflict do nothing;

create or replace function public.open_pos_shift(p_device_id uuid,p_device_token text,p_opening_cash numeric default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device public.pos_devices%rowtype; v_shift public.pos_shifts%rowtype; v_other public.pos_shifts%rowtype;
  v_account uuid; v_balance numeric; v_count bigint; v_diff numeric;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_opening_cash is null or p_opening_cash<0 or p_opening_cash::text in ('NaN','Infinity','-Infinity') then raise exception using errcode='22023',message='INVALID_OPENING_CASH'; end if;
  v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());
  perform pg_advisory_xact_lock(hashtextextended('pos-device:'||v_device.id::text,11));
  perform pg_advisory_xact_lock(hashtextextended('pos-user:'||auth.uid()::text,12));
  select * into v_shift from public.pos_shifts where device_id=v_device.id and status='open' for update;
  if v_shift.id is not null then
    if v_shift.user_id=auth.uid() then return to_jsonb(v_shift)||jsonb_build_object('already_open',true,'drawer_balance',private.cash_account_balance(v_shift.drawer_account_id)); end if;
    raise exception using errcode='55000',message='DEVICE_SHIFT_BUSY';
  end if;
  select * into v_other from public.pos_shifts where user_id=auth.uid() and status='open' for update;
  if v_other.id is not null then raise exception using errcode='55000',message='USER_SHIFT_ALREADY_OPEN'; end if;
  v_account:=private.ensure_pos_drawer_account(v_device.id);
  select count(*) into v_count from public.cash_ledger where account_id=v_account;
  v_balance:=private.cash_account_balance(v_account);
  if v_count=0 then
    if round(p_opening_cash,2)<>0 then
      insert into public.cash_ledger(account_id,branch_id,device_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,created_by)
      values(v_account,v_device.branch_id,v_device.id,auth.uid(),'initial_float',round(p_opening_cash,2),'pos_device',v_device.id,'رصيد افتتاحي أولي للدرج',auth.uid());
    end if;
    v_balance:=round(p_opening_cash,2); v_diff:=0;
  else
    v_diff:=round(p_opening_cash-v_balance,2);
    if v_diff<>0 then
      if not public.staff_has_permission('pos.reconcile_cash',v_device.branch_id) then
        raise exception using errcode='55000',message='OPENING_CASH_MISMATCH|'||to_char(v_balance,'FM9999999990.00');
      end if;
      insert into public.cash_ledger(account_id,branch_id,device_id,user_id,entry_type,signed_amount,reference_type,description,metadata,created_by)
      values(v_account,v_device.branch_id,v_device.id,auth.uid(),'shift_open_reconciliation',v_diff,'pos_shift','تسوية فرق العد عند فتح الوردية',jsonb_build_object('system_balance',v_balance,'counted_cash',round(p_opening_cash,2)),auth.uid());
    end if;
  end if;
  insert into public.pos_shifts(user_id,branch_id,device_id,opening_cash,drawer_account_id,opening_system_balance,opening_variance)
  values(auth.uid(),v_device.branch_id,v_device.id,round(p_opening_cash,2),v_account,v_balance,coalesce(v_diff,0)) returning * into v_shift;
  update public.pos_devices set last_seen_at=now(),updated_at=now() where id=v_device.id;
  return to_jsonb(v_shift)||jsonb_build_object('already_open',false,'device_name',v_device.name,'branch_name',(select b.name from public.branches b where b.id=v_device.branch_id),'drawer_balance',private.cash_account_balance(v_account));
end; $$;

create or replace function public.close_pos_shift(p_shift_id uuid,p_device_id uuid,p_device_token text,p_closing_cash numeric,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device public.pos_devices%rowtype; v_shift public.pos_shifts%rowtype; v_expected numeric; v_diff numeric; v_movement numeric; v_sales_count bigint; v_sales_total numeric;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_closing_cash is null or p_closing_cash<0 or p_closing_cash::text in ('NaN','Infinity','-Infinity') then raise exception using errcode='22023',message='INVALID_CLOSING_CASH'; end if;
  select * into v_device from public.pos_devices where id=p_device_id;
  if v_device.id is null or not v_device.active or v_device.revoked_at is not null or encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex') is distinct from v_device.device_token_hash then raise exception using errcode='42501',message='DEVICE_UNAVAILABLE'; end if;
  select * into v_shift from public.pos_shifts where id=p_shift_id for update;
  if v_shift.id is null or v_shift.status<>'open' or v_shift.device_id<>v_device.id then raise exception using errcode='22023',message='SHIFT_NOT_OPEN'; end if;
  if auth.uid()<>v_shift.user_id and not public.staff_has_permission('pos.manage_shifts',v_shift.branch_id) then raise exception using errcode='42501',message='SHIFT_ACCESS_DENIED'; end if;
  v_expected:=private.cash_account_balance(v_shift.drawer_account_id); v_diff:=round(p_closing_cash-v_expected,2);
  select coalesce(sum(l.signed_amount),0) into v_movement from public.cash_ledger l where l.shift_id=v_shift.id;
  select count(*),coalesce(sum(total),0) into v_sales_count,v_sales_total from public.sales where shift_id=v_shift.id;
  update public.pos_shifts set status='closed',closed_at=now(),closing_cash=round(p_closing_cash,2),expected_cash=v_expected,cash_difference=v_diff,
    closing_notes=nullif(trim(coalesce(p_notes,'')),''),closed_by=auth.uid(),updated_at=now() where id=v_shift.id returning * into v_shift;
  if v_diff<>0 then
    insert into public.cash_ledger(account_id,branch_id,shift_id,device_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by)
    values(v_shift.drawer_account_id,v_shift.branch_id,v_shift.id,v_shift.device_id,v_shift.user_id,'shift_close_variance',v_diff,'pos_shift',v_shift.id,'تسوية فرق إغلاق الوردية',jsonb_build_object('expected_cash',v_expected,'counted_cash',round(p_closing_cash,2)),auth.uid());
  end if;
  return to_jsonb(v_shift)||jsonb_build_object('cash_movement',v_movement,'sales_count',v_sales_count,'sales_total',v_sales_total,'drawer_balance_after',private.cash_account_balance(v_shift.drawer_account_id),'employee_name',(select u.name from public.users u where u.id=v_shift.user_id),'device_name',v_device.name,'branch_name',(select b.name from public.branches b where b.id=v_shift.branch_id));
end; $$;

create or replace function private.record_pos_sale_cash()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_shift public.pos_shifts%rowtype;
begin
  if coalesce(new.cash_amount,0)<=0 then return new; end if;
  select * into v_shift from public.pos_shifts where id=new.shift_id;
  if v_shift.id is null or v_shift.drawer_account_id is null then raise exception using errcode='55000',message='POS_SHIFT_CASH_ACCOUNT_MISSING'; end if;
  insert into public.cash_ledger(account_id,branch_id,shift_id,device_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,created_by,created_at)
  values(v_shift.drawer_account_id,new.branch_id,v_shift.id,new.device_id,new.cashier_id,'sale_cash',round(new.cash_amount,2),'sale',new.id,'مبيعات نقدية - فاتورة '||coalesce(new.invoice_number,new.id::text),new.cashier_id,coalesce(new.date,now())) on conflict do nothing;
  return new;
end; $$;
drop trigger if exists record_pos_sale_cash on public.sales;
create trigger record_pos_sale_cash after insert on public.sales for each row execute function private.record_pos_sale_cash();

create or replace function public.get_my_pos_cash_summary(p_device_id uuid,p_device_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_device public.pos_devices%rowtype; v_shift public.pos_shifts%rowtype; v_account uuid; v_balance numeric; v_sales numeric; v_refunds numeric; v_expenses numeric; v_in numeric; v_out numeric; v_adjustments numeric;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());
  select id into v_account from public.cash_accounts where device_id=v_device.id and account_type='pos_drawer' and active limit 1;
  if v_account is null then raise exception using errcode='55000',message='DRAWER_ACCOUNT_MISSING'; end if;
  select * into v_shift from public.pos_shifts where user_id=auth.uid() and device_id=v_device.id and branch_id=v_device.branch_id and status='open' order by opened_at desc limit 1;
  v_balance:=private.cash_account_balance(v_account);
  select coalesce(sum(signed_amount) filter(where entry_type='sale_cash'),0),coalesce(sum(signed_amount) filter(where entry_type='refund_cash'),0),
    coalesce(sum(signed_amount) filter(where entry_type='expense_cash'),0),coalesce(sum(signed_amount) filter(where entry_type='transfer_in'),0),
    coalesce(-sum(signed_amount) filter(where entry_type='transfer_out'),0),coalesce(sum(signed_amount) filter(where entry_type in ('shift_open_reconciliation','shift_close_variance')),0)
  into v_sales,v_refunds,v_expenses,v_in,v_out,v_adjustments from public.cash_ledger where shift_id=v_shift.id;
  return jsonb_build_object('drawer_account_id',v_account,'drawer_balance',v_balance,'branch_id',v_device.branch_id,'device_id',v_device.id,'device_name',v_device.name,'shift_id',v_shift.id,'shift_opened_at',v_shift.opened_at,'opening_cash',v_shift.opening_cash,'cash_sales',v_sales,'cash_refunds',v_refunds,'cash_expenses',v_expenses,'transfers_in',v_in,'transfers_out',v_out,'adjustments',v_adjustments);
end; $$;

create or replace function public.cash_drop_to_safe(p_device_id uuid,p_device_token text,p_amount numeric,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device public.pos_devices%rowtype; v_shift public.pos_shifts%rowtype; v_drawer uuid; v_safe uuid; v_transfer uuid; v_balance numeric;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_amount is null or p_amount<=0 or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception using errcode='22023',message='INVALID_AMOUNT'; end if;
  v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());
  if not public.staff_has_permission('pos.cash_drop',v_device.branch_id) then raise exception using errcode='42501',message='CASH_DROP_DENIED'; end if;
  select * into v_shift from public.pos_shifts where user_id=auth.uid() and device_id=v_device.id and status='open' for update;
  if v_shift.id is null then raise exception using errcode='55000',message='SHIFT_NOT_OPEN'; end if;
  v_drawer:=v_shift.drawer_account_id; v_safe:=private.ensure_branch_safe_account(v_device.branch_id);
  perform pg_advisory_xact_lock(hashtextextended('cash-account:'||v_drawer::text,31)); v_balance:=private.cash_account_balance(v_drawer);
  if round(p_amount,2)>v_balance then raise exception using errcode='22023',message='INSUFFICIENT_DRAWER_CASH'; end if;
  insert into public.cash_transfers(branch_id,amount,from_register,to_register,notes,created_by,from_account_id,to_account_id,status,shift_id)
  values(v_device.branch_id,round(p_amount,2),'store','safe',nullif(trim(coalesce(p_note,'')),''),auth.uid(),v_drawer,v_safe,'completed',v_shift.id) returning id into v_transfer;
  insert into public.cash_ledger(account_id,branch_id,shift_id,device_id,user_id,entry_type,signed_amount,reference_type,reference_id,transfer_id,description,created_by) values
   (v_drawer,v_device.branch_id,v_shift.id,v_device.id,auth.uid(),'transfer_out',-round(p_amount,2),'cash_transfer',v_transfer,v_transfer,'توريد نقدية إلى خزنة الفرع',auth.uid()),
   (v_safe,v_device.branch_id,v_shift.id,v_device.id,auth.uid(),'transfer_in',round(p_amount,2),'cash_transfer',v_transfer,v_transfer,'توريد من درج '||v_device.name,auth.uid());
  return jsonb_build_object('transfer_id',v_transfer,'amount',round(p_amount,2),'drawer_balance',private.cash_account_balance(v_drawer));
end; $$;

create or replace function public.get_branch_cash_overview(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_safe uuid; v_safe_balance numeric; v_drawers jsonb; v_total numeric;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('pos.manage_shifts',p_branch_id) or private.can_manage_financial_branch(p_branch_id)) then raise exception using errcode='42501',message='CASH_OVERVIEW_DENIED'; end if;
  select id into v_safe from public.cash_accounts where branch_id=p_branch_id and account_type='branch_safe' and active limit 1;
  if v_safe is null then raise exception using errcode='55000',message='SAFE_ACCOUNT_MISSING'; end if;
  v_safe_balance:=private.cash_account_balance(v_safe);
  select coalesce(jsonb_agg(jsonb_build_object('account_id',ca.id,'device_id',ca.device_id,'device_name',d.name,'device_code',d.device_code,'balance',private.cash_account_balance(ca.id),'shift_id',s.id,'shift_user_id',s.user_id,'shift_employee_name',u.name,'shift_opened_at',s.opened_at) order by d.name),'[]'::jsonb)
  into v_drawers from public.cash_accounts ca join public.pos_devices d on d.id=ca.device_id left join public.pos_shifts s on s.device_id=d.id and s.status='open' left join public.users u on u.id=s.user_id where ca.branch_id=p_branch_id and ca.account_type='pos_drawer' and ca.active;
  select coalesce(sum(private.cash_account_balance(ca.id)),0) into v_total from public.cash_accounts ca where ca.branch_id=p_branch_id and ca.active;
  return jsonb_build_object('branch_id',p_branch_id,'safe_account_id',v_safe,'safe_balance',v_safe_balance,'drawers',v_drawers,'total_cash',v_total);
end; $$;

create or replace function public.initialize_branch_safe(p_branch_id uuid,p_amount numeric,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_safe uuid; v_count bigint;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not public.staff_has_permission('pos.reconcile_cash',p_branch_id) then raise exception using errcode='42501',message='SAFE_INIT_DENIED'; end if;
  if p_amount is null or p_amount<0 or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception using errcode='22023',message='INVALID_AMOUNT'; end if;
  v_safe:=private.ensure_branch_safe_account(p_branch_id); select count(*) into v_count from public.cash_ledger where account_id=v_safe;
  if v_count>0 then raise exception using errcode='55000',message='SAFE_ALREADY_INITIALIZED'; end if;
  if round(p_amount,2)<>0 then insert into public.cash_ledger(account_id,branch_id,user_id,entry_type,signed_amount,reference_type,description,metadata,created_by)
    values(v_safe,p_branch_id,auth.uid(),'initial_safe_balance',round(p_amount,2),'branch_safe','رصيد افتتاحي للخزنة الرئيسية',jsonb_build_object('note',nullif(trim(coalesce(p_note,'')),'')),auth.uid()); end if;
  return jsonb_build_object('safe_account_id',v_safe,'safe_balance',private.cash_account_balance(v_safe));
end; $$;

create or replace function public.add_float_to_pos_drawer(p_branch_id uuid,p_device_id uuid,p_amount numeric,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_safe uuid; v_drawer uuid; v_transfer uuid; v_safe_balance numeric; v_device public.pos_devices%rowtype; v_shift public.pos_shifts%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not public.staff_has_permission('pos.cash_float',p_branch_id) then raise exception using errcode='42501',message='CASH_FLOAT_DENIED'; end if;
  if p_amount is null or p_amount<=0 or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception using errcode='22023',message='INVALID_AMOUNT'; end if;
  select * into v_device from public.pos_devices where id=p_device_id and branch_id=p_branch_id and active and revoked_at is null;
  if v_device.id is null then raise exception using errcode='22023',message='DEVICE_UNAVAILABLE'; end if;
  v_safe:=private.ensure_branch_safe_account(p_branch_id); v_drawer:=private.ensure_pos_drawer_account(p_device_id);
  perform pg_advisory_xact_lock(hashtextextended('cash-account:'||v_safe::text,32)); v_safe_balance:=private.cash_account_balance(v_safe);
  if round(p_amount,2)>v_safe_balance then raise exception using errcode='22023',message='INSUFFICIENT_SAFE_CASH'; end if;
  select * into v_shift from public.pos_shifts where device_id=p_device_id and status='open' order by opened_at desc limit 1;
  insert into public.cash_transfers(branch_id,amount,from_register,to_register,notes,created_by,from_account_id,to_account_id,status,shift_id)
  values(p_branch_id,round(p_amount,2),'safe','store',nullif(trim(coalesce(p_note,'')),''),auth.uid(),v_safe,v_drawer,'completed',v_shift.id) returning id into v_transfer;
  insert into public.cash_ledger(account_id,branch_id,shift_id,device_id,user_id,entry_type,signed_amount,reference_type,reference_id,transfer_id,description,created_by) values
   (v_safe,p_branch_id,v_shift.id,p_device_id,v_shift.user_id,'transfer_out',-round(p_amount,2),'cash_transfer',v_transfer,v_transfer,'إضافة فكة إلى درج '||v_device.name,auth.uid()),
   (v_drawer,p_branch_id,v_shift.id,p_device_id,v_shift.user_id,'transfer_in',round(p_amount,2),'cash_transfer',v_transfer,v_transfer,'فكة من الخزنة الرئيسية',auth.uid());
  return jsonb_build_object('transfer_id',v_transfer,'safe_balance',private.cash_account_balance(v_safe),'drawer_balance',private.cash_account_balance(v_drawer));
end; $$;

revoke all on function public.get_my_pos_cash_summary(uuid,text) from public,anon;
revoke all on function public.cash_drop_to_safe(uuid,text,numeric,text) from public,anon;
revoke all on function public.get_branch_cash_overview(uuid) from public,anon;
revoke all on function public.initialize_branch_safe(uuid,numeric,text) from public,anon;
revoke all on function public.add_float_to_pos_drawer(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.get_my_pos_cash_summary(uuid,text) to authenticated;
grant execute on function public.cash_drop_to_safe(uuid,text,numeric,text) to authenticated;
grant execute on function public.get_branch_cash_overview(uuid) to authenticated;
grant execute on function public.initialize_branch_safe(uuid,numeric,text) to authenticated;
grant execute on function public.add_float_to_pos_drawer(uuid,uuid,numeric,text) to authenticated;
grant execute on function public.open_pos_shift(uuid,text,numeric) to authenticated;
grant execute on function public.close_pos_shift(uuid,uuid,text,numeric,text) to authenticated;
