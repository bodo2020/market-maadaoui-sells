-- M16d — throttle periodic ETA history snapshots to material forecast changes.
CREATE OR REPLACE FUNCTION private.recalculate_order_eta_v2(p_order_id uuid, p_reason text DEFAULT 'refresh'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.online_orders%rowtype;
  v_assignment private.delivery_order_assignments_v1%rowtype;
  v_f private.order_fulfillment_state_v1%rowtype;
  v_profile private.order_eta_branch_profiles_v2%rowtype;
  v_existing private.order_eta_current_v1%rowtype;
  v_stage text;
  v_sla_prep integer:=35;
  v_lines integer:=0;
  v_total_units numeric:=0;
  v_remaining_units numeric:=0;
  v_remaining_lines integer:=0;
  v_weight_lines integer:=0;
  v_bulk_lines integer:=0;
  v_progress_ratio numeric:=1;
  v_complexity numeric:=1;
  v_queue_ahead integer:=0;
  v_queue_remaining_lines integer:=0;
  v_active_pickers integer:=0;
  v_available_drivers integer:=0;
  v_busy_drivers integer:=0;
  v_prior_stops integer:=0;
  v_pending_subs integer:=0;
  v_pending_customer_subs integer:=0;
  v_prep_base numeric:=0;
  v_pick_base numeric:=0;
  v_pack_base numeric:=0;
  v_queue_minutes integer:=0;
  v_pick_minutes integer:=0;
  v_sub_minutes integer:=0;
  v_pack_minutes integer:=0;
  v_ready_remaining integer:=0;
  v_dispatch_minutes integer:=0;
  v_driver_to_branch integer:=0;
  v_road_minutes integer:=0;
  v_remaining integer:=0;
  v_full integer:=0;
  v_uncertainty integer:=0;
  v_elapsed integer:=0;
  v_status_since timestamptz;
  v_branch_lat double precision;
  v_branch_lng double precision;
  v_customer_lat double precision;
  v_customer_lng double precision;
  v_distance numeric;
  v_route_duration integer;
  v_route_distance numeric;
  v_route_provider text;
  v_route_degraded boolean;
  v_driver_lat double precision;
  v_driver_lng double precision;
  v_driver_speed numeric;
  v_driver_location_at timestamptz;
  v_driver_distance numeric;
  v_customer_distance numeric;
  v_ready_eta timestamptz;
  v_promised timestamptz;
  v_live timestamptz;
  v_confidence_score integer:=0;
  v_confidence text:='low';
  v_risk text:='on_track';
  v_components jsonb;
  v_history boolean:=false;
begin
  select * into v_order from public.online_orders where id=p_order_id;
  if v_order.id is null then return null; end if;

  select * into v_assignment
  from private.delivery_order_assignments_v1
  where order_id=p_order_id and unassigned_at is null
  order by assigned_at desc limit 1;

  select * into v_f
  from private.order_fulfillment_state_v1
  where order_id=p_order_id;

  select * into v_profile
  from private.order_eta_branch_profiles_v2
  where branch_id=v_order.branch_id;

  v_stage:=private.order_intake_stage_v1(v_order.status::text,v_assignment.delivery_state);

  select coalesce(s.preparation_target_minutes,35)
  into v_sla_prep
  from private.online_order_sla_policies_v1 s
  where s.branch_id=v_order.branch_id and s.enabled;
  v_sla_prep:=coalesce(v_sla_prep,35);

  if v_f.order_id is not null then
    select
      count(*)::integer,
      coalesce(sum(greatest(i.required_quantity,0)),0),
      coalesce(sum(greatest(i.required_quantity-i.picked_quantity-i.shortage_quantity-i.substitution_quantity,0)),0),
      count(*) filter(where i.required_quantity-i.picked_quantity-i.shortage_quantity-i.substitution_quantity>0.0005)::integer,
      count(*) filter(where i.is_weight_based)::integer,
      count(*) filter(where i.is_bulk)::integer
    into v_lines,v_total_units,v_remaining_units,v_remaining_lines,v_weight_lines,v_bulk_lines
    from private.order_fulfillment_items_v1 i
    where i.order_id=p_order_id;
  else
    v_lines:=case when jsonb_typeof(v_order.items)='array' then jsonb_array_length(v_order.items) else 0 end;
    select
      coalesce(sum(case when coalesce(x.value->>'quantity','') ~ '^[0-9]+([.][0-9]+)?$'
        then (x.value->>'quantity')::numeric else 1 end),0),
      count(*) filter(where coalesce((x.value->>'is_weight_based')::boolean,false))::integer,
      count(*) filter(where coalesce((x.value->>'is_bulk')::boolean,false))::integer
    into v_total_units,v_weight_lines,v_bulk_lines
    from jsonb_array_elements(case when jsonb_typeof(v_order.items)='array' then v_order.items else '[]'::jsonb end) x;
    v_remaining_units:=v_total_units;
    v_remaining_lines:=v_lines;
  end if;

  v_total_units:=greatest(coalesce(v_total_units,0),1);
  v_progress_ratio:=least(1,greatest(0,coalesce(v_remaining_units,0)/v_total_units));
  v_complexity:=least(1.85,greatest(
    1,
    1
      + least(0.35,v_lines*0.018)
      + least(0.20,v_weight_lines*0.06)
      + least(0.15,v_bulk_lines*0.05)
      + least(0.15,greatest(v_total_units-v_lines,0)*0.004)
  ));

  select
    count(*)::integer,
    coalesce(sum(greatest(coalesce(f.items_total,1)-coalesce(f.items_picked,0),1)),0)::integer,
    count(distinct f.picker_user_id) filter(where f.picker_user_id is not null)::integer
  into v_queue_ahead,v_queue_remaining_lines,v_active_pickers
  from private.order_fulfillment_state_v1 f
  join public.online_orders q on q.id=f.order_id
  where f.branch_id=v_order.branch_id
    and f.order_id<>p_order_id
    and f.fulfillment_state in ('queued','picking','packing')
    and q.created_at<=v_order.created_at;

  select
    count(*) filter(where availability='available')::integer,
    count(*) filter(where availability='busy')::integer
  into v_available_drivers,v_busy_drivers
  from private.delivery_driver_status_v1
  where branch_id=v_order.branch_id;

  select
    count(*)::integer,
    count(*) filter(where approval_mode='customer')::integer
  into v_pending_subs,v_pending_customer_subs
  from private.order_fulfillment_substitutions_v1
  where order_id=p_order_id and status='pending';

  v_pack_base:=case
    when coalesce(v_profile.pack_samples,0)>=5
      then greatest(3,0.65*v_profile.pack_median_minutes+0.35*v_profile.pack_p80_minutes)
    when coalesce(v_profile.pack_samples,0)>=2
      then greatest(4,0.35*coalesce(v_profile.pack_median_minutes,6)+0.65*(5+ceil(greatest(v_lines,1)::numeric/10)*2))
    else 5+ceil(greatest(v_lines,1)::numeric/10)*2
  end;

  v_prep_base:=case
    when coalesce(v_profile.prep_samples,0)>=8
      then greatest(10,0.65*v_profile.prep_median_minutes+0.35*v_profile.prep_p80_minutes)
    when coalesce(v_profile.prep_samples,0)>=3
      then greatest(12,0.4*coalesce(v_profile.prep_median_minutes,v_sla_prep*0.60)
                        +0.2*coalesce(v_profile.prep_p80_minutes,v_sla_prep*0.70)
                        +0.4*(v_sla_prep*0.65))
    else greatest(12,v_sla_prep*0.65)
  end;

  v_pick_base:=greatest(6,(v_prep_base-v_pack_base)*v_complexity);
  v_pack_base:=greatest(3,v_pack_base*(0.85+least(0.35,v_lines*0.012)));

  v_queue_minutes:=least(
    50,
    greatest(
      0,
      ceil(v_queue_ahead::numeric/greatest(v_active_pickers,1))*3
      +ceil(v_queue_remaining_lines::numeric/12)*2
    )
  );

  v_sub_minutes:=least(18,v_pending_subs*2+v_pending_customer_subs*5);

  if v_f.order_id is not null and v_f.fulfillment_state='picking' then
    v_pick_minutes:=greatest(2,ceil(v_pick_base*v_progress_ratio)::integer);
    v_pack_minutes:=ceil(v_pack_base)::integer;
  elsif v_f.order_id is not null and v_f.fulfillment_state='packing' then
    v_pick_minutes:=0;
    v_pack_minutes:=greatest(2,ceil(v_pack_base*0.55)::integer);
  elsif v_order.status::text in ('ready','shipped','delivered') or v_f.fulfillment_state in ('ready','handed_over','completed') then
    v_queue_minutes:=0;
    v_pick_minutes:=0;
    v_sub_minutes:=0;
    v_pack_minutes:=0;
  else
    v_pick_minutes:=ceil(v_pick_base)::integer;
    v_pack_minutes:=ceil(v_pack_base)::integer;
  end if;

  select latitude,longitude into v_branch_lat,v_branch_lng
  from public.branches where id=v_order.branch_id;

  if coalesce(v_order.shipping_snapshot->>'latitude','') ~ '^-?[0-9]+([.][0-9]+)?$' then
    v_customer_lat:=(v_order.shipping_snapshot->>'latitude')::double precision;
  end if;
  if coalesce(v_order.shipping_snapshot->>'longitude','') ~ '^-?[0-9]+([.][0-9]+)?$' then
    v_customer_lng:=(v_order.shipping_snapshot->>'longitude')::double precision;
  end if;
  if coalesce(v_order.shipping_snapshot->>'distance_km','') ~ '^[0-9]+([.][0-9]+)?$' then
    v_distance:=(v_order.shipping_snapshot->>'distance_km')::numeric;
  end if;

  if v_distance is null and v_branch_lat is not null and v_branch_lng is not null
     and v_customer_lat is not null and v_customer_lng is not null then
    v_distance:=6371*2*asin(sqrt(
      power(sin(radians(v_customer_lat-v_branch_lat)/2),2)
      +cos(radians(v_branch_lat))*cos(radians(v_customer_lat))
      *power(sin(radians(v_customer_lng-v_branch_lng)/2),2)
    ));
  end if;

  if v_customer_lat is not null and v_customer_lng is not null then
    select q.route_duration_minutes,q.route_distance_km,q.provider,q.degraded
    into v_route_duration,v_route_distance,v_route_provider,v_route_degraded
    from private.delivery_road_quotes_v1 q
    where (
      q.hub_branch_id=v_order.branch_id
      or v_order.branch_id=any(coalesce(q.partner_branch_ids,'{}'::uuid[]))
    )
      and abs(q.customer_latitude-v_customer_lat)<0.0005
      and abs(q.customer_longitude-v_customer_lng)<0.0005
      and q.created_at between v_order.created_at-interval '30 minutes' and v_order.created_at+interval '3 hours'
    order by abs(extract(epoch from (q.created_at-v_order.created_at)))
    limit 1;
  end if;

  v_road_minutes:=case
    when v_route_duration is not null then greatest(3,v_route_duration)
    when coalesce(v_profile.road_samples,0)>=5 and v_distance is null
      then greatest(6,ceil(0.65*v_profile.road_median_minutes+0.35*v_profile.road_p80_minutes)::integer)
    when v_distance is not null then least(90,greatest(6,ceil(v_distance/24*60+4)::integer))
    else greatest(12,coalesce((select round(estimated_delivery_minutes*0.45)::integer from public.branches where id=v_order.branch_id),20))
  end;

  v_dispatch_minutes:=case
    when v_assignment.id is not null then 2
    when v_available_drivers>0 then 3
    when v_busy_drivers>0 then
      case when coalesce(v_profile.dispatch_samples,0)>=5
        then least(20,greatest(6,ceil(v_profile.dispatch_median_minutes*0.45)::integer))
        else 9 end
    else 14
  end;

  if v_assignment.id is not null then
    select s.last_latitude,s.last_longitude,s.last_speed_mps,s.last_location_at
    into v_driver_lat,v_driver_lng,v_driver_speed,v_driver_location_at
    from private.delivery_driver_status_v1 s
    where s.user_id=v_assignment.delivery_user_id;

    select count(*)::integer into v_prior_stops
    from private.delivery_order_assignments_v1 a
    where a.delivery_user_id=v_assignment.delivery_user_id
      and a.id<>v_assignment.id
      and a.unassigned_at is null
      and a.delivery_state not in ('delivered','failed','return_to_branch')
      and a.assigned_at<v_assignment.assigned_at;

    if v_driver_lat is not null and v_driver_lng is not null
       and v_branch_lat is not null and v_branch_lng is not null
       and v_assignment.delivery_state in ('assigned','accepted') then
      v_driver_distance:=6371*2*asin(sqrt(
        power(sin(radians(v_driver_lat-v_branch_lat)/2),2)
        +cos(radians(v_branch_lat))*cos(radians(v_driver_lat))
        *power(sin(radians(v_driver_lng-v_branch_lng)/2),2)
      ));
      v_driver_to_branch:=least(30,greatest(0,ceil(v_driver_distance/24*60)::integer));
    end if;

    if v_driver_lat is not null and v_driver_lng is not null
       and v_customer_lat is not null and v_customer_lng is not null
       and v_assignment.delivery_state in ('on_the_way','arrived') then
      v_customer_distance:=6371*2*asin(sqrt(
        power(sin(radians(v_driver_lat-v_customer_lat)/2),2)
        +cos(radians(v_customer_lat))*cos(radians(v_driver_lat))
        *power(sin(radians(v_driver_lng-v_customer_lng)/2),2)
      ));

      if v_driver_location_at>=now()-interval '3 minutes'
         and coalesce(v_driver_speed,0)>=2 then
        v_road_minutes:=least(75,greatest(2,ceil((v_customer_distance*1000/v_driver_speed)/60*1.15)::integer));
      else
        v_road_minutes:=least(75,greatest(3,ceil(v_customer_distance/24*60+2)::integer));
      end if;
    end if;
  end if;

  select coalesce(max(h.created_at),v_order.created_at)
  into v_status_since
  from public.order_status_history h
  where h.order_id=v_order.id and h.new_status::text=v_order.status::text;
  v_elapsed:=greatest(0,floor(extract(epoch from (now()-v_status_since))/60)::integer);

  v_ready_remaining:=case
    when v_order.status::text in ('ready','shipped','delivered') or v_f.fulfillment_state in ('ready','handed_over','completed') then 0
    when v_f.fulfillment_state='packing' then v_pack_minutes+v_sub_minutes
    when v_f.fulfillment_state='picking' then v_pick_minutes+v_sub_minutes+v_pack_minutes
    when v_order.status::text='preparing' then v_pick_minutes+v_sub_minutes+v_pack_minutes
    when v_order.status::text='confirmed' then v_queue_minutes+v_pick_minutes+v_sub_minutes+v_pack_minutes
    else greatest(0,v_queue_minutes-v_elapsed)+v_pick_minutes+v_sub_minutes+v_pack_minutes
  end;

  v_remaining:=case
    when v_stage in ('completed','cancelled') then 0
    when v_assignment.delivery_state='arrived' then 3
    when v_assignment.delivery_state='on_the_way' then v_road_minutes+(v_prior_stops*7)
    when v_assignment.delivery_state='picked_up' then 2+v_road_minutes+(v_prior_stops*7)
    when v_order.status::text='ready' then v_dispatch_minutes+v_driver_to_branch+v_road_minutes+(v_prior_stops*7)
    else v_ready_remaining+v_dispatch_minutes+v_driver_to_branch+v_road_minutes+(v_prior_stops*7)
  end;

  v_full:=v_queue_minutes+ceil(v_pick_base)::integer+v_sub_minutes+ceil(v_pack_base)::integer
          +v_dispatch_minutes+v_driver_to_branch+v_road_minutes+(v_prior_stops*7);

  v_confidence_score:=0;
  if v_order.branch_id is not null then v_confidence_score:=v_confidence_score+10; end if;
  if v_distance is not null then v_confidence_score:=v_confidence_score+10; end if;
  if v_route_duration is not null and not coalesce(v_route_degraded,false) then v_confidence_score:=v_confidence_score+20; end if;
  if coalesce(v_profile.prep_samples,0)>=5 then v_confidence_score:=v_confidence_score+15;
  elsif coalesce(v_profile.prep_samples,0)>=2 then v_confidence_score:=v_confidence_score+7; end if;
  if v_f.order_id is not null then v_confidence_score:=v_confidence_score+15; end if;
  if v_assignment.id is not null then v_confidence_score:=v_confidence_score+10; end if;
  if v_driver_location_at>=now()-interval '3 minutes' then v_confidence_score:=v_confidence_score+20; end if;

  v_confidence:=case when v_confidence_score>=70 then 'high' when v_confidence_score>=40 then 'medium' else 'low' end;
  v_uncertainty:=case
    when v_remaining=0 then 0
    when v_confidence='high' then greatest(4,ceil(v_remaining*0.08)::integer)
    when v_confidence='medium' then greatest(6,ceil(v_remaining*0.15)::integer)
    else greatest(9,ceil(v_remaining*0.25)::integer)
  end;

  select * into v_existing from private.order_eta_current_v1 where order_id=v_order.id;

  v_ready_eta:=case
    when v_f.ready_at is not null then v_f.ready_at
    when v_order.status::text in ('ready','shipped','delivered') then coalesce(v_order.updated_at,now())
    else now()+make_interval(mins=>v_ready_remaining)
  end;

  v_promised:=coalesce(
    v_existing.promised_at,
    v_order.created_at+make_interval(mins=>greatest(v_full,20))
  );

  v_live:=case
    when v_assignment.delivered_at is not null then v_assignment.delivered_at
    when v_order.status::text='delivered' then coalesce(v_order.updated_at,now())
    else now()+make_interval(mins=>v_remaining)
  end;

  v_risk:=case
    when v_stage='completed' then 'completed'
    when v_stage='cancelled' then 'cancelled'
    when now()>coalesce(v_existing.promised_window_end,v_promised+interval '10 minutes') then 'late'
    when v_live>coalesce(v_existing.promised_window_end,v_promised+interval '10 minutes')+interval '10 minutes' then 'late'
    when v_live+make_interval(mins=>v_uncertainty)>coalesce(v_existing.promised_window_end,v_promised+interval '10 minutes') then 'at_risk'
    else 'on_track'
  end;

  v_components:=jsonb_build_object(
    'queue_wait_minutes',v_queue_minutes,
    'picking_minutes',v_pick_minutes,
    'substitution_minutes',v_sub_minutes,
    'packing_minutes',v_pack_minutes,
    'ready_remaining_minutes',v_ready_remaining,
    'ready_eta',v_ready_eta,
    'dispatch_wait_minutes',v_dispatch_minutes,
    'driver_to_branch_minutes',v_driver_to_branch,
    'prior_stops_minutes',v_prior_stops*7,
    'road_minutes',v_road_minutes,
    'uncertainty_minutes',v_uncertainty,
    'elapsed_stage_minutes',v_elapsed,
    'remaining_minutes',v_remaining,
    'full_order_minutes',v_full,
    'queue_ahead',v_queue_ahead,
    'queue_remaining_lines',v_queue_remaining_lines,
    'active_pickers',v_active_pickers,
    'available_drivers',v_available_drivers,
    'busy_drivers',v_busy_drivers,
    'item_lines',v_lines,
    'remaining_lines',v_remaining_lines,
    'weight_lines',v_weight_lines,
    'bulk_lines',v_bulk_lines,
    'progress_ratio',round(v_progress_ratio,3),
    'complexity_multiplier',round(v_complexity,3),
    'pending_substitutions',v_pending_subs,
    'pending_customer_substitutions',v_pending_customer_subs,
    'distance_km',round(coalesce(v_distance,v_route_distance),3),
    'route_duration_minutes',v_route_duration,
    'route_provider',v_route_provider,
    'route_degraded',v_route_degraded,
    'branch_prep_samples',coalesce(v_profile.prep_samples,0),
    'branch_dispatch_samples',coalesce(v_profile.dispatch_samples,0),
    'branch_road_samples',coalesce(v_profile.road_samples,0),
    'confidence_score',v_confidence_score
  );

  insert into private.order_eta_current_v1(
    order_id,branch_id,order_stage,
    promised_at,promised_window_start,promised_window_end,
    live_eta,live_window_start,live_window_end,
    confidence,risk,components,model_version,calculated_at
  ) values(
    v_order.id,v_order.branch_id,v_stage,
    v_promised,
    coalesce(v_existing.promised_window_start,v_promised-interval '7 minutes'),
    coalesce(v_existing.promised_window_end,v_promised+interval '10 minutes'),
    v_live,v_live-make_interval(mins=>v_uncertainty),v_live+make_interval(mins=>v_uncertainty),
    v_confidence,v_risk,v_components,'eta-v2-intelligent',now()
  )
  on conflict(order_id) do update set
    branch_id=excluded.branch_id,
    order_stage=excluded.order_stage,
    live_eta=excluded.live_eta,
    live_window_start=excluded.live_window_start,
    live_window_end=excluded.live_window_end,
    confidence=excluded.confidence,
    risk=excluded.risk,
    components=excluded.components,
    model_version='eta-v2-intelligent',
    calculated_at=excluded.calculated_at;

  if v_f.order_id is not null
     and v_f.fulfillment_state not in ('completed','cancelled')
     and v_ready_eta is not null then
    update private.order_fulfillment_state_v1
    set predicted_ready_at=v_ready_eta,updated_at=now()
    where order_id=v_order.id
      and predicted_ready_at is distinct from v_ready_eta;
  end if;

  v_history:=v_existing.order_id is null
    or v_existing.order_stage is distinct from v_stage
    or v_existing.risk is distinct from v_risk
    or v_existing.confidence is distinct from v_confidence
    or p_reason in ('order_received','order_updated','delivery_assignment','fulfillment_state_changed','substitution_changed')
    or (
      p_reason in ('periodic_refresh','driver_location_refresh')
      and abs(
        coalesce(nullif(v_existing.components->>'remaining_minutes','')::integer,v_remaining)
        - v_remaining
      )>=3
    )
    or (
      p_reason not in ('periodic_refresh','driver_location_refresh')
      and abs(extract(epoch from (v_existing.live_eta-v_live)))>=120
    );

  if v_history then
    insert into private.order_eta_history_v1(
      order_id,reason,order_stage,live_eta,live_window_start,live_window_end,
      confidence,risk,components,model_version
    ) values(
      v_order.id,left(coalesce(p_reason,'refresh'),80),v_stage,
      v_live,v_live-make_interval(mins=>v_uncertainty),v_live+make_interval(mins=>v_uncertainty),
      v_confidence,v_risk,v_components,'eta-v2-intelligent'
    );
  end if;

  return jsonb_build_object(
    'order_id',v_order.id,
    'stage',v_stage,
    'promised_at',v_promised,
    'ready_eta',v_ready_eta,
    'live_eta',v_live,
    'live_window_start',v_live-make_interval(mins=>v_uncertainty),
    'live_window_end',v_live+make_interval(mins=>v_uncertainty),
    'confidence',v_confidence,
    'risk',v_risk,
    'components',v_components,
    'model_version','eta-v2-intelligent'
  );
end;
$function$;
