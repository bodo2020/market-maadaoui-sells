create table if not exists private.franchise_profiles_v1 (
  merchant_id uuid primary key,
  tenant_id uuid not null,
  legal_entity_name text not null,
  commercial_registration text,
  tax_registration text,
  contact_name text,
  phone text,
  email text,
  territory_name text,
  territory_scope jsonb not null default '[]'::jsonb,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint franchise_profiles_merchant_tenant_fkey foreign key (merchant_id, tenant_id)
    references public.merchants(id, tenant_id) on delete cascade,
  constraint franchise_profiles_legal_name_check check (nullif(btrim(legal_entity_name),'') is not null),
  constraint franchise_profiles_territory_scope_check check (jsonb_typeof(territory_scope) in ('array','object'))
);

create table if not exists private.franchise_agreements_v1 (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  merchant_id uuid not null,
  agreement_code text not null,
  version integer not null default 1,
  is_current boolean not null default true,
  status text not null default 'draft',
  starts_on date not null default current_date,
  ends_on date,
  royalty_rate numeric(7,4) not null default 0,
  marketing_fee_rate numeric(7,4) not null default 0,
  platform_fee_rate numeric(7,4) not null default 0,
  monthly_fixed_fee numeric(14,2) not null default 0,
  security_deposit numeric(14,2) not null default 0,
  currency text not null default 'EGP',
  settlement_cycle text not null default 'monthly',
  pricing_policy text not null default 'bounded',
  catalog_policy text not null default 'curated',
  supplier_policy text not null default 'approved_plus_local',
  promotion_policy text not null default 'approval_required',
  max_branches integer,
  can_manage_inventory boolean not null default true,
  can_view_analytics boolean not null default true,
  max_discount_percentage numeric(7,4) not null default 10,
  requires_order_approval boolean not null default false,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  activated_by uuid references auth.users(id) on delete set null,
  suspended_at timestamptz,
  suspended_by uuid references auth.users(id) on delete set null,
  terminated_at timestamptz,
  terminated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint franchise_agreements_merchant_tenant_fkey foreign key (merchant_id, tenant_id)
    references public.merchants(id, tenant_id) on delete cascade,
  constraint franchise_agreements_tenant_code_key unique (tenant_id, agreement_code),
  constraint franchise_agreements_merchant_version_key unique (merchant_id, version),
  constraint franchise_agreements_version_check check (version >= 1),
  constraint franchise_agreements_status_check check (status in ('draft','review','approved','active','suspended','expired','terminated')),
  constraint franchise_agreements_dates_check check (ends_on is null or ends_on >= starts_on),
  constraint franchise_agreements_royalty_check check (royalty_rate between 0 and 100),
  constraint franchise_agreements_marketing_fee_check check (marketing_fee_rate between 0 and 100),
  constraint franchise_agreements_platform_fee_check check (platform_fee_rate between 0 and 100),
  constraint franchise_agreements_monthly_fee_check check (monthly_fixed_fee >= 0),
  constraint franchise_agreements_deposit_check check (security_deposit >= 0),
  constraint franchise_agreements_currency_check check (nullif(btrim(currency),'') is not null),
  constraint franchise_agreements_settlement_cycle_check check (settlement_cycle in ('weekly','biweekly','monthly')),
  constraint franchise_agreements_pricing_policy_check check (pricing_policy in ('central','bounded','independent')),
  constraint franchise_agreements_catalog_policy_check check (catalog_policy in ('central','curated','independent')),
  constraint franchise_agreements_supplier_policy_check check (supplier_policy in ('approved_only','approved_plus_local','independent')),
  constraint franchise_agreements_promotion_policy_check check (promotion_policy in ('central','approval_required','independent')),
  constraint franchise_agreements_max_branches_check check (max_branches is null or max_branches > 0),
  constraint franchise_agreements_max_discount_check check (max_discount_percentage between 0 and 100)
);

create unique index if not exists ux_franchise_current_agreement_v1
  on private.franchise_agreements_v1(merchant_id) where is_current;
create index if not exists idx_franchise_agreements_tenant_status_v1
  on private.franchise_agreements_v1(tenant_id, status, updated_at desc);

create table if not exists private.franchise_agreement_events_v1 (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  agreement_id uuid references private.franchise_agreements_v1(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text,
  reason text,
  before_state jsonb,
  after_state jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_franchise_agreement_events_v1
  on private.franchise_agreement_events_v1(merchant_id, created_at desc);

alter table private.franchise_profiles_v1 enable row level security;
alter table private.franchise_agreements_v1 enable row level security;
alter table private.franchise_agreement_events_v1 enable row level security;

revoke all on private.franchise_profiles_v1 from public, anon, authenticated;
revoke all on private.franchise_agreements_v1 from public, anon, authenticated;
revoke all on private.franchise_agreement_events_v1 from public, anon, authenticated;
grant select on private.franchise_profiles_v1 to service_role;
grant select on private.franchise_agreements_v1 to service_role;
grant select on private.franchise_agreement_events_v1 to service_role;

insert into private.franchise_profiles_v1(
  merchant_id,tenant_id,legal_entity_name,commercial_registration,tax_registration,
  contact_name,phone,email,territory_name,territory_scope,notes,metadata
)
select m.id,m.tenant_id,coalesce(nullif(btrim(m.name),''),'Franchise'),
  nullif(btrim(coalesce(m.metadata->>'commercial_registration','')),''),
  nullif(btrim(coalesce(m.metadata->>'tax_registration','')),''),
  m.contact_name,m.phone,m.email,
  nullif(btrim(coalesce(m.metadata->>'territory_name','')),''),
  case when jsonb_typeof(m.metadata->'territory_scope') in ('array','object') then m.metadata->'territory_scope' else '[]'::jsonb end,
  'Legacy franchise profile backfilled in Phase 13',
  jsonb_build_object('backfilled',true,'source','legacy_franchise')
from public.merchants m
where m.merchant_type='franchise'
on conflict (merchant_id) do nothing;

insert into private.franchise_agreements_v1(
  tenant_id,merchant_id,agreement_code,version,is_current,status,starts_on,
  royalty_rate,marketing_fee_rate,platform_fee_rate,monthly_fixed_fee,security_deposit,
  currency,settlement_cycle,pricing_policy,catalog_policy,supplier_policy,promotion_policy,
  max_branches,can_manage_inventory,can_view_analytics,max_discount_percentage,requires_order_approval,
  notes,metadata,activated_at
)
select m.tenant_id,m.id,
  upper('LEGACY-' || regexp_replace(coalesce(nullif(m.code,''),substr(replace(m.id::text,'-',''),1,10)),'[^A-Za-z0-9]+','','g')),
  1,true,
  case when m.status='active' then 'active' when m.status='suspended' then 'suspended' when m.status='inactive' then 'expired' else 'draft' end,
  coalesce(m.created_at::date,current_date),
  0,0,
  case when coalesce(m.metadata->>'legacy_commission_rate','') ~ '^[0-9]+([.][0-9]+)?$' then (m.metadata->>'legacy_commission_rate')::numeric else 0 end,
  case when coalesce(m.metadata->>'legacy_monthly_fee','') ~ '^[0-9]+([.][0-9]+)?$' then (m.metadata->>'legacy_monthly_fee')::numeric else 0 end,
  0,'EGP','monthly','bounded','curated','approved_plus_local','approval_required',
  null,true,true,10,false,
  'Legacy franchise agreement backfilled in Phase 13',
  jsonb_build_object(
    'backfilled',true,
    'source','legacy_franchise',
    'legacy_commission_rate',m.metadata->'legacy_commission_rate',
    'legacy_monthly_fee',m.metadata->'legacy_monthly_fee',
    'mapping_note','legacy_commission_rate mapped to platform_fee_rate for compatibility'
  ),
  case when m.status='active' then coalesce(m.updated_at,m.created_at,now()) else null end
from public.merchants m
where m.merchant_type='franchise'
  and not exists (select 1 from private.franchise_agreements_v1 a where a.merchant_id=m.id and a.is_current);

insert into public.franchise_settings(
  branch_id,profit_share_percentage,payment_terms,can_modify_prices,can_add_products,
  can_manage_inventory,can_view_analytics,max_discount_percentage,requires_approval_for_orders
)
select b.id,0,a.settlement_cycle,(a.pricing_policy <> 'central'),(a.catalog_policy='independent'),
  a.can_manage_inventory,a.can_view_analytics,a.max_discount_percentage,a.requires_order_approval
from public.branches b
join public.merchants m on m.id=b.merchant_id and m.merchant_type='franchise'
join private.franchise_agreements_v1 a on a.merchant_id=m.id and a.is_current
where not exists (select 1 from public.franchise_settings fs where fs.branch_id=b.id)
on conflict (branch_id) do nothing;

create or replace function public.get_franchise_network_v1(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.can_manage_business_structure_v1(p_tenant_id) then
    raise exception using errcode='42501',message='BUSINESS_STRUCTURE_MANAGER_REQUIRED';
  end if;
  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'operators',coalesce((
      select jsonb_agg(jsonb_build_object(
        'merchant_id',m.id,'operator_name',m.name,'operator_code',m.code,'merchant_status',m.status,
        'contact_name',m.contact_name,'phone',m.phone,'email',m.email,
        'profile',to_jsonb(fp),
        'agreement',to_jsonb(a),
        'branch_count',(select count(*) from public.branches b where b.merchant_id=m.id),
        'active_branch_count',(select count(*) from public.branches b where b.merchant_id=m.id and b.active),
        'branches',coalesce((select jsonb_agg(jsonb_build_object(
          'id',b.id,'name',b.name,'code',b.code,'active',b.active,'address',b.address,
          'franchise_code',b.franchise_code,
          'channels',jsonb_build_object(
            'pos',private.branch_channel_runtime_v1(b.id,'pos'),
            'online_sales',private.branch_channel_runtime_v1(b.id,'online_sales'),
            'customer_app',private.branch_channel_runtime_v1(b.id,'customer_app'),
            'marketplace',private.branch_channel_runtime_v1(b.id,'marketplace'),
            'delivery',private.branch_channel_runtime_v1(b.id,'delivery'),
            'pickup',private.branch_channel_runtime_v1(b.id,'pickup')
          )
        ) order by b.created_at) from public.branches b where b.merchant_id=m.id),'[]'::jsonb)
      ) order by m.created_at)
      from public.merchants m
      left join private.franchise_profiles_v1 fp on fp.merchant_id=m.id
      left join private.franchise_agreements_v1 a on a.merchant_id=m.id and a.is_current
      where m.tenant_id=p_tenant_id and m.merchant_type='franchise'
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.get_franchise_detail_v1(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_tenant_id uuid; v_type text;
begin
  select m.tenant_id,m.merchant_type into v_tenant_id,v_type from public.merchants m where m.id=p_merchant_id;
  if v_tenant_id is null then raise exception using errcode='P0002',message='FRANCHISE_NOT_FOUND'; end if;
  if v_type<>'franchise' then raise exception using errcode='22023',message='MERCHANT_NOT_FRANCHISE'; end if;
  if not public.can_manage_business_structure_v1(v_tenant_id) then raise exception using errcode='42501',message='BUSINESS_STRUCTURE_MANAGER_REQUIRED'; end if;
  return jsonb_build_object(
    'merchant',(select to_jsonb(m) from public.merchants m where m.id=p_merchant_id),
    'profile',(select to_jsonb(fp) from private.franchise_profiles_v1 fp where fp.merchant_id=p_merchant_id),
    'current_agreement',(select to_jsonb(a) from private.franchise_agreements_v1 a where a.merchant_id=p_merchant_id and a.is_current),
    'agreement_history',coalesce((select jsonb_agg(to_jsonb(a) order by a.version desc) from private.franchise_agreements_v1 a where a.merchant_id=p_merchant_id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'event_type',e.event_type,'from_status',e.from_status,'to_status',e.to_status,
      'reason',e.reason,'actor_user_id',e.actor_user_id,'created_at',e.created_at
    ) order by e.created_at desc) from private.franchise_agreement_events_v1 e where e.merchant_id=p_merchant_id limit 100),'[]'::jsonb),
    'branches',coalesce((select jsonb_agg(jsonb_build_object(
      'id',b.id,'name',b.name,'code',b.code,'active',b.active,'address',b.address,'phone',b.phone,
      'email',b.email,'franchise_code',b.franchise_code,'latitude',b.latitude,'longitude',b.longitude,
      'legacy_settings',to_jsonb(fs),
      'channels',jsonb_build_object(
        'pos',private.branch_channel_runtime_v1(b.id,'pos'),
        'online_sales',private.branch_channel_runtime_v1(b.id,'online_sales'),
        'customer_app',private.branch_channel_runtime_v1(b.id,'customer_app'),
        'marketplace',private.branch_channel_runtime_v1(b.id,'marketplace'),
        'delivery',private.branch_channel_runtime_v1(b.id,'delivery'),
        'pickup',private.branch_channel_runtime_v1(b.id,'pickup')
      )
    ) order by b.created_at) from public.branches b left join public.franchise_settings fs on fs.branch_id=b.id where b.merchant_id=p_merchant_id),'[]'::jsonb)
  );
end;
$$;

create or replace function public.create_franchise_operator_v1(
  p_tenant_id uuid,
  p_profile jsonb,
  p_agreement jsonb,
  p_branch jsonb,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_merchant_id uuid:=gen_random_uuid();
  v_branch_id uuid:=gen_random_uuid();
  v_agreement_id uuid:=gen_random_uuid();
  v_operator_name text:=nullif(btrim(coalesce(p_profile->>'operator_name','')),'');
  v_legal_name text:=nullif(btrim(coalesce(p_profile->>'legal_entity_name','')),'');
  v_branch_name text:=nullif(btrim(coalesce(p_branch->>'name','')),'');
  v_merchant_code text;
  v_branch_code text;
  v_agreement_code text;
  v_starts_on date;
  v_ends_on date;
  v_royalty numeric:=coalesce(nullif(p_agreement->>'royalty_rate','')::numeric,0);
  v_marketing numeric:=coalesce(nullif(p_agreement->>'marketing_fee_rate','')::numeric,0);
  v_platform numeric:=coalesce(nullif(p_agreement->>'platform_fee_rate','')::numeric,0);
  v_monthly numeric:=coalesce(nullif(p_agreement->>'monthly_fixed_fee','')::numeric,0);
  v_deposit numeric:=coalesce(nullif(p_agreement->>'security_deposit','')::numeric,0);
  v_pricing text:=coalesce(nullif(p_agreement->>'pricing_policy',''),'bounded');
  v_catalog text:=coalesce(nullif(p_agreement->>'catalog_policy',''),'curated');
  v_supplier text:=coalesce(nullif(p_agreement->>'supplier_policy',''),'approved_plus_local');
  v_promo text:=coalesce(nullif(p_agreement->>'promotion_policy',''),'approval_required');
  v_settlement text:=coalesce(nullif(p_agreement->>'settlement_cycle',''),'monthly');
  v_max_discount numeric:=coalesce(nullif(p_agreement->>'max_discount_percentage','')::numeric,10);
  v_manage_inventory boolean:=coalesce(nullif(p_agreement->>'can_manage_inventory','')::boolean,true);
  v_view_analytics boolean:=coalesce(nullif(p_agreement->>'can_view_analytics','')::boolean,true);
  v_requires_approval boolean:=coalesce(nullif(p_agreement->>'requires_order_approval','')::boolean,false);
begin
  if not public.can_manage_business_structure_v1(p_tenant_id) then raise exception using errcode='42501',message='BUSINESS_STRUCTURE_MANAGER_REQUIRED'; end if;
  if not exists(select 1 from public.tenants t where t.id=p_tenant_id and t.status='active') then raise exception using errcode='22023',message='TENANT_NOT_ACTIVE'; end if;
  if v_operator_name is null then raise exception using errcode='22023',message='FRANCHISE_OPERATOR_NAME_REQUIRED'; end if;
  if v_legal_name is null then raise exception using errcode='22023',message='FRANCHISE_LEGAL_ENTITY_REQUIRED'; end if;
  if v_branch_name is null then raise exception using errcode='22023',message='FRANCHISE_BRANCH_NAME_REQUIRED'; end if;

  v_starts_on:=coalesce(nullif(p_agreement->>'starts_on','')::date,current_date);
  v_ends_on:=nullif(p_agreement->>'ends_on','')::date;
  if v_ends_on is not null and v_ends_on<v_starts_on then raise exception using errcode='22023',message='FRANCHISE_AGREEMENT_INVALID_DATES'; end if;
  if v_royalty not between 0 and 100 or v_marketing not between 0 and 100 or v_platform not between 0 and 100 or v_max_discount not between 0 and 100 then raise exception using errcode='22023',message='FRANCHISE_RATE_OUT_OF_RANGE'; end if;
  if v_monthly<0 or v_deposit<0 then raise exception using errcode='22023',message='FRANCHISE_NEGATIVE_FEE_NOT_ALLOWED'; end if;
  if v_pricing not in ('central','bounded','independent') or v_catalog not in ('central','curated','independent') or v_supplier not in ('approved_only','approved_plus_local','independent') or v_promo not in ('central','approval_required','independent') or v_settlement not in ('weekly','biweekly','monthly') then raise exception using errcode='22023',message='FRANCHISE_POLICY_INVALID'; end if;

  v_merchant_code:=lower(coalesce(nullif(regexp_replace(coalesce(p_profile->>'operator_code',''),'[^A-Za-z0-9-]+','','g'),''),'franchise-'||substr(replace(v_merchant_id::text,'-',''),1,8)));
  v_branch_code:=upper(coalesce(nullif(regexp_replace(coalesce(p_branch->>'code',''),'[^A-Za-z0-9-]+','','g'),''),'FR-'||substr(replace(v_branch_id::text,'-',''),1,8)));
  v_agreement_code:=upper(coalesce(nullif(btrim(coalesce(p_agreement->>'agreement_code','')),''),'FRA-'||to_char(current_date,'YYYY')||'-'||substr(replace(v_agreement_id::text,'-',''),1,8)));

  insert into public.merchants(id,tenant_id,code,name,merchant_type,status,contact_name,phone,email,metadata)
  values(v_merchant_id,p_tenant_id,v_merchant_code,v_operator_name,'franchise','draft',
    nullif(btrim(coalesce(p_profile->>'contact_name','')),''),nullif(btrim(coalesce(p_profile->>'phone','')),''),nullif(btrim(coalesce(p_profile->>'email','')),''),
    jsonb_build_object('onboarding_status','draft','created_via','franchise_onboarding_v1'));

  insert into private.franchise_profiles_v1(merchant_id,tenant_id,legal_entity_name,commercial_registration,tax_registration,contact_name,phone,email,territory_name,territory_scope,notes,metadata)
  values(v_merchant_id,p_tenant_id,v_legal_name,
    nullif(btrim(coalesce(p_profile->>'commercial_registration','')),''),nullif(btrim(coalesce(p_profile->>'tax_registration','')),''),
    nullif(btrim(coalesce(p_profile->>'contact_name','')),''),nullif(btrim(coalesce(p_profile->>'phone','')),''),nullif(btrim(coalesce(p_profile->>'email','')),''),
    nullif(btrim(coalesce(p_profile->>'territory_name','')),''),
    case when jsonb_typeof(p_profile->'territory_scope') in ('array','object') then p_profile->'territory_scope' else '[]'::jsonb end,
    nullif(btrim(coalesce(p_profile->>'notes','')),''),jsonb_build_object('created_via','franchise_onboarding_v1'));

  insert into private.franchise_agreements_v1(
    id,tenant_id,merchant_id,agreement_code,version,is_current,status,starts_on,ends_on,
    royalty_rate,marketing_fee_rate,platform_fee_rate,monthly_fixed_fee,security_deposit,currency,settlement_cycle,
    pricing_policy,catalog_policy,supplier_policy,promotion_policy,max_branches,can_manage_inventory,can_view_analytics,
    max_discount_percentage,requires_order_approval,notes,metadata
  ) values(
    v_agreement_id,p_tenant_id,v_merchant_id,v_agreement_code,1,true,'draft',v_starts_on,v_ends_on,
    v_royalty,v_marketing,v_platform,v_monthly,v_deposit,upper(coalesce(nullif(p_agreement->>'currency',''),'EGP')),v_settlement,
    v_pricing,v_catalog,v_supplier,v_promo,nullif(p_agreement->>'max_branches','')::integer,v_manage_inventory,v_view_analytics,
    v_max_discount,v_requires_approval,nullif(btrim(coalesce(p_agreement->>'notes','')),''),jsonb_build_object('created_via','franchise_onboarding_v1')
  );

  insert into public.branches(
    id,tenant_id,merchant_id,name,code,franchise_code,address,phone,email,active,branch_type,category,
    independent_pricing,independent_inventory,latitude,longitude,delivery_enabled,marketplace_customer_enabled,
    delivery_fee,min_order_amount,estimated_delivery_minutes,inventory_source_branch_id,pricing_source_branch_id
  ) values(
    v_branch_id,p_tenant_id,v_merchant_id,v_branch_name,v_branch_code,v_branch_code,
    nullif(btrim(coalesce(p_branch->>'address','')),''),nullif(btrim(coalesce(p_branch->>'phone','')),''),nullif(btrim(coalesce(p_branch->>'email','')),''),
    false,'external'::public.branch_type,'franchise'::public.branch_category,true,true,
    nullif(p_branch->>'latitude','')::double precision,nullif(p_branch->>'longitude','')::double precision,false,false,
    coalesce(nullif(p_branch->>'delivery_fee','')::numeric,0),coalesce(nullif(p_branch->>'min_order_amount','')::numeric,0),nullif(p_branch->>'estimated_delivery_minutes','')::integer,
    v_branch_id,v_branch_id
  );

  insert into private.branch_channel_controls_v1(branch_id,channel,configured_enabled,reason,message_ar,source,revision,updated_by,updated_at)
  select v_branch_id,c,false,'awaiting_franchise_activation','الفرع غير مفعل حتى اكتمال واعتماد عقد الفرنشايز','franchise_onboarding',1,auth.uid(),now()
  from unnest(array['pos','online_sales','customer_app','marketplace','delivery','pickup']::text[]) c
  on conflict(branch_id,channel) do update set configured_enabled=false,reason=excluded.reason,message_ar=excluded.message_ar,source=excluded.source,revision=private.branch_channel_controls_v1.revision+1,updated_by=auth.uid(),updated_at=now();

  insert into public.franchise_settings(branch_id,profit_share_percentage,payment_terms,can_modify_prices,can_add_products,can_manage_inventory,can_view_analytics,max_discount_percentage,requires_approval_for_orders)
  values(v_branch_id,0,v_settlement,(v_pricing<>'central'),(v_catalog='independent'),v_manage_inventory,v_view_analytics,v_max_discount,v_requires_approval)
  on conflict(branch_id) do nothing;

  if p_owner_user_id is not null then
    if not exists(select 1 from auth.users u where u.id=p_owner_user_id) then raise exception using errcode='22023',message='OWNER_AUTH_USER_NOT_FOUND'; end if;
    insert into public.merchant_members(tenant_id,merchant_id,user_id,role,is_active)
    values(p_tenant_id,v_merchant_id,p_owner_user_id,'owner',true)
    on conflict(merchant_id,user_id) do update set role='owner',is_active=true,updated_at=now();
  end if;

  insert into private.franchise_agreement_events_v1(tenant_id,merchant_id,agreement_id,event_type,to_status,after_state,actor_user_id)
  values(p_tenant_id,v_merchant_id,v_agreement_id,'created','draft',(select to_jsonb(a) from private.franchise_agreements_v1 a where a.id=v_agreement_id),auth.uid());
  insert into private.business_structure_audit_v1(tenant_id,entity_type,entity_id,branch_id,action,after_state,actor_user_id)
  values(p_tenant_id,'franchise',v_merchant_id,v_branch_id,'franchise_created',jsonb_build_object('merchant_id',v_merchant_id,'agreement_id',v_agreement_id,'branch_id',v_branch_id),auth.uid());

  return jsonb_build_object('merchant_id',v_merchant_id,'agreement_id',v_agreement_id,'branch_id',v_branch_id,'merchant_status','draft','agreement_status','draft','branch_active',false,'channels_enabled',false);
end;
$$;

create or replace function public.create_franchise_branch_v1(p_merchant_id uuid,p_branch jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tenant_id uuid; v_type text; v_branch_id uuid:=gen_random_uuid(); v_branch_name text; v_branch_code text; v_count integer; v_agreement private.franchise_agreements_v1%rowtype;
begin
  select m.tenant_id,m.merchant_type into v_tenant_id,v_type from public.merchants m where m.id=p_merchant_id;
  if v_tenant_id is null then raise exception using errcode='P0002',message='FRANCHISE_NOT_FOUND'; end if;
  if v_type<>'franchise' then raise exception using errcode='22023',message='MERCHANT_NOT_FRANCHISE'; end if;
  if not public.can_manage_business_structure_v1(v_tenant_id) then raise exception using errcode='42501',message='BUSINESS_STRUCTURE_MANAGER_REQUIRED'; end if;
  select * into v_agreement from private.franchise_agreements_v1 a where a.merchant_id=p_merchant_id and a.is_current for update;
  if v_agreement.id is null then raise exception using errcode='22023',message='FRANCHISE_CURRENT_AGREEMENT_REQUIRED'; end if;
  if v_agreement.status in ('terminated','expired') then raise exception using errcode='22023',message='FRANCHISE_AGREEMENT_NOT_OPEN'; end if;
  select count(*) into v_count from public.branches b where b.merchant_id=p_merchant_id;
  if v_agreement.max_branches is not null and v_count>=v_agreement.max_branches then raise exception using errcode='22023',message='FRANCHISE_MAX_BRANCHES_REACHED'; end if;
  v_branch_name:=nullif(btrim(coalesce(p_branch->>'name','')),'');
  if v_branch_name is null then raise exception using errcode='22023',message='FRANCHISE_BRANCH_NAME_REQUIRED'; end if;
  v_branch_code:=upper(coalesce(nullif(regexp_replace(coalesce(p_branch->>'code',''),'[^A-Za-z0-9-]+','','g'),''),'FR-'||substr(replace(v_branch_id::text,'-',''),1,8)));
  insert into public.branches(
    id,tenant_id,merchant_id,name,code,franchise_code,address,phone,email,active,branch_type,category,independent_pricing,independent_inventory,
    latitude,longitude,delivery_enabled,marketplace_customer_enabled,delivery_fee,min_order_amount,estimated_delivery_minutes,inventory_source_branch_id,pricing_source_branch_id
  ) values(
    v_branch_id,v_tenant_id,p_merchant_id,v_branch_name,v_branch_code,v_branch_code,
    nullif(btrim(coalesce(p_branch->>'address','')),''),nullif(btrim(coalesce(p_branch->>'phone','')),''),nullif(btrim(coalesce(p_branch->>'email','')),''),
    false,'external'::public.branch_type,'franchise'::public.branch_category,true,true,
    nullif(p_branch->>'latitude','')::double precision,nullif(p_branch->>'longitude','')::double precision,false,false,
    coalesce(nullif(p_branch->>'delivery_fee','')::numeric,0),coalesce(nullif(p_branch->>'min_order_amount','')::numeric,0),nullif(p_branch->>'estimated_delivery_minutes','')::integer,
    v_branch_id,v_branch_id
  );
  insert into private.branch_channel_controls_v1(branch_id,channel,configured_enabled,reason,message_ar,source,revision,updated_by,updated_at)
  select v_branch_id,c,false,'awaiting_branch_activation','الفرع الجديد غير مفعل حتى اعتماده من مركز الفروع','franchise_onboarding',1,auth.uid(),now()
  from unnest(array['pos','online_sales','customer_app','marketplace','delivery','pickup']::text[]) c;
  insert into public.franchise_settings(branch_id,profit_share_percentage,payment_terms,can_modify_prices,can_add_products,can_manage_inventory,can_view_analytics,max_discount_percentage,requires_approval_for_orders)
  values(v_branch_id,0,v_agreement.settlement_cycle,(v_agreement.pricing_policy<>'central'),(v_agreement.catalog_policy='independent'),v_agreement.can_manage_inventory,v_agreement.can_view_analytics,v_agreement.max_discount_percentage,v_agreement.requires_order_approval)
  on conflict(branch_id) do nothing;
  insert into private.business_structure_audit_v1(tenant_id,entity_type,entity_id,branch_id,action,after_state,actor_user_id)
  values(v_tenant_id,'franchise_branch',v_branch_id,v_branch_id,'franchise_branch_created',jsonb_build_object('merchant_id',p_merchant_id,'branch_id',v_branch_id),auth.uid());
  return jsonb_build_object('merchant_id',p_merchant_id,'branch_id',v_branch_id,'branch_active',false,'channels_enabled',false);
end;
$$;

create or replace function public.update_franchise_profile_v1(p_merchant_id uuid,p_profile jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_tenant_id uuid; v_type text;
begin
  select m.tenant_id,m.merchant_type into v_tenant_id,v_type from public.merchants m where m.id=p_merchant_id;
  if v_tenant_id is null then raise exception using errcode='P0002',message='FRANCHISE_NOT_FOUND'; end if;
  if v_type<>'franchise' then raise exception using errcode='22023',message='MERCHANT_NOT_FRANCHISE'; end if;
  if not public.can_manage_business_structure_v1(v_tenant_id) then raise exception using errcode='42501',message='BUSINESS_STRUCTURE_MANAGER_REQUIRED'; end if;
  update private.franchise_profiles_v1 fp set
    legal_entity_name=case when p_profile ? 'legal_entity_name' then coalesce(nullif(btrim(p_profile->>'legal_entity_name'),''),fp.legal_entity_name) else fp.legal_entity_name end,
    commercial_registration=case when p_profile ? 'commercial_registration' then nullif(btrim(p_profile->>'commercial_registration'),'') else fp.commercial_registration end,
    tax_registration=case when p_profile ? 'tax_registration' then nullif(btrim(p_profile->>'tax_registration'),'') else fp.tax_registration end,
    contact_name=case when p_profile ? 'contact_name' then nullif(btrim(p_profile->>'contact_name'),'') else fp.contact_name end,
    phone=case when p_profile ? 'phone' then nullif(btrim(p_profile->>'phone'),'') else fp.phone end,
    email=case when p_profile ? 'email' then nullif(btrim(p_profile->>'email'),'') else fp.email end,
    territory_name=case when p_profile ? 'territory_name' then nullif(btrim(p_profile->>'territory_name'),'') else fp.territory_name end,
    territory_scope=case when p_profile ? 'territory_scope' and jsonb_typeof(p_profile->'territory_scope') in ('array','object') then p_profile->'territory_scope' else fp.territory_scope end,
    notes=case when p_profile ? 'notes' then nullif(btrim(p_profile->>'notes'),'') else fp.notes end,
    updated_at=now()
  where fp.merchant_id=p_merchant_id;
  if not found then raise exception using errcode='P0002',message='FRANCHISE_PROFILE_NOT_FOUND'; end if;
  update public.merchants m set
    name=case when p_profile ? 'operator_name' then coalesce(nullif(btrim(p_profile->>'operator_name'),''),m.name) else m.name end,
    contact_name=case when p_profile ? 'contact_name' then nullif(btrim(p_profile->>'contact_name'),'') else m.contact_name end,
    phone=case when p_profile ? 'phone' then nullif(btrim(p_profile->>'phone'),'') else m.phone end,
    email=case when p_profile ? 'email' then nullif(btrim(p_profile->>'email'),'') else m.email end,
    updated_at=now()
  where m.id=p_merchant_id;
  return public.get_franchise_detail_v1(p_merchant_id);
end;
$$;

create or replace function public.update_franchise_agreement_v1(p_merchant_id uuid,p_agreement jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_tenant_id uuid; v_type text; v_agreement private.franchise_agreements_v1%rowtype;
begin
  select m.tenant_id,m.merchant_type into v_tenant_id,v_type from public.merchants m where m.id=p_merchant_id;
  if v_tenant_id is null then raise exception using errcode='P0002',message='FRANCHISE_NOT_FOUND'; end if;
  if v_type<>'franchise' then raise exception using errcode='22023',message='MERCHANT_NOT_FRANCHISE'; end if;
  if not public.can_manage_business_structure_v1(v_tenant_id) then raise exception using errcode='42501',message='BUSINESS_STRUCTURE_MANAGER_REQUIRED'; end if;
  select * into v_agreement from private.franchise_agreements_v1 a where a.merchant_id=p_merchant_id and a.is_current for update;
  if v_agreement.id is null then raise exception using errcode='P0002',message='FRANCHISE_CURRENT_AGREEMENT_REQUIRED'; end if;
  if v_agreement.status not in ('draft','review') then raise exception using errcode='22023',message='FRANCHISE_ACTIVE_AGREEMENT_REQUIRES_REVISION'; end if;
  update private.franchise_agreements_v1 a set
    agreement_code=case when p_agreement ? 'agreement_code' then coalesce(nullif(btrim(p_agreement->>'agreement_code'),''),a.agreement_code) else a.agreement_code end,
    starts_on=case when p_agreement ? 'starts_on' then coalesce(nullif(p_agreement->>'starts_on','')::date,a.starts_on) else a.starts_on end,
    ends_on=case when p_agreement ? 'ends_on' then nullif(p_agreement->>'ends_on','')::date else a.ends_on end,
    royalty_rate=case when p_agreement ? 'royalty_rate' then coalesce(nullif(p_agreement->>'royalty_rate','')::numeric,a.royalty_rate) else a.royalty_rate end,
    marketing_fee_rate=case when p_agreement ? 'marketing_fee_rate' then coalesce(nullif(p_agreement->>'marketing_fee_rate','')::numeric,a.marketing_fee_rate) else a.marketing_fee_rate end,
    platform_fee_rate=case when p_agreement ? 'platform_fee_rate' then coalesce(nullif(p_agreement->>'platform_fee_rate','')::numeric,a.platform_fee_rate) else a.platform_fee_rate end,
    monthly_fixed_fee=case when p_agreement ? 'monthly_fixed_fee' then coalesce(nullif(p_agreement->>'monthly_fixed_fee','')::numeric,a.monthly_fixed_fee) else a.monthly_fixed_fee end,
    security_deposit=case when p_agreement ? 'security_deposit' then coalesce(nullif(p_agreement->>'security_deposit','')::numeric,a.security_deposit) else a.security_deposit end,
    currency=case when p_agreement ? 'currency' then upper(coalesce(nullif(btrim(p_agreement->>'currency'),''),a.currency)) else a.currency end,
    settlement_cycle=case when p_agreement ? 'settlement_cycle' then coalesce(nullif(p_agreement->>'settlement_cycle',''),a.settlement_cycle) else a.settlement_cycle end,
    pricing_policy=case when p_agreement ? 'pricing_policy' then coalesce(nullif(p_agreement->>'pricing_policy',''),a.pricing_policy) else a.pricing_policy end,
    catalog_policy=case when p_agreement ? 'catalog_policy' then coalesce(nullif(p_agreement->>'catalog_policy',''),a.catalog_policy) else a.catalog_policy end,
    supplier_policy=case when p_agreement ? 'supplier_policy' then coalesce(nullif(p_agreement->>'supplier_policy',''),a.supplier_policy) else a.supplier_policy end,
    promotion_policy=case when p_agreement ? 'promotion_policy' then coalesce(nullif(p_agreement->>'promotion_policy',''),a.promotion_policy) else a.promotion_policy end,
    max_branches=case when p_agreement ? 'max_branches' then nullif(p_agreement->>'max_branches','')::integer else a.max_branches end,
    can_manage_inventory=case when p_agreement ? 'can_manage_inventory' then coalesce(nullif(p_agreement->>'can_manage_inventory','')::boolean,a.can_manage_inventory) else a.can_manage_inventory end,
    can_view_analytics=case when p_agreement ? 'can_view_analytics' then coalesce(nullif(p_agreement->>'can_view_analytics','')::boolean,a.can_view_analytics) else a.can_view_analytics end,
    max_discount_percentage=case when p_agreement ? 'max_discount_percentage' then coalesce(nullif(p_agreement->>'max_discount_percentage','')::numeric,a.max_discount_percentage) else a.max_discount_percentage end,
    requires_order_approval=case when p_agreement ? 'requires_order_approval' then coalesce(nullif(p_agreement->>'requires_order_approval','')::boolean,a.requires_order_approval) else a.requires_order_approval end,
    notes=case when p_agreement ? 'notes' then nullif(btrim(p_agreement->>'notes'),'') else a.notes end,
    updated_at=now()
  where a.id=v_agreement.id;
  update public.franchise_settings fs set
    payment_terms=a.settlement_cycle,can_modify_prices=(a.pricing_policy<>'central'),can_add_products=(a.catalog_policy='independent'),
    can_manage_inventory=a.can_manage_inventory,can_view_analytics=a.can_view_analytics,max_discount_percentage=a.max_discount_percentage,
    requires_approval_for_orders=a.requires_order_approval,updated_at=now()
  from private.franchise_agreements_v1 a, public.branches b
  where a.id=v_agreement.id and b.merchant_id=p_merchant_id and fs.branch_id=b.id;
  return public.get_franchise_detail_v1(p_merchant_id);
end;
$$;

create or replace function public.transition_franchise_agreement_v1(p_merchant_id uuid,p_action text,p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tenant_id uuid; v_type text; v_agreement private.franchise_agreements_v1%rowtype; v_before jsonb; v_to text; v_now timestamptz:=now();
begin
  select m.tenant_id,m.merchant_type into v_tenant_id,v_type from public.merchants m where m.id=p_merchant_id;
  if v_tenant_id is null then raise exception using errcode='P0002',message='FRANCHISE_NOT_FOUND'; end if;
  if v_type<>'franchise' then raise exception using errcode='22023',message='MERCHANT_NOT_FRANCHISE'; end if;
  if not public.can_manage_business_structure_v1(v_tenant_id) then raise exception using errcode='42501',message='BUSINESS_STRUCTURE_MANAGER_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('franchise:'||p_merchant_id::text));
  select * into v_agreement from private.franchise_agreements_v1 a where a.merchant_id=p_merchant_id and a.is_current for update;
  if v_agreement.id is null then raise exception using errcode='P0002',message='FRANCHISE_CURRENT_AGREEMENT_REQUIRED'; end if;
  v_before:=to_jsonb(v_agreement);

  if p_action='submit_review' and v_agreement.status='draft' then v_to:='review';
  elsif p_action='return_to_draft' and v_agreement.status='review' then v_to:='draft';
  elsif p_action='approve' and v_agreement.status='review' then v_to:='approved';
  elsif p_action='activate' and v_agreement.status='approved' then v_to:='active';
  elsif p_action='suspend' and v_agreement.status='active' then v_to:='suspended';
  elsif p_action='resume' and v_agreement.status='suspended' then v_to:='active';
  elsif p_action='terminate' and v_agreement.status not in ('terminated','expired') then v_to:='terminated';
  elsif p_action='expire' and v_agreement.status in ('approved','active','suspended') then v_to:='expired';
  else raise exception using errcode='22023',message='FRANCHISE_INVALID_TRANSITION'; end if;

  if p_action in ('suspend','terminate') and nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception using errcode='22023',message='FRANCHISE_TRANSITION_REASON_REQUIRED'; end if;
  if p_action in ('activate','resume') then
    if v_agreement.starts_on>current_date or (v_agreement.ends_on is not null and v_agreement.ends_on<current_date) then raise exception using errcode='22023',message='FRANCHISE_AGREEMENT_OUTSIDE_ACTIVE_DATES'; end if;
    if not exists(select 1 from private.franchise_profiles_v1 fp where fp.merchant_id=p_merchant_id and nullif(btrim(fp.legal_entity_name),'') is not null) then raise exception using errcode='22023',message='FRANCHISE_PROFILE_INCOMPLETE'; end if;
  end if;
  if p_action='expire' and (v_agreement.ends_on is null or v_agreement.ends_on>=current_date) then raise exception using errcode='22023',message='FRANCHISE_AGREEMENT_NOT_EXPIRED'; end if;

  update private.franchise_agreements_v1 a set
    status=v_to,
    reviewed_at=case when p_action='submit_review' then v_now else a.reviewed_at end,
    reviewed_by=case when p_action='submit_review' then auth.uid() else a.reviewed_by end,
    approved_at=case when p_action='approve' then v_now else a.approved_at end,
    approved_by=case when p_action='approve' then auth.uid() else a.approved_by end,
    activated_at=case when p_action in ('activate','resume') then coalesce(a.activated_at,v_now) else a.activated_at end,
    activated_by=case when p_action in ('activate','resume') then coalesce(a.activated_by,auth.uid()) else a.activated_by end,
    suspended_at=case when p_action='suspend' then v_now when p_action='resume' then null else a.suspended_at end,
    suspended_by=case when p_action='suspend' then auth.uid() when p_action='resume' then null else a.suspended_by end,
    terminated_at=case when p_action in ('terminate','expire') then v_now else a.terminated_at end,
    terminated_by=case when p_action in ('terminate','expire') then auth.uid() else a.terminated_by end,
    metadata=case when nullif(btrim(coalesce(p_reason,'')),'') is not null then coalesce(a.metadata,'{}'::jsonb)||jsonb_build_object('last_transition_reason',p_reason) else a.metadata end,
    updated_at=v_now
  where a.id=v_agreement.id;

  update public.merchants m set
    status=case v_to when 'draft' then 'draft' when 'review' then 'pending' when 'approved' then 'pending' when 'active' then 'active' when 'suspended' then 'suspended' else 'inactive' end,
    customer_published_at=case when v_to in ('terminated','expired') then null else m.customer_published_at end,
    metadata=coalesce(m.metadata,'{}'::jsonb)||jsonb_build_object('franchise_agreement_status',v_to,'franchise_agreement_updated_at',v_now),
    updated_at=v_now
  where m.id=p_merchant_id;

  if v_to in ('terminated','expired') then
    update public.branches set active=false,delivery_enabled=false,marketplace_customer_enabled=false,updated_at=v_now where merchant_id=p_merchant_id;
  end if;

  insert into private.franchise_agreement_events_v1(tenant_id,merchant_id,agreement_id,event_type,from_status,to_status,reason,before_state,after_state,actor_user_id)
  values(v_tenant_id,p_merchant_id,v_agreement.id,p_action,v_agreement.status,v_to,p_reason,v_before,(select to_jsonb(a) from private.franchise_agreements_v1 a where a.id=v_agreement.id),auth.uid());
  insert into private.business_structure_audit_v1(tenant_id,entity_type,entity_id,action,before_state,after_state,reason,actor_user_id)
  values(v_tenant_id,'franchise_agreement',v_agreement.id,'franchise_agreement_'||p_action,v_before,(select to_jsonb(a) from private.franchise_agreements_v1 a where a.id=v_agreement.id),p_reason,auth.uid());

  return public.get_franchise_detail_v1(p_merchant_id);
end;
$$;

revoke execute on function public.get_franchise_network_v1(uuid) from public,anon;
revoke execute on function public.get_franchise_detail_v1(uuid) from public,anon;
revoke execute on function public.create_franchise_operator_v1(uuid,jsonb,jsonb,jsonb,uuid) from public,anon;
revoke execute on function public.create_franchise_branch_v1(uuid,jsonb) from public,anon;
revoke execute on function public.update_franchise_profile_v1(uuid,jsonb) from public,anon;
revoke execute on function public.update_franchise_agreement_v1(uuid,jsonb) from public,anon;
revoke execute on function public.transition_franchise_agreement_v1(uuid,text,text) from public,anon;

grant execute on function public.get_franchise_network_v1(uuid) to authenticated,service_role;
grant execute on function public.get_franchise_detail_v1(uuid) to authenticated,service_role;
grant execute on function public.create_franchise_operator_v1(uuid,jsonb,jsonb,jsonb,uuid) to authenticated,service_role;
grant execute on function public.create_franchise_branch_v1(uuid,jsonb) to authenticated,service_role;
grant execute on function public.update_franchise_profile_v1(uuid,jsonb) to authenticated,service_role;
grant execute on function public.update_franchise_agreement_v1(uuid,jsonb) to authenticated,service_role;
grant execute on function public.transition_franchise_agreement_v1(uuid,text,text) to authenticated,service_role;
