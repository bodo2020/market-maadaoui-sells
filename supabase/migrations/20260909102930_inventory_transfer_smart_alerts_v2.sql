-- Smart Inventory Transfer Alerts V2.
-- Deterministic rules for delayed/stuck transfers and repeated receiving variances.

create index if not exists inventory_transfers_source_inventory_branch_v2_idx
  on public.inventory_transfers(source_inventory_branch_id);
create index if not exists inventory_transfers_destination_inventory_branch_v2_idx
  on public.inventory_transfers(destination_inventory_branch_id);
create index if not exists inventory_transfers_dispatched_by_v2_idx
  on public.inventory_transfers(dispatched_by);
create index if not exists inventory_transfers_received_by_v2_idx
  on public.inventory_transfers(received_by);
create index if not exists inventory_transfers_cancelled_by_v2_idx
  on public.inventory_transfers(cancelled_by);
create index if not exists inventory_transfers_active_transit_eta_v2_idx
  on public.inventory_transfers(from_branch_id,to_branch_id,expected_arrival_date,dispatched_at)
  where status='dispatched';
create index if not exists inventory_transfer_items_variance_product_v2_idx
  on public.inventory_transfer_items(product_id,transfer_id)
  where variance_quantity is not null and variance_quantity<>0;

create or replace function public.get_inventory_transfer_smart_alerts_v2(
  p_branch_id uuid,
  p_from timestamptz default (now()-interval '90 days'),
  p_to timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_alerts jsonb:='[]'::jsonb;
  v_row record;
  v_total bigint:=0;
  v_critical bigint:=0;
  v_warning bigint:=0;
  v_overdue bigint:=0;
  v_stuck bigint:=0;
  v_route_variance bigint:=0;
  v_product_variance bigint:=0;
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then
    raise exception using errcode='42501',message='TRANSFER_ALERT_BRANCH_ACCESS_DENIED';
  end if;
  if not (
    public.staff_has_permission('reports.view',p_branch_id)
    or public.staff_has_permission('inventory.manage',p_branch_id)
    or public.staff_has_permission('inventory.approve_adjustment',p_branch_id)
  ) then
    raise exception using errcode='42501',message='TRANSFER_ALERT_PERMISSION_DENIED';
  end if;
  if p_from is null or p_to is null or p_to<=p_from then
    raise exception using errcode='22023',message='INVALID_REPORT_RANGE';
  end if;
  if p_to-p_from>interval '732 days' then
    raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE';
  end if;

  -- 1) ETA breached: a dispatched transfer is still open after its promised arrival date.
  for v_row in
    select t.id,t.transfer_number,t.from_branch_id,t.to_branch_id,t.expected_arrival_date,t.dispatched_at,
           fb.name as from_branch_name,tb.name as to_branch_name,
           greatest(1,(current_date-t.expected_arrival_date))::int as overdue_days
    from public.inventory_transfers t
    join public.branches fb on fb.id=t.from_branch_id
    join public.branches tb on tb.id=t.to_branch_id
    where t.status='dispatched'
      and t.expected_arrival_date is not null
      and t.expected_arrival_date<current_date
      and (t.from_branch_id=p_branch_id or t.to_branch_id=p_branch_id)
    order by t.expected_arrival_date,t.dispatched_at
    limit 20
  loop
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'id','transfer_overdue:'||v_row.id::text,
      'alert_type','transfer_overdue_eta',
      'severity',case when v_row.overdue_days>=2 then 'critical' else 'warning' end,
      'category','inventory_transfers',
      'priority',case when v_row.overdue_days>=2 then 100 else 92 end,
      'title','تحويل مخزون متأخر عن موعد الوصول',
      'message',format('التحويل %s من %s إلى %s متأخر %s يوم عن موعد الوصول المتوقع.',coalesce(v_row.transfer_number,'بدون رقم'),v_row.from_branch_name,v_row.to_branch_name,v_row.overdue_days),
      'metric_label','أيام التأخير','metric_value',v_row.overdue_days,'metric_unit','days',
      'action','تواصل مع الفرع المرسل والمستلم وحدد مكان الشحنة ثم حدّث حالة التحويل فورًا.',
      'href','/reports/inventory-transfers',
      'evidence',jsonb_build_object('transfer_id',v_row.id,'transfer_number',v_row.transfer_number,'from_branch_id',v_row.from_branch_id,'to_branch_id',v_row.to_branch_id,'expected_arrival_date',v_row.expected_arrival_date,'dispatched_at',v_row.dispatched_at)
    ));
  end loop;

  -- 2) Stuck in transit: elapsed time is above 1.5x route history, with a 24h floor.
  for v_row in
    with route_baseline as (
      select from_branch_id,to_branch_id,
             count(*) as completed_transfers,
             avg(extract(epoch from (received_at-dispatched_at))/3600.0) as avg_transit_hours
      from public.inventory_transfers
      where status in ('received','received_with_variance')
        and dispatched_at is not null and received_at is not null and received_at>=dispatched_at
        and received_at>=greatest(p_from,p_to-interval '90 days') and received_at<p_to
      group by from_branch_id,to_branch_id
      having count(*)>=3
    )
    select t.id,t.transfer_number,t.from_branch_id,t.to_branch_id,t.expected_arrival_date,t.dispatched_at,
           fb.name as from_branch_name,tb.name as to_branch_name,
           round((extract(epoch from (now()-t.dispatched_at))/3600.0)::numeric,1) as elapsed_hours,
           round(coalesce(rb.avg_transit_hours,24)::numeric,1) as baseline_hours,
           round(greatest(24::numeric,coalesce(rb.avg_transit_hours,16)*1.5)::numeric,1) as stuck_threshold_hours
    from public.inventory_transfers t
    join public.branches fb on fb.id=t.from_branch_id
    join public.branches tb on tb.id=t.to_branch_id
    left join route_baseline rb on rb.from_branch_id=t.from_branch_id and rb.to_branch_id=t.to_branch_id
    where t.status='dispatched' and t.dispatched_at is not null
      and (t.from_branch_id=p_branch_id or t.to_branch_id=p_branch_id)
      and not (t.expected_arrival_date is not null and t.expected_arrival_date<current_date)
      and extract(epoch from (now()-t.dispatched_at))/3600.0 > greatest(24,coalesce(rb.avg_transit_hours,16)*1.5)
    order by elapsed_hours desc
    limit 20
  loop
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'id','transfer_stuck:'||v_row.id::text,
      'alert_type','transfer_stuck_in_transit',
      'severity',case when v_row.elapsed_hours>=greatest(48,v_row.stuck_threshold_hours*1.5) then 'critical' else 'warning' end,
      'category','inventory_transfers',
      'priority',case when v_row.elapsed_hours>=greatest(48,v_row.stuck_threshold_hours*1.5) then 96 else 86 end,
      'title','بضاعة معلقة في الطريق',
      'message',format('التحويل %s ما زال في الطريق منذ %s ساعة. حد التنبيه للمسار %s ساعة.',coalesce(v_row.transfer_number,'بدون رقم'),v_row.elapsed_hours,v_row.stuck_threshold_hours),
      'metric_label','ساعات في الطريق','metric_value',v_row.elapsed_hours,'metric_unit','hours',
      'action','راجع آخر حركة للشحنة ومسؤول التسليم، وحدد هل يوجد تأخير تشغيلي أو حالة لم يتم تحديثها.',
      'href','/reports/inventory-transfers',
      'evidence',jsonb_build_object('transfer_id',v_row.id,'transfer_number',v_row.transfer_number,'from_branch_id',v_row.from_branch_id,'to_branch_id',v_row.to_branch_id,'elapsed_hours',v_row.elapsed_hours,'route_baseline_hours',v_row.baseline_hours,'threshold_hours',v_row.stuck_threshold_hours)
    ));
  end loop;

  -- 3) Repeated variance by route over a rolling 90-day evidence window.
  for v_row in
    with received_routes as (
      select t.from_branch_id,t.to_branch_id,
             count(*) filter(where t.status in ('received','received_with_variance')) as received_transfers,
             count(*) filter(where t.status='received_with_variance') as variance_transfers,
             coalesce(sum(x.absolute_variance),0) as absolute_variance_measure
      from public.inventory_transfers t
      left join lateral (
        select coalesce(sum(abs(coalesce(i.variance_quantity,0))),0) as absolute_variance
        from public.inventory_transfer_items i where i.transfer_id=t.id
      ) x on true
      where t.received_at>=greatest(p_from,p_to-interval '90 days') and t.received_at<p_to
        and t.status in ('received','received_with_variance')
        and (t.from_branch_id=p_branch_id or t.to_branch_id=p_branch_id)
      group by t.from_branch_id,t.to_branch_id
    )
    select r.*,fb.name as from_branch_name,tb.name as to_branch_name,
           round((r.variance_transfers::numeric/nullif(r.received_transfers,0))*100,2) as variance_rate
    from received_routes r
    join public.branches fb on fb.id=r.from_branch_id
    join public.branches tb on tb.id=r.to_branch_id
    where r.variance_transfers>=3
    order by r.variance_transfers desc,r.absolute_variance_measure desc
    limit 10
  loop
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'id','transfer_route_variance:'||v_row.from_branch_id::text||':'||v_row.to_branch_id::text,
      'alert_type','transfer_repeated_route_variance',
      'severity',case when v_row.variance_transfers>=5 or v_row.variance_rate>=50 then 'critical' else 'warning' end,
      'category','inventory_transfers',
      'priority',case when v_row.variance_transfers>=5 or v_row.variance_rate>=50 then 94 else 84 end,
      'title','تكرار فرق استلام على نفس مسار التحويل',
      'message',format('المسار %s ← %s سجل %s تحويلات بفروق من أصل %s مستلمة (%s%%).',v_row.from_branch_name,v_row.to_branch_name,v_row.variance_transfers,v_row.received_transfers,v_row.variance_rate),
      'metric_label','تحويلات بفروق','metric_value',v_row.variance_transfers,'metric_unit','transfers',
      'action','راجع إجراءات العد والتعبئة والتسليم على هذا المسار، وقارن الأصناف المتكررة قبل اعتماد تحويلات جديدة.',
      'href','/reports/inventory-transfers',
      'evidence',jsonb_build_object('from_branch_id',v_row.from_branch_id,'to_branch_id',v_row.to_branch_id,'received_transfers',v_row.received_transfers,'variance_transfers',v_row.variance_transfers,'variance_rate_percent',v_row.variance_rate,'absolute_variance_measure',v_row.absolute_variance_measure)
    ));
  end loop;

  -- 4) Repeated variance by product across transfers over the same evidence window.
  for v_row in
    select i.product_id,
           coalesce(max(i.product_name_snapshot),max(p.name),'منتج') as product_name,
           count(distinct t.id) as variance_transfers,
           round(coalesce(sum(abs(i.variance_quantity)),0),3) as absolute_variance_measure,
           count(distinct (t.from_branch_id::text||'>'||t.to_branch_id::text)) as affected_routes
    from public.inventory_transfers t
    join public.inventory_transfer_items i on i.transfer_id=t.id and coalesce(i.variance_quantity,0)<>0
    left join public.products p on p.id=i.product_id
    where t.received_at>=greatest(p_from,p_to-interval '90 days') and t.received_at<p_to
      and t.status='received_with_variance'
      and (t.from_branch_id=p_branch_id or t.to_branch_id=p_branch_id)
    group by i.product_id
    having count(distinct t.id)>=3
    order by count(distinct t.id) desc,coalesce(sum(abs(i.variance_quantity)),0) desc
    limit 10
  loop
    v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object(
      'id','transfer_product_variance:'||v_row.product_id::text,
      'alert_type','transfer_repeated_product_variance',
      'severity',case when v_row.variance_transfers>=5 or v_row.affected_routes>=3 then 'critical' else 'warning' end,
      'category','inventory_transfers',
      'priority',case when v_row.variance_transfers>=5 or v_row.affected_routes>=3 then 93 else 82 end,
      'title','منتج يتكرر فيه فرق الاستلام',
      'message',format('%s ظهر به فرق في %s تحويلات عبر %s مسار/مسارات.',v_row.product_name,v_row.variance_transfers,v_row.affected_routes),
      'metric_label','مرات تكرار الفرق','metric_value',v_row.variance_transfers,'metric_unit','transfers',
      'action','راجع وحدة القياس والباركود وطريقة العد/الوزن والتعبئة لهذا المنتج قبل التحويل التالي.',
      'href','/reports/inventory-transfers',
      'evidence',jsonb_build_object('product_id',v_row.product_id,'product_name',v_row.product_name,'variance_transfers',v_row.variance_transfers,'affected_routes',v_row.affected_routes,'absolute_variance_measure',v_row.absolute_variance_measure)
    ));
  end loop;

  select count(*),
         count(*) filter(where e->>'severity'='critical'),
         count(*) filter(where e->>'severity'='warning'),
         count(*) filter(where e->>'alert_type'='transfer_overdue_eta'),
         count(*) filter(where e->>'alert_type'='transfer_stuck_in_transit'),
         count(*) filter(where e->>'alert_type'='transfer_repeated_route_variance'),
         count(*) filter(where e->>'alert_type'='transfer_repeated_product_variance')
  into v_total,v_critical,v_warning,v_overdue,v_stuck,v_route_variance,v_product_variance
  from jsonb_array_elements(v_alerts) e;

  return jsonb_build_object(
    'version',2,
    'rule_version',1,
    'branch_id',p_branch_id,
    'from',p_from,
    'to',p_to,
    'generated_at',now(),
    'summary',jsonb_build_object(
      'total',v_total,'critical',v_critical,'warning',v_warning,
      'overdue_eta',v_overdue,'stuck_in_transit',v_stuck,
      'repeated_route_variance',v_route_variance,'repeated_product_variance',v_product_variance
    ),
    'alerts',coalesce((select jsonb_agg(e order by (e->>'priority')::int desc,e->>'id') from jsonb_array_elements(v_alerts) e),'[]'::jsonb),
    'data_quality',jsonb_build_object(
      'source','inventory_transfers_v2',
      'variance_lookback_days',90,
      'stuck_floor_hours',24,
      'route_baseline_multiplier',1.5,
      'repeat_variance_min_transfers',3,
      'rules_note','Deterministic transfer alerts; no generative AI and no synthetic transfer data.'
    )
  );
end;
$function$;

revoke all on function public.get_inventory_transfer_smart_alerts_v2(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_inventory_transfer_smart_alerts_v2(uuid,timestamptz,timestamptz) to authenticated,service_role;
