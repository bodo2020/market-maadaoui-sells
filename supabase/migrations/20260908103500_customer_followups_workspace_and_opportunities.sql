create or replace function public.get_customer_management_workspace(p_customer_id uuid,p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_super boolean; v_can_view boolean; v_can_manage boolean; v_can_adjust boolean; v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  v_can_view:=v_super or (p_branch_id is not null and (public.staff_has_permission('customers.view',p_branch_id) or public.staff_has_permission('sales.view',p_branch_id)));
  v_can_manage:=v_super or (p_branch_id is not null and public.staff_has_permission('customers.manage',p_branch_id));
  v_can_adjust:=v_super or (p_branch_id is not null and public.staff_has_permission('customers.loyalty.adjust',p_branch_id));
  if not v_can_view then raise exception using errcode='42501',message='CUSTOMER_ACCESS_DENIED'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id) then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
  select jsonb_build_object(
    'management_status',c.management_status,
    'permissions',jsonb_build_object('can_view',v_can_view,'can_manage',v_can_manage,'can_adjust_points',v_can_adjust),
    'tags',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'color',t.color,'assigned_at',a.assigned_at) order by a.assigned_at desc) from public.customer_tag_assignments a join public.customer_tags t on t.id=a.tag_id where a.customer_id=c.id and t.active),'[]'::jsonb),
    'interactions',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select i.id,i.type,i.subject,i.description,i.status,i.priority,i.scheduled_at,i.created_by,i.created_at,i.branch_id,i.assigned_to,i.completed_at,i.completed_by,u.name assigned_to_name from public.customer_interactions i left join public.users u on u.id=i.assigned_to where i.customer_id=c.id order by i.created_at desc limit 100) x),'[]'::jsonb),
    'pending_followups',coalesce((select jsonb_agg(to_jsonb(x) order by x.scheduled_at asc) from (select i.id,i.type,i.subject,i.description,i.priority,i.scheduled_at,i.created_at,i.branch_id,i.assigned_to,u.name assigned_to_name,(i.scheduled_at<now()) overdue,case when i.scheduled_at<now() then floor(extract(epoch from(now()-i.scheduled_at))/3600)::bigint else 0 end overdue_hours from public.customer_interactions i left join public.users u on u.id=i.assigned_to where i.customer_id=c.id and i.status='pending' and i.type in ('call','email','meeting','whatsapp') order by i.scheduled_at asc limit 50) x),'[]'::jsonb),
    'audit',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select a.id,a.action_type,a.branch_id,a.created_by,a.metadata,a.created_at,u.name created_by_name from public.customer_admin_audit a left join public.users u on u.id=a.created_by where a.customer_id=c.id order by a.created_at desc limit 100) x),'[]'::jsonb)
  ) into v_result from public.customers c where c.id=p_customer_id;
  return v_result;
end $$;
revoke all on function public.get_customer_management_workspace(uuid,uuid) from public,anon;
grant execute on function public.get_customer_management_workspace(uuid,uuid) to authenticated;

create or replace function public.get_customer_opportunity_board(p_branch_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_super boolean; v_limit integer:=least(greatest(coalesce(p_limit,20),1),100);
  v_abandoned jsonb; v_coupons jsonb; v_due jsonb; v_watch jsonb; v_followups jsonb;
  v_abandoned_count bigint:=0; v_due_count bigint:=0; v_followup_count bigint:=0; v_summary jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not (public.staff_has_permission('customers.view',p_branch_id) or public.staff_has_permission('sales.view',p_branch_id))) then raise exception using errcode='42501',message='CUSTOMER_ACCESS_DENIED'; end if;

  with carts as (select c.id,c.name,c.phone,cla.membership_number,count(ci.*)::bigint item_count,max(ci.updated_at) cart_updated_at,round((extract(epoch from(now()-max(ci.updated_at)))/3600.0)::numeric,1) age_hours from public.customers c left join public.customer_loyalty_accounts cla on cla.customer_id=c.id join public.cart_items ci on ci.customer_id=c.id or (c.user_id is not null and ci.user_id=c.user_id) group by c.id,c.name,c.phone,cla.membership_number having max(ci.updated_at)<now()-interval '24 hours'), q as (select * from carts order by cart_updated_at asc limit v_limit)
  select coalesce(jsonb_agg(to_jsonb(q) order by q.cart_updated_at asc),'[]'::jsonb) into v_abandoned from q;
  select count(*) into v_abandoned_count from (select c.id from public.customers c join public.cart_items ci on ci.customer_id=c.id or (c.user_id is not null and ci.user_id=c.user_id) group by c.id having max(ci.updated_at)<now()-interval '24 hours') x;

  with q as (select c.id,c.name,c.phone,cla.membership_number,count(lv.*)::bigint coupon_count,coalesce(sum(lv.remaining_value_egp),0)::numeric coupon_value,max(lv.created_at) latest_coupon_at from public.customers c left join public.customer_loyalty_accounts cla on cla.customer_id=c.id join public.loyalty_vouchers lv on lv.customer_id=c.id and lv.status='active' and lv.remaining_value_egp>0 group by c.id,c.name,c.phone,cla.membership_number order by sum(lv.remaining_value_egp) desc,max(lv.created_at) desc limit v_limit)
  select coalesce(jsonb_agg(to_jsonb(q) order by q.coupon_value desc),'[]'::jsonb) into v_coupons from q;

  with events as (select c.id,c.name,c.phone,cla.membership_number,x.purchased_at from public.customers c left join public.customer_loyalty_accounts cla on cla.customer_id=c.id join lateral (select coalesce(s.date,s.created_at) purchased_at from public.sales s where s.customer_id=c.id and (p_branch_id is null or s.branch_id=p_branch_id) union all select o.created_at from public.online_orders o where o.customer_id=c.id and o.status::text='delivered' and o.payment_status::text='paid' and (p_branch_id is null or o.branch_id=p_branch_id)) x on true), ordered as (select *,lag(purchased_at) over(partition by id order by purchased_at) previous_at from events), grouped as (select id,max(name) name,max(phone) phone,max(membership_number) membership_number,count(*) purchase_count,max(purchased_at) last_purchase_at,avg(extract(epoch from(purchased_at-previous_at))/86400.0) filter(where previous_at is not null) avg_days from ordered group by id), predicted as (select *,case when purchase_count>=2 and avg_days is not null then last_purchase_at+make_interval(secs=>round(avg_days*86400)::int) else null end predicted_at from grouped), eligible as (select id,name,phone,membership_number,purchase_count,round(avg_days::numeric,1) average_days,last_purchase_at,predicted_at,case when predicted_at<now()-interval '3 days' then 'overdue' else 'due_soon' end opportunity_type,greatest(0,floor(extract(epoch from(now()-predicted_at))/86400))::bigint overdue_days from predicted where predicted_at is not null and predicted_at between now()-interval '120 days' and now()+interval '7 days'), q as (select * from eligible order by predicted_at asc limit v_limit)
  select coalesce(jsonb_agg(to_jsonb(q) order by q.predicted_at asc),'[]'::jsonb) into v_due from q;

  with events as (select c.id,x.purchased_at from public.customers c join lateral (select coalesce(s.date,s.created_at) purchased_at from public.sales s where s.customer_id=c.id and (p_branch_id is null or s.branch_id=p_branch_id) union all select o.created_at from public.online_orders o where o.customer_id=c.id and o.status::text='delivered' and o.payment_status::text='paid' and (p_branch_id is null or o.branch_id=p_branch_id)) x on true), ordered as (select *,lag(purchased_at) over(partition by id order by purchased_at) previous_at from events), grouped as (select id,count(*) purchase_count,max(purchased_at) last_purchase_at,avg(extract(epoch from(purchased_at-previous_at))/86400.0) filter(where previous_at is not null) avg_days from ordered group by id), predicted as (select id,case when purchase_count>=2 and avg_days is not null then last_purchase_at+make_interval(secs=>round(avg_days*86400)::int) else null end predicted_at from grouped)
  select count(*) into v_due_count from predicted where predicted_at is not null and predicted_at between now()-interval '120 days' and now()+interval '7 days';

  with q as (select c.id,c.name,c.phone,cla.membership_number,c.management_status,(select max(created_at) from public.customer_admin_audit a where a.customer_id=c.id) last_admin_action_at from public.customers c left join public.customer_loyalty_accounts cla on cla.customer_id=c.id where c.management_status='watch' order by c.updated_at desc limit v_limit)
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into v_watch from q;

  with q as (select i.id interaction_id,i.customer_id id,c.name,c.phone,cla.membership_number,i.type,i.subject,i.description,i.priority,i.scheduled_at,i.assigned_to,u.name assigned_to_name,(i.scheduled_at<now()) overdue,case when i.scheduled_at<now() then floor(extract(epoch from(now()-i.scheduled_at))/3600)::bigint else 0 end overdue_hours from public.customer_interactions i join public.customers c on c.id=i.customer_id left join public.customer_loyalty_accounts cla on cla.customer_id=c.id left join public.users u on u.id=i.assigned_to where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.scheduled_at<=now()+interval '7 days' and (p_branch_id is null or i.branch_id is null or i.branch_id=p_branch_id) order by i.scheduled_at asc limit v_limit)
  select coalesce(jsonb_agg(to_jsonb(q) order by q.scheduled_at asc),'[]'::jsonb) into v_followups from q;
  select count(*) into v_followup_count from public.customer_interactions i where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.scheduled_at<=now()+interval '7 days' and (p_branch_id is null or i.branch_id is null or i.branch_id=p_branch_id);

  select jsonb_build_object('abandoned_carts',v_abandoned_count,'coupon_ready',(select count(distinct lv.customer_id) from public.loyalty_vouchers lv where lv.status='active' and lv.remaining_value_egp>0),'under_watch',(select count(*) from public.customers where management_status='watch'),'due_or_overdue',v_due_count,'pending_followups',v_followup_count) into v_summary;
  return jsonb_build_object('summary',v_summary,'abandoned_carts',v_abandoned,'coupon_ready',v_coupons,'purchase_due',v_due,'under_watch',v_watch,'followups',v_followups);
end $$;
revoke all on function public.get_customer_opportunity_board(uuid,integer) from public,anon;
grant execute on function public.get_customer_opportunity_board(uuid,integer) to authenticated;
