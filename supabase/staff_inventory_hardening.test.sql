-- Staff Inventory Hardening integration tests.
-- PRECONDITION: run after applying:
--   20260921003500_staff_expiry_actions_v2.sql
--   20260921083000_staff_batch_reconciliation_v1.sql
-- Self-contained transaction: fixtures and action rows are always rolled back.
begin;

-- 0) Security surface: private audit tables are direct-access denied and RPC grants are explicit.
do $
declare
  fn text;
begin
  if not (
    select relrowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relname='expiry_inventory_actions_v2'
  ) then raise exception 'Expiry private audit table RLS is not enabled'; end if;

  if not (
    select relrowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relname='inventory_batch_reconciliations_v1'
  ) then raise exception 'Reconciliation private audit table RLS is not enabled'; end if;

  if not (
    select relrowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='supplier_returns_v2'
  ) then raise exception 'Supplier return table RLS is not enabled'; end if;

  if not (
    select relrowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='supplier_return_items_v2'
  ) then raise exception 'Supplier return item table RLS is not enabled'; end if;

  if has_table_privilege('authenticated','private.expiry_inventory_actions_v2','SELECT')
     or has_table_privilege('authenticated','private.inventory_batch_reconciliations_v1','SELECT')
     or has_table_privilege('authenticated','public.supplier_returns_v2','SELECT')
     or has_table_privilege('authenticated','public.supplier_return_items_v2','SELECT') then
    raise exception 'Authenticated role has direct read access to protected Staff inventory tables';
  end if;

  if has_table_privilege('anon','public.supplier_returns_v2','SELECT')
     or has_table_privilege('anon','public.supplier_return_items_v2','SELECT') then
    raise exception 'Anon role has direct read access to supplier return tables';
  end if;

  foreach fn in array array[
    'public.get_expiry_workspace_v2(uuid,integer,integer)',
    'public.process_expiry_batch_action_v2(uuid,uuid,uuid,numeric,text,text)',
    'public.get_supplier_returns_workspace_v2(uuid,text,integer)',
    'public.settle_supplier_return_v2(uuid,numeric,text,text)',
    'public.get_inventory_batch_reconciliation_workspace_v1(uuid,integer)',
    'public.get_inventory_batch_reconciliation_suppliers_v1(uuid)',
    'public.reconcile_product_batches_v1(uuid,uuid,uuid,jsonb,text)'
  ]
  loop
    if has_function_privilege('anon',fn,'EXECUTE') then
      raise exception 'Anon EXECUTE leaked on %',fn;
    end if;
    if not has_function_privilege('authenticated',fn,'EXECUTE') then
      raise exception 'Authenticated EXECUTE missing on %',fn;
    end if;
  end loop;
end $;

create temporary table staff_inventory_fixture as
select
  gen_random_uuid() admin_id,
  gen_random_uuid() outsider_id,
  gen_random_uuid() recon_product,
  gen_random_uuid() zero_product,
  gen_random_uuid() expiry_product,
  gen_random_uuid() supplier_id,
  gen_random_uuid() audit_session_id,
  gen_random_uuid() recon_request_id,
  gen_random_uuid() zero_request_id,
  gen_random_uuid() expiry_request_id,
  gen_random_uuid() conflict_request_id,
  (
    select b.id
    from public.branches b
    where coalesce(b.active,true)
      and coalesce(b.inventory_source_branch_id,b.id)=b.id
    order by b.created_at nulls last,b.id
    limit 1
  ) branch_id;

do $$
begin
  if (select branch_id from staff_inventory_fixture) is null then
    raise exception 'No active self-sourced branch available for staff inventory fixture';
  end if;
  if not exists(
    select 1 from public.staff_roles
    where code='super_admin' and scope='system' and active
  ) then
    raise exception 'No active super_admin system role available for staff inventory fixture';
  end if;
end $$;

insert into auth.users(id,raw_user_meta_data)
select admin_id,'{"name":"Staff Inventory Hardening Admin"}'::jsonb
from staff_inventory_fixture;

insert into auth.users(id,raw_user_meta_data)
select outsider_id,'{"name":"Staff Inventory Hardening Outsider"}'::jsonb
from staff_inventory_fixture;

insert into public.users(id,name,username,password,role,system_role_id)
select
  f.admin_id,
  'Staff Inventory Hardening Admin',
  'staff-inventory-test-'||f.admin_id::text,
  'unused-test-only',
  'admin',
  (
    select r.id
    from public.staff_roles r
    where r.code='super_admin' and r.scope='system' and r.active
    order by r.created_at
    limit 1
  )
from staff_inventory_fixture f;

insert into public.suppliers(id,name,code,active)
select supplier_id,'Staff Inventory Test Supplier','STAFF-INV-TEST',true
from staff_inventory_fixture;

insert into public.products(id,name,barcode,price,purchase_price,quantity,track_expiry)
select recon_product,'Staff Reconciliation Product','STAFF-RECON-'||substr(recon_product::text,1,8),10,4,0,true
from staff_inventory_fixture
union all
select zero_product,'Staff Zero Inventory Product','STAFF-ZERO-'||substr(zero_product::text,1,8),12,5,0,true
from staff_inventory_fixture
union all
select expiry_product,'Staff Expiry Product','STAFF-EXP-'||substr(expiry_product::text,1,8),15,6,0,true
from staff_inventory_fixture;

do $$
declare
  f record;
begin
  select * into f from staff_inventory_fixture;
  if not exists(select 1 from public.inventory where branch_id=f.branch_id and product_id=f.recon_product)
     or not exists(select 1 from public.inventory where branch_id=f.branch_id and product_id=f.zero_product)
     or not exists(select 1 from public.inventory where branch_id=f.branch_id and product_id=f.expiry_product) then
    raise exception 'Product inventory bootstrap did not create fixture rows';
  end if;

  update public.inventory set quantity=10 where branch_id=f.branch_id and product_id=f.recon_product;
  update public.inventory set quantity=0 where branch_id=f.branch_id and product_id=f.zero_product;
  update public.inventory set quantity=5 where branch_id=f.branch_id and product_id=f.expiry_product;
end $$;

-- Reconciliation product deliberately has duplicate/overstated batches: 15 batch units vs 10 Inventory.
insert into public.product_batches(
  product_id,batch_number,expiry_date,quantity,purchase_price,supplier_id,branch_id,notes
)
select recon_product,'RECON-DUP',current_date+20,7,4,supplier_id,branch_id,'fixture original note A'
from staff_inventory_fixture
union all
select recon_product,'RECON-DUP',current_date+20,8,4,supplier_id,branch_id,'fixture original note B'
from staff_inventory_fixture;

-- Zero-stock product deliberately has stale legacy batch stock.
insert into public.product_batches(
  product_id,batch_number,expiry_date,quantity,purchase_price,supplier_id,branch_id,notes
)
select zero_product,'REMAINING-STAFF-TEST',current_date+10,4,5,supplier_id,branch_id,'fixture stale zero-stock batch'
from staff_inventory_fixture;

-- Expiry product begins fully aligned: 5 batch units vs 5 Inventory.
insert into public.product_batches(
  product_id,batch_number,expiry_date,quantity,purchase_price,supplier_id,branch_id,notes
)
select expiry_product,'EXP-VALID-01',current_date-1,5,6,supplier_id,branch_id,'fixture expiry batch'
from staff_inventory_fixture;

insert into private.inventory_audit_sessions_v2(
  id,branch_id,inventory_branch_id,audit_date,audit_kind,status,items_per_employee,generated_by,title
)
select audit_session_id,branch_id,branch_id,current_date,'spot','active',3,admin_id,'Staff inventory hardening fixture'
from staff_inventory_fixture;

insert into private.inventory_audit_counts_v2(
  session_id,branch_id,inventory_branch_id,audit_date,product_id,assigned_to,
  expected_at_assignment,purchase_price_snapshot,submitted_at,actual_count,
  expected_at_submission,movement_delta,variance,variance_value,status,note
)
select audit_session_id,branch_id,branch_id,current_date,recon_product,admin_id,
       10,4,now(),10,10,0,0,0,'matched','fixture matched reconciliation count'
from staff_inventory_fixture
union all
select audit_session_id,branch_id,branch_id,current_date,zero_product,admin_id,
       0,5,now(),0,0,0,0,0,'matched','fixture matched zero count'
from staff_inventory_fixture
union all
select audit_session_id,branch_id,branch_id,current_date,expiry_product,admin_id,
       5,6,now(),5,5,0,0,0,'matched','fixture matched expiry count'
from staff_inventory_fixture;

-- 1) Unauthorized authenticated user cannot see reconciliation workspace or supplier options.
select set_config('request.jwt.claim.sub',(select outsider_id::text from staff_inventory_fixture),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

do $$
declare
  f record;
begin
  select * into f from staff_inventory_fixture;

  begin
    perform public.get_inventory_batch_reconciliation_workspace_v1(f.branch_id,100);
    raise exception 'Unauthorized user opened reconciliation workspace';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.get_inventory_batch_reconciliation_suppliers_v1(f.branch_id);
    raise exception 'Unauthorized user listed reconciliation suppliers';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- Super Admin fixture.
select set_config('request.jwt.claim.sub',(select admin_id::text from staff_inventory_fixture),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

-- 2) Workspace flags duplicate/mismatch rows and zero-stock legacy row as reconcilable after fresh matched counts.
do $$
declare
  f record;
  w jsonb;
  suppliers jsonb;
  recon_item jsonb;
  zero_item jsonb;
begin
  select * into f from staff_inventory_fixture;

  w:=public.get_inventory_batch_reconciliation_workspace_v1(f.branch_id,100);
  recon_item:=(
    select value from jsonb_array_elements(w->'items')
    where value->>'product_id'=f.recon_product::text
    limit 1
  );
  zero_item:=(
    select value from jsonb_array_elements(w->'items')
    where value->>'product_id'=f.zero_product::text
    limit 1
  );

  if recon_item is null then raise exception 'Reconciliation product missing from workspace'; end if;
  if (recon_item->>'inventory_quantity')::numeric<>10 then raise exception 'Reconciliation inventory quantity wrong'; end if;
  if (recon_item->>'batch_quantity')::numeric<>15 then raise exception 'Reconciliation batch quantity wrong'; end if;
  if (recon_item->>'quantity_gap')::numeric<>5 then raise exception 'Reconciliation gap wrong'; end if;
  if coalesce((recon_item->>'duplicate_rows')::integer,0)<2 then raise exception 'Duplicate batches not detected'; end if;
  if coalesce((recon_item->>'ready_for_reconciliation')::boolean,false) is not true then raise exception 'Fresh matched recon count not accepted'; end if;

  if zero_item is null then raise exception 'Zero-stock legacy product missing from workspace'; end if;
  if (zero_item->>'inventory_quantity')::numeric<>0 then raise exception 'Zero-stock inventory quantity wrong'; end if;
  if coalesce((zero_item->>'ready_for_reconciliation')::boolean,false) is not true then raise exception 'Fresh matched zero count not accepted'; end if;

  suppliers:=public.get_inventory_batch_reconciliation_suppliers_v1(f.branch_id);
  if not exists(
    select 1 from jsonb_array_elements(suppliers) s
    where s->>'id'=f.supplier_id::text
      and s ? 'name'
      and s ? 'code'
      and not (s ? 'phone')
      and not (s ? 'email')
      and not (s ? 'balance')
  ) then
    raise exception 'Supplier option missing or leaks forbidden fields';
  end if;
end $$;

-- 3) Successful reconciliation preserves Inventory, produces exactly one audit row, and retry is idempotent.
do $$
declare
  f record;
  before_inventory numeric;
  first_result jsonb;
  retry_result jsonb;
  canonical jsonb;
begin
  select * into f from staff_inventory_fixture;
  select quantity into before_inventory
  from public.inventory
  where branch_id=f.branch_id and product_id=f.recon_product;

  canonical:=jsonb_build_array(
    jsonb_build_object(
      'batch_id',null,
      'batch_number','RECON-CANONICAL-01',
      'expiry_date',(current_date+20)::text,
      'quantity',10,
      'purchase_price',4,
      'supplier_id',f.supplier_id,
      'shelf_location','TEST-A1',
      'note','verified fixture canonical batch'
    )
  );

  first_result:=public.reconcile_product_batches_v1(
    f.recon_request_id,f.branch_id,f.recon_product,canonical,'Verified physical stock and rebuilt canonical batches'
  );
  retry_result:=public.reconcile_product_batches_v1(
    f.recon_request_id,f.branch_id,f.recon_product,canonical,'Verified physical stock and rebuilt canonical batches'
  );

  if coalesce((first_result->>'idempotent')::boolean,true) then
    raise exception 'First reconciliation incorrectly marked idempotent';
  end if;
  if coalesce((retry_result->>'idempotent')::boolean,false) is not true then
    raise exception 'Reconciliation retry was not idempotent';
  end if;

  if (select quantity from public.inventory where branch_id=f.branch_id and product_id=f.recon_product)<>before_inventory then
    raise exception 'Reconciliation changed Inventory';
  end if;

  if (select coalesce(sum(quantity),0) from public.product_batches
      where branch_id=f.branch_id and product_id=f.recon_product
        and quantity>0 and upper(coalesce(batch_number,'')) not like 'DAMAGED-%')<>10 then
    raise exception 'Canonical batch total does not equal Inventory';
  end if;

  if (select count(*) from public.product_batches
      where branch_id=f.branch_id and product_id=f.recon_product
        and quantity>0 and batch_number='RECON-CANONICAL-01')<>1 then
    raise exception 'Canonical batch not created exactly once';
  end if;

  if (select purchase_date from public.product_batches
      where branch_id=f.branch_id and product_id=f.recon_product
        and quantity>0 and batch_number='RECON-CANONICAL-01' limit 1) is not null then
    raise exception 'Reconciliation fabricated purchase_date';
  end if;

  if (select count(*) from private.inventory_batch_reconciliations_v1
      where request_id=f.recon_request_id)<>1 then
    raise exception 'Reconciliation audit row duplicated';
  end if;
end $$;

-- 4) Same request id with changed payload must conflict and leave state unchanged.
do $$
declare
  f record;
  before_total numeric;
begin
  select * into f from staff_inventory_fixture;
  select coalesce(sum(quantity),0) into before_total
  from public.product_batches
  where branch_id=f.branch_id and product_id=f.recon_product and quantity>0;

  begin
    perform public.reconcile_product_batches_v1(
      f.recon_request_id,
      f.branch_id,
      f.recon_product,
      jsonb_build_array(jsonb_build_object(
        'batch_id',null,'batch_number','RECON-CHANGED',
        'expiry_date',(current_date+20)::text,'quantity',10,'purchase_price',4,
        'supplier_id',f.supplier_id,'shelf_location','TEST-A2'
      )),
      'Changed payload must conflict'
    );
    raise exception 'Changed payload reused request id';
  exception when insufficient_privilege then null;
  end;

  if (select coalesce(sum(quantity),0) from public.product_batches
      where branch_id=f.branch_id and product_id=f.recon_product and quantity>0)<>before_total then
    raise exception 'Request conflict changed batch state';
  end if;
end $$;

-- 5) Invalid totals and duplicate canonical lines roll back fully.
do $$
declare
  f record;
  before_snapshot jsonb;
begin
  select * into f from staff_inventory_fixture;

  select jsonb_agg(jsonb_build_object('id',id,'quantity',quantity,'batch_number',batch_number) order by id)
  into before_snapshot
  from public.product_batches
  where branch_id=f.branch_id and product_id=f.recon_product;

  begin
    perform public.reconcile_product_batches_v1(
      gen_random_uuid(),f.branch_id,f.recon_product,
      jsonb_build_array(jsonb_build_object(
        'batch_id',null,'batch_number','BAD-TOTAL',
        'expiry_date',(current_date+20)::text,'quantity',9,'purchase_price',4,
        'supplier_id',f.supplier_id
      )),
      'This invalid total must roll back'
    );
    raise exception 'Invalid total was accepted';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.reconcile_product_batches_v1(
      gen_random_uuid(),f.branch_id,f.recon_product,
      jsonb_build_array(
        jsonb_build_object('batch_id',null,'batch_number','DUP-CANON','expiry_date',(current_date+20)::text,'quantity',5,'purchase_price',4,'supplier_id',f.supplier_id),
        jsonb_build_object('batch_id',null,'batch_number','DUP-CANON','expiry_date',(current_date+20)::text,'quantity',5,'purchase_price',4,'supplier_id',f.supplier_id)
      ),
      'Duplicate canonical lines must roll back'
    );
    raise exception 'Duplicate canonical lines were accepted';
  exception when invalid_parameter_value then null;
  end;

  if (
    select jsonb_agg(jsonb_build_object('id',id,'quantity',quantity,'batch_number',batch_number) order by id)
    from public.product_batches
    where branch_id=f.branch_id and product_id=f.recon_product
  ) is distinct from before_snapshot then
    raise exception 'Invalid reconciliation changed batch state';
  end if;
end $$;

-- 6) Inventory=0 may reconcile stale active batches to an empty canonical set.
do $$
declare
  f record;
  result jsonb;
begin
  select * into f from staff_inventory_fixture;
  result:=public.reconcile_product_batches_v1(
    f.zero_request_id,f.branch_id,f.zero_product,'[]'::jsonb,
    'Verified zero physical stock; clear stale active batch rows'
  );

  if (select quantity from public.inventory where branch_id=f.branch_id and product_id=f.zero_product)<>0 then
    raise exception 'Zero-stock reconciliation changed Inventory';
  end if;

  if (select coalesce(sum(quantity),0) from public.product_batches
      where branch_id=f.branch_id and product_id=f.zero_product
        and quantity>0 and upper(coalesce(batch_number,'')) not like 'DAMAGED-%')<>0 then
    raise exception 'Zero-stock reconciliation left active batches';
  end if;
end $$;

-- 7) Expiry workspace is action-ready only when audit is fresh AND batch ledger equals Inventory.
do $$
declare
  f record;
  w jsonb;
  item jsonb;
begin
  select * into f from staff_inventory_fixture;

  w:=public.get_expiry_workspace_v2(f.branch_id,30,250);
  item:=(
    select value from jsonb_array_elements(w->'items')
    where value->>'product_id'=f.expiry_product::text
    limit 1
  );

  if item is null then raise exception 'Expiry fixture missing from workspace'; end if;
  if coalesce((item->>'audit_verified')::boolean,false) is not true then raise exception 'Fresh expiry count not recognized'; end if;
  if coalesce((item->>'batch_inventory_aligned')::boolean,false) is not true then raise exception 'Aligned expiry batch ledger not recognized'; end if;
  if coalesce((item->>'action_ready')::boolean,false) is not true then raise exception 'Valid expiry item not action-ready'; end if;
end $$;

-- 8) A stale count after Inventory changes must block expiry, and batch/financial state must roll back.
do $$
declare
  f record;
  batch_id uuid;
  before_batch numeric;
  before_returns bigint;
  before_expenses bigint;
begin
  select * into f from staff_inventory_fixture;
  select id,quantity into batch_id,before_batch
  from public.product_batches
  where branch_id=f.branch_id and product_id=f.expiry_product and batch_number='EXP-VALID-01'
  limit 1;

  select count(*) into before_returns from public.supplier_returns_v2 where branch_id=f.branch_id;
  select count(*) into before_expenses from public.expenses where branch_id=f.branch_id;

  update public.inventory
  set quantity=4
  where branch_id=f.branch_id and product_id=f.expiry_product;

  begin
    perform public.process_expiry_batch_action_v2(
      f.expiry_request_id,f.branch_id,batch_id,1,'dispose','Stale count must reject'
    );
    raise exception 'Stale expiry count was accepted';
  exception when invalid_parameter_value then null;
  end;

  if (select quantity from public.product_batches where id=batch_id)<>before_batch then
    raise exception 'Rejected stale expiry changed batch quantity';
  end if;
  if (select count(*) from public.supplier_returns_v2 where branch_id=f.branch_id)<>before_returns then
    raise exception 'Rejected stale expiry created supplier return';
  end if;
  if (select count(*) from public.expenses where branch_id=f.branch_id)<>before_expenses then
    raise exception 'Rejected stale expiry created expense';
  end if;
end $$;

-- 9) Even with a refreshed count, mismatched active batch total vs Inventory must route to reconciliation.
do $$
declare
  f record;
  batch_id uuid;
  w jsonb;
  item jsonb;
begin
  select * into f from staff_inventory_fixture;

  update private.inventory_audit_counts_v2
  set actual_count=4,expected_at_submission=4,submitted_at=now(),status='matched'
  where session_id=f.audit_session_id and product_id=f.expiry_product;

  w:=public.get_expiry_workspace_v2(f.branch_id,30,250);
  item:=(
    select value from jsonb_array_elements(w->'items')
    where value->>'product_id'=f.expiry_product::text
    limit 1
  );

  if coalesce((item->>'audit_verified')::boolean,false) is not true then
    raise exception 'Refreshed expiry count not recognized';
  end if;
  if coalesce((item->>'batch_inventory_aligned')::boolean,true) is not false then
    raise exception 'Expiry workspace failed to flag batch/inventory mismatch';
  end if;
  if coalesce((item->>'action_ready')::boolean,true) is not false then
    raise exception 'Mismatched expiry item remained action-ready';
  end if;

  select id into batch_id
  from public.product_batches
  where branch_id=f.branch_id and product_id=f.expiry_product and batch_number='EXP-VALID-01'
  limit 1;

  begin
    perform public.process_expiry_batch_action_v2(
      gen_random_uuid(),f.branch_id,batch_id,1,'dispose','Batch mismatch must reconcile first'
    );
    raise exception 'Batch/inventory mismatch expiry was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- 10) After restoring Inventory alignment and a fresh matched count, expiry disposal succeeds once and is idempotent.
do $$
declare
  f record;
  batch_id uuid;
  first_result jsonb;
  retry_result jsonb;
  expense_id uuid;
begin
  select * into f from staff_inventory_fixture;

  update public.inventory
  set quantity=5
  where branch_id=f.branch_id and product_id=f.expiry_product;

  update private.inventory_audit_counts_v2
  set actual_count=5,expected_at_submission=5,submitted_at=now(),status='matched'
  where session_id=f.audit_session_id and product_id=f.expiry_product;

  select id into batch_id
  from public.product_batches
  where branch_id=f.branch_id and product_id=f.expiry_product and batch_number='EXP-VALID-01'
  limit 1;

  first_result:=public.process_expiry_batch_action_v2(
    f.expiry_request_id,f.branch_id,batch_id,1,'dispose','Verified expired fixture disposal'
  );
  retry_result:=public.process_expiry_batch_action_v2(
    f.expiry_request_id,f.branch_id,batch_id,1,'dispose','Verified expired fixture disposal'
  );

  if coalesce((first_result->>'idempotent')::boolean,true) then
    raise exception 'First expiry disposal incorrectly marked idempotent';
  end if;
  if coalesce((retry_result->>'idempotent')::boolean,false) is not true then
    raise exception 'Expiry retry was not idempotent';
  end if;

  if (select quantity from public.inventory where branch_id=f.branch_id and product_id=f.expiry_product)<>4 then
    raise exception 'Expiry disposal inventory quantity wrong';
  end if;
  if (select quantity from public.product_batches where id=batch_id)<>4 then
    raise exception 'Expiry disposal batch quantity wrong';
  end if;

  expense_id:=nullif(first_result->>'expense_id','')::uuid;
  if expense_id is null then raise exception 'Expiry disposal did not create noncash expense'; end if;
  if (select payment_method from public.expenses where id=expense_id)<>'noncash' then
    raise exception 'Expiry disposal expense was not noncash';
  end if;
  if (select count(*) from private.expiry_inventory_actions_v2 where request_id=f.expiry_request_id)<>1 then
    raise exception 'Expiry action audit row duplicated';
  end if;
end $$;

reset role;
set constraints all immediate;

select 'PASS: Staff inventory RLS/grants, authorization, reconciliation, idempotency, rollback, zero-stock cleanup, expiry freshness, batch-ledger alignment, and atomic disposal' as result;

rollback;
