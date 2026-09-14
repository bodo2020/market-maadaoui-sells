create or replace function public.get_pos_online_order_inbox_v1(p_branch_id uuid,p_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_limit integer:=least(greatest(coalesce(p_limit,30),1),100);
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('online_orders.intake',p_branch_id)
     and not public.staff_has_permission('online_orders.view',p_branch_id)
     and not public.staff_has_permission('online_orders.manage',p_branch_id)
     and not public.staff_has_permission('online_orders.prepare',p_branch_id) then
    raise exception using errcode='42501',message='ORDER_INTAKE_PERMISSION_DENIED';
  end if;

  return jsonb_build_object(
    'branch_id',p_branch_id,
    'generated_at',now(),
    'summary',jsonb_build_object(
      'new_orders',(select count(*) from public.online_orders o where o.branch_id=p_branch_id and o.status::text='pending'),
      'in_fulfillment',(select count(*) from public.online_orders o where o.branch_id=p_branch_id and o.status::text in ('confirmed','preparing')),
      'ready',(select count(*) from public.online_orders o where o.branch_id=p_branch_id and o.status::text='ready'),
      'at_risk',(select count(*) from private.order_fulfillment_state_v1 f left join private.order_eta_current_v1 e on e.order_id=f.order_id where f.branch_id=p_branch_id and f.fulfillment_state not in ('completed','cancelled') and coalesce(e.risk,'on_track') in ('at_risk','late'))
    ),
    'orders',coalesce((
      select jsonb_agg(x.obj order by x.sort_priority,x.created_at desc)
      from (
        select jsonb_build_object(
          'order_id',o.id,
          'display_id','MD-'||upper(substr(replace(o.id::text,'-',''),1,6)),
          'created_at',o.created_at,
          'age_minutes',greatest(0,floor(extract(epoch from (now()-o.created_at))/60)::integer),
          'order_status',o.status::text,
          'customer_name',coalesce(o.customer_snapshot->>'name',c.name,'عميل'),
          'customer_phone',coalesce(o.customer_snapshot->>'phone',c.phone),
          'total',o.total,
          'payment_method',coalesce(o.payment_method,'cash'),
          'payment_status',o.payment_status::text,
          'items_count',case when jsonb_typeof(o.items)='array' then jsonb_array_length(o.items) else 0 end,
          'fulfillment_state',f.fulfillment_state,
          'items_total',coalesce(f.items_total,0),
          'items_picked',coalesce(f.items_picked,0),
          'shortage_count',coalesce(f.shortage_count,0),
          'substitution_count',coalesce(f.substitution_count,0),
          'bags_count',coalesce(f.bags_count,0),
          'picker_name',pu.name,
          'predicted_ready_at',f.predicted_ready_at,
          'ready_at',f.ready_at,
          'eta_risk',coalesce(e.risk,'on_track'),
          'driver_name',du.name,
          'delivery_state',a.delivery_state,
          'arrived_branch_at',a.arrived_branch_at,
          'rider_wait_seconds',a.rider_wait_seconds,
          'needs_attention',(o.status::text='pending' or coalesce(e.risk,'on_track') in ('at_risk','late') or coalesce(f.shortage_count,0)>0)
        ) obj,
        o.created_at,
        case
          when o.status::text='pending' then 0
          when coalesce(e.risk,'on_track')='late' then 1
          when coalesce(e.risk,'on_track')='at_risk' then 2
          when o.status::text='ready' then 3
          else 4 end sort_priority
        from public.online_orders o
        left join public.customers c on c.id=o.customer_id
        left join private.order_fulfillment_state_v1 f on f.order_id=o.id
        left join private.order_eta_current_v1 e on e.order_id=o.id
        left join public.users pu on pu.id=f.picker_user_id
        left join lateral (
          select aa.* from private.delivery_order_assignments_v1 aa
          where aa.order_id=o.id and aa.unassigned_at is null
          order by aa.assigned_at desc limit 1
        ) a on true
        left join public.users du on du.id=a.delivery_user_id
        where o.branch_id=p_branch_id and o.status::text in ('pending','confirmed','preparing','ready','shipped')
        order by sort_priority,o.created_at desc
        limit v_limit
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_pos_online_order_inbox_v1(uuid,integer) from public,anon;
grant execute on function public.get_pos_online_order_inbox_v1(uuid,integer) to authenticated;
