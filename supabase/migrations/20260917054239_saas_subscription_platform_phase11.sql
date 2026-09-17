-- Phase 11: SaaS plans, entitlements, subscription lifecycle and hard enforcement

create table if not exists private.saas_feature_catalog_v1 (
  feature_key text primary key,
  name_ar text not null,
  description_ar text null,
  category text not null default 'core',
  created_at timestamptz not null default now()
);

create table if not exists private.saas_limit_catalog_v1 (
  limit_key text primary key,
  name_ar text not null,
  unit_label_ar text null,
  created_at timestamptz not null default now()
);

create table if not exists private.saas_plans_v1 (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name_ar text not null,
  name_en text null,
  description_ar text null,
  currency text not null default 'EGP',
  monthly_price numeric(12,2) not null default 0 check (monthly_price >= 0),
  yearly_price numeric(12,2) not null default 0 check (yearly_price >= 0),
  is_active boolean not null default true,
  is_internal boolean not null default false,
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.saas_plan_entitlements_v1 (
  plan_id uuid not null references private.saas_plans_v1(id) on delete cascade,
  feature_key text not null references private.saas_feature_catalog_v1(feature_key) on delete restrict,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, feature_key)
);

create table if not exists private.saas_plan_limits_v1 (
  plan_id uuid not null references private.saas_plans_v1(id) on delete cascade,
  limit_key text not null references private.saas_limit_catalog_v1(limit_key) on delete restrict,
  limit_value bigint null check (limit_value is null or limit_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, limit_key)
);

create table if not exists private.tenant_subscription_events_v1 (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid null references public.tenant_subscriptions(id) on delete set null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  event_type text not null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  reason text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_saas_plans_active_sort_v1 on private.saas_plans_v1(is_active, sort_order, created_at);
create index if not exists idx_tenant_subscription_events_v1 on private.tenant_subscription_events_v1(tenant_id, created_at desc);

alter table private.saas_feature_catalog_v1 enable row level security;
alter table private.saas_limit_catalog_v1 enable row level security;
alter table private.saas_plans_v1 enable row level security;
alter table private.saas_plan_entitlements_v1 enable row level security;
alter table private.saas_plan_limits_v1 enable row level security;
alter table private.tenant_subscription_events_v1 enable row level security;

revoke all on table private.saas_feature_catalog_v1 from public, anon, authenticated;
revoke all on table private.saas_limit_catalog_v1 from public, anon, authenticated;
revoke all on table private.saas_plans_v1 from public, anon, authenticated;
revoke all on table private.saas_plan_entitlements_v1 from public, anon, authenticated;
revoke all on table private.saas_plan_limits_v1 from public, anon, authenticated;
revoke all on table private.tenant_subscription_events_v1 from public, anon, authenticated;
grant select on table private.saas_feature_catalog_v1 to service_role;
grant select on table private.saas_limit_catalog_v1 to service_role;
grant select on table private.saas_plans_v1 to service_role;
grant select on table private.saas_plan_entitlements_v1 to service_role;
grant select on table private.saas_plan_limits_v1 to service_role;
grant select on table private.tenant_subscription_events_v1 to service_role;

insert into private.saas_feature_catalog_v1(feature_key,name_ar,description_ar,category) values
('pos','نقطة البيع POS','تشغيل نقطة البيع والورديات والمبيعات داخل الفرع','commerce'),
('admin','لوحة الإدارة','إدارة الفروع والمنتجات والمخزون والموردين والإعدادات','core'),
('customer_app','تطبيق العميل','إتاحة تطبيق التسوق للعملاء','commerce'),
('online_sales','البيع أونلاين','إنشاء الطلبات الأونلاين وMarketplace checkout','commerce'),
('delivery','التوصيل','تشغيل تطبيق المندوب وعمليات التوصيل','operations'),
('marketplace','Marketplace','إدارة وبيع منتجات الشركاء داخل المنصة','commerce'),
('inventory','إدارة المخزون','الجرد والتحويلات وحركة المخزون','operations'),
('finance','المالية','الخزنة والتسويات والمصروفات والتقارير المالية','management'),
('hr','الموارد البشرية','الموظفين والحضور والرواتب والأداء','management'),
('crm','CRM','إدارة العملاء والمتابعات والفرص','growth'),
('reporting','التقارير المتقدمة','تقارير وتحليلات الأعمال المتقدمة','analytics'),
('ai','الذكاء الاصطناعي','مزايا AI والتحليلات والإجراءات الذكية','analytics'),
('task_center','Task Center','إدارة المهام والموافقات التشغيلية','operations')
on conflict(feature_key) do update set name_ar=excluded.name_ar,description_ar=excluded.description_ar,category=excluded.category;

insert into private.saas_limit_catalog_v1(limit_key,name_ar,unit_label_ar) values
('max_branches','الحد الأقصى للفروع','فرع'),
('max_users','الحد الأقصى للمستخدمين','مستخدم'),
('max_products','الحد الأقصى للمنتجات','منتج'),
('max_marketplace_merchants','الحد الأقصى لشركاء Marketplace','شريك'),
('max_delivery_users','الحد الأقصى لمندوبي التوصيل','مندوب')
on conflict(limit_key) do update set name_ar=excluded.name_ar,unit_label_ar=excluded.unit_label_ar;

insert into private.saas_plans_v1(code,name_ar,name_en,description_ar,currency,monthly_price,yearly_price,is_active,is_internal,sort_order,metadata)
values('platform_internal','Platform Internal','Platform Internal','خطة داخلية خاصة بمنصة المعداوي ولا تخضع للفوترة التجارية.','EGP',0,0,true,true,0,jsonb_build_object('system',true))
on conflict(code) do update set name_ar=excluded.name_ar,name_en=excluded.name_en,description_ar=excluded.description_ar,is_active=true,is_internal=true,updated_at=now();

insert into private.saas_plan_entitlements_v1(plan_id,feature_key,enabled)
select p.id,f.feature_key,true
from private.saas_plans_v1 p cross join private.saas_feature_catalog_v1 f
where p.code='platform_internal'
on conflict(plan_id,feature_key) do update set enabled=true,updated_at=now();

insert into private.saas_plan_limits_v1(plan_id,limit_key,limit_value)
select p.id,l.limit_key,
  case l.limit_key
    when 'max_branches' then 1000::bigint
    when 'max_users' then 1000::bigint
    when 'max_products' then 1000000::bigint
    else null::bigint
  end
from private.saas_plans_v1 p cross join private.saas_limit_catalog_v1 l
where p.code='platform_internal'
on conflict(plan_id,limit_key) do update set limit_value=excluded.limit_value,updated_at=now();

alter table public.tenant_subscriptions add column if not exists plan_id uuid null;
alter table public.tenant_subscriptions add column if not exists grace_ends_at timestamptz null;
alter table public.tenant_subscriptions add column if not exists auto_suspend boolean not null default true;
alter table public.tenant_subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.tenant_subscriptions add column if not exists suspended_at timestamptz null;
alter table public.tenant_subscriptions add column if not exists suspended_reason text null;
alter table public.tenant_subscriptions add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.tenant_subscriptions add column if not exists updated_by uuid null;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='tenant_subscriptions_plan_id_fkey') then
    alter table public.tenant_subscriptions add constraint tenant_subscriptions_plan_id_fkey foreign key(plan_id) references private.saas_plans_v1(id) on delete restrict;
  end if;
  if not exists(select 1 from pg_constraint where conname='tenant_subscriptions_updated_by_fkey') then
    alter table public.tenant_subscriptions add constraint tenant_subscriptions_updated_by_fkey foreign key(updated_by) references auth.users(id) on delete set null;
  end if;
end $$;

alter table public.tenant_subscriptions drop constraint if exists tenant_subscriptions_status_check;
alter table public.tenant_subscriptions add constraint tenant_subscriptions_status_check check(status in ('trial','active','past_due','suspended','cancelled','expired'));
alter table public.tenants drop constraint if exists tenants_subscription_status_check;
alter table public.tenants add constraint tenants_subscription_status_check check(subscription_status in ('trial','active','past_due','suspended','cancelled','expired'));

create unique index if not exists ux_tenant_subscriptions_current_v1 on public.tenant_subscriptions(tenant_id) where status in ('trial','active','past_due','suspended');
create index if not exists idx_tenant_subscriptions_plan_status_v1 on public.tenant_subscriptions(plan_id,status,ends_at);

insert into public.tenant_subscriptions(tenant_id,plan_id,plan_name,plan_price,billing_cycle,starts_at,ends_at,status,next_payment_at,grace_ends_at,auto_suspend,cancel_at_period_end,metadata)
select t.id,p.id,p.name_ar,0,'yearly',coalesce(t.created_at,now()),'2099-12-31 23:59:59+00'::timestamptz,'active',null,'2099-12-31 23:59:59+00'::timestamptz,false,false,jsonb_build_object('source','phase11_platform_seed')
from public.tenants t
join private.saas_plans_v1 p on p.code='platform_internal'
where coalesce((t.settings->>'is_platform_tenant')::boolean,false)
  and not exists(select 1 from public.tenant_subscriptions s where s.tenant_id=t.id and s.status in ('trial','active','past_due','suspended'));

create or replace function private.tenant_subscription_snapshot_v1(p_tenant_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_sub public.tenant_subscriptions%rowtype; v_plan private.saas_plans_v1%rowtype; v_effective text; v_allowed boolean:=true; v_days integer;
begin
  select s.* into v_sub from public.tenant_subscriptions s where s.tenant_id=p_tenant_id order by case when s.status in ('trial','active','past_due','suspended') then 0 else 1 end,s.created_at desc limit 1;
  if v_sub.id is null then
    return jsonb_build_object('managed',false,'allowed',true,'subscription_id',null,'stored_status','legacy_unmanaged','effective_status','legacy_unmanaged','plan_id',null,'plan_code',null,'plan_name',null,'starts_at',null,'ends_at',null,'grace_ends_at',null,'auto_suspend',false,'days_remaining',null);
  end if;
  if v_sub.plan_id is not null then select * into v_plan from private.saas_plans_v1 where id=v_sub.plan_id; end if;
  v_effective:=v_sub.status;
  if v_sub.status in ('cancelled','expired','suspended') then v_allowed:=false;
  elsif v_sub.status='trial' and now()>v_sub.ends_at then v_effective:='expired';v_allowed:=false;
  elsif v_sub.status='active' and now()>v_sub.ends_at then
    v_effective:='past_due';
    if coalesce(v_sub.auto_suspend,true) and (v_sub.grace_ends_at is null or now()>v_sub.grace_ends_at) then v_effective:='suspended';v_allowed:=false; end if;
  elsif v_sub.status='past_due' and coalesce(v_sub.auto_suspend,true) and (v_sub.grace_ends_at is null or now()>v_sub.grace_ends_at) then v_effective:='suspended';v_allowed:=false;
  end if;
  v_days:=ceil(extract(epoch from (v_sub.ends_at-now()))/86400.0)::integer;
  return jsonb_build_object('managed',true,'allowed',v_allowed,'subscription_id',v_sub.id,'stored_status',v_sub.status,'effective_status',v_effective,'plan_id',v_sub.plan_id,'plan_code',v_plan.code,'plan_name',coalesce(v_plan.name_ar,v_sub.plan_name),'starts_at',v_sub.starts_at,'ends_at',v_sub.ends_at,'grace_ends_at',v_sub.grace_ends_at,'auto_suspend',v_sub.auto_suspend,'cancel_at_period_end',v_sub.cancel_at_period_end,'days_remaining',v_days);
end;$$;
revoke all on function private.tenant_subscription_snapshot_v1(uuid) from public,anon,authenticated;
grant execute on function private.tenant_subscription_snapshot_v1(uuid) to service_role;

create or replace function private.tenant_feature_entitled_v1(p_tenant_id uuid,p_feature_key text)
returns boolean language plpgsql stable security definer set search_path=''
as $$ declare v_sub jsonb;v_plan_id uuid;v_enabled boolean; begin
  v_sub:=private.tenant_subscription_snapshot_v1(p_tenant_id);
  if not coalesce((v_sub->>'managed')::boolean,false) then return true; end if;
  if not coalesce((v_sub->>'allowed')::boolean,false) then return false; end if;
  if v_sub->>'plan_id' is null then return true; end if;
  v_plan_id:=(v_sub->>'plan_id')::uuid;
  select e.enabled into v_enabled from private.saas_plan_entitlements_v1 e where e.plan_id=v_plan_id and e.feature_key=p_feature_key;
  return coalesce(v_enabled,false);
end;$$;
revoke all on function private.tenant_feature_entitled_v1(uuid,text) from public,anon,authenticated;
grant execute on function private.tenant_feature_entitled_v1(uuid,text) to service_role;

create or replace function private.tenant_limit_value_v1(p_tenant_id uuid,p_limit_key text)
returns bigint language plpgsql stable security definer set search_path=''
as $$ declare v_sub jsonb;v_plan_id uuid;v_value bigint;v_legacy jsonb; begin
  v_sub:=private.tenant_subscription_snapshot_v1(p_tenant_id);
  if not coalesce((v_sub->>'managed')::boolean,false) or v_sub->>'plan_id' is null then
    select limits into v_legacy from public.tenants where id=p_tenant_id;
    if v_legacy ? p_limit_key and nullif(v_legacy->>p_limit_key,'') is not null then return (v_legacy->>p_limit_key)::bigint; end if;
    return null;
  end if;
  v_plan_id:=(v_sub->>'plan_id')::uuid;
  select l.limit_value into v_value from private.saas_plan_limits_v1 l where l.plan_id=v_plan_id and l.limit_key=p_limit_key;
  return v_value;
end;$$;
revoke all on function private.tenant_limit_value_v1(uuid,text) from public,anon,authenticated;
grant execute on function private.tenant_limit_value_v1(uuid,text) to service_role;

create or replace function private.tenant_plan_usage_v1(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$ declare v_branches bigint;v_users bigint;v_products bigint;v_branch_limit bigint;v_user_limit bigint;v_product_limit bigint; begin
  select count(*) into v_branches from public.branches where tenant_id=p_tenant_id;
  select count(*) into v_users from public.tenant_users where tenant_id=p_tenant_id and coalesce(is_active,true);
  select count(distinct i.product_id) into v_products from public.inventory i join public.branches b on b.id=i.branch_id where b.tenant_id=p_tenant_id;
  v_branch_limit:=private.tenant_limit_value_v1(p_tenant_id,'max_branches');v_user_limit:=private.tenant_limit_value_v1(p_tenant_id,'max_users');v_product_limit:=private.tenant_limit_value_v1(p_tenant_id,'max_products');
  return jsonb_build_object('branches',jsonb_build_object('used',v_branches,'limit',v_branch_limit,'remaining',case when v_branch_limit is null then null else greatest(v_branch_limit-v_branches,0) end),'users',jsonb_build_object('used',v_users,'limit',v_user_limit,'remaining',case when v_user_limit is null then null else greatest(v_user_limit-v_users,0) end),'products',jsonb_build_object('used',v_products,'limit',v_product_limit,'remaining',case when v_product_limit is null then null else greatest(v_product_limit-v_products,0) end));
end;$$;
revoke all on function private.tenant_plan_usage_v1(uuid) from public,anon,authenticated;
grant execute on function private.tenant_plan_usage_v1(uuid) to service_role;

create or replace function private.sync_tenant_legacy_plan_cache_v1(p_tenant_id uuid,p_plan_id uuid)
returns void language plpgsql security definer set search_path=''
as $$ declare v_features jsonb;v_limits jsonb; begin
  select coalesce(jsonb_object_agg(f.feature_key,coalesce(e.enabled,false)),'{}'::jsonb) into v_features from private.saas_feature_catalog_v1 f left join private.saas_plan_entitlements_v1 e on e.feature_key=f.feature_key and e.plan_id=p_plan_id;
  select coalesce(jsonb_object_agg(l.limit_key,pl.limit_value),'{}'::jsonb) into v_limits from private.saas_limit_catalog_v1 l left join private.saas_plan_limits_v1 pl on pl.limit_key=l.limit_key and pl.plan_id=p_plan_id;
  update public.tenants set features=v_features,limits=v_limits,updated_at=now() where id=p_tenant_id;
end;$$;
revoke all on function private.sync_tenant_legacy_plan_cache_v1(uuid,uuid) from public,anon,authenticated;

select private.sync_tenant_legacy_plan_cache_v1(s.tenant_id,s.plan_id) from public.tenant_subscriptions s where s.status in ('trial','active','past_due','suspended') and s.plan_id is not null;

create or replace function private.tenant_runtime_controls_v1(p_tenant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$ declare v_tenant public.tenants%rowtype;v_control private.tenant_platform_controls_v1%rowtype;v_sub jsonb;v_app boolean; begin
  select * into v_tenant from public.tenants where id=p_tenant_id;if v_tenant.id is null then raise exception 'TENANT_NOT_FOUND';end if;
  select * into v_control from private.tenant_platform_controls_v1 where tenant_id=p_tenant_id;v_sub:=private.tenant_subscription_snapshot_v1(p_tenant_id);
  v_app:=v_tenant.status='active' and coalesce((v_sub->>'allowed')::boolean,true) and coalesce(v_control.app_access_enabled,true);
  return jsonb_build_object('tenant_id',v_tenant.id,'tenant_name',v_tenant.name,'subdomain',v_tenant.subdomain,'tenant_status',v_tenant.status,'subscription_status',v_tenant.subscription_status,'subscription_effective_status',v_sub->>'effective_status','subscription_managed',coalesce((v_sub->>'managed')::boolean,false),'subscription_allowed',coalesce((v_sub->>'allowed')::boolean,true),'plan_id',v_sub->'plan_id','plan_code',v_sub->'plan_code','plan_name',v_sub->'plan_name','subscription_ends_at',v_sub->'ends_at','grace_ends_at',v_sub->'grace_ends_at','days_remaining',v_sub->'days_remaining','app_access_enabled',v_app,'online_sales_enabled',v_app and coalesce(v_control.online_sales_enabled,true) and private.tenant_feature_entitled_v1(p_tenant_id,'online_sales'),'pos_enabled',v_app and coalesce(v_control.pos_enabled,true) and private.tenant_feature_entitled_v1(p_tenant_id,'pos'),'admin_enabled',v_app and coalesce(v_control.admin_enabled,true) and private.tenant_feature_entitled_v1(p_tenant_id,'admin'),'customer_app_enabled',v_app and coalesce(v_control.customer_app_enabled,true) and private.tenant_feature_entitled_v1(p_tenant_id,'customer_app'),'delivery_enabled',v_app and coalesce(v_control.delivery_enabled,true) and private.tenant_feature_entitled_v1(p_tenant_id,'delivery'),'block_reason_code',v_control.block_reason_code,'block_reason',v_control.block_reason,'block_message_ar',v_control.block_message_ar,'revision',coalesce(v_control.revision,1),'updated_at',v_control.updated_at);
end;$$;
revoke all on function private.tenant_runtime_controls_v1(uuid) from public,anon,authenticated;
grant execute on function private.tenant_runtime_controls_v1(uuid) to service_role;

create or replace function private.tenant_capability_enabled_v1(p_tenant_id uuid,p_capability text)
returns boolean language plpgsql stable security definer set search_path=''
as $$ declare v jsonb;begin v:=private.tenant_runtime_controls_v1(p_tenant_id);return case p_capability when 'app' then coalesce((v->>'app_access_enabled')::boolean,false) when 'online_sales' then coalesce((v->>'online_sales_enabled')::boolean,false) when 'pos' then coalesce((v->>'pos_enabled')::boolean,false) when 'admin' then coalesce((v->>'admin_enabled')::boolean,false) when 'customer_app' then coalesce((v->>'customer_app_enabled')::boolean,false) when 'delivery' then coalesce((v->>'delivery_enabled')::boolean,false) else false end;end;$$;
revoke all on function private.tenant_capability_enabled_v1(uuid,text) from public,anon,authenticated;
grant execute on function private.tenant_capability_enabled_v1(uuid,text) to service_role;

create or replace function private.assert_tenant_capability_v1(p_tenant_id uuid,p_capability text)
returns void language plpgsql stable security definer set search_path=''
as $$ declare v jsonb;v_sub jsonb;v_control private.tenant_platform_controls_v1%rowtype;v_platform boolean; begin
  v:=private.tenant_runtime_controls_v1(p_tenant_id);v_sub:=private.tenant_subscription_snapshot_v1(p_tenant_id);select * into v_control from private.tenant_platform_controls_v1 where tenant_id=p_tenant_id;
  if not coalesce((v_sub->>'allowed')::boolean,true) then raise exception using errcode='42501',message='SAAS_SUBSCRIPTION_BLOCKED',detail=coalesce(v_sub->>'effective_status','suspended');end if;
  if not coalesce((v->>'app_access_enabled')::boolean,false) then raise exception using errcode='42501',message='SAAS_APP_SUSPENDED',detail=coalesce(v->>'block_message_ar',v->>'block_reason','');end if;
  if p_capability<>'app' and not private.tenant_feature_entitled_v1(p_tenant_id,p_capability) then raise exception using errcode='42501',message='SAAS_FEATURE_NOT_INCLUDED',detail=p_capability;end if;
  v_platform:=case p_capability when 'online_sales' then coalesce(v_control.online_sales_enabled,true) when 'pos' then coalesce(v_control.pos_enabled,true) when 'admin' then coalesce(v_control.admin_enabled,true) when 'customer_app' then coalesce(v_control.customer_app_enabled,true) when 'delivery' then coalesce(v_control.delivery_enabled,true) when 'app' then coalesce(v_control.app_access_enabled,true) else false end;
  if not v_platform then raise exception using errcode='42501',message='SAAS_CAPABILITY_DISABLED',detail=coalesce(v->>'block_message_ar',v->>'block_reason',p_capability);end if;
end;$$;
revoke all on function private.assert_tenant_capability_v1(uuid,text) from public,anon,authenticated;
grant execute on function private.assert_tenant_capability_v1(uuid,text) to service_role;

create or replace function public.get_saas_control_center_v2()
returns jsonb language plpgsql stable security definer set search_path=''
as $$ begin
  if auth.uid() is null or not public.is_super_admin() then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED';end if;
  return jsonb_build_object('summary',jsonb_build_object('tenant_count',(select count(*) from public.tenants),'active_tenant_count',(select count(*) from public.tenants t where private.tenant_capability_enabled_v1(t.id,'app')),'suspended_tenant_count',(select count(*) from public.tenants t where not private.tenant_capability_enabled_v1(t.id,'app')),'online_sales_enabled_count',(select count(*) from public.tenants t where private.tenant_capability_enabled_v1(t.id,'online_sales')),'past_due_count',(select count(*) from public.tenants t where private.tenant_subscription_snapshot_v1(t.id)->>'effective_status'='past_due'),'subscription_blocked_count',(select count(*) from public.tenants t where not coalesce((private.tenant_subscription_snapshot_v1(t.id)->>'allowed')::boolean,true))),'plans',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'name_ar',p.name_ar,'name_en',p.name_en,'description_ar',p.description_ar,'currency',p.currency,'monthly_price',p.monthly_price,'yearly_price',p.yearly_price,'is_active',p.is_active,'is_internal',p.is_internal,'sort_order',p.sort_order,'features',coalesce((select jsonb_object_agg(e.feature_key,e.enabled) from private.saas_plan_entitlements_v1 e where e.plan_id=p.id),'{}'::jsonb),'limits',coalesce((select jsonb_object_agg(l.limit_key,l.limit_value) from private.saas_plan_limits_v1 l where l.plan_id=p.id),'{}'::jsonb)) order by p.sort_order,p.created_at) from private.saas_plans_v1 p),'[]'::jsonb),'feature_catalog',coalesce((select jsonb_agg(to_jsonb(f) order by f.category,f.feature_key) from private.saas_feature_catalog_v1 f),'[]'::jsonb),'limit_catalog',coalesce((select jsonb_agg(to_jsonb(l) order by l.limit_key) from private.saas_limit_catalog_v1 l),'[]'::jsonb),'tenants',coalesce((select jsonb_agg(private.tenant_runtime_controls_v1(t.id)||jsonb_build_object('contact_email',t.contact_email,'contact_phone',t.contact_phone,'country',t.country,'created_at',t.created_at,'usage',private.tenant_plan_usage_v1(t.id),'subscription',private.tenant_subscription_snapshot_v1(t.id)) order by t.created_at) from public.tenants t),'[]'::jsonb),'generated_at',now());
end;$$;
revoke all on function public.get_saas_control_center_v2() from public,anon;
grant execute on function public.get_saas_control_center_v2() to authenticated,service_role;

create or replace function public.upsert_saas_plan_v1(p_plan_id uuid default null,p_code text default null,p_name_ar text default null,p_name_en text default null,p_description_ar text default null,p_monthly_price numeric default 0,p_yearly_price numeric default 0,p_currency text default 'EGP',p_is_active boolean default true,p_features jsonb default '{}'::jsonb,p_limits jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v_id uuid;v_internal boolean;v_plan jsonb;begin
  if auth.uid() is null or not public.is_super_admin() then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED';end if;
  if p_monthly_price<0 or p_yearly_price<0 then raise exception 'INVALID_PLAN_PRICE';end if;
  if p_features is null or jsonb_typeof(p_features)<>'object' then raise exception 'INVALID_PLAN_FEATURES';end if;
  if p_limits is null or jsonb_typeof(p_limits)<>'object' then raise exception 'INVALID_PLAN_LIMITS';end if;
  if exists(select 1 from jsonb_object_keys(p_features) k where not exists(select 1 from private.saas_feature_catalog_v1 f where f.feature_key=k)) then raise exception 'UNKNOWN_PLAN_FEATURE';end if;
  if exists(select 1 from jsonb_each(p_features) e where jsonb_typeof(e.value)<>'boolean') then raise exception 'INVALID_PLAN_FEATURE_VALUE';end if;
  if exists(select 1 from jsonb_object_keys(p_limits) k where not exists(select 1 from private.saas_limit_catalog_v1 l where l.limit_key=k)) then raise exception 'UNKNOWN_PLAN_LIMIT';end if;
  if p_plan_id is null then
    if nullif(btrim(coalesce(p_code,'')),'') is null or lower(btrim(p_code)) !~ '^[a-z0-9_]+$' then raise exception 'INVALID_PLAN_CODE';end if;
    if nullif(btrim(coalesce(p_name_ar,'')),'') is null then raise exception 'PLAN_NAME_REQUIRED';end if;
    insert into private.saas_plans_v1(code,name_ar,name_en,description_ar,currency,monthly_price,yearly_price,is_active,is_internal,created_by,updated_by) values(lower(btrim(p_code)),btrim(p_name_ar),nullif(btrim(coalesce(p_name_en,'')),''),nullif(btrim(coalesce(p_description_ar,'')),''),upper(btrim(coalesce(p_currency,'EGP'))),p_monthly_price,p_yearly_price,coalesce(p_is_active,true),false,auth.uid(),auth.uid()) returning id into v_id;
  else
    select is_internal into v_internal from private.saas_plans_v1 where id=p_plan_id for update;if v_internal is null then raise exception 'PLAN_NOT_FOUND';end if;if v_internal then raise exception 'INTERNAL_PLAN_IMMUTABLE';end if;
    update private.saas_plans_v1 set code=coalesce(nullif(lower(btrim(coalesce(p_code,''))),''),code),name_ar=coalesce(nullif(btrim(coalesce(p_name_ar,'')),''),name_ar),name_en=nullif(btrim(coalesce(p_name_en,'')),''),description_ar=nullif(btrim(coalesce(p_description_ar,'')),''),currency=upper(btrim(coalesce(p_currency,currency))),monthly_price=p_monthly_price,yearly_price=p_yearly_price,is_active=coalesce(p_is_active,is_active),updated_by=auth.uid(),updated_at=now() where id=p_plan_id returning id into v_id;
  end if;
  delete from private.saas_plan_entitlements_v1 where plan_id=v_id;insert into private.saas_plan_entitlements_v1(plan_id,feature_key,enabled) select v_id,f.feature_key,coalesce((p_features->>f.feature_key)::boolean,false) from private.saas_feature_catalog_v1 f;
  delete from private.saas_plan_limits_v1 where plan_id=v_id;insert into private.saas_plan_limits_v1(plan_id,limit_key,limit_value) select v_id,l.limit_key,case when not (p_limits ? l.limit_key) or p_limits->l.limit_key='null'::jsonb then null else (p_limits->>l.limit_key)::bigint end from private.saas_limit_catalog_v1 l;
  perform private.sync_tenant_legacy_plan_cache_v1(s.tenant_id,v_id) from public.tenant_subscriptions s where s.plan_id=v_id and s.status in ('trial','active','past_due','suspended');
  select jsonb_build_object('id',p.id,'code',p.code,'name_ar',p.name_ar,'name_en',p.name_en,'description_ar',p.description_ar,'currency',p.currency,'monthly_price',p.monthly_price,'yearly_price',p.yearly_price,'is_active',p.is_active,'is_internal',p.is_internal,'features',coalesce((select jsonb_object_agg(e.feature_key,e.enabled) from private.saas_plan_entitlements_v1 e where e.plan_id=p.id),'{}'::jsonb),'limits',coalesce((select jsonb_object_agg(l.limit_key,l.limit_value) from private.saas_plan_limits_v1 l where l.plan_id=p.id),'{}'::jsonb)) into v_plan from private.saas_plans_v1 p where p.id=v_id;return v_plan;
end;$$;
revoke all on function public.upsert_saas_plan_v1(uuid,text,text,text,text,numeric,numeric,text,boolean,jsonb,jsonb) from public,anon;
grant execute on function public.upsert_saas_plan_v1(uuid,text,text,text,text,numeric,numeric,text,boolean,jsonb,jsonb) to authenticated,service_role;

create or replace function public.assign_tenant_subscription_v1(p_tenant_id uuid,p_plan_id uuid,p_billing_cycle text default 'monthly',p_status text default 'active',p_starts_at timestamptz default null,p_ends_at timestamptz default null,p_grace_days integer default 0,p_auto_suspend boolean default true)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v_plan private.saas_plans_v1%rowtype;v_start timestamptz;v_end timestamptz;v_grace timestamptz;v_price numeric;v_id uuid;v_before jsonb;begin
  if auth.uid() is null or not public.is_super_admin() then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED';end if;if not exists(select 1 from public.tenants where id=p_tenant_id) then raise exception 'TENANT_NOT_FOUND';end if;
  select * into v_plan from private.saas_plans_v1 where id=p_plan_id and (is_active or is_internal);if v_plan.id is null then raise exception 'PLAN_NOT_FOUND_OR_INACTIVE';end if;if p_billing_cycle not in ('monthly','yearly') then raise exception 'INVALID_BILLING_CYCLE';end if;if p_status not in ('trial','active','past_due','suspended') then raise exception 'INVALID_SUBSCRIPTION_STATUS';end if;
  v_start:=coalesce(p_starts_at,now());v_end:=coalesce(p_ends_at,case when p_billing_cycle='yearly' then v_start+interval '1 year' else v_start+interval '1 month' end);if v_end<=v_start then raise exception 'INVALID_SUBSCRIPTION_PERIOD';end if;v_grace:=v_end+make_interval(days=>greatest(coalesce(p_grace_days,0),0));v_price:=case when p_billing_cycle='yearly' then v_plan.yearly_price else v_plan.monthly_price end;
  select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) into v_before from public.tenant_subscriptions s where s.tenant_id=p_tenant_id and s.status in ('trial','active','past_due','suspended');
  update public.tenant_subscriptions set status='cancelled',updated_at=now(),updated_by=auth.uid(),metadata=metadata||jsonb_build_object('replaced_at',now()) where tenant_id=p_tenant_id and status in ('trial','active','past_due','suspended');
  insert into public.tenant_subscriptions(tenant_id,plan_id,plan_name,plan_price,billing_cycle,starts_at,ends_at,status,next_payment_at,grace_ends_at,auto_suspend,cancel_at_period_end,updated_by,metadata) values(p_tenant_id,v_plan.id,v_plan.name_ar,v_price,p_billing_cycle,v_start,v_end,p_status,case when p_status in ('active','past_due') and not v_plan.is_internal then v_end else null end,v_grace,case when v_plan.is_internal then false else coalesce(p_auto_suspend,true) end,false,auth.uid(),jsonb_build_object('assigned_from','saas_control_center_v1')) returning id into v_id;
  update public.tenants set subscription_status=p_status,trial_ends_at=case when p_status='trial' then v_end else null end,updated_at=now() where id=p_tenant_id;perform private.sync_tenant_legacy_plan_cache_v1(p_tenant_id,v_plan.id);
  insert into private.tenant_subscription_events_v1(tenant_id,subscription_id,actor_user_id,event_type,before_state,after_state,reason) values(p_tenant_id,v_id,auth.uid(),'subscription_assigned',v_before,(select to_jsonb(s) from public.tenant_subscriptions s where s.id=v_id),'Plan assignment');
  return jsonb_build_object('runtime',private.tenant_runtime_controls_v1(p_tenant_id),'subscription',private.tenant_subscription_snapshot_v1(p_tenant_id),'usage',private.tenant_plan_usage_v1(p_tenant_id));
end;$$;
revoke all on function public.assign_tenant_subscription_v1(uuid,uuid,text,text,timestamptz,timestamptz,integer,boolean) from public,anon;
grant execute on function public.assign_tenant_subscription_v1(uuid,uuid,text,text,timestamptz,timestamptz,integer,boolean) to authenticated,service_role;

create or replace function public.set_tenant_subscription_status_v1(p_tenant_id uuid,p_status text,p_reason text default null,p_grace_ends_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare v_sub public.tenant_subscriptions%rowtype;v_before jsonb;begin
  if auth.uid() is null or not public.is_super_admin() then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED';end if;if p_status not in ('trial','active','past_due','suspended','cancelled','expired') then raise exception 'INVALID_SUBSCRIPTION_STATUS';end if;
  select * into v_sub from public.tenant_subscriptions where tenant_id=p_tenant_id order by case when status in ('trial','active','past_due','suspended') then 0 else 1 end,created_at desc limit 1 for update;if v_sub.id is null then raise exception 'SUBSCRIPTION_NOT_FOUND';end if;v_before:=to_jsonb(v_sub);
  update public.tenant_subscriptions set status=p_status,grace_ends_at=coalesce(p_grace_ends_at,grace_ends_at),suspended_at=case when p_status='suspended' then coalesce(suspended_at,now()) when p_status='active' then null else suspended_at end,suspended_reason=case when p_status='suspended' then nullif(btrim(coalesce(p_reason,'')),'') when p_status='active' then null else suspended_reason end,updated_at=now(),updated_by=auth.uid() where id=v_sub.id;
  update public.tenants set subscription_status=p_status,trial_ends_at=case when p_status='trial' then v_sub.ends_at else null end,updated_at=now() where id=p_tenant_id;
  insert into private.tenant_subscription_events_v1(tenant_id,subscription_id,actor_user_id,event_type,before_state,after_state,reason) values(p_tenant_id,v_sub.id,auth.uid(),'subscription_status_changed',v_before,(select to_jsonb(s) from public.tenant_subscriptions s where s.id=v_sub.id),nullif(btrim(coalesce(p_reason,'')),''));
  return jsonb_build_object('runtime',private.tenant_runtime_controls_v1(p_tenant_id),'subscription',private.tenant_subscription_snapshot_v1(p_tenant_id),'usage',private.tenant_plan_usage_v1(p_tenant_id));
end;$$;
revoke all on function public.set_tenant_subscription_status_v1(uuid,text,text,timestamptz) from public,anon;
grant execute on function public.set_tenant_subscription_status_v1(uuid,text,text,timestamptz) to authenticated,service_role;

create or replace function private.reconcile_saas_subscriptions_v1()
returns integer language plpgsql security definer set search_path=''
as $$ declare r record;v_snap jsonb;v_eff text;v_count integer:=0;v_before jsonb;begin
  for r in select id,tenant_id,status from public.tenant_subscriptions where status in ('trial','active','past_due','suspended') loop
    v_snap:=private.tenant_subscription_snapshot_v1(r.tenant_id);v_eff:=v_snap->>'effective_status';
    if v_eff is distinct from r.status and v_eff in ('past_due','suspended','expired') then
      select to_jsonb(s) into v_before from public.tenant_subscriptions s where s.id=r.id;
      update public.tenant_subscriptions set status=v_eff,suspended_at=case when v_eff='suspended' then coalesce(suspended_at,now()) else suspended_at end,suspended_reason=case when v_eff='suspended' then coalesce(suspended_reason,'auto_suspend_after_grace') else suspended_reason end,updated_at=now() where id=r.id;
      update public.tenants set subscription_status=v_eff,updated_at=now() where id=r.tenant_id;
      insert into private.tenant_subscription_events_v1(tenant_id,subscription_id,event_type,before_state,after_state,reason) values(r.tenant_id,r.id,'subscription_auto_reconciled',v_before,(select to_jsonb(s) from public.tenant_subscriptions s where s.id=r.id),'automatic lifecycle reconciliation');v_count:=v_count+1;
    end if;
  end loop;return v_count;
end;$$;
revoke all on function private.reconcile_saas_subscriptions_v1() from public,anon,authenticated;
grant execute on function private.reconcile_saas_subscriptions_v1() to service_role;

select cron.schedule('saas-subscription-reconcile-v1','*/15 * * * *',$cron$select private.reconcile_saas_subscriptions_v1();$cron$);

create or replace function private.assert_saas_limit_v1(p_tenant_id uuid,p_limit_key text,p_prospective bigint)
returns void language plpgsql stable security definer set search_path=''
as $$ declare v_limit bigint;begin v_limit:=private.tenant_limit_value_v1(p_tenant_id,p_limit_key);if v_limit is not null and p_prospective>v_limit then raise exception using errcode='P0001',message='SAAS_LIMIT_EXCEEDED',detail=jsonb_build_object('limit_key',p_limit_key,'limit',v_limit,'requested',p_prospective)::text;end if;end;$$;
revoke all on function private.assert_saas_limit_v1(uuid,text,bigint) from public,anon,authenticated;

create or replace function private.resolve_saas_default_tenant_v1()
returns uuid language plpgsql stable security definer set search_path=''
as $$ declare v_id uuid;v_count integer;begin select count(*) into v_count from public.tenants;if v_count=1 then select id into v_id from public.tenants limit 1;return v_id;end if;select id into v_id from public.tenants where coalesce((settings->>'is_platform_tenant')::boolean,false) order by created_at limit 1;return v_id;end;$$;
revoke all on function private.resolve_saas_default_tenant_v1() from public,anon,authenticated;

create or replace function private.guard_saas_pos_sale_v1()
returns trigger language plpgsql security definer set search_path=''
as $$ declare v_tenant uuid;begin if auth.uid() is not null and public.is_super_admin() then return new;end if;if new.branch_id is not null then select tenant_id into v_tenant from public.branches where id=new.branch_id;end if;v_tenant:=coalesce(v_tenant,private.resolve_saas_default_tenant_v1());if v_tenant is not null then perform private.assert_tenant_capability_v1(v_tenant,'pos');end if;return new;end;$$;
revoke all on function private.guard_saas_pos_sale_v1() from public,anon,authenticated;
drop trigger if exists zzzz_guard_saas_pos_sale_v1 on public.sales;
create trigger zzzz_guard_saas_pos_sale_v1 before insert on public.sales for each row execute function private.guard_saas_pos_sale_v1();

create or replace function private.guard_saas_pos_shift_v1()
returns trigger language plpgsql security definer set search_path=''
as $$ declare v_branch uuid;v_tenant uuid;begin if auth.uid() is not null and public.is_super_admin() then return case when tg_op='DELETE' then old else new end;end if;v_branch:=case when tg_op='DELETE' then old.branch_id else new.branch_id end;if v_branch is not null then select tenant_id into v_tenant from public.branches where id=v_branch;end if;v_tenant:=coalesce(v_tenant,private.resolve_saas_default_tenant_v1());if v_tenant is not null then perform private.assert_tenant_capability_v1(v_tenant,'pos');end if;return case when tg_op='DELETE' then old else new end;end;$$;
revoke all on function private.guard_saas_pos_shift_v1() from public,anon,authenticated;
drop trigger if exists zzzz_guard_saas_pos_shift_v1 on public.pos_shifts;
create trigger zzzz_guard_saas_pos_shift_v1 before insert or update or delete on public.pos_shifts for each row execute function private.guard_saas_pos_shift_v1();

create or replace function private.guard_saas_branch_admin_v1()
returns trigger language plpgsql security definer set search_path=''
as $$ declare v_tenant uuid;v_count bigint;begin v_tenant:=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end;if auth.uid() is null or not public.is_super_admin() then if v_tenant is not null then perform private.assert_tenant_capability_v1(v_tenant,'admin');end if;end if;if tg_op='INSERT' or (tg_op='UPDATE' and new.tenant_id is distinct from old.tenant_id) then select count(*)+1 into v_count from public.branches where tenant_id=new.tenant_id and (tg_op<>'UPDATE' or id<>old.id);perform private.assert_saas_limit_v1(new.tenant_id,'max_branches',v_count);end if;return case when tg_op='DELETE' then old else new end;end;$$;
revoke all on function private.guard_saas_branch_admin_v1() from public,anon,authenticated;
drop trigger if exists zzzz_guard_saas_branch_admin_v1 on public.branches;
create trigger zzzz_guard_saas_branch_admin_v1 before insert or update or delete on public.branches for each row execute function private.guard_saas_branch_admin_v1();

create or replace function private.guard_saas_tenant_user_v1()
returns trigger language plpgsql security definer set search_path=''
as $$ declare v_tenant uuid;v_count bigint;v_needs_slot boolean:=false;begin v_tenant:=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end;if auth.uid() is null or not public.is_super_admin() then if v_tenant is not null then perform private.assert_tenant_capability_v1(v_tenant,'admin');end if;end if;if tg_op='INSERT' then v_needs_slot:=coalesce(new.is_active,true);elsif tg_op='UPDATE' then v_needs_slot:=coalesce(new.is_active,true) and (new.tenant_id is distinct from old.tenant_id or not coalesce(old.is_active,true));end if;if v_needs_slot then select count(*)+1 into v_count from public.tenant_users where tenant_id=new.tenant_id and coalesce(is_active,true) and (tg_op<>'UPDATE' or id<>old.id);perform private.assert_saas_limit_v1(new.tenant_id,'max_users',v_count);end if;return case when tg_op='DELETE' then old else new end;end;$$;
revoke all on function private.guard_saas_tenant_user_v1() from public,anon,authenticated;
drop trigger if exists zzzz_guard_saas_tenant_user_v1 on public.tenant_users;
create trigger zzzz_guard_saas_tenant_user_v1 before insert or update or delete on public.tenant_users for each row execute function private.guard_saas_tenant_user_v1();

create or replace function private.guard_saas_inventory_product_limit_v1()
returns trigger language plpgsql security definer set search_path=''
as $$ declare v_tenant uuid;v_count bigint;begin select tenant_id into v_tenant from public.branches where id=new.branch_id;if v_tenant is null then return new;end if;select count(distinct q.product_id) into v_count from (select i.product_id from public.inventory i join public.branches b on b.id=i.branch_id where b.tenant_id=v_tenant and (tg_op<>'UPDATE' or i.id<>old.id) union all select new.product_id) q;perform private.assert_saas_limit_v1(v_tenant,'max_products',v_count);return new;end;$$;
revoke all on function private.guard_saas_inventory_product_limit_v1() from public,anon,authenticated;
drop trigger if exists zzzz_guard_saas_inventory_product_limit_v1 on public.inventory;
create trigger zzzz_guard_saas_inventory_product_limit_v1 before insert or update of product_id,branch_id on public.inventory for each row execute function private.guard_saas_inventory_product_limit_v1();

create or replace function private.guard_saas_admin_generic_v1()
returns trigger language plpgsql security definer set search_path=''
as $$ declare v_branch uuid;v_tenant uuid;v_row jsonb;begin if auth.uid() is not null and public.is_super_admin() then return case when tg_op='DELETE' then old else new end;end if;v_row:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;if v_row ? 'branch_id' and nullif(v_row->>'branch_id','') is not null then v_branch:=(v_row->>'branch_id')::uuid;end if;if v_branch is not null then select tenant_id into v_tenant from public.branches where id=v_branch;end if;v_tenant:=coalesce(v_tenant,private.resolve_saas_default_tenant_v1());if v_tenant is not null then perform private.assert_tenant_capability_v1(v_tenant,'admin');end if;return case when tg_op='DELETE' then old else new end;end;$$;
revoke all on function private.guard_saas_admin_generic_v1() from public,anon,authenticated;
drop trigger if exists zzzz_guard_saas_products_admin_v1 on public.products;
create trigger zzzz_guard_saas_products_admin_v1 before insert or update or delete on public.products for each row execute function private.guard_saas_admin_generic_v1();
drop trigger if exists zzzz_guard_saas_pricing_admin_v1 on public.branch_product_pricing;
create trigger zzzz_guard_saas_pricing_admin_v1 before insert or update or delete on public.branch_product_pricing for each row execute function private.guard_saas_admin_generic_v1();
drop trigger if exists zzzz_guard_saas_purchases_admin_v1 on public.purchases;
create trigger zzzz_guard_saas_purchases_admin_v1 before insert or update or delete on public.purchases for each row execute function private.guard_saas_admin_generic_v1();
drop trigger if exists zzzz_guard_saas_suppliers_admin_v1 on public.suppliers;
create trigger zzzz_guard_saas_suppliers_admin_v1 before insert or update or delete on public.suppliers for each row execute function private.guard_saas_admin_generic_v1();

create or replace function private.guard_saas_delivery_driver_status_v1()
returns trigger language plpgsql security definer set search_path=''
as $$ declare v_tenant uuid;begin if auth.uid() is not null and public.is_super_admin() then return case when tg_op='DELETE' then old else new end;end if;select tenant_id into v_tenant from public.branches where id=(case when tg_op='DELETE' then old.branch_id else new.branch_id end);if v_tenant is not null then perform private.assert_tenant_capability_v1(v_tenant,'delivery');end if;return case when tg_op='DELETE' then old else new end;end;$$;
revoke all on function private.guard_saas_delivery_driver_status_v1() from public,anon,authenticated;
drop trigger if exists zzzz_guard_saas_delivery_driver_status_v1 on private.delivery_driver_status_v1;
create trigger zzzz_guard_saas_delivery_driver_status_v1 before insert or update or delete on private.delivery_driver_status_v1 for each row execute function private.guard_saas_delivery_driver_status_v1();
