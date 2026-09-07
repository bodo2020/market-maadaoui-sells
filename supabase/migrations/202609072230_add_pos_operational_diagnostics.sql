create table if not exists public.pos_operational_events (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  device_id uuid references public.pos_devices(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  shift_id uuid references public.pos_shifts(id) on delete set null,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','error','critical')),
  message_code text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.users(id) on delete set null
);

create index if not exists pos_operational_events_branch_created_idx
  on public.pos_operational_events(branch_id, created_at desc);
create index if not exists pos_operational_events_device_created_idx
  on public.pos_operational_events(device_id, created_at desc);
create index if not exists pos_operational_events_unresolved_idx
  on public.pos_operational_events(branch_id, severity, created_at desc)
  where resolved_at is null;

alter table public.pos_operational_events enable row level security;
revoke all on public.pos_operational_events from anon;
revoke insert, update, delete on public.pos_operational_events from authenticated;

drop policy if exists pos_events_manager_select on public.pos_operational_events;
create policy pos_events_manager_select
on public.pos_operational_events
for select
to authenticated
using (
  public.staff_has_permission('pos.manage_devices', branch_id)
  or public.staff_has_permission('reports.view', branch_id)
);

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
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_event_type is null or length(trim(p_event_type)) not between 2 and 60 then raise exception using errcode='22023',message='INVALID_EVENT_TYPE'; end if;
  if p_severity not in ('info','warning','error','critical') then raise exception using errcode='22023',message='INVALID_SEVERITY'; end if;

  v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());
  select id into v_shift_id from public.pos_shifts
  where user_id=auth.uid() and branch_id=v_device.branch_id and device_id=v_device.id and status='open'
  order by opened_at desc limit 1;

  v_details := coalesce(p_details,'{}'::jsonb) - 'device_token' - 'token' - 'password' - 'pin' - 'access_token' - 'refresh_token';
  if octet_length(v_details::text) > 4096 then v_details := jsonb_build_object('truncated',true); end if;

  insert into public.pos_operational_events(branch_id,device_id,user_id,shift_id,event_type,severity,message_code,details)
  values(v_device.branch_id,v_device.id,auth.uid(),v_shift_id,trim(p_event_type),p_severity,left(nullif(trim(coalesce(p_message_code,'')),''),120),v_details)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.list_branch_pos_operational_events(
  p_branch_id uuid,
  p_limit integer default 50,
  p_severity text default null
)
returns setof jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or not (
    public.staff_has_permission('pos.manage_devices',p_branch_id)
    or public.staff_has_permission('reports.view',p_branch_id)
  ) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;

  return query
  select jsonb_build_object(
    'id',e.id,'branch_id',e.branch_id,'device_id',e.device_id,'device_name',d.name,'device_code',d.device_code,
    'user_id',e.user_id,'employee_name',u.name,'shift_id',e.shift_id,'event_type',e.event_type,'severity',e.severity,
    'message_code',e.message_code,'details',e.details,'created_at',e.created_at,'resolved_at',e.resolved_at
  )
  from public.pos_operational_events e
  left join public.pos_devices d on d.id=e.device_id
  left join public.users u on u.id=e.user_id
  where e.branch_id=p_branch_id and (p_severity is null or e.severity=p_severity)
  order by e.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
end;
$function$;

grant execute on function public.log_pos_operational_event(uuid,text,text,text,text,jsonb) to authenticated;
grant execute on function public.list_branch_pos_operational_events(uuid,integer,text) to authenticated;
