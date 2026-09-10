-- Finance Accounts & Transfers V2
-- Two-step custody transfer: sender handover -> in transit -> receiver receipt.

create table if not exists private.finance_transfers_v2 (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'EGP',
  source_ledger_kind text not null check (source_ledger_kind in ('cash','payment')),
  source_account_id uuid not null,
  source_account_type text not null,
  source_account_name text not null,
  source_responsible_user_id uuid not null references public.users(id) on delete restrict,
  destination_ledger_kind text not null check (destination_ledger_kind in ('cash','payment')),
  destination_account_id uuid not null,
  destination_account_type text not null,
  destination_account_name text not null,
  destination_responsible_user_id uuid not null references public.users(id) on delete restrict,
  status text not null default 'awaiting_sender' check (status in ('awaiting_sender','awaiting_receiver','completed','rejected','exception','cancelled')),
  requested_by uuid not null references public.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  source_task_id uuid references public.operations_tasks(id) on delete restrict,
  destination_task_id uuid references public.operations_tasks(id) on delete restrict,
  sender_confirmed_by uuid references public.users(id) on delete restrict,
  sender_confirmed_at timestamptz,
  sender_note text,
  receiver_confirmed_by uuid references public.users(id) on delete restrict,
  receiver_confirmed_at timestamptz,
  receiver_note text,
  rejected_by uuid references public.users(id) on delete restrict,
  rejected_at timestamptz,
  rejection_stage text check (rejection_stage is null or rejection_stage in ('sender','receiver')),
  rejection_reason text,
  source_ledger_entry_id uuid,
  destination_ledger_entry_id uuid,
  reference text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not (source_ledger_kind=destination_ledger_kind and source_account_id=destination_account_id))
);

create index if not exists finance_transfers_v2_branch_status_idx on private.finance_transfers_v2(branch_id,status,created_at desc);
create index if not exists finance_transfers_v2_source_idx on private.finance_transfers_v2(source_ledger_kind,source_account_id,status);
create index if not exists finance_transfers_v2_destination_idx on private.finance_transfers_v2(destination_ledger_kind,destination_account_id,status);
create index if not exists finance_transfers_v2_source_responsible_idx on private.finance_transfers_v2(source_responsible_user_id,status,created_at desc);
create index if not exists finance_transfers_v2_destination_responsible_idx on private.finance_transfers_v2(destination_responsible_user_id,status,created_at desc);
revoke all on private.finance_transfers_v2 from public,anon,authenticated;

create unique index if not exists payment_ledger_finance_transfer_once_idx
on public.payment_ledger(account_id,(metadata->>'finance_transfer_id'),entry_type)
where metadata ? 'finance_transfer_id';

create or replace function private.finance_transfer_account_snapshot_v2(p_branch_id uuid,p_ledger_kind text,p_account_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb;
begin
  if p_ledger_kind='cash' then
    select jsonb_build_object(
      'ledger_kind','cash','account_id',ca.id,'account_type',ca.account_type,'name',ca.name,'currency',ca.currency,
      'balance',round(private.cash_account_balance(ca.id),2),'active',ca.active,
      'responsible_user_id',case when ca.account_type='pos_drawer' then s.user_id else ca.custodian_user_id end,
      'responsible_user_name',case when ca.account_type='pos_drawer' then su.name else cu.name end,
      'shift_id',case when ca.account_type='pos_drawer' then s.id else null end
    ) into v
    from public.cash_accounts ca
    left join lateral (
      select ps.id,ps.user_id from public.pos_shifts ps
      where ps.drawer_account_id=ca.id and ps.status='open'
      order by ps.opened_at desc limit 1
    ) s on true
    left join public.users su on su.id=s.user_id
    left join public.users cu on cu.id=ca.custodian_user_id
    where ca.id=p_account_id and ca.branch_id=p_branch_id and ca.active
      and ca.account_type in ('branch_safe','pos_drawer','online_collection');
  elsif p_ledger_kind='payment' then
    select jsonb_build_object(
      'ledger_kind','payment','account_id',pa.id,'account_type',pa.account_type,'name',pa.name,'currency',pa.currency,
      'balance',round(private.payment_account_balance(pa.id),2),'active',pa.active,
      'responsible_user_id',pa.custodian_user_id,'responsible_user_name',u.name,'shift_id',null
    ) into v
    from public.payment_accounts pa
    left join public.users u on u.id=pa.custodian_user_id
    where pa.id=p_account_id and pa.branch_id=p_branch_id and pa.active and pa.account_type='bank';
  else
    raise exception using errcode='22023',message='FINANCE_TRANSFER_LEDGER_KIND_INVALID';
  end if;
  return v;
end;$$;
revoke all on function private.finance_transfer_account_snapshot_v2(uuid,text,uuid) from public,anon,authenticated;

create or replace function private.finance_transfer_post_ledger_v2(
  p_transfer_id uuid,p_branch_id uuid,p_ledger_kind text,p_account_id uuid,p_amount numeric,p_direction text,p_description text,p_actor uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_signed numeric;begin
  v_signed:=case when p_direction='out' then -abs(p_amount) else abs(p_amount) end;
  if p_ledger_kind='cash' then
    insert into public.cash_ledger(account_id,branch_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by)
    values(p_account_id,p_branch_id,p_actor,'finance_transfer_'||p_direction,v_signed,'finance_transfer_v2',p_transfer_id,p_description,jsonb_build_object('finance_transfer_id',p_transfer_id,'direction',p_direction),p_actor)
    returning id into v_id;
  elsif p_ledger_kind='payment' then
    insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,external_reference,description,metadata,created_by)
    values(p_account_id,p_branch_id,'finance_transfer_'||p_direction,v_signed,'FTV2:'||p_transfer_id::text,p_description,jsonb_build_object('finance_transfer_id',p_transfer_id,'direction',p_direction),p_actor)
    returning id into v_id;
  else
    raise exception using errcode='22023',message='FINANCE_TRANSFER_LEDGER_KIND_INVALID';
  end if;
  return v_id;
end;$$;
revoke all on function private.finance_transfer_post_ledger_v2(uuid,uuid,text,uuid,numeric,text,text,uuid) from public,anon,authenticated;

create or replace function public.get_finance_transfer_options_v2(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb;begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED'; end if;
  if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED'; end if;
  with accounts as (
    select 'cash'::text ledger_kind,ca.id account_id,ca.account_type,ca.name,ca.currency,private.cash_account_balance(ca.id) balance,
      case when ca.account_type='pos_drawer' then s.user_id else ca.custodian_user_id end responsible_user_id,
      case when ca.account_type='pos_drawer' then u.name else cu.name end responsible_user_name,
      case when ca.account_type='pos_drawer' then s.id else null end shift_id
    from public.cash_accounts ca
    left join lateral(select ps.id,ps.user_id from public.pos_shifts ps where ps.drawer_account_id=ca.id and ps.status='open' order by ps.opened_at desc limit 1)s on true
    left join public.users u on u.id=s.user_id
    left join public.users cu on cu.id=ca.custodian_user_id
    where ca.branch_id=p_branch_id and ca.active and ca.account_type in ('branch_safe','pos_drawer')
    union all
    select 'payment',pa.id,pa.account_type,pa.name,pa.currency,private.payment_account_balance(pa.id),pa.custodian_user_id,u.name,null::uuid
    from public.payment_accounts pa left join public.users u on u.id=pa.custodian_user_id
    where pa.branch_id=p_branch_id and pa.active and pa.account_type='bank'
  ), reserves as (
    select source_ledger_kind ledger_kind,source_account_id account_id,sum(amount) reserved
    from private.finance_transfers_v2 where branch_id=p_branch_id and status='awaiting_sender' group by source_ledger_kind,source_account_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'ledger_kind',a.ledger_kind,'account_id',a.account_id,'account_type',a.account_type,'name',a.name,'currency',a.currency,
    'balance',round(a.balance,2),'reserved',round(coalesce(r.reserved,0),2),'available_balance',round(a.balance-coalesce(r.reserved,0),2),
    'responsible_user_id',a.responsible_user_id,'responsible_user_name',a.responsible_user_name,'shift_id',a.shift_id,
    'assignable',a.responsible_user_id is not null
  ) order by case a.account_type when 'branch_safe' then 0 when 'pos_drawer' then 1 when 'bank' then 2 else 3 end,a.name),'[]') into v_items
  from accounts a left join reserves r on r.ledger_kind=a.ledger_kind and r.account_id=a.account_id;
  return jsonb_build_object('version',2,'branch_id',p_branch_id,'items',v_items,'generated_at',now());
end;$$;

create or replace function public.create_finance_transfer_v2(
  p_branch_id uuid,p_source_ledger_kind text,p_source_account_id uuid,p_destination_ledger_kind text,p_destination_account_id uuid,p_amount numeric,p_note text,p_reference text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;d jsonb;v_id uuid;v_task uuid;v_reserved numeric:=0;v_available numeric;v_amount numeric;begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED'; end if;
  if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED'; end if;
  v_amount:=round(coalesce(p_amount,0),2);
  if v_amount<=0 then raise exception using errcode='22023',message='FINANCE_TRANSFER_AMOUNT_INVALID'; end if;
  if length(trim(coalesce(p_note,'')))<3 then raise exception using errcode='22023',message='FINANCE_TRANSFER_NOTE_REQUIRED'; end if;
  if p_source_ledger_kind=p_destination_ledger_kind and p_source_account_id=p_destination_account_id then raise exception using errcode='22023',message='FINANCE_TRANSFER_SAME_ACCOUNT'; end if;
  s:=private.finance_transfer_account_snapshot_v2(p_branch_id,p_source_ledger_kind,p_source_account_id);
  d:=private.finance_transfer_account_snapshot_v2(p_branch_id,p_destination_ledger_kind,p_destination_account_id);
  if s is null or d is null then raise exception using errcode='22023',message='FINANCE_TRANSFER_ACCOUNT_UNAVAILABLE'; end if;
  if coalesce(s->>'responsible_user_id','')='' then raise exception using errcode='22023',message='FINANCE_TRANSFER_SOURCE_HAS_NO_RESPONSIBLE'; end if;
  if coalesce(d->>'responsible_user_id','')='' then raise exception using errcode='22023',message='FINANCE_TRANSFER_DESTINATION_HAS_NO_RESPONSIBLE'; end if;
  if s->>'currency' is distinct from d->>'currency' then raise exception using errcode='22023',message='FINANCE_TRANSFER_CURRENCY_MISMATCH'; end if;
  perform pg_advisory_xact_lock(hashtextextended('finance-transfer-source:'||p_source_ledger_kind||':'||p_source_account_id::text,71));
  select coalesce(sum(amount),0) into v_reserved from private.finance_transfers_v2 where branch_id=p_branch_id and source_ledger_kind=p_source_ledger_kind and source_account_id=p_source_account_id and status='awaiting_sender';
  s:=private.finance_transfer_account_snapshot_v2(p_branch_id,p_source_ledger_kind,p_source_account_id);
  v_available:=(s->>'balance')::numeric-v_reserved;
  if v_available<v_amount then raise exception using errcode='55000',message='FINANCE_TRANSFER_INSUFFICIENT_AVAILABLE'; end if;
  insert into private.finance_transfers_v2(branch_id,amount,currency,source_ledger_kind,source_account_id,source_account_type,source_account_name,source_responsible_user_id,destination_ledger_kind,destination_account_id,destination_account_type,destination_account_name,destination_responsible_user_id,status,requested_by,reference,note)
  values(p_branch_id,v_amount,s->>'currency',p_source_ledger_kind,p_source_account_id,s->>'account_type',s->>'name',(s->>'responsible_user_id')::uuid,p_destination_ledger_kind,p_destination_account_id,d->>'account_type',d->>'name',(d->>'responsible_user_id')::uuid,'awaiting_sender',auth.uid(),nullif(trim(coalesce(p_reference,'')),''),trim(p_note)) returning id into v_id;
  insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,claimed_by,claimed_at,due_at,metadata,created_by)
  values(p_branch_id,'finance_transfer','finance_transfer_sender',v_id,v_amount,'high','claimed','تسليم تحويل مالي','سلّم '||to_char(v_amount,'FM9999999990.00')||' ج.م من '||(s->>'name')||' إلى '||(d->>'name'),(s->>'responsible_user_id')::uuid,now(),now()+interval '4 hours',jsonb_build_object('transfer_id',v_id,'stage','sender','source_account_name',s->>'name','destination_account_name',d->>'name','requested_by',auth.uid()),auth.uid()) returning id into v_task;
  update private.finance_transfers_v2 set source_task_id=v_task,updated_at=now() where id=v_id;
  return jsonb_build_object('ok',true,'transfer_id',v_id,'status','awaiting_sender','task_id',v_task,'source_responsible_user_id',s->>'responsible_user_id','source_responsible_user_name',s->>'responsible_user_name','destination_responsible_user_id',d->>'responsible_user_id','destination_responsible_user_name',d->>'responsible_user_name','available_after_reserve',round(v_available-v_amount,2));
end;$$;

create or replace function public.get_finance_transfers_v2(p_branch_id uuid,p_limit integer default 80)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;v_transit numeric;v_exceptions integer;begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED'; end if;
  if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='FINANCE_VIEW_DENIED'; end if;
  select coalesce(sum(amount),0),count(*) filter(where status='exception') into v_transit,v_exceptions from private.finance_transfers_v2 where branch_id=p_branch_id and status in ('awaiting_receiver','exception');
  select coalesce(jsonb_agg(jsonb_build_object(
    'transfer_id',t.id,'amount',t.amount,'currency',t.currency,'status',t.status,'source_ledger_kind',t.source_ledger_kind,'source_account_id',t.source_account_id,'source_account_type',t.source_account_type,'source_account_name',t.source_account_name,'source_responsible_user_id',t.source_responsible_user_id,'source_responsible_user_name',su.name,
    'destination_ledger_kind',t.destination_ledger_kind,'destination_account_id',t.destination_account_id,'destination_account_type',t.destination_account_type,'destination_account_name',t.destination_account_name,'destination_responsible_user_id',t.destination_responsible_user_id,'destination_responsible_user_name',du.name,
    'requested_by',t.requested_by,'requested_by_name',ru.name,'requested_at',t.requested_at,'source_task_id',t.source_task_id,'destination_task_id',t.destination_task_id,'sender_confirmed_at',t.sender_confirmed_at,'receiver_confirmed_at',t.receiver_confirmed_at,'rejection_stage',t.rejection_stage,'rejection_reason',t.rejected_at,'reference',t.reference,'note',t.note,'updated_at',t.updated_at
  ) order by t.created_at desc),'[]') into v_rows
  from (select * from private.finance_transfers_v2 where branch_id=p_branch_id order by created_at desc limit least(greatest(coalesce(p_limit,80),10),200)) t
  left join public.users su on su.id=t.source_responsible_user_id left join public.users du on du.id=t.destination_responsible_user_id left join public.users ru on ru.id=t.requested_by;
  return jsonb_build_object('version',2,'branch_id',p_branch_id,'summary',jsonb_build_object('in_transit_amount',round(coalesce(v_transit,0),2),'exception_count',v_exceptions),'items',v_rows,'generated_at',now());
end;$$;

create or replace function public.get_my_finance_transfer_tasks_v2(p_branch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rows jsonb;begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('task_id',o.id,'task_status',o.status,'stage',case when o.source_kind='finance_transfer_sender' then 'sender' else 'receiver' end,'transfer_id',t.id,'transfer_status',t.status,'amount',t.amount,'currency',t.currency,'source_account_name',t.source_account_name,'destination_account_name',t.destination_account_name,'requested_at',t.requested_at,'reference',t.reference,'note',t.note) order by o.created_at desc),'[]') into v_rows
  from public.operations_tasks o join private.finance_transfers_v2 t on t.id=o.source_id
  where o.task_type='finance_transfer' and o.claimed_by=auth.uid() and o.status in ('claimed','in_progress','failed') and (p_branch_id is null or o.branch_id=p_branch_id);
  return jsonb_build_object('version',2,'items',v_rows,'generated_at',now());
end;$$;

create or replace function public.confirm_finance_transfer_handover_v2(p_task_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.operations_tasks%rowtype;t private.finance_transfers_v2%rowtype;s jsonb;d jsonb;v_entry uuid;v_dest_task uuid;begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if length(trim(coalesce(p_note,'')))<3 then raise exception using errcode='22023',message='FINANCE_TRANSFER_CONFIRM_NOTE_REQUIRED'; end if;
  select * into o from public.operations_tasks where id=p_task_id for update;
  if o.id is null or o.task_type<>'finance_transfer' or o.source_kind<>'finance_transfer_sender' then raise exception using errcode='22023',message='FINANCE_TRANSFER_TASK_NOT_FOUND'; end if;
  if o.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='FINANCE_TRANSFER_TASK_NOT_OWNER'; end if;
  select * into t from private.finance_transfers_v2 where id=o.source_id for update;
  if t.id is null then raise exception using errcode='22023',message='FINANCE_TRANSFER_NOT_FOUND'; end if;
  if t.status='awaiting_receiver' or t.status='completed' then return jsonb_build_object('ok',true,'idempotent',true,'transfer_id',t.id,'status',t.status); end if;
  if t.status<>'awaiting_sender' or o.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='FINANCE_TRANSFER_NOT_HANDOVERABLE'; end if;
  s:=private.finance_transfer_account_snapshot_v2(t.branch_id,t.source_ledger_kind,t.source_account_id);
  if s is null or (s->>'responsible_user_id')::uuid is distinct from auth.uid() or t.source_responsible_user_id is distinct from auth.uid() then raise exception using errcode='55000',message='FINANCE_TRANSFER_SOURCE_RESPONSIBILITY_CHANGED'; end if;
  d:=private.finance_transfer_account_snapshot_v2(t.branch_id,t.destination_ledger_kind,t.destination_account_id);
  if d is null or coalesce(d->>'responsible_user_id','')='' then raise exception using errcode='55000',message='FINANCE_TRANSFER_DESTINATION_RESPONSIBILITY_CHANGED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('finance-transfer-source:'||t.source_ledger_kind||':'||t.source_account_id::text,71));
  s:=private.finance_transfer_account_snapshot_v2(t.branch_id,t.source_ledger_kind,t.source_account_id);
  if (s->>'balance')::numeric<t.amount then raise exception using errcode='55000',message='FINANCE_TRANSFER_INSUFFICIENT_BALANCE'; end if;
  v_entry:=private.finance_transfer_post_ledger_v2(t.id,t.branch_id,t.source_ledger_kind,t.source_account_id,t.amount,'out','تحويل مالي إلى '||t.destination_account_name,auth.uid());
  update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),failure_reason=null,metadata=metadata||jsonb_build_object('resolution_note',trim(p_note),'finance_transfer_stage','sender_confirmed'),updated_at=now() where id=o.id;
  insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata) values(o.id,'completed',auth.uid(),trim(p_note),jsonb_build_object('transfer_id',t.id,'stage','sender'));
  insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,claimed_by,claimed_at,due_at,metadata,created_by)
  values(t.branch_id,'finance_transfer','finance_transfer_receiver',t.id,t.amount,'high','claimed','استلام تحويل مالي','أكد استلام '||to_char(t.amount,'FM9999999990.00')||' ج.م من '||t.source_account_name||' إلى '||t.destination_account_name,(d->>'responsible_user_id')::uuid,now(),now()+interval '4 hours',jsonb_build_object('transfer_id',t.id,'stage','receiver','source_account_name',t.source_account_name,'destination_account_name',t.destination_account_name,'sender_confirmed_by',auth.uid()),auth.uid()) returning id into v_dest_task;
  update private.finance_transfers_v2 set status='awaiting_receiver',source_ledger_entry_id=v_entry,sender_confirmed_by=auth.uid(),sender_confirmed_at=now(),sender_note=trim(p_note),destination_responsible_user_id=(d->>'responsible_user_id')::uuid,destination_task_id=v_dest_task,updated_at=now() where id=t.id;
  return jsonb_build_object('ok',true,'transfer_id',t.id,'status','awaiting_receiver','source_ledger_entry_id',v_entry,'receiver_task_id',v_dest_task,'destination_responsible_user_id',d->>'responsible_user_id','destination_responsible_user_name',d->>'responsible_user_name');
end;$$;

create or replace function public.reject_finance_transfer_handover_v2(p_task_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.operations_tasks%rowtype;t private.finance_transfers_v2%rowtype;begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception using errcode='22023',message='FINANCE_TRANSFER_REJECTION_REASON_REQUIRED';end if;
 select * into o from public.operations_tasks where id=p_task_id for update;
 if o.id is null or o.task_type<>'finance_transfer' or o.source_kind<>'finance_transfer_sender' or o.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='FINANCE_TRANSFER_TASK_NOT_OWNER';end if;
 select * into t from private.finance_transfers_v2 where id=o.source_id for update;
 if t.status<>'awaiting_sender' then raise exception using errcode='55000',message='FINANCE_TRANSFER_NOT_REJECTABLE';end if;
 update public.operations_tasks set status='failed',failure_reason=trim(p_reason),completed_by=auth.uid(),completed_at=now(),updated_at=now() where id=o.id;
 insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata) values(o.id,'failed',auth.uid(),trim(p_reason),jsonb_build_object('transfer_id',t.id,'stage','sender'));
 update private.finance_transfers_v2 set status='rejected',rejected_by=auth.uid(),rejected_at=now(),rejection_stage='sender',rejection_reason=trim(p_reason),updated_at=now() where id=t.id;
 return jsonb_build_object('ok',true,'transfer_id',t.id,'status','rejected');
end;$$;

create or replace function public.confirm_finance_transfer_receipt_v2(p_task_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.operations_tasks%rowtype;t private.finance_transfers_v2%rowtype;d jsonb;v_entry uuid;begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception using errcode='22023',message='FINANCE_TRANSFER_CONFIRM_NOTE_REQUIRED';end if;
 select * into o from public.operations_tasks where id=p_task_id for update;
 if o.id is null or o.task_type<>'finance_transfer' or o.source_kind<>'finance_transfer_receiver' then raise exception using errcode='22023',message='FINANCE_TRANSFER_TASK_NOT_FOUND';end if;
 if o.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='FINANCE_TRANSFER_TASK_NOT_OWNER';end if;
 select * into t from private.finance_transfers_v2 where id=o.source_id for update;
 if t.status='completed' then return jsonb_build_object('ok',true,'idempotent',true,'transfer_id',t.id,'status','completed');end if;
 if t.status<>'awaiting_receiver' or o.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='FINANCE_TRANSFER_NOT_RECEIVABLE';end if;
 d:=private.finance_transfer_account_snapshot_v2(t.branch_id,t.destination_ledger_kind,t.destination_account_id);
 if d is null or (d->>'responsible_user_id')::uuid is distinct from auth.uid() or t.destination_responsible_user_id is distinct from auth.uid() then raise exception using errcode='55000',message='FINANCE_TRANSFER_DESTINATION_RESPONSIBILITY_CHANGED';end if;
 v_entry:=private.finance_transfer_post_ledger_v2(t.id,t.branch_id,t.destination_ledger_kind,t.destination_account_id,t.amount,'in','استلام تحويل مالي من '||t.source_account_name,auth.uid());
 update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),failure_reason=null,metadata=metadata||jsonb_build_object('resolution_note',trim(p_note),'finance_transfer_stage','receiver_confirmed'),updated_at=now() where id=o.id;
 insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata) values(o.id,'completed',auth.uid(),trim(p_note),jsonb_build_object('transfer_id',t.id,'stage','receiver'));
 update private.finance_transfers_v2 set status='completed',destination_ledger_entry_id=v_entry,receiver_confirmed_by=auth.uid(),receiver_confirmed_at=now(),receiver_note=trim(p_note),updated_at=now() where id=t.id;
 return jsonb_build_object('ok',true,'transfer_id',t.id,'status','completed','destination_ledger_entry_id',v_entry);
end;$$;

create or replace function public.reject_finance_transfer_receipt_v2(p_task_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.operations_tasks%rowtype;t private.finance_transfers_v2%rowtype;begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception using errcode='22023',message='FINANCE_TRANSFER_REJECTION_REASON_REQUIRED';end if;
 select * into o from public.operations_tasks where id=p_task_id for update;
 if o.id is null or o.task_type<>'finance_transfer' or o.source_kind<>'finance_transfer_receiver' or o.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='FINANCE_TRANSFER_TASK_NOT_OWNER';end if;
 select * into t from private.finance_transfers_v2 where id=o.source_id for update;
 if t.status<>'awaiting_receiver' then raise exception using errcode='55000',message='FINANCE_TRANSFER_NOT_REJECTABLE';end if;
 update public.operations_tasks set status='failed',failure_reason=trim(p_reason),completed_by=auth.uid(),completed_at=now(),updated_at=now() where id=o.id;
 insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata) values(o.id,'failed',auth.uid(),trim(p_reason),jsonb_build_object('transfer_id',t.id,'stage','receiver'));
 update private.finance_transfers_v2 set status='exception',rejected_by=auth.uid(),rejected_at=now(),rejection_stage='receiver',rejection_reason=trim(p_reason),updated_at=now() where id=t.id;
 return jsonb_build_object('ok',true,'transfer_id',t.id,'status','exception','in_transit_amount',t.amount);
end;$$;

create or replace function public.retry_finance_transfer_receipt_v2(p_transfer_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.finance_transfers_v2%rowtype;d jsonb;v_task uuid;begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 select * into t from private.finance_transfers_v2 where id=p_transfer_id for update;
 if t.id is null then raise exception using errcode='22023',message='FINANCE_TRANSFER_NOT_FOUND';end if;
 if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.manage',t.branch_id)) then raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED';end if;
 if t.status<>'exception' then raise exception using errcode='55000',message='FINANCE_TRANSFER_NOT_RETRYABLE';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception using errcode='22023',message='FINANCE_TRANSFER_NOTE_REQUIRED';end if;
 d:=private.finance_transfer_account_snapshot_v2(t.branch_id,t.destination_ledger_kind,t.destination_account_id);
 if d is null or coalesce(d->>'responsible_user_id','')='' then raise exception using errcode='55000',message='FINANCE_TRANSFER_DESTINATION_HAS_NO_RESPONSIBLE';end if;
 insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,claimed_by,claimed_at,due_at,metadata,created_by)
 values(t.branch_id,'finance_transfer_retry','finance_transfer_receiver_retry',t.id,t.amount,'high','claimed','إعادة استلام تحويل مالي','إعادة محاولة استلام '||to_char(t.amount,'FM9999999990.00')||' ج.م إلى '||t.destination_account_name,(d->>'responsible_user_id')::uuid,now(),now()+interval '4 hours',jsonb_build_object('transfer_id',t.id,'stage','receiver_retry','retry_note',trim(p_note)),auth.uid()) returning id into v_task;
 update private.finance_transfers_v2 set status='awaiting_receiver',destination_responsible_user_id=(d->>'responsible_user_id')::uuid,destination_task_id=v_task,rejected_by=null,rejected_at=null,rejection_stage=null,rejection_reason=null,metadata=metadata||jsonb_build_object('last_retry_note',trim(p_note),'last_retry_by',auth.uid(),'last_retry_at',now()),updated_at=now() where id=t.id;
 return jsonb_build_object('ok',true,'transfer_id',t.id,'status','awaiting_receiver','task_id',v_task,'destination_responsible_user_id',d->>'responsible_user_id','destination_responsible_user_name',d->>'responsible_user_name');
end;$$;

create or replace function public.cancel_finance_transfer_v2(p_transfer_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.finance_transfers_v2%rowtype;begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 select * into t from private.finance_transfers_v2 where id=p_transfer_id for update;
 if t.id is null then raise exception using errcode='22023',message='FINANCE_TRANSFER_NOT_FOUND';end if;
 if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.manage',t.branch_id)) then raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED';end if;
 if t.status<>'awaiting_sender' then raise exception using errcode='55000',message='FINANCE_TRANSFER_ALREADY_HANDED_OVER';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception using errcode='22023',message='FINANCE_TRANSFER_REJECTION_REASON_REQUIRED';end if;
 update public.operations_tasks set status='cancelled',failure_reason=trim(p_reason),updated_at=now() where id=t.source_task_id and status in ('pending','claimed','in_progress');
 update private.finance_transfers_v2 set status='cancelled',rejected_by=auth.uid(),rejected_at=now(),rejection_stage='sender',rejection_reason=trim(p_reason),updated_at=now() where id=t.id;
 return jsonb_build_object('ok',true,'transfer_id',t.id,'status','cancelled');
end;$$;

create or replace function public.complete_operations_task(p_task_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_task public.operations_tasks%rowtype;v_note text;begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 v_note:=nullif(trim(coalesce(p_note,'')),'');if v_note is null or length(v_note)<3 then raise exception using errcode='22023',message='TASK_COMPLETION_NOTE_REQUIRED';end if;
 select * into v_task from public.operations_tasks where id=p_task_id for update;if v_task.id is null then raise exception using errcode='22023',message='TASK_NOT_FOUND';end if;
 if v_task.task_type in ('refund_transfer','inventory_daily_count','inventory_variance_recount','inventory_adjustment_review','inventory_transfer_dispatch','inventory_transfer_receive','hr_request_review','hr_salary_advance_payout','hr_attendance_correction_apply','treasury_disbursement','finance_transfer','finance_transfer_retry') then raise exception using errcode='55000',message='TASK_REQUIRES_SPECIAL_COMPLETION';end if;
 if v_task.status='completed' then return to_jsonb(v_task)||jsonb_build_object('idempotent',true);end if;
 if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER';end if;
 if not private.operations_task_can_claim(v_task.source_kind,v_task.branch_id) then raise exception using errcode='42501',message='TASK_ACTION_DENIED';end if;
 if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TASK_NOT_COMPLETABLE';end if;
 update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),failure_reason=null,metadata=coalesce(metadata,'{}')||jsonb_build_object('resolution_note',v_note,'resolved_at',now(),'resolved_by',auth.uid()) where id=v_task.id returning * into v_task;
 insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'completed',auth.uid(),v_note);
 return to_jsonb(v_task)||jsonb_build_object('idempotent',false);
end;$$;

revoke all on function public.get_finance_transfer_options_v2(uuid) from public,anon;
revoke all on function public.create_finance_transfer_v2(uuid,text,uuid,text,uuid,numeric,text,text) from public,anon;
revoke all on function public.get_finance_transfers_v2(uuid,integer) from public,anon;
revoke all on function public.get_my_finance_transfer_tasks_v2(uuid) from public,anon;
revoke all on function public.confirm_finance_transfer_handover_v2(uuid,text) from public,anon;
revoke all on function public.reject_finance_transfer_handover_v2(uuid,text) from public,anon;
revoke all on function public.confirm_finance_transfer_receipt_v2(uuid,text) from public,anon;
revoke all on function public.reject_finance_transfer_receipt_v2(uuid,text) from public,anon;
revoke all on function public.retry_finance_transfer_receipt_v2(uuid,text) from public,anon;
revoke all on function public.cancel_finance_transfer_v2(uuid,text) from public,anon;
grant execute on function public.get_finance_transfer_options_v2(uuid) to authenticated,service_role;
grant execute on function public.create_finance_transfer_v2(uuid,text,uuid,text,uuid,numeric,text,text) to authenticated,service_role;
grant execute on function public.get_finance_transfers_v2(uuid,integer) to authenticated,service_role;
grant execute on function public.get_my_finance_transfer_tasks_v2(uuid) to authenticated,service_role;
grant execute on function public.confirm_finance_transfer_handover_v2(uuid,text) to authenticated,service_role;
grant execute on function public.reject_finance_transfer_handover_v2(uuid,text) to authenticated,service_role;
grant execute on function public.confirm_finance_transfer_receipt_v2(uuid,text) to authenticated,service_role;
grant execute on function public.reject_finance_transfer_receipt_v2(uuid,text) to authenticated,service_role;
grant execute on function public.retry_finance_transfer_receipt_v2(uuid,text) to authenticated,service_role;
grant execute on function public.cancel_finance_transfer_v2(uuid,text) to authenticated,service_role;
