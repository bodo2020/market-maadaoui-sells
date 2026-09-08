create or replace function public.get_customer_business_intelligence(p_customer_id uuid,p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_super boolean;
  v_user_id uuid;
  v_top_products jsonb;
  v_top_categories jsonb;
  v_purchase_count bigint;
  v_first_purchase timestamptz;
  v_last_purchase timestamptz;
  v_avg_days numeric;
  v_next_purchase timestamptz;
  v_cart_count bigint;
  v_cart_updated timestamptz;
  v_cart_value numeric;
  v_cart_age_hours numeric;
  v_abandoned boolean;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not (public.staff_has_permission('customers.view',p_branch_id) or public.staff_has_permission('sales.view',p_branch_id))) then
    raise exception using errcode='42501',message='CUSTOMER_ACCESS_DENIED';
  end if;
  select user_id into v_user_id from public.customers where id=p_customer_id;
  if not found then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;

  with purchase_events as (
    select coalesce(s.date,s.created_at) purchased_at
    from public.sales s
    where s.customer_id=p_customer_id and (p_branch_id is null or s.branch_id=p_branch_id)
    union all
    select o.created_at
    from public.online_orders o
    where o.customer_id=p_customer_id and o.status::text='delivered' and o.payment_status::text='paid'
      and (p_branch_id is null or o.branch_id=p_branch_id)
  ), ordered as (
    select purchased_at,lag(purchased_at) over(order by purchased_at) previous_at from purchase_events
  )
  select count(*),min(purchased_at),max(purchased_at),
         round(avg(extract(epoch from (purchased_at-previous_at))/86400.0) filter(where previous_at is not null)::numeric,1)
  into v_purchase_count,v_first_purchase,v_last_purchase,v_avg_days
  from ordered;
  if v_purchase_count>=2 and v_avg_days is not null and v_last_purchase is not null then
    v_next_purchase:=v_last_purchase + make_interval(secs => round(v_avg_days*86400)::int);
  end if;

  with raw_items as (
    select
      coalesce(nullif(i->'product'->>'id','')::uuid,null) product_id,
      coalesce(nullif(i->'product'->>'name',''),nullif(i->>'name',''),'منتج') product_name,
      greatest(coalesce(nullif(i->>'quantity','')::numeric,1),0) qty,
      greatest(coalesce(nullif(i->>'total','')::numeric,coalesce(nullif(i->>'price','')::numeric,0)*coalesce(nullif(i->>'quantity','')::numeric,1),0),0) line_total,
      coalesce(s.date,s.created_at) purchased_at,
      s.id source_id
    from public.sales s cross join lateral jsonb_array_elements(coalesce(s.items,'[]'::jsonb)) i
    where s.customer_id=p_customer_id and (p_branch_id is null or s.branch_id=p_branch_id)
    union all
    select
      case when (i->>'product_id') ~* '^[0-9a-f-]{36}$' then (i->>'product_id')::uuid else null end,
      coalesce(nullif(i->>'product_name',''),nullif(i->>'name',''),'منتج'),
      greatest(coalesce(nullif(i->>'quantity','')::numeric,1),0),
      greatest(coalesce(nullif(i->>'total','')::numeric,coalesce(nullif(i->>'price','')::numeric,0)*coalesce(nullif(i->>'quantity','')::numeric,1),0),0),
      o.created_at,
      o.id
    from public.online_orders o cross join lateral jsonb_array_elements(coalesce(o.items,'[]'::jsonb)) i
    where o.customer_id=p_customer_id and o.status::text='delivered' and o.payment_status::text='paid'
      and (p_branch_id is null or o.branch_id=p_branch_id)
  ), grouped as (
    select r.product_id,coalesce(p.name,max(r.product_name)) product_name,
           sum(r.qty) quantity_bought,sum(r.line_total) amount_spent,
           count(distinct r.source_id) purchase_occurrences,max(r.purchased_at) last_bought_at,
           p.main_category_id
    from raw_items r left join public.products p on p.id=r.product_id
    group by r.product_id,p.name,p.main_category_id
    order by sum(r.qty) desc,sum(r.line_total) desc
    limit 10
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id',g.product_id,'product_name',g.product_name,'quantity_bought',g.quantity_bought,
    'amount_spent',g.amount_spent,'purchase_occurrences',g.purchase_occurrences,'last_bought_at',g.last_bought_at,
    'category_id',g.main_category_id,'category_name',mc.name
  ) order by g.quantity_bought desc,g.amount_spent desc),'[]'::jsonb)
  into v_top_products from grouped g left join public.main_categories mc on mc.id=g.main_category_id;

  with raw_items as (
    select case when (i->'product'->>'id') ~* '^[0-9a-f-]{36}$' then (i->'product'->>'id')::uuid else null end product_id,
           greatest(coalesce(nullif(i->>'quantity','')::numeric,1),0) qty,
           greatest(coalesce(nullif(i->>'total','')::numeric,0),0) line_total
    from public.sales s cross join lateral jsonb_array_elements(coalesce(s.items,'[]'::jsonb)) i
    where s.customer_id=p_customer_id and (p_branch_id is null or s.branch_id=p_branch_id)
    union all
    select case when (i->>'product_id') ~* '^[0-9a-f-]{36}$' then (i->>'product_id')::uuid else null end,
           greatest(coalesce(nullif(i->>'quantity','')::numeric,1),0),
           greatest(coalesce(nullif(i->>'total','')::numeric,0),0)
    from public.online_orders o cross join lateral jsonb_array_elements(coalesce(o.items,'[]'::jsonb)) i
    where o.customer_id=p_customer_id and o.status::text='delivered' and o.payment_status::text='paid'
      and (p_branch_id is null or o.branch_id=p_branch_id)
  ), cats as (
    select p.main_category_id,mc.name category_name,sum(r.qty) quantity_bought,sum(r.line_total) amount_spent
    from raw_items r join public.products p on p.id=r.product_id
    left join public.main_categories mc on mc.id=p.main_category_id
    where p.main_category_id is not null
    group by p.main_category_id,mc.name
    order by sum(r.line_total) desc,sum(r.qty) desc
    limit 8
  )
  select coalesce(jsonb_agg(jsonb_build_object('category_id',main_category_id,'category_name',category_name,'quantity_bought',quantity_bought,'amount_spent',amount_spent) order by amount_spent desc),'[]'::jsonb)
  into v_top_categories from cats;

  select count(*),max(ci.updated_at),coalesce(sum(coalesce(p.price,0)*greatest(coalesce(ci.quantity,0),0)),0)
  into v_cart_count,v_cart_updated,v_cart_value
  from public.cart_items ci left join public.products p on p.id=ci.product_id
  where ci.customer_id=p_customer_id or (v_user_id is not null and ci.user_id=v_user_id);
  v_cart_age_hours:=case when v_cart_updated is null then null else round((extract(epoch from(now()-v_cart_updated))/3600.0)::numeric,1) end;
  v_abandoned:=coalesce(v_cart_count,0)>0 and v_cart_updated is not null and v_cart_updated<now()-interval '24 hours';

  v_result:=jsonb_build_object(
    'purchase_pattern',jsonb_build_object(
      'purchase_count',coalesce(v_purchase_count,0),'first_purchase_at',v_first_purchase,'last_purchase_at',v_last_purchase,
      'average_days_between_purchases',v_avg_days,'predicted_next_purchase_at',v_next_purchase,
      'prediction_ready',coalesce(v_purchase_count,0)>=2,
      'cadence',case when v_avg_days is null then 'unknown' when v_avg_days<=7 then 'weekly' when v_avg_days<=16 then 'biweekly' when v_avg_days<=35 then 'monthly' else 'occasional' end
    ),
    'cart_signal',jsonb_build_object(
      'items_count',coalesce(v_cart_count,0),'estimated_value',coalesce(v_cart_value,0),'last_updated_at',v_cart_updated,
      'age_hours',v_cart_age_hours,'is_abandoned',v_abandoned,'abandoned_threshold_hours',24
    ),
    'top_products',v_top_products,
    'top_categories',v_top_categories
  );
  return v_result;
end $$;
revoke all on function public.get_customer_business_intelligence(uuid,uuid) from public,anon;
grant execute on function public.get_customer_business_intelligence(uuid,uuid) to authenticated;

create or replace function public.get_customer_management_catalog_v2(
  p_branch_id uuid default null,
  p_search text default null,
  p_segment text default null,
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_super boolean;
  v_limit integer:=least(greatest(coalesce(p_limit,50),1),200);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_search text:=nullif(btrim(coalesce(p_search,'')),'');
  v_segment text:=nullif(lower(btrim(coalesce(p_segment,''))),'');
  v_status text:=nullif(lower(btrim(coalesce(p_filters->>'management_status',''))),'');
  v_channel text:=nullif(lower(btrim(coalesce(p_filters->>'channel',''))),'');
  v_has_coupon boolean:=case when p_filters ? 'has_coupon' then (p_filters->>'has_coupon')::boolean else null end;
  v_has_points boolean:=case when p_filters ? 'has_points' then (p_filters->>'has_points')::boolean else null end;
  v_has_cart boolean:=case when p_filters ? 'has_cart' then (p_filters->>'has_cart')::boolean else null end;
  v_abandoned boolean:=case when p_filters ? 'abandoned_cart' then (p_filters->>'abandoned_cart')::boolean else null end;
  v_inactive_days integer:=case when coalesce(p_filters->>'inactive_days_min','')~'^\d+$' then (p_filters->>'inactive_days_min')::integer else null end;
  v_min_spent numeric:=case when coalesce(p_filters->>'min_spent','')~'^\d+(\.\d+)?$' then (p_filters->>'min_spent')::numeric else null end;
  v_max_spent numeric:=case when coalesce(p_filters->>'max_spent','')~'^\d+(\.\d+)?$' then (p_filters->>'max_spent')::numeric else null end;
  v_tag text:=nullif(btrim(coalesce(p_filters->>'tag','')),'');
  v_rows jsonb; v_total bigint; v_summary jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 v_super:=private.staff_is_super_admin(auth.uid());
 if not v_super and (p_branch_id is null or not (public.staff_has_permission('customers.view',p_branch_id) or public.staff_has_permission('sales.view',p_branch_id))) then raise exception using errcode='42501',message='CUSTOMER_ACCESS_DENIED'; end if;

 with base as (
  select c.id,c.name,c.phone,c.email,c.address,c.notes,c.phone_verified,c.created_at,c.management_status,
    cla.membership_number,cla.barcode_token,coalesce(cla.points_balance,0)::bigint points_balance,
    coalesce(cla.lifetime_points_earned,0)::bigint lifetime_points_earned,coalesce(cla.lifetime_points_redeemed,0)::bigint lifetime_points_redeemed,
    coalesce(cla.status,'active') loyalty_status,
    coalesce(a.store_sales_count,0)::bigint store_sales_count,coalesce(a.online_orders_count,0)::bigint online_orders_count,
    coalesce(a.purchase_count,0)::bigint purchase_count,coalesce(a.gross_sales,0)::numeric gross_sales,
    coalesce(a.loyalty_discount,0)::numeric loyalty_discount,coalesce(a.net_spent,0)::numeric net_spent,coalesce(a.store_profit,0)::numeric store_profit,
    a.last_purchase_at,case when coalesce(a.purchase_count,0)>0 then round((coalesce(a.net_spent,0)/a.purchase_count)::numeric,2) else 0 end avg_order_value,
    case when coalesce(a.store_sales_count,0)>coalesce(a.online_orders_count,0) then 'store' when coalesce(a.online_orders_count,0)>coalesce(a.store_sales_count,0) then 'online' when coalesce(a.purchase_count,0)>0 then 'mixed' else 'none' end preferred_channel,
    coalesce(v.outstanding_coupon_value,0)::numeric outstanding_coupon_value,coalesce(v.active_coupon_count,0)::bigint active_coupon_count,
    coalesce(cart.cart_items_count,0)::bigint cart_items_count,cart.cart_updated_at,
    (coalesce(cart.cart_items_count,0)>0 and cart.cart_updated_at<now()-interval '24 hours') abandoned_cart,
    case when a.last_purchase_at is null then null else greatest(0,floor(extract(epoch from(now()-a.last_purchase_at))/86400))::bigint end days_since_last_purchase,
    coalesce(tags.tags,'[]'::jsonb) tags,
    case when coalesce(a.net_spent,0)>=5000 or coalesce(a.purchase_count,0)>=20 then 'vip'
      when coalesce(a.purchase_count,0)>=5 and a.last_purchase_at>=now()-interval '30 days' then 'loyal'
      when coalesce(a.purchase_count,0) between 2 and 4 and a.last_purchase_at>=now()-interval '45 days' then 'promising'
      when c.created_at>=now()-interval '30 days' and coalesce(a.purchase_count,0)<=1 then 'new'
      when coalesce(a.purchase_count,0)>=2 and a.last_purchase_at<now()-interval '30 days' and a.last_purchase_at>=now()-interval '90 days' then 'at_risk'
      when a.last_purchase_at<now()-interval '90 days' then 'lost' when a.last_purchase_at is null then 'inactive' else 'active' end segment
  from public.customers c
  left join public.customer_loyalty_accounts cla on cla.customer_id=c.id
  left join lateral (
    select count(*) filter(where src='store') store_sales_count,count(*) filter(where src='online') online_orders_count,count(*) purchase_count,
      coalesce(sum(gross),0) gross_sales,coalesce(sum(loyalty_discount),0) loyalty_discount,coalesce(sum(net),0) net_spent,coalesce(sum(store_profit),0) store_profit,max(purchased_at) last_purchase_at
    from (
      select 'store'::text src,s.total::numeric gross,coalesce(s.loyalty_voucher_amount,0)::numeric loyalty_discount,greatest(s.total-coalesce(s.loyalty_voucher_amount,0),0)::numeric net,coalesce(s.profit,0)::numeric store_profit,coalesce(s.date,s.created_at) purchased_at
      from public.sales s where s.customer_id=c.id and (p_branch_id is null or s.branch_id=p_branch_id)
      union all
      select 'online',o.total::numeric,coalesce(o.loyalty_voucher_amount,0)::numeric,greatest(o.total-coalesce(o.loyalty_voucher_amount,0),0)::numeric,0::numeric,o.created_at
      from public.online_orders o where o.customer_id=c.id and o.status::text='delivered' and o.payment_status::text='paid' and (p_branch_id is null or o.branch_id=p_branch_id)
    ) q
  ) a on true
  left join lateral (select coalesce(sum(remaining_value_egp),0) outstanding_coupon_value,count(*) active_coupon_count from public.loyalty_vouchers where customer_id=c.id and status='active' and remaining_value_egp>0) v on true
  left join lateral (select count(*) cart_items_count,max(updated_at) cart_updated_at from public.cart_items ci where ci.customer_id=c.id or (c.user_id is not null and ci.user_id=c.user_id)) cart on true
  left join lateral (select coalesce(jsonb_agg(t.name order by t.name),'[]'::jsonb) tags from public.customer_tag_assignments a2 join public.customer_tags t on t.id=a2.tag_id and t.active where a2.customer_id=c.id) tags on true
 ), filtered as (
  select * from base b where
    (v_search is null or coalesce(b.name,'') ilike '%'||v_search||'%' or coalesce(b.phone,'') ilike '%'||v_search||'%' or coalesce(b.email,'') ilike '%'||v_search||'%' or coalesce(b.membership_number,'') ilike '%'||v_search||'%' or coalesce(b.barcode_token,'') ilike '%'||v_search||'%')
    and (v_segment is null or v_segment='all' or b.segment=v_segment)
    and (v_status is null or b.management_status=v_status)
    and (v_channel is null or v_channel='all' or b.preferred_channel=v_channel)
    and (v_has_coupon is null or ((b.active_coupon_count>0)=v_has_coupon))
    and (v_has_points is null or ((b.points_balance>0)=v_has_points))
    and (v_has_cart is null or ((b.cart_items_count>0)=v_has_cart))
    and (v_abandoned is null or (b.abandoned_cart=v_abandoned))
    and (v_inactive_days is null or (b.days_since_last_purchase is not null and b.days_since_last_purchase>=v_inactive_days))
    and (v_min_spent is null or b.net_spent>=v_min_spent)
    and (v_max_spent is null or b.net_spent<=v_max_spent)
    and (v_tag is null or exists(select 1 from jsonb_array_elements_text(b.tags) x where x ilike v_tag))
 )
 select count(*) into v_total from filtered;

 with base as (
  select c.id,c.name,c.phone,c.email,c.address,c.notes,c.phone_verified,c.created_at,c.management_status,
    cla.membership_number,cla.barcode_token,coalesce(cla.points_balance,0)::bigint points_balance,coalesce(cla.lifetime_points_earned,0)::bigint lifetime_points_earned,coalesce(cla.lifetime_points_redeemed,0)::bigint lifetime_points_redeemed,coalesce(cla.status,'active') loyalty_status,
    coalesce(a.store_sales_count,0)::bigint store_sales_count,coalesce(a.online_orders_count,0)::bigint online_orders_count,coalesce(a.purchase_count,0)::bigint purchase_count,coalesce(a.gross_sales,0)::numeric gross_sales,coalesce(a.loyalty_discount,0)::numeric loyalty_discount,coalesce(a.net_spent,0)::numeric net_spent,coalesce(a.store_profit,0)::numeric store_profit,a.last_purchase_at,
    case when coalesce(a.purchase_count,0)>0 then round((coalesce(a.net_spent,0)/a.purchase_count)::numeric,2) else 0 end avg_order_value,
    case when coalesce(a.store_sales_count,0)>coalesce(a.online_orders_count,0) then 'store' when coalesce(a.online_orders_count,0)>coalesce(a.store_sales_count,0) then 'online' when coalesce(a.purchase_count,0)>0 then 'mixed' else 'none' end preferred_channel,
    coalesce(v.outstanding_coupon_value,0)::numeric outstanding_coupon_value,coalesce(v.active_coupon_count,0)::bigint active_coupon_count,coalesce(cart.cart_items_count,0)::bigint cart_items_count,cart.cart_updated_at,(coalesce(cart.cart_items_count,0)>0 and cart.cart_updated_at<now()-interval '24 hours') abandoned_cart,
    case when a.last_purchase_at is null then null else greatest(0,floor(extract(epoch from(now()-a.last_purchase_at))/86400))::bigint end days_since_last_purchase,coalesce(tags.tags,'[]'::jsonb) tags,
    case when coalesce(a.net_spent,0)>=5000 or coalesce(a.purchase_count,0)>=20 then 'vip' when coalesce(a.purchase_count,0)>=5 and a.last_purchase_at>=now()-interval '30 days' then 'loyal' when coalesce(a.purchase_count,0) between 2 and 4 and a.last_purchase_at>=now()-interval '45 days' then 'promising' when c.created_at>=now()-interval '30 days' and coalesce(a.purchase_count,0)<=1 then 'new' when coalesce(a.purchase_count,0)>=2 and a.last_purchase_at<now()-interval '30 days' and a.last_purchase_at>=now()-interval '90 days' then 'at_risk' when a.last_purchase_at<now()-interval '90 days' then 'lost' when a.last_purchase_at is null then 'inactive' else 'active' end segment
  from public.customers c
  left join public.customer_loyalty_accounts cla on cla.customer_id=c.id
  left join lateral (select count(*) filter(where src='store') store_sales_count,count(*) filter(where src='online') online_orders_count,count(*) purchase_count,coalesce(sum(gross),0) gross_sales,coalesce(sum(loyalty_discount),0) loyalty_discount,coalesce(sum(net),0) net_spent,coalesce(sum(store_profit),0) store_profit,max(purchased_at) last_purchase_at from (select 'store'::text src,s.total::numeric gross,coalesce(s.loyalty_voucher_amount,0)::numeric loyalty_discount,greatest(s.total-coalesce(s.loyalty_voucher_amount,0),0)::numeric net,coalesce(s.profit,0)::numeric store_profit,coalesce(s.date,s.created_at) purchased_at from public.sales s where s.customer_id=c.id and (p_branch_id is null or s.branch_id=p_branch_id) union all select 'online',o.total::numeric,coalesce(o.loyalty_voucher_amount,0)::numeric,greatest(o.total-coalesce(o.loyalty_voucher_amount,0),0)::numeric,0::numeric,o.created_at from public.online_orders o where o.customer_id=c.id and o.status::text='delivered' and o.payment_status::text='paid' and (p_branch_id is null or o.branch_id=p_branch_id))q) a on true
  left join lateral (select coalesce(sum(remaining_value_egp),0) outstanding_coupon_value,count(*) active_coupon_count from public.loyalty_vouchers where customer_id=c.id and status='active' and remaining_value_egp>0) v on true
  left join lateral (select count(*) cart_items_count,max(updated_at) cart_updated_at from public.cart_items ci where ci.customer_id=c.id or (c.user_id is not null and ci.user_id=c.user_id)) cart on true
  left join lateral (select coalesce(jsonb_agg(t.name order by t.name),'[]'::jsonb) tags from public.customer_tag_assignments a2 join public.customer_tags t on t.id=a2.tag_id and t.active where a2.customer_id=c.id) tags on true
 ), filtered as (
  select * from base b where (v_search is null or coalesce(b.name,'') ilike '%'||v_search||'%' or coalesce(b.phone,'') ilike '%'||v_search||'%' or coalesce(b.email,'') ilike '%'||v_search||'%' or coalesce(b.membership_number,'') ilike '%'||v_search||'%' or coalesce(b.barcode_token,'') ilike '%'||v_search||'%') and (v_segment is null or v_segment='all' or b.segment=v_segment) and (v_status is null or b.management_status=v_status) and (v_channel is null or v_channel='all' or b.preferred_channel=v_channel) and (v_has_coupon is null or ((b.active_coupon_count>0)=v_has_coupon)) and (v_has_points is null or ((b.points_balance>0)=v_has_points)) and (v_has_cart is null or ((b.cart_items_count>0)=v_has_cart)) and (v_abandoned is null or (b.abandoned_cart=v_abandoned)) and (v_inactive_days is null or (b.days_since_last_purchase is not null and b.days_since_last_purchase>=v_inactive_days)) and (v_min_spent is null or b.net_spent>=v_min_spent) and (v_max_spent is null or b.net_spent<=v_max_spent) and (v_tag is null or exists(select 1 from jsonb_array_elements_text(b.tags) x where x ilike v_tag))
 )
 select coalesce(jsonb_agg(to_jsonb(x) order by x.last_purchase_at desc nulls last,x.created_at desc),'[]'::jsonb) into v_rows from (select * from filtered order by last_purchase_at desc nulls last,created_at desc limit v_limit offset v_offset)x;

 with metrics as (
  select c.id,c.created_at,c.management_status,coalesce(a.purchase_count,0)::bigint purchase_count,coalesce(a.net_spent,0)::numeric net_spent,a.last_purchase_at,coalesce(cla.points_balance,0)::bigint points_balance,coalesce(v.outstanding_coupon_value,0)::numeric outstanding_coupon_value,coalesce(cart.cart_items_count,0)::bigint cart_items_count,cart.cart_updated_at
  from public.customers c left join public.customer_loyalty_accounts cla on cla.customer_id=c.id
  left join lateral (select count(*) purchase_count,coalesce(sum(net),0) net_spent,max(purchased_at) last_purchase_at from (select greatest(s.total-coalesce(s.loyalty_voucher_amount,0),0)::numeric net,coalesce(s.date,s.created_at) purchased_at from public.sales s where s.customer_id=c.id and (p_branch_id is null or s.branch_id=p_branch_id) union all select greatest(o.total-coalesce(o.loyalty_voucher_amount,0),0)::numeric,o.created_at from public.online_orders o where o.customer_id=c.id and o.status::text='delivered' and o.payment_status::text='paid' and (p_branch_id is null or o.branch_id=p_branch_id))q)a on true
  left join lateral (select coalesce(sum(remaining_value_egp),0) outstanding_coupon_value from public.loyalty_vouchers where customer_id=c.id and status='active' and remaining_value_egp>0)v on true
  left join lateral (select count(*) cart_items_count,max(updated_at) cart_updated_at from public.cart_items ci where ci.customer_id=c.id or (c.user_id is not null and ci.user_id=c.user_id))cart on true
 )
 select jsonb_build_object('total_customers',count(*),'active_30d',count(*) filter(where last_purchase_at>=now()-interval '30 days'),'new_30d',count(*) filter(where created_at>=now()-interval '30 days'),'total_net_sales',coalesce(sum(net_spent),0),'average_customer_value',case when count(*)>0 then round((coalesce(sum(net_spent),0)/count(*))::numeric,2) else 0 end,'points_outstanding',coalesce(sum(points_balance),0),'coupons_outstanding_value',coalesce(sum(outstanding_coupon_value),0),'under_watch',count(*) filter(where management_status='watch'),'blocked',count(*) filter(where management_status='blocked'),'abandoned_carts',count(*) filter(where cart_items_count>0 and cart_updated_at<now()-interval '24 hours')) into v_summary from metrics;

 return jsonb_build_object('rows',v_rows,'total',v_total,'limit',v_limit,'offset',v_offset,'summary',v_summary);
end $$;
revoke all on function public.get_customer_management_catalog_v2(uuid,text,text,jsonb,integer,integer) from public,anon;
grant execute on function public.get_customer_management_catalog_v2(uuid,text,text,jsonb,integer,integer) to authenticated;
