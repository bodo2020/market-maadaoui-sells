drop function if exists public.get_customer_operations_center(uuid,integer,integer);
create function public.get_customer_operations_center(
  p_branch_id uuid default null,
  p_days integer default 30,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_super boolean;
  v_days integer:=least(greatest(coalesce(p_days,30),1),365);
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),200);
  v_queue jsonb;
  v_summary jsonb;
  v_types jsonb;
  v_agents jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not (public.staff_has_permission('customers.view',p_branch_id) or public.staff_has_permission('sales.view',p_branch_id))) then
    raise exception using errcode='42501',message='CUSTOMER_ACCESS_DENIED';
  end if;

  with purchase_events as (
    select 'store'::text source,s.id purchase_id,s.customer_id,s.branch_id,coalesce(s.date,s.created_at) purchased_at,greatest(s.total-coalesce(s.loyalty_voucher_amount,0),0)::numeric net_total
    from public.sales s where s.customer_id is not null and (p_branch_id is null or s.branch_id=p_branch_id)
    union all
    select 'online'::text,o.id,o.customer_id,o.branch_id,o.created_at,greatest(o.total-coalesce(o.loyalty_voucher_amount,0),0)::numeric
    from public.online_orders o where o.customer_id is not null and o.status::text='delivered' and o.payment_status::text='paid' and (p_branch_id is null or o.branch_id=p_branch_id)
  ), completed_followups as (
    select i.id interaction_id,i.customer_id,i.type,i.priority,i.completed_at,coalesce(i.completed_by,i.assigned_to,i.created_by) staff_id
    from public.customer_interactions i
    where i.status='completed' and i.type in ('call','email','meeting','whatsapp') and i.completed_at is not null
      and i.completed_at>=now()-make_interval(days=>v_days)
      and (p_branch_id is null or i.branch_id=p_branch_id)
  ), candidates as (
    select p.source,p.purchase_id,p.customer_id,p.purchased_at,p.net_total,f.interaction_id,f.type,f.priority,f.completed_at,f.staff_id,
      row_number() over(partition by p.source,p.purchase_id order by f.completed_at desc,f.interaction_id) rn
    from purchase_events p join completed_followups f on f.customer_id=p.customer_id
      and p.purchased_at>=f.completed_at and p.purchased_at<=f.completed_at+interval '7 days'
  ), attributed as (select * from candidates where rn=1), followup_metrics as (
    select f.interaction_id,f.customer_id,f.type,f.priority,f.completed_at,f.staff_id,
      count(a.purchase_id)::bigint attributed_orders,coalesce(sum(a.net_total),0)::numeric attributed_revenue,
      min(a.purchased_at) first_purchase_at,(count(a.purchase_id)>0) converted
    from completed_followups f left join attributed a on a.interaction_id=f.interaction_id
    group by f.interaction_id,f.customer_id,f.type,f.priority,f.completed_at,f.staff_id
  )
  select jsonb_build_object(
    'window_days',v_days,
    'completed_followups',count(*)::bigint,
    'converted_followups',count(*) filter(where converted)::bigint,
    'conversion_rate',case when count(*)>0 then round((100.0*count(*) filter(where converted)/count(*))::numeric,1) else 0 end,
    'attributed_orders',coalesce(sum(attributed_orders),0)::bigint,
    'attributed_revenue',coalesce(sum(attributed_revenue),0)::numeric,
    'average_revenue_per_conversion',case when count(*) filter(where converted)>0 then round((coalesce(sum(attributed_revenue),0)/count(*) filter(where converted))::numeric,2) else 0 end,
    'overdue_followups',(select count(*) from public.customer_interactions i where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.scheduled_at<now() and (p_branch_id is null or i.branch_id=p_branch_id)),
    'next_7d_followups',(select count(*) from public.customer_interactions i where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.scheduled_at>=now() and i.scheduled_at<=now()+interval '7 days' and (p_branch_id is null or i.branch_id=p_branch_id))
  ) into v_summary from followup_metrics;

  with purchase_events as (
    select 'store'::text source,s.id purchase_id,s.customer_id,s.branch_id,coalesce(s.date,s.created_at) purchased_at,greatest(s.total-coalesce(s.loyalty_voucher_amount,0),0)::numeric net_total
    from public.sales s where s.customer_id is not null and (p_branch_id is null or s.branch_id=p_branch_id)
    union all
    select 'online'::text,o.id,o.customer_id,o.branch_id,o.created_at,greatest(o.total-coalesce(o.loyalty_voucher_amount,0),0)::numeric
    from public.online_orders o where o.customer_id is not null and o.status::text='delivered' and o.payment_status::text='paid' and (p_branch_id is null or o.branch_id=p_branch_id)
  ), f as (
    select i.id interaction_id,i.customer_id,i.type,i.completed_at,coalesce(i.completed_by,i.assigned_to,i.created_by) staff_id
    from public.customer_interactions i where i.status='completed' and i.type in ('call','email','meeting','whatsapp') and i.completed_at is not null and i.completed_at>=now()-make_interval(days=>v_days) and (p_branch_id is null or i.branch_id=p_branch_id)
  ), candidates as (
    select p.*,f.interaction_id,f.type,f.staff_id,f.completed_at,row_number() over(partition by p.source,p.purchase_id order by f.completed_at desc,f.interaction_id) rn
    from purchase_events p join f on f.customer_id=p.customer_id and p.purchased_at>=f.completed_at and p.purchased_at<=f.completed_at+interval '7 days'
  ), a as (select * from candidates where rn=1), fm as (
    select f.interaction_id,f.type,f.staff_id,(count(a.purchase_id)>0) converted,count(a.purchase_id)::bigint orders,coalesce(sum(a.net_total),0)::numeric revenue
    from f left join a on a.interaction_id=f.interaction_id group by f.interaction_id,f.type,f.staff_id
  ), q as (
    select type,count(*)::bigint completed,count(*) filter(where converted)::bigint converted,coalesce(sum(orders),0)::bigint attributed_orders,coalesce(sum(revenue),0)::numeric attributed_revenue,
      case when count(*)>0 then round((100.0*count(*) filter(where converted)/count(*))::numeric,1) else 0 end conversion_rate
    from fm group by type order by attributed_revenue desc,completed desc
  ) select coalesce(jsonb_agg(to_jsonb(q) order by q.attributed_revenue desc,q.completed desc),'[]'::jsonb) into v_types from q;

  with purchase_events as (
    select 'store'::text source,s.id purchase_id,s.customer_id,s.branch_id,coalesce(s.date,s.created_at) purchased_at,greatest(s.total-coalesce(s.loyalty_voucher_amount,0),0)::numeric net_total
    from public.sales s where s.customer_id is not null and (p_branch_id is null or s.branch_id=p_branch_id)
    union all
    select 'online'::text,o.id,o.customer_id,o.branch_id,o.created_at,greatest(o.total-coalesce(o.loyalty_voucher_amount,0),0)::numeric
    from public.online_orders o where o.customer_id is not null and o.status::text='delivered' and o.payment_status::text='paid' and (p_branch_id is null or o.branch_id=p_branch_id)
  ), f as (
    select i.id interaction_id,i.customer_id,i.completed_at,coalesce(i.completed_by,i.assigned_to,i.created_by) staff_id
    from public.customer_interactions i where i.status='completed' and i.type in ('call','email','meeting','whatsapp') and i.completed_at is not null and i.completed_at>=now()-make_interval(days=>v_days) and (p_branch_id is null or i.branch_id=p_branch_id)
  ), candidates as (
    select p.*,f.interaction_id,f.staff_id,f.completed_at,row_number() over(partition by p.source,p.purchase_id order by f.completed_at desc,f.interaction_id) rn
    from purchase_events p join f on f.customer_id=p.customer_id and p.purchased_at>=f.completed_at and p.purchased_at<=f.completed_at+interval '7 days'
  ), a as (select * from candidates where rn=1), fm as (
    select f.interaction_id,f.staff_id,(count(a.purchase_id)>0) converted,count(a.purchase_id)::bigint orders,coalesce(sum(a.net_total),0)::numeric revenue
    from f left join a on a.interaction_id=f.interaction_id group by f.interaction_id,f.staff_id
  ), q as (
    select fm.staff_id,coalesce(u.name,'غير محدد') staff_name,count(*)::bigint completed,count(*) filter(where converted)::bigint converted,coalesce(sum(orders),0)::bigint attributed_orders,coalesce(sum(revenue),0)::numeric attributed_revenue,
      case when count(*)>0 then round((100.0*count(*) filter(where converted)/count(*))::numeric,1) else 0 end conversion_rate
    from fm left join public.users u on u.id=fm.staff_id group by fm.staff_id,u.name order by attributed_revenue desc,completed desc limit 20
  ) select coalesce(jsonb_agg(to_jsonb(q) order by q.attributed_revenue desc,q.completed desc),'[]'::jsonb) into v_agents from q;

  with carts as (
    select c.id,c.name,c.phone,cla.membership_number,count(ci.*)::bigint item_count,max(ci.updated_at) cart_updated_at,
      round((extract(epoch from(now()-max(ci.updated_at)))/3600.0)::numeric,1) age_hours
    from public.customers c left join public.customer_loyalty_accounts cla on cla.customer_id=c.id
    join public.cart_items ci on ci.customer_id=c.id or (c.user_id is not null and ci.user_id=c.user_id)
    group by c.id,c.name,c.phone,cla.membership_number having max(ci.updated_at)<now()-interval '24 hours'
  ), coupons as (
    select c.id,c.name,c.phone,cla.membership_number,count(lv.*)::bigint coupon_count,coalesce(sum(lv.remaining_value_egp),0)::numeric coupon_value
    from public.customers c left join public.customer_loyalty_accounts cla on cla.customer_id=c.id
    join public.loyalty_vouchers lv on lv.customer_id=c.id and lv.status='active' and lv.remaining_value_egp>0
    group by c.id,c.name,c.phone,cla.membership_number
  ), events as (
    select c.id,c.name,c.phone,cla.membership_number,x.purchased_at
    from public.customers c left join public.customer_loyalty_accounts cla on cla.customer_id=c.id
    join lateral (
      select coalesce(s.date,s.created_at) purchased_at from public.sales s where s.customer_id=c.id and (p_branch_id is null or s.branch_id=p_branch_id)
      union all select o.created_at from public.online_orders o where o.customer_id=c.id and o.status::text='delivered' and o.payment_status::text='paid' and (p_branch_id is null or o.branch_id=p_branch_id)
    ) x on true
  ), ordered as (select *,lag(purchased_at) over(partition by id order by purchased_at) previous_at from events),
  grouped as (
    select id,max(name) name,max(phone) phone,max(membership_number) membership_number,count(*) purchase_count,max(purchased_at) last_purchase_at,
      avg(extract(epoch from(purchased_at-previous_at))/86400.0) filter(where previous_at is not null) avg_days from ordered group by id
  ), predicted as (
    select *,case when purchase_count>=2 and avg_days is not null then last_purchase_at+make_interval(secs=>round(avg_days*86400)::int) else null end predicted_at from grouped
  ), signals as (
    select i.customer_id id,c.name,c.phone,cla.membership_number,
      least(100,case when i.scheduled_at<now() then 90 else 76 end + case i.priority when 'high' then 8 when 'medium' then 4 else 0 end + least(6,greatest(0,floor(extract(epoch from(now()-i.scheduled_at))/3600))::int))::int score,
      case when i.scheduled_at<now() then 'followup_overdue' else 'followup_due' end signal_type,
      jsonb_build_object('type',case when i.scheduled_at<now() then 'followup_overdue' else 'followup_due' end,'interaction_id',i.id,'scheduled_at',i.scheduled_at,'priority',i.priority,'subject',i.subject) detail
    from public.customer_interactions i join public.customers c on c.id=i.customer_id left join public.customer_loyalty_accounts cla on cla.customer_id=c.id
    where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.scheduled_at<=now()+interval '7 days' and (p_branch_id is null or i.branch_id=p_branch_id)
    union all
    select x.id,x.name,x.phone,x.membership_number,least(89,70+least(10,floor(x.age_hours/24)::int)+least(9,x.item_count::int)),'abandoned_cart',jsonb_build_object('type','abandoned_cart','items',x.item_count,'age_hours',x.age_hours) from carts x
    union all
    select p.id,p.name,p.phone,p.membership_number,
      least(84,case when p.predicted_at<now() then 65 else 52 end + least(12,greatest(0,floor(extract(epoch from(now()-p.predicted_at))/86400))::int)+least(7,p.purchase_count::int)),
      case when p.predicted_at<now() then 'purchase_overdue' else 'purchase_due' end,
      jsonb_build_object('type',case when p.predicted_at<now() then 'purchase_overdue' else 'purchase_due' end,'predicted_at',p.predicted_at,'purchase_count',p.purchase_count,'average_days',round(p.avg_days::numeric,1))
    from predicted p where p.predicted_at is not null and p.predicted_at between now()-interval '120 days' and now()+interval '7 days'
    union all
    select c.id,c.name,c.phone,cla.membership_number,58,'under_watch',jsonb_build_object('type','under_watch') from public.customers c left join public.customer_loyalty_accounts cla on cla.customer_id=c.id where c.management_status='watch'
    union all
    select x.id,x.name,x.phone,x.membership_number,least(54,35+least(19,ceil(x.coupon_value)::int)),'coupon_ready',jsonb_build_object('type','coupon_ready','coupon_count',x.coupon_count,'coupon_value',x.coupon_value) from coupons x
  ), ranked as (
    select id,max(name) name,max(phone) phone,max(membership_number) membership_number,
      least(100,max(score)+least(12,(count(*)-1)::int*3))::int priority_score,count(*)::bigint signal_count,jsonb_agg(detail order by score desc) signals
    from signals group by id
  ), q as (
    select *,case when priority_score>=90 then 'critical' when priority_score>=75 then 'high' when priority_score>=55 then 'medium' else 'low' end priority_level
    from ranked order by priority_score desc,signal_count desc,name nulls last limit v_limit
  ) select coalesce(jsonb_agg(to_jsonb(q) order by q.priority_score desc,q.signal_count desc),'[]'::jsonb) into v_queue from q;

  return jsonb_build_object('summary',v_summary,'priority_queue',v_queue,'type_performance',v_types,'agent_performance',v_agents,'attribution_window_days',7);
end $$;
revoke all on function public.get_customer_operations_center(uuid,integer,integer) from public,anon;
grant execute on function public.get_customer_operations_center(uuid,integer,integer) to authenticated;

drop function if exists public.get_customer_followup_performance(uuid,uuid,integer);
create function public.get_customer_followup_performance(
  p_customer_id uuid,
  p_branch_id uuid default null,
  p_days integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_super boolean;
  v_days integer:=least(greatest(coalesce(p_days,180),1),730);
  v_rows jsonb;
  v_summary jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not (public.staff_has_permission('customers.view',p_branch_id) or public.staff_has_permission('sales.view',p_branch_id))) then raise exception using errcode='42501',message='CUSTOMER_ACCESS_DENIED'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id) then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;

  with purchase_events as (
    select 'store'::text source,s.id purchase_id,s.customer_id,coalesce(s.date,s.created_at) purchased_at,greatest(s.total-coalesce(s.loyalty_voucher_amount,0),0)::numeric net_total
    from public.sales s where s.customer_id=p_customer_id and (p_branch_id is null or s.branch_id=p_branch_id)
    union all
    select 'online'::text,o.id,o.customer_id,o.created_at,greatest(o.total-coalesce(o.loyalty_voucher_amount,0),0)::numeric
    from public.online_orders o where o.customer_id=p_customer_id and o.status::text='delivered' and o.payment_status::text='paid' and (p_branch_id is null or o.branch_id=p_branch_id)
  ), f as (
    select i.id interaction_id,i.type,i.subject,i.description,i.priority,i.scheduled_at,i.completed_at,coalesce(i.completed_by,i.assigned_to,i.created_by) staff_id
    from public.customer_interactions i where i.customer_id=p_customer_id and i.status='completed' and i.type in ('call','email','meeting','whatsapp') and i.completed_at is not null and i.completed_at>=now()-make_interval(days=>v_days) and (p_branch_id is null or i.branch_id=p_branch_id)
  ), candidates as (
    select p.*,f.interaction_id,f.completed_at,row_number() over(partition by p.source,p.purchase_id order by f.completed_at desc,f.interaction_id) rn
    from purchase_events p join f on p.purchased_at>=f.completed_at and p.purchased_at<=f.completed_at+interval '7 days'
  ), a as (select * from candidates where rn=1), fm as (
    select f.*,u.name staff_name,count(a.purchase_id)::bigint attributed_orders,coalesce(sum(a.net_total),0)::numeric attributed_revenue,min(a.purchased_at) first_purchase_at,(count(a.purchase_id)>0) converted
    from f left join a on a.interaction_id=f.interaction_id left join public.users u on u.id=f.staff_id
    group by f.interaction_id,f.type,f.subject,f.description,f.priority,f.scheduled_at,f.completed_at,f.staff_id,u.name
  ), q as (select * from fm order by completed_at desc limit 100)
  select coalesce(jsonb_agg(to_jsonb(q) order by q.completed_at desc),'[]'::jsonb) into v_rows from q;

  with purchase_events as (
    select 'store'::text source,s.id purchase_id,coalesce(s.date,s.created_at) purchased_at,greatest(s.total-coalesce(s.loyalty_voucher_amount,0),0)::numeric net_total
    from public.sales s where s.customer_id=p_customer_id and (p_branch_id is null or s.branch_id=p_branch_id)
    union all
    select 'online'::text,o.id,o.created_at,greatest(o.total-coalesce(o.loyalty_voucher_amount,0),0)::numeric from public.online_orders o where o.customer_id=p_customer_id and o.status::text='delivered' and o.payment_status::text='paid' and (p_branch_id is null or o.branch_id=p_branch_id)
  ), f as (
    select i.id interaction_id,i.completed_at from public.customer_interactions i where i.customer_id=p_customer_id and i.status='completed' and i.type in ('call','email','meeting','whatsapp') and i.completed_at is not null and i.completed_at>=now()-make_interval(days=>v_days) and (p_branch_id is null or i.branch_id=p_branch_id)
  ), candidates as (
    select p.*,f.interaction_id,f.completed_at,row_number() over(partition by p.source,p.purchase_id order by f.completed_at desc,f.interaction_id) rn from purchase_events p join f on p.purchased_at>=f.completed_at and p.purchased_at<=f.completed_at+interval '7 days'
  ), a as (select * from candidates where rn=1), fm as (
    select f.interaction_id,count(a.purchase_id)::bigint orders,coalesce(sum(a.net_total),0)::numeric revenue,(count(a.purchase_id)>0) converted from f left join a on a.interaction_id=f.interaction_id group by f.interaction_id
  )
  select jsonb_build_object('window_days',v_days,'completed_followups',count(*)::bigint,'converted_followups',count(*) filter(where converted)::bigint,'conversion_rate',case when count(*)>0 then round((100.0*count(*) filter(where converted)/count(*))::numeric,1) else 0 end,'attributed_orders',coalesce(sum(orders),0)::bigint,'attributed_revenue',coalesce(sum(revenue),0)::numeric) into v_summary from fm;

  return jsonb_build_object('summary',v_summary,'followups',v_rows,'attribution_window_days',7);
end $$;
revoke all on function public.get_customer_followup_performance(uuid,uuid,integer) from public,anon;
grant execute on function public.get_customer_followup_performance(uuid,uuid,integer) to authenticated;
