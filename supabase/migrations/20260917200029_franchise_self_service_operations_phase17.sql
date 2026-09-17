create table if not exists private.franchise_operation_requests_v1 (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  request_type text not null,
  product_id uuid references public.products(id) on delete restrict,
  order_id uuid references public.online_orders(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  requested_by uuid not null references auth.users(id) on delete restrict,
  task_id uuid references public.operations_tasks(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  applied_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint franchise_operation_request_type_v1_check check (request_type in ('inventory_adjustment','price_change','catalog_add','catalog_remove','branch_settings','order_status')),
  constraint franchise_operation_request_status_v1_check check (status in ('pending','approved','rejected','applied','failed','cancelled')),
  constraint franchise_operation_payload_v1_check check (jsonb_typeof(payload)='object')
);

create index if not exists idx_franchise_operation_requests_merchant_v1 on private.franchise_operation_requests_v1(merchant_id,status,created_at desc);
create index if not exists idx_franchise_operation_requests_branch_v1 on private.franchise_operation_requests_v1(branch_id,status,created_at desc);
create unique index if not exists ux_franchise_operation_requests_task_v1 on private.franchise_operation_requests_v1(task_id) where task_id is not null;
alter table private.franchise_operation_requests_v1 enable row level security;
revoke all on private.franchise_operation_requests_v1 from public,anon,authenticated;
grant select on private.franchise_operation_requests_v1 to service_role;

create or replace function private.franchise_active_agreement_v1(p_merchant_id uuid)
returns private.franchise_agreements_v1
language sql
stable
security definer
set search_path=''
as $$
  select a.* from private.franchise_agreements_v1 a
  where a.merchant_id=p_merchant_id and a.is_current and a.status='active'
    and a.starts_on<=current_date and (a.ends_on is null or a.ends_on>=current_date)
  limit 1
$$;
revoke all on function private.franchise_active_agreement_v1(uuid) from public,anon,authenticated;
grant execute on function private.franchise_active_agreement_v1(uuid) to service_role;

create or replace function private.assert_franchise_portal_branch_v1(p_merchant_id uuid,p_branch_id uuid)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_role text; v_tenant uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_role:=private.my_franchise_portal_role_v1(p_merchant_id);
  if v_role is null then raise exception using errcode='42501',message='FRANCHISE_PORTAL_ACCESS_DENIED'; end if;
  select b.tenant_id into v_tenant from public.branches b where b.id=p_branch_id and b.merchant_id=p_merchant_id;
  if v_tenant is null then raise exception using errcode='42501',message='FRANCHISE_BRANCH_ACCESS_DENIED'; end if;
  if not exists(
    select 1 from private.franchise_agreements_v1 a
    where a.merchant_id=p_merchant_id and a.is_current and a.status='active'
      and a.starts_on<=current_date and (a.ends_on is null or a.ends_on>=current_date)
  ) then raise exception using errcode='42501',message='FRANCHISE_AGREEMENT_INACTIVE'; end if;
  return v_role;
end;
$$;
revoke all on function private.assert_franchise_portal_branch_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function private.assert_franchise_portal_branch_v1(uuid,uuid) to service_role;

create or replace function private.create_franchise_operation_request_v1(
  p_merchant_id uuid,p_branch_id uuid,p_request_type text,p_product_id uuid,p_order_id uuid,p_payload jsonb,p_title text,p_description text,p_priority text default 'normal'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid:=gen_random_uuid(); v_task uuid:=gen_random_uuid(); v_tenant uuid;
begin
  perform private.assert_franchise_portal_branch_v1(p_merchant_id,p_branch_id);
  select b.tenant_id into v_tenant from public.branches b where b.id=p_branch_id and b.merchant_id=p_merchant_id;
  insert into private.franchise_operation_requests_v1(id,tenant_id,merchant_id,branch_id,request_type,product_id,order_id,payload,status,requested_by,task_id)
  values(v_id,v_tenant,p_merchant_id,p_branch_id,p_request_type,p_product_id,p_order_id,coalesce(p_payload,'{}'::jsonb),'pending',auth.uid(),v_task);
  insert into public.operations_tasks(id,branch_id,task_type,source_kind,source_id,order_id,priority,status,title,description,due_at,metadata,created_by)
  values(v_task,p_branch_id,'franchise_operation_review','franchise_operation',v_id,p_order_id,case when p_priority in ('urgent','high','normal','low') then p_priority else 'normal' end,'open',p_title,p_description,now()+interval '24 hours',jsonb_build_object('merchant_id',p_merchant_id,'request_type',p_request_type,'requested_by',auth.uid()),auth.uid());
  return jsonb_build_object('mode','approval_required','request_id',v_id,'task_id',v_task,'status','pending');
end;
$$;
revoke all on function private.create_franchise_operation_request_v1(uuid,uuid,text,uuid,uuid,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function private.create_franchise_operation_request_v1(uuid,uuid,text,uuid,uuid,jsonb,text,text,text) to service_role;

create or replace function public.get_franchise_operations_workspace_v1(p_merchant_id uuid,p_branch_id uuid default null,p_search text default null,p_limit integer default 120)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_role text; v_branch uuid; v_limit int:=least(greatest(coalesce(p_limit,120),1),250); v_ag private.franchise_agreements_v1%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_role:=private.my_franchise_portal_role_v1(p_merchant_id);
  if v_role is null then raise exception using errcode='42501',message='FRANCHISE_PORTAL_ACCESS_DENIED'; end if;
  select * into v_ag from private.franchise_agreements_v1 a where a.merchant_id=p_merchant_id and a.is_current and a.status='active' and a.starts_on<=current_date and (a.ends_on is null or a.ends_on>=current_date) limit 1;
  if v_ag.id is null then raise exception using errcode='42501',message='FRANCHISE_AGREEMENT_INACTIVE'; end if;
  if p_branch_id is not null then perform private.assert_franchise_portal_branch_v1(p_merchant_id,p_branch_id); v_branch:=p_branch_id;
  else select b.id into v_branch from public.branches b where b.merchant_id=p_merchant_id order by b.active desc,b.created_at limit 1; end if;
  if v_branch is null then raise exception using errcode='P0002',message='FRANCHISE_BRANCH_NOT_FOUND'; end if;
  return jsonb_build_object(
    'merchant_id',p_merchant_id,'role',v_role,'selected_branch_id',v_branch,
    'agreement',jsonb_build_object('pricing_policy',v_ag.pricing_policy,'catalog_policy',v_ag.catalog_policy,'promotion_policy',v_ag.promotion_policy,'can_manage_inventory',v_ag.can_manage_inventory,'max_discount_percentage',v_ag.max_discount_percentage,'requires_order_approval',v_ag.requires_order_approval),
    'branches',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'code',b.code,'active',b.active,'address',b.address,'phone',b.phone,'email',b.email,'opens_at',b.opens_at,'closes_at',b.closes_at,'delivery_fee',b.delivery_fee,'min_order_amount',b.min_order_amount,'estimated_delivery_minutes',b.estimated_delivery_minutes) order by b.name) from public.branches b where b.merchant_id=p_merchant_id),'[]'::jsonb),
    'products',coalesce((select jsonb_agg(jsonb_build_object('listing_id',ml.id,'product_id',p.id,'name',p.name,'barcode',p.barcode,'image_urls',p.image_urls,'listing_status',ml.status,'customer_enabled',ml.marketplace_customer_enabled,'sale_price',bp.sale_price,'offer_price',bp.offer_price,'is_offer',coalesce(bp.is_offer,false),'quantity',coalesce(i.quantity,0),'min_stock_level',coalesce(i.min_stock_level,0),'alert_enabled',coalesce(i.alert_enabled,false)) order by p.name)
      from public.merchant_listings ml join public.products p on p.id=ml.product_id
      left join public.branches b on b.id=ml.branch_id
      left join public.branch_product_pricing bp on bp.branch_id=b.pricing_source_branch_id and bp.product_id=ml.product_id
      left join public.inventory i on i.branch_id=b.inventory_source_branch_id and i.product_id=ml.product_id
      where ml.merchant_id=p_merchant_id and ml.branch_id=v_branch and (p_search is null or btrim(p_search)='' or p.name ilike '%'||btrim(p_search)||'%' or coalesce(p.barcode,'') ilike '%'||btrim(p_search)||'%') limit v_limit),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'status',o.status,'total',o.total,'payment_status',o.payment_status,'payment_method',o.payment_method,'items',o.items,'created_at',o.created_at,'updated_at',o.updated_at) order by o.created_at desc) from (select * from public.online_orders x where x.merchant_id=p_merchant_id and x.branch_id=v_branch order by x.created_at desc limit 60) o),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'request_type',r.request_type,'status',r.status,'product_id',r.product_id,'order_id',r.order_id,'payload',r.payload,'task_id',r.task_id,'decision_note',r.decision_note,'created_at',r.created_at,'decided_at',r.decided_at,'applied_at',r.applied_at) order by r.created_at desc) from (select * from private.franchise_operation_requests_v1 x where x.merchant_id=p_merchant_id and x.branch_id=v_branch order by x.created_at desc limit 80) r),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_franchise_operations_workspace_v1(uuid,uuid,text,integer) from public,anon;
grant execute on function public.get_franchise_operations_workspace_v1(uuid,uuid,text,integer) to authenticated,service_role;

create or replace function public.search_franchise_catalog_v1(p_merchant_id uuid,p_branch_id uuid,p_search text,p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_limit int:=least(greatest(coalesce(p_limit,30),1),60);
begin
  perform private.assert_franchise_portal_branch_v1(p_merchant_id,p_branch_id);
  if nullif(btrim(coalesce(p_search,'')),'') is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('product_id',p.id,'name',p.name,'barcode',p.barcode,'image_urls',p.image_urls,'default_price',p.price,'already_listed',exists(select 1 from public.merchant_listings ml where ml.merchant_id=p_merchant_id and ml.branch_id=p_branch_id and ml.product_id=p.id)) order by p.name)
    from public.products p where p.archived_at is null and (p.name ilike '%'||btrim(p_search)||'%' or coalesce(p.barcode,'') ilike '%'||btrim(p_search)||'%') limit v_limit),'[]'::jsonb);
end;
$$;
revoke all on function public.search_franchise_catalog_v1(uuid,uuid,text,integer) from public,anon;
grant execute on function public.search_franchise_catalog_v1(uuid,uuid,text,integer) to authenticated,service_role;

create or replace function public.adjust_franchise_inventory_v1(p_request_id uuid,p_merchant_id uuid,p_branch_id uuid,p_product_id uuid,p_delta numeric,p_reason_code text,p_note text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_ag private.franchise_agreements_v1%rowtype; v_source uuid; v_before numeric; v_after numeric; v_existing private.franchise_operation_requests_v1%rowtype; v_payload jsonb; v_tenant uuid;
begin
  perform private.assert_franchise_portal_branch_v1(p_merchant_id,p_branch_id);
  if p_request_id is null then raise exception using errcode='22023',message='REQUEST_ID_REQUIRED'; end if;
  if p_delta is null or p_delta=0 or p_delta::text in ('NaN','Infinity','-Infinity') or round(p_delta,3)<>p_delta or abs(p_delta)>1000000000 then raise exception using errcode='22023',message='INVALID_STOCK_CHANGE'; end if;
  if length(btrim(coalesce(p_note,'')))<3 then raise exception using errcode='22023',message='INVENTORY_ADJUSTMENT_NOTE_REQUIRED'; end if;
  select * into v_ag from private.franchise_agreements_v1 a where a.merchant_id=p_merchant_id and a.is_current and a.status='active' limit 1;
  if not coalesce(v_ag.can_manage_inventory,false) then raise exception using errcode='42501',message='FRANCHISE_INVENTORY_MANAGE_DENIED'; end if;
  if not exists(select 1 from public.merchant_listings ml where ml.merchant_id=p_merchant_id and ml.branch_id=p_branch_id and ml.product_id=p_product_id and ml.status in ('active','paused','draft')) then raise exception using errcode='42501',message='FRANCHISE_PRODUCT_NOT_LISTED'; end if;
  select b.inventory_source_branch_id,b.tenant_id into v_source,v_tenant from public.branches b where b.id=p_branch_id and b.merchant_id=p_merchant_id;
  if not exists(select 1 from public.branches s where s.id=v_source and s.merchant_id=p_merchant_id) then raise exception using errcode='42501',message='FRANCHISE_SHARED_INVENTORY_MANAGED_CENTRALLY'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,1701));
  select * into v_existing from private.franchise_operation_requests_v1 where id=p_request_id;
  if v_existing.id is not null then
    if v_existing.merchant_id<>p_merchant_id or v_existing.branch_id<>p_branch_id or v_existing.product_id is distinct from p_product_id or coalesce((v_existing.payload->>'delta')::numeric,0)<>p_delta then raise exception using errcode='42501',message='REQUEST_CONFLICT'; end if;
    return jsonb_build_object('mode','applied','request_id',v_existing.id,'quantity_before',(v_existing.payload->>'quantity_before')::numeric,'quantity_after',(v_existing.payload->>'quantity_after')::numeric,'quantity_delta',p_delta,'idempotent',true);
  end if;
  insert into public.inventory(product_id,branch_id,quantity) values(p_product_id,v_source,0) on conflict(product_id,branch_id) do nothing;
  select i.quantity into v_before from public.inventory i where i.product_id=p_product_id and i.branch_id=v_source for update;
  if v_before+p_delta<0 then raise exception using errcode='22023',message='INSUFFICIENT_STOCK'; end if;
  perform set_config('app.inventory_movement_source','franchise_portal_adjustment',true);
  perform set_config('app.inventory_reason_code',left(lower(btrim(coalesce(p_reason_code,'other'))),80),true);
  perform set_config('app.inventory_note',left(btrim(p_note),500),true);
  perform set_config('app.inventory_request_id',p_request_id::text,true);
  update public.inventory set quantity=quantity+p_delta where product_id=p_product_id and branch_id=v_source returning quantity into v_after;
  v_payload:=jsonb_build_object('delta',p_delta,'reason_code',lower(btrim(coalesce(p_reason_code,'other'))),'note',btrim(p_note),'quantity_before',v_before,'quantity_after',v_after,'inventory_source_branch_id',v_source);
  insert into private.franchise_operation_requests_v1(id,tenant_id,merchant_id,branch_id,request_type,product_id,payload,status,requested_by,applied_at)
  values(p_request_id,v_tenant,p_merchant_id,p_branch_id,'inventory_adjustment',p_product_id,v_payload,'applied',auth.uid(),now());
  return jsonb_build_object('mode','applied','request_id',p_request_id,'quantity_before',v_before,'quantity_after',v_after,'quantity_delta',p_delta,'idempotent',false);
end;
$$;
revoke all on function public.adjust_franchise_inventory_v1(uuid,uuid,uuid,uuid,numeric,text,text) from public,anon;
grant execute on function public.adjust_franchise_inventory_v1(uuid,uuid,uuid,uuid,numeric,text,text) to authenticated,service_role;

create or replace function public.set_franchise_price_v1(p_merchant_id uuid,p_branch_id uuid,p_product_id uuid,p_sale_price numeric,p_offer_price numeric default null,p_is_offer boolean default false,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_ag private.franchise_agreements_v1%rowtype; v_source uuid; v_purchase numeric; v_discount numeric:=0; v_requires boolean:=false; v_payload jsonb;
begin
  perform private.assert_franchise_portal_branch_v1(p_merchant_id,p_branch_id);
  if p_sale_price is null or p_sale_price<=0 or p_sale_price::text in ('NaN','Infinity','-Infinity') then raise exception using errcode='22023',message='INVALID_SALE_PRICE'; end if;
  if coalesce(p_is_offer,false) then
    if p_offer_price is null or p_offer_price<=0 or p_offer_price>=p_sale_price then raise exception using errcode='22023',message='INVALID_OFFER_PRICE'; end if;
    v_discount:=round((p_sale_price-p_offer_price)*100/p_sale_price,4);
  end if;
  select * into v_ag from private.franchise_agreements_v1 a where a.merchant_id=p_merchant_id and a.is_current and a.status='active' limit 1;
  if v_ag.pricing_policy='central' then v_requires:=true; end if;
  if coalesce(p_is_offer,false) and v_ag.promotion_policy<>'independent' then v_requires:=true; end if;
  if coalesce(p_is_offer,false) and v_discount>coalesce(v_ag.max_discount_percentage,0) then v_requires:=true; end if;
  if not exists(select 1 from public.merchant_listings ml where ml.merchant_id=p_merchant_id and ml.branch_id=p_branch_id and ml.product_id=p_product_id and ml.status in ('active','paused','draft')) then raise exception using errcode='42501',message='FRANCHISE_PRODUCT_NOT_LISTED'; end if;
  select b.pricing_source_branch_id into v_source from public.branches b where b.id=p_branch_id and b.merchant_id=p_merchant_id;
  if not exists(select 1 from public.branches s where s.id=v_source and s.merchant_id=p_merchant_id) then raise exception using errcode='42501',message='FRANCHISE_SHARED_PRICING_MANAGED_CENTRALLY'; end if;
  v_payload:=jsonb_build_object('sale_price',p_sale_price,'offer_price',p_offer_price,'is_offer',coalesce(p_is_offer,false),'discount_percentage',v_discount,'pricing_source_branch_id',v_source,'note',nullif(btrim(coalesce(p_note,'')),''));
  if v_requires then
    return private.create_franchise_operation_request_v1(p_merchant_id,p_branch_id,'price_change',p_product_id,null,v_payload,'مراجعة تسعير Franchise','طلب تعديل سعر/عرض يحتاج موافقة حسب عقد الـFranchise','high');
  end if;
  select coalesce(p.purchase_price,0) into v_purchase from public.products p where p.id=p_product_id;
  if v_purchase is null then raise exception using errcode='P0002',message='PRODUCT_NOT_FOUND'; end if;
  insert into public.branch_product_pricing(branch_id,product_id,sale_price,purchase_price,offer_price,is_offer)
  values(v_source,p_product_id,p_sale_price,v_purchase,case when p_is_offer then p_offer_price else null end,coalesce(p_is_offer,false))
  on conflict(branch_id,product_id) do update set sale_price=excluded.sale_price,offer_price=excluded.offer_price,is_offer=excluded.is_offer,updated_at=now();
  return jsonb_build_object('mode','applied','product_id',p_product_id,'sale_price',p_sale_price,'offer_price',case when p_is_offer then p_offer_price else null end,'is_offer',coalesce(p_is_offer,false));
end;
$$;
revoke all on function public.set_franchise_price_v1(uuid,uuid,uuid,numeric,numeric,boolean,text) from public,anon;
grant execute on function public.set_franchise_price_v1(uuid,uuid,uuid,numeric,numeric,boolean,text) to authenticated,service_role;

create or replace function public.request_franchise_catalog_change_v1(p_merchant_id uuid,p_branch_id uuid,p_product_id uuid,p_action text,p_sale_price numeric default null,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_ag private.franchise_agreements_v1%rowtype; v_action text:=lower(btrim(coalesce(p_action,''))); v_payload jsonb;
begin
  perform private.assert_franchise_portal_branch_v1(p_merchant_id,p_branch_id);
  if v_action not in ('add','remove') then raise exception using errcode='22023',message='INVALID_CATALOG_ACTION'; end if;
  if not exists(select 1 from public.products p where p.id=p_product_id and p.archived_at is null) then raise exception using errcode='P0002',message='PRODUCT_NOT_FOUND'; end if;
  if v_action='add' and (p_sale_price is null or p_sale_price<=0) then raise exception using errcode='22023',message='CATALOG_SALE_PRICE_REQUIRED'; end if;
  select * into v_ag from private.franchise_agreements_v1 a where a.merchant_id=p_merchant_id and a.is_current and a.status='active' limit 1;
  v_payload:=jsonb_build_object('action',v_action,'sale_price',p_sale_price,'note',nullif(btrim(coalesce(p_note,'')),''));
  if v_ag.catalog_policy='independent' then
    if v_action='add' then
      insert into public.merchant_listings(tenant_id,merchant_id,branch_id,product_id,status,marketplace_customer_enabled,metadata)
      select b.tenant_id,p_merchant_id,p_branch_id,p_product_id,'active',false,jsonb_build_object('source','franchise_portal') from public.branches b where b.id=p_branch_id
      on conflict(merchant_id,branch_id,product_id) do update set status='active',updated_at=now();
      perform public.set_franchise_price_v1(p_merchant_id,p_branch_id,p_product_id,p_sale_price,null,false,p_note);
    else
      update public.merchant_listings set status='archived',marketplace_customer_enabled=false,updated_at=now() where merchant_id=p_merchant_id and branch_id=p_branch_id and product_id=p_product_id;
    end if;
    return jsonb_build_object('mode','applied','action',v_action,'product_id',p_product_id);
  end if;
  return private.create_franchise_operation_request_v1(p_merchant_id,p_branch_id,case when v_action='add' then 'catalog_add' else 'catalog_remove' end,p_product_id,null,v_payload,case when v_action='add' then 'إضافة منتج إلى Franchise' else 'إزالة منتج من Franchise' end,'طلب تعديل كتالوج Franchise يحتاج اعتماد المعداوي','normal');
end;
$$;
revoke all on function public.request_franchise_catalog_change_v1(uuid,uuid,uuid,text,numeric,text) from public,anon;
grant execute on function public.request_franchise_catalog_change_v1(uuid,uuid,uuid,text,numeric,text) to authenticated,service_role;

create or replace function public.request_franchise_branch_settings_v1(p_merchant_id uuid,p_branch_id uuid,p_settings jsonb,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_clean jsonb;
begin
  perform private.assert_franchise_portal_branch_v1(p_merchant_id,p_branch_id);
  if jsonb_typeof(coalesce(p_settings,'{}'::jsonb))<>'object' then raise exception using errcode='22023',message='INVALID_BRANCH_SETTINGS'; end if;
  if exists(select 1 from jsonb_object_keys(coalesce(p_settings,'{}'::jsonb)) k where k not in ('address','phone','email','opens_at','closes_at','delivery_fee','min_order_amount','estimated_delivery_minutes')) then raise exception using errcode='22023',message='UNSUPPORTED_BRANCH_SETTING'; end if;
  v_clean:=coalesce(p_settings,'{}'::jsonb)||jsonb_build_object('note',nullif(btrim(coalesce(p_note,'')),''));
  return private.create_franchise_operation_request_v1(p_merchant_id,p_branch_id,'branch_settings',null,null,v_clean,'مراجعة إعدادات فرع Franchise','طلب تعديل بيانات تشغيلية للفرع يحتاج اعتماد المعداوي','normal');
end;
$$;
revoke all on function public.request_franchise_branch_settings_v1(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.request_franchise_branch_settings_v1(uuid,uuid,jsonb,text) to authenticated,service_role;

create or replace function public.advance_franchise_order_v1(p_merchant_id uuid,p_order_id uuid,p_target_status text,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_order public.online_orders%rowtype; v_ag private.franchise_agreements_v1%rowtype; v_expected text; v_allowed text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_order from public.online_orders where id=p_order_id for update;
  if v_order.id is null or v_order.merchant_id<>p_merchant_id or v_order.branch_id is null then raise exception using errcode='P0002',message='FRANCHISE_ORDER_NOT_FOUND'; end if;
  perform private.assert_franchise_portal_branch_v1(p_merchant_id,v_order.branch_id);
  select * into v_ag from private.franchise_agreements_v1 a where a.merchant_id=p_merchant_id and a.is_current and a.status='active' limit 1;
  v_expected:=v_order.status::text;
  v_allowed:=case v_expected when 'pending' then 'confirmed' when 'confirmed' then 'preparing' when 'preparing' then 'ready' else null end;
  if p_target_status is null or p_target_status<>v_allowed then raise exception using errcode='22023',message='FRANCHISE_ORDER_TRANSITION_NOT_ALLOWED'; end if;
  if coalesce(v_ag.requires_order_approval,false) then
    return private.create_franchise_operation_request_v1(p_merchant_id,v_order.branch_id,'order_status',null,p_order_id,jsonb_build_object('expected_status',v_expected,'target_status',p_target_status,'note',nullif(btrim(coalesce(p_note,'')),'')),'مراجعة انتقال حالة طلب Franchise','طلب تشغيل يحتاج موافقة حسب عقد الـFranchise','high');
  end if;
  update public.online_orders set status=p_target_status::public.order_status,updated_at=now() where id=p_order_id and status::text=v_expected returning * into v_order;
  if v_order.id is null then raise exception using errcode='40001',message='ORDER_STATUS_CHANGED'; end if;
  return jsonb_build_object('mode','applied','order_id',p_order_id,'status',v_order.status,'updated_at',v_order.updated_at);
end;
$$;
revoke all on function public.advance_franchise_order_v1(uuid,uuid,text,text) from public,anon;
grant execute on function public.advance_franchise_order_v1(uuid,uuid,text,text) to authenticated,service_role;

create or replace function public.cancel_my_franchise_operation_request_v1(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_req private.franchise_operation_requests_v1%rowtype;
begin
  select * into v_req from private.franchise_operation_requests_v1 where id=p_request_id for update;
  if v_req.id is null then raise exception using errcode='P0002',message='FRANCHISE_OPERATION_REQUEST_NOT_FOUND'; end if;
  perform private.assert_franchise_portal_branch_v1(v_req.merchant_id,v_req.branch_id);
  if v_req.requested_by<>auth.uid() then raise exception using errcode='42501',message='FRANCHISE_OPERATION_REQUEST_OWNER_REQUIRED'; end if;
  if v_req.status='cancelled' then return to_jsonb(v_req); end if;
  if v_req.status<>'pending' then raise exception using errcode='55000',message='FRANCHISE_OPERATION_REQUEST_NOT_CANCELLABLE'; end if;
  update private.franchise_operation_requests_v1 set status='cancelled',updated_at=now() where id=v_req.id returning * into v_req;
  update public.operations_tasks set status='cancelled',updated_at=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('cancelled_by',auth.uid(),'cancelled_at',now()) where id=v_req.task_id and status in ('open','claimed','in_progress');
  return to_jsonb(v_req);
end;
$$;
revoke all on function public.cancel_my_franchise_operation_request_v1(uuid) from public,anon;
grant execute on function public.cancel_my_franchise_operation_request_v1(uuid) to authenticated,service_role;

do $$ begin
  if to_regprocedure('private.operations_task_can_claim_phase16_v1(text,uuid)') is null then
    alter function private.operations_task_can_claim(text,uuid) rename to operations_task_can_claim_phase16_v1;
  end if;
end $$;
create or replace function private.operations_task_can_claim(p_source_kind text,p_branch_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select case when p_source_kind='franchise_operation' then coalesce((select public.can_manage_business_structure_v1(b.tenant_id) from public.branches b where b.id=p_branch_id),false)
  else private.operations_task_can_claim_phase16_v1(p_source_kind,p_branch_id) end
$$;
revoke all on function private.operations_task_can_claim(text,uuid) from public,anon,authenticated;
grant execute on function private.operations_task_can_claim(text,uuid) to service_role;

do $$ begin
  if to_regprocedure('private.approval_center_is_review_task_phase16_v1(text)') is null then
    alter function private.approval_center_is_review_task_v1(text) rename to approval_center_is_review_task_phase16_v1;
  end if;
end $$;
create or replace function private.approval_center_is_review_task_v1(p_source_kind text)
returns boolean language sql immutable set search_path=''
as $$ select p_source_kind='franchise_operation' or private.approval_center_is_review_task_phase16_v1(p_source_kind) $$;

do $$ begin
  if to_regprocedure('private.approval_center_action_url_phase16_v1(text)') is null then
    alter function private.approval_center_action_url_v1(text) rename to approval_center_action_url_phase16_v1;
  end if;
end $$;
create or replace function private.approval_center_action_url_v1(p_source_kind text)
returns text language sql immutable set search_path=''
as $$ select case when p_source_kind='franchise_operation' then '/approvals' else private.approval_center_action_url_phase16_v1(p_source_kind) end $$;

create or replace function public.get_franchise_operation_request_v1(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_req private.franchise_operation_requests_v1%rowtype;
begin
  select * into v_req from private.franchise_operation_requests_v1 where id=p_request_id;
  if v_req.id is null then raise exception using errcode='P0002',message='FRANCHISE_OPERATION_REQUEST_NOT_FOUND'; end if;
  if not public.can_manage_business_structure_v1(v_req.tenant_id) and private.my_franchise_portal_role_v1(v_req.merchant_id) is null then raise exception using errcode='42501',message='FRANCHISE_OPERATION_ACCESS_DENIED'; end if;
  return to_jsonb(v_req)||jsonb_build_object('merchant_name',(select m.name from public.merchants m where m.id=v_req.merchant_id),'branch_name',(select b.name from public.branches b where b.id=v_req.branch_id),'product_name',(select p.name from public.products p where p.id=v_req.product_id));
end;
$$;
revoke all on function public.get_franchise_operation_request_v1(uuid) from public,anon;
grant execute on function public.get_franchise_operation_request_v1(uuid) to authenticated,service_role;

create or replace function public.decide_franchise_operation_v1(p_request_id uuid,p_decision text,p_note text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_req private.franchise_operation_requests_v1%rowtype; v_dec text:=lower(btrim(coalesce(p_decision,''))); v_note text:=btrim(coalesce(p_note,'')); v_purchase numeric; v_source uuid; v_expected text; v_target text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_req from private.franchise_operation_requests_v1 where id=p_request_id for update;
  if v_req.id is null then raise exception using errcode='P0002',message='FRANCHISE_OPERATION_REQUEST_NOT_FOUND'; end if;
  if not public.can_manage_business_structure_v1(v_req.tenant_id) then raise exception using errcode='42501',message='BUSINESS_STRUCTURE_MANAGER_REQUIRED'; end if;
  if v_dec not in ('approve','reject') then raise exception using errcode='22023',message='INVALID_DECISION'; end if;
  if length(v_note)<3 then raise exception using errcode='22023',message='DECISION_NOTE_REQUIRED'; end if;
  if v_req.status in ('applied','rejected') then return to_jsonb(v_req)||jsonb_build_object('idempotent',true); end if;
  if v_req.status<>'pending' then raise exception using errcode='55000',message='FRANCHISE_OPERATION_REQUEST_NOT_PENDING'; end if;

  if v_dec='reject' then
    update private.franchise_operation_requests_v1 set status='rejected',decided_by=auth.uid(),decided_at=now(),decision_note=v_note,updated_at=now() where id=v_req.id returning * into v_req;
  else
    begin
      if v_req.request_type='price_change' then
        select b.pricing_source_branch_id into v_source from public.branches b where b.id=v_req.branch_id;
        select coalesce(p.purchase_price,0) into v_purchase from public.products p where p.id=v_req.product_id;
        insert into public.branch_product_pricing(branch_id,product_id,sale_price,purchase_price,offer_price,is_offer)
        values(v_source,v_req.product_id,(v_req.payload->>'sale_price')::numeric,v_purchase,case when coalesce((v_req.payload->>'is_offer')::boolean,false) then (v_req.payload->>'offer_price')::numeric else null end,coalesce((v_req.payload->>'is_offer')::boolean,false))
        on conflict(branch_id,product_id) do update set sale_price=excluded.sale_price,offer_price=excluded.offer_price,is_offer=excluded.is_offer,updated_at=now();
      elsif v_req.request_type='catalog_add' then
        insert into public.merchant_listings(tenant_id,merchant_id,branch_id,product_id,status,marketplace_customer_enabled,metadata)
        values(v_req.tenant_id,v_req.merchant_id,v_req.branch_id,v_req.product_id,'active',false,jsonb_build_object('source','franchise_approval','request_id',v_req.id))
        on conflict(merchant_id,branch_id,product_id) do update set status='active',updated_at=now();
        select b.pricing_source_branch_id into v_source from public.branches b where b.id=v_req.branch_id;
        select coalesce(p.purchase_price,0) into v_purchase from public.products p where p.id=v_req.product_id;
        insert into public.branch_product_pricing(branch_id,product_id,sale_price,purchase_price,offer_price,is_offer)
        values(v_source,v_req.product_id,(v_req.payload->>'sale_price')::numeric,v_purchase,null,false)
        on conflict(branch_id,product_id) do update set sale_price=excluded.sale_price,updated_at=now();
        insert into public.inventory(product_id,branch_id,quantity)
        select v_req.product_id,b.inventory_source_branch_id,0 from public.branches b where b.id=v_req.branch_id
        on conflict(product_id,branch_id) do nothing;
      elsif v_req.request_type='catalog_remove' then
        update public.merchant_listings set status='archived',marketplace_customer_enabled=false,updated_at=now() where merchant_id=v_req.merchant_id and branch_id=v_req.branch_id and product_id=v_req.product_id;
      elsif v_req.request_type='branch_settings' then
        update public.branches b set
          address=case when v_req.payload ? 'address' then nullif(btrim(v_req.payload->>'address'),'') else b.address end,
          phone=case when v_req.payload ? 'phone' then nullif(btrim(v_req.payload->>'phone'),'') else b.phone end,
          email=case when v_req.payload ? 'email' then nullif(btrim(v_req.payload->>'email'),'') else b.email end,
          opens_at=case when v_req.payload ? 'opens_at' and nullif(v_req.payload->>'opens_at','') is not null then (v_req.payload->>'opens_at')::time else b.opens_at end,
          closes_at=case when v_req.payload ? 'closes_at' and nullif(v_req.payload->>'closes_at','') is not null then (v_req.payload->>'closes_at')::time else b.closes_at end,
          delivery_fee=case when v_req.payload ? 'delivery_fee' then greatest((v_req.payload->>'delivery_fee')::numeric,0) else b.delivery_fee end,
          min_order_amount=case when v_req.payload ? 'min_order_amount' then greatest((v_req.payload->>'min_order_amount')::numeric,0) else b.min_order_amount end,
          estimated_delivery_minutes=case when v_req.payload ? 'estimated_delivery_minutes' then greatest((v_req.payload->>'estimated_delivery_minutes')::integer,1) else b.estimated_delivery_minutes end,
          updated_at=now()
        where b.id=v_req.branch_id and b.merchant_id=v_req.merchant_id;
      elsif v_req.request_type='order_status' then
        v_expected:=v_req.payload->>'expected_status'; v_target:=v_req.payload->>'target_status';
        update public.online_orders set status=v_target::public.order_status,updated_at=now() where id=v_req.order_id and merchant_id=v_req.merchant_id and branch_id=v_req.branch_id and status::text=v_expected;
        if not found then raise exception using errcode='40001',message='ORDER_STATUS_CHANGED'; end if;
      else
        raise exception using errcode='22023',message='UNSUPPORTED_FRANCHISE_OPERATION';
      end if;
      update private.franchise_operation_requests_v1 set status='applied',decided_by=auth.uid(),decided_at=now(),decision_note=v_note,applied_at=now(),updated_at=now(),error_code=null where id=v_req.id returning * into v_req;
    exception when others then
      update private.franchise_operation_requests_v1 set status='failed',decided_by=auth.uid(),decided_at=now(),decision_note=v_note,error_code=left(sqlstate||':'||sqlerrm,240),updated_at=now() where id=v_req.id returning * into v_req;
      raise;
    end;
  end if;

  update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),failure_reason=null,metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('decision',v_dec,'resolution_note',v_note,'resolved_at',now(),'resolved_by',auth.uid()) where id=v_req.task_id;
  insert into public.operations_task_events(task_id,event_type,actor_id,note) select v_req.task_id,'completed',auth.uid(),v_note where v_req.task_id is not null;
  return to_jsonb(v_req)||jsonb_build_object('decision',v_dec,'idempotent',false);
end;
$$;
revoke all on function public.decide_franchise_operation_v1(uuid,text,text) from public,anon;
grant execute on function public.decide_franchise_operation_v1(uuid,text,text) to authenticated,service_role;
