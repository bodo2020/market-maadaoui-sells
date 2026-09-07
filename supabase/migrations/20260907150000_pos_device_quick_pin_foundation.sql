insert into public.staff_permissions(code,name_ar,module,description)
values
  ('pos.manage_devices','إدارة أجهزة نقطة البيع','pos','تسجيل وإيقاف أجهزة نقطة البيع داخل الفرع'),
  ('pos.manage_pins','إدارة PIN نقطة البيع','pos','إعادة تعيين PIN لموظفي نقطة البيع')
on conflict (code) do update set name_ar=excluded.name_ar,module=excluded.module,description=excluded.description;

insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id
from public.staff_roles r
join public.staff_permissions p on p.code in ('pos.manage_devices','pos.manage_pins')
where r.code in ('super_admin','branch_admin','branch_manager')
on conflict do nothing;

create table if not exists public.pos_devices (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete restrict,
  device_code text not null unique,
  name text not null check (length(trim(name)) between 2 and 100),
  device_token_hash text not null unique,
  active boolean not null default true,
  registered_by uuid references public.users(id) on delete set null,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists pos_devices_branch_active_idx on public.pos_devices(branch_id,active);
alter table public.pos_devices enable row level security;
revoke all on public.pos_devices from public,anon,authenticated;

create table if not exists public.staff_pos_pins (
  user_id uuid not null references public.users(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,branch_id)
);
alter table public.staff_pos_pins drop constraint if exists staff_pos_pins_user_id_branch_id_fkey;
alter table public.staff_pos_pins enable row level security;
revoke all on public.staff_pos_pins from public,anon,authenticated;

create or replace function public.register_pos_device(p_branch_id uuid,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_token text; v_code text; v_device public.pos_devices%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not public.staff_has_permission('pos.manage_devices',p_branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  if not exists(select 1 from public.branches b where b.id=p_branch_id and b.active) then raise exception using errcode='22023',message='BRANCH_UNAVAILABLE'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 100 then raise exception using errcode='22023',message='INVALID_DEVICE_NAME'; end if;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  loop
    v_code:='POS-'||upper(substr(replace(extensions.gen_random_uuid()::text,'-',''),1,8));
    exit when not exists(select 1 from public.pos_devices d where d.device_code=v_code);
  end loop;
  insert into public.pos_devices(branch_id,device_code,name,device_token_hash,registered_by)
  values(p_branch_id,v_code,trim(p_name),encode(extensions.digest(v_token,'sha256'),'hex'),auth.uid()) returning * into v_device;
  return jsonb_build_object('device_id',v_device.id,'device_code',v_device.device_code,'device_name',v_device.name,'branch_id',v_device.branch_id,'device_token',v_token,'registered_at',v_device.registered_at);
end $$;
revoke all on function public.register_pos_device(uuid,text) from public,anon;
grant execute on function public.register_pos_device(uuid,text) to authenticated;

create or replace function public.list_pos_devices(p_branch_id uuid)
returns table(device_id uuid,device_code text,device_name text,active boolean,registered_at timestamptz,last_seen_at timestamptz)
language plpgsql security definer set search_path='' stable as $$
begin
  if auth.uid() is null or not public.staff_has_permission('pos.manage_devices',p_branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  return query select d.id,d.device_code,d.name,d.active,d.registered_at,d.last_seen_at from public.pos_devices d where d.branch_id=p_branch_id order by d.registered_at desc;
end $$;
revoke all on function public.list_pos_devices(uuid) from public,anon;
grant execute on function public.list_pos_devices(uuid) to authenticated;

create or replace function public.revoke_pos_device(p_device_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_branch uuid;
begin
  select branch_id into v_branch from public.pos_devices where id=p_device_id;
  if v_branch is null then raise exception using errcode='22023',message='DEVICE_NOT_FOUND'; end if;
  if auth.uid() is null or not public.staff_has_permission('pos.manage_devices',v_branch) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  update public.pos_devices set active=false,revoked_at=now(),revoked_by=auth.uid(),updated_at=now() where id=p_device_id;
end $$;
revoke all on function public.revoke_pos_device(uuid) from public,anon;
grant execute on function public.revoke_pos_device(uuid) to authenticated;

create or replace function public.set_my_pos_pin(p_branch_id uuid,p_pin text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception using errcode='22023',message='INVALID_PIN'; end if;
  if not public.staff_has_permission('pos.use',p_branch_id) then raise exception using errcode='42501',message='POS_NOT_ALLOWED'; end if;
  if not exists(select 1 from public.user_branch_roles ubr where ubr.user_id=auth.uid() and ubr.branch_id=p_branch_id and ubr.active and ubr.pos_enabled) and not public.is_super_admin() then raise exception using errcode='42501',message='POS_NOT_ALLOWED'; end if;
  insert into public.staff_pos_pins(user_id,branch_id,pin_hash,failed_attempts,locked_until,updated_at)
  values(auth.uid(),p_branch_id,extensions.crypt(p_pin,extensions.gen_salt('bf',10)),0,null,now())
  on conflict(user_id,branch_id) do update set pin_hash=excluded.pin_hash,failed_attempts=0,locked_until=null,updated_at=now();
end $$;
revoke all on function public.set_my_pos_pin(uuid,text) from public,anon;
grant execute on function public.set_my_pos_pin(uuid,text) to authenticated;

create or replace function public.reset_staff_pos_pin(p_user_id uuid,p_branch_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.staff_has_permission('pos.manage_pins',p_branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  delete from public.staff_pos_pins where user_id=p_user_id and branch_id=p_branch_id;
end $$;
revoke all on function public.reset_staff_pos_pin(uuid,uuid) from public,anon;
grant execute on function public.reset_staff_pos_pin(uuid,uuid) to authenticated;

create or replace function public.has_my_pos_pin(p_branch_id uuid)
returns boolean language sql security definer set search_path='' stable as $$
  select auth.uid() is not null and exists(select 1 from public.staff_pos_pins p where p.user_id=auth.uid() and p.branch_id=p_branch_id);
$$;
revoke all on function public.has_my_pos_pin(uuid) from public,anon;
grant execute on function public.has_my_pos_pin(uuid) to authenticated;

create or replace function public.verify_pos_quick_login(p_device_id uuid,p_device_token text,p_user_id uuid,p_pin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device public.pos_devices%rowtype; v_pin public.staff_pos_pins%rowtype; v_user public.users%rowtype; v_role_name text; v_attempts integer;
begin
  select * into v_device from public.pos_devices where id=p_device_id for update;
  if v_device.id is null or not v_device.active then return jsonb_build_object('ok',false,'error','AUTH_FAILED'); end if;
  if encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex') is distinct from v_device.device_token_hash then return jsonb_build_object('ok',false,'error','AUTH_FAILED'); end if;
  if not exists(select 1 from public.branches b where b.id=v_device.branch_id and b.active) then return jsonb_build_object('ok',false,'error','AUTH_FAILED'); end if;
  select * into v_user from public.users where id=p_user_id and coalesce(active,true);
  if v_user.id is null then return jsonb_build_object('ok',false,'error','INVALID_PIN'); end if;
  if not exists(select 1 from public.user_branch_roles ubr join public.staff_roles r on r.id=ubr.role_id and r.active join public.staff_role_permissions rp on rp.role_id=r.id join public.staff_permissions sp on sp.id=rp.permission_id and sp.code='pos.use' where ubr.user_id=p_user_id and ubr.branch_id=v_device.branch_id and ubr.active and ubr.pos_enabled)
     and not exists(select 1 from public.users u join public.staff_roles sr on sr.id=u.system_role_id where u.id=p_user_id and sr.code='super_admin' and sr.active) then return jsonb_build_object('ok',false,'error','POS_NOT_ALLOWED'); end if;
  select * into v_pin from public.staff_pos_pins where user_id=p_user_id and branch_id=v_device.branch_id for update;
  if v_pin.user_id is null then return jsonb_build_object('ok',false,'error','PIN_NOT_CONFIGURED'); end if;
  if v_pin.locked_until is not null and v_pin.locked_until>now() then return jsonb_build_object('ok',false,'error','PIN_LOCKED','locked_until',v_pin.locked_until); end if;
  if extensions.crypt(coalesce(p_pin,''),v_pin.pin_hash) is distinct from v_pin.pin_hash then
    v_attempts:=v_pin.failed_attempts+1;
    update public.staff_pos_pins set failed_attempts=v_attempts,locked_until=case when v_attempts>=5 then now()+interval '10 minutes' else null end,updated_at=now() where user_id=p_user_id and branch_id=v_device.branch_id;
    return jsonb_build_object('ok',false,'error',case when v_attempts>=5 then 'PIN_LOCKED' else 'INVALID_PIN' end,'remaining_attempts',greatest(0,5-v_attempts));
  end if;
  update public.staff_pos_pins set failed_attempts=0,locked_until=null,updated_at=now() where user_id=p_user_id and branch_id=v_device.branch_id;
  update public.pos_devices set last_seen_at=now(),updated_at=now() where id=v_device.id;
  select coalesce(r.name_ar,'موظف') into v_role_name from public.user_branch_roles ubr left join public.staff_roles r on r.id=ubr.role_id where ubr.user_id=p_user_id and ubr.branch_id=v_device.branch_id;
  return jsonb_build_object('ok',true,'user_id',v_user.id,'username',v_user.username,'name',v_user.name,'branch_id',v_device.branch_id,'device_id',v_device.id,'device_code',v_device.device_code,'role_name_ar',coalesce(v_role_name,'مدير النظام'));
end $$;
revoke all on function public.verify_pos_quick_login(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.verify_pos_quick_login(uuid,text,uuid,text) to service_role;

create or replace function public.list_pos_quick_staff(p_device_id uuid,p_device_token text)
returns table(user_id uuid,name text,role_name_ar text)
language plpgsql security definer set search_path='' stable as $$
declare v_device public.pos_devices%rowtype;
begin
  select * into v_device from public.pos_devices where id=p_device_id;
  if v_device.id is null or not v_device.active or encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex') is distinct from v_device.device_token_hash or not exists(select 1 from public.branches b where b.id=v_device.branch_id and b.active) then return; end if;
  return query
  select u.id,u.name,coalesce(r.name_ar,'موظف')
  from public.staff_pos_pins p
  join public.users u on u.id=p.user_id and coalesce(u.active,true)
  left join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=v_device.branch_id and ubr.active and ubr.pos_enabled
  left join public.staff_roles r on r.id=ubr.role_id
  where p.branch_id=v_device.branch_id and (
    exists(select 1 from public.user_branch_roles x join public.staff_roles xr on xr.id=x.role_id and xr.active join public.staff_role_permissions rp on rp.role_id=xr.id join public.staff_permissions sp on sp.id=rp.permission_id and sp.code='pos.use' where x.user_id=u.id and x.branch_id=v_device.branch_id and x.active and x.pos_enabled)
    or exists(select 1 from public.staff_roles sr where sr.id=u.system_role_id and sr.code='super_admin' and sr.active)
  ) order by u.name;
end $$;
revoke all on function public.list_pos_quick_staff(uuid,text) from public,anon,authenticated;
grant execute on function public.list_pos_quick_staff(uuid,text) to service_role;
