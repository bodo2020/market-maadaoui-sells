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
  v_day_start timestamptz := (timezone('Africa/Cairo', now())::date::timestamp at time zone 'Africa/Cairo');
  v_day_end timestamptz := (timezone('Africa/Cairo', now())::date::timestamp at time zone 'Africa/Cairo') + interval '1 day';
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

  select coalesce(sum(
    extract(epoch from (
      least(coalesce(s.end_time, now()), v_day_end)
      - greatest(s.start_time, v_day_start)
    )) / 60.0
  ),0)
  into v_worked_minutes
  from public.shifts s
  where s.employee_id=v_uid
    and s.start_time < v_day_end
    and coalesce(s.end_time, now()) > v_day_start;

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

revoke all on function public.get_my_delivery_shift_v1() from public, anon;
grant execute on function public.get_my_delivery_shift_v1() to authenticated, service_role;
