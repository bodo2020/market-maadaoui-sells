alter table public.pos_devices
  add column if not exists auto_lock_minutes integer not null default 10,
  add column if not exists cash_warning_threshold numeric null;

alter table public.pos_devices drop constraint if exists pos_devices_auto_lock_minutes_check;
alter table public.pos_devices add constraint pos_devices_auto_lock_minutes_check check (auto_lock_minutes between 1 and 120);

alter table public.pos_devices drop constraint if exists pos_devices_cash_warning_threshold_check;
alter table public.pos_devices add constraint pos_devices_cash_warning_threshold_check check (cash_warning_threshold is null or cash_warning_threshold >= 0);

create or replace function public.update_pos_device_runtime_settings(
  p_device_id uuid,
  p_auto_lock_minutes integer,
  p_cash_warning_threshold numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_device public.pos_devices%rowtype;
begin
  select * into v_device from public.pos_devices where id=p_device_id;
  if v_device.id is null then
    raise exception using errcode='22023',message='DEVICE_NOT_FOUND';
  end if;
  if not public.staff_has_permission('pos.manage_devices',v_device.branch_id) then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  if p_auto_lock_minutes is null or p_auto_lock_minutes not between 1 and 120 then
    raise exception using errcode='22023',message='INVALID_AUTO_LOCK_MINUTES';
  end if;
  if p_cash_warning_threshold is not null and p_cash_warning_threshold < 0 then
    raise exception using errcode='22023',message='INVALID_CASH_WARNING_THRESHOLD';
  end if;

  update public.pos_devices
  set auto_lock_minutes=p_auto_lock_minutes,
      cash_warning_threshold=p_cash_warning_threshold,
      updated_at=now()
  where id=p_device_id
  returning * into v_device;

  return jsonb_build_object(
    'device_id',v_device.id,
    'auto_lock_minutes',v_device.auto_lock_minutes,
    'cash_warning_threshold',v_device.cash_warning_threshold
  );
end;
$$;

grant execute on function public.update_pos_device_runtime_settings(uuid,integer,numeric) to authenticated;

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
  cash_warning_threshold numeric
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
    select d.id,d.device_code,d.name,d.active,d.registered_at,d.last_seen_at,d.auto_lock_minutes,d.cash_warning_threshold
    from public.pos_devices d
    where d.branch_id=p_branch_id
    order by d.registered_at desc;
end;
$$;

grant execute on function public.list_pos_devices(uuid) to authenticated;

create or replace function public.get_pos_runtime_status(p_device_id uuid, p_device_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_device public.pos_devices%rowtype;
  v_shift public.pos_shifts%rowtype;
  v_balance numeric := 0;
begin
  if v_uid is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;

  v_device := private.pos_device_for_user(p_device_id,p_device_token,v_uid);

  select * into v_shift
  from public.pos_shifts s
  where s.user_id=v_uid
    and s.branch_id=v_device.branch_id
    and s.device_id=v_device.id
    and s.status='open'
  order by s.opened_at desc
  limit 1;

  if v_shift.id is null then
    return jsonb_build_object(
      'ready',false,
      'code','SHIFT_NOT_OPEN',
      'branch_id',v_device.branch_id,
      'device_id',v_device.id,
      'auto_lock_minutes',v_device.auto_lock_minutes,
      'cash_warning_threshold',v_device.cash_warning_threshold
    );
  end if;

  if v_shift.drawer_account_id is not null then
    select coalesce(sum(case when l.direction='in' then l.amount else -l.amount end),0)
      into v_balance
    from public.cash_ledger l
    where l.account_id=v_shift.drawer_account_id;
  end if;

  update public.pos_devices set last_seen_at=now(),updated_at=now() where id=v_device.id;

  return jsonb_build_object(
    'ready',true,
    'code','READY',
    'branch_id',v_device.branch_id,
    'device_id',v_device.id,
    'device_name',v_device.name,
    'shift_id',v_shift.id,
    'opened_at',v_shift.opened_at,
    'drawer_balance',round(coalesce(v_balance,0),2),
    'auto_lock_minutes',v_device.auto_lock_minutes,
    'cash_warning_threshold',v_device.cash_warning_threshold,
    'checked_at',now()
  );
end;
$$;

grant execute on function public.get_pos_runtime_status(uuid,text) to authenticated;
