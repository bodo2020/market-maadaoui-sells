-- Canonical Inventory Transfers V2 workflow.
-- This file intentionally replaces the experimental contracts from the four
-- immediately preceding production migrations.

-- Remove competing experimental overloads/columns when present.
drop function if exists public.get_inventory_transfer_workspace_v2(uuid,integer);
drop function if exists public.dispatch_inventory_transfer_v2(uuid,uuid);
drop function if exists public.receive_inventory_transfer_v2(uuid,uuid,jsonb,text);
drop function if exists private.inventory_transfer_payload_v2(uuid);

drop index if exists public.inventory_transfers_dispatch_request_v2_uidx;
drop index if exists public.inventory_transfers_receive_request_v2_uidx;
drop index if exists public.inventory_transfers_target_status_v2_idx;

alter table public.inventory_transfers drop constraint if exists inventory_transfers_v2_status_check;
alter table public.inventory_transfers drop constraint if exists inventory_transfers_v2_distinct_inventory_sources;
alter table public.inventory_transfer_items drop constraint if exists inventory_transfer_items_quantity_v2_check;

alter table public.inventory_transfers
  drop column if exists target_inventory_branch_id,
  drop column if exists cancellation_reason,
  drop column if exists dispatch_request_id,
  drop column if exists receive_request_id;

alter table public.inventory_transfer_items
  drop column if exists dispatched_quantity,
  drop column if exists source_quantity_before,
  drop column if exists source_quantity_after,
  drop column if exists target_quantity_before,
  drop column if exists target_quantity_after;

alter table public.inventory_transfers alter column status set default 'requested';

alter table public.inventory_transfer_items
  alter column quantity type numeric(14,3) using quantity::numeric,
  add column if not exists source_quantity_snapshot numeric(14,3),
  add column if not exists unit_cost_snapshot numeric(14,4),
  add column if not exists product_name_snapshot text,
  add column if not exists barcode_snapshot text,
  add column if not exists unit_snapshot text,
  add column if not exists received_quantity numeric(14,3),
  add column if not exists variance_quantity numeric(14,3);

alter table public.inventory_transfers
  add column if not exists request_id uuid,
  add column if not exists request_fingerprint text,
  add column if not exists transfer_number text,
  add column if not exists source_inventory_branch_id uuid references public.branches(id),
  add column if not exists destination_inventory_branch_id uuid references public.branches(id),
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists dispatched_at timestamptz,
  add column if not exists dispatched_by uuid references public.users(id),
  add column if not exists dispatch_note text,
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references public.users(id),
  add column if not exists receive_note text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.users(id),
  add column if not exists cancel_reason text;

update public.inventory_transfers t
set source_inventory_branch_id=coalesce(f.inventory_source_branch_id,f.id),
    destination_inventory_branch_id=coalesce(tb.inventory_source_branch_id,tb.id)
from public.branches f,public.branches tb
where f.id=t.from_branch_id and tb.id=t.to_branch_id
  and (t.source_inventory_branch_id is null or t.destination_inventory_branch_id is null);

alter table public.inventory_transfers drop constraint if exists inventory_transfers_status_v2_check;
alter table public.inventory_transfers add constraint inventory_transfers_status_v2_check
  check(status in ('requested','dispatched','received','received_with_variance','cancelled')) not valid;
alter table public.inventory_transfers validate constraint inventory_transfers_status_v2_check;

alter table public.inventory_transfer_items drop constraint if exists inventory_transfer_items_quantity_precision_v2_check;
alter table public.inventory_transfer_items add constraint inventory_transfer_items_quantity_precision_v2_check
  check(quantity>0 and round(quantity,3)=quantity);
alter table public.inventory_transfer_items drop constraint if exists inventory_transfer_items_received_nonnegative_v2_check;
alter table public.inventory_transfer_items add constraint inventory_transfer_items_received_nonnegative_v2_check
  check(received_quantity is null or (received_quantity>=0 and round(received_quantity,3)=received_quantity));

create unique index if not exists inventory_transfers_request_id_v2_uidx
  on public.inventory_transfers(request_id) where request_id is not null;
create unique index if not exists inventory_transfers_number_v2_uidx
  on public.inventory_transfers(transfer_number) where transfer_number is not null;
create index if not exists inventory_transfers_source_status_v2_idx
  on public.inventory_transfers(from_branch_id,status,created_at desc);
create index if not exists inventory_transfers_destination_status_v2_idx
  on public.inventory_transfers(to_branch_id,status,created_at desc);
create index if not exists inventory_transfer_items_transfer_product_v2_idx
  on public.inventory_transfer_items(transfer_id,product_id);

-- RPC-only write path.
drop policy if exists "Inventory operators create transfer items" on public.inventory_transfer_items;
drop policy if exists "Inventory operators delete transfer items" on public.inventory_transfer_items;
drop policy if exists "Inventory operators update transfer item quantity" on public.inventory_transfer_items;
drop policy if exists "Inventory managers delete source transfers" on public.inventory_transfers;
drop policy if exists "Inventory operators create source transfers" on public.inventory_transfers;
drop policy if exists "Inventory operators update related transfers" on public.inventory_transfers;
revoke insert,update,delete on public.inventory_transfers from authenticated,anon;
revoke insert,update,delete on public.inventory_transfer_items from authenticated,anon;
revoke all on function public.auto_transfer_from_hub(uuid,integer,uuid) from public,anon,authenticated;

create or replace function private.operations_task_can_claim(p_source_kind text,p_branch_id uuid)
returns boolean
language sql
stable security definer
set search_path=''
as $function$
  select case
    when p_source_kind='pos_refund' then public.staff_has_permission('sales.refund',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)
    when p_source_kind='online_refund' then public.staff_has_permission('online_money.settle_digital',p_branch_id)
    when p_source_kind='shift_reconciliation' then public.staff_has_permission('pos.manage_shifts',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)
    when p_source_kind='cash_handoff' then public.staff_has_permission('finance.manage',p_branch_id) or public.staff_has_permission('pos.manage_shifts',p_branch_id)
    when p_source_kind='inventory_count' then public.staff_has_permission('inventory.count',p_branch_id)
    when p_source_kind='inventory_recount' then public.staff_has_permission('inventory.recount',p_branch_id)
    when p_source_kind='inventory_adjustment' then public.staff_has_permission('inventory.approve_adjustment',p_branch_id)
    when p_source_kind in ('inventory_transfer_dispatch','inventory_transfer_receive') then public.staff_has_permission('inventory.transfer',p_branch_id)
    when p_source_kind='inventory_transfer_variance' then public.staff_has_permission('inventory.manage',p_branch_id) or public.staff_has_permission('inventory.approve_adjustment',p_branch_id)
    else false
  end;
$function$;

create or replace function public.complete_operations_task(p_task_id uuid,p_note text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_task public.operations_tasks%rowtype;
  v_note text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_note:=nullif(trim(coalesce(p_note,'')),'');
  if v_note is null or length(v_note)<3 then raise exception using errcode='22023',message='TASK_COMPLETION_NOTE_REQUIRED'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null then raise exception using errcode='22023',message='TASK_NOT_FOUND'; end if;
  if v_task.task_type in ('refund_transfer','inventory_daily_count','inventory_variance_recount','inventory_adjustment_review','inventory_transfer_dispatch','inventory_transfer_receive') then
    raise exception using errcode='55000',message='TASK_REQUIRES_SPECIAL_COMPLETION';
  end if;
  if v_task.status='completed' then return to_jsonb(v_task)||jsonb_build_object('idempotent',true); end if;
  if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER'; end if;
  if not private.operations_task_can_claim(v_task.source_kind,v_task.branch_id) then raise exception using errcode='42501',message='TASK_ACTION_DENIED'; end if;
  if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TASK_NOT_COMPLETABLE'; end if;
  update public.operations_tasks
  set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),failure_reason=null,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('resolution_note',v_note,'resolved_at',now(),'resolved_by',auth.uid())
  where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'completed',auth.uid(),v_note);
  return to_jsonb(v_task)||jsonb_build_object('idempotent',false);
end;
$function$;

create or replace function public.create_inventory_transfer_v2(
  p_request_id uuid,
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_items jsonb,
  p_notes text default null,
  p_expected_arrival_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_from_inventory uuid; v_to_inventory uuid; v_transfer public.inventory_transfers%rowtype; v_existing public.inventory_transfers%rowtype;
  v_fingerprint text; v_number text; v_count int; v_total_measure numeric:=0; v_item jsonb; v_product_id uuid; v_qty numeric;
  v_available numeric; v_name text; v_barcode text; v_unit text; v_cost numeric; v_task_id uuid; v_pricing_branch uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_request_id is null or p_from_branch_id is null or p_to_branch_id is null then raise exception using errcode='22023',message='TRANSFER_REQUIRED_FIELDS'; end if;
  if p_from_branch_id=p_to_branch_id then raise exception using errcode='22023',message='TRANSFER_SAME_BRANCH'; end if;
  if not public.has_branch_access(auth.uid(),p_from_branch_id) or not public.staff_has_permission('inventory.transfer',p_from_branch_id) then raise exception using errcode='42501',message='TRANSFER_SOURCE_PERMISSION_DENIED'; end if;
  if jsonb_typeof(p_items)<>'array' then raise exception using errcode='22023',message='TRANSFER_ITEMS_REQUIRED'; end if;
  v_count:=jsonb_array_length(p_items);
  if v_count<1 or v_count>100 then raise exception using errcode='22023',message='TRANSFER_ITEM_COUNT_INVALID'; end if;
  if nullif(trim(coalesce(p_notes,'')),'') is not null and length(trim(p_notes))>1000 then raise exception using errcode='22023',message='TRANSFER_NOTE_TOO_LONG'; end if;

  select coalesce(inventory_source_branch_id,id),coalesce(pricing_source_branch_id,id)
    into v_from_inventory,v_pricing_branch from public.branches where id=p_from_branch_id and active;
  select coalesce(inventory_source_branch_id,id) into v_to_inventory from public.branches where id=p_to_branch_id and active;
  if v_from_inventory is null or v_to_inventory is null then raise exception using errcode='22023',message='TRANSFER_BRANCH_NOT_FOUND'; end if;
  if v_from_inventory=v_to_inventory then raise exception using errcode='22023',message='TRANSFER_SHARED_INVENTORY_SOURCE'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) e group by (e->>'product_id') having count(*)>1) then raise exception using errcode='22023',message='TRANSFER_DUPLICATE_PRODUCT'; end if;

  v_fingerprint:=md5(jsonb_build_object('from',p_from_branch_id,'to',p_to_branch_id,'items',p_items,'notes',coalesce(trim(p_notes),''),'eta',p_expected_arrival_date)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,31));
  select * into v_existing from public.inventory_transfers where request_id=p_request_id;
  if found then
    if v_existing.created_by is distinct from auth.uid() or v_existing.request_fingerprint is distinct from v_fingerprint then raise exception using errcode='42501',message='TRANSFER_REQUEST_CONFLICT'; end if;
    return jsonb_build_object('id',v_existing.id,'transfer_number',v_existing.transfer_number,'status',v_existing.status,'idempotent',true);
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin v_product_id:=(v_item->>'product_id')::uuid; exception when others then raise exception using errcode='22023',message='TRANSFER_PRODUCT_INVALID'; end;
    begin v_qty:=(v_item->>'quantity')::numeric; exception when others then raise exception using errcode='22023',message='TRANSFER_QUANTITY_INVALID'; end;
    if v_product_id is null or v_qty is null or v_qty<=0 or round(v_qty,3)<>v_qty then raise exception using errcode='22023',message='TRANSFER_QUANTITY_INVALID'; end if;
    select inv.quantity,p.name,p.barcode,coalesce(p.unit_of_measure,p.base_unit,'قطعة'),coalesce(bp.purchase_price,p.purchase_price)
      into v_available,v_name,v_barcode,v_unit,v_cost
    from public.inventory inv join public.products p on p.id=inv.product_id
    left join public.branch_product_pricing bp on bp.branch_id=v_pricing_branch and bp.product_id=p.id
    where inv.branch_id=v_from_inventory and inv.product_id=v_product_id;
    if v_available is null then raise exception using errcode='22023',message='TRANSFER_PRODUCT_NOT_IN_SOURCE'; end if;
    if v_available<v_qty then raise exception using errcode='22023',message='TRANSFER_INSUFFICIENT_SOURCE_STOCK',detail=v_product_id::text; end if;
    v_total_measure:=v_total_measure+v_qty;
  end loop;

  v_number:='TR-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(p_request_id::text,'-',''),1,8));
  insert into public.inventory_transfers(
    from_branch_id,to_branch_id,status,notes,created_by,transfer_type,expected_arrival_date,
    request_id,request_fingerprint,transfer_number,source_inventory_branch_id,destination_inventory_branch_id,requested_at
  ) values(
    p_from_branch_id,p_to_branch_id,'requested',nullif(trim(coalesce(p_notes,'')),''),auth.uid(),'manual',p_expected_arrival_date,
    p_request_id,v_fingerprint,v_number,v_from_inventory,v_to_inventory,now()
  ) returning * into v_transfer;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id:=(v_item->>'product_id')::uuid; v_qty:=(v_item->>'quantity')::numeric;
    select inv.quantity,p.name,p.barcode,coalesce(p.unit_of_measure,p.base_unit,'قطعة'),coalesce(bp.purchase_price,p.purchase_price)
      into v_available,v_name,v_barcode,v_unit,v_cost
    from public.inventory inv join public.products p on p.id=inv.product_id
    left join public.branch_product_pricing bp on bp.branch_id=v_pricing_branch and bp.product_id=p.id
    where inv.branch_id=v_from_inventory and inv.product_id=v_product_id;
    insert into public.inventory_transfer_items(
      transfer_id,product_id,quantity,source_quantity_snapshot,unit_cost_snapshot,product_name_snapshot,barcode_snapshot,unit_snapshot
    ) values(v_transfer.id,v_product_id,v_qty,v_available,v_cost,v_name,v_barcode,v_unit);
  end loop;

  insert into public.operations_tasks(
    branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,due_at,metadata,created_by
  ) values(
    p_from_branch_id,'inventory_transfer_dispatch','inventory_transfer_dispatch',v_transfer.id,0,'normal','open',
    'تجهيز وشحن تحويل مخزون',
    'تحويل '||v_number||' إلى '||(select name from public.branches where id=p_to_branch_id)||' · '||v_count||' صنف',
    now()+interval '4 hours',
    jsonb_build_object('transfer_id',v_transfer.id,'transfer_number',v_number,'to_branch_id',p_to_branch_id,'items_count',v_count,'total_measure',v_total_measure),
    auth.uid()
  ) returning id into v_task_id;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task_id,'created',auth.uid(),'تم إنشاء مهمة تجهيز التحويل');
  return jsonb_build_object('id',v_transfer.id,'transfer_number',v_number,'status','requested','items_count',v_count,'task_id',v_task_id,'idempotent',false);
end;
$function$;

create or replace function public.dispatch_inventory_transfer_v2(p_transfer_id uuid,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_transfer public.inventory_transfers%rowtype; v_task public.operations_tasks%rowtype; v_item public.inventory_transfer_items%rowtype;
  v_current numeric; v_receive_task uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_transfer from public.inventory_transfers where id=p_transfer_id for update;
  if v_transfer.id is null then raise exception using errcode='22023',message='TRANSFER_NOT_FOUND'; end if;
  if v_transfer.status in ('dispatched','received','received_with_variance') then return jsonb_build_object('id',v_transfer.id,'transfer_number',v_transfer.transfer_number,'status',v_transfer.status,'idempotent',true); end if;
  if v_transfer.status<>'requested' then raise exception using errcode='55000',message='TRANSFER_NOT_DISPATCHABLE'; end if;
  if not public.has_branch_access(auth.uid(),v_transfer.from_branch_id) or not public.staff_has_permission('inventory.transfer',v_transfer.from_branch_id) then raise exception using errcode='42501',message='TRANSFER_DISPATCH_DENIED'; end if;
  select * into v_task from public.operations_tasks where task_type='inventory_transfer_dispatch' and source_kind='inventory_transfer_dispatch' and source_id=v_transfer.id for update;
  if v_task.id is null then raise exception using errcode='55000',message='TRANSFER_DISPATCH_TASK_MISSING'; end if;
  if v_task.status='open' then
    update public.operations_tasks set status='in_progress',claimed_by=auth.uid(),claimed_at=now(),started_at=now(),updated_at=now() where id=v_task.id returning * into v_task;
    insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'claimed',auth.uid(),'تم استلام وتجهيز التحويل');
  elsif v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TRANSFER_TASK_CLAIMED_BY_ANOTHER_USER'; end if;

  for v_item in select * from public.inventory_transfer_items where transfer_id=v_transfer.id order by id for update loop
    select quantity into v_current from public.inventory where branch_id=v_transfer.source_inventory_branch_id and product_id=v_item.product_id for update;
    if v_current is null or v_current<v_item.quantity then raise exception using errcode='22023',message='TRANSFER_SOURCE_STOCK_CHANGED',detail=v_item.product_id::text; end if;
  end loop;

  perform set_config('app.inventory_movement_source','inventory_transfer_dispatch',true);
  perform set_config('app.inventory_reason_code','branch_transfer',true);
  perform set_config('app.inventory_note',coalesce(nullif(trim(p_note),''),'شحن تحويل '||v_transfer.transfer_number),true);
  perform set_config('app.inventory_request_id',v_transfer.id::text,true);
  perform set_config('app.inventory_task_id',v_task.id::text,true);
  for v_item in select * from public.inventory_transfer_items where transfer_id=v_transfer.id order by id loop
    update public.inventory set quantity=quantity-v_item.quantity
    where branch_id=v_transfer.source_inventory_branch_id and product_id=v_item.product_id and quantity>=v_item.quantity;
    if not found then raise exception using errcode='22023',message='TRANSFER_SOURCE_STOCK_CHANGED',detail=v_item.product_id::text; end if;
  end loop;

  update public.inventory_transfers
  set status='dispatched',approved_by=auth.uid(),dispatched_by=auth.uid(),dispatched_at=now(),dispatch_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now()
  where id=v_transfer.id returning * into v_transfer;
  update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),metadata=metadata||jsonb_build_object('dispatched_at',now()) where id=v_task.id;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'completed',auth.uid(),coalesce(nullif(trim(p_note),''),'تم شحن التحويل'));

  insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,due_at,metadata,created_by)
  values(
    v_transfer.to_branch_id,'inventory_transfer_receive','inventory_transfer_receive',v_transfer.id,0,'high','open','استلام تحويل مخزون',
    'تحويل '||v_transfer.transfer_number||' من '||(select name from public.branches where id=v_transfer.from_branch_id),now()+interval '8 hours',
    jsonb_build_object('transfer_id',v_transfer.id,'transfer_number',v_transfer.transfer_number,'from_branch_id',v_transfer.from_branch_id),auth.uid()
  ) returning id into v_receive_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_receive_task,'created',auth.uid(),'تم إنشاء مهمة استلام التحويل');
  return jsonb_build_object('id',v_transfer.id,'transfer_number',v_transfer.transfer_number,'status',v_transfer.status,'receive_task_id',v_receive_task,'idempotent',false);
end;
$function$;

create or replace function public.receive_inventory_transfer_v2(p_transfer_id uuid,p_receipt_items jsonb default null,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_transfer public.inventory_transfers%rowtype; v_task public.operations_tasks%rowtype; v_item public.inventory_transfer_items%rowtype;
  v_receipt jsonb; v_actual numeric; v_variance numeric; v_has_variance boolean:=false; v_variance_task uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_transfer from public.inventory_transfers where id=p_transfer_id for update;
  if v_transfer.id is null then raise exception using errcode='22023',message='TRANSFER_NOT_FOUND'; end if;
  if v_transfer.status in ('received','received_with_variance') then return jsonb_build_object('id',v_transfer.id,'transfer_number',v_transfer.transfer_number,'status',v_transfer.status,'idempotent',true); end if;
  if v_transfer.status<>'dispatched' then raise exception using errcode='55000',message='TRANSFER_NOT_RECEIVABLE'; end if;
  if not public.has_branch_access(auth.uid(),v_transfer.to_branch_id) or not public.staff_has_permission('inventory.transfer',v_transfer.to_branch_id) then raise exception using errcode='42501',message='TRANSFER_RECEIVE_DENIED'; end if;
  if p_receipt_items is not null and jsonb_typeof(p_receipt_items)<>'array' then raise exception using errcode='22023',message='TRANSFER_RECEIPT_ITEMS_INVALID'; end if;
  select * into v_task from public.operations_tasks where task_type='inventory_transfer_receive' and source_kind='inventory_transfer_receive' and source_id=v_transfer.id for update;
  if v_task.id is null then raise exception using errcode='55000',message='TRANSFER_RECEIVE_TASK_MISSING'; end if;
  if v_task.status='open' then
    update public.operations_tasks set status='in_progress',claimed_by=auth.uid(),claimed_at=now(),started_at=now(),updated_at=now() where id=v_task.id returning * into v_task;
    insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'claimed',auth.uid(),'تم استلام مهمة وصول التحويل');
  elsif v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TRANSFER_TASK_CLAIMED_BY_ANOTHER_USER'; end if;

  perform set_config('app.inventory_movement_source','inventory_transfer_receive',true);
  perform set_config('app.inventory_reason_code','branch_transfer',true);
  perform set_config('app.inventory_note',coalesce(nullif(trim(p_note),''),'استلام تحويل '||v_transfer.transfer_number),true);
  perform set_config('app.inventory_request_id',v_transfer.id::text,true);
  perform set_config('app.inventory_task_id',v_task.id::text,true);

  for v_item in select * from public.inventory_transfer_items where transfer_id=v_transfer.id order by id for update loop
    if p_receipt_items is null then
      v_actual:=v_item.quantity;
    else
      select value into v_receipt from jsonb_array_elements(p_receipt_items) where value->>'product_id'=v_item.product_id::text limit 1;
      if v_receipt is null then raise exception using errcode='22023',message='TRANSFER_RECEIPT_ITEM_MISSING',detail=v_item.product_id::text; end if;
      begin v_actual:=(v_receipt->>'quantity')::numeric; exception when others then raise exception using errcode='22023',message='TRANSFER_RECEIPT_QUANTITY_INVALID'; end;
      if v_actual is null or v_actual<0 or round(v_actual,3)<>v_actual then raise exception using errcode='22023',message='TRANSFER_RECEIPT_QUANTITY_INVALID'; end if;
    end if;
    v_variance:=v_actual-v_item.quantity;
    if abs(v_variance)>0.0005 then v_has_variance:=true; end if;

    if v_variance>0 then
      perform set_config('app.inventory_movement_source','inventory_transfer_receive_overage_source_correction',true);
      update public.inventory set quantity=quantity-v_variance
      where branch_id=v_transfer.source_inventory_branch_id and product_id=v_item.product_id and quantity>=v_variance;
      if not found then raise exception using errcode='22023',message='TRANSFER_OVERAGE_SOURCE_STOCK_INSUFFICIENT',detail=v_item.product_id::text; end if;
      perform set_config('app.inventory_movement_source','inventory_transfer_receive',true);
    end if;

    insert into public.inventory(product_id,branch_id,quantity,min_stock_level,max_stock_level,alert_enabled)
    values(v_item.product_id,v_transfer.destination_inventory_branch_id,0,5,100,false)
    on conflict(product_id,branch_id) do nothing;
    if v_actual>0 then update public.inventory set quantity=quantity+v_actual where branch_id=v_transfer.destination_inventory_branch_id and product_id=v_item.product_id; end if;
    update public.inventory_transfer_items set received_quantity=v_actual,variance_quantity=v_variance where id=v_item.id;
  end loop;

  if p_receipt_items is not null and exists(
    select 1 from jsonb_array_elements(p_receipt_items) r
    where not exists(select 1 from public.inventory_transfer_items i where i.transfer_id=v_transfer.id and i.product_id::text=r->>'product_id')
  ) then raise exception using errcode='22023',message='TRANSFER_RECEIPT_UNKNOWN_PRODUCT'; end if;

  update public.inventory_transfers
  set status=case when v_has_variance then 'received_with_variance' else 'received' end,
      received_by=auth.uid(),received_at=now(),receive_note=nullif(trim(coalesce(p_note,'')),''),actual_arrival_date=current_date,updated_at=now()
  where id=v_transfer.id returning * into v_transfer;
  update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),metadata=metadata||jsonb_build_object('received_at',now(),'has_variance',v_has_variance) where id=v_task.id;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'completed',auth.uid(),coalesce(nullif(trim(p_note),''),'تم استلام التحويل'));

  if v_has_variance then
    insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,due_at,metadata,created_by)
    values(
      v_transfer.to_branch_id,'inventory_transfer_variance_review','inventory_transfer_variance',v_transfer.id,0,'high','open','مراجعة فرق استلام تحويل مخزون',
      'يوجد فرق بين الكمية المشحونة والمستلمة في التحويل '||v_transfer.transfer_number,now()+interval '4 hours',
      jsonb_build_object('transfer_id',v_transfer.id,'transfer_number',v_transfer.transfer_number),auth.uid()
    ) returning id into v_variance_task;
    insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_variance_task,'created',auth.uid(),'تم إنشاء مهمة مراجعة فرق استلام التحويل');
  end if;
  return jsonb_build_object('id',v_transfer.id,'transfer_number',v_transfer.transfer_number,'status',v_transfer.status,'has_variance',v_has_variance,'variance_task_id',v_variance_task,'idempotent',false);
end;
$function$;

create or replace function public.cancel_inventory_transfer_v2(p_transfer_id uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_transfer public.inventory_transfers%rowtype; v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if v_reason is null or length(v_reason)<3 then raise exception using errcode='22023',message='TRANSFER_CANCEL_REASON_REQUIRED'; end if;
  select * into v_transfer from public.inventory_transfers where id=p_transfer_id for update;
  if v_transfer.id is null then raise exception using errcode='22023',message='TRANSFER_NOT_FOUND'; end if;
  if v_transfer.status='cancelled' then return jsonb_build_object('id',v_transfer.id,'status','cancelled','idempotent',true); end if;
  if v_transfer.status<>'requested' then raise exception using errcode='55000',message='TRANSFER_CANNOT_CANCEL_AFTER_DISPATCH'; end if;
  if not public.has_branch_access(auth.uid(),v_transfer.from_branch_id) or not public.staff_has_permission('inventory.transfer',v_transfer.from_branch_id) then raise exception using errcode='42501',message='TRANSFER_CANCEL_DENIED'; end if;
  update public.inventory_transfers set status='cancelled',cancelled_by=auth.uid(),cancelled_at=now(),cancel_reason=v_reason,updated_at=now()
  where id=v_transfer.id returning * into v_transfer;
  update public.operations_tasks set status='cancelled',updated_at=now(),metadata=metadata||jsonb_build_object('cancel_reason',v_reason,'cancelled_at',now())
  where source_kind='inventory_transfer_dispatch' and source_id=v_transfer.id and status not in ('completed','cancelled');
  insert into public.operations_task_events(task_id,event_type,actor_id,note)
  select id,'cancelled',auth.uid(),v_reason from public.operations_tasks where source_kind='inventory_transfer_dispatch' and source_id=v_transfer.id;
  return jsonb_build_object('id',v_transfer.id,'transfer_number',v_transfer.transfer_number,'status',v_transfer.status,'idempotent',false);
end;
$function$;

create or replace function public.get_inventory_transfer_workspace_v2(p_branch_id uuid,p_status text default 'active',p_limit integer default 100)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $function$
declare
  v_status text:=lower(coalesce(nullif(trim(p_status),''),'active'));
  v_limit int:=least(greatest(coalesce(p_limit,100),1),200);
  v_rows jsonb; v_targets jsonb; v_summary jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='TRANSFER_BRANCH_ACCESS_DENIED'; end if;
  if not (public.staff_has_permission('inventory.view',p_branch_id) or public.staff_has_permission('inventory.transfer',p_branch_id) or public.staff_has_permission('inventory.manage',p_branch_id)) then raise exception using errcode='42501',message='TRANSFER_VIEW_DENIED'; end if;
  if v_status not in ('active','requested','dispatched','received','variance','cancelled','all') then raise exception using errcode='22023',message='TRANSFER_STATUS_FILTER_INVALID'; end if;

  select jsonb_build_object(
    'requested',count(*) filter(where status='requested'),
    'dispatched',count(*) filter(where status='dispatched'),
    'received',count(*) filter(where status='received'),
    'received_with_variance',count(*) filter(where status='received_with_variance'),
    'cancelled',count(*) filter(where status='cancelled')
  ) into v_summary from public.inventory_transfers where from_branch_id=p_branch_id or to_branch_id=p_branch_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'transfer_number',t.transfer_number,'from_branch_id',t.from_branch_id,'from_branch_name',fb.name,
    'to_branch_id',t.to_branch_id,'to_branch_name',tb.name,'status',t.status,'notes',t.notes,'created_at',t.created_at,
    'requested_at',t.requested_at,'expected_arrival_date',t.expected_arrival_date,'dispatched_at',t.dispatched_at,'received_at',t.received_at,
    'cancelled_at',t.cancelled_at,'cancel_reason',t.cancel_reason,'dispatch_note',t.dispatch_note,'receive_note',t.receive_note,
    'created_by',t.created_by,'created_by_name',cu.name,'dispatched_by',t.dispatched_by,'dispatched_by_name',du.name,
    'received_by',t.received_by,'received_by_name',ru.name,
    'direction',case when t.from_branch_id=p_branch_id then 'outgoing' else 'incoming' end,
    'items',coalesce(items.rows,'[]'::jsonb),'items_count',coalesce(items.items_count,0),'total_measure',coalesce(items.total_measure,0),
    'total_cost_value',coalesce(items.total_cost_value,0),'has_variance',coalesce(items.has_variance,false),
    'can_dispatch',t.status='requested' and t.from_branch_id=p_branch_id and public.staff_has_permission('inventory.transfer',p_branch_id),
    'can_receive',t.status='dispatched' and t.to_branch_id=p_branch_id and public.staff_has_permission('inventory.transfer',p_branch_id),
    'can_cancel',t.status='requested' and t.from_branch_id=p_branch_id and public.staff_has_permission('inventory.transfer',p_branch_id)
  ) order by t.created_at desc),'[]'::jsonb) into v_rows
  from public.inventory_transfers t
  join public.branches fb on fb.id=t.from_branch_id join public.branches tb on tb.id=t.to_branch_id
  left join public.users cu on cu.id=t.created_by left join public.users du on du.id=t.dispatched_by left join public.users ru on ru.id=t.received_by
  left join lateral(
    select count(*)::int items_count,coalesce(sum(i.quantity),0)::numeric total_measure,
      round(coalesce(sum(i.quantity*coalesce(i.unit_cost_snapshot,0)),0),2) total_cost_value,
      bool_or(abs(coalesce(i.variance_quantity,0))>0.0005) has_variance,
      coalesce(jsonb_agg(jsonb_build_object(
        'id',i.id,'product_id',i.product_id,'product_name',coalesce(i.product_name_snapshot,p.name),
        'barcode',coalesce(i.barcode_snapshot,p.barcode),'unit',coalesce(i.unit_snapshot,p.unit_of_measure,p.base_unit,'قطعة'),
        'quantity',i.quantity,'received_quantity',i.received_quantity,'variance_quantity',i.variance_quantity,
        'source_quantity_snapshot',i.source_quantity_snapshot,'unit_cost_snapshot',i.unit_cost_snapshot
      ) order by coalesce(i.product_name_snapshot,p.name)),'[]'::jsonb) rows
    from public.inventory_transfer_items i left join public.products p on p.id=i.product_id where i.transfer_id=t.id
  ) items on true
  where (t.from_branch_id=p_branch_id or t.to_branch_id=p_branch_id)
    and (v_status='all' or (v_status='active' and t.status in ('requested','dispatched','received_with_variance'))
      or (v_status='variance' and t.status='received_with_variance') or t.status=v_status)
  limit v_limit;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'name',b.name,'inventory_source_branch_id',coalesce(b.inventory_source_branch_id,b.id)
  ) order by b.name),'[]'::jsonb)
  into v_targets
  from public.branches b
  where b.active and b.id<>p_branch_id
    and coalesce(b.inventory_source_branch_id,b.id)<>(select coalesce(inventory_source_branch_id,id) from public.branches where id=p_branch_id);

  return jsonb_build_object(
    'version',2,'branch_id',p_branch_id,'permissions',jsonb_build_object('can_transfer',public.staff_has_permission('inventory.transfer',p_branch_id)),
    'summary',coalesce(v_summary,'{}'::jsonb),'transfers',coalesce(v_rows,'[]'::jsonb),'target_branches',coalesce(v_targets,'[]'::jsonb),
    'data_quality',jsonb_build_object('legacy_transfer_rows',(select count(*) from public.inventory_transfers where request_id is null),'shared_inventory_targets_excluded',true)
  );
end;
$function$;

create or replace function public.search_inventory_transfer_products_v2(p_branch_id uuid,p_search text default null,p_limit integer default 30)
returns setof jsonb
language plpgsql
stable security definer
set search_path=''
as $function$
declare v_inventory_branch uuid; v_q text:=lower(trim(coalesce(p_search,'')));
begin
  if auth.uid() is null or not public.staff_has_permission('inventory.transfer',p_branch_id) then raise exception using errcode='42501',message='INVENTORY_TRANSFER_DENIED'; end if;
  select inventory_branch_id into v_inventory_branch from private.resolve_branch_sources(p_branch_id);
  return query
  select jsonb_build_object(
    'product_id',p.id,'name',p.name,'barcode',p.barcode,'quantity',i.quantity,
    'unit_of_measure',coalesce(p.unit_of_measure,p.base_unit,'قطعة'),'shelf_location',p.shelf_location,
    'image_url',case when p.image_urls is not null and cardinality(p.image_urls)>0 then p.image_urls[1] else null end
  )
  from public.inventory i join public.products p on p.id=i.product_id
  where i.branch_id=v_inventory_branch and i.quantity>0
    and (v_q='' or lower(p.name) like '%'||v_q||'%' or lower(coalesce(p.barcode,'')) like '%'||v_q||'%' or lower(coalesce(p.shelf_location,'')) like '%'||v_q||'%')
  order by p.name limit least(greatest(coalesce(p_limit,30),1),100);
end;
$function$;

revoke all on function public.create_inventory_transfer_v2(uuid,uuid,uuid,jsonb,text,date) from public,anon;
revoke all on function public.dispatch_inventory_transfer_v2(uuid,text) from public,anon;
revoke all on function public.receive_inventory_transfer_v2(uuid,jsonb,text) from public,anon;
revoke all on function public.cancel_inventory_transfer_v2(uuid,text) from public,anon;
revoke all on function public.get_inventory_transfer_workspace_v2(uuid,text,integer) from public,anon;
revoke all on function public.search_inventory_transfer_products_v2(uuid,text,integer) from public,anon;
grant execute on function public.create_inventory_transfer_v2(uuid,uuid,uuid,jsonb,text,date) to authenticated,service_role;
grant execute on function public.dispatch_inventory_transfer_v2(uuid,text) to authenticated,service_role;
grant execute on function public.receive_inventory_transfer_v2(uuid,jsonb,text) to authenticated,service_role;
grant execute on function public.cancel_inventory_transfer_v2(uuid,text) to authenticated,service_role;
grant execute on function public.get_inventory_transfer_workspace_v2(uuid,text,integer) to authenticated,service_role;
grant execute on function public.search_inventory_transfer_products_v2(uuid,text,integer) to authenticated,service_role;
