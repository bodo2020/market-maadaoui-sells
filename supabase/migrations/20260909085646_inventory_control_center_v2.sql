alter table public.inventory
  alter column min_stock_level type numeric(14,3) using min_stock_level::numeric,
  alter column max_stock_level type numeric(14,3) using max_stock_level::numeric,
  add column if not exists alert_enabled boolean not null default false;

update public.inventory i
set alert_enabled = coalesce(a.alert_enabled,false)
from public.inventory_alerts a
where a.product_id=i.product_id and i.alert_enabled=false and coalesce(a.alert_enabled,false)=true;

alter table public.inventory drop constraint if exists inventory_min_stock_nonnegative_v2;
alter table public.inventory add constraint inventory_min_stock_nonnegative_v2 check(min_stock_level is null or min_stock_level>=0);
alter table public.inventory drop constraint if exists inventory_max_stock_nonnegative_v2;
alter table public.inventory add constraint inventory_max_stock_nonnegative_v2 check(max_stock_level is null or max_stock_level>=0);
alter table public.inventory drop constraint if exists inventory_stock_range_v2;
alter table public.inventory add constraint inventory_stock_range_v2 check(max_stock_level is null or min_stock_level is null or max_stock_level>=min_stock_level);

create index if not exists inventory_branch_alert_status_v2_idx
  on public.inventory(branch_id,alert_enabled,quantity,min_stock_level);
create index if not exists inventory_movements_v2_branch_time_idx
  on private.inventory_movements_v2(inventory_branch_id,changed_at desc,id desc);

create or replace function private.capture_inventory_movement_v2()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_source text:=nullif(current_setting('app.inventory_movement_source',true),'');
  v_task text:=nullif(current_setting('app.inventory_task_id',true),'');
  v_reason text:=nullif(current_setting('app.inventory_reason_code',true),'');
  v_note text:=nullif(current_setting('app.inventory_note',true),'');
  v_request text:=nullif(current_setting('app.inventory_request_id',true),'');
begin
  if new.quantity is distinct from old.quantity then
    insert into private.inventory_movements_v2(
      inventory_branch_id,product_id,quantity_before,quantity_after,quantity_delta,actor_id,changed_at,metadata
    ) values(
      new.branch_id,new.product_id,old.quantity,new.quantity,new.quantity-old.quantity,auth.uid(),clock_timestamp(),
      jsonb_strip_nulls(jsonb_build_object(
        'inventory_row_id',new.id,
        'source',coalesce(v_source,'inventory_quantity_update'),
        'operations_task_id',v_task,
        'reason_code',v_reason,
        'note',v_note,
        'request_id',v_request
      ))
    );
  end if;
  return new;
end;
$function$;

create or replace function public.get_inventory_control_center_v2(
  p_branch_id uuid,
  p_search text default null,
  p_status text default 'all',
  p_category_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $function$
declare
  v_inventory_branch uuid;
  v_pricing_branch uuid;
  v_branch_name text;
  v_inventory_branch_name text;
  v_q text:=lower(trim(coalesce(p_search,'')));
  v_status text:=lower(trim(coalesce(p_status,'all')));
  v_limit int:=least(greatest(coalesce(p_limit,50),1),100);
  v_offset int:=least(greatest(coalesce(p_offset,0),0),100000);
  v_can_manage boolean;
  v_summary jsonb;
  v_products jsonb;
  v_categories jsonb;
  v_movements jsonb;
  v_total bigint:=0;
  v_ledger_started_at timestamptz;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='INVENTORY_BRANCH_ACCESS_DENIED'; end if;
  if not (public.staff_has_permission('inventory.view',p_branch_id) or public.staff_has_permission('inventory.manage',p_branch_id) or public.staff_has_permission('inventory.reports',p_branch_id)) then
    raise exception using errcode='42501',message='INVENTORY_VIEW_DENIED';
  end if;
  if v_status not in ('all','healthy','low_stock','out_of_stock','overstock','no_movement','coverage_risk','alerts') then
    raise exception using errcode='22023',message='INVALID_INVENTORY_FILTER';
  end if;

  select coalesce(b.inventory_source_branch_id,b.id),coalesce(b.pricing_source_branch_id,b.id),b.name
    into v_inventory_branch,v_pricing_branch,v_branch_name
  from public.branches b where b.id=p_branch_id and b.active;
  if v_inventory_branch is null then raise exception using errcode='22023',message='BRANCH_NOT_FOUND'; end if;
  select name into v_inventory_branch_name from public.branches where id=v_inventory_branch;
  v_can_manage:=public.staff_has_permission('inventory.manage',p_branch_id);
  select min(changed_at) into v_ledger_started_at from private.inventory_movements_v2 where inventory_branch_id=v_inventory_branch;

  with sold as (
    select ii.product_id,
      sum(case when ii.weight is not null then ii.weight else coalesce(ii.quantity,0) end)::numeric sold_30d,
      max(i.sale_date) last_sale_at
    from public.pos_invoices i
    join public.pos_invoice_items ii on ii.invoice_id=i.id
    where i.branch_id=p_branch_id and i.sale_date>=now()-interval '30 days' and ii.product_id is not null
    group by ii.product_id
  ), returned as (
    select ri.product_id,sum(coalesce(ri.quantity,0))::numeric returned_30d
    from public.returns r join public.return_items ri on ri.return_id=r.id
    where r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=now()-interval '30 days'
    group by ri.product_id
  ), base as (
    select inv.product_id,inv.quantity,coalesce(inv.min_stock_level,0)::numeric min_stock_level,
      inv.max_stock_level::numeric max_stock_level,inv.alert_enabled,
      p.id linked_product,p.name,p.barcode,p.image_urls,p.shelf_location,coalesce(p.unit_of_measure,p.base_unit,'قطعة') unit_of_measure,
      p.main_category_id,coalesce(mc.name,'بدون قسم') category_name,
      coalesce(bp.purchase_price,p.purchase_price) purchase_price,
      coalesce(case when bp.is_offer and bp.offer_price is not null then bp.offer_price else bp.sale_price end,
               case when p.is_offer and p.offer_price is not null then p.offer_price else p.price end) sale_price,
      coalesce(s.sold_30d,0)::numeric sold_30d,coalesce(r.returned_30d,0)::numeric returned_30d,s.last_sale_at,
      greatest(coalesce(s.sold_30d,0)-coalesce(r.returned_30d,0),0)::numeric net_sold_30d
    from public.inventory inv
    left join public.products p on p.id=inv.product_id
    left join public.main_categories mc on mc.id=p.main_category_id
    left join public.branch_product_pricing bp on bp.branch_id=v_pricing_branch and bp.product_id=inv.product_id
    left join sold s on s.product_id=inv.product_id
    left join returned r on r.product_id=inv.product_id
    where inv.branch_id=v_inventory_branch
  ), calc as (
    select *,case when net_sold_30d>0 and quantity>0 then quantity/(net_sold_30d/30.0) else null end::numeric days_cover
    from base
  )
  select jsonb_build_object(
    'sku_rows',count(*)::bigint,
    'linked_catalog_rows',count(*) filter(where linked_product is not null)::bigint,
    'unlinked_inventory_rows',count(*) filter(where linked_product is null)::bigint,
    'positive_stock_rows',count(*) filter(where quantity>0)::bigint,
    'out_of_stock_rows',count(*) filter(where quantity<=0)::bigint,
    'low_stock_rows',count(*) filter(where quantity>0 and min_stock_level>0 and quantity<=min_stock_level)::bigint,
    'overstock_rows',count(*) filter(where quantity>0 and max_stock_level is not null and max_stock_level>0 and quantity>max_stock_level)::bigint,
    'alerting_rows',count(*) filter(where alert_enabled and quantity<=min_stock_level)::bigint,
    'no_movement_rows',count(*) filter(where quantity>0 and net_sold_30d=0)::bigint,
    'coverage_risk_rows',count(*) filter(where days_cover is not null and days_cover<=14)::bigint,
    'on_hand_measure',round(coalesce(sum(greatest(quantity,0)),0),3),
    'purchase_value',round(coalesce(sum(greatest(quantity,0)*coalesce(purchase_price,0)) filter(where linked_product is not null),0),2),
    'retail_value',round(coalesce(sum(greatest(quantity,0)*coalesce(sale_price,0)) filter(where linked_product is not null),0),2),
    'potential_margin_value',round(coalesce(sum(greatest(quantity,0)*(coalesce(sale_price,0)-coalesce(purchase_price,0))) filter(where linked_product is not null),0),2),
    'active_audit_sessions',(select count(*) from private.inventory_audit_sessions_v2 s where s.branch_id=p_branch_id and s.status='active'),
    'pending_audit_tasks',(select count(*) from public.operations_tasks t where t.branch_id=p_branch_id and t.source_kind in ('inventory_count','inventory_recount','inventory_adjustment') and t.status not in ('completed','cancelled')),
    'movement_ledger_rows',(select count(*) from private.inventory_movements_v2 m where m.inventory_branch_id=v_inventory_branch),
    'movement_ledger_started_at',v_ledger_started_at
  ) into v_summary from calc;

  with sold as (
    select ii.product_id,
      sum(case when ii.weight is not null then ii.weight else coalesce(ii.quantity,0) end)::numeric sold_30d,
      max(i.sale_date) last_sale_at
    from public.pos_invoices i join public.pos_invoice_items ii on ii.invoice_id=i.id
    where i.branch_id=p_branch_id and i.sale_date>=now()-interval '30 days' and ii.product_id is not null
    group by ii.product_id
  ), returned as (
    select ri.product_id,sum(coalesce(ri.quantity,0))::numeric returned_30d
    from public.returns r join public.return_items ri on ri.return_id=r.id
    where r.branch_id=p_branch_id and r.source='pos' and r.status='approved' and coalesce(r.approved_at,r.created_at)>=now()-interval '30 days'
    group by ri.product_id
  ), base as (
    select inv.product_id,inv.quantity,coalesce(inv.min_stock_level,0)::numeric min_stock_level,inv.max_stock_level::numeric max_stock_level,inv.alert_enabled,
      p.id linked_product,coalesce(p.name,'منتج غير مرتبط') product_name,p.barcode,p.image_urls,p.shelf_location,coalesce(p.unit_of_measure,p.base_unit,'قطعة') unit_of_measure,
      p.main_category_id,coalesce(mc.name,'بدون قسم') category_name,
      coalesce(bp.purchase_price,p.purchase_price) purchase_price,
      coalesce(case when bp.is_offer and bp.offer_price is not null then bp.offer_price else bp.sale_price end,
               case when p.is_offer and p.offer_price is not null then p.offer_price else p.price end) sale_price,
      coalesce(s.sold_30d,0)::numeric sold_30d,coalesce(r.returned_30d,0)::numeric returned_30d,s.last_sale_at,
      greatest(coalesce(s.sold_30d,0)-coalesce(r.returned_30d,0),0)::numeric net_sold_30d
    from public.inventory inv
    left join public.products p on p.id=inv.product_id
    left join public.main_categories mc on mc.id=p.main_category_id
    left join public.branch_product_pricing bp on bp.branch_id=v_pricing_branch and bp.product_id=inv.product_id
    left join sold s on s.product_id=inv.product_id
    left join returned r on r.product_id=inv.product_id
    where inv.branch_id=v_inventory_branch
  ), calc as (
    select *,case when net_sold_30d>0 and quantity>0 then quantity/(net_sold_30d/30.0) else null end::numeric days_cover,
      (quantity<=0) is_out,
      (quantity>0 and min_stock_level>0 and quantity<=min_stock_level) is_low,
      (quantity>0 and max_stock_level is not null and max_stock_level>0 and quantity>max_stock_level) is_over,
      (quantity>0 and net_sold_30d=0) is_no_movement
    from base
  ), filtered as (
    select *,case when is_out then 'out_of_stock' when is_low then 'low_stock' when is_over then 'overstock'
                  when days_cover is not null and days_cover<=14 then 'coverage_risk' when is_no_movement then 'no_movement' else 'healthy' end stock_status
    from calc
    where (p_category_id is null or main_category_id=p_category_id)
      and (v_q='' or lower(product_name) like '%'||v_q||'%' or lower(coalesce(barcode,'')) like '%'||v_q||'%' or lower(coalesce(shelf_location,'')) like '%'||v_q||'%')
      and (v_status='all'
        or (v_status='healthy' and not is_out and not is_low and not is_over and not is_no_movement and not (days_cover is not null and days_cover<=14))
        or (v_status='low_stock' and is_low)
        or (v_status='out_of_stock' and is_out)
        or (v_status='overstock' and is_over)
        or (v_status='no_movement' and is_no_movement)
        or (v_status='coverage_risk' and days_cover is not null and days_cover<=14)
        or (v_status='alerts' and alert_enabled and quantity<=min_stock_level))
  ), page as (
    select f.*,
      (select max(c.submitted_at) from private.inventory_audit_counts_v2 c where c.inventory_branch_id=v_inventory_branch and c.product_id=f.product_id and c.submitted_at is not null) last_audit_at
    from filtered f
    order by case stock_status when 'out_of_stock' then 1 when 'low_stock' then 2 when 'coverage_risk' then 3 when 'overstock' then 4 when 'no_movement' then 5 else 6 end,
             product_name,product_id
    limit v_limit offset v_offset
  )
  select (select count(*) from filtered)::bigint,
    coalesce(jsonb_agg(jsonb_build_object(
      'product_id',product_id,'linked_product',linked_product is not null,'product_name',product_name,'barcode',barcode,
      'image_url',case when image_urls is not null and cardinality(image_urls)>0 then image_urls[1] else null end,
      'quantity',round(quantity,3),'unit_of_measure',unit_of_measure,'shelf_location',shelf_location,
      'category_id',main_category_id,'category_name',category_name,'min_stock_level',round(min_stock_level,3),'max_stock_level',case when max_stock_level is null then null else round(max_stock_level,3) end,
      'alert_enabled',alert_enabled,'purchase_price',purchase_price,'sale_price',sale_price,
      'purchase_value',round(greatest(quantity,0)*coalesce(purchase_price,0),2),'retail_value',round(greatest(quantity,0)*coalesce(sale_price,0),2),
      'sold_30d',round(sold_30d,3),'returned_30d',round(returned_30d,3),'net_sold_30d',round(net_sold_30d,3),'days_cover',case when days_cover is null then null else round(days_cover,1) end,
      'last_sale_at',last_sale_at,'last_audit_at',last_audit_at,'stock_status',stock_status,
      'is_low_stock',is_low,'is_out_of_stock',is_out,'is_overstock',is_over,'is_no_movement',is_no_movement
    ) order by case stock_status when 'out_of_stock' then 1 when 'low_stock' then 2 when 'coverage_risk' then 3 when 'overstock' then 4 when 'no_movement' then 5 else 6 end,product_name),'[]'::jsonb)
  into v_total,v_products from page;

  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'products',x.products) order by x.name),'[]'::jsonb)
  into v_categories
  from (
    select mc.id,mc.name,count(*)::int products
    from public.inventory inv join public.products p on p.id=inv.product_id join public.main_categories mc on mc.id=p.main_category_id
    where inv.branch_id=v_inventory_branch group by mc.id,mc.name
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'product_id',m.product_id,'product_name',coalesce(p.name,'منتج غير مرتبط'),'barcode',p.barcode,
    'quantity_before',m.quantity_before,'quantity_after',m.quantity_after,'quantity_delta',m.quantity_delta,
    'actor_id',m.actor_id,'actor_name',u.name,'changed_at',m.changed_at,'source',coalesce(m.metadata->>'source','inventory_quantity_update'),
    'reason_code',m.metadata->>'reason_code','note',m.metadata->>'note','operations_task_id',m.metadata->>'operations_task_id','request_id',m.metadata->>'request_id'
  ) order by m.changed_at desc,m.id desc),'[]'::jsonb)
  into v_movements
  from (select * from private.inventory_movements_v2 where inventory_branch_id=v_inventory_branch order by changed_at desc,id desc limit 30) m
  left join public.products p on p.id=m.product_id
  left join public.users u on u.id=m.actor_id;

  return jsonb_build_object(
    'version',2,'branch_id',p_branch_id,'branch_name',v_branch_name,'inventory_source_branch_id',v_inventory_branch,
    'inventory_source_branch_name',coalesce(v_inventory_branch_name,v_branch_name),'pricing_source_branch_id',v_pricing_branch,
    'summary',coalesce(v_summary,'{}'::jsonb),'total_filtered',coalesce(v_total,0),'limit',v_limit,'offset',v_offset,
    'products',coalesce(v_products,'[]'::jsonb),'categories',coalesce(v_categories,'[]'::jsonb),'recent_movements',coalesce(v_movements,'[]'::jsonb),
    'permissions',jsonb_build_object('can_manage',v_can_manage,'can_transfer',public.staff_has_permission('inventory.transfer',p_branch_id),'can_manage_sessions',public.staff_has_permission('inventory.manage_sessions',p_branch_id)),
    'data_quality',jsonb_build_object('sales_window_days',30,'movement_ledger_started_at',v_ledger_started_at,'movement_ledger_is_historical_complete',false)
  );
end;
$function$;

create or replace function public.get_inventory_product_movements_v2(
  p_branch_id uuid,p_product_id uuid,p_limit integer default 100
)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $function$
declare v_inventory_branch uuid; v_limit int:=least(greatest(coalesce(p_limit,100),1),200); v_rows jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='INVENTORY_BRANCH_ACCESS_DENIED'; end if;
  if not (public.staff_has_permission('inventory.view',p_branch_id) or public.staff_has_permission('inventory.manage',p_branch_id) or public.staff_has_permission('inventory.reports',p_branch_id)) then raise exception using errcode='42501',message='INVENTORY_VIEW_DENIED'; end if;
  select coalesce(inventory_source_branch_id,id) into v_inventory_branch from public.branches where id=p_branch_id and active;
  if v_inventory_branch is null then raise exception using errcode='22023',message='BRANCH_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'product_id',m.product_id,'product_name',coalesce(p.name,'منتج غير مرتبط'),'barcode',p.barcode,
    'quantity_before',m.quantity_before,'quantity_after',m.quantity_after,'quantity_delta',m.quantity_delta,
    'actor_id',m.actor_id,'actor_name',u.name,'changed_at',m.changed_at,'source',coalesce(m.metadata->>'source','inventory_quantity_update'),
    'reason_code',m.metadata->>'reason_code','note',m.metadata->>'note','operations_task_id',m.metadata->>'operations_task_id','request_id',m.metadata->>'request_id'
  ) order by m.changed_at desc,m.id desc),'[]'::jsonb)
  into v_rows
  from (select * from private.inventory_movements_v2 where inventory_branch_id=v_inventory_branch and product_id=p_product_id order by changed_at desc,id desc limit v_limit) m
  left join public.products p on p.id=m.product_id left join public.users u on u.id=m.actor_id;
  return v_rows;
end;
$function$;

create or replace function public.set_inventory_stock_policy_v2(
  p_branch_id uuid,p_product_id uuid,p_min_stock_level numeric,p_max_stock_level numeric default null,p_alert_enabled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_inventory_branch uuid; v_row public.inventory%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='INVENTORY_BRANCH_ACCESS_DENIED'; end if;
  if not public.staff_has_permission('inventory.manage',p_branch_id) then raise exception using errcode='42501',message='INVENTORY_MANAGE_DENIED'; end if;
  if p_product_id is null or p_min_stock_level is null or p_min_stock_level<0 or p_min_stock_level>1000000000 or round(p_min_stock_level,3)<>p_min_stock_level then raise exception using errcode='22023',message='INVALID_MIN_STOCK_LEVEL'; end if;
  if p_max_stock_level is not null and (p_max_stock_level<0 or p_max_stock_level>1000000000 or round(p_max_stock_level,3)<>p_max_stock_level or p_max_stock_level<p_min_stock_level) then raise exception using errcode='22023',message='INVALID_MAX_STOCK_LEVEL'; end if;
  select coalesce(inventory_source_branch_id,id) into v_inventory_branch from public.branches where id=p_branch_id and active;
  update public.inventory set min_stock_level=p_min_stock_level,max_stock_level=p_max_stock_level,alert_enabled=coalesce(p_alert_enabled,false),updated_at=now()
  where branch_id=v_inventory_branch and product_id=p_product_id returning * into v_row;
  if v_row.id is null then raise exception using errcode='22023',message='INVENTORY_ROW_MISSING'; end if;
  return jsonb_build_object('product_id',p_product_id,'min_stock_level',v_row.min_stock_level,'max_stock_level',v_row.max_stock_level,'alert_enabled',v_row.alert_enabled,'updated_at',v_row.updated_at);
end;
$function$;

create or replace function public.adjust_inventory_stock_v2(
  p_request_id uuid,p_branch_id uuid,p_product_id uuid,p_delta numeric,p_reason_code text,p_note text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_reason text:=lower(trim(coalesce(p_reason_code,'')));
  v_note text:=trim(coalesce(p_note,''));
  v_after numeric;
  v_before numeric;
  v_existing boolean:=false;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='INVENTORY_BRANCH_ACCESS_DENIED'; end if;
  if not public.staff_has_permission('inventory.manage',p_branch_id) then raise exception using errcode='42501',message='INVENTORY_MANAGE_DENIED'; end if;
  if p_request_id is null then raise exception using errcode='22023',message='REQUEST_ID_REQUIRED'; end if;
  if v_reason not in ('manual_correction','receiving_correction','damage','breakage','loss','internal_use','opening_balance','other') then raise exception using errcode='22023',message='INVALID_INVENTORY_ADJUSTMENT_REASON'; end if;
  if length(v_note)<3 or length(v_note)>500 then raise exception using errcode='22023',message='INVENTORY_ADJUSTMENT_NOTE_REQUIRED'; end if;
  if p_delta is null or p_delta=0 or p_delta::text in ('NaN','Infinity','-Infinity') or abs(p_delta)>1000000000 or round(p_delta,3)<>p_delta then raise exception using errcode='22023',message='INVALID_STOCK_CHANGE'; end if;

  select exists(select 1 from private.pos_inventory_requests r where r.id=p_request_id and r.user_id=auth.uid()) into v_existing;
  perform set_config('app.inventory_movement_source','manual_inventory_adjustment',true);
  perform set_config('app.inventory_reason_code',v_reason,true);
  perform set_config('app.inventory_note',v_note,true);
  perform set_config('app.inventory_request_id',p_request_id::text,true);
  v_after:=private.adjust_branch_inventory(p_request_id,p_product_id,p_branch_id,p_delta);
  v_before:=v_after-p_delta;
  return jsonb_build_object('request_id',p_request_id,'product_id',p_product_id,'quantity_before',round(v_before,3),'quantity_after',round(v_after,3),'quantity_delta',round(p_delta,3),'reason_code',v_reason,'note',v_note,'idempotent',v_existing);
end;
$function$;

revoke all on function public.get_inventory_control_center_v2(uuid,text,text,uuid,integer,integer) from public,anon;
revoke all on function public.get_inventory_product_movements_v2(uuid,uuid,integer) from public,anon;
revoke all on function public.set_inventory_stock_policy_v2(uuid,uuid,numeric,numeric,boolean) from public,anon;
revoke all on function public.adjust_inventory_stock_v2(uuid,uuid,uuid,numeric,text,text) from public,anon;
grant execute on function public.get_inventory_control_center_v2(uuid,text,text,uuid,integer,integer) to authenticated,service_role;
grant execute on function public.get_inventory_product_movements_v2(uuid,uuid,integer) to authenticated,service_role;
grant execute on function public.set_inventory_stock_policy_v2(uuid,uuid,numeric,numeric,boolean) to authenticated,service_role;
grant execute on function public.adjust_inventory_stock_v2(uuid,uuid,uuid,numeric,text,text) to authenticated,service_role;
