-- Phase 4: Marketplace catalog ownership + safe partner onboarding
-- Product stays the master catalog; branch_product_pricing remains the price source;
-- inventory remains the stock source; merchant_listings only defines seller ownership/visibility.

begin;

create or replace function private.enforce_merchant_listing_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant_tenant uuid;
  v_branch_tenant uuid;
  v_branch_merchant uuid;
begin
  select m.tenant_id
    into v_merchant_tenant
  from public.merchants m
  where m.id = new.merchant_id;

  if v_merchant_tenant is null then
    raise exception 'merchant_not_found';
  end if;

  select b.tenant_id, b.merchant_id
    into v_branch_tenant, v_branch_merchant
  from public.branches b
  where b.id = new.branch_id;

  if v_branch_tenant is null then
    raise exception 'branch_not_found';
  end if;

  if v_branch_tenant <> v_merchant_tenant then
    raise exception 'cross_tenant_listing_not_allowed';
  end if;

  if v_branch_merchant <> new.merchant_id then
    raise exception 'cross_merchant_listing_not_allowed';
  end if;

  new.tenant_id := v_merchant_tenant;
  return new;
end;
$$;

revoke all on function private.enforce_merchant_listing_scope_v1() from public;

drop trigger if exists trg_enforce_merchant_listing_scope_v1 on public.merchant_listings;
create trigger trg_enforce_merchant_listing_scope_v1
before insert or update of tenant_id, merchant_id, branch_id
on public.merchant_listings
for each row
execute function private.enforce_merchant_listing_scope_v1();

create or replace function public.create_marketplace_partner_v1(
  p_tenant_id uuid,
  p_merchant_name text,
  p_branch_name text,
  p_branch_code text default null,
  p_contact_name text default null,
  p_phone text default null,
  p_email text default null,
  p_address text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_owner_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid := gen_random_uuid();
  v_branch_id uuid := gen_random_uuid();
  v_branch_code text;
  v_merchant_code text;
begin
  if not public.is_super_admin() then
    raise exception 'not_authorized';
  end if;

  if not exists (select 1 from public.tenants t where t.id = p_tenant_id and t.status = 'active') then
    raise exception 'tenant_not_found_or_inactive';
  end if;

  if nullif(trim(p_merchant_name), '') is null or nullif(trim(p_branch_name), '') is null then
    raise exception 'merchant_and_branch_name_required';
  end if;

  v_branch_code := upper(coalesce(nullif(trim(p_branch_code), ''), 'P-' || substr(replace(v_branch_id::text, '-', ''), 1, 8)));
  v_merchant_code := 'partner-' || lower(v_branch_code);

  insert into public.merchants (
    id, tenant_id, code, name, merchant_type, status,
    contact_name, phone, email, metadata
  ) values (
    v_merchant_id, p_tenant_id, v_merchant_code, trim(p_merchant_name), 'partner', 'pending',
    nullif(trim(p_contact_name), ''), nullif(trim(p_phone), ''), nullif(trim(p_email), ''),
    jsonb_build_object('onboarding_status','draft','created_via','marketplace_partner_v1')
  );

  insert into public.branches (
    id, tenant_id, merchant_id, name, code, address, phone, email,
    active, branch_type, independent_pricing, independent_inventory,
    category, latitude, longitude, delivery_enabled,
    inventory_source_branch_id, pricing_source_branch_id
  ) values (
    v_branch_id, p_tenant_id, v_merchant_id, trim(p_branch_name), v_branch_code,
    nullif(trim(p_address), ''), nullif(trim(p_phone), ''), nullif(trim(p_email), ''),
    false, 'external'::public.branch_type, true, true,
    'retail'::public.branch_category, p_latitude, p_longitude, false,
    v_branch_id, v_branch_id
  );

  if p_owner_user_id is not null then
    if not exists (select 1 from auth.users a where a.id = p_owner_user_id) then
      raise exception 'owner_auth_user_not_found';
    end if;

    insert into public.merchant_members (
      tenant_id, merchant_id, user_id, role, is_active
    ) values (
      p_tenant_id, v_merchant_id, p_owner_user_id, 'owner', true
    )
    on conflict (merchant_id, user_id) do update
    set role='owner', is_active=true, updated_at=now();
  end if;

  return jsonb_build_object(
    'merchant_id', v_merchant_id,
    'branch_id', v_branch_id,
    'merchant_status', 'pending',
    'branch_active', false,
    'delivery_enabled', false
  );
end;
$$;

revoke all on function public.create_marketplace_partner_v1(uuid,text,text,text,text,text,text,text,double precision,double precision,uuid) from public;
revoke all on function public.create_marketplace_partner_v1(uuid,text,text,text,text,text,text,text,double precision,double precision,uuid) from anon;
grant execute on function public.create_marketplace_partner_v1(uuid,text,text,text,text,text,text,text,double precision,double precision,uuid) to authenticated;

create or replace function public.upsert_marketplace_listing_v1(
  p_merchant_id uuid,
  p_branch_id uuid,
  p_product_id uuid,
  p_sale_price numeric,
  p_purchase_price numeric,
  p_quantity numeric,
  p_offer_price numeric default null,
  p_is_offer boolean default false,
  p_merchant_sku text default null,
  p_preparation_minutes integer default null,
  p_requested_status text default 'draft'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_merchant_status text;
  v_branch_active boolean;
  v_listing_id uuid;
  v_effective_status text;
begin
  if not public.is_super_admin() then
    raise exception 'not_authorized';
  end if;

  if p_sale_price < 0 or p_purchase_price < 0 or p_quantity < 0 then
    raise exception 'negative_price_or_quantity_not_allowed';
  end if;

  if p_offer_price is not null and p_offer_price < 0 then
    raise exception 'negative_offer_price_not_allowed';
  end if;

  if p_preparation_minutes is not null and p_preparation_minutes < 0 then
    raise exception 'negative_preparation_minutes_not_allowed';
  end if;

  if p_requested_status not in ('draft','active','paused') then
    raise exception 'invalid_listing_status';
  end if;

  select m.tenant_id, m.status
    into v_tenant_id, v_merchant_status
  from public.merchants m
  where m.id = p_merchant_id;

  if v_tenant_id is null then
    raise exception 'merchant_not_found';
  end if;

  select b.active
    into v_branch_active
  from public.branches b
  where b.id = p_branch_id
    and b.tenant_id = v_tenant_id
    and b.merchant_id = p_merchant_id;

  if not found then
    raise exception 'branch_does_not_belong_to_merchant';
  end if;

  if not exists (select 1 from public.products p where p.id = p_product_id and p.archived_at is null) then
    raise exception 'product_not_found_or_archived';
  end if;

  v_effective_status := case
    when v_merchant_status = 'active' and coalesce(v_branch_active,false) and p_requested_status = 'active'
      then 'active'
    when p_requested_status = 'paused' then 'paused'
    else 'draft'
  end;

  insert into public.merchant_listings (
    tenant_id, merchant_id, branch_id, product_id,
    merchant_sku, status, preparation_minutes
  ) values (
    v_tenant_id, p_merchant_id, p_branch_id, p_product_id,
    nullif(trim(p_merchant_sku), ''), v_effective_status, p_preparation_minutes
  )
  on conflict (merchant_id, branch_id, product_id) do update
  set merchant_sku=excluded.merchant_sku,
      status=excluded.status,
      preparation_minutes=excluded.preparation_minutes,
      updated_at=now()
  returning id into v_listing_id;

  insert into public.branch_product_pricing (
    branch_id, product_id, sale_price, purchase_price,
    offer_price, is_offer, updated_at
  ) values (
    p_branch_id, p_product_id, p_sale_price, p_purchase_price,
    case when p_is_offer then p_offer_price else null end,
    coalesce(p_is_offer,false), now()
  )
  on conflict (branch_id, product_id) do update
  set sale_price=excluded.sale_price,
      purchase_price=excluded.purchase_price,
      offer_price=excluded.offer_price,
      is_offer=excluded.is_offer,
      updated_at=now();

  insert into public.inventory (
    product_id, branch_id, quantity, alert_enabled, updated_at
  ) values (
    p_product_id, p_branch_id, p_quantity, false, now()
  )
  on conflict (product_id, branch_id) do update
  set quantity=excluded.quantity,
      updated_at=now();

  return jsonb_build_object(
    'listing_id', v_listing_id,
    'tenant_id', v_tenant_id,
    'merchant_id', p_merchant_id,
    'branch_id', p_branch_id,
    'product_id', p_product_id,
    'status', v_effective_status,
    'sale_price', p_sale_price,
    'quantity', p_quantity
  );
end;
$$;

revoke all on function public.upsert_marketplace_listing_v1(uuid,uuid,uuid,numeric,numeric,numeric,numeric,boolean,text,integer,text) from public;
revoke all on function public.upsert_marketplace_listing_v1(uuid,uuid,uuid,numeric,numeric,numeric,numeric,boolean,text,integer,text) from anon;
grant execute on function public.upsert_marketplace_listing_v1(uuid,uuid,uuid,numeric,numeric,numeric,numeric,boolean,text,integer,text) to authenticated;

commit;
