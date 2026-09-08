-- Reporting V2 product/inventory stage.
-- Product profitability is finalized in the immediately following
-- 20260908183722 migration after invoice-level loyalty reconciliation.

create index if not exists inventory_records_branch_date_idx
  on public.inventory_records(branch_id, inventory_date desc);

create index if not exists product_batches_branch_expiry_idx
  on public.product_batches(branch_id, expiry_date)
  where quantity > 0;

create or replace function public.get_reporting_inventory_v2(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_inventory_source uuid;
  v_pricing_source uuid;
  v_span_days numeric;
  v_summary jsonb := '{}'::jsonb;
  v_low_stock jsonb := '[]'::jsonb;
  v_out_stock jsonb := '[]'::jsonb;
  v_no_movement jsonb := '[]'::jsonb;
  v_cover_risk jsonb := '[]'::jsonb;
  v_expiry jsonb := '[]'::jsonb;
  v_categories jsonb := '[]'::jsonb;
  v_stocktake jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then raise exception using errcode='42501',message='REPORTS_VIEW_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;

  select coalesce(b.inventory_source_branch_id,b.id),coalesce(b.pricing_source_branch_id,b.id)
    into v_inventory_source,v_pricing_source
  from public.branches b where b.id=p_branch_id;
  if v_inventory_source is null then raise exception using errcode='22023',message='BRANCH_NOT_FOUND'; end if;
  v_span_days := greatest(extract(epoch from (p_to-p_from))/86400.0,1);

  with movement as (
    select ii.product_id,
      sum(case when ii.weight is not null then ii.weight else coalesce(ii.quantity,0) end)::numeric sold_measure
    from public.pos_invoices i join public.pos_invoice_items ii on ii.invoice_id=i.id
    where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to and ii.product_id is not null group by ii.product_id
  ), returned as (
    select ri.product_id,sum(coalesce(ri.quantity,0))::numeric returned_measure
    from public.returns r join public.return_items ri on ri.return_id=r.id
    where r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to group by ri.product_id
  ), base as (
    select inv.product_id,inv.quantity,
      coalesce(nullif(inv.min_stock_level,0),case when ia.alert_enabled then nullif(ia.min_stock_level,0) end,0)::numeric threshold,
      coalesce(nullif(inv.max_stock_level,0),0)::numeric max_level,
      p.id is not null linked_product,
      coalesce(bp.purchase_price,p.purchase_price) purchase_price,
      coalesce(case when bp.is_offer and bp.offer_price is not null then bp.offer_price else bp.sale_price end,
               case when p.is_offer and p.offer_price is not null then p.offer_price else p.price end) sale_price,
      coalesce(m.sold_measure,0)::numeric sold_measure,coalesce(r.returned_measure,0)::numeric returned_measure
    from public.inventory inv
    left join public.products p on p.id=inv.product_id
    left join public.branch_product_pricing bp on bp.product_id=inv.product_id and bp.branch_id=v_pricing_source
    left join public.inventory_alerts ia on ia.product_id=inv.product_id
    left join movement m on m.product_id=inv.product_id
    left join returned r on r.product_id=inv.product_id
    where inv.branch_id=v_inventory_source
  )
  select jsonb_build_object(
    'inventory_rows',count(*)::bigint,
    'linked_catalog_rows',count(*) filter(where linked_product)::bigint,
    'unlinked_inventory_rows',count(*) filter(where not linked_product)::bigint,
    'positive_stock_rows',count(*) filter(where quantity>0)::bigint,
    'out_of_stock_rows',count(*) filter(where quantity<=0)::bigint,
    'low_stock_rows',count(*) filter(where quantity>0 and threshold>0 and quantity<=threshold)::bigint,
    'overstock_rows',count(*) filter(where quantity>0 and max_level>0 and quantity>max_level)::bigint,
    'no_movement_rows',count(*) filter(where quantity>0 and sold_measure=0)::bigint,
    'on_hand_measure',round(coalesce(sum(greatest(quantity,0)),0),3),
    'purchase_value',round(coalesce(sum(greatest(quantity,0)*coalesce(purchase_price,0)) filter(where linked_product),0),2),
    'retail_value',round(coalesce(sum(greatest(quantity,0)*coalesce(sale_price,0)) filter(where linked_product),0),2),
    'potential_margin_value',round(coalesce(sum(greatest(quantity,0)*(coalesce(sale_price,0)-coalesce(purchase_price,0))) filter(where linked_product),0),2),
    'purchase_price_coverage_rows',count(*) filter(where linked_product and purchase_price is not null and purchase_price>0)::bigint,
    'sale_price_coverage_rows',count(*) filter(where linked_product and sale_price is not null and sale_price>0)::bigint,
    'period_pos_sold_measure',round(coalesce(sum(sold_measure),0),3),
    'period_pos_returned_measure',round(coalesce(sum(returned_measure),0),3),
    'stock_turnover_available',false,
    'stock_turnover_note','Average historical inventory snapshots are not available for the selected recent period; no turnover ratio is fabricated.'
  ) into v_summary from base;

  with base as (
    select inv.product_id,coalesce(p.name,'منتج غير متاح') product_name,p.barcode,inv.quantity,
      coalesce(nullif(inv.min_stock_level,0),case when ia.alert_enabled then nullif(ia.min_stock_level,0) end,0)::numeric threshold,
      coalesce(bp.purchase_price,p.purchase_price) purchase_price,coalesce(mc.name,'بدون قسم') category_name
    from public.inventory inv left join public.products p on p.id=inv.product_id
    left join public.branch_product_pricing bp on bp.product_id=inv.product_id and bp.branch_id=v_pricing_source
    left join public.inventory_alerts ia on ia.product_id=inv.product_id
    left join public.main_categories mc on mc.id=p.main_category_id
    where inv.branch_id=v_inventory_source
  )
  select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'product_name',product_name,'barcode',barcode,
    'quantity',round(quantity,3),'threshold',round(threshold,3),'purchase_value',round(greatest(quantity,0)*coalesce(purchase_price,0),2),'category_name',category_name)
    order by case when threshold>0 then quantity/nullif(threshold,0) else 999999 end,quantity),'[]'::jsonb)
  into v_low_stock from (select * from base where quantity>0 and threshold>0 and quantity<=threshold order by quantity/nullif(threshold,0) asc limit 50) x;

  with base as (
    select inv.product_id,coalesce(p.name,'منتج غير متاح') product_name,p.barcode,inv.quantity,
      coalesce(bp.purchase_price,p.purchase_price) purchase_price,coalesce(mc.name,'بدون قسم') category_name
    from public.inventory inv left join public.products p on p.id=inv.product_id
    left join public.branch_product_pricing bp on bp.product_id=inv.product_id and bp.branch_id=v_pricing_source
    left join public.main_categories mc on mc.id=p.main_category_id
    where inv.branch_id=v_inventory_source and inv.quantity<=0
  )
  select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'product_name',product_name,'barcode',barcode,
    'quantity',round(quantity,3),'purchase_value',0,'category_name',category_name) order by product_name),'[]'::jsonb)
  into v_out_stock from (select * from base order by product_name limit 50) x;

  with movement as (
    select ii.product_id,sum(case when ii.weight is not null then ii.weight else coalesce(ii.quantity,0) end)::numeric sold_measure
    from public.pos_invoices i join public.pos_invoice_items ii on ii.invoice_id=i.id
    where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to and ii.product_id is not null group by ii.product_id
  ), base as (
    select inv.product_id,coalesce(p.name,'منتج غير متاح') product_name,p.barcode,inv.quantity,
      coalesce(bp.purchase_price,p.purchase_price) purchase_price,coalesce(mc.name,'بدون قسم') category_name,coalesce(m.sold_measure,0) sold_measure
    from public.inventory inv left join public.products p on p.id=inv.product_id
    left join public.branch_product_pricing bp on bp.product_id=inv.product_id and bp.branch_id=v_pricing_source
    left join public.main_categories mc on mc.id=p.main_category_id left join movement m on m.product_id=inv.product_id
    where inv.branch_id=v_inventory_source and inv.quantity>0
  )
  select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'product_name',product_name,'barcode',barcode,'quantity',round(quantity,3),
    'purchase_value',round(quantity*coalesce(purchase_price,0),2),'category_name',category_name) order by quantity*coalesce(purchase_price,0) desc),'[]'::jsonb)
  into v_no_movement from (select * from base where sold_measure=0 order by quantity*coalesce(purchase_price,0) desc limit 50) x;

  with sold as (
    select ii.product_id,sum(case when ii.weight is not null then ii.weight else coalesce(ii.quantity,0) end)::numeric sold_measure
    from public.pos_invoices i join public.pos_invoice_items ii on ii.invoice_id=i.id
    where i.branch_id=p_branch_id and i.sale_date>=p_from and i.sale_date<p_to and ii.product_id is not null group by ii.product_id
  ), returned as (
    select ri.product_id,sum(coalesce(ri.quantity,0))::numeric returned_measure
    from public.returns r join public.return_items ri on ri.return_id=r.id
    where r.branch_id=p_branch_id and r.source='pos' and r.status='approved'
      and coalesce(r.approved_at,r.created_at)>=p_from and coalesce(r.approved_at,r.created_at)<p_to group by ri.product_id
  ), base as (
    select inv.product_id,coalesce(p.name,'منتج غير متاح') product_name,p.barcode,inv.quantity,
      greatest(coalesce(s.sold_measure,0)-coalesce(r.returned_measure,0),0)::numeric net_sold,
      coalesce(mc.name,'بدون قسم') category_name
    from public.inventory inv left join public.products p on p.id=inv.product_id
    left join public.main_categories mc on mc.id=p.main_category_id left join sold s on s.product_id=inv.product_id left join returned r on r.product_id=inv.product_id
    where inv.branch_id=v_inventory_source and inv.quantity>0
  ), calc as (
    select *,case when net_sold>0 then quantity/(net_sold/v_span_days) else null end::numeric days_cover from base
  )
  select coalesce(jsonb_agg(jsonb_build_object('product_id',product_id,'product_name',product_name,'barcode',barcode,'quantity',round(quantity,3),
    'period_net_sold',round(net_sold,3),'days_cover',round(days_cover,1),'category_name',category_name) order by days_cover asc),'[]'::jsonb)
  into v_cover_risk from (select * from calc where days_cover is not null and days_cover<=14 order by days_cover asc limit 50) x;

  select coalesce(jsonb_agg(jsonb_build_object('batch_id',x.id,'product_id',x.product_id,'product_name',coalesce(p.name,'منتج غير متاح'),
    'batch_number',x.batch_number,'expiry_date',x.expiry_date,'quantity',x.quantity,'days_to_expiry',(x.expiry_date-current_date),
    'purchase_value',round(coalesce(x.purchase_price,p.purchase_price,0)*x.quantity,2)) order by x.expiry_date),'[]'::jsonb)
  into v_expiry
  from (select * from public.product_batches where branch_id=v_inventory_source and quantity>0 and expiry_date is not null and expiry_date<=current_date+30 order by expiry_date limit 100) x
  left join public.products p on p.id=x.product_id;

  with base as (
    select coalesce(p.main_category_id,'00000000-0000-0000-0000-000000000000'::uuid) category_id,coalesce(mc.name,'بدون قسم') category_name,
      count(*)::bigint sku_rows,count(*) filter(where inv.quantity>0)::bigint in_stock_rows,count(*) filter(where inv.quantity<=0)::bigint out_rows,
      sum(greatest(inv.quantity,0)*coalesce(bp.purchase_price,p.purchase_price,0))::numeric purchase_value,
      sum(greatest(inv.quantity,0)*coalesce(case when bp.is_offer and bp.offer_price is not null then bp.offer_price else bp.sale_price end,
        case when p.is_offer and p.offer_price is not null then p.offer_price else p.price end,0))::numeric retail_value
    from public.inventory inv left join public.products p on p.id=inv.product_id
    left join public.main_categories mc on mc.id=p.main_category_id
    left join public.branch_product_pricing bp on bp.product_id=inv.product_id and bp.branch_id=v_pricing_source
    where inv.branch_id=v_inventory_source
    group by 1,2
  )
  select coalesce(jsonb_agg(jsonb_build_object('category_id',category_id,'category_name',category_name,'sku_rows',sku_rows,
    'in_stock_rows',in_stock_rows,'out_of_stock_rows',out_rows,'purchase_value',round(purchase_value,2),'retail_value',round(retail_value,2))
    order by purchase_value desc),'[]'::jsonb) into v_categories from base;

  select jsonb_build_object(
    'records',count(*)::bigint,
    'products_counted',count(distinct product_id)::bigint,
    'difference_units',coalesce(sum(difference),0),
    'absolute_difference_units',coalesce(sum(abs(difference)),0),
    'difference_value',round(coalesce(sum(difference_value),0),2),
    'absolute_difference_value',round(coalesce(sum(abs(difference_value)),0),2),
    'latest_inventory_date',max(inventory_date)
  ) into v_stocktake
  from public.inventory_records ir
  where ir.branch_id=v_inventory_source and ir.inventory_date>=timezone('Africa/Cairo',p_from)::date and ir.inventory_date<=timezone('Africa/Cairo',p_to)::date;

  return jsonb_build_object(
    'version',2,'branch_id',p_branch_id,'from',p_from,'to',p_to,'snapshot_at',now(),
    'inventory_source_branch_id',v_inventory_source,'pricing_source_branch_id',v_pricing_source,
    'summary',coalesce(v_summary,'{}'::jsonb),'low_stock',coalesce(v_low_stock,'[]'::jsonb),'out_of_stock',coalesce(v_out_stock,'[]'::jsonb),
    'no_movement',coalesce(v_no_movement,'[]'::jsonb),'coverage_risk',coalesce(v_cover_risk,'[]'::jsonb),
    'near_expiry',coalesce(v_expiry,'[]'::jsonb),'categories',coalesce(v_categories,'[]'::jsonb),'stocktake',coalesce(v_stocktake,'{}'::jsonb),
    'data_quality',jsonb_build_object(
      'inventory_source','branch_inventory_live_snapshot','price_source','branch_pricing_then_current_product_catalog',
      'movement_source','pos_invoice_items_v2_minus_approved_pos_returns','online_item_movement_included',false,
      'damaged_products_included',false,'damaged_reason','legacy_damaged_products_has_no_branch_id',
      'turnover_available',false,'turnover_reason','recent_average_inventory_snapshots_are_not_available'
    )
  );
end;
$function$;

revoke all on function public.get_reporting_inventory_v2(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_reporting_inventory_v2(uuid,timestamptz,timestamptz) to authenticated,service_role;
