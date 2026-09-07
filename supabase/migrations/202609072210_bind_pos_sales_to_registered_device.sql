create or replace function public.create_pos_sale(p_request_id uuid, p_branch_id uuid, p_sale jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_device_id uuid;
  v_device_token text;
  v_device public.pos_devices%rowtype;
  v_shift_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;

  begin
    v_device_id := nullif(p_sale->>'device_id','')::uuid;
  exception when others then
    raise exception using errcode='22023', message='DEVICE_REQUIRED';
  end;
  v_device_token := nullif(p_sale->>'device_token','');

  if v_device_id is null or v_device_token is null then
    raise exception using errcode='22023', message='DEVICE_REQUIRED';
  end if;

  select * into v_device
  from public.pos_devices
  where id=v_device_id;

  if v_device.id is null
     or not coalesce(v_device.active,false)
     or v_device.revoked_at is not null
     or v_device.branch_id is distinct from p_branch_id
     or encode(extensions.digest(v_device_token,'sha256'),'hex') is distinct from v_device.device_token_hash then
    raise exception using errcode='42501', message='DEVICE_UNAVAILABLE';
  end if;

  select s.id into v_shift_id
  from public.pos_shifts s
  where s.user_id=auth.uid()
    and s.branch_id=p_branch_id
    and s.device_id=v_device_id
    and s.status='open'
  order by s.opened_at desc
  limit 1;

  if v_shift_id is null then
    raise exception using errcode='55000', message='POS_DEVICE_SHIFT_MISMATCH';
  end if;

  update public.pos_devices
  set last_seen_at=now(), updated_at=now()
  where id=v_device_id;

  return private.create_pos_sale(
    p_request_id,
    p_branch_id,
    p_sale - 'device_token'
  );
end;
$function$;

grant execute on function public.create_pos_sale(uuid,uuid,jsonb) to authenticated;
