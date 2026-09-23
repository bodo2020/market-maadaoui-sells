-- Standalone Partners portal: scoped read model and guarded order preparation.
begin;

create or replace function public.get_my_partner_merchants_v1()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'name', m.name, 'role', mm.role, 'status', m.status
  ) order by m.name), '[]'::jsonb)
  from public.merchant_members mm
  join public.merchants m on m.id = mm.merchant_id and m.tenant_id = mm.tenant_id
  where mm.user_id = auth.uid() and mm.is_active
    and m.merchant_type = 'partner' and m.status = 'active';
$$;
revoke all on function public.get_my_partner_merchants_v1() from public, anon;
grant execute on function public.get_my_partner_merchants_v1() to authenticated;

create or replace function public.get_partner_portal_workspace_v1(
  p_merchant_id uuid, p_branch_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_branch uuid; v_role text; v_name text;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  select mm.role, m.name into v_role, v_name
  from public.merchant_members mm join public.merchants m
    on m.id = mm.merchant_id and m.tenant_id = mm.tenant_id
  where mm.user_id = auth.uid() and mm.merchant_id = p_merchant_id
    and mm.is_active and m.merchant_type = 'partner' and m.status = 'active';
  if v_role is null then raise exception using errcode = '42501', message = 'PARTNER_ACCESS_DENIED'; end if;
  if p_branch_id is not null then
    select b.id into v_branch from public.branches b
    where b.id = p_branch_id and b.merchant_id = p_merchant_id and b.active;
  else
    select b.id into v_branch from public.branches b
    where b.merchant_id = p_merchant_id and b.active order by b.name, b.id limit 1;
  end if;
  if v_branch is null then raise exception using errcode = 'P0002', message = 'PARTNER_BRANCH_NOT_FOUND'; end if;
  return jsonb_build_object(
    'merchant_id', p_merchant_id, 'merchant_name', v_name, 'role', v_role,
    'selected_branch_id', v_branch,
    'branches', coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'address', b.address, 'active', b.active
    ) order by b.name) from public.branches b where b.merchant_id = p_merchant_id and b.active), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(jsonb_build_object(
      'id', ml.id, 'name', p.name, 'barcode', p.barcode,
      'status', ml.status, 'sale_price', bp.sale_price, 'offer_price', bp.offer_price,
      'quantity', coalesce(i.quantity, 0)
    ) order by p.name)
    from public.merchant_listings ml
    join public.products p on p.id = ml.product_id
    join public.branches b on b.id = ml.branch_id and b.merchant_id = ml.merchant_id
    left join public.branch_product_pricing bp on bp.branch_id = b.pricing_source_branch_id and bp.product_id = ml.product_id
    left join public.inventory i on i.branch_id = b.inventory_source_branch_id and i.product_id = ml.product_id
    where ml.merchant_id = p_merchant_id and ml.branch_id = v_branch and ml.status <> 'archived'), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object(
      'id', o.id, 'status', o.status, 'total', o.total,
      'payment_status', o.payment_status, 'payment_method', o.payment_method,
      'items', o.items, 'created_at', o.created_at, 'updated_at', o.updated_at
    ) order by o.created_at desc)
    from (select id,status,total,payment_status,payment_method,items,created_at,updated_at
      from public.online_orders where merchant_id = p_merchant_id and branch_id = v_branch
      order by created_at desc limit 100) o), '[]'::jsonb),
    'finance', jsonb_build_object(
      'unsettled_balance', coalesce((select sum(e.signed_amount) from public.merchant_financial_entries e
        where e.merchant_id = p_merchant_id and not exists (
          select 1 from public.merchant_settlement_entries se where se.financial_entry_id = e.id)), 0),
      'recent_settlements', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'reference', s.reference, 'status', s.status,
        'net_payable', s.net_payable, 'period_end', s.period_end, 'paid_at', s.paid_at
      ) order by s.period_end desc) from (select id,reference,status,net_payable,period_end,paid_at
        from public.merchant_settlements where merchant_id = p_merchant_id
        order by period_end desc limit 20) s), '[]'::jsonb)
    )
  );
end;
$$;
revoke all on function public.get_partner_portal_workspace_v1(uuid,uuid) from public, anon;
grant execute on function public.get_partner_portal_workspace_v1(uuid,uuid) to authenticated;

create or replace function public.advance_partner_order_v1(
  p_merchant_id uuid, p_order_id uuid, p_expected_status text, p_target_status text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_order public.online_orders%rowtype; v_allowed text;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if not exists (select 1 from public.merchant_members mm join public.merchants m
    on m.id = mm.merchant_id and m.tenant_id = mm.tenant_id
    where mm.user_id = auth.uid() and mm.merchant_id = p_merchant_id
      and mm.is_active and m.merchant_type = 'partner' and m.status = 'active') then
    raise exception using errcode = '42501', message = 'PARTNER_ACCESS_DENIED';
  end if;
  select * into v_order from public.online_orders
    where id = p_order_id and merchant_id = p_merchant_id for update;
  if v_order.id is null or not exists (select 1 from public.branches b
    where b.id = v_order.branch_id and b.merchant_id = p_merchant_id and b.active) then
    raise exception using errcode = 'P0002', message = 'PARTNER_ORDER_NOT_FOUND';
  end if;
  if v_order.status::text is distinct from p_expected_status then
    raise exception using errcode = '40001', message = 'ORDER_STATUS_CHANGED';
  end if;
  v_allowed := case p_expected_status when 'pending' then 'confirmed'
    when 'confirmed' then 'preparing' when 'preparing' then 'ready' else null end;
  if p_target_status is distinct from v_allowed or v_allowed is null then
    raise exception using errcode = '22023', message = 'PARTNER_ORDER_TRANSITION_NOT_ALLOWED';
  end if;
  update public.online_orders set status = p_target_status::public.order_status, updated_at = now()
    where id = p_order_id returning * into v_order;
  return jsonb_build_object('order_id', v_order.id, 'status', v_order.status, 'updated_at', v_order.updated_at);
end;
$$;
revoke all on function public.advance_partner_order_v1(uuid,uuid,text,text) from public, anon;
grant execute on function public.advance_partner_order_v1(uuid,uuid,text,text) to authenticated;
commit;
