create or replace function public.get_reporting_customers_v2(
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
  v_limit integer := least(greatest(coalesce(p_limit,100),10),200);
  v_summary jsonb := '{}'::jsonb;
  v_customers jsonb := '[]'::jsonb;
  v_loyalty jsonb := '{}'::jsonb;
  v_crm jsonb := '{}'::jsonb;
  v_first_linked_at timestamptz;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not public.staff_has_permission('reports.view',p_branch_id) then raise exception using errcode='42501',message='REPORTS_VIEW_DENIED'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception using errcode='22023',message='INVALID_REPORT_RANGE'; end if;
  if p_to-p_from>interval '732 days' then raise exception using errcode='22023',message='REPORT_RANGE_TOO_LARGE'; end if;

  with events as (
    select customer_id,sale_date event_at from public.pos_invoices where branch_id=p_branch_id and customer_id is not null
    union all
    select customer_id,created_at from public.online_orders where branch_id=p_branch_id and customer_id is not null
  ) select min(event_at) into v_first_linked_at from events;

  with pos as (
    select count(*)::bigint transactions,
      count(*) filter(where customer_id is not null)::bigint linked_transactions,
      coalesce(sum(greatest(total-coalesce(loyalty_voucher_amount,0),0)),0)::numeric value,
      coalesce(sum(greatest(total-coalesce(loyalty_voucher_amount,0),0)) filter(where customer_id is not null),0)::numeric linked_value
    from public.pos_invoices
    where branch_id=p_branch_id and sale_date>=p_from and sale_date<p_to
  ), online as (
    select count(*)::bigint orders,
      count(*) filter(where customer_id is not null)::bigint linked_orders,
      count(*) filter(where status='delivered')::bigint delivered_orders,
      count(*) filter(where status='delivered' and customer_id is not null)::bigint linked_delivered_orders,
      coalesce(sum(total),0)::numeric gross_value,
      coalesce(sum(total) filter(where customer_id is not null),0)::numeric linked_gross_value,
      coalesce(sum(total) filter(where status='delivered'),0)::numeric delivered_value,
      coalesce(sum(total) filter(where status='delivered' and customer_id is not null),0)::numeric linked_delivered_value
    from public.online_orders
    where branch_id=p_branch_id and created_at>=p_from and created_at<p_to
  ), returns as (
    select count(*)::bigint returns,
      count(*) filter(where customer_id is not null)::bigint linked_returns,
      coalesce(sum(total_amount),0)::numeric return_value,
      coalesce(sum(total_amount) filter(where customer_id is not null),0)::numeric linked_return_value
    from public.returns
    where branch_id=p_branch_id and status='approved'
      and coalesce(approved_at,created_at)>=p_from and coalesce(approved_at,created_at)<p_to
  ), purchase_events as (
    select customer_id,sale_date event_at from public.pos_invoices where branch_id=p_branch_id and customer_id is not null
    union all
    select customer_id,created_at from public.online_orders where branch_id=p_branch_id and customer_id is not null and status='delivered'
  ), first_purchase as (
    select customer_id,min(event_at) first_purchase_at from purchase_events group by customer_id
  ), period_realized as (
    select distinct customer_id from public.pos_invoices where branch_id=p_branch_id and customer_id is not null and sale_date>=p_from and sale_date<p_to
    union
    select distinct customer_id from public.online_orders where branch_id=p_branch_id and customer_id is not null and status='delivered' and created_at>=p_from and created_at<p_to
  ), period_known as (
    select distinct customer_id from (
      select customer_id from public.pos_invoices where branch_id=p_branch_id and customer_id is not null and sale_date>=p_from and sale_date<p_to
      union all
      select customer_id from public.online_orders where branch_id=p_branch_id and customer_id is not null and created_at>=p_from and created_at<p_to
    ) x
  )
  select jsonb_build_object(
    'known_customers_in_period',(select count(*) from period_known),
    'realized_customers_in_period',(select count(*) from period_realized),
    'new_realized_customers',(select count(*) from period_realized pr join first_purchase fp using(customer_id) where fp.first_purchase_at>=p_from and fp.first_purchase_at<p_to),
    'returning_realized_customers',(select count(*) from period_realized pr join first_purchase fp using(customer_id) where fp.first_purchase_at<p_from),
    'pos_transactions',pos.transactions,
    'pos_linked_transactions',pos.linked_transactions,
    'pos_anonymous_transactions',pos.transactions-pos.linked_transactions,
    'pos_value',round(pos.value,2),
    'pos_linked_value',round(pos.linked_value,2),
    'pos_anonymous_value',round(pos.value-pos.linked_value,2),
    'pos_identity_coverage_percent',case when pos.transactions>0 then round(pos.linked_transactions::numeric/pos.transactions*100,2) else 100 end,
    'online_orders',online.orders,
    'online_linked_orders',online.linked_orders,
    'online_anonymous_orders',online.orders-online.linked_orders,
    'online_gross_value',round(online.gross_value,2),
    'online_linked_gross_value',round(online.linked_gross_value,2),
    'online_identity_coverage_percent',case when online.orders>0 then round(online.linked_orders::numeric/online.orders*100,2) else 100 end,
    'online_delivered_value',round(online.delivered_value,2),
    'online_linked_delivered_value',round(online.linked_delivered_value,2),
    'approved_returns',returns.returns,
    'linked_returns',returns.linked_returns,
    'approved_return_value',round(returns.return_value,2),
    'linked_return_value',round(returns.linked_return_value,2),
    'known_realized_value',round(pos.linked_value+online.linked_delivered_value-returns.linked_return_value,2),
    'anonymous_realized_value',round((pos.value-pos.linked_value)+(online.delivered_value-online.linked_delivered_value)-(returns.return_value-returns.linked_return_value),2),
    'overall_identity_coverage_percent',case when (pos.transactions+online.orders)>0 then round((pos.linked_transactions+online.linked_orders)::numeric/(pos.transactions+online.orders)*100,2) else 100 end
  ) into v_summary
  from pos,online,returns;

  with associated as (
    select customer_id from public.pos_invoices where branch_id=p_branch_id and customer_id is not null
    union select customer_id from public.online_orders where branch_id=p_branch_id and customer_id is not null
    union select customer_id from public.customer_interactions where branch_id=p_branch_id and customer_id is not null
  )
  select jsonb_build_object(
    'accounts',count(la.customer_id)::bigint,
    'active_accounts',count(la.customer_id) filter(where la.status='active')::bigint,
    'points_balance',coalesce(sum(la.points_balance),0)::bigint,
    'lifetime_points_earned',coalesce(sum(la.lifetime_points_earned),0)::bigint,
    'lifetime_points_redeemed',coalesce(sum(la.lifetime_points_redeemed),0)::bigint
  ) into v_loyalty
  from associated a join public.customer_loyalty_accounts la on la.customer_id=a.customer_id;

  select jsonb_build_object(
    'created_in_period',count(*) filter(where created_at>=p_from and created_at<p_to)::bigint,
    'completed_in_period',count(*) filter(where completed_at>=p_from and completed_at<p_to)::bigint,
    'pending_now',count(*) filter(where status='pending' and completed_at is null)::bigint,
    'overdue_now',count(*) filter(where status='pending' and completed_at is null and scheduled_at is not null and scheduled_at<now())::bigint
  ) into v_crm
  from public.customer_interactions where branch_id=p_branch_id;

  with current_ids as (
    select customer_id from public.pos_invoices where branch_id=p_branch_id and customer_id is not null and sale_date>=p_from and sale_date<p_to
    union select customer_id from public.online_orders where branch_id=p_branch_id and customer_id is not null and created_at>=p_from and created_at<p_to
  ), pos_cur as (
    select customer_id,count(*)::bigint invoices,coalesce(sum(greatest(total-coalesce(loyalty_voucher_amount,0),0)),0)::numeric sales,max(sale_date) last_pos_at
    from public.pos_invoices where branch_id=p_branch_id and customer_id is not null and sale_date>=p_from and sale_date<p_to group by customer_id
  ), online_cur as (
    select customer_id,count(*)::bigint orders,count(*) filter(where status='delivered')::bigint delivered_orders,
      coalesce(sum(total),0)::numeric gross_value,coalesce(sum(total) filter(where status='delivered'),0)::numeric delivered_value,
      coalesce(sum(total) filter(where status not in ('delivered','cancelled')),0)::numeric open_order_value,max(created_at) last_order_at
    from public.online_orders where branch_id=p_branch_id and customer_id is not null and created_at>=p_from and created_at<p_to group by customer_id
  ), ret_cur as (
    select customer_id,count(*)::bigint returns,coalesce(sum(total_amount),0)::numeric return_value
    from public.returns where branch_id=p_branch_id and customer_id is not null and status='approved'
      and coalesce(approved_at,created_at)>=p_from and coalesce(approved_at,created_at)<p_to group by customer_id
  ), life_pos as (
    select customer_id,count(*)::bigint invoices,coalesce(sum(greatest(total-coalesce(loyalty_voucher_amount,0),0)),0)::numeric sales,min(sale_date) first_at,max(sale_date) last_at
    from public.pos_invoices where branch_id=p_branch_id and customer_id is not null group by customer_id
  ), life_online as (
    select customer_id,count(*) filter(where status='delivered')::bigint delivered_orders,
      coalesce(sum(total) filter(where status='delivered'),0)::numeric delivered_value,
      min(created_at) filter(where status='delivered') first_at,max(created_at) filter(where status='delivered') last_at
    from public.online_orders where branch_id=p_branch_id and customer_id is not null group by customer_id
  ), life_ret as (
    select customer_id,coalesce(sum(total_amount),0)::numeric return_value
    from public.returns where branch_id=p_branch_id and customer_id is not null and status='approved' group by customer_id
  ), rows as (
    select c.id customer_id,coalesce(nullif(c.name,''),concat_ws(' ',c.first_name,c.last_name),'عميل') customer_name,c.phone,c.email,c.management_status,c.created_at customer_created_at,
      coalesce(pc.invoices,0)::bigint pos_invoices,coalesce(pc.sales,0)::numeric pos_sales,
      coalesce(oc.orders,0)::bigint online_orders,coalesce(oc.delivered_orders,0)::bigint delivered_online_orders,
      coalesce(oc.gross_value,0)::numeric online_gross_value,coalesce(oc.delivered_value,0)::numeric online_delivered_value,
      coalesce(oc.open_order_value,0)::numeric open_online_value,coalesce(rc.returns,0)::bigint returns,coalesce(rc.return_value,0)::numeric return_value,
      (coalesce(pc.sales,0)+coalesce(oc.delivered_value,0)-coalesce(rc.return_value,0))::numeric period_realized_value,
      least(lp.first_at,lo.first_at) first_purchase_both,
      greatest(lp.last_at,lo.last_at) last_purchase_both,
      coalesce(lp.sales,0)+coalesce(lo.delivered_value,0)-coalesce(lr.return_value,0) lifetime_realized_value,
      coalesce(la.points_balance,0)::bigint points_balance,coalesce(la.lifetime_points_earned,0)::bigint lifetime_points_earned,
      coalesce(la.lifetime_points_redeemed,0)::bigint lifetime_points_redeemed,la.membership_number,
      greatest(pc.last_pos_at,oc.last_order_at) last_activity_at
    from current_ids ids join public.customers c on c.id=ids.customer_id
    left join pos_cur pc on pc.customer_id=c.id left join online_cur oc on oc.customer_id=c.id left join ret_cur rc on rc.customer_id=c.id
    left join life_pos lp on lp.customer_id=c.id left join life_online lo on lo.customer_id=c.id left join life_ret lr on lr.customer_id=c.id
    left join public.customer_loyalty_accounts la on la.customer_id=c.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'customer_id',customer_id,'customer_name',customer_name,'phone',phone,'email',email,'management_status',management_status,'customer_created_at',customer_created_at,
    'pos_invoices',pos_invoices,'pos_sales',round(pos_sales,2),'online_orders',online_orders,'delivered_online_orders',delivered_online_orders,
    'online_gross_value',round(online_gross_value,2),'online_delivered_value',round(online_delivered_value,2),'open_online_value',round(open_online_value,2),
    'returns',returns,'return_value',round(return_value,2),'period_realized_value',round(period_realized_value,2),
    'first_purchase_at',first_purchase_both,'last_purchase_at',last_purchase_both,'last_activity_at',last_activity_at,
    'customer_stage',case when first_purchase_both is null then 'prospect' when first_purchase_both>=p_from and period_realized_value>0 then 'new' when first_purchase_both<p_from and period_realized_value>0 then 'returning' else 'engaged' end,
    'lifetime_realized_value',round(lifetime_realized_value,2),'membership_number',membership_number,'points_balance',points_balance,
    'lifetime_points_earned',lifetime_points_earned,'lifetime_points_redeemed',lifetime_points_redeemed
  ) order by period_realized_value desc,open_online_value desc,last_activity_at desc nulls last),'[]'::jsonb)
  into v_customers from (select * from rows order by period_realized_value desc,open_online_value desc,last_activity_at desc nulls last limit v_limit) r;

  return jsonb_build_object(
    'version',2,'branch_id',p_branch_id,'from',p_from,'to',p_to,
    'summary',coalesce(v_summary,'{}'::jsonb),'loyalty',coalesce(v_loyalty,'{}'::jsonb),'crm',coalesce(v_crm,'{}'::jsonb),
    'customers',coalesce(v_customers,'[]'::jsonb),
    'data_quality',jsonb_build_object(
      'identity_rule','customer_id_only_no_name_or_phone_guessing','first_linked_activity_at',v_first_linked_at,
      'pos_customer_linking_available',(select exists(select 1 from public.pos_invoices where branch_id=p_branch_id and customer_id is not null)),
      'customer_master_branch_scoped',false,'customer_master_note','customers table is global; branch metrics are scoped by linked commerce or CRM activity',
      'lifetime_value_scope','linked POS invoices plus delivered online orders minus approved linked returns within this branch',
      'anonymous_commerce_included_in_customer_rows',false
    )
  );
end;
$function$;

revoke all on function public.get_reporting_customers_v2(uuid,timestamptz,timestamptz,integer) from public,anon;
grant execute on function public.get_reporting_customers_v2(uuid,timestamptz,timestamptz,integer) to authenticated,service_role;
