create table if not exists public.pos_workspace_backups (
  user_id uuid not null references public.users(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  device_id uuid references public.pos_devices(id) on delete set null,
  tabs jsonb not null default '[]'::jsonb,
  active_tab_id text,
  updated_at timestamptz not null default now(),
  primary key (user_id, branch_id),
  constraint pos_workspace_tabs_array check (jsonb_typeof(tabs)='array')
);

alter table public.pos_workspace_backups enable row level security;

create or replace function public.save_my_pos_workspace(
  p_branch_id uuid,
  p_device_id uuid,
  p_tabs jsonb,
  p_active_tab_id text default null
) returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_size integer;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;
  if p_branch_id is null or not public.staff_has_permission('pos.use', p_branch_id) then
    raise exception using errcode='42501', message='POS_ACCESS_DENIED';
  end if;
  if p_tabs is null or jsonb_typeof(p_tabs) <> 'array' or jsonb_array_length(p_tabs) > 20 then
    raise exception using errcode='22023', message='INVALID_WORKSPACE';
  end if;
  v_size := octet_length(p_tabs::text);
  if v_size > 1048576 then
    raise exception using errcode='22023', message='WORKSPACE_TOO_LARGE';
  end if;
  if p_device_id is not null and not exists (
    select 1 from public.pos_devices d
    where d.id=p_device_id and d.branch_id=p_branch_id and d.active=true and d.revoked_at is null
  ) then
    raise exception using errcode='22023', message='DEVICE_UNAVAILABLE';
  end if;

  insert into public.pos_workspace_backups(user_id, branch_id, device_id, tabs, active_tab_id, updated_at)
  values(auth.uid(), p_branch_id, p_device_id, p_tabs, nullif(btrim(coalesce(p_active_tab_id,'')),''), now())
  on conflict(user_id, branch_id) do update
    set device_id=excluded.device_id,
        tabs=excluded.tabs,
        active_tab_id=excluded.active_tab_id,
        updated_at=excluded.updated_at;
end;
$$;

create or replace function public.get_my_pos_workspace(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_row public.pos_workspace_backups%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;
  if p_branch_id is null or not public.staff_has_permission('pos.use', p_branch_id) then
    raise exception using errcode='42501', message='POS_ACCESS_DENIED';
  end if;
  select * into v_row
  from public.pos_workspace_backups
  where user_id=auth.uid() and branch_id=p_branch_id;
  if v_row.user_id is null then return null; end if;
  return jsonb_build_object(
    'tabs', v_row.tabs,
    'active_tab_id', v_row.active_tab_id,
    'device_id', v_row.device_id,
    'updated_at', v_row.updated_at
  );
end;
$$;

create or replace function public.clear_my_pos_workspace(p_branch_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;
  delete from public.pos_workspace_backups where user_id=auth.uid() and branch_id=p_branch_id;
end;
$$;

grant execute on function public.save_my_pos_workspace(uuid,uuid,jsonb,text) to authenticated;
grant execute on function public.get_my_pos_workspace(uuid) to authenticated;
grant execute on function public.clear_my_pos_workspace(uuid) to authenticated;
