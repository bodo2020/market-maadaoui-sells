create table if not exists private.supplier_representatives_v1 (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text not null,
  phone text,
  active boolean not null default true,
  can_receive_payments boolean not null default false,
  payout_method text,
  payout_destination text,
  payment_limit numeric(12,2),
  notes text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_representatives_v1_name_check check (length(trim(name)) > 0),
  constraint supplier_representatives_v1_payment_limit_check check (payment_limit is null or payment_limit >= 0)
);
create index if not exists supplier_representatives_v1_branch_supplier_idx on private.supplier_representatives_v1(branch_id,supplier_id,active);
create index if not exists supplier_representatives_v1_supplier_idx on private.supplier_representatives_v1(supplier_id);
create index if not exists supplier_representatives_v1_created_by_idx on private.supplier_representatives_v1(created_by);
create index if not exists supplier_representatives_v1_updated_by_idx on private.supplier_representatives_v1(updated_by);

create table if not exists private.finance_wallet_operations_v4 (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  branch_id uuid not null references public.branches(id) on delete restrict,
  payment_account_id uuid not null references public.payment_accounts(id) on delete restrict,
  operation_type text not null,
  principal_amount numeric(12,2) not null,
  expected_fee_amount numeric(12,2) not null default 0,
  actual_fee_amount numeric(12,2) not null default 0,
  fee_saving_amount numeric(12,2) not null default 0,
  total_debit numeric(12,2) not null,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  representative_id uuid references private.supplier_representatives_v1(id) on delete set null,
  purchase_id uuid references public.purchases(id) on delete set null,
  expense_id uuid references public.expenses(id) on delete set null,
  apply_to_supplier boolean not null default false,
  provider_reference text,
  note text,
  status text not null default 'posted',
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  voided_by uuid references public.users(id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  constraint finance_wallet_operations_v4_type_check check (operation_type in ('expense','supplier_payment')),
  constraint finance_wallet_operations_v4_principal_check check (principal_amount > 0),
  constraint finance_wallet_operations_v4_expected_fee_check check (expected_fee_amount >= 0),
  constraint finance_wallet_operations_v4_actual_fee_check check (actual_fee_amount >= 0),
  constraint finance_wallet_operations_v4_total_check check (total_debit = round(principal_amount + actual_fee_amount,2)),
  constraint finance_wallet_operations_v4_status_check check (status in ('posted','voided'))
);
create index if not exists finance_wallet_operations_v4_branch_created_idx on private.finance_wallet_operations_v4(branch_id,created_at desc);
create index if not exists finance_wallet_operations_v4_account_created_idx on private.finance_wallet_operations_v4(payment_account_id,created_at desc);
create index if not exists finance_wallet_operations_v4_supplier_created_idx on private.finance_wallet_operations_v4(supplier_id,created_at desc) where supplier_id is not null;
create index if not exists finance_wallet_operations_v4_representative_idx on private.finance_wallet_operations_v4(representative_id) where representative_id is not null;
create index if not exists finance_wallet_operations_v4_purchase_idx on private.finance_wallet_operations_v4(purchase_id) where purchase_id is not null;
create index if not exists finance_wallet_operations_v4_expense_idx on private.finance_wallet_operations_v4(expense_id) where expense_id is not null;
create index if not exists finance_wallet_operations_v4_created_by_idx on private.finance_wallet_operations_v4(created_by);
create index if not exists finance_wallet_operations_v4_voided_by_idx on private.finance_wallet_operations_v4(voided_by) where voided_by is not null;

create table if not exists private.supplier_ledger_v1 (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references public.branches(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  entry_type text not null,
  signed_amount numeric(12,2) not null,
  purchase_id uuid references public.purchases(id) on delete set null,
  wallet_operation_id uuid references private.finance_wallet_operations_v4(id) on delete set null,
  representative_id uuid references private.supplier_representatives_v1(id) on delete set null,
  idempotency_key text not null unique,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint supplier_ledger_v1_amount_check check (signed_amount <> 0)
);
create index if not exists supplier_ledger_v1_branch_supplier_created_idx on private.supplier_ledger_v1(branch_id,supplier_id,created_at desc);
create index if not exists supplier_ledger_v1_supplier_created_idx on private.supplier_ledger_v1(supplier_id,created_at desc);
create index if not exists supplier_ledger_v1_purchase_idx on private.supplier_ledger_v1(purchase_id) where purchase_id is not null;
create index if not exists supplier_ledger_v1_wallet_operation_idx on private.supplier_ledger_v1(wallet_operation_id) where wallet_operation_id is not null;
create index if not exists supplier_ledger_v1_representative_idx on private.supplier_ledger_v1(representative_id) where representative_id is not null;
create index if not exists supplier_ledger_v1_created_by_idx on private.supplier_ledger_v1(created_by) where created_by is not null;

alter table public.expenses add column if not exists paid_from_payment_account_id uuid;
alter table public.expenses add column if not exists wallet_operation_id uuid;
alter table public.expenses add column if not exists expected_fee_amount numeric(12,2) not null default 0;
alter table public.expenses add column if not exists actual_fee_amount numeric(12,2) not null default 0;
alter table public.expenses add column if not exists fee_saving_amount numeric(12,2) not null default 0;
do $$
begin
  if not exists(select 1 from pg_constraint where conname='expenses_paid_from_payment_account_id_fkey') then
    alter table public.expenses add constraint expenses_paid_from_payment_account_id_fkey foreign key(paid_from_payment_account_id) references public.payment_accounts(id) on delete restrict;
  end if;
  if not exists(select 1 from pg_constraint where conname='expenses_wallet_operation_id_fkey') then
    alter table public.expenses add constraint expenses_wallet_operation_id_fkey foreign key(wallet_operation_id) references private.finance_wallet_operations_v4(id) on delete set null;
  end if;
  if not exists(select 1 from pg_constraint where conname='expenses_wallet_source_exclusive_check') then
    alter table public.expenses add constraint expenses_wallet_source_exclusive_check check (not (paid_from_account_id is not null and paid_from_payment_account_id is not null));
  end if;
  if not exists(select 1 from pg_constraint where conname='expenses_expected_fee_amount_check') then
    alter table public.expenses add constraint expenses_expected_fee_amount_check check(expected_fee_amount>=0);
  end if;
  if not exists(select 1 from pg_constraint where conname='expenses_actual_fee_amount_check') then
    alter table public.expenses add constraint expenses_actual_fee_amount_check check(actual_fee_amount>=0);
  end if;
end $$;
create index if not exists expenses_paid_from_payment_account_idx on public.expenses(paid_from_payment_account_id) where paid_from_payment_account_id is not null;
create index if not exists expenses_wallet_operation_idx on public.expenses(wallet_operation_id) where wallet_operation_id is not null;

alter table private.supplier_representatives_v1 enable row level security;
alter table private.finance_wallet_operations_v4 enable row level security;
alter table private.supplier_ledger_v1 enable row level security;
revoke all on private.supplier_representatives_v1 from public,anon,authenticated;
revoke all on private.finance_wallet_operations_v4 from public,anon,authenticated;
revoke all on private.supplier_ledger_v1 from public,anon,authenticated;

create or replace function private.finance_wallet_fee_v1(p_branch_id uuid,p_payment_account_id uuid,p_amount numeric)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_method record; v_expected numeric(12,2):=0;
begin
  select ppm.id,ppm.code,ppm.name,ppm.method_type,ppm.fee_type,ppm.fee_value,ppm.fee_bearer,ppm.require_reference
  into v_method from public.pos_payment_methods ppm
  where ppm.branch_id=p_branch_id and ppm.settlement_account_id=p_payment_account_id and ppm.active is true
  order by ppm.updated_at desc nulls last,ppm.created_at desc limit 1;
  if v_method.id is null then
    return jsonb_build_object('method_id',null,'code',null,'name',null,'method_type',null,'fee_type','none','fee_value',0,'fee_bearer','business','require_reference',false,'expected_fee_amount',0);
  end if;
  if coalesce(v_method.fee_bearer,'business')='business' then
    v_expected:=case when v_method.fee_type='percent' then round(coalesce(p_amount,0)*coalesce(v_method.fee_value,0)/100,2)
                     when v_method.fee_type='fixed' then round(coalesce(v_method.fee_value,0),2) else 0 end;
  end if;
  return jsonb_build_object('method_id',v_method.id,'code',v_method.code,'name',v_method.name,'method_type',v_method.method_type,'fee_type',coalesce(v_method.fee_type,'none'),'fee_value',coalesce(v_method.fee_value,0),'fee_bearer',coalesce(v_method.fee_bearer,'business'),'require_reference',coalesce(v_method.require_reference,false),'expected_fee_amount',v_expected);
end $$;
revoke all on function private.finance_wallet_fee_v1(uuid,uuid,numeric) from public,anon,authenticated;

create or replace function private.sync_supplier_balance_from_ledger_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform set_config('app.supplier_balance_internal','on',true);
  update public.suppliers set balance=round(coalesce(balance,0)+new.signed_amount,2),updated_at=now() where id=new.supplier_id;
  perform set_config('app.supplier_balance_internal','',true);
  return new;
end $$;

create or replace function private.guard_supplier_balance_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.balance is distinct from old.balance and coalesce(current_setting('app.supplier_balance_internal',true),'')<>'on' then
    raise exception using errcode='55000',message='SUPPLIER_BALANCE_LEDGER_MANAGED';
  end if;
  return new;
end $$;

insert into private.supplier_ledger_v1(branch_id,supplier_id,entry_type,signed_amount,purchase_id,idempotency_key,description,metadata,created_at)
select p.branch_id,p.supplier_id,'purchase_opening',round(p.total-p.paid,2),p.id,'purchase:'||p.id::text||':opening:v1','رصيد افتتاحي من فاتورة شراء '||coalesce(p.invoice_number,p.id::text),jsonb_build_object('backfill',true,'legacy_unassigned',p.branch_id is null),coalesce(p.date::timestamptz,now())
from public.purchases p where round(p.total-p.paid,2)<>0 on conflict(idempotency_key) do nothing;

insert into private.supplier_ledger_v1(branch_id,supplier_id,entry_type,signed_amount,idempotency_key,description,metadata)
select null,s.id,'legacy_opening_balance',round(coalesce(s.balance,0)-coalesce(x.ledger_balance,0),2),'supplier:'||s.id::text||':legacy-opening:v1','تسوية افتتاحية للحفاظ على رصيد المورد قبل Supplier Ledger V1',jsonb_build_object('backfill',true,'legacy_unassigned',true)
from public.suppliers s left join(select supplier_id,sum(signed_amount) ledger_balance from private.supplier_ledger_v1 group by supplier_id)x on x.supplier_id=s.id
where round(coalesce(s.balance,0)-coalesce(x.ledger_balance,0),2)<>0 on conflict(idempotency_key) do nothing;

select set_config('app.supplier_balance_internal','on',false);
update public.suppliers s set balance=coalesce((select round(sum(l.signed_amount),2) from private.supplier_ledger_v1 l where l.supplier_id=s.id),0),updated_at=now();
select set_config('app.supplier_balance_internal','',false);

drop trigger if exists supplier_ledger_v1_sync_balance_trg on private.supplier_ledger_v1;
create trigger supplier_ledger_v1_sync_balance_trg after insert on private.supplier_ledger_v1 for each row execute function private.sync_supplier_balance_from_ledger_v1();
drop trigger if exists suppliers_balance_guard_v1_trg on public.suppliers;
create trigger suppliers_balance_guard_v1_trg before update of balance on public.suppliers for each row execute function private.guard_supplier_balance_v1();

create or replace function private.sync_purchase_supplier_ledger_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_old_net numeric(12,2):=0; v_new_net numeric(12,2):=0; v_delta numeric(12,2):=0; v_op uuid; v_rep uuid; v_actor uuid; v_key text;
begin
  begin v_actor:=auth.uid(); exception when others then v_actor:=null; end;
  begin v_op:=nullif(current_setting('app.supplier_wallet_operation_id',true),'')::uuid; exception when others then v_op:=null; end;
  begin v_rep:=nullif(current_setting('app.supplier_representative_id',true),'')::uuid; exception when others then v_rep:=null; end;
  if tg_op='INSERT' then
    v_new_net:=round(coalesce(new.total,0)-coalesce(new.paid,0),2);
    if v_new_net<>0 then
      v_key:='purchase:'||new.id::text||':insert:'||txid_current()::text;
      insert into private.supplier_ledger_v1(branch_id,supplier_id,entry_type,signed_amount,purchase_id,wallet_operation_id,representative_id,idempotency_key,description,metadata,created_by,created_at)
      values(new.branch_id,new.supplier_id,'purchase_invoice_net',v_new_net,new.id,v_op,v_rep,v_key,'صافي فاتورة شراء '||coalesce(new.invoice_number,new.id::text),jsonb_build_object('total',new.total,'paid',new.paid,'operation','insert'),v_actor,coalesce(new.date::timestamptz,now()));
    end if; return new;
  elsif tg_op='DELETE' then
    v_old_net:=round(coalesce(old.total,0)-coalesce(old.paid,0),2);
    if v_old_net<>0 then
      v_key:='purchase:'||old.id::text||':delete:'||txid_current()::text;
      insert into private.supplier_ledger_v1(branch_id,supplier_id,entry_type,signed_amount,purchase_id,wallet_operation_id,representative_id,idempotency_key,description,metadata,created_by)
      values(old.branch_id,old.supplier_id,'purchase_void',-v_old_net,null,v_op,v_rep,v_key,'عكس صافي فاتورة شراء '||coalesce(old.invoice_number,old.id::text),jsonb_build_object('purchase_id',old.id,'total',old.total,'paid',old.paid,'operation','delete'),v_actor);
    end if; return old;
  end if;
  v_old_net:=round(coalesce(old.total,0)-coalesce(old.paid,0),2); v_new_net:=round(coalesce(new.total,0)-coalesce(new.paid,0),2);
  if new.supplier_id is distinct from old.supplier_id or new.branch_id is distinct from old.branch_id then
    if v_old_net<>0 then insert into private.supplier_ledger_v1(branch_id,supplier_id,entry_type,signed_amount,purchase_id,idempotency_key,description,metadata,created_by) values(old.branch_id,old.supplier_id,'purchase_reassigned',-v_old_net,new.id,'purchase:'||new.id::text||':reassign-old:'||txid_current()::text,'نقل فاتورة شراء من المورد/الفرع السابق',jsonb_build_object('operation','reassign_old'),v_actor); end if;
    if v_new_net<>0 then insert into private.supplier_ledger_v1(branch_id,supplier_id,entry_type,signed_amount,purchase_id,idempotency_key,description,metadata,created_by) values(new.branch_id,new.supplier_id,'purchase_reassigned',v_new_net,new.id,'purchase:'||new.id::text||':reassign-new:'||txid_current()::text,'نقل فاتورة شراء إلى المورد/الفرع الجديد',jsonb_build_object('operation','reassign_new'),v_actor); end if;
    return new;
  end if;
  v_delta:=round(v_new_net-v_old_net,2);
  if v_delta<>0 then
    v_key:='purchase:'||new.id::text||':update:'||txid_current()::text;
    insert into private.supplier_ledger_v1(branch_id,supplier_id,entry_type,signed_amount,purchase_id,wallet_operation_id,representative_id,idempotency_key,description,metadata,created_by)
    values(new.branch_id,new.supplier_id,case when coalesce(new.paid,0) is distinct from coalesce(old.paid,0) and new.total is not distinct from old.total then 'supplier_payment' else 'purchase_adjustment' end,v_delta,new.id,v_op,v_rep,v_key,case when v_delta<0 then 'تخفيض مديونية فاتورة شراء' else 'زيادة مديونية فاتورة شراء' end,jsonb_build_object('old_total',old.total,'new_total',new.total,'old_paid',old.paid,'new_paid',new.paid),v_actor);
  end if; return new;
end $$;

drop trigger if exists purchases_supplier_ledger_v1_trg on public.purchases;
create trigger purchases_supplier_ledger_v1_trg after insert or delete or update of total,paid,supplier_id,branch_id on public.purchases for each row execute function private.sync_purchase_supplier_ledger_v1();

create or replace function private.protect_expense_financial_fields()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' and (old.paid_from_account_id is not null or old.paid_from_payment_account_id is not null) then raise exception using errcode='55000',message='USE_EXPENSE_VOID'; end if;
  if tg_op='UPDATE' and (old.paid_from_account_id is not null or old.paid_from_payment_account_id is not null) then
    if new.amount is distinct from old.amount or new.branch_id is distinct from old.branch_id or new.paid_from_account_id is distinct from old.paid_from_account_id or new.paid_from_payment_account_id is distinct from old.paid_from_payment_account_id or new.wallet_operation_id is distinct from old.wallet_operation_id or new.payment_method is distinct from old.payment_method or new.shift_id is distinct from old.shift_id or new.expected_fee_amount is distinct from old.expected_fee_amount or new.actual_fee_amount is distinct from old.actual_fee_amount or new.fee_saving_amount is distinct from old.fee_saving_amount then
      raise exception using errcode='55000',message='EXPENSE_FINANCIAL_FIELDS_LOCKED';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;