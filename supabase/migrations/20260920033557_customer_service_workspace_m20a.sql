-- M20a — permission-scoped customer service search and unified order case workspace.

create or replace function private.customer_service_can_view_branch_v1(p_user_id uuid, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select p_user_id is not null
    and p_branch_id is not null
    and (
      private.staff_is_super_admin(p_user_id)
      or (
        public.has_branch_access(p_user_id,p_branch_id)
        and (
          public.staff_has_permission('customers.view',p_branch_id)
          or public.staff_has_permission('customers.manage',p_branch_id)
          or public.staff_has_permission('online_orders.view',p_branch_id)
          or public.staff_has_permission('online_orders.manage',p_branch_id)
          or public.staff_has_permission('online_orders.intake',p_branch_id)
          or public.staff_has_permission('online_orders.prepare',p_branch_id)
          or public.staff_has_permission('delivery.manage',p_branch_id)
        )
      )
    );
$function$;

revoke all on function private.customer_service_can_view_branch_v1(uuid,uuid) from public,anon,authenticated;

create or replace function public.get_customer_service_search_v1(
  p_query text,
  p_branch_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_query text:=trim(coalesce(p_query,''));
  v_digits text:=regexp_replace(coalesce(p_query,''),'[^0-9]','','g');
  v_limit integer:=least(greatest(coalesce(p_limit,30),1),50);
  v_results jsonb;
begin
  if v_uid is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;
  if length(v_query)<2 then
    raise exception using errcode='22023',message='CUSTOMER_SERVICE_QUERY_TOO_SHORT';
  end if;
  if p_branch_id is not null and not private.customer_service_can_view_branch_v1(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='CUSTOMER_SERVICE_ACCESS_DENIED';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_results
  from (
    select
      o.id as order_id,
      o.tracking_number,
      o.customer_id,
      coalesce(nullif(o.customer_snapshot->>'name',''),nullif(c.name,''),'عميل غير مسجل') as customer_name,
      coalesce(nullif(o.customer_snapshot->>'phone',''),c.phone) as customer_phone,
      o.status::text as order_status,
      o.payment_status::text as payment_status,
      o.payment_method,
      round(coalesce(o.total,0),2) as total,
      o.branch_id,
      b.name as branch_name,
      o.merchant_id,
      m.name as merchant_name,
      o.created_at,
      o.updated_at
    from public.online_orders o
    left join public.customers c on c.id=o.customer_id
    left join public.branches b on b.id=o.branch_id
    left join public.merchants m on m.id=o.merchant_id
    where o.branch_id is not null
      and (p_branch_id is null or o.branch_id=p_branch_id)
      and private.customer_service_can_view_branch_v1(v_uid,o.branch_id)
      and (
        o.id::text=v_query
        or coalesce(o.tracking_number,'') ilike '%'||v_query||'%'
        or coalesce(c.name,'') ilike '%'||v_query||'%'
        or coalesce(o.customer_snapshot->>'name','') ilike '%'||v_query||'%'
        or (
          length(v_digits)>=3
          and (
            regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') like '%'||v_digits||'%'
            or regexp_replace(coalesce(o.customer_snapshot->>'phone',''),'[^0-9]','','g') like '%'||v_digits||'%'
          )
        )
      )
    order by o.created_at desc
    limit v_limit
  ) x;

  return jsonb_build_object('query',v_query,'count',jsonb_array_length(v_results),'results',v_results);
end;
$function$;

create or replace function public.get_customer_service_case_v1(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_order public.online_orders%rowtype;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception using errcode='42501',message='AUTH_REQUIRED';
  end if;

  select * into v_order from public.online_orders where id=p_order_id;
  if v_order.id is null then
    raise exception using errcode='P0002',message='CUSTOMER_SERVICE_ORDER_NOT_FOUND';
  end if;
  if not private.customer_service_can_view_branch_v1(v_uid,v_order.branch_id) then
    raise exception using errcode='42501',message='CUSTOMER_SERVICE_ACCESS_DENIED';
  end if;

  with latest_assignment as (
    select a.* from private.delivery_order_assignments_v1 a
    where a.order_id=v_order.id
    order by (a.unassigned_at is null) desc,a.assigned_at desc limit 1
  ), selected_route as (
    select r.* from private.delivery_routes_v1 r
    where r.order_group_id=v_order.order_group_id
       or exists(select 1 from private.delivery_route_stops_v1 s where s.route_id=r.id and s.order_id=v_order.id)
    order by r.created_at desc limit 1
  ), timeline as (
    select * from (
      select 'order'::text event_type,'تم إنشاء الطلب'::text title,
        coalesce(v_order.tracking_number,v_order.id::text) detail,v_order.status::text status,
        v_order.created_at occurred_at,jsonb_build_object('order_id',v_order.id) metadata
      union all
      select 'order_status','تغيير حالة الطلب',coalesce(h.old_status::text,'—')||' ← '||h.new_status::text,
        h.new_status::text,h.created_at,jsonb_build_object('notes',h.notes,'changed_by',h.changed_by)
      from public.order_status_history h where h.order_id=v_order.id
      union all
      select 'delivery',case e.event_type
          when 'accept' then 'قبول مهمة التوصيل' when 'pickup' then 'استلام الطلب'
          when 'depart' then 'تحرك المندوب' when 'arrive' then 'وصول المندوب'
          when 'deliver' then 'تسليم الطلب' when 'fail' then 'تعذر التسليم'
          else 'تحديث التوصيل' end,
        coalesce(e.note,e.from_state||' ← '||e.to_state),e.to_state,e.created_at,
        coalesce(e.metadata,'{}'::jsonb)||jsonb_build_object('event_type',e.event_type)
      from private.delivery_order_events_v1 e where e.order_id=v_order.id
      union all
      select 'issue','مشكلة في نقطة الاستلام',coalesce(i.note,i.issue_type),i.status,i.reported_at,
        coalesce(i.metadata,'{}'::jsonb)||jsonb_build_object('issue_type',i.issue_type,'issue_id',i.id)
      from private.delivery_route_stop_issues_v1 i where i.order_id=v_order.id
      union all
      select 'refund','استرداد مالي',round(r.amount,2)::text||' جنيه · '||r.payment_method,r.status,r.created_at,
        jsonb_build_object('refund_id',r.id,'provider_reference',r.provider_reference)
      from public.payment_refunds r where r.order_id=v_order.id
      union all
      select 'return','طلب مرتجع',rr.reason,rr.status::text,rr.created_at,
        jsonb_build_object('return_id',rr.id,'admin_notes',rr.admin_notes)
      from public.return_requests rr where rr.order_id=v_order.id
      union all
      select 'task','مهمة تشغيل: '||t.title,coalesce(t.description,t.task_type),t.status,t.created_at,
        jsonb_build_object('task_id',t.id,'priority',t.priority,'due_at',t.due_at)
      from public.operations_tasks t
      where t.order_id=v_order.id or (t.source_kind='online_order' and t.source_id=v_order.id)
      union all
      select 'substitution','استبدال صنف',s.original_product_name||' ← '||s.replacement_product_name,s.status,s.proposed_at,
        jsonb_build_object('substitution_id',s.id,'financial_state',s.financial_state,'price_delta_total',s.price_delta_total)
      from private.order_fulfillment_substitutions_v1 s where s.order_id=v_order.id
    ) events
  )
  select jsonb_build_object(
    'order',jsonb_build_object(
      'id',o.id,'tracking_number',o.tracking_number,'status',o.status::text,'total',round(coalesce(o.total,0),2),
      'shipping_cost',round(coalesce(o.shipping_cost,0),2),'shipping_address',o.shipping_address,
      'payment_method',o.payment_method,'payment_status',o.payment_status::text,'return_status',o.return_status,
      'notes',o.notes,'source_channel',o.source_channel,'items',coalesce(o.items,'[]'::jsonb),
      'created_at',o.created_at,'updated_at',o.updated_at,'order_group_id',o.order_group_id
    ),
    'customer',jsonb_build_object(
      'id',c.id,'name',coalesce(nullif(o.customer_snapshot->>'name',''),c.name),
      'phone',coalesce(nullif(o.customer_snapshot->>'phone',''),c.phone),'email',c.email,
      'address',coalesce(o.shipping_address,c.address),'phone_verified',coalesce(c.phone_verified,false),'notes',c.notes
    ),
    'store',jsonb_build_object(
      'branch_id',b.id,'branch_name',b.name,'branch_phone',b.phone,
      'merchant_id',m.id,'merchant_name',coalesce(m.name,o.merchant_snapshot->>'name'),'merchant_phone',m.phone
    ),
    'delivery',jsonb_build_object(
      'assignment',case when a.id is null then null else jsonb_build_object(
        'id',a.id,'state',a.delivery_state,'assigned_at',a.assigned_at,'accepted_at',a.accepted_at,
        'picked_up_at',a.picked_up_at,'departed_at',a.departed_at,'arrived_at',a.arrived_at,
        'delivered_at',a.delivered_at,'failed_at',a.failed_at,'failure_reason',a.failure_reason,
        'cash_collected',a.cash_collected,'rider_wait_seconds',a.rider_wait_seconds
      ) end,
      'driver',case when u.id is null then null else jsonb_build_object('id',u.id,'name',u.name,'phone',u.phone) end,
      'route',case when rt.id is null then null else jsonb_build_object(
        'id',rt.id,'status',rt.status,'distance_km',rt.distance_km,'estimated_minutes',rt.estimated_minutes,
        'created_at',rt.created_at,'updated_at',rt.updated_at
      ) end,
      'stop',(select to_jsonb(s) from private.delivery_route_stops_v1 s
        where s.route_id=rt.id and (s.order_id=o.id or s.stop_type='dropoff')
        order by (s.order_id=o.id) desc,s.stop_order desc limit 1),
      'proof',(select to_jsonb(p)-'metadata' from private.delivery_order_delivery_proofs_v1 p where p.order_id=o.id limit 1)
    ),
    'issues',coalesce((select jsonb_agg(to_jsonb(i) order by i.reported_at desc)
      from private.delivery_route_stop_issues_v1 i where i.order_id=o.id),'[]'::jsonb),
    'tasks',coalesce((select jsonb_agg(jsonb_build_object(
      'id',t.id,'type',t.task_type,'title',t.title,'description',t.description,'status',t.status,
      'priority',t.priority,'amount',t.amount,'due_at',t.due_at,'created_at',t.created_at
    ) order by t.created_at desc) from public.operations_tasks t
      where t.order_id=o.id or (t.source_kind='online_order' and t.source_id=o.id)),'[]'::jsonb),
    'returns',coalesce((select jsonb_agg(to_jsonb(rr) order by rr.created_at desc)
      from public.return_requests rr where rr.order_id=o.id),'[]'::jsonb),
    'refunds',coalesce((select jsonb_agg(to_jsonb(pr) order by pr.created_at desc)
      from public.payment_refunds pr where pr.order_id=o.id),'[]'::jsonb),
    'substitutions',coalesce((select jsonb_agg(to_jsonb(s)-'metadata' order by s.proposed_at desc)
      from private.order_fulfillment_substitutions_v1 s where s.order_id=o.id),'[]'::jsonb),
    'timeline',coalesce((select jsonb_agg(jsonb_build_object(
      'event_type',t.event_type,'title',t.title,'detail',t.detail,'status',t.status,
      'occurred_at',t.occurred_at,'metadata',t.metadata
    ) order by t.occurred_at desc) from timeline t),'[]'::jsonb),
    'permissions',jsonb_build_object(
      'can_manage_order',private.staff_is_super_admin(v_uid) or public.staff_has_permission('online_orders.manage',o.branch_id),
      'can_manage_customer',private.staff_is_super_admin(v_uid) or public.staff_has_permission('customers.manage',o.branch_id),
      'can_manage_delivery',private.staff_is_super_admin(v_uid) or public.staff_has_permission('delivery.manage',o.branch_id)
    )
  ) into v_result
  from public.online_orders o
  left join public.customers c on c.id=o.customer_id
  left join public.branches b on b.id=o.branch_id
  left join public.merchants m on m.id=o.merchant_id
  left join latest_assignment a on true
  left join public.users u on u.id=a.delivery_user_id
  left join selected_route rt on true
  where o.id=v_order.id;

  return v_result;
end;
$function$;

revoke all on function public.get_customer_service_search_v1(text,uuid,integer) from public,anon,authenticated;
revoke all on function public.get_customer_service_case_v1(uuid) from public,anon,authenticated;
grant execute on function public.get_customer_service_search_v1(text,uuid,integer) to authenticated;
grant execute on function public.get_customer_service_case_v1(uuid) to authenticated;

create index if not exists order_status_history_order_created_m20_idx
on public.order_status_history(order_id,created_at desc);

create index if not exists operations_tasks_online_order_m20_idx
on public.operations_tasks(order_id,created_at desc)
where order_id is not null;
