revoke select on table public.pos_invoices from authenticated;
revoke select on table public.pos_invoice_items from authenticated;

create or replace function public.list_pos_invoices_v2(
  p_branch_id uuid,
  p_limit integer default 30,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_can_view_all boolean := false;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;

  if not public.has_branch_access(v_uid, p_branch_id) then
    raise exception using errcode='42501', message='BRANCH_ACCESS_DENIED';
  end if;

  v_can_view_all := public.staff_has_permission('sales.view', p_branch_id);

  select coalesce(jsonb_agg(to_jsonb(x) order by x.sale_date desc), '[]'::jsonb)
  into v_result
  from (
    select
      i.id as invoice_id,
      i.sale_id,
      i.invoice_number,
      i.sale_date,
      i.cashier_id,
      i.cashier_name,
      i.customer_id,
      i.customer_name,
      i.customer_phone,
      i.subtotal,
      i.discount,
      i.total,
      i.loyalty_voucher_amount,
      i.amount_charged,
      i.payment_method,
      i.payment_method_id,
      i.payment_method_code,
      i.payment_method_name,
      i.payment_method_type,
      i.payment_fee_amount,
      i.customer_payment_fee_amount,
      i.merchant_payment_fee_amount,
      i.payment_reference,
      i.item_count,
      coalesce((
        select sum(r.total_amount)
        from public.returns r
        where r.sale_id = i.sale_id
          and r.status <> 'rejected'
      ), 0) as returned_amount,
      coalesce((
        select count(*)
        from public.returns r
        where r.sale_id = i.sale_id
          and r.status <> 'rejected'
      ), 0) as return_count,
      coalesce((
        select count(*)
        from public.returns r
        where r.sale_id = i.sale_id
          and r.status <> 'rejected'
          and r.refund_status in ('pending','pending_card','pending_provider','pending_electronic')
      ), 0) as pending_refund_count
    from public.pos_invoices i
    where i.branch_id = p_branch_id
      and (v_can_view_all or i.cashier_id = v_uid)
      and (
        nullif(btrim(coalesce(p_search,'')), '') is null
        or i.invoice_number ilike '%' || btrim(p_search) || '%'
        or coalesce(i.customer_name,'') ilike '%' || btrim(p_search) || '%'
        or coalesce(i.customer_phone,'') ilike '%' || btrim(p_search) || '%'
        or coalesce(i.payment_reference,'') ilike '%' || btrim(p_search) || '%'
      )
    order by i.sale_date desc
    limit greatest(1, least(coalesce(p_limit,30),100))
  ) x;

  return v_result;
end;
$function$;

revoke execute on function public.list_pos_invoices_v2(uuid,integer,text) from public, anon;
grant execute on function public.list_pos_invoices_v2(uuid,integer,text) to authenticated;

create or replace function public.get_pos_invoice_snapshot(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_invoice public.pos_invoices%rowtype;
  v_items jsonb;
  v_returns jsonb;
begin
  if v_uid is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;

  select * into v_invoice
  from public.pos_invoices i
  where i.sale_id = p_sale_id;

  if v_invoice.id is null then
    raise exception using errcode='P0002', message='INVOICE_NOT_FOUND';
  end if;

  if not public.has_branch_access(v_uid, v_invoice.branch_id) then
    raise exception using errcode='42501', message='BRANCH_ACCESS_DENIED';
  end if;

  if v_invoice.cashier_id is distinct from v_uid
     and not public.staff_has_permission('sales.view', v_invoice.branch_id) then
    raise exception using errcode='42501', message='INVOICE_ACCESS_DENIED';
  end if;

  select coalesce(jsonb_agg(to_jsonb(ii) order by ii.line_no), '[]'::jsonb)
  into v_items
  from public.pos_invoice_items ii
  where ii.invoice_id = v_invoice.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'total_amount', r.total_amount,
    'status', r.status,
    'refund_status', r.refund_status,
    'refund_cash_amount', r.refund_cash_amount,
    'refund_card_amount', r.refund_card_amount,
    'refund_loyalty_amount', r.refund_loyalty_amount,
    'reason', r.reason,
    'created_at', r.created_at
  ) order by r.created_at desc), '[]'::jsonb)
  into v_returns
  from public.returns r
  where r.sale_id = p_sale_id
    and r.status <> 'rejected';

  return jsonb_build_object(
    'invoice', to_jsonb(v_invoice),
    'items', v_items,
    'returns', v_returns
  );
end;
$function$;

revoke execute on function public.get_pos_invoice_snapshot(uuid) from public, anon;
grant execute on function public.get_pos_invoice_snapshot(uuid) to authenticated;
