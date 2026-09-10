create or replace function public.get_invoice_center_v3(
  p_branch_id uuid,
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_payment_kind text default 'all',
  p_return_state text default 'all'
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
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_page_size integer := greatest(10, least(coalesce(p_page_size, 50), 100));
  v_offset integer;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_payment text := lower(coalesce(nullif(btrim(p_payment_kind), ''), 'all'));
  v_return text := lower(coalesce(nullif(btrim(p_return_state), ''), 'all'));
  v_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;

  if not public.has_branch_access(v_uid, p_branch_id) then
    raise exception using errcode='42501', message='BRANCH_ACCESS_DENIED';
  end if;

  if v_payment not in ('all','cash','card','wallet','mixed') then
    raise exception using errcode='22023', message='INVALID_PAYMENT_FILTER';
  end if;
  if v_return not in ('all','clean','returned','pending') then
    raise exception using errcode='22023', message='INVALID_RETURN_FILTER';
  end if;
  if p_from is not null and p_to is not null and p_from >= p_to then
    raise exception using errcode='22023', message='INVALID_DATE_RANGE';
  end if;

  v_can_view_all := public.staff_has_permission('sales.view', p_branch_id);
  v_offset := (v_page - 1) * v_page_size;

  with return_stats as (
    select
      r.sale_id,
      coalesce(sum(r.total_amount) filter (where r.status <> 'rejected'), 0)::numeric as returned_amount,
      count(*) filter (where r.status <> 'rejected')::bigint as return_count,
      count(*) filter (
        where r.status <> 'rejected'
          and r.refund_status in ('pending','pending_card','pending_provider','pending_electronic')
      )::bigint as pending_refund_count
    from public.returns r
    group by r.sale_id
  ), base as (
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
      coalesce(rs.returned_amount, 0) as returned_amount,
      coalesce(rs.return_count, 0) as return_count,
      coalesce(rs.pending_refund_count, 0) as pending_refund_count,
      case
        when lower(coalesce(i.payment_method_code, i.payment_method, '')) = 'mixed'
          or lower(coalesce(i.payment_method_type, '')) = 'mixed' then 'mixed'
        when lower(coalesce(i.payment_method_code, i.payment_method, '')) = 'cash'
          or lower(coalesce(i.payment_method_type, '')) = 'cash' then 'cash'
        when lower(coalesce(i.payment_method_type, '')) like '%wallet%'
          or lower(coalesce(i.payment_method_code, '')) like '%vodafone%'
          or lower(coalesce(i.payment_method_code, '')) like '%instapay%'
          or lower(coalesce(i.payment_method_code, '')) like '%wallet%' then 'wallet'
        else 'card'
      end as payment_kind
    from public.pos_invoices i
    left join return_stats rs on rs.sale_id = i.sale_id
    where i.branch_id = p_branch_id
      and (v_can_view_all or i.cashier_id = v_uid)
      and (p_from is null or i.sale_date >= p_from)
      and (p_to is null or i.sale_date < p_to)
      and (
        v_search is null
        or i.invoice_number ilike '%' || v_search || '%'
        or coalesce(i.customer_name,'') ilike '%' || v_search || '%'
        or coalesce(i.customer_phone,'') ilike '%' || v_search || '%'
        or coalesce(i.payment_reference,'') ilike '%' || v_search || '%'
        or coalesce(i.cashier_name,'') ilike '%' || v_search || '%'
      )
  ), filtered as (
    select *
    from base
    where (v_payment = 'all' or payment_kind = v_payment)
      and (
        v_return = 'all'
        or (v_return = 'clean' and return_count = 0 and pending_refund_count = 0)
        or (v_return = 'returned' and return_count > 0)
        or (v_return = 'pending' and pending_refund_count > 0)
      )
  )
  select
    count(*)::bigint,
    jsonb_build_object(
      'invoice_count', count(*)::bigint,
      'amount_charged', coalesce(sum(amount_charged),0)::numeric,
      'invoice_total', coalesce(sum(total),0)::numeric,
      'customer_payment_fees', coalesce(sum(customer_payment_fee_amount),0)::numeric,
      'merchant_payment_fees', coalesce(sum(merchant_payment_fee_amount),0)::numeric,
      'returned_amount', coalesce(sum(returned_amount),0)::numeric,
      'return_count', coalesce(sum(return_count),0)::bigint,
      'pending_refund_count', coalesce(sum(pending_refund_count),0)::bigint
    )
  into v_total, v_summary
  from filtered;

  with return_stats as (
    select
      r.sale_id,
      coalesce(sum(r.total_amount) filter (where r.status <> 'rejected'), 0)::numeric as returned_amount,
      count(*) filter (where r.status <> 'rejected')::bigint as return_count,
      count(*) filter (
        where r.status <> 'rejected'
          and r.refund_status in ('pending','pending_card','pending_provider','pending_electronic')
      )::bigint as pending_refund_count
    from public.returns r
    group by r.sale_id
  ), base as (
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
      coalesce(rs.returned_amount, 0) as returned_amount,
      coalesce(rs.return_count, 0) as return_count,
      coalesce(rs.pending_refund_count, 0) as pending_refund_count,
      case
        when lower(coalesce(i.payment_method_code, i.payment_method, '')) = 'mixed'
          or lower(coalesce(i.payment_method_type, '')) = 'mixed' then 'mixed'
        when lower(coalesce(i.payment_method_code, i.payment_method, '')) = 'cash'
          or lower(coalesce(i.payment_method_type, '')) = 'cash' then 'cash'
        when lower(coalesce(i.payment_method_type, '')) like '%wallet%'
          or lower(coalesce(i.payment_method_code, '')) like '%vodafone%'
          or lower(coalesce(i.payment_method_code, '')) like '%instapay%'
          or lower(coalesce(i.payment_method_code, '')) like '%wallet%' then 'wallet'
        else 'card'
      end as payment_kind
    from public.pos_invoices i
    left join return_stats rs on rs.sale_id = i.sale_id
    where i.branch_id = p_branch_id
      and (v_can_view_all or i.cashier_id = v_uid)
      and (p_from is null or i.sale_date >= p_from)
      and (p_to is null or i.sale_date < p_to)
      and (
        v_search is null
        or i.invoice_number ilike '%' || v_search || '%'
        or coalesce(i.customer_name,'') ilike '%' || v_search || '%'
        or coalesce(i.customer_phone,'') ilike '%' || v_search || '%'
        or coalesce(i.payment_reference,'') ilike '%' || v_search || '%'
        or coalesce(i.cashier_name,'') ilike '%' || v_search || '%'
      )
  ), filtered as (
    select *
    from base
    where (v_payment = 'all' or payment_kind = v_payment)
      and (
        v_return = 'all'
        or (v_return = 'clean' and return_count = 0 and pending_refund_count = 0)
        or (v_return = 'returned' and return_count > 0)
        or (v_return = 'pending' and pending_refund_count > 0)
      )
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sale_date desc), '[]'::jsonb)
  into v_rows
  from (
    select * from filtered
    order by sale_date desc
    limit v_page_size offset v_offset
  ) x;

  return jsonb_build_object(
    'version', 3,
    'page', v_page,
    'page_size', v_page_size,
    'total', v_total,
    'total_pages', greatest(1, ceil(v_total::numeric / v_page_size)::integer),
    'summary', v_summary,
    'rows', v_rows
  );
end;
$function$;

revoke all on function public.get_invoice_center_v3(uuid,integer,integer,text,timestamptz,timestamptz,text,text) from public, anon;
grant execute on function public.get_invoice_center_v3(uuid,integer,integer,text,timestamptz,timestamptz,text,text) to authenticated;
