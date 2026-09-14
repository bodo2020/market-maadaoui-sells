create table if not exists private.order_batch_picking_shadow_v1 (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  batch_code text not null,
  order_ids uuid[] not null,
  recommended_user_id uuid references public.users(id) on delete set null,
  order_count integer not null check (order_count between 2 and 4),
  total_lines integer not null check (total_lines > 0),
  score numeric(10,2) not null default 0,
  reason text not null,
  profile_snapshot jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active','superseded')),
  generated_at timestamptz not null default now(),
  superseded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists order_batch_picking_shadow_branch_idx
  on private.order_batch_picking_shadow_v1(branch_id,status,generated_at desc);
create unique index if not exists order_batch_picking_shadow_active_code_idx
  on private.order_batch_picking_shadow_v1(branch_id,batch_code)
  where status='active';

revoke all on private.order_batch_picking_shadow_v1 from anon,authenticated;

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
  select r.order_id,min(r.created_at),min(r.predicted_ready_at),min(r.eta_risk),min(r.recommended_user_id),
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
  group by r.order_id;
$function$;

create or replace function private.refresh_branch_batch_picking_shadow_v1(p_branch_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_anchor record;
  v_candidate record;
  v_ids uuid[];
  v_profiles jsonb;
  v_reserved uuid[]:='{}'::uuid[];
  v_total_lines integer;
  v_score numeric;
  v_pair_score numeric;
  v_reason text;
  v_created integer:=0;
begin
  if p_branch_id is null then return 0; end if;

  update private.order_batch_picking_shadow_v1
     set status='superseded',superseded_at=now()
   where branch_id=p_branch_id and status='active';

  for v_anchor in
    select *
    from private.order_batch_profiles_v1(p_branch_id)
    order by case eta_risk when 'late' then 0 when 'at_risk' then 1 else 2 end,
             predicted_ready_at nulls last,created_at,order_id
  loop
    if v_anchor.order_id=any(v_reserved) then continue; end if;
    v_reserved:=array_append(v_reserved,v_anchor.order_id);
    v_ids:=array[v_anchor.order_id];
    v_total_lines:=v_anchor.line_count;
    v_score:=0;

    if v_anchor.line_count>25 or v_anchor.unit_count>80 or (v_anchor.has_bulk and v_anchor.line_count>12) then
      continue;
    end if;

    for v_candidate in
      select p.*,
        round((
          greatest(0,35-(abs(extract(epoch from (coalesce(p.predicted_ready_at,p.created_at)-coalesce(v_anchor.predicted_ready_at,v_anchor.created_at))))/60)*1.75)
          + least(18,cardinality(array(select unnest(p.product_ids) intersect select unnest(v_anchor.product_ids)))*6)
          + least(20,cardinality(array(select unnest(p.category_ids) intersect select unnest(v_anchor.category_ids)))*5)
          + least(24,cardinality(array(select unnest(p.shelf_locations) intersect select unnest(v_anchor.shelf_locations)))*6)
          - greatest(0,(p.line_count+v_anchor.line_count)-30)*1.5
          - case when p.has_bulk or v_anchor.has_bulk then 8 else 0 end
        )::numeric,2) as pair_score
      from private.order_batch_profiles_v1(p_branch_id) p
      where p.order_id<>v_anchor.order_id
        and not (p.order_id=any(v_reserved))
        and p.line_count<=25 and p.unit_count<=80
        and abs(extract(epoch from (coalesce(p.predicted_ready_at,p.created_at)-coalesce(v_anchor.predicted_ready_at,v_anchor.created_at))))<=1200
        and (v_anchor.recommended_user_id is null or p.recommended_user_id is null or p.recommended_user_id=v_anchor.recommended_user_id)
      order by pair_score desc,
               case p.eta_risk when 'late' then 0 when 'at_risk' then 1 else 2 end,
               p.predicted_ready_at nulls last,p.created_at
      limit 8
    loop
      exit when cardinality(v_ids)>=4;
      if v_total_lines+v_candidate.line_count>40 then continue; end if;
      if v_candidate.pair_score<28 then continue; end if;
      v_ids:=array_append(v_ids,v_candidate.order_id);
      v_reserved:=array_append(v_reserved,v_candidate.order_id);
      v_total_lines:=v_total_lines+v_candidate.line_count;
      v_score:=v_score+v_candidate.pair_score;
    end loop;

    if cardinality(v_ids)<2 then continue; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'order_id',p.order_id,'line_count',p.line_count,'unit_count',p.unit_count,
      'predicted_ready_at',p.predicted_ready_at,'eta_risk',p.eta_risk,
      'shelf_coverage',p.shelf_coverage,'has_weight',p.has_weight,'has_bulk',p.has_bulk,
      'categories',cardinality(p.category_ids),'shelves',cardinality(p.shelf_locations)
    ) order by p.predicted_ready_at nulls last,p.created_at),'[]'::jsonb)
    into v_profiles
    from private.order_batch_profiles_v1(p_branch_id) p
    where p.order_id=any(v_ids);

    select case
      when min(p.shelf_coverage)>=0.60 and cardinality(array(
        select unnest(min(p.shelf_locations)) intersect select unnest(max(p.shelf_locations))
      ))>0 then 'shared_shelf_route'
      when cardinality(array(
        select unnest(min(p.category_ids)) intersect select unnest(max(p.category_ids))
      ))>0 then 'shared_categories'
      else 'close_sla_window'
    end
    into v_reason
    from private.order_batch_profiles_v1(p_branch_id) p
    where p.order_id=any(v_ids);

    insert into private.order_batch_picking_shadow_v1(
      branch_id,batch_code,order_ids,recommended_user_id,order_count,total_lines,score,reason,profile_snapshot,metadata
    ) values(
      p_branch_id,
      'BS-'||upper(substr(md5(array_to_string(v_ids,',')),1,8)),
      v_ids,v_anchor.recommended_user_id,cardinality(v_ids),v_total_lines,
      round(v_score/greatest(1,cardinality(v_ids)-1),2),coalesce(v_reason,'close_sla_window'),v_profiles,
      jsonb_build_object('max_orders',4,'max_lines',40,'max_ready_gap_minutes',20,'minimum_pair_score',28)
    );
    v_created:=v_created+1;
  end loop;
  return v_created;
end;
$function$;

create or replace function public.get_batch_picking_shadow_v1(p_branch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_batches jsonb;
  v_eligible integer:=0;
  v_covered integer:=0;
  v_created integer:=0;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='BRANCH_REQUIRED'; end if;
  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('online_orders.prepare',p_branch_id)
     and not public.staff_has_permission('online_orders.manage',p_branch_id)
     and not public.staff_has_permission('online_orders.view',p_branch_id) then
    raise exception using errcode='42501',message='BATCH_PICKING_SHADOW_DENIED';
  end if;

  v_created:=private.refresh_branch_batch_picking_shadow_v1(p_branch_id);
  select count(*) into v_eligible from private.order_batch_profiles_v1(p_branch_id);
  select coalesce(sum(order_count),0) into v_covered
  from private.order_batch_picking_shadow_v1 where branch_id=p_branch_id and status='active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',b.id,'batch_code',b.batch_code,'order_ids',to_jsonb(b.order_ids),
    'order_count',b.order_count,'total_lines',b.total_lines,'score',b.score,'reason',b.reason,
    'recommended_user_id',b.recommended_user_id,'recommended_user_name',u.name,
    'generated_at',b.generated_at,'profiles',b.profile_snapshot,
    'orders',(select coalesce(jsonb_agg(jsonb_build_object(
      'order_id',o.id,'display_id','MD-'||upper(substr(replace(o.id::text,'-',''),1,6)),
      'customer_name',coalesce(o.customer_snapshot->>'name',c.name,'عميل'),
      'items_total',f.items_total,'predicted_ready_at',f.predicted_ready_at,
      'eta_risk',coalesce(e.risk,'on_track')
    ) order by f.predicted_ready_at nulls last,o.created_at),'[]'::jsonb)
      from unnest(b.order_ids) with ordinality ids(order_id,position)
      join public.online_orders o on o.id=ids.order_id
      join private.order_fulfillment_state_v1 f on f.order_id=o.id
      left join public.customers c on c.id=o.customer_id
      left join private.order_eta_current_v1 e on e.order_id=o.id)
  ) order by b.score desc,b.generated_at desc),'[]'::jsonb)
  into v_batches
  from private.order_batch_picking_shadow_v1 b
  left join public.users u on u.id=b.recommended_user_id
  where b.branch_id=p_branch_id and b.status='active';

  return jsonb_build_object(
    'mode','shadow','branch_id',p_branch_id,'generated_at',now(),
    'limits',jsonb_build_object('max_orders',4,'max_lines',40,'max_ready_gap_minutes',20,'minimum_pair_score',28),
    'summary',jsonb_build_object(
      'eligible_orders',v_eligible,'recommended_batches',v_created,'covered_orders',v_covered,
      'single_orders',greatest(0,v_eligible-v_covered),
      'coverage_rate',case when v_eligible=0 then null else round(v_covered::numeric/v_eligible::numeric*100,1) end
    ),
    'batches',coalesce(v_batches,'[]'::jsonb)
  );
end;
$function$;

revoke all on function private.order_batch_profiles_v1(uuid) from public,anon,authenticated;
revoke all on function private.refresh_branch_batch_picking_shadow_v1(uuid) from public,anon,authenticated;
revoke all on function public.get_batch_picking_shadow_v1(uuid) from public,anon;
grant execute on function public.get_batch_picking_shadow_v1(uuid) to authenticated;

comment on table private.order_batch_picking_shadow_v1 is 'Non-enforcing batch-picking recommendations used to validate grouping quality before operational rollout.';
comment on function public.get_batch_picking_shadow_v1(uuid) is 'Rebuilds and returns safe non-overlapping batch-picking recommendations for a branch without changing order ownership.';
