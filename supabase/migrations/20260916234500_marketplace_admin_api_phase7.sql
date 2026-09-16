-- Phase 7: Marketplace admin API
-- Adds tenant-admin marketplace management and a server-aggregated dashboard endpoint.

begin;

create or replace function public.can_manage_tenant_marketplace_v1(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.tenant_users tu
      where tu.tenant_id = p_tenant_id
        and tu.user_id = auth.uid()
        and tu.role in ('owner','admin')
        and coalesce(tu.is_active, true)
    );
$$;

revoke all on function public.can_manage_tenant_marketplace_v1(uuid) from public;
revoke all on function public.can_manage_tenant_marketplace_v1(uuid) from anon;
grant execute on function public.can_manage_tenant_marketplace_v1(uuid) to authenticated;

create or replace function public.get_marketplace_admin_dashboard_v1(p_tenant_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_tenant jsonb;
  v_manageable_tenants jsonb;
  v_summary jsonb;
  v_merchants jsonb;
  v_rules jsonb;
  v_settlements jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'subdomain', t.subdomain,
      'status', t.status
    ) order by (coalesce((t.settings->>'is_platform_tenant')::boolean,false)) desc, t.created_at
  ), '[]'::jsonb)
  into v_manageable_tenants
  from public.tenants t
  where public.can_manage_tenant_marketplace_v1(t.id);

  if p_tenant_id is not null then
    if not public.can_manage_tenant_marketplace_v1(p_tenant_id) then
      raise exception 'MARKETPLACE_ACCESS_DENIED';
    end if;
    v_tenant_id := p_tenant_id;
  else
    select t.id into v_tenant_id
    from public.tenants t
    where public.can_manage_tenant_marketplace_v1(t.id)
    order by coalesce((t.settings->>'is_platform_tenant')::boolean,false) desc, t.created_at
    limit 1;
  end if;

  if v_tenant_id is null then
    raise exception 'MARKETPLACE_TENANT_NOT_FOUND';
  end if;

  select jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'subdomain', t.subdomain,
    'status', t.status,
    'subscription_status', t.subscription_status,
    'country', t.country,
    'settings', t.settings
  ) into v_tenant
  from public.tenants t
  where t.id = v_tenant_id;

  select jsonb_build_object(
    'merchant_count', count(*),
    'partner_count', count(*) filter (where m.merchant_type = 'partner'),
    'franchise_count', count(*) filter (where m.merchant_type = 'franchise'),
    'owned_count', count(*) filter (where m.merchant_type = 'owned'),
    'pending_count', count(*) filter (where m.status = 'pending'),
    'active_count', count(*) filter (where m.status = 'active'),
    'listing_count', coalesce((select count(*) from public.merchant_listings ml where ml.tenant_id = v_tenant_id), 0),
    'active_listing_count', coalesce((select count(*) from public.merchant_listings ml where ml.tenant_id = v_tenant_id and ml.status = 'active'), 0),
    'marketplace_order_count', coalesce((
      select count(*)
      from public.online_orders o
      join public.merchants om on om.id = o.merchant_id
      where o.tenant_id = v_tenant_id and om.merchant_type in ('partner','franchise')
    ), 0),
    'unsettled_payable', coalesce((
      select round(sum(mfe.signed_amount),2)
      from public.merchant_financial_entries mfe
      where mfe.tenant_id = v_tenant_id
        and not exists (
          select 1 from public.merchant_settlement_entries mse
          where mse.financial_entry_id = mfe.id
        )
    ), 0),
    'draft_settlement_count', coalesce((select count(*) from public.merchant_settlements ms where ms.tenant_id = v_tenant_id and ms.status = 'draft'), 0)
  ) into v_summary
  from public.merchants m
  where m.tenant_id = v_tenant_id;

  select coalesce(jsonb_agg(row_data order by sort_type, sort_name), '[]'::jsonb)
  into v_merchants
  from (
    select
      case m.merchant_type when 'owned' then 0 when 'franchise' then 1 else 2 end as sort_type,
      m.name as sort_name,
      jsonb_build_object(
        'id', m.id,
        'code', m.code,
        'name', m.name,
        'merchant_type', m.merchant_type,
        'status', m.status,
        'contact_name', m.contact_name,
        'phone', m.phone,
        'email', m.email,
        'created_at', m.created_at,
        'branch_count', (select count(*) from public.branches b where b.merchant_id = m.id),
        'active_branch_count', (select count(*) from public.branches b where b.merchant_id = m.id and b.active),
        'listing_count', (select count(*) from public.merchant_listings ml where ml.merchant_id = m.id),
        'active_listing_count', (select count(*) from public.merchant_listings ml where ml.merchant_id = m.id and ml.status = 'active'),
        'order_count', (select count(*) from public.online_orders o where o.merchant_id = m.id),
        'unsettled_balance', coalesce((
          select round(sum(mfe.signed_amount),2)
          from public.merchant_financial_entries mfe
          where mfe.merchant_id = m.id
            and not exists (
              select 1 from public.merchant_settlement_entries mse
              where mse.financial_entry_id = mfe.id
            )
        ), 0),
        'commission_rule_count', (select count(*) from public.merchant_commission_rules r where r.merchant_id = m.id and r.is_active),
        'branches', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', b.id,
            'name', b.name,
            'code', b.code,
            'active', b.active,
            'branch_type', b.branch_type,
            'category', b.category,
            'delivery_enabled', b.delivery_enabled,
            'address', b.address
          ) order by b.created_at)
          from public.branches b
          where b.merchant_id = m.id
        ), '[]'::jsonb)
      ) as row_data
    from public.merchants m
    where m.tenant_id = v_tenant_id
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'merchant_id', r.merchant_id,
    'merchant_name', m.name,
    'name', r.name,
    'commission_percent', r.commission_percent,
    'fixed_fee', r.fixed_fee,
    'calculation_basis', r.calculation_basis,
    'priority', r.priority,
    'effective_from', r.effective_from,
    'effective_to', r.effective_to,
    'is_active', r.is_active
  ) order by r.priority desc, r.created_at desc), '[]'::jsonb)
  into v_rules
  from public.merchant_commission_rules r
  left join public.merchants m on m.id = r.merchant_id
  where r.tenant_id = v_tenant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'merchant_id', s.merchant_id,
    'merchant_name', m.name,
    'reference', s.reference,
    'status', s.status,
    'period_start', s.period_start,
    'period_end', s.period_end,
    'gross_credits', s.gross_credits,
    'total_deductions', s.total_deductions,
    'net_payable', s.net_payable,
    'currency', s.currency,
    'created_at', s.created_at,
    'paid_at', s.paid_at
  ) order by s.created_at desc), '[]'::jsonb)
  into v_settlements
  from public.merchant_settlements s
  join public.merchants m on m.id = s.merchant_id
  where s.tenant_id = v_tenant_id
  limit 100;

  return jsonb_build_object(
    'version', 1,
    'tenant', v_tenant,
    'manageable_tenants', v_manageable_tenants,
    'summary', v_summary,
    'merchants', v_merchants,
    'commission_rules', v_rules,
    'settlements', v_settlements,
    'generated_at', now()
  );
end;
$$;

revoke all on function public.get_marketplace_admin_dashboard_v1(uuid) from public;
revoke all on function public.get_marketplace_admin_dashboard_v1(uuid) from anon;
grant execute on function public.get_marketplace_admin_dashboard_v1(uuid) to authenticated;

-- Replace the partner creation entry point so tenant owners/admins can manage their own tenant.
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
  if not public.can_manage_tenant_marketplace_v1(p_tenant_id) then
    raise exception 'MARKETPLACE_ACCESS_DENIED';
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

-- Allow the same tenant marketplace admins to maintain listings through the guarded RPC.
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

  if not public.can_manage_tenant_marketplace_v1(v_tenant_id) then
    raise exception 'MARKETPLACE_ACCESS_DENIED';
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
