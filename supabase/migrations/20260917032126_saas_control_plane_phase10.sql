create table if not exists private.tenant_platform_controls_v1 (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  app_access_enabled boolean not null default true,
  online_sales_enabled boolean not null default true,
  pos_enabled boolean not null default true,
  admin_enabled boolean not null default true,
  customer_app_enabled boolean not null default true,
  delivery_enabled boolean not null default true,
  block_reason_code text null check (block_reason_code is null or block_reason_code in ('manual','billing','security','maintenance','policy','other')),
  block_reason text null,
  block_message_ar text null,
  revision bigint not null default 1 check (revision > 0),
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table private.tenant_platform_controls_v1 enable row level security;
revoke all on table private.tenant_platform_controls_v1 from public, anon, authenticated;
grant select on table private.tenant_platform_controls_v1 to service_role;

create table if not exists private.tenant_platform_control_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  action text not null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  reason text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tenant_platform_control_audit_tenant_created
  on private.tenant_platform_control_audit_v1(tenant_id, created_at desc);

alter table private.tenant_platform_control_audit_v1 enable row level security;
revoke all on table private.tenant_platform_control_audit_v1 from public, anon, authenticated;
grant select on table private.tenant_platform_control_audit_v1 to service_role;

insert into private.tenant_platform_controls_v1(tenant_id)
select t.id from public.tenants t
on conflict (tenant_id) do nothing;

create or replace function private.tenant_runtime_controls_v1(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_tenant public.tenants%rowtype;
  v_control private.tenant_platform_controls_v1%rowtype;
  v_app boolean;
begin
  select * into v_tenant from public.tenants where id=p_tenant_id;
  if v_tenant.id is null then raise exception 'TENANT_NOT_FOUND'; end if;

  select * into v_control from private.tenant_platform_controls_v1 where tenant_id=p_tenant_id;
  v_app := v_tenant.status='active' and coalesce(v_control.app_access_enabled,true);

  return jsonb_build_object(
    'tenant_id',v_tenant.id,
    'tenant_name',v_tenant.name,
    'subdomain',v_tenant.subdomain,
    'tenant_status',v_tenant.status,
    'subscription_status',v_tenant.subscription_status,
    'app_access_enabled',v_app,
    'online_sales_enabled',v_app and coalesce(v_control.online_sales_enabled,true),
    'pos_enabled',v_app and coalesce(v_control.pos_enabled,true),
    'admin_enabled',v_app and coalesce(v_control.admin_enabled,true),
    'customer_app_enabled',v_app and coalesce(v_control.customer_app_enabled,true),
    'delivery_enabled',v_app and coalesce(v_control.delivery_enabled,true),
    'block_reason_code',v_control.block_reason_code,
    'block_reason',v_control.block_reason,
    'block_message_ar',v_control.block_message_ar,
    'revision',coalesce(v_control.revision,1),
    'updated_at',v_control.updated_at
  );
end;
$$;

revoke all on function private.tenant_runtime_controls_v1(uuid) from public, anon, authenticated;
grant execute on function private.tenant_runtime_controls_v1(uuid) to service_role;

create or replace function private.tenant_capability_enabled_v1(p_tenant_id uuid,p_capability text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare v jsonb;
begin
  v:=private.tenant_runtime_controls_v1(p_tenant_id);
  return case p_capability
    when 'app' then coalesce((v->>'app_access_enabled')::boolean,false)
    when 'online_sales' then coalesce((v->>'online_sales_enabled')::boolean,false)
    when 'pos' then coalesce((v->>'pos_enabled')::boolean,false)
    when 'admin' then coalesce((v->>'admin_enabled')::boolean,false)
    when 'customer_app' then coalesce((v->>'customer_app_enabled')::boolean,false)
    when 'delivery' then coalesce((v->>'delivery_enabled')::boolean,false)
    else false
  end;
end;
$$;

revoke all on function private.tenant_capability_enabled_v1(uuid,text) from public, anon, authenticated;
grant execute on function private.tenant_capability_enabled_v1(uuid,text) to service_role;

create or replace function private.assert_tenant_capability_v1(p_tenant_id uuid,p_capability text)
returns void
language plpgsql
stable
security definer
set search_path=''
as $$
declare v jsonb;
begin
  v:=private.tenant_runtime_controls_v1(p_tenant_id);
  if not coalesce((v->>'app_access_enabled')::boolean,false) then
    raise exception using errcode='42501',message='SAAS_APP_SUSPENDED',detail=coalesce(v->>'block_message_ar',v->>'block_reason','');
  end if;
  if not private.tenant_capability_enabled_v1(p_tenant_id,p_capability) then
    raise exception using errcode='42501',message='SAAS_CAPABILITY_DISABLED',detail=coalesce(v->>'block_message_ar',v->>'block_reason','');
  end if;
end;
$$;

revoke all on function private.assert_tenant_capability_v1(uuid,text) from public, anon, authenticated;
grant execute on function private.assert_tenant_capability_v1(uuid,text) to service_role;

create or replace function public.get_tenant_public_runtime_v1(p_subdomain text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_tenant_id uuid; v jsonb;
begin
  select id into v_tenant_id from public.tenants where lower(subdomain)=lower(btrim(p_subdomain)) limit 1;
  if v_tenant_id is null then raise exception 'TENANT_NOT_FOUND'; end if;
  v:=private.tenant_runtime_controls_v1(v_tenant_id);
  return jsonb_build_object(
    'tenant_id',v->'tenant_id',
    'tenant_name',v->'tenant_name',
    'subdomain',v->'subdomain',
    'app_access_enabled',v->'app_access_enabled',
    'online_sales_enabled',v->'online_sales_enabled',
    'customer_app_enabled',v->'customer_app_enabled',
    'block_reason_code',v->'block_reason_code',
    'block_message_ar',v->'block_message_ar',
    'revision',v->'revision'
  );
end;
$$;
revoke all on function public.get_tenant_public_runtime_v1(text) from public;
grant execute on function public.get_tenant_public_runtime_v1(text) to anon,authenticated,service_role;

create or replace function public.get_my_tenant_runtime_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_tenant_id uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if public.is_super_admin() then
    select id into v_tenant_id from public.tenants order by coalesce((settings->>'is_platform_tenant')::boolean,false) desc,created_at limit 1;
  else
    select tenant_id into v_tenant_id from public.tenant_users
    where user_id=auth.uid() and coalesce(is_active,true)
    order by created_at limit 1;
  end if;
  if v_tenant_id is null then raise exception using errcode='42501',message='TENANT_ACCESS_REQUIRED'; end if;
  return private.tenant_runtime_controls_v1(v_tenant_id);
end;
$$;
revoke all on function public.get_my_tenant_runtime_v1() from public,anon;
grant execute on function public.get_my_tenant_runtime_v1() to authenticated,service_role;

create or replace function public.get_saas_control_center_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED';
  end if;
  return jsonb_build_object(
    'summary',jsonb_build_object(
      'tenant_count',(select count(*) from public.tenants),
      'active_tenant_count',(select count(*) from public.tenants t where private.tenant_capability_enabled_v1(t.id,'app')),
      'suspended_tenant_count',(select count(*) from public.tenants t where not private.tenant_capability_enabled_v1(t.id,'app')),
      'online_sales_enabled_count',(select count(*) from public.tenants t where private.tenant_capability_enabled_v1(t.id,'online_sales'))
    ),
    'tenants',coalesce((
      select jsonb_agg(
        private.tenant_runtime_controls_v1(t.id)
        || jsonb_build_object(
          'contact_email',t.contact_email,
          'contact_phone',t.contact_phone,
          'country',t.country,
          'created_at',t.created_at,
          'branch_count',(select count(*) from public.branches b where b.tenant_id=t.id),
          'user_count',(select count(*) from public.tenant_users tu where tu.tenant_id=t.id and coalesce(tu.is_active,true)),
          'latest_subscription',(select to_jsonb(s) from public.tenant_subscriptions s where s.tenant_id=t.id order by s.created_at desc limit 1)
        ) order by t.created_at
      ) from public.tenants t
    ),'[]'::jsonb),
    'generated_at',now()
  );
end;
$$;
revoke all on function public.get_saas_control_center_v1() from public,anon;
grant execute on function public.get_saas_control_center_v1() to authenticated,service_role;

create or replace function public.set_tenant_platform_controls_v1(
  p_tenant_id uuid,
  p_app_access_enabled boolean default null,
  p_online_sales_enabled boolean default null,
  p_pos_enabled boolean default null,
  p_admin_enabled boolean default null,
  p_customer_app_enabled boolean default null,
  p_delivery_enabled boolean default null,
  p_block_reason_code text default null,
  p_block_reason text default null,
  p_block_message_ar text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_any_disabled boolean;
  v_reason text;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED';
  end if;
  if not exists(select 1 from public.tenants where id=p_tenant_id) then raise exception 'TENANT_NOT_FOUND'; end if;
  if p_block_reason_code is not null and p_block_reason_code not in ('manual','billing','security','maintenance','policy','other') then
    raise exception 'INVALID_BLOCK_REASON_CODE';
  end if;

  insert into private.tenant_platform_controls_v1(tenant_id) values(p_tenant_id)
  on conflict(tenant_id) do nothing;

  select to_jsonb(c) into v_before from private.tenant_platform_controls_v1 c where c.tenant_id=p_tenant_id for update;

  v_any_disabled := not coalesce(p_app_access_enabled,(v_before->>'app_access_enabled')::boolean)
    or not coalesce(p_online_sales_enabled,(v_before->>'online_sales_enabled')::boolean)
    or not coalesce(p_pos_enabled,(v_before->>'pos_enabled')::boolean)
    or not coalesce(p_admin_enabled,(v_before->>'admin_enabled')::boolean)
    or not coalesce(p_customer_app_enabled,(v_before->>'customer_app_enabled')::boolean)
    or not coalesce(p_delivery_enabled,(v_before->>'delivery_enabled')::boolean);

  v_reason:=nullif(btrim(coalesce(p_block_reason,v_before->>'block_reason','')),'');
  if v_any_disabled and v_reason is null then raise exception 'BLOCK_REASON_REQUIRED'; end if;

  update private.tenant_platform_controls_v1 c set
    app_access_enabled=coalesce(p_app_access_enabled,c.app_access_enabled),
    online_sales_enabled=coalesce(p_online_sales_enabled,c.online_sales_enabled),
    pos_enabled=coalesce(p_pos_enabled,c.pos_enabled),
    admin_enabled=coalesce(p_admin_enabled,c.admin_enabled),
    customer_app_enabled=coalesce(p_customer_app_enabled,c.customer_app_enabled),
    delivery_enabled=coalesce(p_delivery_enabled,c.delivery_enabled),
    block_reason_code=case when v_any_disabled then coalesce(p_block_reason_code,c.block_reason_code,'manual') else null end,
    block_reason=case when v_any_disabled then v_reason else null end,
    block_message_ar=case when v_any_disabled then nullif(btrim(coalesce(p_block_message_ar,c.block_message_ar,'')),'') else null end,
    revision=c.revision+1,
    updated_by=auth.uid(),
    updated_at=now()
  where c.tenant_id=p_tenant_id;

  select to_jsonb(c) into v_after from private.tenant_platform_controls_v1 c where c.tenant_id=p_tenant_id;
  insert into private.tenant_platform_control_audit_v1(tenant_id,actor_user_id,action,before_state,after_state,reason)
  values(p_tenant_id,auth.uid(),'platform_controls_updated',v_before,v_after,v_reason);

  return private.tenant_runtime_controls_v1(p_tenant_id);
end;
$$;
revoke all on function public.set_tenant_platform_controls_v1(uuid,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text) from public,anon;
grant execute on function public.set_tenant_platform_controls_v1(uuid,boolean,boolean,boolean,boolean,boolean,boolean,text,text,text) to authenticated,service_role;

create or replace function private.guard_online_order_tenant_runtime_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_tenant_id uuid;
begin
  if coalesce(new.source_channel,'online') not in ('online','marketplace') then return new; end if;
  v_tenant_id:=new.tenant_id;
  if v_tenant_id is null and new.branch_id is not null then select tenant_id into v_tenant_id from public.branches where id=new.branch_id; end if;
  if v_tenant_id is null and new.merchant_id is not null then select tenant_id into v_tenant_id from public.merchants where id=new.merchant_id; end if;
  if v_tenant_id is not null then
    perform private.assert_tenant_capability_v1(v_tenant_id,'online_sales');
    perform private.assert_tenant_capability_v1(v_tenant_id,'customer_app');
  end if;
  return new;
end;
$$;
revoke all on function private.guard_online_order_tenant_runtime_v1() from public,anon,authenticated;

drop trigger if exists zzzz_guard_online_order_tenant_runtime_v1 on public.online_orders;
create trigger zzzz_guard_online_order_tenant_runtime_v1
before insert on public.online_orders
for each row execute function private.guard_online_order_tenant_runtime_v1();

create or replace function public.find_delivery_branch(p_latitude double precision,p_longitude double precision)
returns table(branch_id uuid,branch_name text,distance_km double precision,delivery_radius_km numeric,delivery_fee numeric,min_order_amount numeric,estimated_delivery_minutes integer)
language sql
stable
security definer
set search_path=''
as $$
  with candidates as (
    select b.id,b.name,b.delivery_radius_km,b.delivery_fee,b.min_order_amount,b.estimated_delivery_minutes,
      6371.0*2*asin(sqrt(power(sin(radians((b.latitude-p_latitude)/2)),2)+cos(radians(p_latitude))*cos(radians(b.latitude))*power(sin(radians((b.longitude-p_longitude)/2)),2))) as distance_km
    from public.branches b join public.merchants m on m.id=b.merchant_id
    where b.active=true and b.delivery_enabled=true and m.merchant_type='owned' and m.status='active'
      and b.latitude is not null and b.longitude is not null
      and private.tenant_capability_enabled_v1(b.tenant_id,'online_sales')
      and private.tenant_capability_enabled_v1(b.tenant_id,'customer_app')
  )
  select id,name,distance_km,delivery_radius_km,delivery_fee,min_order_amount,estimated_delivery_minutes
  from candidates where distance_km<=delivery_radius_km order by distance_km asc limit 1;
$$;

create or replace function public.quote_marketplace_cart_v1(p_branch_id uuid,p_items jsonb,p_latitude double precision,p_longitude double precision)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from public.branches where id=p_branch_id;
  if v_tenant_id is null then raise exception using errcode='22023',message='MARKETPLACE_STORE_UNAVAILABLE'; end if;
  perform private.assert_tenant_capability_v1(v_tenant_id,'online_sales');
  perform private.assert_tenant_capability_v1(v_tenant_id,'customer_app');
  return private.marketplace_quote_plan_v1(p_branch_id,p_items,p_latitude,p_longitude);
end;
$$;
revoke all on function public.quote_marketplace_cart_v1(uuid,jsonb,double precision,double precision) from public;
grant execute on function public.quote_marketplace_cart_v1(uuid,jsonb,double precision,double precision) to anon,authenticated,service_role;
