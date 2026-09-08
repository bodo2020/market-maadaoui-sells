-- Reporting V2 product profitability and invoice reconciliation.
-- Allocate invoice-level loyalty vouchers proportionally across product lines,
-- apply the same ratio to approved POS returns, and keep product revenue
-- reconciled to the authoritative POS invoice net.

create or replace function private.reporting_product_sale_lines_v2(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  invoice_id uuid,
  product_id uuid,
  product_name text,
  sold_measure numeric,
  unit_qty numeric,
  bulk_qty numeric,
  weight_qty numeric,
  product_discount numeric,
  raw_line_revenue numeric,
  recognized_line_revenue numeric,
  loyalty_allocated numeric,
  cogs numeric
)
language sql
stable
set search_path = ''
as $function$
with invoice_totals as (
  select
    i.id as invoice_id,
    greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)::numeric as recognized_target,
    coalesce(sum(ii.line_total),0)::numeric as item_total
  from public.pos_invoices i
  left join public.pos_invoice_items ii on ii.invoice_id=i.id
  where i.branch_id=p_branch_id
    and i.sale_date>=p_from and i.sale_date<p_to
  group by i.id,i.total,i.loyalty_voucher_amount
)
select
  ii.invoice_id,
  ii.product_id,
  ii.product_name,
  (case when ii.weight is not null then ii.weight else coalesce(ii.quantity,0) end)::numeric as sold_measure,
  (case when ii.sale_mode='unit' and ii.weight is null then coalesce(ii.quantity,0) else 0 end)::numeric as unit_qty,
  (case when ii.sale_mode='bulk' then coalesce(ii.quantity,0) else 0 end)::numeric as bulk_qty,
  (case when ii.weight is not null then ii.weight else 0 end)::numeric as weight_qty,
  coalesce(ii.discount,0)::numeric as product_discount,
  coalesce(ii.line_total,0)::numeric as raw_line_revenue,
  (case
    when coalesce(it.item_total,0)>0 then coalesce(ii.line_total,0)*it.recognized_target/it.item_total
    else 0
  end)::numeric as recognized_line_revenue,
  (case
    when coalesce(it.item_total,0)>0 then coalesce(ii.line_total,0)-(coalesce(ii.line_total,0)*it.recognized_target/it.item_total)
    else 0
  end)::numeric as loyalty_allocated,
  (coalesce(ii.purchase_price,0)*(case when ii.weight is not null then ii.weight else coalesce(ii.quantity,0) end))::numeric as cogs
from public.pos_invoice_items ii
join invoice_totals it on it.invoice_id=ii.invoice_id;
$function$;

revoke all on function private.reporting_product_sale_lines_v2(uuid,timestamptz,timestamptz) from public,anon,authenticated,service_role;

create or replace function private.reporting_product_return_lines_v2(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  return_id uuid,
  product_id uuid,
  returned_measure numeric,
  raw_return_revenue numeric,
  recognized_return_revenue numeric,
  loyalty_return_adjustment numeric,
  returned_cogs numeric
)
language sql
stable
set search_path = ''
as $function$
with approved_returns as (
  select r.id,r.sale_id
  from public.returns r
  where r.branch_id=p_branch_id
    and r.source='pos'
    and r.status='approved'
    and coalesce(r.approved_at,r.created_at)>=p_from
    and coalesce(r.approved_at,r.created_at)<p_to
), invoice_totals as (
  select
    i.sale_id,
    greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)::numeric as recognized_target,
    coalesce(sum(ii.line_total),0)::numeric as item_total
  from public.pos_invoices i
  left join public.pos_invoice_items ii on ii.invoice_id=i.id
  where i.branch_id=p_branch_id
  group by i.sale_id,i.total,i.loyalty_voucher_amount
)
select
  ri.return_id,
  ri.product_id,
  coalesce(ri.quantity,0)::numeric as returned_measure,
  coalesce(ri.total,0)::numeric as raw_return_revenue,
  (case
    when coalesce(it.item_total,0)>0 then coalesce(ri.total,0)*it.recognized_target/it.item_total
    else coalesce(ri.total,0)
  end)::numeric as recognized_return_revenue,
  (case
    when coalesce(it.item_total,0)>0 then coalesce(ri.total,0)-(coalesce(ri.total,0)*it.recognized_target/it.item_total)
    else 0
  end)::numeric as loyalty_return_adjustment,
  (coalesce(ri.purchase_price,0)*coalesce(ri.quantity,0))::numeric as returned_cogs
from approved_returns ar
join public.return_items ri on ri.return_id=ar.id
left join invoice_totals it on it.sale_id=ar.sale_id;
$function$;

revoke all on function private.reporting_product_return_lines_v2(uuid,timestamptz,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.get_reporting_products_v2(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_can_profit boolean;
  v_span interval;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
  v_limit integer := least(greatest(coalesce(p_limit,100),10),300);
  v_inventory_source uuid;
  v_summary jsonb := '{}'::jsonb;
  v_products jsonb := '[]'::jsonb;
  v_categories jsonb := '[]'::jsonb;
  v_slow jsonb := '[]'::jsonb;
  v_no_movement jsonb := '[]'::jsonb;
  v_invoice_net numeric := 0;
  v_product_net numeric := 0;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then raise exception using errcode='42501',message='REPORTS_VIEW_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;

  select coalesce(b.inventory_source_branch_id,b.id) into v_inventory_source
  from public.branches b where b.id=p_branch_id;
  if v_inventory_source is null then raise exception using errcode='22023',message='BRANCH_NOT_FOUND'; end if;

  v_can_profit := public.staff_has_permission('reports.profit',p_branch_id);
  v_span := p_to-p_from;
  v_prev_to := p_from;
  v_prev_from := p_from-v_span;

  with sold as (
    select
      l.product_id,
      max(l.product_name) product_name,
      count(distinct l.invoice_id)::bigint invoices,
      sum(l.sold_measure)::numeric sold_measure,
      sum(l.unit_qty)::numeric unit_qty,
      sum(l.bulk_qty)::numeric bulk_qty,
      sum(l.weight_qty)::numeric weight_qty,
      sum(l.product_discount)::numeric discounts,
      sum(l.raw_line_revenue)::numeric raw_revenue,
      sum(l.recognized_line_revenue)::numeric recognized_revenue,
      sum(l.loyalty_allocated)::numeric loyalty_allocated,
      sum(l.cogs)::numeric cogs
    from private.reporting_product_sale_lines_v2(p_branch_id,p_from,p_to) l
    group by l.product_id
  ), ret as (
    select
      l.product_id,
      sum(l.returned_measure)::numeric returned_measure,
      sum(l.raw_return_revenue)::numeric raw_return_revenue,
      sum(l.recognized_return_revenue)::numeric recognized_return_revenue,
      sum(l.loyalty_return_adjustment)::numeric loyalty_return_adjustment,
      sum(l.returned_cogs)::numeric returned_cogs
    from private.reporting_product_return_lines_v2(p_branch_id,p_from,p_to) l
    group by l.product_id
  ), ids as (
    select product_id from sold union select product_id from ret
  ), rows as (
    select
      ids.product_id,
      coalesce(s.product_name,p.name,'منتج غير متاح') product_name,
      p.barcode,
      p.main_category_id,
      coalesce(mc.name,'بدون قسم') category_name,
      p.subcategory_id,
      coalesce(sc.name,'بدون قسم فرعي') subcategory_name,
      coalesce(s.invoices,0)::bigint invoices,
      coalesce(s.sold_measure,0)::numeric sold_measure,
      coalesce(s.unit_qty,0)::numeric unit_qty,
      coalesce(s.bulk_qty,0)::numeric bulk_qty,
      coalesce(s.weight_qty,0)::numeric weight_qty,
      coalesce(s.discounts,0)::numeric discounts,
      coalesce(s.raw_revenue,0)::numeric raw_revenue,
      coalesce(s.recognized_revenue,0)::numeric recognized_revenue,
      coalesce(s.loyalty_allocated,0)::numeric loyalty_allocated,
      coalesce(r.returned_measure,0)::numeric returned_measure,
      coalesce(r.raw_return_revenue,0)::numeric raw_return_revenue,
      coalesce(r.recognized_return_revenue,0)::numeric recognized_return_revenue,
      coalesce(r.loyalty_return_adjustment,0)::numeric loyalty_return_adjustment,
      greatest(coalesce(s.sold_measure,0)-coalesce(r.returned_measure,0),0)::numeric net_measure,
      (coalesce(s.recognized_revenue,0)-coalesce(r.recognized_return_revenue,0))::numeric net_revenue,
      (coalesce(s.cogs,0)-coalesce(r.returned_cogs,0))::numeric net_cogs,
      ((coalesce(s.recognized_revenue,0)-coalesce(r.recognized_return_revenue,0))-(coalesce(s.cogs,0)-coalesce(r.returned_cogs,0)))::numeric net_profit
    from ids
    left join sold s using(product_id)
    left join ret r using(product_id)
    left join public.products p on p.id=ids.product_id
    left join public.main_categories mc on mc.id=p.main_category_id
    left join public.subcategories sc on sc.id=p.subcategory_id
  )
  select jsonb_build_object(
    'products_sold',count(*) filter(where recognized_revenue>0)::bigint,
    'products_returned',count(*) filter(where recognized_return_revenue>0)::bigint,
    'item_revenue_before_loyalty',round(coalesce(sum(raw_revenue),0),2),
    'loyalty_allocated',round(coalesce(sum(loyalty_allocated),0),2),
    'recognized_revenue',round(coalesce(sum(recognized_revenue),0),2),
    'returns_before_loyalty',round(coalesce(sum(raw_return_revenue),0),2),
    'return_loyalty_adjustment',round(coalesce(sum(loyalty_return_adjustment),0),2),
    'returns',round(coalesce(sum(recognized_return_revenue),0),2),
    'net_revenue',round(coalesce(sum(net_revenue),0),2),
    'net_measure',round(coalesce(sum(net_measure),0),3),
    'unit_qty',round(coalesce(sum(unit_qty),0),3),
    'bulk_qty',round(coalesce(sum(bulk_qty),0),3),
    'weight_qty',round(coalesce(sum(weight_qty),0),3),
    'discounts',round(coalesce(sum(discounts),0),2),
    'net_cogs',case when v_can_profit then round(coalesce(sum(net_cogs),0),2) else null end,
    'net_profit',case when v_can_profit then round(coalesce(sum(net_profit),0),2) else null end,
    'margin_percent',case when v_can_profit and coalesce(sum(net_revenue),0)<>0 then round(sum(net_profit)/sum(net_revenue)*100,2) else null end
  ) into v_summary
  from rows;

  select coalesce(sum(greatest(i.total-coalesce(i.loyalty_voucher_amount,0),0)),0)
    - coalesce((select sum(l.recognized_return_revenue) from private.reporting_product_return_lines_v2(p_branch_id,p_from,p_to) l),0)
  into v_invoice_net
  from public.pos_invoices i
  where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to;

  v_product_net := coalesce((v_summary->>'net_revenue')::numeric,0);
  v_summary := v_summary || jsonb_build_object(
    'authoritative_pos_net_revenue',round(v_invoice_net,2),
    'reconciliation_difference',round(v_product_net-v_invoice_net,2)
  );

  with current_sold as (
    select l.product_id,max(l.product_name) product_name,count(distinct l.invoice_id)::bigint invoices,
      sum(l.sold_measure)::numeric sold_measure,sum(l.unit_qty)::numeric unit_qty,sum(l.bulk_qty)::numeric bulk_qty,sum(l.weight_qty)::numeric weight_qty,
      sum(l.product_discount)::numeric discounts,sum(l.raw_line_revenue)::numeric raw_revenue,sum(l.recognized_line_revenue)::numeric recognized_revenue,
      sum(l.loyalty_allocated)::numeric loyalty_allocated,sum(l.cogs)::numeric cogs
    from private.reporting_product_sale_lines_v2(p_branch_id,p_from,p_to) l group by l.product_id
  ), current_ret as (
    select l.product_id,sum(l.returned_measure)::numeric returned_measure,sum(l.raw_return_revenue)::numeric raw_return_revenue,
      sum(l.recognized_return_revenue)::numeric recognized_return_revenue,sum(l.loyalty_return_adjustment)::numeric loyalty_return_adjustment,
      sum(l.returned_cogs)::numeric returned_cogs
    from private.reporting_product_return_lines_v2(p_branch_id,p_from,p_to) l group by l.product_id
  ), prev_sold as (
    select l.product_id,sum(l.recognized_line_revenue)::numeric recognized_revenue
    from private.reporting_product_sale_lines_v2(p_branch_id,v_prev_from,v_prev_to) l group by l.product_id
  ), prev_ret as (
    select l.product_id,sum(l.recognized_return_revenue)::numeric recognized_return_revenue
    from private.reporting_product_return_lines_v2(p_branch_id,v_prev_from,v_prev_to) l group by l.product_id
  ), ids as (
    select product_id from current_sold union select product_id from current_ret
  ), rows as (
    select ids.product_id,coalesce(s.product_name,p.name,'منتج غير متاح') product_name,p.barcode,
      coalesce(mc.name,'بدون قسم') category_name,coalesce(sc.name,'بدون قسم فرعي') subcategory_name,
      coalesce(s.invoices,0)::bigint invoices,coalesce(s.sold_measure,0)::numeric sold_measure,
      coalesce(s.unit_qty,0)::numeric unit_qty,coalesce(s.bulk_qty,0)::numeric bulk_qty,coalesce(s.weight_qty,0)::numeric weight_qty,
      coalesce(s.discounts,0)::numeric discounts,coalesce(s.raw_revenue,0)::numeric raw_revenue,
      coalesce(s.recognized_revenue,0)::numeric recognized_revenue,coalesce(s.loyalty_allocated,0)::numeric loyalty_allocated,
      coalesce(r.returned_measure,0)::numeric returned_measure,coalesce(r.raw_return_revenue,0)::numeric raw_return_revenue,
      coalesce(r.recognized_return_revenue,0)::numeric recognized_return_revenue,
      greatest(coalesce(s.sold_measure,0)-coalesce(r.returned_measure,0),0)::numeric net_measure,
      (coalesce(s.recognized_revenue,0)-coalesce(r.recognized_return_revenue,0))::numeric net_revenue,
      (coalesce(s.cogs,0)-coalesce(r.returned_cogs,0))::numeric net_cogs,
      ((coalesce(s.recognized_revenue,0)-coalesce(r.recognized_return_revenue,0))-(coalesce(s.cogs,0)-coalesce(r.returned_cogs,0)))::numeric net_profit,
      (coalesce(ps.recognized_revenue,0)-coalesce(pr.recognized_return_revenue,0))::numeric previous_net_revenue
    from ids left join current_sold s using(product_id) left join current_ret r using(product_id)
    left join prev_sold ps using(product_id) left join prev_ret pr using(product_id)
    left join public.products p on p.id=ids.product_id left join public.main_categories mc on mc.id=p.main_category_id left join public.subcategories sc on sc.id=p.subcategory_id
  ), total as (select coalesce(sum(net_revenue),0)::numeric total_net from rows)
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',r.product_id,'product_name',r.product_name,'barcode',r.barcode,'category_name',r.category_name,'subcategory_name',r.subcategory_name,
    'invoices',r.invoices,'sold_measure',round(r.sold_measure,3),'net_measure',round(r.net_measure,3),'unit_qty',round(r.unit_qty,3),'bulk_qty',round(r.bulk_qty,3),'weight_qty',round(r.weight_qty,3),
    'discounts',round(r.discounts,2),'item_revenue_before_loyalty',round(r.raw_revenue,2),'loyalty_allocated',round(r.loyalty_allocated,2),
    'recognized_revenue',round(r.recognized_revenue,2),'returns',round(r.recognized_return_revenue,2),'net_revenue',round(r.net_revenue,2),
    'net_cogs',case when v_can_profit then round(r.net_cogs,2) else null end,
    'net_profit',case when v_can_profit then round(r.net_profit,2) else null end,
    'margin_percent',case when v_can_profit and r.net_revenue<>0 then round(r.net_profit/r.net_revenue*100,2) else null end,
    'contribution_percent',case when t.total_net<>0 then round(r.net_revenue/t.total_net*100,2) else 0 end,
    'previous_net_revenue',round(r.previous_net_revenue,2),
    'revenue_change_percent',case when r.previous_net_revenue<>0 then round((r.net_revenue-r.previous_net_revenue)/abs(r.previous_net_revenue)*100,2) else null end
  ) order by r.net_revenue desc,r.product_name),'[]'::jsonb)
  into v_products
  from (select * from rows order by net_revenue desc limit v_limit) r cross join total t;

  with sold as (
    select l.product_id,sum(l.recognized_line_revenue)::numeric recognized_revenue,sum(l.sold_measure)::numeric sold_measure,sum(l.cogs)::numeric cogs
    from private.reporting_product_sale_lines_v2(p_branch_id,p_from,p_to) l group by l.product_id
  ), ret as (
    select l.product_id,sum(l.recognized_return_revenue)::numeric return_revenue,sum(l.returned_measure)::numeric returned_measure,sum(l.returned_cogs)::numeric returned_cogs
    from private.reporting_product_return_lines_v2(p_branch_id,p_from,p_to) l group by l.product_id
  ), rows as (
    select coalesce(p.main_category_id,'00000000-0000-0000-0000-000000000000'::uuid) category_id,
      coalesce(mc.name,'بدون قسم') category_name,count(*)::bigint products,
      sum(greatest(coalesce(s.sold_measure,0)-coalesce(r.returned_measure,0),0))::numeric net_measure,
      sum(coalesce(s.recognized_revenue,0)-coalesce(r.return_revenue,0))::numeric net_revenue,
      sum((coalesce(s.recognized_revenue,0)-coalesce(r.return_revenue,0))-(coalesce(s.cogs,0)-coalesce(r.returned_cogs,0)))::numeric net_profit
    from sold s left join ret r using(product_id) left join public.products p on p.id=s.product_id left join public.main_categories mc on mc.id=p.main_category_id
    group by 1,2
  ), total as (select coalesce(sum(net_revenue),0)::numeric total_net from rows)
  select coalesce(jsonb_agg(jsonb_build_object(
    'category_id',r.category_id,'category_name',r.category_name,'products',r.products,'net_measure',round(r.net_measure,3),'net_revenue',round(r.net_revenue,2),
    'net_profit',case when v_can_profit then round(r.net_profit,2) else null end,
    'margin_percent',case when v_can_profit and r.net_revenue<>0 then round(r.net_profit/r.net_revenue*100,2) else null end,
    'contribution_percent',case when t.total_net<>0 then round(r.net_revenue/t.total_net*100,2) else 0 end
  ) order by r.net_revenue desc),'[]'::jsonb)
  into v_categories from rows r cross join total t;

  with sold as (
    select l.product_id,max(l.product_name) product_name,count(distinct l.invoice_id)::bigint invoices,
      sum(l.recognized_line_revenue)::numeric revenue,sum(l.sold_measure)::numeric measure
    from private.reporting_product_sale_lines_v2(p_branch_id,p_from,p_to) l group by l.product_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',x.product_id,'product_name',coalesce(x.product_name,p.name,'منتج غير متاح'),'barcode',p.barcode,
    'invoices',x.invoices,'sold_measure',round(x.measure,3),'recognized_revenue',round(x.revenue,2),'stock_quantity',round(coalesce(inv.quantity,0),3)
  ) order by x.revenue asc),'[]'::jsonb)
  into v_slow
  from (select * from sold where revenue>0 order by revenue asc limit 20) x
  left join public.products p on p.id=x.product_id
  left join public.inventory inv on inv.product_id=x.product_id and inv.branch_id=v_inventory_source;

  with movement as (
    select distinct l.product_id
    from private.reporting_product_sale_lines_v2(p_branch_id,p_from,p_to) l
    where l.product_id is not null
  ), ranked as (
    select inv.product_id,coalesce(p.name,'منتج غير متاح') product_name,p.barcode,inv.quantity,
      inv.quantity*coalesce(p.purchase_price,0) purchase_value,coalesce(mc.name,'بدون قسم') category_name
    from public.inventory inv
    left join public.products p on p.id=inv.product_id
    left join public.main_categories mc on mc.id=p.main_category_id
    left join movement m on m.product_id=inv.product_id
    where inv.branch_id=v_inventory_source and inv.quantity>0 and m.product_id is null
    order by inv.quantity*coalesce(p.purchase_price,0) desc
    limit 30
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',product_id,'product_name',product_name,'barcode',barcode,'stock_quantity',round(quantity,3),
    'purchase_value',round(purchase_value,2),'category_name',category_name
  ) order by purchase_value desc),'[]'::jsonb)
  into v_no_movement from ranked;

  return jsonb_build_object(
    'version',2,'branch_id',p_branch_id,'from',p_from,'to',p_to,'previous_from',v_prev_from,'previous_to',v_prev_to,
    'permissions',jsonb_build_object('can_view_profit',v_can_profit),
    'summary',coalesce(v_summary,'{}'::jsonb),'products',coalesce(v_products,'[]'::jsonb),'categories',coalesce(v_categories,'[]'::jsonb),
    'slow_movers',coalesce(v_slow,'[]'::jsonb),'no_movement',coalesce(v_no_movement,'[]'::jsonb),
    'data_quality',jsonb_build_object(
      'sales_source','pos_invoice_items_v2_with_invoice_loyalty_allocation',
      'returns_source','approved_pos_return_items_with_original_invoice_loyalty_ratio',
      'profit_source','invoice_item_purchase_price_snapshot',
      'category_source','current_product_catalog',
      'invoice_reconciliation','proportional_invoice_level_loyalty_allocation',
      'reconciliation_difference',round(v_product_net-v_invoice_net,2),
      'online_product_level_included',false,
      'online_reason','online_order_items_are_not_yet_normalized_cost_snapshots'
    )
  );
end;
$function$;

revoke all on function public.get_reporting_products_v2(uuid,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.get_reporting_products_v2(uuid,timestamptz,timestamptz,integer) to authenticated,service_role;
