create or replace function public.get_pos_runtime_status(p_device_id uuid, p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
    v_balance := private.cash_account_balance(v_shift.drawer_account_id);
  end if;

  update public.pos_devices
  set last_seen_at=now(), updated_at=now()
  where id=v_device.id;

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
$function$;
