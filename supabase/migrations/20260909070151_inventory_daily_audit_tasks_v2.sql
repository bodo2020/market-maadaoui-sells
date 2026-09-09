-- Inventory Daily Audit V2: movement ledger + blind count + peer recount on the shared Task Engine.

insert into public.staff_permissions(code,name_ar,module,description)
values
  ('inventory.count','تنفيذ جرد','inventory','تنفيذ مهام العد والجرد الأعمى'),
  ('inventory.recount','إعادة عد الجرد','inventory','تنفيذ إعادة عد مستقلة لفروق الجرد'),
  ('inventory.approve_adjustment','اعتماد تسوية مخزون','inventory','اعتماد تسويات المخزون بعد التحقق'),
  ('inventory.manage_sessions','إدارة جلسات الجرد','inventory','إنشاء وإدارة جلسات الجرد والتوزيع'),
  ('inventory.reports','تقارير الجرد','inventory','عرض تقارير ودقة الجرد')
on conflict (code) do update set
  name_ar=excluded.name_ar,module=excluded.module,description=excluded.description;

insert into public.staff_role_permissions(role_id,permission_id)
select distinct rp.role_id,np.id
from public.staff_role_permissions rp
join public.staff_permissions op on op.id=rp.permission_id and op.code='inventory.view'
cross join public.staff_permissions np
where np.code in ('inventory.count','inventory.recount')
on conflict do nothing;

insert into public.staff_role_permissions(role_id,permission_id)
select distinct rp.role_id,np.id
from public.staff_role_permissions rp
join public.staff_permissions op on op.id=rp.permission_id and op.code='inventory.manage'
cross join public.staff_permissions np
where np.code in ('inventory.approve_adjustment','inventory.manage_sessions','inventory.reports')
on conflict do nothing;

create table if not exists private.inventory_movements_v2(
  id uuid primary key default gen_random_uuid(),
  inventory_branch_id uuid not null references public.branches(id),
  product_id uuid not null references public.products(id),
  quantity_before numeric not null,
  quantity_after numeric not null,
  quantity_delta numeric not null,
  actor_id uuid null,
  changed_at timestamptz not null default clock_timestamp(),
  txid bigint not null default txid_current(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists inventory_movements_v2_product_time_idx
  on private.inventory_movements_v2(inventory_branch_id,product_id,changed_at,id);

create table if not exists private.inventory_audit_sessions_v2(
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  inventory_branch_id uuid not null references public.branches(id),
  audit_date date not null,
  audit_kind text not null default 'daily' check(audit_kind in ('daily','full','spot')),
  status text not null default 'active' check(status in ('active','completed','cancelled')),
  items_per_employee integer not null default 5 check(items_per_employee between 1 and 50),
  total_tasks integer not null default 0,
  completed_tasks integer not null default 0,
  matched_tasks integer not null default 0,
  discrepancy_tasks integer not null default 0,
  generated_by uuid null,
  generated_at timestamptz not null default now(),
  completed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb
);
create unique index if not exists inventory_audit_sessions_v2_daily_unique
  on private.inventory_audit_sessions_v2(branch_id,audit_date)
  where audit_kind='daily';
create index if not exists inventory_audit_sessions_v2_branch_date_idx
  on private.inventory_audit_sessions_v2(branch_id,audit_date desc);

create table if not exists private.inventory_audit_counts_v2(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references private.inventory_audit_sessions_v2(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  inventory_branch_id uuid not null references public.branches(id),
  audit_date date not null,
  product_id uuid not null references public.products(id),
  assigned_to uuid not null references public.users(id),
  task_id uuid null unique references public.operations_tasks(id),
  expected_at_assignment numeric not null,
  purchase_price_snapshot numeric not null default 0,
  risk_score numeric not null default 0,
  assigned_at timestamptz not null default now(),
  submitted_at timestamptz null,
  actual_count numeric null,
  expected_at_submission numeric null,
  movement_delta numeric null,
  variance numeric null,
  variance_value numeric null,
  status text not null default 'assigned' check(status in ('assigned','counting','matched','discrepancy','resolved_no_adjustment','review_required')),
  note text null,
  metadata jsonb not null default '{}'::jsonb,
  unique(branch_id,audit_date,product_id)
);
create index if not exists inventory_audit_counts_v2_assignee_idx
  on private.inventory_audit_counts_v2(branch_id,assigned_to,audit_date desc,status);
create index if not exists inventory_audit_counts_v2_product_idx
  on private.inventory_audit_counts_v2(inventory_branch_id,product_id,audit_date desc);

create table if not exists private.inventory_audit_recounts_v2(
  id uuid primary key default gen_random_uuid(),
  original_count_id uuid not null unique references private.inventory_audit_counts_v2(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  inventory_branch_id uuid not null references public.branches(id),
  product_id uuid not null references public.products(id),
  assigned_to uuid null references public.users(id),
  task_id uuid null unique references public.operations_tasks(id),
  expected_at_assignment numeric not null,
  purchase_price_snapshot numeric not null default 0,
  assigned_at timestamptz not null default now(),
  submitted_at timestamptz null,
  actual_count numeric null,
  expected_at_submission numeric null,
  movement_delta numeric null,
  variance numeric null,
  variance_value numeric null,
  status text not null default 'assigned' check(status in ('assigned','counting','matched_system','confirmed_variance','conflicting')),
  note text null,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists inventory_audit_recounts_v2_assignee_idx
  on private.inventory_audit_recounts_v2(branch_id,assigned_to,status,assigned_at desc);

create or replace function private.capture_inventory_movement_v2()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.quantity is distinct from old.quantity then
    insert into private.inventory_movements_v2(
      inventory_branch_id,product_id,quantity_before,quantity_after,quantity_delta,actor_id,changed_at,metadata
    ) values(
      new.branch_id,new.product_id,old.quantity,new.quantity,new.quantity-old.quantity,auth.uid(),clock_timestamp(),
      jsonb_build_object('inventory_row_id',new.id,'source','inventory_quantity_update')
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists inventory_capture_movement_v2 on public.inventory;
create trigger inventory_capture_movement_v2
after update of quantity on public.inventory
for each row execute function private.capture_inventory_movement_v2();

create or replace function private.refresh_inventory_audit_session_v2(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_total int;
  v_done int;
  v_match int;
  v_diff int;
begin
  select count(*)::int,
         count(*) filter(where status in ('matched','discrepancy','resolved_no_adjustment','review_required'))::int,
         count(*) filter(where status in ('matched','resolved_no_adjustment'))::int,
         count(*) filter(where status in ('discrepancy','review_required'))::int
    into v_total,v_done,v_match,v_diff
  from private.inventory_audit_counts_v2
  where session_id=p_session_id;

  update private.inventory_audit_sessions_v2
     set total_tasks=coalesce(v_total,0),completed_tasks=coalesce(v_done,0),matched_tasks=coalesce(v_match,0),
         discrepancy_tasks=coalesce(v_diff,0),
         status=case when coalesce(v_total,0)>0 and coalesce(v_done,0)>=coalesce(v_total,0) then 'completed' else 'active' end,
         completed_at=case when coalesce(v_total,0)>0 and coalesce(v_done,0)>=coalesce(v_total,0) then coalesce(completed_at,now()) else null end
   where id=p_session_id;
end;
$function$;

create or replace function private.operations_task_can_claim(p_source_kind text,p_branch_id uuid)
returns boolean
language sql
stable security definer
set search_path=''
as $function$
  select case
    when p_source_kind='pos_refund' then
      public.staff_has_permission('sales.refund',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)
    when p_source_kind='online_refund' then
      public.staff_has_permission('online_money.settle_digital',p_branch_id)
    when p_source_kind='shift_reconciliation' then
      public.staff_has_permission('pos.manage_shifts',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)
    when p_source_kind='cash_handoff' then
      public.staff_has_permission('finance.manage',p_branch_id) or public.staff_has_permission('pos.manage_shifts',p_branch_id)
    when p_source_kind='inventory_count' then
      public.staff_has_permission('inventory.count',p_branch_id)
    when p_source_kind='inventory_recount' then
      public.staff_has_permission('inventory.recount',p_branch_id)
    when p_source_kind='inventory_adjustment' then
      public.staff_has_permission('inventory.approve_adjustment',p_branch_id)
    else false
  end;
$function$;

create or replace function public.ensure_daily_inventory_audit_tasks_v2(
  p_branch_id uuid,
  p_items_per_employee integer default 5,
  p_audit_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_date date:=coalesce(p_audit_date,timezone('Africa/Cairo',now())::date);
  v_items integer:=least(greatest(coalesce(p_items_per_employee,5),1),20);
  v_inventory_branch uuid;
  v_pricing_branch uuid;
  v_session private.inventory_audit_sessions_v2%rowtype;
  v_staff_count integer:=0;
  v_existing integer:=0;
  v_rec record;
  v_count_id uuid;
  v_task_id uuid;
  v_due timestamptz;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then
    raise exception using errcode='42501',message='INVENTORY_BRANCH_ACCESS_DENIED';
  end if;
  if not (public.staff_has_permission('inventory.count',p_branch_id) or public.staff_has_permission('inventory.manage_sessions',p_branch_id)) then
    raise exception using errcode='42501',message='INVENTORY_DAILY_AUDIT_DENIED';
  end if;
  if v_date < timezone('Africa/Cairo',now())::date-7 or v_date > timezone('Africa/Cairo',now())::date+1 then
    raise exception using errcode='22023',message='INVALID_AUDIT_DATE';
  end if;

  select coalesce(b.inventory_source_branch_id,b.id),coalesce(b.pricing_source_branch_id,b.id)
    into v_inventory_branch,v_pricing_branch
  from public.branches b where b.id=p_branch_id and b.active;
  if v_inventory_branch is null then raise exception using errcode='22023',message='BRANCH_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_branch_id::text||':'||v_date::text,914));

  select count(distinct ubr.user_id)::int into v_staff_count
  from public.user_branch_roles ubr
  join public.users u on u.id=ubr.user_id and coalesce(u.active,true)
  join public.staff_role_permissions rp on rp.role_id=ubr.role_id
  join public.staff_permissions sp on sp.id=rp.permission_id and sp.code='inventory.count'
  where ubr.branch_id=p_branch_id and ubr.active;

  if v_staff_count=0 then
    return jsonb_build_object('generated',0,'existing',0,'eligible_staff',0,'audit_date',v_date,'reason','NO_ELIGIBLE_STAFF');
  end if;

  insert into private.inventory_audit_sessions_v2(branch_id,inventory_branch_id,audit_date,audit_kind,items_per_employee,generated_by,metadata)
  values(p_branch_id,v_inventory_branch,v_date,'daily',v_items,auth.uid(),jsonb_build_object('generator_version',2,'strategy','weighted_deterministic_random'))
  on conflict (branch_id,audit_date) where audit_kind='daily' do nothing;

  select * into v_session from private.inventory_audit_sessions_v2
  where branch_id=p_branch_id and audit_date=v_date and audit_kind='daily'
  for update;

  select count(*)::int into v_existing from private.inventory_audit_counts_v2 where session_id=v_session.id;
  if v_existing>0 then
    perform private.refresh_inventory_audit_session_v2(v_session.id);
    return jsonb_build_object('session_id',v_session.id,'generated',0,'existing',v_existing,'eligible_staff',v_staff_count,'audit_date',v_date,'idempotent',true);
  end if;

  v_due:=greatest((v_date::timestamp+time '20:00') at time zone 'Africa/Cairo',now()+interval '2 hours');

  for v_rec in
    with eligible_staff as (
      select distinct ubr.user_id,
        row_number() over(order by hashtextextended(ubr.user_id::text||':'||v_date::text,37)) staff_rn
      from public.user_branch_roles ubr
      join public.users u on u.id=ubr.user_id and coalesce(u.active,true)
      join public.staff_role_permissions rp on rp.role_id=ubr.role_id
      join public.staff_permissions sp on sp.id=rp.permission_id and sp.code='inventory.count'
      where ubr.branch_id=p_branch_id and ubr.active
    ), history as (
      select c.product_id,max(c.audit_date) last_count_date,
             count(*) filter(where c.status in ('discrepancy','review_required'))::numeric recent_discrepancies
      from private.inventory_audit_counts_v2 c
      where c.inventory_branch_id=v_inventory_branch and c.audit_date>=v_date-30
      group by c.product_id
    ), candidates as (
      select inv.product_id,inv.quantity,p.name,p.barcode,p.shelf_location,p.unit_of_measure,
             coalesce(bp.purchase_price,p.purchase_price,0)::numeric purchase_price,
             h.last_count_date,coalesce(h.recent_discrepancies,0) recent_discrepancies,
             (
               coalesce(h.recent_discrepancies,0)*50
               + case when inv.min_stock_level is not null and inv.min_stock_level>0 and inv.quantity<=inv.min_stock_level then 20 else 0 end
               + least(ln(1+greatest(inv.quantity,0)*greatest(coalesce(bp.purchase_price,p.purchase_price,0),0))*2,25)
               + least(greatest(v_date-coalesce(h.last_count_date,v_date-30),0),30)
               + ((hashtextextended(inv.product_id::text||':'||v_date::text,51)::numeric+9223372036854775808::numeric)/18446744073709551616::numeric)*100
               + case when h.last_count_date is not null and h.last_count_date>=v_date-3 then -1000 else 0 end
             )::numeric risk_score
      from public.inventory inv
      join public.products p on p.id=inv.product_id
      left join public.branch_product_pricing bp on bp.branch_id=v_pricing_branch and bp.product_id=inv.product_id
      left join history h on h.product_id=inv.product_id
      where inv.branch_id=v_inventory_branch
    ), ranked as (
      select c.*,row_number() over(order by c.risk_score desc,c.product_id) product_rn
      from candidates c
      order by c.risk_score desc,c.product_id
      limit (v_staff_count*v_items)
    )
    select r.*,s.user_id assigned_to
    from ranked r
    join eligible_staff s on s.staff_rn=((r.product_rn-1)%v_staff_count)+1
    order by r.product_rn
  loop
    insert into private.inventory_audit_counts_v2(
      session_id,branch_id,inventory_branch_id,audit_date,product_id,assigned_to,
      expected_at_assignment,purchase_price_snapshot,risk_score,assigned_at,metadata
    ) values(
      v_session.id,p_branch_id,v_inventory_branch,v_date,v_rec.product_id,v_rec.assigned_to,
      v_rec.quantity,v_rec.purchase_price,v_rec.risk_score,clock_timestamp(),jsonb_build_object('generator_version',2)
    ) returning id into v_count_id;

    insert into public.operations_tasks(
      branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,
      claimed_by,claimed_at,due_at,metadata,created_by
    ) values(
      p_branch_id,'inventory_daily_count','inventory_count',v_count_id,0,
      case when v_rec.recent_discrepancies>0 then 'high' else 'normal' end,
      'claimed','جرد يومي: '||v_rec.name,
      'عدّ المنتج فعليًا بدون الاطلاع على رصيد النظام، ثم سجّل الكمية الموجودة.',
      v_rec.assigned_to,now(),v_due,
      jsonb_build_object('product_id',v_rec.product_id,'barcode',v_rec.barcode,'shelf_location',v_rec.shelf_location,'unit_of_measure',v_rec.unit_of_measure,'blind_count',true,'audit_date',v_date),
      auth.uid()
    ) returning id into v_task_id;

    update private.inventory_audit_counts_v2 set task_id=v_task_id where id=v_count_id;
    insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
    values(v_task_id,'assigned',auth.uid(),'تم توزيع مهمة الجرد اليومية تلقائيًا',jsonb_build_object('assigned_to',v_rec.assigned_to,'audit_date',v_date));
  end loop;

  perform private.refresh_inventory_audit_session_v2(v_session.id);
  return jsonb_build_object('session_id',v_session.id,'generated',(select count(*) from private.inventory_audit_counts_v2 where session_id=v_session.id),
    'existing',0,'eligible_staff',v_staff_count,'audit_date',v_date,'idempotent',false);
end;
$function$;

create or replace function public.get_inventory_audit_task_v2(p_task_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $function$
declare
  v_task public.operations_tasks%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id;
  if v_task.id is null or v_task.source_kind not in ('inventory_count','inventory_recount','inventory_adjustment') then
    raise exception using errcode='22023',message='INVENTORY_TASK_NOT_FOUND';
  end if;
  if not public.has_branch_access(auth.uid(),v_task.branch_id) then raise exception using errcode='42501',message='TASK_BRANCH_ACCESS_DENIED'; end if;

  if v_task.source_kind='inventory_count' then
    if v_task.claimed_by is distinct from auth.uid() and not public.staff_has_permission('inventory.manage_sessions',v_task.branch_id) then raise exception using errcode='42501',message='INVENTORY_TASK_NOT_OWNER'; end if;
    select jsonb_build_object(
      'task_id',v_task.id,'task_type',v_task.task_type,'source_kind',v_task.source_kind,'status',v_task.status,'due_at',v_task.due_at,
      'product_id',c.product_id,'product_name',p.name,'barcode',p.barcode,'image_url',case when cardinality(p.image_urls)>0 then p.image_urls[1] else null end,
      'shelf_location',p.shelf_location,'unit_of_measure',coalesce(p.unit_of_measure,p.base_unit,'قطعة'),'barcode_type',p.barcode_type,
      'blind_count',true,'audit_date',c.audit_date,'assigned_to',c.assigned_to,'assigned_at',c.assigned_at,'count_status',c.status
    ) into v_result
    from private.inventory_audit_counts_v2 c join public.products p on p.id=c.product_id where c.id=v_task.source_id;
  elsif v_task.source_kind='inventory_recount' then
    if v_task.claimed_by is distinct from auth.uid() and not public.staff_has_permission('inventory.manage_sessions',v_task.branch_id) then raise exception using errcode='42501',message='INVENTORY_TASK_NOT_OWNER'; end if;
    select jsonb_build_object(
      'task_id',v_task.id,'task_type',v_task.task_type,'source_kind',v_task.source_kind,'status',v_task.status,'due_at',v_task.due_at,
      'product_id',r.product_id,'product_name',p.name,'barcode',p.barcode,'image_url',case when cardinality(p.image_urls)>0 then p.image_urls[1] else null end,
      'shelf_location',p.shelf_location,'unit_of_measure',coalesce(p.unit_of_measure,p.base_unit,'قطعة'),'barcode_type',p.barcode_type,
      'blind_count',true,'assigned_to',r.assigned_to,'assigned_at',r.assigned_at,'count_status',r.status,'is_recount',true
    ) into v_result
    from private.inventory_audit_recounts_v2 r join public.products p on p.id=r.product_id where r.id=v_task.source_id;
  else
    if not public.staff_has_permission('inventory.approve_adjustment',v_task.branch_id) then raise exception using errcode='42501',message='INVENTORY_ADJUSTMENT_REVIEW_DENIED'; end if;
    select jsonb_build_object(
      'task_id',v_task.id,'task_type',v_task.task_type,'source_kind',v_task.source_kind,'status',v_task.status,'due_at',v_task.due_at,
      'product_id',r.product_id,'product_name',p.name,'barcode',p.barcode,'shelf_location',p.shelf_location,'unit_of_measure',coalesce(p.unit_of_measure,p.base_unit,'قطعة'),
      'blind_count',false,'system_expected',r.expected_at_submission,'first_count',c.actual_count,'first_variance',c.variance,
      'recount',r.actual_count,'recount_variance',r.variance,'verification_status',r.status,'variance_value',r.variance_value
    ) into v_result
    from private.inventory_audit_recounts_v2 r
    join private.inventory_audit_counts_v2 c on c.id=r.original_count_id
    join public.products p on p.id=r.product_id
    where r.id=v_task.source_id;
  end if;
  return coalesce(v_result,'{}'::jsonb);
end;
$function$;

create or replace function public.submit_inventory_count_v2(p_task_id uuid,p_actual_count numeric,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_task public.operations_tasks%rowtype;
  v_count private.inventory_audit_counts_v2%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_movement numeric:=0;
  v_expected numeric;
  v_current numeric;
  v_variance numeric;
  v_gap numeric;
  v_recount_id uuid;
  v_recount_task_id uuid;
  v_peer uuid;
  v_product_name text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_actual_count is null or p_actual_count<0 or p_actual_count::text in ('NaN','Infinity','-Infinity') or round(p_actual_count,3)<>p_actual_count then raise exception using errcode='22023',message='INVALID_ACTUAL_COUNT'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null or v_task.task_type<>'inventory_daily_count' or v_task.source_kind<>'inventory_count' then raise exception using errcode='22023',message='INVENTORY_COUNT_TASK_NOT_FOUND'; end if;
  if v_task.status='completed' then return to_jsonb(v_task)||jsonb_build_object('idempotent',true); end if;
  if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER'; end if;
  if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TASK_NOT_SUBMITTABLE'; end if;
  select * into v_count from private.inventory_audit_counts_v2 where id=v_task.source_id for update;
  if v_count.id is null then raise exception using errcode='22023',message='INVENTORY_COUNT_NOT_FOUND'; end if;
  select quantity into v_current from public.inventory where branch_id=v_count.inventory_branch_id and product_id=v_count.product_id for update;
  if v_current is null then raise exception using errcode='55000',message='INVENTORY_ROW_MISSING'; end if;
  select coalesce(sum(quantity_delta),0) into v_movement from private.inventory_movements_v2
  where inventory_branch_id=v_count.inventory_branch_id and product_id=v_count.product_id and changed_at>v_count.assigned_at and changed_at<=v_now;
  v_expected:=round(v_count.expected_at_assignment+v_movement,3);
  v_gap:=round(v_current-v_expected,3);
  if abs(v_gap)>0.001 then raise exception using errcode='55000',message='INVENTORY_MOVEMENT_LEDGER_GAP',detail=jsonb_build_object('gap',v_gap)::text; end if;
  v_variance:=round(p_actual_count-v_expected,3);

  update private.inventory_audit_counts_v2
     set submitted_at=v_now,actual_count=p_actual_count,expected_at_submission=v_expected,movement_delta=v_movement,
         variance=v_variance,variance_value=round(v_variance*purchase_price_snapshot,2),
         status=case when abs(v_variance)<=0.001 then 'matched' else 'discrepancy' end,
         note=nullif(trim(coalesce(p_note,'')),''),metadata=metadata||jsonb_build_object('movement_ledger_gap',v_gap,'submitted_by',auth.uid())
   where id=v_count.id returning * into v_count;
  update public.operations_tasks
     set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),
         metadata=metadata||jsonb_build_object('count_result',case when abs(v_variance)<=0.001 then 'matched' else 'discrepancy' end,'variance_detected',abs(v_variance)>0.001)
   where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
  values(v_task.id,'count_submitted',auth.uid(),nullif(trim(coalesce(p_note,'')),''),jsonb_build_object('result',case when abs(v_variance)<=0.001 then 'matched' else 'discrepancy' end));

  if abs(v_variance)>0.001 then
    select u.id into v_peer
    from public.user_branch_roles ubr
    join public.users u on u.id=ubr.user_id and coalesce(u.active,true)
    join public.staff_role_permissions rp on rp.role_id=ubr.role_id
    join public.staff_permissions sp on sp.id=rp.permission_id and sp.code='inventory.recount'
    where ubr.branch_id=v_count.branch_id and ubr.active and u.id<>v_count.assigned_to
    group by u.id
    order by hashtextextended(u.id::text||':'||v_count.id::text,83)
    limit 1;
    insert into private.inventory_audit_recounts_v2(original_count_id,branch_id,inventory_branch_id,product_id,assigned_to,expected_at_assignment,purchase_price_snapshot,assigned_at,metadata)
    values(v_count.id,v_count.branch_id,v_count.inventory_branch_id,v_count.product_id,v_peer,v_expected,v_count.purchase_price_snapshot,v_now,jsonb_build_object('blind_recount',true,'original_variance_hidden',true))
    returning id into v_recount_id;
    select name into v_product_name from public.products where id=v_count.product_id;
    insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,claimed_by,claimed_at,due_at,metadata,created_by)
    values(v_count.branch_id,'inventory_variance_recount','inventory_recount',v_recount_id,abs(round(v_variance*v_count.purchase_price_snapshot,2)),'high',
      case when v_peer is null then 'open' else 'claimed' end,'إعادة عد فرق جرد: '||coalesce(v_product_name,'منتج'),
      'أعد عدّ المنتج بشكل مستقل. نتيجة العد الأول ورصيد النظام مخفيان عنك.',v_peer,case when v_peer is null then null else now() end,
      now()+interval '4 hours',jsonb_build_object('product_id',v_count.product_id,'blind_count',true,'peer_review',true),auth.uid())
    returning id into v_recount_task_id;
    update private.inventory_audit_recounts_v2 set task_id=v_recount_task_id where id=v_recount_id;
    insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
    values(v_recount_task_id,'assigned',auth.uid(),'تم إنشاء إعادة عد مستقلة بسبب فرق الجرد',jsonb_build_object('assigned_to',v_peer));
  end if;
  perform private.refresh_inventory_audit_session_v2(v_count.session_id);
  return jsonb_build_object('task_id',v_task.id,'status','completed','result',case when abs(v_variance)<=0.001 then 'matched' else 'discrepancy' end,'recount_task_id',v_recount_task_id,'idempotent',false);
end;
$function$;

create or replace function public.submit_inventory_recount_v2(p_task_id uuid,p_actual_count numeric,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_task public.operations_tasks%rowtype;
  v_recount private.inventory_audit_recounts_v2%rowtype;
  v_count private.inventory_audit_counts_v2%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_movement numeric:=0;
  v_expected numeric;
  v_current numeric;
  v_variance numeric;
  v_gap numeric;
  v_review_task_id uuid;
  v_product_name text;
  v_verification text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_actual_count is null or p_actual_count<0 or p_actual_count::text in ('NaN','Infinity','-Infinity') or round(p_actual_count,3)<>p_actual_count then raise exception using errcode='22023',message='INVALID_ACTUAL_COUNT'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null or v_task.task_type<>'inventory_variance_recount' or v_task.source_kind<>'inventory_recount' then raise exception using errcode='22023',message='INVENTORY_RECOUNT_TASK_NOT_FOUND'; end if;
  if v_task.status='completed' then return to_jsonb(v_task)||jsonb_build_object('idempotent',true); end if;
  if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER'; end if;
  if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TASK_NOT_SUBMITTABLE'; end if;
  select * into v_recount from private.inventory_audit_recounts_v2 where id=v_task.source_id for update;
  select * into v_count from private.inventory_audit_counts_v2 where id=v_recount.original_count_id for update;
  if v_recount.id is null or v_count.id is null then raise exception using errcode='22023',message='INVENTORY_RECOUNT_NOT_FOUND'; end if;
  if v_count.assigned_to=auth.uid() then raise exception using errcode='42501',message='INVENTORY_SELF_RECOUNT_DENIED'; end if;
  select quantity into v_current from public.inventory where branch_id=v_recount.inventory_branch_id and product_id=v_recount.product_id for update;
  if v_current is null then raise exception using errcode='55000',message='INVENTORY_ROW_MISSING'; end if;
  select coalesce(sum(quantity_delta),0) into v_movement from private.inventory_movements_v2
  where inventory_branch_id=v_recount.inventory_branch_id and product_id=v_recount.product_id and changed_at>v_recount.assigned_at and changed_at<=v_now;
  v_expected:=round(v_recount.expected_at_assignment+v_movement,3);
  v_gap:=round(v_current-v_expected,3);
  if abs(v_gap)>0.001 then raise exception using errcode='55000',message='INVENTORY_MOVEMENT_LEDGER_GAP',detail=jsonb_build_object('gap',v_gap)::text; end if;
  v_variance:=round(p_actual_count-v_expected,3);
  if abs(v_variance)<=0.001 then v_verification:='matched_system';
  elsif abs(v_variance-coalesce(v_count.variance,0))<=0.001 then v_verification:='confirmed_variance';
  else v_verification:='conflicting'; end if;
  update private.inventory_audit_recounts_v2
     set submitted_at=v_now,actual_count=p_actual_count,expected_at_submission=v_expected,movement_delta=v_movement,
         variance=v_variance,variance_value=round(v_variance*purchase_price_snapshot,2),status=v_verification,
         note=nullif(trim(coalesce(p_note,'')),''),metadata=metadata||jsonb_build_object('movement_ledger_gap',v_gap,'submitted_by',auth.uid())
   where id=v_recount.id returning * into v_recount;
  update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),metadata=metadata||jsonb_build_object('recount_result',v_verification)
  where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
  values(v_task.id,'recount_submitted',auth.uid(),nullif(trim(coalesce(p_note,'')),''),jsonb_build_object('result',v_verification));
  if v_verification='matched_system' then
    update private.inventory_audit_counts_v2 set status='resolved_no_adjustment',metadata=metadata||jsonb_build_object('resolution','peer_recount_matched_system') where id=v_count.id;
  else
    update private.inventory_audit_counts_v2 set status='review_required',metadata=metadata||jsonb_build_object('verification',v_verification) where id=v_count.id;
    select name into v_product_name from public.products where id=v_recount.product_id;
    insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,due_at,metadata,created_by)
    values(v_recount.branch_id,'inventory_adjustment_review','inventory_adjustment',v_recount.id,abs(coalesce(v_recount.variance_value,0)),'high','open',
      'اعتماد فرق مخزون: '||coalesce(v_product_name,'منتج'),'راجع العد الأول وإعادة العد والحركات قبل اعتماد أي تسوية للمخزون. لا يتم تعديل المخزون تلقائيًا.',
      now()+interval '4 hours',jsonb_build_object('product_id',v_recount.product_id,'verification_status',v_verification,'requires_manager_approval',true),auth.uid())
    on conflict(task_type,source_kind,source_id) do update set updated_at=now()
    returning id into v_review_task_id;
    if v_review_task_id is not null then
      insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
      values(v_review_task_id,'created',auth.uid(),'تم إنشاء مراجعة تسوية مخزون بعد إعادة العد',jsonb_build_object('verification_status',v_verification));
    end if;
  end if;
  perform private.refresh_inventory_audit_session_v2(v_count.session_id);
  return jsonb_build_object('task_id',v_task.id,'status','completed','result',v_verification,'adjustment_review_task_id',v_review_task_id,'idempotent',false);
end;
$function$;

create or replace function public.complete_operations_task(p_task_id uuid,p_note text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_task public.operations_tasks%rowtype; v_note text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_note:=nullif(trim(coalesce(p_note,'')),'');
  if v_note is null or length(v_note)<3 then raise exception using errcode='22023',message='TASK_COMPLETION_NOTE_REQUIRED'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null then raise exception using errcode='22023',message='TASK_NOT_FOUND'; end if;
  if v_task.task_type in ('refund_transfer','inventory_daily_count','inventory_variance_recount','inventory_adjustment_review') then raise exception using errcode='55000',message='TASK_REQUIRES_SPECIAL_COMPLETION'; end if;
  if v_task.status='completed' then return to_jsonb(v_task)||jsonb_build_object('idempotent',true); end if;
  if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER'; end if;
  if not private.operations_task_can_claim(v_task.source_kind,v_task.branch_id) then raise exception using errcode='42501',message='TASK_ACTION_DENIED'; end if;
  if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TASK_NOT_COMPLETABLE'; end if;
  update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),failure_reason=null,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('resolution_note',v_note,'resolved_at',now(),'resolved_by',auth.uid()) where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'completed',auth.uid(),v_note);
  return to_jsonb(v_task)||jsonb_build_object('idempotent',false);
end;
$function$;

create or replace function public.claim_operations_task(p_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_task public.operations_tasks%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_task from public.operations_tasks where id=p_task_id for update;
  if v_task.id is null then raise exception using errcode='22023',message='TASK_NOT_FOUND'; end if;
  if not private.operations_task_can_claim(v_task.source_kind,v_task.branch_id) then raise exception using errcode='42501',message='TASK_CLAIM_DENIED'; end if;
  if v_task.source_kind='inventory_recount' and exists(
    select 1 from private.inventory_audit_recounts_v2 r join private.inventory_audit_counts_v2 c on c.id=r.original_count_id
    where r.id=v_task.source_id and c.assigned_to=auth.uid()
  ) then raise exception using errcode='42501',message='INVENTORY_SELF_RECOUNT_DENIED'; end if;
  if v_task.status in ('claimed','in_progress','failed') and v_task.claimed_by=auth.uid() then return to_jsonb(v_task)||jsonb_build_object('idempotent',true); end if;
  if v_task.status<>'open' then raise exception using errcode='55000',message='TASK_ALREADY_CLAIMED'; end if;
  update public.operations_tasks set status='claimed',claimed_by=auth.uid(),claimed_at=now(),failure_reason=null,updated_at=now() where id=v_task.id returning * into v_task;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'claimed',auth.uid(),'تم استلام المهمة');
  return to_jsonb(v_task)||jsonb_build_object('idempotent',false);
end;
$function$;

revoke all on function public.ensure_daily_inventory_audit_tasks_v2(uuid,integer,date) from public,anon;
revoke all on function public.get_inventory_audit_task_v2(uuid) from public,anon;
revoke all on function public.submit_inventory_count_v2(uuid,numeric,text) from public,anon;
revoke all on function public.submit_inventory_recount_v2(uuid,numeric,text) from public,anon;
grant execute on function public.ensure_daily_inventory_audit_tasks_v2(uuid,integer,date) to authenticated,service_role;
grant execute on function public.get_inventory_audit_task_v2(uuid) to authenticated,service_role;
grant execute on function public.submit_inventory_count_v2(uuid,numeric,text) to authenticated,service_role;
grant execute on function public.submit_inventory_recount_v2(uuid,numeric,text) to authenticated,service_role;
