-- Staff batch reconciliation V1.
-- Rebuilds product batch allocation without changing inventory quantity or finance.
-- Versioned in Git only; do not apply to Production before Preview/Development QA.

create table if not exists private.inventory_batch_reconciliations_v1 (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  fingerprint text not null,
  branch_id uuid not null references public.branches(id),
  inventory_branch_id uuid not null references public.branches(id),
  product_id uuid not null references public.products(id),
  inventory_quantity numeric not null,
  verified_count_id uuid,
  before_batches jsonb not null default '[]'::jsonb,
  after_batches jsonb not null default '[]'::jsonb,
  note text not null,
  actor_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_batch_reconciliations_v1_branch_time_idx
  on private.inventory_batch_reconciliations_v1(branch_id,created_at desc);
create index if not exists inventory_batch_reconciliations_v1_product_time_idx
  on private.inventory_batch_reconciliations_v1(product_id,created_at desc);

alter table private.inventory_batch_reconciliations_v1 enable row level security;
revoke all on table private.inventory_batch_reconciliations_v1 from public,anon,authenticated;

create or replace function public.get_inventory_batch_reconciliation_workspace_v1(
  p_branch_id uuid,
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
  v_limit integer:=least(greatest(coalesce(p_limit,100),1),250);
  v_inventory_branch uuid;
  v_items jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not public.has_branch_access(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='BATCH_RECON_BRANCH_ACCESS_DENIED';
  end if;

  if not (
    private.staff_is_super_admin(v_uid)
    or (
      public.staff_has_permission('inventory.manage',p_branch_id)
      and public.staff_has_permission('purchases.manage',p_branch_id)
    )
  ) then
    raise exception using errcode='42501',message='BATCH_RECON_PERMISSION_DENIED';
  end if;

  select coalesce(b.inventory_source_branch_id,b.id)
  into v_inventory_branch
  from public.branches b
  where b.id=p_branch_id and b.active;

  if v_inventory_branch is null then
    raise exception using errcode='22023',message='BRANCH_NOT_FOUND';
  end if;

  with affected as (
    select distinct b.product_id
    from public.product_batches b
    join public.products p on p.id=b.product_id
    left join public.purchase_items pi on pi.id=b.purchase_item_id
    where b.branch_id=p_branch_id
      and b.quantity>0
      and upper(coalesce(b.batch_number,'')) not like 'DAMAGED-%'
      and (
        upper(coalesce(b.batch_number,'')) like 'REMAINING-%'
        or coalesce(nullif(b.purchase_price,0),nullif(pi.price,0),nullif(p.purchase_price,0),0)<=0
        or exists(
          select 1 from public.product_batches x
          where x.id<>b.id
            and x.branch_id=b.branch_id
            and x.product_id=b.product_id
            and coalesce(x.batch_number,'')=coalesce(b.batch_number,'')
            and x.expiry_date=b.expiry_date
            and x.quantity>0
            and upper(coalesce(x.batch_number,'')) not like 'DAMAGED-%'
        )
      )
  ), base as (
    select
      a.product_id,
      p.name product_name,
      p.barcode,
      coalesce(i.quantity,0)::numeric inventory_quantity,
      coalesce((
        select sum(b.quantity)
        from public.product_batches b
        where b.branch_id=p_branch_id
          and b.product_id=a.product_id
          and b.quantity>0
          and upper(coalesce(b.batch_number,'')) not like 'DAMAGED-%'
      ),0)::numeric batch_quantity,
      coalesce((
        select count(*)
        from public.product_batches b
        where b.branch_id=p_branch_id
          and b.product_id=a.product_id
          and b.quantity>0
          and upper(coalesce(b.batch_number,'')) like 'REMAINING-%'
      ),0)::integer legacy_rows,
      coalesce((
        select count(*)
        from public.product_batches b
        left join public.purchase_items pi on pi.id=b.purchase_item_id
        where b.branch_id=p_branch_id
          and b.product_id=a.product_id
          and b.quantity>0
          and upper(coalesce(b.batch_number,'')) not like 'DAMAGED-%'
          and coalesce(nullif(b.purchase_price,0),nullif(pi.price,0),nullif(p.purchase_price,0),0)<=0
      ),0)::integer zero_cost_rows,
      coalesce((
        select count(*)
        from public.product_batches b
        where b.branch_id=p_branch_id
          and b.product_id=a.product_id
          and b.quantity>0
          and upper(coalesce(b.batch_number,'')) not like 'DAMAGED-%'
          and exists(
            select 1 from public.product_batches x
            where x.id<>b.id
              and x.branch_id=b.branch_id
              and x.product_id=b.product_id
              and coalesce(x.batch_number,'')=coalesce(b.batch_number,'')
              and x.expiry_date=b.expiry_date
              and x.quantity>0
              and upper(coalesce(x.batch_number,'')) not like 'DAMAGED-%'
          )
      ),0)::integer duplicate_rows,
      (
        select c.id
        from private.inventory_audit_counts_v2 c
        where c.branch_id=p_branch_id
          and c.product_id=a.product_id
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
          and c.product_id=a.product_id
          and c.status='matched'
          and abs(coalesce(c.actual_count,0)-coalesce(i.quantity,0))<=0.001
      ) last_verified_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'batch_id',b.id,
          'batch_number',b.batch_number,
          'expiry_date',b.expiry_date,
          'quantity',round(b.quantity,3),
          'purchase_price',round(coalesce(nullif(b.purchase_price,0),nullif(pi.price,0),nullif(p.purchase_price,0),0),2),
          'supplier_id',coalesce(b.supplier_id,pu.supplier_id),
          'supplier_name',s.name,
          'shelf_location',coalesce(b.shelf_location,p.shelf_location),
          'purchase_item_id',b.purchase_item_id,
          'note',b.notes,
          'legacy_remaining',upper(coalesce(b.batch_number,'')) like 'REMAINING-%',
          'cost_missing',coalesce(nullif(b.purchase_price,0),nullif(pi.price,0),nullif(p.purchase_price,0),0)<=0
        ) order by b.expiry_date,b.created_at,b.id)
        from public.product_batches b
        left join public.purchase_items pi on pi.id=b.purchase_item_id
        left join public.purchases pu on pu.id=pi.purchase_id
        left join public.suppliers s on s.id=coalesce(b.supplier_id,pu.supplier_id)
        where b.branch_id=p_branch_id
          and b.product_id=a.product_id
          and b.quantity>0
          and upper(coalesce(b.batch_number,'')) not like 'DAMAGED-%'
      ),'[]'::jsonb) batches
    from affected a
    join public.products p on p.id=a.product_id
    left join public.inventory i on i.branch_id=v_inventory_branch and i.product_id=a.product_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',product_id,
    'product_name',product_name,
    'barcode',barcode,
    'inventory_quantity',round(inventory_quantity,3),
    'batch_quantity',round(batch_quantity,3),
    'quantity_gap',round(batch_quantity-inventory_quantity,3),
    'legacy_rows',legacy_rows,
    'zero_cost_rows',zero_cost_rows,
    'duplicate_rows',duplicate_rows,
    'verified_count_id',verified_count_id,
    'last_verified_at',last_verified_at,
    'ready_for_reconciliation',verified_count_id is not null,
    'batches',batches
  ) order by abs(batch_quantity-inventory_quantity) desc,product_name),'[]'::jsonb)
  into v_items
  from (
    select * from base
    order by abs(batch_quantity-inventory_quantity) desc,product_name
    limit v_limit
  ) q;

  return jsonb_build_object(
    'branch_id',p_branch_id,
    'inventory_branch_id',v_inventory_branch,
    'items',v_items
  );
end;
$function$;

create or replace function public.get_inventory_batch_reconciliation_suppliers_v1(
  p_branch_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_items jsonb;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not public.has_branch_access(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='BATCH_RECON_BRANCH_ACCESS_DENIED';
  end if;
  if not (
    private.staff_is_super_admin(v_uid)
    or (
      public.staff_has_permission('inventory.manage',p_branch_id)
      and public.staff_has_permission('purchases.manage',p_branch_id)
    )
  ) then
    raise exception using errcode='42501',message='BATCH_RECON_PERMISSION_DENIED';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,
    'name',s.name,
    'code',s.code
  ) order by s.name),'[]'::jsonb)
  into v_items
  from public.suppliers s
  where coalesce(s.active,true);

  return v_items;
end;
$function$;

create or replace function public.reconcile_product_batches_v1(
  p_request_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_lines jsonb,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_note text:=trim(coalesce(p_note,''));
  v_inventory_branch uuid;
  v_inventory_quantity numeric;
  v_verified_count_id uuid;
  v_sum numeric;
  v_fingerprint text;
  v_existing private.inventory_batch_reconciliations_v1%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_line jsonb;
  v_batch_id uuid;
  v_existing_batch public.product_batches%rowtype;
  v_number text;
  v_expiry date;
  v_qty numeric;
  v_cost numeric;
  v_supplier uuid;
  v_shelf text;
  v_line_note text;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_request_id is null or p_branch_id is null or p_product_id is null then
    raise exception using errcode='22023',message='BATCH_RECON_REQUIRED_FIELDS';
  end if;
  if not public.has_branch_access(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='BATCH_RECON_BRANCH_ACCESS_DENIED';
  end if;
  if not (
    private.staff_is_super_admin(v_uid)
    or (
      public.staff_has_permission('inventory.manage',p_branch_id)
      and public.staff_has_permission('purchases.manage',p_branch_id)
    )
  ) then
    raise exception using errcode='42501',message='BATCH_RECON_PERMISSION_DENIED';
  end if;
  if length(v_note)<5 or length(v_note)>500 then
    raise exception using errcode='22023',message='BATCH_RECON_NOTE_REQUIRED';
  end if;
  if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)>50 then
    raise exception using errcode='22023',message='BATCH_RECON_LINES_INVALID';
  end if;

  select coalesce(b.inventory_source_branch_id,b.id)
  into v_inventory_branch
  from public.branches b
  where b.id=p_branch_id and b.active;

  if v_inventory_branch is null then
    raise exception using errcode='22023',message='BRANCH_NOT_FOUND';
  end if;

  -- Serialize retries first, then every mutation touching the same physical
  -- Inventory source + product. This matches Expiry V2 lock ordering.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,84));
  perform pg_advisory_xact_lock(hashtextextended(v_inventory_branch::text||':'||p_product_id::text,91));

  v_fingerprint:=md5(jsonb_build_object(
    'branch_id',p_branch_id,'product_id',p_product_id,'lines',p_lines,'note',v_note
  )::text);

  select * into v_existing
  from private.inventory_batch_reconciliations_v1
  where request_id=p_request_id;

  if found then
    if v_existing.actor_id<>v_uid or v_existing.fingerprint<>v_fingerprint then
      raise exception using errcode='42501',message='REQUEST_CONFLICT';
    end if;
    return jsonb_build_object(
      'ok',true,'idempotent',true,'reconciliation_id',v_existing.id,
      'inventory_quantity',v_existing.inventory_quantity,'after_batches',v_existing.after_batches
    );
  end if;

  if not exists(
    select 1 from public.products p where p.id=p_product_id
  ) then
    raise exception using errcode='22023',message='PRODUCT_NOT_FOUND';
  end if;

  select coalesce(i.quantity,0)
  into v_inventory_quantity
  from public.inventory i
  where i.branch_id=v_inventory_branch and i.product_id=p_product_id
  for update;

  if not found then v_inventory_quantity:=0; end if;
  if v_inventory_quantity<0 then
    raise exception using errcode='22023',message='BATCH_RECON_INVENTORY_INVALID';
  end if;

  if v_inventory_quantity>0 and jsonb_array_length(p_lines)<1 then
    raise exception using errcode='22023',message='BATCH_RECON_LINES_REQUIRED';
  end if;

  select c.id
  into v_verified_count_id
  from private.inventory_audit_counts_v2 c
  where c.branch_id=p_branch_id
    and c.product_id=p_product_id
    and c.status='matched'
    and c.submitted_at>=now()-interval '4 hours'
    and abs(coalesce(c.actual_count,0)-v_inventory_quantity)<=0.001
  order by c.submitted_at desc
  limit 1;

  if v_verified_count_id is null then
    raise exception using errcode='22023',message='BATCH_RECON_RECENT_MATCHED_COUNT_REQUIRED';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_lines) with ordinality a(value,ord)
    join jsonb_array_elements(p_lines) with ordinality b(value,ord)
      on a.ord<b.ord
    where lower(trim(a.value->>'batch_number'))=lower(trim(b.value->>'batch_number'))
      and (a.value->>'expiry_date')=(b.value->>'expiry_date')
  ) then
    raise exception using errcode='22023',message='BATCH_RECON_DUPLICATE_CANONICAL_LINE';
  end if;

  if exists(
    select 1
    from jsonb_array_elements(p_lines) with ordinality a(value,ord)
    join jsonb_array_elements(p_lines) with ordinality b(value,ord)
      on a.ord<b.ord
    where nullif(a.value->>'batch_id','') is not null
      and (a.value->>'batch_id')=(b.value->>'batch_id')
  ) then
    raise exception using errcode='22023',message='BATCH_RECON_DUPLICATE_BATCH_ID';
  end if;

  select coalesce(sum((x->>'quantity')::numeric),0)
  into v_sum
  from jsonb_array_elements(p_lines) x
  where (x->>'quantity') is not null
    and (x->>'quantity') ~ '^[0-9]+([.][0-9]+)?$';

  if abs(v_sum-v_inventory_quantity)>0.001 then
    raise exception using errcode='22023',message='BATCH_RECON_TOTAL_MUST_MATCH_INVENTORY';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_number:=trim(coalesce(v_line->>'batch_number',''));
    if length(v_number)<1 or length(v_number)>120
       or upper(v_number) like 'DAMAGED-%'
       or upper(v_number) like 'REMAINING-%' then
      raise exception using errcode='22023',message='BATCH_RECON_BATCH_NUMBER_INVALID';
    end if;

    begin v_expiry:=(v_line->>'expiry_date')::date;
    exception when others then
      raise exception using errcode='22023',message='BATCH_RECON_EXPIRY_INVALID';
    end;

    begin v_qty:=(v_line->>'quantity')::numeric;
    exception when others then
      raise exception using errcode='22023',message='BATCH_RECON_QUANTITY_INVALID';
    end;
    if v_qty<=0 or round(v_qty,3)<>v_qty then
      raise exception using errcode='22023',message='BATCH_RECON_QUANTITY_INVALID';
    end if;

    begin v_cost:=(v_line->>'purchase_price')::numeric;
    exception when others then
      raise exception using errcode='22023',message='BATCH_RECON_COST_INVALID';
    end;
    if v_cost<=0 or round(v_cost,2)<>v_cost then
      raise exception using errcode='22023',message='BATCH_RECON_COST_INVALID';
    end if;

    begin
      v_supplier:=nullif(v_line->>'supplier_id','')::uuid;
    exception when others then
      raise exception using errcode='22023',message='BATCH_RECON_SUPPLIER_INVALID';
    end;

    if v_supplier is not null and not exists(select 1 from public.suppliers s where s.id=v_supplier) then
      raise exception using errcode='22023',message='BATCH_RECON_SUPPLIER_INVALID';
    end if;

    begin
      v_batch_id:=nullif(v_line->>'batch_id','')::uuid;
    exception when others then
      raise exception using errcode='22023',message='BATCH_RECON_BATCH_ID_INVALID';
    end;

    if v_batch_id is not null then
      select * into v_existing_batch
      from public.product_batches b
      where b.id=v_batch_id
      for update;

      if not found
         or v_existing_batch.branch_id is distinct from p_branch_id
         or v_existing_batch.product_id is distinct from p_product_id
         or upper(coalesce(v_existing_batch.batch_number,'')) like 'DAMAGED-%' then
        raise exception using errcode='22023',message='BATCH_RECON_BATCH_ID_INVALID';
      end if;
    end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.expiry_date,x.created_at,x.id),'[]'::jsonb)
  into v_before
  from (
    select b.id,b.batch_number,b.expiry_date,b.quantity,b.purchase_price,b.supplier_id,
           b.shelf_location,b.purchase_item_id,b.notes,b.created_at
    from public.product_batches b
    where b.branch_id=p_branch_id
      and b.product_id=p_product_id
      and b.quantity>0
      and upper(coalesce(b.batch_number,'')) not like 'DAMAGED-%'
  ) x;

  update public.product_batches
  set quantity=0,
      notes=concat_ws(E'\n',nullif(notes,''),'[Batch Reconciliation] superseded '||now()::text),
      updated_at=now()
  where branch_id=p_branch_id
    and product_id=p_product_id
    and quantity>0
    and upper(coalesce(batch_number,'')) not like 'DAMAGED-%';

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_number:=trim(v_line->>'batch_number');
    v_expiry:=(v_line->>'expiry_date')::date;
    v_qty:=(v_line->>'quantity')::numeric;
    v_cost:=(v_line->>'purchase_price')::numeric;
    v_supplier:=nullif(v_line->>'supplier_id','')::uuid;
    v_shelf:=nullif(trim(coalesce(v_line->>'shelf_location','')),'');
    v_line_note:=nullif(trim(coalesce(v_line->>'note','')),'');
    v_batch_id:=nullif(v_line->>'batch_id','')::uuid;

    if v_batch_id is not null then
      update public.product_batches
      set batch_number=v_number,
          expiry_date=v_expiry,
          quantity=v_qty,
          purchase_price=v_cost,
          supplier_id=v_supplier,
          shelf_location=v_shelf,
          notes=concat_ws(E'\n',v_line_note,'[Batch Reconciliation] verified '||now()::text),
          updated_at=now()
      where id=v_batch_id;
    else
      insert into public.product_batches(
        product_id,batch_number,expiry_date,quantity,shelf_location,purchase_date,
        supplier_id,notes,purchase_price,branch_id
      ) values(
        p_product_id,v_number,v_expiry,v_qty,v_shelf,null,
        v_supplier,concat_ws(E'\n',v_line_note,'[Batch Reconciliation] verified '||now()::text),
        v_cost,p_branch_id
      );
    end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.expiry_date,x.created_at,x.id),'[]'::jsonb)
  into v_after
  from (
    select b.id,b.batch_number,b.expiry_date,b.quantity,b.purchase_price,b.supplier_id,
           b.shelf_location,b.purchase_item_id,b.notes,b.created_at
    from public.product_batches b
    where b.branch_id=p_branch_id
      and b.product_id=p_product_id
      and b.quantity>0
      and upper(coalesce(b.batch_number,'')) not like 'DAMAGED-%'
  ) x;

  if abs(coalesce((
    select sum(b.quantity)
    from public.product_batches b
    where b.branch_id=p_branch_id
      and b.product_id=p_product_id
      and b.quantity>0
      and upper(coalesce(b.batch_number,'')) not like 'DAMAGED-%'
  ),0)-v_inventory_quantity)>0.001 then
    raise exception using errcode='22023',message='BATCH_RECON_POSTCHECK_FAILED';
  end if;

  insert into private.inventory_batch_reconciliations_v1(
    request_id,fingerprint,branch_id,inventory_branch_id,product_id,inventory_quantity,
    verified_count_id,before_batches,after_batches,note,actor_id
  ) values(
    p_request_id,v_fingerprint,p_branch_id,v_inventory_branch,p_product_id,v_inventory_quantity,
    v_verified_count_id,v_before,v_after,v_note,v_uid
  )
  returning * into v_existing;

  return jsonb_build_object(
    'ok',true,
    'idempotent',false,
    'reconciliation_id',v_existing.id,
    'product_id',p_product_id,
    'inventory_quantity',v_inventory_quantity,
    'verified_count_id',v_verified_count_id,
    'before_batches',v_before,
    'after_batches',v_after
  );
end;
$function$;

revoke all on function public.get_inventory_batch_reconciliation_workspace_v1(uuid,integer) from public,anon;
revoke all on function public.get_inventory_batch_reconciliation_suppliers_v1(uuid) from public,anon;
revoke all on function public.reconcile_product_batches_v1(uuid,uuid,uuid,jsonb,text) from public,anon;

grant execute on function public.get_inventory_batch_reconciliation_workspace_v1(uuid,integer) to authenticated,service_role;
grant execute on function public.get_inventory_batch_reconciliation_suppliers_v1(uuid) to authenticated,service_role;
grant execute on function public.reconcile_product_batches_v1(uuid,uuid,uuid,jsonb,text) to authenticated,service_role;
