create or replace function public.get_reporting_inventory_transfers_v2(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_can_profit boolean:=false;
  v_summary jsonb:='{}'::jsonb;
  v_recent jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='REPORT_BRANCH_ACCESS_DENIED'; end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then raise exception using errcode='42501',message='REPORTS_VIEW_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;
  v_can_profit:=public.staff_has_permission('reports.profit',p_branch_id);

  with item_totals as (
    select i.transfer_id,
      count(*)::bigint items_count,
      coalesce(sum(i.quantity),0)::numeric shipped_measure,
      coalesce(sum(coalesce(i.received_quantity,0)),0)::numeric received_measure,
      coalesce(sum(abs(coalesce(i.variance_quantity,0))),0)::numeric absolute_variance_measure,
      coalesce(sum(i.quantity*coalesce(i.unit_cost_snapshot,0)),0)::numeric shipped_cost_value,
      coalesce(sum(coalesce(i.received_quantity,0)*coalesce(i.unit_cost_snapshot,0)),0)::numeric received_cost_value,
      coalesce(sum(abs(coalesce(i.variance_quantity,0))*coalesce(i.unit_cost_snapshot,0)),0)::numeric absolute_variance_cost
    from public.inventory_transfer_items i
    group by i.transfer_id
  ), base as (
    select t.*,coalesce(it.items_count,0) items_count,coalesce(it.shipped_measure,0) shipped_measure,
      coalesce(it.received_measure,0) received_measure,coalesce(it.absolute_variance_measure,0) absolute_variance_measure,
      coalesce(it.shipped_cost_value,0) shipped_cost_value,coalesce(it.received_cost_value,0) received_cost_value,
      coalesce(it.absolute_variance_cost,0) absolute_variance_cost,
      case when t.from_branch_id=p_branch_id then 'outgoing' else 'incoming' end direction
    from public.inventory_transfers t
    left join item_totals it on it.transfer_id=t.id
    where t.from_branch_id=p_branch_id or t.to_branch_id=p_branch_id
  )
  select jsonb_build_object(
    'requested_outgoing',count(*) filter(where direction='outgoing' and status='requested'),
    'requested_incoming',count(*) filter(where direction='incoming' and status='requested'),
    'in_transit_outgoing',count(*) filter(where direction='outgoing' and status='dispatched'),
    'in_transit_incoming',count(*) filter(where direction='incoming' and status='dispatched'),
    'in_transit_outgoing_measure',round(coalesce(sum(shipped_measure) filter(where direction='outgoing' and status='dispatched'),0),3),
    'in_transit_incoming_measure',round(coalesce(sum(shipped_measure) filter(where direction='incoming' and status='dispatched'),0),3),
    'in_transit_outgoing_cost',case when v_can_profit then round(coalesce(sum(shipped_cost_value) filter(where direction='outgoing' and status='dispatched'),0),2) else null end,
    'in_transit_incoming_cost',case when v_can_profit then round(coalesce(sum(shipped_cost_value) filter(where direction='incoming' and status='dispatched'),0),2) else null end,
    'received_in_period',count(*) filter(where received_at>=p_from and received_at<p_to and status in ('received','received_with_variance')),
    'received_with_variance_in_period',count(*) filter(where received_at>=p_from and received_at<p_to and status='received_with_variance'),
    'received_measure_in_period',round(coalesce(sum(received_measure) filter(where received_at>=p_from and received_at<p_to and status in ('received','received_with_variance')),0),3),
    'absolute_variance_measure_in_period',round(coalesce(sum(absolute_variance_measure) filter(where received_at>=p_from and received_at<p_to and status='received_with_variance'),0),3),
    'absolute_variance_cost_in_period',case when v_can_profit then round(coalesce(sum(absolute_variance_cost) filter(where received_at>=p_from and received_at<p_to and status='received_with_variance'),0),2) else null end,
    'variance_rate_percent',case when count(*) filter(where received_at>=p_from and received_at<p_to and status in ('received','received_with_variance'))>0 then
      round((count(*) filter(where received_at>=p_from and received_at<p_to and status='received_with_variance'))::numeric /
            (count(*) filter(where received_at>=p_from and received_at<p_to and status in ('received','received_with_variance')))::numeric*100,2)
      else 0 end,
    'cancelled_in_period',count(*) filter(where cancelled_at>=p_from and cancelled_at<p_to and status='cancelled'),
    'average_transit_hours',case when count(*) filter(where received_at>=p_from and received_at<p_to and dispatched_at is not null and received_at>=dispatched_at)>0 then
      round(avg(extract(epoch from (received_at-dispatched_at))/3600.0) filter(where received_at>=p_from and received_at<p_to and dispatched_at is not null and received_at>=dispatched_at)::numeric,2)
      else null end,
    'overdue_transfer_tasks',(select count(*) from public.operations_tasks ot where ot.branch_id=p_branch_id and ot.source_kind in ('inventory_transfer_dispatch','inventory_transfer_receive','inventory_transfer_variance') and ot.status not in ('completed','cancelled') and ot.due_at<now()),
    'open_variance_tasks',(select count(*) from public.operations_tasks ot where ot.branch_id=p_branch_id and ot.source_kind='inventory_transfer_variance' and ot.status not in ('completed','cancelled'))
  ) into v_summary from base;

  with item_totals as (
    select i.transfer_id,count(*)::int items_count,coalesce(sum(i.quantity),0)::numeric shipped_measure,
      coalesce(sum(coalesce(i.received_quantity,0)),0)::numeric received_measure,
      coalesce(sum(abs(coalesce(i.variance_quantity,0))),0)::numeric variance_measure,
      coalesce(sum(i.quantity*coalesce(i.unit_cost_snapshot,0)),0)::numeric cost_value
    from public.inventory_transfer_items i group by i.transfer_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'transfer_number',t.transfer_number,'direction',case when t.from_branch_id=p_branch_id then 'outgoing' else 'incoming' end,
    'from_branch_name',fb.name,'to_branch_name',tb.name,'status',t.status,'items_count',coalesce(it.items_count,0),
    'shipped_measure',round(coalesce(it.shipped_measure,0),3),'received_measure',round(coalesce(it.received_measure,0),3),
    'variance_measure',round(coalesce(it.variance_measure,0),3),'cost_value',case when v_can_profit then round(coalesce(it.cost_value,0),2) else null end,
    'requested_at',t.requested_at,'dispatched_at',t.dispatched_at,'received_at',t.received_at,'expected_arrival_date',t.expected_arrival_date
  ) order by coalesce(t.received_at,t.dispatched_at,t.requested_at,t.created_at) desc),'[]'::jsonb)
  into v_recent
  from (
    select * from public.inventory_transfers
    where from_branch_id=p_branch_id or to_branch_id=p_branch_id
    order by coalesce(received_at,dispatched_at,requested_at,created_at) desc
    limit 30
  ) t
  join public.branches fb on fb.id=t.from_branch_id
  join public.branches tb on tb.id=t.to_branch_id
  left join item_totals it on it.transfer_id=t.id;

  return jsonb_build_object(
    'version',2,'branch_id',p_branch_id,'from',p_from,'to',p_to,
    'permissions',jsonb_build_object('can_view_profit',v_can_profit),
    'summary',coalesce(v_summary,'{}'::jsonb),'recent_transfers',coalesce(v_recent,'[]'::jsonb),
    'data_quality',jsonb_build_object('source','inventory_transfers_v2','legacy_rows',(select count(*) from public.inventory_transfers where request_id is null))
  );
end;
$function$;

revoke all on function public.get_reporting_inventory_transfers_v2(uuid,timestamptz,timestamptz) from public,anon;
grant execute on function public.get_reporting_inventory_transfers_v2(uuid,timestamptz,timestamptz) to authenticated,service_role;
