drop function if exists public.list_pos_devices(uuid);
create function public.list_pos_devices(p_branch_id uuid)
returns table(
  device_id uuid,
  device_code text,
  device_name text,
  active boolean,
  registered_at timestamptz,
  last_seen_at timestamptz,
  auto_lock_minutes integer,
  cash_warning_threshold numeric,
  current_shift_id uuid,
  current_user_id uuid,
  current_employee_name text,
  shift_opened_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not public.staff_has_permission('pos.manage_devices',p_branch_id) then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;

  return query
    select
      d.id,
      d.device_code,
      d.name,
      d.active,
      d.registered_at,
      d.last_seen_at,
      d.auto_lock_minutes,
      d.cash_warning_threshold,
      s.id,
      s.user_id,
      u.name,
      s.opened_at
    from public.pos_devices d
    left join lateral (
      select ps.*
      from public.pos_shifts ps
      where ps.device_id=d.id and ps.status='open'
      order by ps.opened_at desc
      limit 1
    ) s on true
    left join public.users u on u.id=s.user_id
    where d.branch_id=p_branch_id
    order by d.registered_at desc;
end;
$$;

grant execute on function public.list_pos_devices(uuid) to authenticated;
