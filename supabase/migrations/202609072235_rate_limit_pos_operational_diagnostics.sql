create or replace function public.log_pos_operational_event(
  p_device_id uuid,
  p_device_token text,
  p_event_type text,
  p_severity text default 'info',
  p_message_code text default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_device public.pos_devices%rowtype;
  v_shift_id uuid;
  v_id uuid;
  v_details jsonb;
  v_recent_count integer;
  v_code text;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_event_type is null or length(trim(p_event_type)) not between 2 and 60 then raise exception using errcode='22023',message='INVALID_EVENT_TYPE'; end if;
  if p_severity not in ('info','warning','error','critical') then raise exception using errcode='22023',message='INVALID_SEVERITY'; end if;

  v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());
  v_code:=left(nullif(trim(coalesce(p_message_code,'')),''),120);

  select id into v_shift_id
  from public.pos_shifts
  where user_id=auth.uid() and branch_id=v_device.branch_id and device_id=v_device.id and status='open'
  order by opened_at desc limit 1;

  select id into v_id
  from public.pos_operational_events
  where device_id=v_device.id
    and user_id=auth.uid()
    and event_type=trim(p_event_type)
    and severity=p_severity
    and message_code is not distinct from v_code
    and created_at > now()-interval '10 seconds'
  order by created_at desc
  limit 1;
  if v_id is not null then return v_id; end if;

  select count(*) into v_recent_count
  from public.pos_operational_events
  where device_id=v_device.id and created_at > now()-interval '1 minute';
  if v_recent_count >= 30 then return null; end if;

  v_details := coalesce(p_details,'{}'::jsonb) - 'device_token' - 'token' - 'password' - 'pin' - 'access_token' - 'refresh_token';
  if jsonb_typeof(v_details) <> 'object' or octet_length(v_details::text) > 4096 then
    v_details := jsonb_build_object('truncated',true);
  end if;

  insert into public.pos_operational_events(branch_id,device_id,user_id,shift_id,event_type,severity,message_code,details)
  values(v_device.branch_id,v_device.id,auth.uid(),v_shift_id,trim(p_event_type),p_severity,v_code,v_details)
  returning id into v_id;
  return v_id;
end;
$function$;

grant execute on function public.log_pos_operational_event(uuid,text,text,text,text,jsonb) to authenticated;
