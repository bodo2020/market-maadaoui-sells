create or replace function private.delivery_candidate_scores_v1(p_order_id uuid)
returns table(
  driver_id uuid,
  driver_name text,
  availability text,
  active_orders integer,
  distance_km numeric,
  travel_minutes integer,
  score numeric,
  last_location_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
with ctx as (
  select o.branch_id, b.latitude branch_lat, b.longitude branch_lng
  from public.online_orders o
  join public.branches b on b.id = o.branch_id
  where o.id = p_order_id
), raw as (
  select
    u.id driver_id,
    u.name driver_name,
    coalesce(ds.availability,'offline') availability,
    coalesce((
      select count(*)
      from private.delivery_order_assignments_v1 a
      where a.delivery_user_id = u.id
        and a.unassigned_at is null
        and a.delivery_state not in ('delivered','failed','return_to_branch')
    ),0)::integer active_orders,
    ds.last_location_at,
    case
      when ds.last_latitude is not null
       and ds.last_longitude is not null
       and c.branch_lat is not null
       and c.branch_lng is not null
      then (
        6371 * 2 * asin(sqrt(
          power(sin(radians(ds.last_latitude-c.branch_lat)/2),2)
          + cos(radians(c.branch_lat))*cos(radians(ds.last_latitude))
          * power(sin(radians(ds.last_longitude-c.branch_lng)/2),2)
        ))
      )::numeric
      else null::numeric
    end distance_km
  from ctx c
  join public.users u
    on u.role = 'delivery'
   and coalesce(u.active,true)
  left join private.delivery_driver_status_v1 ds
    on ds.user_id = u.id
  where coalesce(ds.availability,'offline') in ('available','busy')
    and (
      exists(
        select 1
        from public.user_branch_roles ubr
        where ubr.user_id = u.id
          and ubr.branch_id = c.branch_id
          and ubr.active
      )
      or exists(
        select 1
        from private.hr_employee_profiles ep
        where ep.user_id = u.id
          and ep.primary_branch_id = c.branch_id
          and coalesce(ep.employment_status,'active') <> 'terminated'
      )
    )
), ranked as (
  select
    r.*,
    greatest(1, ceil(r.distance_km/22*60)::integer) travel_minutes,
    round((
      100
      + case when r.availability='available' then 25 else -10 end
      - r.active_orders*25
      - r.distance_km*6
    )::numeric,2) score
  from raw r
  where r.distance_km is not null
    and r.distance_km <= 30
    and r.last_location_at is not null
    and r.last_location_at >= now() - interval '10 minutes'
)
select
  driver_id,
  driver_name,
  availability,
  active_orders,
  distance_km,
  travel_minutes,
  score,
  last_location_at
from ranked
order by score desc, travel_minutes asc, driver_name;
$function$;
