-- Phase 8: Marketplace onboarding readiness and internal approval.
-- Approval is intentionally NOT customer publication. Partner branches stay inactive,
-- delivery stays disabled, and listings stay draft until the customer marketplace phase.

begin;

alter table public.merchants
  add column if not exists marketplace_approved_at timestamptz,
  add column if not exists marketplace_approved_by uuid references auth.users(id) on delete set null,
  add column if not exists customer_published_at timestamptz;

create index if not exists idx_merchants_marketplace_approval
  on public.merchants (tenant_id, marketplace_approved_at, customer_published_at);

create or replace function private.marketplace_merchant_readiness_v1(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchants%rowtype;
  v_branch_count integer;
  v_branch_profile_ready integer;
  v_branch_zone_ready integer;
  v_listing_count integer;
  v_valid_listing_count integer;
  v_rule_count integer;
  v_missing jsonb := '[]'::jsonb;
  v_ready boolean;
begin
  select * into v_merchant from public.merchants m where m.id=p_merchant_id;
  if v_merchant.id is null then raise exception 'merchant_not_found'; end if;

  select count(*),
    count(*) filter (
      where nullif(trim(coalesce(b.name,'')), '') is not null
        and nullif(trim(coalesce(b.code,'')), '') is not null
        and nullif(trim(coalesce(b.address,'')), '') is not null
    ),
    count(*) filter (
      where exists (
        select 1 from public.branch_delivery_zones z
        where z.branch_id=b.id and coalesce(z.is_active,true)
      )
    )
  into v_branch_count,v_branch_profile_ready,v_branch_zone_ready
  from public.branches b where b.merchant_id=p_merchant_id;

  select count(*),
    count(*) filter (
      where exists (
        select 1 from public.branch_product_pricing bp
        where bp.branch_id=ml.branch_id and bp.product_id=ml.product_id
          and bp.sale_price>=0 and bp.purchase_price>=0
      )
      and exists (
        select 1 from public.inventory i
        where i.branch_id=ml.branch_id and i.product_id=ml.product_id and i.quantity>=0
      )
    )
  into v_listing_count,v_valid_listing_count
  from public.merchant_listings ml
  where ml.merchant_id=p_merchant_id and ml.status in ('draft','active','paused');

  select count(*) into v_rule_count
  from public.merchant_commission_rules r
  where r.tenant_id=v_merchant.tenant_id
    and r.is_active
    and r.effective_from<=now()
    and (r.effective_to is null or r.effective_to>now())
    and (r.merchant_id=p_merchant_id or r.merchant_id is null);

  if nullif(trim(coalesce(v_merchant.name,'')), '') is null then
    v_missing := v_missing || jsonb_build_array('merchant_name');
  end if;

  if v_merchant.merchant_type in ('partner','franchise')
     and nullif(trim(coalesce(v_merchant.phone,'')), '') is null
     and nullif(trim(coalesce(v_merchant.email,'')), '') is null then
    v_missing := v_missing || jsonb_build_array('merchant_contact');
  end if;

  if v_branch_count=0 then
    v_missing := v_missing || jsonb_build_array('branch');
  elsif v_branch_profile_ready<>v_branch_count then
    v_missing := v_missing || jsonb_build_array('branch_profile');
  end if;

  if v_branch_count>0 and v_branch_zone_ready<>v_branch_count then
    v_missing := v_missing || jsonb_build_array('delivery_zone');
  end if;

  if v_merchant.merchant_type in ('partner','franchise') and v_rule_count=0 then
    v_missing := v_missing || jsonb_build_array('commission_rule');
  end if;

  if v_listing_count=0 then
    v_missing := v_missing || jsonb_build_array('listing');
  elsif v_valid_listing_count<>v_listing_count then
    v_missing := v_missing || jsonb_build_array('listing_pricing_inventory');
  end if;

  v_ready := jsonb_array_length(v_missing)=0;

  return jsonb_build_object(
    'merchant_id',v_merchant.id,
    'tenant_id',v_merchant.tenant_id,
    'merchant_type',v_merchant.merchant_type,
    'merchant_status',v_merchant.status,
    'approved_at',v_merchant.marketplace_approved_at,
    'customer_published_at',v_merchant.customer_published_at,
    'ready_for_approval',v_ready,
    'missing',v_missing,
    'checks',jsonb_build_object(
      'merchant_contact',(
        v_merchant.merchant_type='owned'
        or nullif(trim(coalesce(v_merchant.phone,'')), '') is not null
        or nullif(trim(coalesce(v_merchant.email,'')), '') is not null
      ),
      'branch_count',v_branch_count,
      'branch_profiles_ready',v_branch_profile_ready,
      'branches_with_active_delivery_zone',v_branch_zone_ready,
      'listing_count',v_listing_count,
      'valid_listing_count',v_valid_listing_count,
      'active_commission_rule_count',v_rule_count
    )
  );
end;
$$;

revoke all on function private.marketplace_merchant_readiness_v1(uuid) from public;
revoke all on function private.marketplace_merchant_readiness_v1(uuid) from anon;
revoke all on function private.marketplace_merchant_readiness_v1(uuid) from authenticated;
grant usage on schema private to authenticated;

create or replace function public.get_marketplace_merchant_detail_v1(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_merchant jsonb;
  v_branches jsonb;
  v_listings jsonb;
  v_rules jsonb;
  v_settlements jsonb;
  v_readiness jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select m.tenant_id into v_tenant_id from public.merchants m where m.id=p_merchant_id;
  if v_tenant_id is null then raise exception 'merchant_not_found'; end if;
  if not public.can_manage_tenant_marketplace_v1(v_tenant_id) then raise exception 'MARKETPLACE_ACCESS_DENIED'; end if;

  select jsonb_build_object(
    'id',m.id,'tenant_id',m.tenant_id,'code',m.code,'name',m.name,
    'merchant_type',m.merchant_type,'status',m.status,'contact_name',m.contact_name,
    'phone',m.phone,'email',m.email,'metadata',m.metadata,
    'marketplace_approved_at',m.marketplace_approved_at,'customer_published_at',m.customer_published_at,
    'created_at',m.created_at
  ) into v_merchant
  from public.merchants m where m.id=p_merchant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'name',b.name,'code',b.code,'address',b.address,'phone',b.phone,'email',b.email,
    'active',b.active,'delivery_enabled',b.delivery_enabled,'latitude',b.latitude,'longitude',b.longitude,
    'delivery_radius_km',b.delivery_radius_km,'delivery_fee',b.delivery_fee,'min_order_amount',b.min_order_amount,
    'estimated_delivery_minutes',b.estimated_delivery_minutes,'opens_at',b.opens_at,'closes_at',b.closes_at,
    'active_delivery_zone_count',(select count(*) from public.branch_delivery_zones z where z.branch_id=b.id and coalesce(z.is_active,true))
  ) order by b.created_at),'[]'::jsonb)
  into v_branches from public.branches b where b.merchant_id=p_merchant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',ml.id,'branch_id',ml.branch_id,'branch_name',b.name,'product_id',p.id,'product_name',p.name,
    'barcode',p.barcode,'image_url',case when cardinality(p.image_urls)>0 then p.image_urls[1] else null end,
    'merchant_sku',ml.merchant_sku,'status',ml.status,'preparation_minutes',ml.preparation_minutes,
    'sale_price',bp.sale_price,'purchase_price',bp.purchase_price,'offer_price',bp.offer_price,
    'is_offer',coalesce(bp.is_offer,false),'quantity',i.quantity,'created_at',ml.created_at
  ) order by ml.created_at desc),'[]'::jsonb)
  into v_listings
  from public.merchant_listings ml
  join public.products p on p.id=ml.product_id
  join public.branches b on b.id=ml.branch_id
  left join public.branch_product_pricing bp on bp.branch_id=ml.branch_id and bp.product_id=ml.product_id
  left join public.inventory i on i.branch_id=ml.branch_id and i.product_id=ml.product_id
  where ml.merchant_id=p_merchant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'name',r.name,'commission_percent',r.commission_percent,'fixed_fee',r.fixed_fee,
    'calculation_basis',r.calculation_basis,'priority',r.priority,'effective_from',r.effective_from,
    'effective_to',r.effective_to,'is_active',r.is_active
  ) order by r.priority desc,r.created_at desc),'[]'::jsonb)
  into v_rules
  from public.merchant_commission_rules r
  where r.tenant_id=v_tenant_id and (r.merchant_id=p_merchant_id or r.merchant_id is null);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'reference',s.reference,'status',s.status,'gross_credits',s.gross_credits,
    'total_deductions',s.total_deductions,'net_payable',s.net_payable,'currency',s.currency,
    'period_start',s.period_start,'period_end',s.period_end,'created_at',s.created_at,'paid_at',s.paid_at
  ) order by s.created_at desc),'[]'::jsonb)
  into v_settlements from public.merchant_settlements s where s.merchant_id=p_merchant_id;

  v_readiness := private.marketplace_merchant_readiness_v1(p_merchant_id);

  return jsonb_build_object(
    'merchant',v_merchant,'branches',v_branches,'listings',v_listings,
    'commission_rules',v_rules,'settlements',v_settlements,'readiness',v_readiness,'generated_at',now()
  );
end;
$$;

revoke all on function public.get_marketplace_merchant_detail_v1(uuid) from public;
revoke all on function public.get_marketplace_merchant_detail_v1(uuid) from anon;
grant execute on function public.get_marketplace_merchant_detail_v1(uuid) to authenticated;

create or replace function public.upsert_marketplace_commission_rule_v1(
  p_merchant_id uuid,p_name text,p_commission_percent numeric,p_fixed_fee numeric default 0,
  p_calculation_basis text default 'merchandise_subtotal',p_effective_from timestamptz default now(),p_priority integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_rule_id uuid;
begin
  select m.tenant_id into v_tenant_id from public.merchants m where m.id=p_merchant_id;
  if v_tenant_id is null then raise exception 'merchant_not_found'; end if;
  if not public.can_manage_tenant_marketplace_v1(v_tenant_id) then raise exception 'MARKETPLACE_ACCESS_DENIED'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'commission_rule_name_required'; end if;
  if p_commission_percent<0 or p_commission_percent>100 then raise exception 'invalid_commission_percent'; end if;
  if p_fixed_fee<0 then raise exception 'invalid_fixed_fee'; end if;
  if p_calculation_basis not in ('merchandise_subtotal','order_total','net_after_discounts') then raise exception 'invalid_calculation_basis'; end if;

  update public.merchant_commission_rules
  set is_active=false,effective_to=coalesce(effective_to,p_effective_from),updated_at=now()
  where merchant_id=p_merchant_id and is_active and effective_from<p_effective_from
    and (effective_to is null or effective_to>p_effective_from);

  insert into public.merchant_commission_rules(
    tenant_id,merchant_id,name,commission_percent,fixed_fee,calculation_basis,priority,effective_from,is_active,metadata
  ) values (
    v_tenant_id,p_merchant_id,trim(p_name),p_commission_percent,p_fixed_fee,p_calculation_basis,p_priority,p_effective_from,true,
    jsonb_build_object('source','marketplace_admin_v1')
  ) returning id into v_rule_id;

  return jsonb_build_object('rule_id',v_rule_id,'merchant_id',p_merchant_id,'active',true);
end;
$$;

revoke all on function public.upsert_marketplace_commission_rule_v1(uuid,text,numeric,numeric,text,timestamptz,integer) from public;
revoke all on function public.upsert_marketplace_commission_rule_v1(uuid,text,numeric,numeric,text,timestamptz,integer) from anon;
grant execute on function public.upsert_marketplace_commission_rule_v1(uuid,text,numeric,numeric,text,timestamptz,integer) to authenticated;

create or replace function public.search_marketplace_product_master_v1(p_merchant_id uuid,p_query text default '',p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit,30),1),100);
begin
  select m.tenant_id into v_tenant_id from public.merchants m where m.id=p_merchant_id;
  if v_tenant_id is null then raise exception 'merchant_not_found'; end if;
  if not public.can_manage_tenant_marketplace_v1(v_tenant_id) then raise exception 'MARKETPLACE_ACCESS_DENIED'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.name,'barcode',p.barcode,
      'image_url',case when cardinality(p.image_urls)>0 then p.image_urls[1] else null end,
      'default_sale_price',p.price,'default_purchase_price',p.purchase_price,'unit_of_measure',p.unit_of_measure,
      'main_category_id',p.main_category_id,
      'already_listed',exists(select 1 from public.merchant_listings ml where ml.merchant_id=p_merchant_id and ml.product_id=p.id)
    ) order by p.name)
    from (
      select p.* from public.products p
      where p.archived_at is null
        and (nullif(trim(coalesce(p_query,'')),'') is null or p.name ilike '%'||trim(p_query)||'%' or coalesce(p.barcode,'') ilike '%'||trim(p_query)||'%')
      order by p.name limit v_limit
    ) p
  ),'[]'::jsonb);
end;
$$;

revoke all on function public.search_marketplace_product_master_v1(uuid,text,integer) from public;
revoke all on function public.search_marketplace_product_master_v1(uuid,text,integer) from anon;
grant execute on function public.search_marketplace_product_master_v1(uuid,text,integer) to authenticated;

create or replace function public.update_marketplace_branch_profile_v1(
  p_merchant_id uuid,p_branch_id uuid,p_address text,p_phone text default null,p_email text default null,
  p_latitude double precision default null,p_longitude double precision default null,p_delivery_fee numeric default 0,
  p_min_order_amount numeric default 0,p_estimated_delivery_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
begin
  select m.tenant_id into v_tenant_id from public.merchants m where m.id=p_merchant_id;
  if v_tenant_id is null then raise exception 'merchant_not_found'; end if;
  if not public.can_manage_tenant_marketplace_v1(v_tenant_id) then raise exception 'MARKETPLACE_ACCESS_DENIED'; end if;
  if nullif(trim(coalesce(p_address,'')),'') is null then raise exception 'branch_address_required'; end if;
  if p_delivery_fee<0 or p_min_order_amount<0 then raise exception 'negative_delivery_value_not_allowed'; end if;
  if p_estimated_delivery_minutes is not null and p_estimated_delivery_minutes<=0 then raise exception 'invalid_delivery_minutes'; end if;

  update public.branches b
  set address=trim(p_address),phone=nullif(trim(coalesce(p_phone,'')),''),email=nullif(trim(coalesce(p_email,'')),''),
      latitude=p_latitude,longitude=p_longitude,delivery_fee=p_delivery_fee,min_order_amount=p_min_order_amount,
      estimated_delivery_minutes=p_estimated_delivery_minutes,updated_at=now()
  where b.id=p_branch_id and b.merchant_id=p_merchant_id and b.tenant_id=v_tenant_id;

  if not found then raise exception 'branch_does_not_belong_to_merchant'; end if;
  return jsonb_build_object('branch_id',p_branch_id,'updated',true);
end;
$$;

revoke all on function public.update_marketplace_branch_profile_v1(uuid,uuid,text,text,text,double precision,double precision,numeric,numeric,integer) from public;
revoke all on function public.update_marketplace_branch_profile_v1(uuid,uuid,text,text,text,double precision,double precision,numeric,numeric,integer) from anon;
grant execute on function public.update_marketplace_branch_profile_v1(uuid,uuid,text,text,text,double precision,double precision,numeric,numeric,integer) to authenticated;

create or replace function public.approve_marketplace_merchant_v1(p_merchant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_type text;
  v_readiness jsonb;
begin
  select m.tenant_id,m.merchant_type into v_tenant_id,v_type from public.merchants m where m.id=p_merchant_id;
  if v_tenant_id is null then raise exception 'merchant_not_found'; end if;
  if not public.can_manage_tenant_marketplace_v1(v_tenant_id) then raise exception 'MARKETPLACE_ACCESS_DENIED'; end if;
  if v_type='owned' then raise exception 'owned_merchant_does_not_require_marketplace_approval'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_merchant_id::text,1));
  v_readiness := private.marketplace_merchant_readiness_v1(p_merchant_id);
  if not coalesce((v_readiness->>'ready_for_approval')::boolean,false) then
    raise exception 'MARKETPLACE_NOT_READY:%',v_readiness->'missing';
  end if;

  update public.merchants
  set status='active',marketplace_approved_at=now(),marketplace_approved_by=auth.uid(),customer_published_at=null,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('onboarding_status','approved','customer_publishing',false,'approved_at',now()),
      updated_at=now()
  where id=p_merchant_id;

  update public.branches set active=false,delivery_enabled=false,updated_at=now() where merchant_id=p_merchant_id;
  update public.merchant_listings set status=case when status='archived' then status else 'draft' end,updated_at=now() where merchant_id=p_merchant_id;

  return jsonb_build_object(
    'merchant_id',p_merchant_id,'approved',true,'customer_published',false,
    'branches_active',false,'delivery_enabled',false,'readiness',v_readiness
  );
end;
$$;

revoke all on function public.approve_marketplace_merchant_v1(uuid) from public;
revoke all on function public.approve_marketplace_merchant_v1(uuid) from anon;
grant execute on function public.approve_marketplace_merchant_v1(uuid) to authenticated;

commit;
