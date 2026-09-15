create or replace function public.get_reporting_waste_v1(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,100),10),200);
  v_can_profit boolean:=false;
  v_summary jsonb:='{}'::jsonb;
  v_reasons jsonb:='[]'::jsonb;
  v_products jsonb:='[]'::jsonb;
  v_daily jsonb:='[]'::jsonb;
  v_recent jsonb:='[]'::jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='BRANCH_ACCESS_DENIED'; end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then raise exception using errcode='42501',message='REPORTS_VIEW_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;
  v_can_profit:=public.staff_has_permission('reports.profit',p_branch_id);

  with base as (
    select t.id as task_id,t.completed_at as event_at,t.completed_by,t.metadata,
      r.product_id,r.purchase_price_snapshot,p.name as product_name,p.barcode,p.unit_of_measure,
      lower(coalesce(t.metadata->>'reason_code','unknown')) as reason_code,
      case when (t.metadata->>'adjustment_delta') ~ '^-?[0-9]+(\.[0-9]+)?$' then (t.metadata->>'adjustment_delta')::numeric else 0 end as adjustment_delta,
      coalesce(nullif(t.metadata->>'resolution_note',''),nullif(t.description,'')) as note
    from public.operations_tasks t
    join private.inventory_audit_recounts_v2 r on r.id=t.source_id
    left join public.products p on p.id=r.product_id
    where t.branch_id=p_branch_id
      and t.task_type='inventory_adjustment_review'
      and t.source_kind='inventory_adjustment'
      and t.status='completed'
      and t.metadata->>'inventory_adjustment_decision'='approved'
      and lower(coalesce(t.metadata->>'reason_code','')) in ('damage','breakage')
      and t.completed_at>=p_from and t.completed_at<p_to
      and case when (t.metadata->>'adjustment_delta') ~ '^-?[0-9]+(\.[0-9]+)?$' then (t.metadata->>'adjustment_delta')::numeric else 0 end < 0
  )
  select jsonb_build_object(
    'events',count(*)::bigint,
    'affected_products',count(distinct product_id)::bigint,
    'damaged_measure',round(coalesce(sum(abs(adjustment_delta)),0),3),
    'cost_loss',case when v_can_profit then round(coalesce(sum(abs(adjustment_delta)*coalesce(purchase_price_snapshot,0)),0),2) else null end,
    'average_event_cost',case when v_can_profit and count(*)>0 then round(coalesce(sum(abs(adjustment_delta)*coalesce(purchase_price_snapshot,0)),0)/count(*),2) else null end
  ) into v_summary from base;

  with base as (
    select lower(coalesce(t.metadata->>'reason_code','unknown')) as reason_code,
      case when (t.metadata->>'adjustment_delta') ~ '^-?[0-9]+(\.[0-9]+)?$' then abs((t.metadata->>'adjustment_delta')::numeric) else 0 end as damaged_measure,
      coalesce(r.purchase_price_snapshot,0) as purchase_price_snapshot
    from public.operations_tasks t join private.inventory_audit_recounts_v2 r on r.id=t.source_id
    where t.branch_id=p_branch_id and t.task_type='inventory_adjustment_review' and t.source_kind='inventory_adjustment' and t.status='completed'
      and t.metadata->>'inventory_adjustment_decision'='approved' and lower(coalesce(t.metadata->>'reason_code','')) in ('damage','breakage')
      and t.completed_at>=p_from and t.completed_at<p_to
      and case when (t.metadata->>'adjustment_delta') ~ '^-?[0-9]+(\.[0-9]+)?$' then (t.metadata->>'adjustment_delta')::numeric else 0 end < 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'reason_code',reason_code,'events',events,'damaged_measure',round(damaged_measure,3),
    'cost_loss',case when v_can_profit then round(cost_loss,2) else null end
  ) order by damaged_measure desc),'[]'::jsonb)
  into v_reasons
  from (
    select reason_code,count(*)::bigint as events,sum(damaged_measure)::numeric as damaged_measure,
      sum(damaged_measure*purchase_price_snapshot)::numeric as cost_loss
    from base group by reason_code
  ) x;

  with base as (
    select r.product_id,coalesce(p.name,'منتج غير متاح') as product_name,p.barcode,
      coalesce(p.unit_of_measure,p.base_unit,'قطعة') as unit_of_measure,
      case when (t.metadata->>'adjustment_delta') ~ '^-?[0-9]+(\.[0-9]+)?$' then abs((t.metadata->>'adjustment_delta')::numeric) else 0 end as damaged_measure,
      coalesce(r.purchase_price_snapshot,0) as purchase_price_snapshot
    from public.operations_tasks t join private.inventory_audit_recounts_v2 r on r.id=t.source_id
    left join public.products p on p.id=r.product_id
    where t.branch_id=p_branch_id and t.task_type='inventory_adjustment_review' and t.source_kind='inventory_adjustment' and t.status='completed'
      and t.metadata->>'inventory_adjustment_decision'='approved' and lower(coalesce(t.metadata->>'reason_code','')) in ('damage','breakage')
      and t.completed_at>=p_from and t.completed_at<p_to
      and case when (t.metadata->>'adjustment_delta') ~ '^-?[0-9]+(\.[0-9]+)?$' then (t.metadata->>'adjustment_delta')::numeric else 0 end < 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',product_id,'product_name',product_name,'barcode',barcode,'unit_of_measure',unit_of_measure,
    'events',events,'damaged_measure',round(damaged_measure,3),
    'cost_loss',case when v_can_profit then round(cost_loss,2) else null end
  ) order by damaged_measure desc,product_name),'[]'::jsonb)
  into v_products
  from (
    select product_id,max(product_name) as product_name,max(barcode) as barcode,max(unit_of_measure) as unit_of_measure,
      count(*)::bigint as events,sum(damaged_measure)::numeric as damaged_measure,
      sum(damaged_measure*purchase_price_snapshot)::numeric as cost_loss
    from base group by product_id order by damaged_measure desc limit v_limit
  ) x;

  with base as (
    select (timezone('Africa/Cairo',t.completed_at))::date as day,
      case when (t.metadata->>'adjustment_delta') ~ '^-?[0-9]+(\.[0-9]+)?$' then abs((t.metadata->>'adjustment_delta')::numeric) else 0 end as damaged_measure,
      coalesce(r.purchase_price_snapshot,0) as purchase_price_snapshot
    from public.operations_tasks t join private.inventory_audit_recounts_v2 r on r.id=t.source_id
    where t.branch_id=p_branch_id and t.task_type='inventory_adjustment_review' and t.source_kind='inventory_adjustment' and t.status='completed'
      and t.metadata->>'inventory_adjustment_decision'='approved' and lower(coalesce(t.metadata->>'reason_code','')) in ('damage','breakage')
      and t.completed_at>=p_from and t.completed_at<p_to
      and case when (t.metadata->>'adjustment_delta') ~ '^-?[0-9]+(\.[0-9]+)?$' then (t.metadata->>'adjustment_delta')::numeric else 0 end < 0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day',day,'events',events,'damaged_measure',round(damaged_measure,3),
    'cost_loss',case when v_can_profit then round(cost_loss,2) else null end
  ) order by day),'[]'::jsonb)
  into v_daily
  from (
    select day,count(*)::bigint as events,sum(damaged_measure)::numeric as damaged_measure,
      sum(damaged_measure*purchase_price_snapshot)::numeric as cost_loss
    from base group by day
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'task_id',x.task_id,'event_at',x.event_at,'product_id',x.product_id,'product_name',x.product_name,'barcode',x.barcode,
    'reason_code',x.reason_code,'damaged_measure',round(x.damaged_measure,3),'unit_of_measure',x.unit_of_measure,
    'cost_loss',case when v_can_profit then round(x.damaged_measure*x.purchase_price_snapshot,2) else null end,
    'note',x.note
  ) order by x.event_at desc),'[]'::jsonb)
  into v_recent
  from (
    select t.id as task_id,t.completed_at as event_at,r.product_id,coalesce(p.name,'منتج غير متاح') as product_name,p.barcode,
      lower(coalesce(t.metadata->>'reason_code','unknown')) as reason_code,
      case when (t.metadata->>'adjustment_delta') ~ '^-?[0-9]+(\.[0-9]+)?$' then abs((t.metadata->>'adjustment_delta')::numeric) else 0 end as damaged_measure,
      coalesce(p.unit_of_measure,p.base_unit,'قطعة') as unit_of_measure,coalesce(r.purchase_price_snapshot,0) as purchase_price_snapshot,
      coalesce(nullif(t.metadata->>'resolution_note',''),nullif(t.description,'')) as note
    from public.operations_tasks t join private.inventory_audit_recounts_v2 r on r.id=t.source_id
    left join public.products p on p.id=r.product_id
    where t.branch_id=p_branch_id and t.task_type='inventory_adjustment_review' and t.source_kind='inventory_adjustment' and t.status='completed'
      and t.metadata->>'inventory_adjustment_decision'='approved' and lower(coalesce(t.metadata->>'reason_code','')) in ('damage','breakage')
      and t.completed_at>=p_from and t.completed_at<p_to
      and case when (t.metadata->>'adjustment_delta') ~ '^-?[0-9]+(\.[0-9]+)?$' then (t.metadata->>'adjustment_delta')::numeric else 0 end < 0
    order by t.completed_at desc limit v_limit
  ) x;

  return jsonb_build_object(
    'version',1,'branch_id',p_branch_id,'from',p_from,'to',p_to,
    'permissions',jsonb_build_object('can_view_cost_loss',v_can_profit),
    'summary',coalesce(v_summary,'{}'::jsonb),'reasons',coalesce(v_reasons,'[]'::jsonb),
    'products',coalesce(v_products,'[]'::jsonb),'daily',coalesce(v_daily,'[]'::jsonb),'recent',coalesce(v_recent,'[]'::jsonb),
    'data_quality',jsonb_build_object(
      'source','approved inventory_adjustment_review tasks',
      'included_reasons',jsonb_build_array('damage','breakage'),
      'cost_source','inventory recount purchase_price_snapshot',
      'positive_adjustments_excluded',true
    )
  );
end;
$function$;

revoke all on function public.get_reporting_waste_v1(uuid,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.get_reporting_waste_v1(uuid,timestamptz,timestamptz,integer) to authenticated,service_role;
