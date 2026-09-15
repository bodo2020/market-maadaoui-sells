create table if not exists private.pos_receivable_collections_v2 (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  branch_id uuid not null references public.branches(id) on delete restrict,
  shift_id uuid not null references public.pos_shifts(id) on delete restrict,
  device_id uuid not null references public.pos_devices(id) on delete restrict,
  cashier_id uuid not null references public.users(id) on delete restrict,
  party_kind text not null check (party_kind in ('customer','employee')),
  customer_id uuid references public.customers(id) on delete restrict,
  employee_id uuid references public.users(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  customer_fee_amount numeric(14,2) not null default 0 check (customer_fee_amount >= 0),
  merchant_fee_amount numeric(14,2) not null default 0 check (merchant_fee_amount >= 0),
  amount_charged numeric(14,2) not null check (amount_charged > 0),
  balance_before numeric(14,2) not null check (balance_before >= 0),
  balance_after numeric(14,2) not null check (balance_after >= 0),
  payment_breakdown jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint pos_receivable_collections_v2_party_check check (
    (party_kind='customer' and customer_id is not null and employee_id is null)
    or (party_kind='employee' and employee_id is not null and customer_id is null)
  )
);

create table if not exists private.pos_receivable_collection_parts_v2 (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references private.pos_receivable_collections_v2(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  shift_id uuid not null references public.pos_shifts(id) on delete restrict,
  part_order integer not null check (part_order between 1 and 6),
  payment_method_id uuid not null references public.pos_payment_methods(id) on delete restrict,
  method_code_snapshot text not null,
  method_name_snapshot text not null,
  method_type_snapshot text not null,
  settlement_account_id_snapshot uuid,
  base_amount numeric(14,2) not null check (base_amount > 0),
  fee_amount numeric(14,2) not null default 0 check (fee_amount >= 0),
  customer_fee_amount numeric(14,2) not null default 0 check (customer_fee_amount >= 0),
  merchant_fee_amount numeric(14,2) not null default 0 check (merchant_fee_amount >= 0),
  charged_amount numeric(14,2) not null check (charged_amount > 0),
  estimated_net_settlement numeric(14,2) not null check (estimated_net_settlement >= 0),
  reference text,
  created_at timestamptz not null default now(),
  unique(collection_id,payment_method_id),
  unique(collection_id,part_order)
);

create index if not exists pos_receivable_collections_v2_shift_idx on private.pos_receivable_collections_v2(shift_id,created_at desc);
create index if not exists pos_receivable_collections_v2_customer_idx on private.pos_receivable_collections_v2(customer_id,created_at desc) where customer_id is not null;
create index if not exists pos_receivable_collections_v2_employee_idx on private.pos_receivable_collections_v2(employee_id,created_at desc) where employee_id is not null;
create index if not exists pos_receivable_collection_parts_v2_shift_idx on private.pos_receivable_collection_parts_v2(shift_id,method_code_snapshot);

alter table private.pos_receivable_collections_v2 enable row level security;
alter table private.pos_receivable_collection_parts_v2 enable row level security;
revoke all on private.pos_receivable_collections_v2 from public,anon,authenticated;
revoke all on private.pos_receivable_collection_parts_v2 from public,anon,authenticated;

create or replace function public.collect_pos_receivable_v2(
  p_request_id uuid,
  p_branch_id uuid,
  p_device_id uuid,
  p_device_token text,
  p_party_kind text,
  p_party_id uuid,
  p_amount numeric,
  p_payment_splits jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_device public.pos_devices%rowtype;
  v_shift public.pos_shifts%rowtype;
  v_existing private.pos_receivable_collections_v2%rowtype;
  v_customer public.customers%rowtype;
  v_customer_account private.customer_receivable_accounts_v1%rowtype;
  v_employee_account private.hr_employee_wallet_accounts%rowtype;
  v_method public.pos_payment_methods%rowtype;
  v_split jsonb;
  v_method_id uuid;
  v_seen uuid[]:=array[]::uuid[];
  v_reference text;
  v_base numeric(14,2);
  v_fee numeric(14,2);
  v_customer_fee numeric(14,2);
  v_merchant_fee numeric(14,2);
  v_charged numeric(14,2);
  v_net numeric(14,2);
  v_base_sum numeric(14,2):=0;
  v_total_customer_fee numeric(14,2):=0;
  v_total_merchant_fee numeric(14,2):=0;
  v_total_charged numeric(14,2):=0;
  v_part_order integer:=0;
  v_breakdown jsonb:='[]'::jsonb;
  v_collection_id uuid;
  v_before numeric(14,2);
  v_after numeric(14,2);
  v_credit_available numeric(14,2):=0;
  v_recipient uuid;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_request_id is null or p_branch_id is null or p_device_id is null or p_party_id is null then
    raise exception using errcode='22023',message='INVALID_RECEIVABLE_COLLECTION';
  end if;
  if p_party_kind not in ('customer','employee') then raise exception using errcode='22023',message='INVALID_RECEIVABLE_PARTY'; end if;
  if p_amount is null or round(p_amount,2)<=0 then raise exception using errcode='22023',message='INVALID_RECEIVABLE_AMOUNT'; end if;
  if jsonb_typeof(p_payment_splits) is distinct from 'array' or jsonb_array_length(p_payment_splits) not between 1 and 6 then
    raise exception using errcode='22023',message='PAYMENT_SPLITS_REQUIRED';
  end if;
  if not private.staff_is_super_admin(v_uid) and not public.staff_has_permission('pos.use',p_branch_id) then
    raise exception using errcode='42501',message='POS_USE_DENIED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pos-receivable:'||p_request_id::text,91));
  select * into v_existing from private.pos_receivable_collections_v2 where request_id=p_request_id;
  if v_existing.id is not null then
    if v_existing.branch_id<>p_branch_id or v_existing.cashier_id<>v_uid or v_existing.party_kind<>p_party_kind
       or coalesce(v_existing.customer_id,v_existing.employee_id)<>p_party_id then
      raise exception using errcode='42501',message='RECEIVABLE_REQUEST_CONFLICT';
    end if;
    return to_jsonb(v_existing)||jsonb_build_object('idempotent',true,'credit_available',case when v_existing.party_kind='customer' then
      greatest(coalesce((select a.credit_limit from private.customer_receivable_accounts_v1 a where a.branch_id=v_existing.branch_id and a.customer_id=v_existing.customer_id),0)-v_existing.balance_after,0)
      else greatest(coalesce((select a.credit_limit from private.hr_employee_wallet_accounts a where a.employee_id=v_existing.employee_id),0)-v_existing.balance_after,0) end);
  end if;

  v_device:=private.pos_device_for_user(p_device_id,p_device_token,v_uid);
  if v_device.branch_id<>p_branch_id then raise exception using errcode='42501',message='DEVICE_BRANCH_MISMATCH'; end if;
  select * into v_shift from public.pos_shifts
  where user_id=v_uid and branch_id=p_branch_id and device_id=v_device.id and status='open'
  order by opened_at desc limit 1 for update;
  if v_shift.id is null or v_shift.drawer_account_id is null then raise exception using errcode='55000',message='SHIFT_NOT_OPEN'; end if;

  if p_party_kind='customer' then
    select * into v_customer from public.customers where id=p_party_id;
    if v_customer.id is null then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
    select * into v_customer_account from private.customer_receivable_accounts_v1 where branch_id=p_branch_id and customer_id=p_party_id for update;
    if v_customer_account.customer_id is null or not v_customer_account.active then raise exception using errcode='22023',message='CUSTOMER_RECEIVABLE_NOT_FOUND'; end if;
    v_before:=round(coalesce(v_customer_account.balance,0),2);
    v_recipient:=v_customer.user_id;
  else
    select * into v_employee_account from private.hr_employee_wallet_accounts where employee_id=p_party_id for update;
    if v_employee_account.employee_id is null or not v_employee_account.active then raise exception using errcode='22023',message='EMPLOYEE_WALLET_NOT_ACTIVE'; end if;
    if v_employee_account.branch_id is distinct from p_branch_id and not exists(select 1 from public.user_branch_roles ubr where ubr.user_id=p_party_id and ubr.branch_id=p_branch_id and ubr.active) then raise exception using errcode='22023',message='EMPLOYEE_BRANCH_MISMATCH'; end if;
    v_before:=round(coalesce(v_employee_account.receivable_balance,0),2);
    v_recipient:=p_party_id;
  end if;
  if v_before<=0 then raise exception using errcode='23514',message='NO_RECEIVABLE_BALANCE'; end if;
  if round(p_amount,2)>v_before+0.009 then raise exception using errcode='23514',message='RECEIVABLE_PAYMENT_EXCEEDS_BALANCE'; end if;

  for v_split in select value from jsonb_array_elements(p_payment_splits) loop
    v_part_order:=v_part_order+1;
    begin v_method_id:=nullif(v_split->>'payment_method_id','')::uuid; v_base:=round(coalesce((v_split->>'base_amount')::numeric,0),2); exception when others then raise exception using errcode='22023',message='INVALID_PAYMENT_SPLIT'; end;
    if v_method_id is null or v_base<=0 then raise exception using errcode='22023',message='INVALID_PAYMENT_SPLIT'; end if;
    if v_method_id=any(v_seen) then raise exception using errcode='22023',message='DUPLICATE_PAYMENT_METHOD'; end if;
    v_seen:=array_append(v_seen,v_method_id);
    select * into v_method from public.pos_payment_methods where id=v_method_id and branch_id=p_branch_id and active;
    if v_method.id is null then raise exception using errcode='22023',message='PAYMENT_METHOD_UNAVAILABLE'; end if;
    if v_method.code in ('employee_credit','customer_credit') or coalesce((v_method.metadata->>'internal_only')::boolean,false) then raise exception using errcode='22023',message='CREDIT_CANNOT_PAY_RECEIVABLE'; end if;
    v_reference:=nullif(btrim(coalesce(v_split->>'reference','')),'');
    if v_method.require_reference and v_reference is null then raise exception using errcode='22023',message='PAYMENT_REFERENCE_REQUIRED'; end if;
    v_fee:=case v_method.fee_type when 'percent' then round(v_base*coalesce(v_method.fee_value,0)/100,2) when 'fixed' then round(coalesce(v_method.fee_value,0),2) else 0 end;
    if v_method.method_type='cash' and v_fee>0 then raise exception using errcode='22023',message='CASH_SPLIT_FEE_UNSUPPORTED'; end if;
    v_customer_fee:=case when v_method.fee_bearer='customer' then v_fee else 0 end;
    v_merchant_fee:=case when v_method.fee_bearer='business' then v_fee else 0 end;
    v_charged:=round(v_base+v_customer_fee,2); v_net:=greatest(round(v_charged-v_fee,2),0);
    v_base_sum:=round(v_base_sum+v_base,2); v_total_customer_fee:=round(v_total_customer_fee+v_customer_fee,2); v_total_merchant_fee:=round(v_total_merchant_fee+v_merchant_fee,2); v_total_charged:=round(v_total_charged+v_charged,2);
    v_breakdown:=v_breakdown||jsonb_build_array(jsonb_build_object('part_order',v_part_order,'payment_method_id',v_method.id,'code',v_method.code,'name',v_method.name,'method_type',v_method.method_type,'settlement_account_id',v_method.settlement_account_id,'base_amount',v_base,'fee_amount',v_fee,'customer_fee_amount',v_customer_fee,'merchant_fee_amount',v_merchant_fee,'charged_amount',v_charged,'estimated_net_settlement',v_net,'reference',v_reference));
  end loop;
  if abs(v_base_sum-round(p_amount,2))>0.009 then raise exception using errcode='22023',message='INVALID_PAYMENT_SPLIT'; end if;

  v_after:=round(v_before-round(p_amount,2),2);
  insert into private.pos_receivable_collections_v2(request_id,branch_id,shift_id,device_id,cashier_id,party_kind,customer_id,employee_id,amount,customer_fee_amount,merchant_fee_amount,amount_charged,balance_before,balance_after,payment_breakdown)
  values(p_request_id,p_branch_id,v_shift.id,v_device.id,v_uid,p_party_kind,case when p_party_kind='customer' then p_party_id end,case when p_party_kind='employee' then p_party_id end,round(p_amount,2),v_total_customer_fee,v_total_merchant_fee,v_total_charged,v_before,v_after,v_breakdown) returning id into v_collection_id;

  v_part_order:=0;
  for v_split in select value from jsonb_array_elements(v_breakdown) loop
    v_part_order:=v_part_order+1;
    insert into private.pos_receivable_collection_parts_v2(collection_id,branch_id,shift_id,part_order,payment_method_id,method_code_snapshot,method_name_snapshot,method_type_snapshot,settlement_account_id_snapshot,base_amount,fee_amount,customer_fee_amount,merchant_fee_amount,charged_amount,estimated_net_settlement,reference)
    values(v_collection_id,p_branch_id,v_shift.id,v_part_order,(v_split->>'payment_method_id')::uuid,v_split->>'code',v_split->>'name',v_split->>'method_type',nullif(v_split->>'settlement_account_id','')::uuid,(v_split->>'base_amount')::numeric,(v_split->>'fee_amount')::numeric,(v_split->>'customer_fee_amount')::numeric,(v_split->>'merchant_fee_amount')::numeric,(v_split->>'charged_amount')::numeric,(v_split->>'estimated_net_settlement')::numeric,nullif(v_split->>'reference',''));
    if v_split->>'method_type'='cash' then
      insert into public.cash_ledger(account_id,branch_id,shift_id,device_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by)
      values(v_shift.drawer_account_id,p_branch_id,v_shift.id,v_device.id,v_uid,'receivable_collection',(v_split->>'base_amount')::numeric,'pos_receivable_collection',v_collection_id,'تحصيل مديونية من نقطة البيع',jsonb_build_object('party_kind',p_party_kind,'party_id',p_party_id,'base_amount',(v_split->>'base_amount')::numeric,'collection_id',v_collection_id),v_uid);
    elsif nullif(v_split->>'settlement_account_id','') is not null and (v_split->>'estimated_net_settlement')::numeric>0 then
      insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by)
      values((v_split->>'settlement_account_id')::uuid,p_branch_id,'receivable_collection',(v_split->>'estimated_net_settlement')::numeric,v_split->>'code',nullif(v_split->>'reference',''),'تحصيل مديونية من نقطة البيع',jsonb_build_object('collection_id',v_collection_id,'shift_id',v_shift.id,'party_kind',p_party_kind,'party_id',p_party_id,'base_amount',(v_split->>'base_amount')::numeric,'charged_amount',(v_split->>'charged_amount')::numeric,'fee_amount',(v_split->>'fee_amount')::numeric),v_uid);
    end if;
  end loop;

  if p_party_kind='customer' then
    update private.customer_receivable_accounts_v1 set balance=v_after,updated_at=now() where branch_id=p_branch_id and customer_id=p_party_id;
    insert into private.customer_receivable_ledger_v1(branch_id,customer_id,entry_type,signed_amount,description,reference_kind,reference_id,idempotency_key,created_by)
    values(p_branch_id,p_party_id,'payment',-round(p_amount,2),'سداد مديونية من نقطة البيع','pos_receivable_collection',v_collection_id,'pos-receivable-payment:'||v_collection_id::text,v_uid);
    v_credit_available:=greatest(coalesce(v_customer_account.credit_limit,0)-v_after,0);
    if v_recipient is not null then
      insert into private.notification_events_v2(audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,action_url,action_label,requires_action,dedupe_key,eligible_channels,metadata)
      values('customer',v_recipient,p_branch_id,'customer.receivable_payment','customers','normal','تم استلام دفعة من مديونيتك','تم استلام '||to_char(round(p_amount,2),'FM999999990.00')||' ج.م. الرصيد المتبقي '||to_char(v_after,'FM999999990.00')||' ج.م.','pos_receivable_collection',v_collection_id,'/account/debts','عرض المديونية',false,'customer-receivable-payment:'||v_collection_id::text,array['in_app','push'],jsonb_build_object('delivery_type','transactional','amount',round(p_amount,2),'balance_after',v_after,'collection_id',v_collection_id)) on conflict(recipient_user_id,dedupe_key) do nothing;
    end if;
  else
    update private.hr_employee_wallet_accounts set receivable_balance=v_after,updated_at=now() where employee_id=p_party_id;
    insert into private.hr_employee_wallet_ledger(employee_id,branch_id,entry_type,benefit_delta,receivable_delta,points_delta,amount,reference_kind,reference_id,idempotency_key,description,metadata,actor_user_id)
    values(p_party_id,p_branch_id,'credit_payment',0,-round(p_amount,2),0,round(p_amount,2),'pos_receivable_collection',v_collection_id,'employee-receivable-payment:'||v_collection_id::text,'سداد مديونية من نقطة البيع',jsonb_build_object('collection_id',v_collection_id),v_uid);
    v_credit_available:=greatest(coalesce(v_employee_account.credit_limit,0)-v_after,0);
    insert into private.notification_events_v2(audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,action_url,action_label,requires_action,dedupe_key,eligible_channels,metadata)
    values('staff',p_party_id,p_branch_id,'employee.receivable_payment','finance','normal','تم استلام دفعة من رصيد الآجل','تم استلام '||to_char(round(p_amount,2),'FM999999990.00')||' ج.م. الرصيد المتبقي '||to_char(v_after,'FM999999990.00')||' ج.م.','pos_receivable_collection',v_collection_id,'/my-hr','عرض حسابي',false,'employee-receivable-payment:'||v_collection_id::text,array['in_app','push'],jsonb_build_object('delivery_type','transactional','amount',round(p_amount,2),'balance_after',v_after,'collection_id',v_collection_id)) on conflict(recipient_user_id,dedupe_key) do nothing;
  end if;

  return jsonb_build_object('id',v_collection_id,'request_id',p_request_id,'party_kind',p_party_kind,'party_id',p_party_id,'amount',round(p_amount,2),'amount_charged',v_total_charged,'customer_fee_amount',v_total_customer_fee,'merchant_fee_amount',v_total_merchant_fee,'balance_before',v_before,'balance_after',v_after,'credit_available',v_credit_available,'payment_breakdown',v_breakdown,'shift_id',v_shift.id,'created_at',now(),'idempotent',false);
end;
$function$;

revoke all on function public.collect_pos_receivable_v2(uuid,uuid,uuid,text,text,uuid,numeric,jsonb) from public,anon;
grant execute on function public.collect_pos_receivable_v2(uuid,uuid,uuid,text,text,uuid,numeric,jsonb) to authenticated,service_role;

do $do$
begin
  if to_regprocedure('private.pos_shift_reconciliation_preview_v3(uuid)') is null then
    alter function private.pos_shift_reconciliation_preview(uuid) rename to pos_shift_reconciliation_preview_v3;
  end if;
end
$do$;

create or replace function private.pos_shift_reconciliation_preview(p_shift_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_base jsonb; v_methods jsonb; v_missing jsonb;
begin
  v_base:=private.pos_shift_reconciliation_preview_v3(p_shift_id);
  with collections as (
    select p.method_code_snapshot code,(array_agg(p.payment_method_id order by p.created_at))[1] payment_method_id,(array_agg(p.method_name_snapshot order by p.created_at))[1] name,(array_agg(p.method_type_snapshot order by p.created_at))[1] method_type,(array_agg(p.settlement_account_id_snapshot) filter(where p.settlement_account_id_snapshot is not null))[1] settlement_account_id,count(distinct p.collection_id)::bigint collection_count,sum(p.base_amount)::numeric base_amount,sum(p.charged_amount)::numeric charged_amount,sum(p.customer_fee_amount)::numeric customer_fee_amount,sum(p.merchant_fee_amount)::numeric merchant_fee_amount,sum(p.estimated_net_settlement)::numeric net_settlement
    from private.pos_receivable_collection_parts_v2 p where p.shift_id=p_shift_id group by p.method_code_snapshot
  ), base_rows as (select e.value elem,e.ordinality ord from jsonb_array_elements(coalesce(v_base->'methods','[]'::jsonb)) with ordinality e(value,ordinality))
  select coalesce(jsonb_agg(b.elem||jsonb_build_object('collection_count',coalesce(c.collection_count,0),'receivable_collection_base',round(coalesce(c.base_amount,0),2),'base_amount',round(coalesce((b.elem->>'base_amount')::numeric,0)+coalesce(c.base_amount,0),2),'charged_amount',round(coalesce((b.elem->>'charged_amount')::numeric,0)+coalesce(c.charged_amount,0),2),'customer_fee_amount',round(coalesce((b.elem->>'customer_fee_amount')::numeric,0)+coalesce(c.customer_fee_amount,0),2),'merchant_fee_amount',round(coalesce((b.elem->>'merchant_fee_amount')::numeric,0)+coalesce(c.merchant_fee_amount,0),2),'expected_amount',case when b.elem->>'method_type'='cash' then coalesce((b.elem->>'expected_amount')::numeric,0) else round(coalesce((b.elem->>'expected_amount')::numeric,0)+coalesce(c.net_settlement,0),2) end,'expected_source',case when coalesce(c.collection_count,0)>0 then coalesce(b.elem->>'expected_source','')||'+receivable_collections_v2' else b.elem->>'expected_source' end) order by b.ord),'[]'::jsonb)
  into v_methods from base_rows b left join collections c on c.code=b.elem->>'code';

  with collections as (
    select p.method_code_snapshot code,(array_agg(p.payment_method_id order by p.created_at))[1] payment_method_id,(array_agg(p.method_name_snapshot order by p.created_at))[1] name,(array_agg(p.method_type_snapshot order by p.created_at))[1] method_type,(array_agg(p.settlement_account_id_snapshot) filter(where p.settlement_account_id_snapshot is not null))[1] settlement_account_id,count(distinct p.collection_id)::bigint collection_count,sum(p.base_amount)::numeric base_amount,sum(p.charged_amount)::numeric charged_amount,sum(p.customer_fee_amount)::numeric customer_fee_amount,sum(p.merchant_fee_amount)::numeric merchant_fee_amount,sum(p.estimated_net_settlement)::numeric net_settlement
    from private.pos_receivable_collection_parts_v2 p where p.shift_id=p_shift_id group by p.method_code_snapshot
  )
  select coalesce(jsonb_agg(jsonb_build_object('payment_method_id',c.payment_method_id,'code',c.code,'name',c.name,'method_type',c.method_type,'settlement_account_id',c.settlement_account_id,'expected_source','receivable_collections_v2','sale_count',0,'collection_count',c.collection_count,'receivable_collection_base',round(c.base_amount,2),'base_amount',round(c.base_amount,2),'charged_amount',round(c.charged_amount,2),'customer_fee_amount',round(c.customer_fee_amount,2),'merchant_fee_amount',round(c.merchant_fee_amount,2),'confirmed_refund_amount',0,'pending_refund_amount',0,'expected_amount',case when c.method_type='cash' then round(private.cash_account_balance((select s.drawer_account_id from public.pos_shifts s where s.id=p_shift_id)),2) else round(c.net_settlement,2) end,'account_balance',case when c.method_type='cash' then round(private.cash_account_balance((select s.drawer_account_id from public.pos_shifts s where s.id=p_shift_id)),2) when c.settlement_account_id is null then null else round(private.payment_account_balance(c.settlement_account_id),2) end) order by c.name),'[]'::jsonb)
  into v_missing from collections c where not exists(select 1 from jsonb_array_elements(v_methods) m where m->>'code'=c.code);

  return v_base||jsonb_build_object('version',4,'methods',coalesce(v_methods,'[]'::jsonb)||coalesce(v_missing,'[]'::jsonb),'receivable_collections',jsonb_build_object('count',(select count(*) from private.pos_receivable_collections_v2 c where c.shift_id=p_shift_id),'base_amount',coalesce((select round(sum(c.amount),2) from private.pos_receivable_collections_v2 c where c.shift_id=p_shift_id),0),'charged_amount',coalesce((select round(sum(c.amount_charged),2) from private.pos_receivable_collections_v2 c where c.shift_id=p_shift_id),0)));
end;
$function$;

revoke all on function private.pos_shift_reconciliation_preview(uuid) from public,anon,authenticated;
grant execute on function private.pos_shift_reconciliation_preview(uuid) to service_role;
