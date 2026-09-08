drop function if exists public.get_customer_coupon_conversion_dashboard(uuid,integer,integer);
create function public.get_customer_coupon_conversion_dashboard(
  p_branch_id uuid default null,
  p_days integer default 30,
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_super boolean;
  v_days integer:=least(greatest(coalesce(p_days,30),1),365);
  v_limit integer:=least(greatest(coalesce(p_limit,30),1),100);
  v_summary jsonb;
  v_recent jsonb;
  v_top jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not (public.staff_has_permission('customers.view',p_branch_id) or public.staff_has_permission('sales.view',p_branch_id))) then raise exception using errcode='42501',message='CUSTOMER_ACCESS_DENIED'; end if;

  with purchases as (
    select 'store'::text source,s.id purchase_id,s.customer_id,s.branch_id,coalesce(s.date,s.created_at) purchased_at,s.loyalty_voucher_id voucher_id,coalesce(s.loyalty_voucher_amount,0)::numeric discount_amount,s.total::numeric gross_amount,greatest(s.total-coalesce(s.loyalty_voucher_amount,0),0)::numeric net_amount
    from public.sales s where s.loyalty_voucher_id is not null and coalesce(s.loyalty_voucher_amount,0)>0 and coalesce(s.date,s.created_at)>=now()-make_interval(days=>v_days) and (p_branch_id is null or s.branch_id=p_branch_id)
    union all
    select 'online'::text,o.id,o.customer_id,o.branch_id,o.created_at,o.loyalty_voucher_id,coalesce(o.loyalty_voucher_amount,0)::numeric,o.total::numeric,greatest(o.total-coalesce(o.loyalty_voucher_amount,0),0)::numeric
    from public.online_orders o where o.loyalty_voucher_id is not null and coalesce(o.loyalty_voucher_amount,0)>0 and o.status::text='delivered' and o.payment_status::text='paid' and o.created_at>=now()-make_interval(days=>v_days) and (p_branch_id is null or o.branch_id=p_branch_id)
  ), cohort as (
    select lv.id from public.loyalty_vouchers lv where lv.created_at>=now()-make_interval(days=>v_days)
  ), cohort_used as (
    select distinct c.id from cohort c join purchases p on p.voucher_id=c.id
  )
  select jsonb_build_object(
    'window_days',v_days,'coupon_orders',(select count(*) from purchases),'used_vouchers',(select count(distinct voucher_id) from purchases),
    'discount_used',(select coalesce(sum(discount_amount),0) from purchases),'gross_sales_with_coupon',(select coalesce(sum(gross_amount),0) from purchases),
    'net_sales_after_coupon',(select coalesce(sum(net_amount),0) from purchases),'cohort_created',(select count(*) from cohort),'cohort_used',(select count(*) from cohort_used),
    'cohort_redemption_rate',case when (select count(*) from cohort)>0 then round((100.0*(select count(*) from cohort_used)/(select count(*) from cohort))::numeric,1) else 0 end,
    'active_vouchers',(select count(*) from public.loyalty_vouchers where status='active' and remaining_value_egp>0),
    'active_value',(select coalesce(sum(remaining_value_egp),0) from public.loyalty_vouchers where status='active' and remaining_value_egp>0)
  ) into v_summary;

  with purchases as (
    select 'store'::text source,s.id purchase_id,s.customer_id,coalesce(s.date,s.created_at) purchased_at,s.loyalty_voucher_id voucher_id,coalesce(s.loyalty_voucher_amount,0)::numeric discount_amount,s.total::numeric gross_amount,greatest(s.total-coalesce(s.loyalty_voucher_amount,0),0)::numeric net_amount
    from public.sales s where s.loyalty_voucher_id is not null and coalesce(s.loyalty_voucher_amount,0)>0 and coalesce(s.date,s.created_at)>=now()-make_interval(days=>v_days) and (p_branch_id is null or s.branch_id=p_branch_id)
    union all
    select 'online'::text,o.id,o.customer_id,o.created_at,o.loyalty_voucher_id,coalesce(o.loyalty_voucher_amount,0)::numeric,o.total::numeric,greatest(o.total-coalesce(o.loyalty_voucher_amount,0),0)::numeric
    from public.online_orders o where o.loyalty_voucher_id is not null and coalesce(o.loyalty_voucher_amount,0)>0 and o.status::text='delivered' and o.payment_status::text='paid' and o.created_at>=now()-make_interval(days=>v_days) and (p_branch_id is null or o.branch_id=p_branch_id)
  ), q as (
    select p.source,p.purchase_id,p.purchased_at,p.gross_amount,p.discount_amount,p.net_amount,c.id customer_id,c.name,c.phone,cla.membership_number,lv.voucher_code
    from purchases p left join public.customers c on c.id=p.customer_id left join public.customer_loyalty_accounts cla on cla.customer_id=c.id left join public.loyalty_vouchers lv on lv.id=p.voucher_id
    order by p.purchased_at desc limit v_limit
  ) select coalesce(jsonb_agg(to_jsonb(q) order by q.purchased_at desc),'[]'::jsonb) into v_recent from q;

  with purchases as (
    select s.customer_id,coalesce(s.loyalty_voucher_amount,0)::numeric discount_amount,greatest(s.total-coalesce(s.loyalty_voucher_amount,0),0)::numeric net_amount
    from public.sales s where s.customer_id is not null and s.loyalty_voucher_id is not null and coalesce(s.loyalty_voucher_amount,0)>0 and coalesce(s.date,s.created_at)>=now()-make_interval(days=>v_days) and (p_branch_id is null or s.branch_id=p_branch_id)
    union all
    select o.customer_id,coalesce(o.loyalty_voucher_amount,0)::numeric,greatest(o.total-coalesce(o.loyalty_voucher_amount,0),0)::numeric
    from public.online_orders o where o.customer_id is not null and o.loyalty_voucher_id is not null and coalesce(o.loyalty_voucher_amount,0)>0 and o.status::text='delivered' and o.payment_status::text='paid' and o.created_at>=now()-make_interval(days=>v_days) and (p_branch_id is null or o.branch_id=p_branch_id)
  ), q as (
    select c.id customer_id,c.name,c.phone,cla.membership_number,count(*)::bigint coupon_orders,coalesce(sum(p.discount_amount),0)::numeric discount_used,coalesce(sum(p.net_amount),0)::numeric net_sales
    from purchases p join public.customers c on c.id=p.customer_id left join public.customer_loyalty_accounts cla on cla.customer_id=c.id
    group by c.id,c.name,c.phone,cla.membership_number order by net_sales desc,coupon_orders desc limit 20
  ) select coalesce(jsonb_agg(to_jsonb(q) order by q.net_sales desc,q.coupon_orders desc),'[]'::jsonb) into v_top from q;

  return jsonb_build_object('summary',v_summary,'recent_conversions',v_recent,'top_customers',v_top);
end $$;
revoke all on function public.get_customer_coupon_conversion_dashboard(uuid,integer,integer) from public,anon;
grant execute on function public.get_customer_coupon_conversion_dashboard(uuid,integer,integer) to authenticated;
