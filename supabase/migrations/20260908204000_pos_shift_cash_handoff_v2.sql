-- End-of-shift physical cash handoff from POS drawer to branch safe.
-- Closing a shift creates an immutable pending handoff; finance confirms physical receipt.

create table if not exists public.pos_shift_cash_handoffs (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null unique references public.pos_shifts(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  device_id uuid not null references public.pos_devices(id) on delete restrict,
  drawer_account_id uuid not null references public.cash_accounts(id) on delete restrict,
  safe_account_id uuid references public.cash_accounts(id) on delete restrict,
  cashier_id uuid not null references public.users(id) on delete restrict,
  cashier_name_snapshot text not null,
  device_name_snapshot text not null,
  closed_at_snapshot timestamptz not null,
  expected_handoff_amount numeric not null check (expected_handoff_amount >= 0),
  received_amount numeric check (received_amount is null or received_amount >= 0),
  variance_amount numeric,
  variance_reason text,
  status text not null default 'pending' check (status in ('pending','completed')),
  transfer_id uuid references public.cash_transfers(id) on delete restrict,
  received_by uuid references public.users(id) on delete restrict,
  received_by_name_snapshot text,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_shift_cash_handoff_finite check (
    expected_handoff_amount::text not in ('NaN','Infinity','-Infinity') and
    (received_amount is null or received_amount::text not in ('NaN','Infinity','-Infinity')) and
    (variance_amount is null or variance_amount::text not in ('NaN','Infinity','-Infinity'))
  ),
  constraint pos_shift_cash_handoff_completion check (
    (status='pending' and received_amount is null and received_at is null and received_by is null)
    or
    (status='completed' and received_amount is not null and variance_amount is not null and received_at is not null and received_by is not null)
  )
);

create index if not exists pos_shift_cash_handoffs_branch_status_idx
  on public.pos_shift_cash_handoffs(branch_id,status,closed_at_snapshot desc);
create index if not exists pos_shift_cash_handoffs_drawer_status_idx
  on public.pos_shift_cash_handoffs(drawer_account_id,status);
create index if not exists pos_shift_cash_handoffs_received_by_idx
  on public.pos_shift_cash_handoffs(received_by) where received_by is not null;

alter table public.pos_shift_cash_handoffs enable row level security;
revoke all on table public.pos_shift_cash_handoffs from public,anon,authenticated;
grant all on table public.pos_shift_cash_handoffs to service_role;

create or replace function private.capture_pos_shift_cash_handoff()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_cashier_name text;
  v_device_name text;
begin
  if old.status='open' and new.status='closed' and coalesce(new.closing_cash,0)>0 then
    select coalesce(nullif(u.name,''),'كاشير') into v_cashier_name from public.users u where u.id=new.user_id;
    select coalesce(nullif(d.name,''),'جهاز POS') into v_device_name from public.pos_devices d where d.id=new.device_id;

    insert into public.pos_shift_cash_handoffs(
      shift_id,branch_id,device_id,drawer_account_id,cashier_id,cashier_name_snapshot,
      device_name_snapshot,closed_at_snapshot,expected_handoff_amount,status
    ) values(
      new.id,new.branch_id,new.device_id,new.drawer_account_id,new.user_id,
      coalesce(v_cashier_name,'كاشير'),coalesce(v_device_name,'جهاز POS'),
      coalesce(new.closed_at,now()),round(new.closing_cash,2),'pending'
    )
    on conflict (shift_id) do nothing;
  end if;
  return new;
end
$function$;

revoke all on function private.capture_pos_shift_cash_handoff() from public,anon,authenticated;
grant execute on function private.capture_pos_shift_cash_handoff() to postgres,service_role;

drop trigger if exists pos_shift_capture_cash_handoff on public.pos_shifts;
create trigger pos_shift_capture_cash_handoff
after update of status on public.pos_shifts
for each row
when (old.status is distinct from new.status)
execute function private.capture_pos_shift_cash_handoff();

create or replace function private.block_pos_shift_when_cash_handoff_pending()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if exists(
    select 1 from public.pos_shift_cash_handoffs h
    where h.device_id=new.device_id and h.status='pending'
  ) then
    raise exception using errcode='55000',message='CASH_HANDOFF_PENDING';
  end if;
  return new;
end
$function$;

revoke all on function private.block_pos_shift_when_cash_handoff_pending() from public,anon,authenticated;
grant execute on function private.block_pos_shift_when_cash_handoff_pending() to postgres,service_role;

drop trigger if exists pos_shift_block_pending_cash_handoff on public.pos_shifts;
create trigger pos_shift_block_pending_cash_handoff
before insert on public.pos_shifts
for each row execute function private.block_pos_shift_when_cash_handoff_pending();

create or replace function private.block_float_when_cash_handoff_pending()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.to_account_id is not null
     and exists(
       select 1
       from public.cash_accounts a
       join public.pos_shift_cash_handoffs h on h.drawer_account_id=a.id and h.status='pending'
       where a.id=new.to_account_id and a.account_type='pos_drawer'
     ) then
    raise exception using errcode='55000',message='CASH_HANDOFF_PENDING';
  end if;
  return new;
end
$function$;

revoke all on function private.block_float_when_cash_handoff_pending() from public,anon,authenticated;
grant execute on function private.block_float_when_cash_handoff_pending() to postgres,service_role;

drop trigger if exists cash_transfer_block_pending_handoff_float on public.cash_transfers;
create trigger cash_transfer_block_pending_handoff_float
before insert on public.cash_transfers
for each row execute function private.block_float_when_cash_handoff_pending();

create or replace function public.get_finance_cash_handoff_workspace_v2(p_branch_id uuid,p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_branch_name text;
  v_safe_id uuid;
  v_safe_name text;
  v_safe_balance numeric;
  v_can_manage boolean;
  v_pending jsonb;
  v_recent jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select b.name into v_branch_name from public.branches b where b.id=p_branch_id;
  if v_branch_name is null then raise exception using errcode='22023',message='BRANCH_NOT_FOUND'; end if;

  v_can_manage:=private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.manage',p_branch_id);
  if not (v_can_manage or public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('pos.manage_shifts',p_branch_id)) then
    raise exception using errcode='42501',message='FINANCE_CASH_HANDOFF_ACCESS_DENIED';
  end if;

  select a.id,a.name,private.cash_account_balance(a.id)
  into v_safe_id,v_safe_name,v_safe_balance
  from public.cash_accounts a
  where a.branch_id=p_branch_id and a.account_type='branch_safe' and a.active
  order by a.created_at
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'handoff_id',h.id,'shift_id',h.shift_id,'cashier_id',h.cashier_id,
    'cashier_name',h.cashier_name_snapshot,'device_id',h.device_id,'device_name',h.device_name_snapshot,
    'drawer_account_id',h.drawer_account_id,'drawer_balance',round(private.cash_account_balance(h.drawer_account_id),2),
    'expected_amount',round(h.expected_handoff_amount,2),'closed_at',h.closed_at_snapshot,
    'status',h.status
  ) order by h.closed_at_snapshot),'[]'::jsonb)
  into v_pending
  from public.pos_shift_cash_handoffs h
  where h.branch_id=p_branch_id and h.status='pending';

  select coalesce(jsonb_agg(row_data order by settled_at desc),'[]'::jsonb)
  into v_recent
  from (
    select jsonb_build_object(
      'handoff_id',h.id,'shift_id',h.shift_id,'cashier_id',h.cashier_id,
      'cashier_name',h.cashier_name_snapshot,'device_id',h.device_id,'device_name',h.device_name_snapshot,
      'expected_amount',round(h.expected_handoff_amount,2),'received_amount',round(h.received_amount,2),
      'variance_amount',round(h.variance_amount,2),'variance_reason',h.variance_reason,
      'received_by',h.received_by,'received_by_name',h.received_by_name_snapshot,
      'received_at',h.received_at,'transfer_id',h.transfer_id,'status',h.status
    ) row_data,
    h.received_at settled_at
    from public.pos_shift_cash_handoffs h
    where h.branch_id=p_branch_id and h.status='completed'
    order by h.received_at desc
    limit greatest(1,least(coalesce(p_limit,100),250))
  ) q;

  return jsonb_build_object(
    'version',2,'branch_id',p_branch_id,'branch_name',v_branch_name,'generated_at',now(),
    'permissions',jsonb_build_object('can_manage',v_can_manage),
    'safe',case when v_safe_id is null then null else jsonb_build_object('account_id',v_safe_id,'name',v_safe_name,'balance',round(v_safe_balance,2)) end,
    'pending',v_pending,'recent',v_recent
  );
end
$function$;

create or replace function public.receive_pos_shift_cash_handoff_v2(
  p_handoff_id uuid,
  p_received_amount numeric,
  p_variance_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_handoff public.pos_shift_cash_handoffs%rowtype;
  v_safe uuid;
  v_transfer uuid;
  v_drawer_balance numeric;
  v_expected numeric;
  v_received numeric;
  v_variance numeric;
  v_reason text;
  v_receiver_name text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_received_amount is null or p_received_amount<0 or p_received_amount::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode='22023',message='INVALID_HANDOFF_AMOUNT';
  end if;

  select * into v_handoff from public.pos_shift_cash_handoffs where id=p_handoff_id for update;
  if v_handoff.id is null then raise exception using errcode='22023',message='CASH_HANDOFF_NOT_FOUND'; end if;
  if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.manage',v_handoff.branch_id)) then
    raise exception using errcode='42501',message='FINANCE_CASH_HANDOFF_MANAGE_DENIED';
  end if;

  if v_handoff.status='completed' then
    return jsonb_build_object(
      'handoff_id',v_handoff.id,'shift_id',v_handoff.shift_id,'status',v_handoff.status,
      'already_completed',true,'expected_amount',v_handoff.expected_handoff_amount,
      'received_amount',v_handoff.received_amount,'variance_amount',v_handoff.variance_amount,
      'variance_reason',v_handoff.variance_reason,'transfer_id',v_handoff.transfer_id,
      'received_at',v_handoff.received_at,'received_by_name',v_handoff.received_by_name_snapshot
    );
  end if;

  if not exists(select 1 from public.pos_shifts s where s.id=v_handoff.shift_id and s.status='closed') then
    raise exception using errcode='55000',message='CASH_HANDOFF_SHIFT_NOT_CLOSED';
  end if;

  v_safe:=private.ensure_branch_safe_account(v_handoff.branch_id);
  perform pg_advisory_xact_lock(hashtextextended('cash-account:'||v_handoff.drawer_account_id::text,41));
  perform pg_advisory_xact_lock(hashtextextended('cash-account:'||v_safe::text,42));

  v_expected:=round(v_handoff.expected_handoff_amount,2);
  v_received:=round(p_received_amount,2);
  v_drawer_balance:=round(private.cash_account_balance(v_handoff.drawer_account_id),2);
  if abs(v_drawer_balance-v_expected)>0.005 then
    raise exception using errcode='55000',message='CASH_HANDOFF_DRAWER_CHANGED|'||to_char(v_drawer_balance,'FM9999999990.00');
  end if;

  v_variance:=round(v_received-v_expected,2);
  v_reason:=nullif(btrim(coalesce(p_variance_reason,'')),'');
  if abs(v_variance)>0.005 and v_reason is null then
    raise exception using errcode='22023',message='CASH_HANDOFF_VARIANCE_REASON_REQUIRED';
  end if;

  if abs(v_variance)>0.005 then
    insert into public.cash_ledger(
      account_id,branch_id,shift_id,device_id,user_id,entry_type,signed_amount,
      reference_type,reference_id,description,metadata,created_by
    ) values(
      v_handoff.drawer_account_id,v_handoff.branch_id,v_handoff.shift_id,v_handoff.device_id,v_handoff.cashier_id,
      'handoff_receive_variance',v_variance,'pos_shift_cash_handoff',v_handoff.id,
      'فرق استلام نقدية وردية من الكاشير',
      jsonb_build_object('expected_handoff',v_expected,'received_handoff',v_received,'reason',v_reason),auth.uid()
    );
  end if;

  if v_received>0 then
    insert into public.cash_transfers(
      branch_id,amount,from_register,to_register,notes,created_by,from_account_id,to_account_id,status,shift_id
    ) values(
      v_handoff.branch_id,v_received,'store','safe',
      coalesce(v_reason,'استلام وتسليم نقدية نهاية الوردية'),auth.uid(),
      v_handoff.drawer_account_id,v_safe,'completed',v_handoff.shift_id
    ) returning id into v_transfer;

    insert into public.cash_ledger(
      account_id,branch_id,shift_id,device_id,user_id,entry_type,signed_amount,
      reference_type,reference_id,transfer_id,description,metadata,created_by
    ) values
      (v_handoff.drawer_account_id,v_handoff.branch_id,v_handoff.shift_id,v_handoff.device_id,v_handoff.cashier_id,
       'handoff_transfer_out',-v_received,'cash_transfer',v_transfer,v_transfer,
       'استلام نقدية الوردية وتوريدها للخزنة',jsonb_build_object('handoff_id',v_handoff.id),auth.uid()),
      (v_safe,v_handoff.branch_id,v_handoff.shift_id,v_handoff.device_id,v_handoff.cashier_id,
       'handoff_transfer_in',v_received,'cash_transfer',v_transfer,v_transfer,
       'توريد تسليم وردية '||v_handoff.cashier_name_snapshot,jsonb_build_object('handoff_id',v_handoff.id),auth.uid());
  end if;

  select coalesce(nullif(u.name,''),'المسؤول المالي') into v_receiver_name from public.users u where u.id=auth.uid();

  update public.pos_shift_cash_handoffs
  set safe_account_id=v_safe,received_amount=v_received,variance_amount=v_variance,variance_reason=v_reason,
      transfer_id=v_transfer,received_by=auth.uid(),received_by_name_snapshot=coalesce(v_receiver_name,'المسؤول المالي'),
      received_at=now(),status='completed',updated_at=now()
  where id=v_handoff.id
  returning * into v_handoff;

  return jsonb_build_object(
    'handoff_id',v_handoff.id,'shift_id',v_handoff.shift_id,'status',v_handoff.status,
    'already_completed',false,'expected_amount',v_expected,'received_amount',v_received,
    'variance_amount',v_variance,'variance_reason',v_reason,'transfer_id',v_transfer,
    'drawer_balance',round(private.cash_account_balance(v_handoff.drawer_account_id),2),
    'safe_balance',round(private.cash_account_balance(v_safe),2),
    'received_at',v_handoff.received_at,'received_by_name',v_handoff.received_by_name_snapshot
  );
end
$function$;

revoke all on function public.get_finance_cash_handoff_workspace_v2(uuid,integer) from public,anon;
grant execute on function public.get_finance_cash_handoff_workspace_v2(uuid,integer) to authenticated,service_role;
revoke all on function public.receive_pos_shift_cash_handoff_v2(uuid,numeric,text) from public,anon;
grant execute on function public.receive_pos_shift_cash_handoff_v2(uuid,numeric,text) to authenticated,service_role;
