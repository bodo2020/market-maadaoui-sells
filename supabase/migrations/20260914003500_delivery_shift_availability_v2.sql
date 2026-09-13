create unique index if not exists shifts_one_open_per_employee_v1
  on public.shifts(employee_id)
  where end_time is null and employee_id is not null;

create or replace function public.get_my_delivery_shift_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_shift public.shifts%rowtype;
  v_worked_minutes numeric := 0;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.users u
    where u.id=v_uid and u.role='delivery' and coalesce(u.active,true)
  ) then raise exception 'delivery_access_required'; end if;

  select * into v_shift
  from public.shifts
  where employee_id=v_uid and end_time is null
  order by start_time desc
  limit 1;

  select coalesce(sum(extract(epoch from (coalesce(s.end_time, now()) - s.start_time)) / 60.0),0)
  into v_worked_minutes
  from public.shifts s
  where s.employee_id=v_uid
    and timezone('Africa/Cairo', s.start_time)::date = timezone('Africa/Cairo', now())::date;

  return jsonb_build_object(
    'active', v_shift.id is not null,
    'shift', case when v_shift.id is null then null else jsonb_build_object(
      'id',v_shift.id,
      'start_time',v_shift.start_time,
      'end_time',v_shift.end_time,
      'total_hours',v_shift.total_hours
    ) end,
    'worked_minutes_today', round(v_worked_minutes,1)
  );
end;
$function$;

create or replace function public.start_my_delivery_shift_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_shift public.shifts%rowtype;
  v_branch_id uuid;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.users u
    where u.id=v_uid and u.role='delivery' and coalesce(u.active,true)
  ) then raise exception 'delivery_access_required'; end if;

  select coalesce(
    (select ubr.branch_id from public.user_branch_roles ubr where ubr.user_id=v_uid and ubr.active order by ubr.is_primary desc, ubr.updated_at desc limit 1),
    (select ep.primary_branch_id from private.hr_employee_profiles ep where ep.user_id=v_uid and ep.employment_status <> 'terminated' limit 1)
  ) into v_branch_id;
  if v_branch_id is null then raise exception 'delivery_branch_required'; end if;

  select * into v_shift
  from public.shifts
  where employee_id=v_uid and end_time is null
  order by start_time desc limit 1
  for update;

  if v_shift.id is null then
    insert into public.shifts(employee_id,start_time,created_at,updated_at)
    values(v_uid,now(),now(),now())
    returning * into v_shift;
  end if;

  insert into private.delivery_driver_status_v1(user_id,branch_id,availability,online_since,updated_at)
  values(v_uid,v_branch_id,'offline',null,now())
  on conflict(user_id) do update
    set branch_id=excluded.branch_id,
        availability=case when private.delivery_driver_status_v1.availability='busy' then 'busy' else 'offline' end,
        online_since=case when private.delivery_driver_status_v1.availability='busy' then private.delivery_driver_status_v1.online_since else null end,
        updated_at=now();

  return jsonb_build_object('ok',true,'active',true,'shift_id',v_shift.id,'start_time',v_shift.start_time,'branch_id',v_branch_id);
end;
$function$;

create or replace function public.end_my_delivery_shift_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_shift public.shifts%rowtype;
  v_end timestamptz := now();
  v_hours numeric;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.users u
    where u.id=v_uid and u.role='delivery' and coalesce(u.active,true)
  ) then raise exception 'delivery_access_required'; end if;

  if exists (
    select 1 from private.delivery_order_assignments_v1 a
    where a.delivery_user_id=v_uid
      and a.unassigned_at is null
      and a.delivery_state in ('assigned','accepted','picked_up','on_the_way','arrived')
  ) then raise exception 'active_delivery_prevents_shift_end'; end if;

  select * into v_shift
  from public.shifts
  where employee_id=v_uid and end_time is null
  order by start_time desc limit 1
  for update;

  if v_shift.id is null then
    update private.delivery_driver_status_v1
      set availability='offline',online_since=null,updated_at=now()
    where user_id=v_uid;
    return jsonb_build_object('ok',true,'active',false,'idempotent',true);
  end if;

  v_hours := round((extract(epoch from (v_end-v_shift.start_time))/3600.0)::numeric,2);
  update public.shifts
    set end_time=v_end,total_hours=v_hours,updated_at=now()
  where id=v_shift.id;

  update private.delivery_driver_status_v1
    set availability='offline',online_since=null,updated_at=now()
  where user_id=v_uid;

  return jsonb_build_object('ok',true,'active',false,'shift_id',v_shift.id,'end_time',v_end,'total_hours',v_hours);
end;
$function$;

create or replace function public.set_my_delivery_availability_v1(p_available boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_branch_id uuid;
  v_role text;
  v_status text := case when p_available then 'available' else 'offline' end;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select role into v_role from public.users where id=v_uid and coalesce(active,true);
  if v_role <> 'delivery' then raise exception 'delivery_access_required'; end if;

  if p_available and not exists (
    select 1 from public.shifts s where s.employee_id=v_uid and s.end_time is null
  ) then raise exception 'delivery_shift_required'; end if;

  if not p_available and exists (
    select 1 from private.delivery_order_assignments_v1 a
    where a.delivery_user_id=v_uid
      and a.unassigned_at is null
      and a.delivery_state in ('assigned','accepted','picked_up','on_the_way','arrived')
  ) then raise exception 'active_delivery_prevents_offline'; end if;

  select coalesce(
    (select ubr.branch_id from public.user_branch_roles ubr where ubr.user_id=v_uid and ubr.active order by ubr.is_primary desc,ubr.updated_at desc limit 1),
    (select ep.primary_branch_id from private.hr_employee_profiles ep where ep.user_id=v_uid and ep.employment_status <> 'terminated' limit 1)
  ) into v_branch_id;
  if v_branch_id is null then raise exception 'delivery_branch_required'; end if;

  insert into private.delivery_driver_status_v1(user_id,branch_id,availability,online_since,updated_at)
  values(v_uid,v_branch_id,v_status,case when p_available then now() else null end,now())
  on conflict(user_id) do update
    set branch_id=excluded.branch_id,
        availability=excluded.availability,
        online_since=case when excluded.availability='available' and private.delivery_driver_status_v1.availability<>'available' then now()
                          when excluded.availability='offline' then null
                          else private.delivery_driver_status_v1.online_since end,
        updated_at=now();

  return jsonb_build_object('ok',true,'availability',v_status,'branch_id',v_branch_id);
end;
$function$;

revoke all on function public.get_my_delivery_shift_v1() from public, anon;
revoke all on function public.start_my_delivery_shift_v1() from public, anon;
revoke all on function public.end_my_delivery_shift_v1() from public, anon;
revoke all on function public.set_my_delivery_availability_v1(boolean) from public, anon;
grant execute on function public.get_my_delivery_shift_v1() to authenticated, service_role;
grant execute on function public.start_my_delivery_shift_v1() to authenticated, service_role;
grant execute on function public.end_my_delivery_shift_v1() to authenticated, service_role;
grant execute on function public.set_my_delivery_availability_v1(boolean) to authenticated, service_role;
