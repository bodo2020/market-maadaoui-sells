-- POS staff access and manager-managed PIN controls

create or replace function public.get_branch_pos_staff_status(p_branch_id uuid)
returns table(user_id uuid,name text,username text,role_code text,role_name_ar text,active boolean,pos_enabled boolean,has_pin boolean)
language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null or not (public.staff_has_permission('branch.manage_staff',p_branch_id) or public.staff_has_permission('pos.manage_pins',p_branch_id)) then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  return query
  select u.id,u.name,u.username,coalesce(r.code,ubr.role,'employee'),coalesce(r.name_ar,'موظف'),coalesce(ubr.active,true),coalesce(ubr.pos_enabled,false),exists(select 1 from public.staff_pos_pins p where p.user_id=u.id and p.branch_id=ubr.branch_id)
  from public.user_branch_roles ubr
  join public.users u on u.id=ubr.user_id
  left join public.staff_roles r on r.id=ubr.role_id
  where ubr.branch_id=p_branch_id and coalesce(u.active,true)
  order by u.name;
end;
$$;

create or replace function public.set_staff_pos_access(p_user_id uuid,p_branch_id uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.staff_has_permission('branch.manage_staff',p_branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  if not exists(select 1 from public.user_branch_roles ubr where ubr.user_id=p_user_id and ubr.branch_id=p_branch_id and ubr.active) then raise exception using errcode='22023',message='STAFF_NOT_IN_BRANCH'; end if;
  if p_enabled and not exists(select 1 from public.user_branch_roles ubr join public.staff_roles r on r.id=ubr.role_id and r.active join public.staff_role_permissions rp on rp.role_id=r.id join public.staff_permissions sp on sp.id=rp.permission_id and sp.code='pos.use' where ubr.user_id=p_user_id and ubr.branch_id=p_branch_id and ubr.active) then raise exception using errcode='22023',message='ROLE_NOT_ALLOWED_POS'; end if;
  update public.user_branch_roles set pos_enabled=coalesce(p_enabled,false),updated_at=now() where user_id=p_user_id and branch_id=p_branch_id;
  if not coalesce(p_enabled,false) then delete from public.staff_pos_pins where user_id=p_user_id and branch_id=p_branch_id; end if;
end;
$$;

create or replace function public.set_staff_pos_pin(p_user_id uuid,p_branch_id uuid,p_pin text)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.staff_has_permission('pos.manage_pins',p_branch_id) then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then raise exception using errcode='22023',message='INVALID_PIN'; end if;
  if not exists(select 1 from public.user_branch_roles ubr join public.staff_roles r on r.id=ubr.role_id and r.active join public.staff_role_permissions rp on rp.role_id=r.id join public.staff_permissions sp on sp.id=rp.permission_id and sp.code='pos.use' join public.users u on u.id=ubr.user_id and coalesce(u.active,true) where ubr.user_id=p_user_id and ubr.branch_id=p_branch_id and ubr.active and ubr.pos_enabled) then raise exception using errcode='22023',message='POS_NOT_ALLOWED'; end if;
  insert into public.staff_pos_pins(user_id,branch_id,pin_hash,failed_attempts,locked_until,updated_at)
  values(p_user_id,p_branch_id,extensions.crypt(p_pin,extensions.gen_salt('bf',10)),0,null,now())
  on conflict(user_id,branch_id) do update set pin_hash=excluded.pin_hash,failed_attempts=0,locked_until=null,updated_at=now();
end;
$$;

update public.user_branch_roles ubr set pos_enabled=true,updated_at=now() from public.staff_roles r where ubr.role_id=r.id and r.code='cashier' and ubr.active and not ubr.pos_enabled;

revoke all on function public.get_branch_pos_staff_status(uuid) from public;
revoke all on function public.set_staff_pos_access(uuid,uuid,boolean) from public;
revoke all on function public.set_staff_pos_pin(uuid,uuid,text) from public;
grant execute on function public.get_branch_pos_staff_status(uuid) to authenticated;
grant execute on function public.set_staff_pos_access(uuid,uuid,boolean) to authenticated;
grant execute on function public.set_staff_pos_pin(uuid,uuid,text) to authenticated;
