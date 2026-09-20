create table if not exists private.online_order_item_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.online_orders(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  line_index integer not null check (line_index>=0),
  product_id uuid,
  variant_id uuid,
  product_name text,
  quantity numeric not null default 0,
  line_revenue numeric(14,2) not null default 0,
  unit_purchase_cost numeric(14,4),
  line_cogs numeric(14,2),
  cost_source text not null check (cost_source in ('delivery_catalog_snapshot','legacy_backfill_catalog','missing')),
  captured_at timestamptz not null default now(),
  unique(order_id,line_index)
);
create index if not exists online_order_cost_snapshots_branch_order_idx
  on private.online_order_item_cost_snapshots(branch_id,order_id);
revoke all on private.online_order_item_cost_snapshots from public,anon,authenticated;

create or replace function private.capture_online_order_cost_snapshot(p_order_id uuid,p_source text default 'delivery_catalog_snapshot')
returns integer
language plpgsql security definer set search_path=''
as $function$
declare v_inserted integer:=0;
begin
  if p_source not in ('delivery_catalog_snapshot','legacy_backfill_catalog') then
    raise exception using errcode='22023',message='INVALID_ONLINE_COST_SOURCE';
  end if;

  with order_row as (
    select o.id,o.branch_id,o.items
    from public.online_orders o
    where o.id=p_order_id and o.branch_id is not null and o.status='delivered' and o.payment_status='paid'
  ), expanded as (
    select o.id order_id,o.branch_id,(j.ordinality-1)::integer line_index,j.item,
      case when coalesce(j.item->>'product_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (j.item->>'product_id')::uuid else null end product_id,
      case when coalesce(j.item->>'variant_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (j.item->>'variant_id')::uuid else null end variant_id,
      case when coalesce(j.item->>'quantity','') ~ '^-?[0-9]+([.][0-9]+)?$' then (j.item->>'quantity')::numeric else 0 end qty,
      case when coalesce(j.item->>'bulk_quantity','') ~ '^-?[0-9]+([.][0-9]+)?$' then (j.item->>'bulk_quantity')::numeric else null end item_bulk_qty,
      lower(coalesce(j.item->>'is_bulk','false')) in ('true','1','yes') is_bulk,
      case
        when coalesce(j.item->>'total','') ~ '^-?[0-9]+([.][0-9]+)?$' then (j.item->>'total')::numeric
        when coalesce(j.item->>'price','') ~ '^-?[0-9]+([.][0-9]+)?$'
          then (j.item->>'price')::numeric * case when coalesce(j.item->>'quantity','') ~ '^-?[0-9]+([.][0-9]+)?$' then (j.item->>'quantity')::numeric else 0 end
        else 0 end raw_line_revenue
    from order_row o
    cross join lateral jsonb_array_elements(case when jsonb_typeof(o.items)='array' then o.items else '[]'::jsonb end)
      with ordinality as j(item,ordinality)
  ), resolved as (
    select e.*,
      case
        when pv.purchase_price is not null then pv.purchase_price
        when p.purchase_price is null then null
        when e.is_bulk then p.purchase_price*coalesce(e.item_bulk_qty,p.bulk_quantity::numeric,1)
        else p.purchase_price end unit_cost
    from expanded e
    left join public.products p on p.id=e.product_id
    left join public.product_variants pv on pv.id=e.variant_id
  )
  insert into private.online_order_item_cost_snapshots(
    order_id,branch_id,line_index,product_id,variant_id,product_name,quantity,line_revenue,
    unit_purchase_cost,line_cogs,cost_source
  )
  select r.order_id,r.branch_id,r.line_index,r.product_id,r.variant_id,
    coalesce(nullif(r.item->>'product_name',''),nullif(r.item->>'name',''),'منتج'),
    r.qty,round(greatest(r.raw_line_revenue,0),2),
    case when r.unit_cost is null then null else round(r.unit_cost,4) end,
    case when r.unit_cost is null then null else round(r.unit_cost*r.qty,2) end,
    case when r.unit_cost is null then 'missing' else p_source end
  from resolved r
  on conflict(order_id,line_index) do nothing;
  get diagnostics v_inserted=row_count;
  return v_inserted;
end;
$function$;
revoke all on function private.capture_online_order_cost_snapshot(uuid,text) from public,anon,authenticated;

create or replace function private.snapshot_online_order_cost_trigger()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if new.branch_id is not null and new.status='delivered' and new.payment_status='paid' then
    perform private.capture_online_order_cost_snapshot(new.id,'delivery_catalog_snapshot');
  end if;
  return new;
end;
$function$;
revoke all on function private.snapshot_online_order_cost_trigger() from public,anon,authenticated;

drop trigger if exists online_order_cost_snapshot_on_realization on public.online_orders;
create trigger online_order_cost_snapshot_on_realization
after insert or update of status,payment_status,items on public.online_orders
for each row when (new.status='delivered' and new.payment_status='paid')
execute function private.snapshot_online_order_cost_trigger();

do $block$
declare v_order record;
begin
  for v_order in select id from public.online_orders
    where branch_id is not null and status='delivered' and payment_status='paid'
  loop
    perform private.capture_online_order_cost_snapshot(v_order.id,'legacy_backfill_catalog');
  end loop;
end
$block$;

create or replace function public.get_reporting_online_profit_v1(p_branch_id uuid,p_from timestamptz,p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare v_summary jsonb:='{}'::jsonb; v_daily jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.staff_has_permission('reports.profit',p_branch_id) then raise exception using errcode='42501',message='REPORTS_PROFIT_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;

  with realized_orders as (
    select o.id,o.created_at,
      greatest(coalesce(o.total,0)-coalesce(o.shipping_cost,0),0)::numeric merchandise_revenue,
      coalesce(o.shipping_cost,0)::numeric shipping_revenue,
      case when jsonb_typeof(o.items)='array' then jsonb_array_length(o.items) else 0 end expected_lines
    from public.online_orders o
    where o.branch_id=p_branch_id and o.created_at>=p_from and o.created_at<p_to
      and o.status='delivered' and o.payment_status='paid'
  ), cost_by_order as (
    select r.id,r.created_at,r.merchandise_revenue,r.shipping_revenue,r.expected_lines,
      count(s.id)::integer snapshot_lines,
      count(s.id) filter(where s.line_cogs is not null)::integer costed_lines,
      count(s.id) filter(where s.cost_source='legacy_backfill_catalog')::integer reconstructed_lines,
      coalesce(sum(s.line_cogs),0)::numeric cogs
    from realized_orders r
    left join private.online_order_item_cost_snapshots s on s.order_id=r.id
    group by r.id,r.created_at,r.merchandise_revenue,r.shipping_revenue,r.expected_lines
  ), totals as (
    select count(*)::bigint order_count,
      round(coalesce(sum(merchandise_revenue),0),2) online_net_sales,
      round(coalesce(sum(shipping_revenue),0),2) shipping_revenue,
      coalesce(sum(expected_lines),0)::bigint expected_lines,
      coalesce(sum(snapshot_lines),0)::bigint snapshot_lines,
      coalesce(sum(costed_lines),0)::bigint costed_lines,
      coalesce(sum(reconstructed_lines),0)::bigint reconstructed_lines,
      round(coalesce(sum(cogs),0),2) known_cogs
    from cost_by_order
  )
  select jsonb_build_object(
    'order_count',t.order_count,'online_net_sales',t.online_net_sales,'shipping_revenue',t.shipping_revenue,
    'online_cogs',case when t.expected_lines=t.costed_lines then t.known_cogs else null end,
    'online_gross_profit',case when t.expected_lines=t.costed_lines then round(t.online_net_sales-t.known_cogs,2) else null end,
    'online_margin_percent',case when t.expected_lines=t.costed_lines and t.online_net_sales>0 then round((t.online_net_sales-t.known_cogs)/t.online_net_sales*100,2) else null end,
    'expected_lines',t.expected_lines,'snapshot_lines',t.snapshot_lines,'costed_lines',t.costed_lines,
    'missing_cost_lines',greatest(t.expected_lines-t.costed_lines,0),
    'reconstructed_legacy_lines',t.reconstructed_lines,'cost_complete',(t.expected_lines=t.costed_lines)
  ) into v_summary from totals t;

  with realized_orders as (
    select o.id,timezone('Africa/Cairo',o.created_at)::date report_date,
      greatest(coalesce(o.total,0)-coalesce(o.shipping_cost,0),0)::numeric merchandise_revenue,
      coalesce(o.shipping_cost,0)::numeric shipping_revenue,
      case when jsonb_typeof(o.items)='array' then jsonb_array_length(o.items) else 0 end expected_lines
    from public.online_orders o
    where o.branch_id=p_branch_id and o.created_at>=p_from and o.created_at<p_to
      and o.status='delivered' and o.payment_status='paid'
  ), cost_by_order as (
    select r.id,r.report_date,r.merchandise_revenue,r.shipping_revenue,r.expected_lines,
      count(s.id) filter(where s.line_cogs is not null)::integer costed_lines,
      coalesce(sum(s.line_cogs),0)::numeric cogs
    from realized_orders r
    left join private.online_order_item_cost_snapshots s on s.order_id=r.id
    group by r.id,r.report_date,r.merchandise_revenue,r.shipping_revenue,r.expected_lines
  ), daily_rows as (
    select report_date,count(*)::bigint orders,round(sum(merchandise_revenue),2) online_net_sales,
      round(sum(shipping_revenue),2) shipping_revenue,sum(expected_lines)::bigint expected_lines,
      sum(costed_lines)::bigint costed_lines,round(sum(cogs),2) known_cogs
    from cost_by_order group by report_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date',d.report_date,'orders',d.orders,'online_net_sales',d.online_net_sales,'shipping_revenue',d.shipping_revenue,
    'online_cogs',case when d.expected_lines=d.costed_lines then d.known_cogs else null end,
    'online_gross_profit',case when d.expected_lines=d.costed_lines then round(d.online_net_sales-d.known_cogs,2) else null end,
    'cost_complete',(d.expected_lines=d.costed_lines)
  ) order by d.report_date),'[]'::jsonb) into v_daily from daily_rows d;

  return jsonb_build_object(
    'version',1,'branch_id',p_branch_id,'from',p_from,'to',p_to,
    'summary',coalesce(v_summary,'{}'::jsonb),'daily',coalesce(v_daily,'[]'::jsonb),
    'data_quality',jsonb_build_object(
      'profit_available',coalesce((v_summary->>'cost_complete')::boolean,false),
      'cost_basis','delivery-time catalog snapshot for new realized orders',
      'legacy_basis','historical realized orders were reconstructed from catalog purchase prices at migration time',
      'reconstructed_legacy_lines',coalesce((v_summary->>'reconstructed_legacy_lines')::bigint,0),
      'missing_cost_lines',coalesce((v_summary->>'missing_cost_lines')::bigint,0)
    )
  );
end;
$function$;
revoke all on function public.get_reporting_online_profit_v1(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_reporting_online_profit_v1(uuid,timestamptz,timestamptz) to authenticated,service_role;
