-- Keep the generic operations task and the order-fulfillment owner in sync.
create or replace function private.sync_online_fulfillment_task_owner_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_order_id uuid:=coalesce(new.order_id,new.source_id);
begin
  if new.task_type<>'online_order_fulfillment'
     and new.source_kind<>'online_order_fulfillment' then
    return new;
  end if;

  if new.status in ('claimed','in_progress','failed') and new.claimed_by is not null then
    update private.order_fulfillment_state_v1
       set picker_user_id=new.claimed_by,updated_at=now()
     where order_id=v_order_id
       and fulfillment_state in ('queued','picking','packing')
       and picker_user_id is distinct from new.claimed_by;
  elsif new.status='open' and new.claimed_by is null and old.claimed_by is not null then
    update private.order_fulfillment_state_v1
       set picker_user_id=null,updated_at=now()
     where order_id=v_order_id
       and fulfillment_state='queued'
       and picker_user_id=old.claimed_by;

    perform private.refresh_order_picker_assignment_shadow_v1(v_order_id);
  end if;

  return new;
end;
$function$;

revoke all on function private.sync_online_fulfillment_task_owner_v1() from public,anon,authenticated;

drop trigger if exists trg_sync_online_fulfillment_task_owner_v1 on public.operations_tasks;
create trigger trg_sync_online_fulfillment_task_owner_v1
after update of status,claimed_by on public.operations_tasks
for each row
when (
  old.status is distinct from new.status
  or old.claimed_by is distinct from new.claimed_by
)
execute function private.sync_online_fulfillment_task_owner_v1();

-- A queued order is batch-eligible only while its task is genuinely open.
create or replace function private.order_batch_profiles_v1(p_branch_id uuid)
returns table(
  order_id uuid,
  created_at timestamptz,
  predicted_ready_at timestamptz,
  eta_risk text,
  recommended_user_id uuid,
  line_count integer,
  unit_count numeric,
  product_ids uuid[],
  category_ids uuid[],
  shelf_locations text[],
  shelf_coverage numeric,
  has_weight boolean,
  has_bulk boolean
)
language sql
stable
security definer
set search_path=''
as $function$
  with eligible as (
    select o.id,o.created_at,o.items,f.predicted_ready_at,
           coalesce(e.risk,'on_track') as eta_risk,
           s.recommended_user_id
    from public.online_orders o
    join private.order_fulfillment_state_v1 f on f.order_id=o.id
    join public.operations_tasks t on t.id=f.pick_task_id
      and t.status='open' and t.claimed_by is null
    left join private.order_eta_current_v1 e on e.order_id=o.id
    left join private.order_picker_assignment_shadow_v1 s on s.order_id=o.id and s.outcome='pending'
    where o.branch_id=p_branch_id
      and o.status::text in ('confirmed','preparing')
      and f.fulfillment_state='queued'
      and f.picker_user_id is null
  ), item_rows as (
    select e.id as order_id,e.created_at,e.predicted_ready_at,e.eta_risk,e.recommended_user_id,
           item.value as item,
           case when coalesce(item.value->>'product_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then (item.value->>'product_id')::uuid end as product_id
    from eligible e
    left join lateral jsonb_array_elements(case when jsonb_typeof(e.items)='array' then e.items else '[]'::jsonb end) item on true
  )
  select r.order_id,r.created_at,r.predicted_ready_at,r.eta_risk,r.recommended_user_id,
         count(r.item)::integer,
         coalesce(sum(coalesce(nullif(r.item->>'stock_quantity','')::numeric,nullif(r.item->>'quantity','')::numeric,1)),0),
         coalesce(array_agg(distinct r.product_id) filter(where r.product_id is not null),'{}'::uuid[]),
         coalesce(array_agg(distinct p.main_category_id) filter(where p.main_category_id is not null),'{}'::uuid[]),
         coalesce(array_agg(distinct nullif(trim(p.shelf_location),'')) filter(where nullif(trim(p.shelf_location),'') is not null),'{}'::text[]),
         case when count(r.item)=0 then 0
              else round(count(r.item) filter(where nullif(trim(p.shelf_location),'') is not null)::numeric/count(r.item)::numeric,3) end,
         coalesce(bool_or(coalesce((r.item->>'is_weight_based')::boolean,false)),false),
         coalesce(bool_or(coalesce((r.item->>'is_bulk')::boolean,false)),false)
  from item_rows r
  left join public.products p on p.id=r.product_id
  group by r.order_id,r.created_at,r.predicted_ready_at,r.eta_risk,r.recommended_user_id;
$function$;

revoke all on function private.order_batch_profiles_v1(uuid) from public,anon,authenticated;

-- Release only incomplete legacy claims that never reached the fulfillment owner.
insert into public.operations_task_events(task_id,event_type,actor_id,note)
select t.id,'released',null,'تم تحرير حجز تجهيز غير مكتمل أثناء إصلاح مزامنة ملكية الطلب'
from public.operations_tasks t
join private.order_fulfillment_state_v1 f on f.pick_task_id=t.id
where (t.task_type='online_order_fulfillment' or t.source_kind='online_order_fulfillment')
  and t.status='claimed'
  and t.claimed_by is not null
  and t.started_at is null
  and f.fulfillment_state='queued'
  and f.picker_user_id is null;

update public.operations_tasks t
   set status='open',claimed_by=null,claimed_at=null,failure_reason=null,updated_at=now()
from private.order_fulfillment_state_v1 f
where f.pick_task_id=t.id
  and (t.task_type='online_order_fulfillment' or t.source_kind='online_order_fulfillment')
  and t.status='claimed'
  and t.claimed_by is not null
  and t.started_at is null
  and f.fulfillment_state='queued'
  and f.picker_user_id is null;
