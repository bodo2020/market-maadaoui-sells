-- Staff Expiry Actions V2
-- Atomic expiry disposal / supplier return workflow.
-- This migration is versioned in Git only. Do not apply to production without QA.

create table if not exists public.supplier_returns_v2 (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  inventory_branch_id uuid not null references public.branches(id),
  supplier_id uuid not null references public.suppliers(id),
  status text not null default 'pending_credit'
    check (status in ('pending_credit','credited','cancelled')),
  expected_credit_amount numeric not null default 0
    check (expected_credit_amount >= 0),
  actual_credit_amount numeric,
  credit_note_number text,
  notes text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  settled_by uuid,
  settled_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_return_items_v2 (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.supplier_returns_v2(id) on delete cascade,
  product_id uuid not null references public.products(id),
  batch_id uuid not null references public.product_batches(id),
  batch_number text not null,
  quantity numeric not null check (quantity > 0 and round(quantity,3)=quantity),
  purchase_price numeric not null default 0 check (purchase_price >= 0),
  line_amount numeric not null default 0 check (line_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists private.expiry_inventory_actions_v2 (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  fingerprint text not null,
  branch_id uuid not null references public.branches(id),
  inventory_branch_id uuid not null references public.branches(id),
  batch_id uuid not null references public.product_batches(id),
  product_id uuid not null references public.products(id),
  action_type text not null check (action_type in ('dispose','supplier_return')),
  quantity numeric not null check (quantity > 0 and round(quantity,3)=quantity),
  purchase_price numeric not null default 0 check (purchase_price >= 0),
  value_amount numeric not null default 0 check (value_amount >= 0),
  supplier_id uuid references public.suppliers(id),
  supplier_return_id uuid references public.supplier_returns_v2(id),
  expense_id uuid references public.expenses(id),
  note text,
  actor_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists supplier_returns_v2_branch_status_idx
  on public.supplier_returns_v2(branch_id,status,created_at desc);
create index if not exists supplier_returns_v2_supplier_idx
  on public.supplier_returns_v2(supplier_id,created_at desc);
create index if not exists supplier_return_items_v2_return_idx
  on public.supplier_return_items_v2(return_id);
create index if not exists expiry_inventory_actions_v2_branch_time_idx
  on private.expiry_inventory_actions_v2(branch_id,created_at desc);
create index if not exists expiry_inventory_actions_v2_batch_idx
  on private.expiry_inventory_actions_v2(batch_id,created_at desc);

alter table public.supplier_returns_v2 enable row level security;
alter table public.supplier_return_items_v2 enable row level security;

revoke all on table public.supplier_returns_v2 from public,anon,authenticated;
revoke all on table public.supplier_return_items_v2 from public,anon,authenticated;

create or replace function public.get_expiry_workspace_v2(
  p_branch_id uuid,
  p_days_ahead integer default 30,
  p_limit integer default 250
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_days integer:=least(greatest(coalesce(p_days_ahead,30),1),90);
  v_limit integer:=least(greatest(coalesce(p_limit,250),1),500);
  v_items jsonb;
  v_summary jsonb;
  v_inventory_branch uuid;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;

  if not public.has_branch_access(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='EXPIRY_BRANCH_ACCESS_DENIED';
  end if;

  if not (
    private.staff_is_super_admin(v_uid)
    or public.staff_has_permission('inventory.manage',p_branch_id)
    or public.staff_has_permission('products.manage',p_branch_id)
    or public.staff_has_permission('purchases.manage',p_branch_id)
  ) then
    raise exception using errcode='42501',message='EXPIRY_VIEW_DENIED';
  end if;

  select coalesce(b.inventory_source_branch_id,b.id)
  into v_inventory_branch
  from public.branches b
  where b.id=p_branch_id and b.active;

  if v_inventory_branch is null then
    raise exception using errcode='22023',message='BRANCH_NOT_FOUND';
  end if;

  with base as (
    select
      b.id batch_id,
      b.product_id,
      p.name product_name,
      p.barcode,
      case when p.image_urls is not null and cardinality(p.image_urls)>0 then p.image_urls[1] else null end image_url,
      b.batch_number,
      b.expiry_date,
      b.quantity,
      coalesce(b.shelf_location,p.shelf_location) shelf_location,
      coalesce(nullif(b.purchase_price,0),nullif(pi.price,0),nullif(p.purchase_price,0),0)::numeric purchase_price,
      coalesce(b.supplier_id,pu.supplier_id) supplier_id,
      s.name supplier_name,
      b.purchase_item_id,
      b.notes,
      coalesce(i.quantity,0)::numeric inventory_quantity,
      coalesce((
        select sum(bq.quantity)
        from public.product_batches bq
        where bq.branch_id=p_branch_id
          and bq.product_id=b.product_id
          and bq.quantity>0
          and upper(coalesce(bq.batch_number,'')) not like 'DAMAGED-%'
      ),0)::numeric active_batch_quantity,
      exists(
        select 1
        from private.inventory_audit_counts_v2 c
        where c.branch_id=p_branch_id
          and c.product_id=b.product_id
          and c.status='matched'
          and c.submitted_at>=now()-interval '4 hours'
          and abs(coalesce(c.actual_count,0)-coalesce(i.quantity,0))<=0.001
      ) audit_verified,
      (upper(coalesce(b.batch_number,'')) like 'REMAINING-%') legacy_remaining_batch,
      (
        select count(*)::integer
        from public.product_batches bx
        where bx.branch_id=b.branch_id
          and bx.product_id=b.product_id
          and coalesce(bx.batch_number,'')=coalesce(b.batch_number,'')
          and bx.expiry_date=b.expiry_date
          and bx.quantity>0
          and upper(coalesce(bx.batch_number,'')) not like 'DAMAGED-%'
      ) duplicate_count
    from public.product_batches b
    join public.products p on p.id=b.product_id
    left join public.purchase_items pi on pi.id=b.purchase_item_id
    left join public.purchases pu on pu.id=pi.purchase_id
    left join public.suppliers s on s.id=coalesce(b.supplier_id,pu.supplier_id)
    left join public.inventory i on i.branch_id=v_inventory_branch and i.product_id=b.product_id
    where b.branch_id=p_branch_id
      and b.quantity>0
      and b.expiry_date<=current_date+v_days
      and upper(coalesce(b.batch_number,'')) not like 'DAMAGED-%'
  )
  select jsonb_build_object(
    'expired',count(*) filter(where expiry_date<current_date),
    'today',count(*) filter(where expiry_date=current_date),
    'within_3_days',count(*) filter(where expiry_date>current_date and expiry_date<=current_date+3),
    'within_7_days',count(*) filter(where expiry_date>=current_date and expiry_date<=current_date+7),
    'total_quantity',round(coalesce(sum(quantity),0),3),
    'purchase_value_at_risk',round(coalesce(sum(quantity*purchase_price),0),2),
    'supplier_return_ready',count(*) filter(where supplier_id is not null),
    'legacy_remaining_rows',count(*) filter(where legacy_remaining_batch),
    'zero_cost_rows',count(*) filter(where purchase_price<=0),
    'duplicate_rows',count(*) filter(where duplicate_count>1),
    'batch_mismatch_rows',count(*) filter(where abs(active_batch_quantity-inventory_quantity)>0.001),
    'audit_pending_rows',count(*) filter(where not audit_verified),
    'data_quality_safe_rows',count(*) filter(where purchase_price>0 and not legacy_remaining_batch and duplicate_count=1),
    'action_ready_rows',count(*) filter(
      where purchase_price>0
        and not legacy_remaining_batch
        and duplicate_count=1
        and audit_verified
        and abs(active_batch_quantity-inventory_quantity)<=0.001
    )
  )
  into v_summary
  from base;

  with base as (
    select
      b.id batch_id,
      b.product_id,
      p.name product_name,
      p.barcode,
      case when p.image_urls is not null and cardinality(p.image_urls)>0 then p.image_urls[1] else null end image_url,
      b.batch_number,
      b.expiry_date,
      b.quantity,
      coalesce(b.shelf_location,p.shelf_location) shelf_location,
      coalesce(nullif(b.purchase_price,0),nullif(pi.price,0),nullif(p.purchase_price,0),0)::numeric purchase_price,
      coalesce(b.supplier_id,pu.supplier_id) supplier_id,
      s.name supplier_name,
      b.notes,
      coalesce(i.quantity,0)::numeric inventory_quantity,
      coalesce((
        select sum(bq.quantity)
        from public.product_batches bq
        where bq.branch_id=p_branch_id
          and bq.product_id=b.product_id
          and bq.quantity>0
          and upper(coalesce(bq.batch_number,'')) not like 'DAMAGED-%'
      ),0)::numeric active_batch_quantity,
      (
        select c.id
        from private.inventory_audit_counts_v2 c
        where c.branch_id=p_branch_id
          and c.product_id=b.product_id
          and c.status='matched'
          and c.submitted_at>=now()-interval '4 hours'
          and abs(coalesce(c.actual_count,0)-coalesce(i.quantity,0))<=0.001
        order by c.submitted_at desc
        limit 1
      ) verified_count_id,
      (
        select max(c.submitted_at)
        from private.inventory_audit_counts_v2 c
        where c.branch_id=p_branch_id
          and c.product_id=b.product_id
          and c.status='matched'
          and abs(coalesce(c.actual_count,0)-coalesce(i.quantity,0))<=0.001
      ) last_verified_at,
      (upper(coalesce(b.batch_number,'')) like 'REMAINING-%') legacy_remaining_batch,
      (
        select count(*)::integer
        from public.product_batches bx
        where bx.branch_id=b.branch_id
          and bx.product_id=b.product_id
          and coalesce(bx.batch_number,'')=coalesce(b.batch_number,'')
          and bx.expiry_date=b.expiry_date
          and bx.quantity>0
          and upper(coalesce(bx.batch_number,'')) not like 'DAMAGED-%'
      ) duplicate_count
    from public.product_batches b
    join public.products p on p.id=b.product_id
    left join public.purchase_items pi on pi.id=b.purchase_item_id
    left join public.purchases pu on pu.id=pi.purchase_id
    left join public.suppliers s on s.id=coalesce(b.supplier_id,pu.supplier_id)
    left join public.inventory i on i.branch_id=v_inventory_branch and i.product_id=b.product_id
    where b.branch_id=p_branch_id
      and b.quantity>0
      and b.expiry_date<=current_date+v_days
      and upper(coalesce(b.batch_number,'')) not like 'DAMAGED-%'
    order by b.expiry_date asc,b.created_at asc,b.id
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'batch_id',batch_id,
    'product_id',product_id,
    'product_name',product_name,
    'barcode',barcode,
    'image_url',image_url,
    'batch_number',batch_number,
    'expiry_date',expiry_date,
    'quantity',round(quantity,3),
    'shelf_location',shelf_location,
    'purchase_price',round(purchase_price,2),
    'supplier_id',supplier_id,
    'supplier_name',supplier_name,
    'can_supplier_return',supplier_id is not null,
    'legacy_remaining_batch',legacy_remaining_batch,
    'duplicate_count',duplicate_count,
    'cost_missing',purchase_price<=0,
    'inventory_quantity',round(inventory_quantity,3),
    'active_batch_quantity',round(active_batch_quantity,3),
    'batch_inventory_aligned',abs(active_batch_quantity-inventory_quantity)<=0.001,
    'verified_count_id',verified_count_id,
    'last_verified_at',last_verified_at,
    'audit_verified',verified_count_id is not null,
    'safe_for_action',purchase_price>0 and not legacy_remaining_batch and duplicate_count=1,
    'action_ready',purchase_price>0 and not legacy_remaining_batch and duplicate_count=1 and verified_count_id is not null and abs(active_batch_quantity-inventory_quantity)<=0.001,
    'notes',notes
  ) order by expiry_date,batch_number),'[]'::jsonb)
  into v_items
  from base;

  return jsonb_build_object(
    'branch_id',p_branch_id,
    'days_ahead',v_days,
    'summary',coalesce(v_summary,'{}'::jsonb),
    'items',v_items
  );
end;
$function$;

create or replace function public.process_expiry_batch_action_v2(
  p_request_id uuid,
  p_branch_id uuid,
  p_batch_id uuid,
  p_quantity numeric,
  p_action text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_action text:=lower(trim(coalesce(p_action,'')));
  v_note text:=trim(coalesce(p_note,''));
  v_fingerprint text;
  v_existing private.expiry_inventory_actions_v2%rowtype;
  v_batch public.product_batches%rowtype;
  v_product public.products%rowtype;
  v_inventory_branch uuid;
  v_supplier_id uuid;
  v_purchase_price numeric:=0;
  v_value numeric:=0;
  v_inventory_after numeric;
  v_inventory_quantity numeric:=0;
  v_active_batch_quantity numeric:=0;
  v_expense_id uuid;
  v_supplier_return_id uuid;
  v_recent_verified boolean:=false;
  v_duplicate_count integer:=0;
begin
  if v_uid is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;

  if p_request_id is null or p_branch_id is null or p_batch_id is null then
    raise exception using errcode='22023',message='EXPIRY_ACTION_REQUIRED_FIELDS';
  end if;

  if not public.has_branch_access(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='EXPIRY_BRANCH_ACCESS_DENIED';
  end if;

  if v_action not in ('dispose','supplier_return') then
    raise exception using errcode='22023',message='EXPIRY_ACTION_INVALID';
  end if;

  if p_quantity is null or p_quantity<=0 or p_quantity::text in ('NaN','Infinity','-Infinity')
     or round(p_quantity,3)<>p_quantity then
    raise exception using errcode='22023',message='EXPIRY_QUANTITY_INVALID';
  end if;

  if length(v_note)<3 or length(v_note)>500 then
    raise exception using errcode='22023',message='EXPIRY_NOTE_REQUIRED';
  end if;

  if v_action='dispose' then
    if not (
      private.staff_is_super_admin(v_uid)
      or public.staff_has_permission('inventory.manage',p_branch_id)
    ) then
      raise exception using errcode='42501',message='EXPIRY_DISPOSE_DENIED';
    end if;
  else
    if not (
      private.staff_is_super_admin(v_uid)
      or public.staff_has_permission('inventory.manage',p_branch_id)
      or public.staff_has_permission('purchases.manage',p_branch_id)
    ) then
      raise exception using errcode='42501',message='EXPIRY_SUPPLIER_RETURN_DENIED';
    end if;
  end if;

  v_fingerprint:=md5(jsonb_build_array(p_branch_id,p_batch_id,round(p_quantity,3),v_action,v_note)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,83));

  select * into v_existing
  from private.expiry_inventory_actions_v2
  where request_id=p_request_id;

  if found then
    if v_existing.actor_id<>v_uid or v_existing.fingerprint<>v_fingerprint then
      raise exception using errcode='42501',message='REQUEST_CONFLICT';
    end if;
    return jsonb_build_object(
      'ok',true,
      'idempotent',true,
      'action_id',v_existing.id,
      'action_type',v_existing.action_type,
      'quantity',v_existing.quantity,
      'purchase_price',v_existing.purchase_price,
      'value_amount',v_existing.value_amount,
      'supplier_return_id',v_existing.supplier_return_id,
      'expense_id',v_existing.expense_id
    );
  end if;

  -- Resolve the product before row locking, then serialize every expiry/reconciliation
  -- mutation for the same branch+product through the same advisory lock key.
  select * into v_batch
  from public.product_batches
  where id=p_batch_id;

  if not found then
    raise exception using errcode='22023',message='EXPIRY_BATCH_NOT_FOUND';
  end if;

  if v_batch.branch_id is distinct from p_branch_id then
    raise exception using errcode='42501',message='EXPIRY_BATCH_BRANCH_MISMATCH';
  end if;

  select coalesce(b.inventory_source_branch_id,b.id)
  into v_inventory_branch
  from public.branches b
  where b.id=p_branch_id and b.active;

  if v_inventory_branch is null then
    raise exception using errcode='22023',message='BRANCH_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    v_inventory_branch::text||':'||v_batch.product_id::text,91
  ));

  -- Re-read under row lock after acquiring the product lock in case another
  -- transaction changed the batch while this action was waiting.
  select * into v_batch
  from public.product_batches
  where id=p_batch_id
  for update;

  if not found then
    raise exception using errcode='22023',message='EXPIRY_BATCH_NOT_FOUND';
  end if;

  if v_batch.branch_id is distinct from p_branch_id then
    raise exception using errcode='42501',message='EXPIRY_BATCH_BRANCH_MISMATCH';
  end if;

  if p_quantity>v_batch.quantity then
    raise exception using errcode='22023',message='EXPIRY_BATCH_QUANTITY_EXCEEDED';
  end if;

  if upper(coalesce(v_batch.batch_number,'')) like 'DAMAGED-%' then
    raise exception using errcode='22023',message='EXPIRY_LEGACY_DAMAGED_BATCH';
  end if;

  if upper(coalesce(v_batch.batch_number,'')) like 'REMAINING-%' then
    raise exception using errcode='22023',message='EXPIRY_LEGACY_REMAINING_REQUIRES_RECONCILIATION';
  end if;

  select count(*)::integer into v_duplicate_count
  from public.product_batches bx
  where bx.branch_id=v_batch.branch_id
    and bx.product_id=v_batch.product_id
    and coalesce(bx.batch_number,'')=coalesce(v_batch.batch_number,'')
    and bx.expiry_date=v_batch.expiry_date
    and bx.quantity>0
    and upper(coalesce(bx.batch_number,'')) not like 'DAMAGED-%';

  if v_duplicate_count>1 then
    raise exception using errcode='22023',message='EXPIRY_DUPLICATE_BATCH_REQUIRES_RECONCILIATION';
  end if;

  select coalesce(i.quantity,0)
    into v_inventory_quantity
  from public.inventory i
  where i.branch_id=v_inventory_branch
    and i.product_id=v_batch.product_id
  for update;

  if not found then
    v_inventory_quantity:=0;
  end if;

  select coalesce(sum(bx.quantity),0)
  into v_active_batch_quantity
  from public.product_batches bx
  where bx.branch_id=p_branch_id
    and bx.product_id=v_batch.product_id
    and bx.quantity>0
    and upper(coalesce(bx.batch_number,'')) not like 'DAMAGED-%';

  if abs(v_active_batch_quantity-v_inventory_quantity)>0.001 then
    raise exception using errcode='22023',message='EXPIRY_BATCH_INVENTORY_MISMATCH_REQUIRES_RECONCILIATION';
  end if;

  select exists(
    select 1
    from private.inventory_audit_counts_v2 c
    where c.branch_id=p_branch_id
      and c.product_id=v_batch.product_id
      and c.status='matched'
      and c.submitted_at>=now()-interval '4 hours'
      and abs(coalesce(c.actual_count,0)-v_inventory_quantity)<=0.001
  ) into v_recent_verified;

  if not v_recent_verified then
    raise exception using errcode='22023',message='EXPIRY_RECENT_AUDIT_REQUIRED';
  end if;

  select * into v_product
  from public.products
  where id=v_batch.product_id;

  if not found then
    raise exception using errcode='22023',message='PRODUCT_NOT_FOUND';
  end if;

  select coalesce(
    v_batch.supplier_id,
    pu.supplier_id
  )
  into v_supplier_id
  from (select 1) x
  left join public.purchase_items pi on pi.id=v_batch.purchase_item_id
  left join public.purchases pu on pu.id=pi.purchase_id;

  select coalesce(
    nullif(v_batch.purchase_price,0),
    nullif(pi.price,0),
    nullif(v_product.purchase_price,0),
    0
  )
  into v_purchase_price
  from (select 1) x
  left join public.purchase_items pi on pi.id=v_batch.purchase_item_id;

  v_purchase_price:=greatest(coalesce(v_purchase_price,0),0);

  if v_purchase_price<=0 then
    raise exception using errcode='22023',message='EXPIRY_COST_REQUIRED';
  end if;

  v_value:=round(p_quantity*v_purchase_price,2);

  if v_action='supplier_return' and v_supplier_id is null then
    raise exception using errcode='22023',message='EXPIRY_SUPPLIER_REQUIRED';
  end if;

  perform set_config('app.inventory_reason_code',
    case when v_action='dispose' then 'expiry_disposal' else 'supplier_return' end,true);
  perform set_config('app.inventory_note',v_note,true);
  perform set_config('app.inventory_request_id',p_request_id::text,true);

  v_inventory_after:=private.consume_available_inventory_v1(
    v_inventory_branch,
    v_batch.product_id,
    p_quantity,
    case when v_action='dispose' then 'expiry_disposal' else 'expiry_supplier_return' end
  );

  update public.product_batches
  set quantity=quantity-p_quantity,
      updated_at=now()
  where id=v_batch.id;

  if v_action='dispose' then
    if v_value>0 then
      insert into public.expenses(
        type,amount,description,date,receipt_url,branch_id,payment_method,
        paid_from_account_id,created_by,status
      ) values(
        'إهلاك صلاحية',
        v_value,
        'إهلاك دفعة منتهية/غير صالحة - '||v_product.name||' - دفعة '||v_batch.batch_number||
          ' - كمية '||trim(to_char(p_quantity,'FM9999999990.999')),
        now(),null,p_branch_id,'noncash',null,v_uid,'active'
      )
      returning id into v_expense_id;
    end if;
  else
    insert into public.supplier_returns_v2(
      branch_id,inventory_branch_id,supplier_id,status,expected_credit_amount,
      notes,created_by
    ) values(
      p_branch_id,v_inventory_branch,v_supplier_id,'pending_credit',v_value,
      v_note,v_uid
    )
    returning id into v_supplier_return_id;

    insert into public.supplier_return_items_v2(
      return_id,product_id,batch_id,batch_number,quantity,purchase_price,line_amount
    ) values(
      v_supplier_return_id,v_batch.product_id,v_batch.id,v_batch.batch_number,
      p_quantity,v_purchase_price,v_value
    );
  end if;

  insert into private.expiry_inventory_actions_v2(
    request_id,fingerprint,branch_id,inventory_branch_id,batch_id,product_id,
    action_type,quantity,purchase_price,value_amount,supplier_id,
    supplier_return_id,expense_id,note,actor_id
  ) values(
    p_request_id,v_fingerprint,p_branch_id,v_inventory_branch,v_batch.id,v_batch.product_id,
    v_action,p_quantity,v_purchase_price,v_value,v_supplier_id,
    v_supplier_return_id,v_expense_id,v_note,v_uid
  )
  returning * into v_existing;

  return jsonb_build_object(
    'ok',true,
    'idempotent',false,
    'action_id',v_existing.id,
    'action_type',v_action,
    'product_id',v_batch.product_id,
    'batch_id',v_batch.id,
    'batch_number',v_batch.batch_number,
    'quantity',p_quantity,
    'batch_quantity_after',v_batch.quantity-p_quantity,
    'inventory_quantity_after',v_inventory_after,
    'purchase_price',v_purchase_price,
    'value_amount',v_value,
    'cost_missing',v_purchase_price=0,
    'supplier_id',v_supplier_id,
    'supplier_return_id',v_supplier_return_id,
    'expense_id',v_expense_id
  );
end;
$function$;

create or replace function public.get_supplier_returns_workspace_v2(
  p_branch_id uuid,
  p_status text default 'pending_credit',
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_status text:=lower(trim(coalesce(p_status,'pending_credit')));
  v_limit integer:=least(greatest(coalesce(p_limit,100),1),200);
  v_rows jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not public.has_branch_access(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='SUPPLIER_RETURN_BRANCH_ACCESS_DENIED';
  end if;
  if not (
    private.staff_is_super_admin(v_uid)
    or public.staff_has_permission('purchases.manage',p_branch_id)
    or public.staff_has_permission('inventory.manage',p_branch_id)
    or public.staff_has_permission('finance.manage',p_branch_id)
  ) then
    raise exception using errcode='42501',message='SUPPLIER_RETURN_VIEW_DENIED';
  end if;
  if v_status not in ('pending_credit','credited','cancelled','all') then
    raise exception using errcode='22023',message='SUPPLIER_RETURN_STATUS_INVALID';
  end if;

  select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb)
  into v_rows
  from (
    select
      r.created_at,
      jsonb_build_object(
        'id',r.id,
        'branch_id',r.branch_id,
        'supplier_id',r.supplier_id,
        'supplier_name',s.name,
        'status',r.status,
        'expected_credit_amount',r.expected_credit_amount,
        'actual_credit_amount',r.actual_credit_amount,
        'credit_note_number',r.credit_note_number,
        'notes',r.notes,
        'created_at',r.created_at,
        'settled_at',r.settled_at,
        'items',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',i.id,
            'product_id',i.product_id,
            'product_name',p.name,
            'batch_id',i.batch_id,
            'batch_number',i.batch_number,
            'quantity',i.quantity,
            'purchase_price',i.purchase_price,
            'line_amount',i.line_amount
          ) order by i.created_at)
          from public.supplier_return_items_v2 i
          join public.products p on p.id=i.product_id
          where i.return_id=r.id
        ),'[]'::jsonb)
      ) row_data
    from public.supplier_returns_v2 r
    join public.suppliers s on s.id=r.supplier_id
    where r.branch_id=p_branch_id
      and (v_status='all' or r.status=v_status)
    order by r.created_at desc
    limit v_limit
  ) x;

  return jsonb_build_object('branch_id',p_branch_id,'status',v_status,'items',v_rows);
end;
$function$;

create or replace function public.settle_supplier_return_v2(
  p_return_id uuid,
  p_actual_credit_amount numeric,
  p_credit_note_number text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_row public.supplier_returns_v2%rowtype;
  v_note text:=trim(coalesce(p_note,''));
  v_credit_note text:=trim(coalesce(p_credit_note_number,''));
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;

  select * into v_row
  from public.supplier_returns_v2
  where id=p_return_id
  for update;

  if not found then raise exception using errcode='22023',message='SUPPLIER_RETURN_NOT_FOUND'; end if;

  if not (
    public.staff_has_permission('purchases.manage',v_row.branch_id)
    or public.staff_has_permission('finance.manage',v_row.branch_id)
  ) then
    raise exception using errcode='42501',message='SUPPLIER_RETURN_SETTLE_DENIED';
  end if;

  if v_row.status<>'pending_credit' then
    raise exception using errcode='22023',message='SUPPLIER_RETURN_NOT_PENDING';
  end if;

  if p_actual_credit_amount is null or p_actual_credit_amount<0
     or p_actual_credit_amount::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode='22023',message='SUPPLIER_RETURN_CREDIT_INVALID';
  end if;

  if length(v_credit_note)<2 then
    raise exception using errcode='22023',message='SUPPLIER_RETURN_CREDIT_NOTE_REQUIRED';
  end if;

  update public.supplier_returns_v2
  set status='credited',
      actual_credit_amount=round(p_actual_credit_amount,2),
      credit_note_number=v_credit_note,
      notes=case when v_note='' then notes else concat_ws(E'\n',notes,'تسوية: '||v_note) end,
      settled_by=v_uid,
      settled_at=now(),
      updated_at=now()
  where id=p_return_id
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,
    'return_id',v_row.id,
    'status',v_row.status,
    'expected_credit_amount',v_row.expected_credit_amount,
    'actual_credit_amount',v_row.actual_credit_amount,
    'credit_note_number',v_row.credit_note_number,
    'settled_at',v_row.settled_at
  );
end;
$function$;

revoke all on function public.get_expiry_workspace_v2(uuid,integer,integer) from public,anon;
revoke all on function public.process_expiry_batch_action_v2(uuid,uuid,uuid,numeric,text,text) from public,anon;
revoke all on function public.get_supplier_returns_workspace_v2(uuid,text,integer) from public,anon;
revoke all on function public.settle_supplier_return_v2(uuid,numeric,text,text) from public,anon;

grant execute on function public.get_expiry_workspace_v2(uuid,integer,integer) to authenticated,service_role;
grant execute on function public.process_expiry_batch_action_v2(uuid,uuid,uuid,numeric,text,text) to authenticated,service_role;
grant execute on function public.get_supplier_returns_workspace_v2(uuid,text,integer) to authenticated,service_role;
grant execute on function public.settle_supplier_return_v2(uuid,numeric,text,text) to authenticated,service_role;
