create or replace function public.get_marketplace_merchant_detail_v1(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant_id uuid;
  v_merchant jsonb;
  v_branches jsonb;
  v_listings jsonb;
  v_rules jsonb;
  v_settlements jsonb;
  v_readiness jsonb;
  v_customer_readiness jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select m.tenant_id into v_tenant_id
  from public.merchants m
  where m.id = p_merchant_id;

  if v_tenant_id is null then
    raise exception 'merchant_not_found';
  end if;

  if not public.can_manage_tenant_marketplace_v1(v_tenant_id) then
    raise exception 'MARKETPLACE_ACCESS_DENIED';
  end if;

  select jsonb_build_object(
    'id',m.id,
    'tenant_id',m.tenant_id,
    'code',m.code,
    'name',m.name,
    'merchant_type',m.merchant_type,
    'status',m.status,
    'contact_name',m.contact_name,
    'phone',m.phone,
    'email',m.email,
    'metadata',m.metadata,
    'marketplace_approved_at',m.marketplace_approved_at,
    'customer_published_at',m.customer_published_at,
    'created_at',m.created_at
  ) into v_merchant
  from public.merchants m where m.id=p_merchant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,
    'name',b.name,
    'code',b.code,
    'address',b.address,
    'phone',b.phone,
    'email',b.email,
    'active',b.active,
    'delivery_enabled',b.delivery_enabled,
    'marketplace_customer_enabled',b.marketplace_customer_enabled,
    'latitude',b.latitude,
    'longitude',b.longitude,
    'delivery_radius_km',b.delivery_radius_km,
    'delivery_fee',b.delivery_fee,
    'min_order_amount',b.min_order_amount,
    'estimated_delivery_minutes',b.estimated_delivery_minutes,
    'opens_at',b.opens_at,
    'closes_at',b.closes_at,
    'active_delivery_zone_count',(
      select count(*) from public.branch_delivery_zones z
      where z.branch_id=b.id and coalesce(z.is_active,true)
    )
  ) order by b.created_at), '[]'::jsonb)
  into v_branches
  from public.branches b where b.merchant_id=p_merchant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',ml.id,
    'branch_id',ml.branch_id,
    'branch_name',b.name,
    'product_id',p.id,
    'product_name',p.name,
    'barcode',p.barcode,
    'image_url',case when cardinality(p.image_urls)>0 then p.image_urls[1] else null end,
    'merchant_sku',ml.merchant_sku,
    'status',ml.status,
    'marketplace_customer_enabled',ml.marketplace_customer_enabled,
    'preparation_minutes',ml.preparation_minutes,
    'sale_price',bp.sale_price,
    'purchase_price',bp.purchase_price,
    'offer_price',bp.offer_price,
    'is_offer',coalesce(bp.is_offer,false),
    'quantity',i.quantity,
    'created_at',ml.created_at
  ) order by ml.created_at desc), '[]'::jsonb)
  into v_listings
  from public.merchant_listings ml
  join public.products p on p.id=ml.product_id
  join public.branches b on b.id=ml.branch_id
  left join public.branch_product_pricing bp on bp.branch_id=ml.branch_id and bp.product_id=ml.product_id
  left join public.inventory i on i.branch_id=ml.branch_id and i.product_id=ml.product_id
  where ml.merchant_id=p_merchant_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,
    'name',r.name,
    'commission_percent',r.commission_percent,
    'fixed_fee',r.fixed_fee,
    'calculation_basis',r.calculation_basis,
    'priority',r.priority,
    'effective_from',r.effective_from,
    'effective_to',r.effective_to,
    'is_active',r.is_active
  ) order by r.priority desc,r.created_at desc),'[]'::jsonb)
  into v_rules
  from public.merchant_commission_rules r
  where r.tenant_id=v_tenant_id and (r.merchant_id=p_merchant_id or r.merchant_id is null);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,
    'reference',s.reference,
    'status',s.status,
    'gross_credits',s.gross_credits,
    'total_deductions',s.total_deductions,
    'net_payable',s.net_payable,
    'currency',s.currency,
    'period_start',s.period_start,
    'period_end',s.period_end,
    'created_at',s.created_at,
    'paid_at',s.paid_at
  ) order by s.created_at desc),'[]'::jsonb)
  into v_settlements
  from public.merchant_settlements s
  where s.merchant_id=p_merchant_id;

  v_readiness := private.marketplace_merchant_readiness_v1(p_merchant_id);
  if (v_merchant->>'merchant_type') in ('partner','franchise') then
    v_customer_readiness := private.marketplace_customer_publish_readiness_v1(p_merchant_id);
  else
    v_customer_readiness := jsonb_build_object(
      'merchant_id',p_merchant_id,
      'ready_for_customer_publish',false,
      'missing',jsonb_build_array('owned_merchant_not_marketplace_publishable'),
      'checks',jsonb_build_object()
    );
  end if;

  return jsonb_build_object(
    'merchant',v_merchant,
    'branches',v_branches,
    'listings',v_listings,
    'commission_rules',v_rules,
    'settlements',v_settlements,
    'readiness',v_readiness,
    'customer_publish_readiness',v_customer_readiness,
    'generated_at',now()
  );
end;
$function$;

revoke all on function public.get_marketplace_merchant_detail_v1(uuid) from public, anon;
grant execute on function public.get_marketplace_merchant_detail_v1(uuid) to authenticated, service_role;
