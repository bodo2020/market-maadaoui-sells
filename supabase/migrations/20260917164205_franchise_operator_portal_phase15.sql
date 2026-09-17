-- Phase 15 — Franchise Operator Portal
-- Read-only, membership-scoped operator workspace. Platform-only mutations stay outside this API.

create or replace function private.my_franchise_portal_role_v1(p_merchant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select mm.role
  from public.merchant_members mm
  join public.merchants m on m.id = mm.merchant_id
  join public.tenants t on t.id = m.tenant_id
  where mm.merchant_id = p_merchant_id
    and mm.user_id = auth.uid()
    and mm.is_active
    and mm.role in ('owner','admin','manager')
    and m.merchant_type = 'franchise'
    and t.status = 'active'
  limit 1;
$$;

revoke all on function private.my_franchise_portal_role_v1(uuid) from public, anon, authenticated;
grant execute on function private.my_franchise_portal_role_v1(uuid) to service_role;

create or replace function public.get_my_franchise_portal_identity_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_memberships jsonb;
  v_default_merchant_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode='28000', message='AUTH_REQUIRED';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'merchant_id', m.id,
    'merchant_name', m.name,
    'merchant_code', m.code,
    'merchant_status', m.status,
    'tenant_id', m.tenant_id,
    'role', mm.role
  ) order by
    case mm.role when 'owner' then 1 when 'admin' then 2 else 3 end,
    m.created_at,
    m.id), '[]'::jsonb),
  (array_agg(m.id order by
    case mm.role when 'owner' then 1 when 'admin' then 2 else 3 end,
    m.created_at,
    m.id))[1]
  into v_memberships, v_default_merchant_id
  from public.merchant_members mm
  join public.merchants m on m.id = mm.merchant_id
  join public.tenants t on t.id = m.tenant_id
  where mm.user_id = v_user_id
    and mm.is_active
    and mm.role in ('owner','admin','manager')
    and m.merchant_type = 'franchise'
    and t.status = 'active';

  if v_default_merchant_id is null then
    raise exception using errcode='42501', message='FRANCHISE_PORTAL_ACCESS_REQUIRED';
  end if;

  return jsonb_build_object(
    'user_id', v_user_id,
    'default_merchant_id', v_default_merchant_id,
    'memberships', v_memberships
  );
end;
$$;

revoke all on function public.get_my_franchise_portal_identity_v1() from public, anon;
grant execute on function public.get_my_franchise_portal_identity_v1() to authenticated;

create or replace function public.get_my_franchise_portal_v1(
  p_merchant_id uuid default null,
  p_period_start timestamptz default date_trunc('month', now()),
  p_period_end timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_merchant_id uuid := p_merchant_id;
  v_role text;
  v_merchant public.merchants%rowtype;
  v_profile private.franchise_profiles_v1%rowtype;
  v_agreement private.franchise_agreements_v1%rowtype;
  v_can_view_finance boolean;
  v_can_view_analytics boolean;
  v_can_manage_inventory boolean;
  v_pos_count integer := 0;
  v_pos_gross numeric(14,2) := 0;
  v_pos_profit numeric(14,2) := 0;
  v_online_count integer := 0;
  v_online_delivered_count integer := 0;
  v_online_gross numeric(14,2) := 0;
  v_inventory_products integer := 0;
  v_inventory_units numeric(16,3) := 0;
  v_out_of_stock integer := 0;
  v_low_stock integer := 0;
  v_inventory_cost numeric(16,2) := 0;
  v_inventory_retail numeric(16,2) := 0;
  v_unsettled_balance numeric(14,2) := 0;
  v_period_balance numeric(14,2) := 0;
  v_royalty numeric(14,2) := 0;
  v_marketing numeric(14,2) := 0;
  v_platform numeric(14,2) := 0;
  v_fixed numeric(14,2) := 0;
  v_adjustments numeric(14,2) := 0;
  v_memberships jsonb;
  v_branches jsonb;
  v_settlements jsonb := '[]'::jsonb;
  v_entries jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='28000', message='AUTH_REQUIRED';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception using errcode='22023', message='FRANCHISE_PORTAL_INVALID_PERIOD';
  end if;
  if p_period_end - p_period_start > interval '370 days' then
    raise exception using errcode='22023', message='FRANCHISE_PORTAL_PERIOD_TOO_LARGE';
  end if;

  if v_merchant_id is null then
    select mm.merchant_id into v_merchant_id
    from public.merchant_members mm
    join public.merchants m on m.id=mm.merchant_id
    join public.tenants t on t.id=m.tenant_id
    where mm.user_id=v_user_id and mm.is_active
      and mm.role in ('owner','admin','manager')
      and m.merchant_type='franchise' and t.status='active'
    order by case mm.role when 'owner' then 1 when 'admin' then 2 else 3 end, m.created_at, m.id
    limit 1;
  end if;

  v_role := private.my_franchise_portal_role_v1(v_merchant_id);
  if v_role is null then
    raise exception using errcode='42501', message='FRANCHISE_PORTAL_MERCHANT_ACCESS_REQUIRED';
  end if;

  select * into v_merchant
  from public.merchants m
  where m.id=v_merchant_id and m.merchant_type='franchise';
  if v_merchant.id is null then
    raise exception using errcode='P0002', message='FRANCHISE_NOT_FOUND';
  end if;

  select * into v_profile
  from private.franchise_profiles_v1 fp
  where fp.merchant_id=v_merchant_id;

  select * into v_agreement
  from private.franchise_agreements_v1 a
  where a.merchant_id=v_merchant_id and a.is_current
  limit 1;

  v_can_view_finance := v_role in ('owner','admin');
  v_can_view_analytics := coalesce(v_agreement.can_view_analytics,false);
  v_can_manage_inventory := coalesce(v_agreement.can_manage_inventory,false) and v_role in ('owner','admin','manager');

  select coalesce(jsonb_agg(jsonb_build_object(
    'merchant_id',m.id,'merchant_name',m.name,'merchant_code',m.code,'merchant_status',m.status,'role',mm.role
  ) order by m.name,m.id),'[]'::jsonb)
  into v_memberships
  from public.merchant_members mm
  join public.merchants m on m.id=mm.merchant_id
  join public.tenants t on t.id=m.tenant_id
  where mm.user_id=v_user_id and mm.is_active
    and mm.role in ('owner','admin','manager')
    and m.merchant_type='franchise' and t.status='active';

  if v_can_view_analytics then
    select count(*),coalesce(sum(s.total),0),coalesce(sum(coalesce(s.net_profit_after_payment_fee,s.profit,0)),0)
    into v_pos_count,v_pos_gross,v_pos_profit
    from public.sales s
    join public.branches b on b.id=s.branch_id
    where b.merchant_id=v_merchant_id
      and s.date between p_period_start and p_period_end;

    select count(*),
      count(*) filter(where o.status::text='delivered'),
      coalesce(sum(greatest(o.total-coalesce(o.shipping_cost,0),0)) filter(where o.status::text='delivered'),0)
    into v_online_count,v_online_delivered_count,v_online_gross
    from public.online_orders o
    where o.merchant_id=v_merchant_id
      and o.created_at between p_period_start and p_period_end;
  end if;

  select
    count(*) filter(where i.quantity is not null),
    coalesce(sum(greatest(i.quantity,0)),0),
    count(*) filter(where i.quantity<=0),
    count(*) filter(where i.quantity>0 and i.alert_enabled and i.min_stock_level is not null and i.quantity<=i.min_stock_level),
    coalesce(sum(greatest(i.quantity,0)*coalesce(bp.purchase_price,0)),0),
    coalesce(sum(greatest(i.quantity,0)*coalesce(case when bp.is_offer and bp.offer_price is not null then bp.offer_price else bp.sale_price end,0)),0)
  into v_inventory_products,v_inventory_units,v_out_of_stock,v_low_stock,v_inventory_cost,v_inventory_retail
  from public.inventory i
  join public.branches b on b.id=i.branch_id
  left join public.branch_product_pricing bp on bp.branch_id=i.branch_id and bp.product_id=i.product_id
  where b.merchant_id=v_merchant_id;

  select coalesce(jsonb_agg(x.obj order by x.name,x.id),'[]'::jsonb)
  into v_branches
  from (
    select b.id,b.name,jsonb_build_object(
      'id',b.id,'name',b.name,'code',b.code,'franchise_code',b.franchise_code,
      'active',b.active,'address',b.address,'phone',b.phone,'email',b.email,
      'latitude',b.latitude,'longitude',b.longitude,
      'delivery_fee',b.delivery_fee,'min_order_amount',b.min_order_amount,'estimated_delivery_minutes',b.estimated_delivery_minutes,
      'channels',jsonb_build_object(
        'pos',private.branch_channel_runtime_v1(b.id,'pos'),
        'online_sales',private.branch_channel_runtime_v1(b.id,'online_sales'),
        'customer_app',private.branch_channel_runtime_v1(b.id,'customer_app'),
        'marketplace',private.branch_channel_runtime_v1(b.id,'marketplace'),
        'delivery',private.branch_channel_runtime_v1(b.id,'delivery'),
        'pickup',private.branch_channel_runtime_v1(b.id,'pickup')
      ),
      'period_sales',case when v_can_view_analytics then jsonb_build_object(
        'pos_count',(select count(*) from public.sales s where s.branch_id=b.id and s.date between p_period_start and p_period_end),
        'pos_gross',(select coalesce(sum(s.total),0) from public.sales s where s.branch_id=b.id and s.date between p_period_start and p_period_end),
        'online_delivered_count',(select count(*) from public.online_orders o where o.branch_id=b.id and o.status::text='delivered' and o.created_at between p_period_start and p_period_end),
        'online_delivered_gross',(select coalesce(sum(greatest(o.total-coalesce(o.shipping_cost,0),0)),0) from public.online_orders o where o.branch_id=b.id and o.status::text='delivered' and o.created_at between p_period_start and p_period_end)
      ) else null end,
      'inventory',jsonb_build_object(
        'product_count',(select count(*) from public.inventory i where i.branch_id=b.id),
        'out_of_stock_count',(select count(*) from public.inventory i where i.branch_id=b.id and i.quantity<=0),
        'low_stock_count',(select count(*) from public.inventory i where i.branch_id=b.id and i.quantity>0 and i.alert_enabled and i.min_stock_level is not null and i.quantity<=i.min_stock_level)
      )
    ) obj
    from public.branches b
    where b.merchant_id=v_merchant_id
  ) x;

  if v_can_view_finance then
    select
      coalesce(abs(sum(mfe.signed_amount) filter(where mfe.entry_type='franchise_royalty' and mfe.occurred_at between p_period_start and p_period_end)),0),
      coalesce(abs(sum(mfe.signed_amount) filter(where mfe.entry_type='franchise_marketing_fee' and mfe.occurred_at between p_period_start and p_period_end)),0),
      coalesce(abs(sum(mfe.signed_amount) filter(where mfe.entry_type='franchise_platform_fee' and mfe.occurred_at between p_period_start and p_period_end)),0),
      coalesce(abs(sum(mfe.signed_amount) filter(where mfe.entry_type='franchise_fixed_fee' and mfe.occurred_at between p_period_start and p_period_end)),0),
      coalesce(sum(mfe.signed_amount) filter(where mfe.entry_type='franchise_adjustment' and mfe.occurred_at between p_period_start and p_period_end),0),
      coalesce(sum(mfe.signed_amount) filter(where mfe.entry_type like 'franchise_%' and mfe.entry_type<>'franchise_sale_accrual_marker' and mfe.occurred_at between p_period_start and p_period_end),0)
    into v_royalty,v_marketing,v_platform,v_fixed,v_adjustments,v_period_balance
    from public.merchant_financial_entries mfe
    where mfe.merchant_id=v_merchant_id;

    select coalesce(sum(mfe.signed_amount),0)
    into v_unsettled_balance
    from public.merchant_financial_entries mfe
    where mfe.merchant_id=v_merchant_id
      and mfe.entry_type like 'franchise_%'
      and mfe.entry_type<>'franchise_sale_accrual_marker'
      and not exists(select 1 from public.merchant_settlement_entries mse where mse.financial_entry_id=mfe.id);

    select coalesce(jsonb_agg(x.obj order by x.period_end desc),'[]'::jsonb)
    into v_settlements
    from (
      select ms.period_end,jsonb_build_object(
        'id',ms.id,'reference',ms.reference,'status',ms.status,'period_start',ms.period_start,'period_end',ms.period_end,
        'gross_credits',ms.gross_credits,'total_deductions',ms.total_deductions,'net_payable',ms.net_payable,
        'currency',ms.currency,'external_reference',ms.external_reference,'paid_at',ms.paid_at,'cancelled_at',ms.cancelled_at,
        'created_at',ms.created_at
      ) obj
      from public.merchant_settlements ms
      where ms.merchant_id=v_merchant_id and ms.settlement_kind='franchise'
      order by ms.period_end desc limit 20
    ) x;

    select coalesce(jsonb_agg(x.obj order by x.occurred_at desc,x.created_at desc),'[]'::jsonb)
    into v_entries
    from (
      select mfe.occurred_at,mfe.created_at,jsonb_build_object(
        'id',mfe.id,'branch_id',mfe.branch_id,'entry_type',mfe.entry_type,'signed_amount',mfe.signed_amount,
        'currency',mfe.currency,'description',mfe.description,'occurred_at',mfe.occurred_at,'created_at',mfe.created_at,
        'settled',exists(select 1 from public.merchant_settlement_entries mse where mse.financial_entry_id=mfe.id)
      ) obj
      from public.merchant_financial_entries mfe
      where mfe.merchant_id=v_merchant_id
        and mfe.entry_type like 'franchise_%'
        and mfe.entry_type<>'franchise_sale_accrual_marker'
      order by mfe.occurred_at desc,mfe.created_at desc limit 50
    ) x;
  end if;

  return jsonb_build_object(
    'identity',jsonb_build_object(
      'user_id',v_user_id,'role',v_role,'selected_merchant_id',v_merchant_id,'memberships',v_memberships,
      'capabilities',jsonb_build_object(
        'can_view_analytics',v_can_view_analytics,
        'can_view_finance',v_can_view_finance,
        'can_manage_inventory',v_can_manage_inventory,
        'can_manage_branches',false,
        'can_manage_agreement',false,
        'can_manage_settlements',false
      )
    ),
    'merchant',jsonb_build_object(
      'id',v_merchant.id,'tenant_id',v_merchant.tenant_id,'name',v_merchant.name,'code',v_merchant.code,'status',v_merchant.status,
      'contact_name',v_merchant.contact_name,'phone',v_merchant.phone,'email',v_merchant.email
    ),
    'profile',case when v_profile.merchant_id is null then null else jsonb_build_object(
      'legal_entity_name',v_profile.legal_entity_name,'commercial_registration',v_profile.commercial_registration,
      'tax_registration',v_profile.tax_registration,'contact_name',v_profile.contact_name,'phone',v_profile.phone,
      'email',v_profile.email,'territory_name',v_profile.territory_name,'territory_scope',v_profile.territory_scope
    ) end,
    'agreement',case when v_agreement.id is null then null else jsonb_build_object(
      'id',v_agreement.id,'agreement_code',v_agreement.agreement_code,'version',v_agreement.version,'status',v_agreement.status,
      'starts_on',v_agreement.starts_on,'ends_on',v_agreement.ends_on,'currency',v_agreement.currency,
      'settlement_cycle',v_agreement.settlement_cycle,'pricing_policy',v_agreement.pricing_policy,'catalog_policy',v_agreement.catalog_policy,
      'supplier_policy',v_agreement.supplier_policy,'promotion_policy',v_agreement.promotion_policy,'max_branches',v_agreement.max_branches,
      'can_manage_inventory',v_agreement.can_manage_inventory,'can_view_analytics',v_agreement.can_view_analytics,
      'max_discount_percentage',v_agreement.max_discount_percentage,'requires_order_approval',v_agreement.requires_order_approval,
      'royalty_rate',case when v_can_view_finance then v_agreement.royalty_rate else null end,
      'marketing_fee_rate',case when v_can_view_finance then v_agreement.marketing_fee_rate else null end,
      'platform_fee_rate',case when v_can_view_finance then v_agreement.platform_fee_rate else null end,
      'monthly_fixed_fee',case when v_can_view_finance then v_agreement.monthly_fixed_fee else null end
    ) end,
    'period',jsonb_build_object('start',p_period_start,'end',p_period_end),
    'sales',case when v_can_view_analytics then jsonb_build_object(
      'pos_count',v_pos_count,'pos_gross',v_pos_gross,'pos_profit',v_pos_profit,
      'online_count',v_online_count,'online_delivered_count',v_online_delivered_count,'online_delivered_gross',v_online_gross,
      'total_gross',v_pos_gross+v_online_gross
    ) else null end,
    'inventory',jsonb_build_object(
      'product_count',v_inventory_products,'units',v_inventory_units,'out_of_stock_count',v_out_of_stock,'low_stock_count',v_low_stock,
      'cost_value',case when v_can_manage_inventory or v_can_view_finance then v_inventory_cost else null end,
      'retail_value',v_inventory_retail
    ),
    'branches',v_branches,
    'finance',case when v_can_view_finance then jsonb_build_object(
      'royalty',v_royalty,'marketing',v_marketing,'platform',v_platform,'fixed',v_fixed,'adjustments',v_adjustments,
      'period_balance',v_period_balance,'unsettled_balance',v_unsettled_balance,
      'balance_direction',case when v_unsettled_balance<0 then 'merchant_owes_platform' when v_unsettled_balance>0 then 'platform_owes_merchant' else 'balanced' end,
      'settlements',v_settlements,'entries',v_entries
    ) else null end
  );
end;
$$;

revoke all on function public.get_my_franchise_portal_v1(uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.get_my_franchise_portal_v1(uuid,timestamptz,timestamptz) to authenticated;
