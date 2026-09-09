create table if not exists private.staff_app_pins (
  user_id uuid primary key references public.users(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_verified_at timestamptz,
  reset_at timestamptz,
  reset_by uuid references public.users(id) on delete set null
);
alter table private.staff_app_pins enable row level security;
revoke all on table private.staff_app_pins from public, anon, authenticated;

create or replace function public.get_my_staff_app_pin_status_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_pin private.staff_app_pins%rowtype;
begin
 if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.users u where u.id=v_uid and coalesce(u.active,true)) then raise exception using errcode='42501',message='STAFF_ACCOUNT_INACTIVE'; end if;
 select * into v_pin from private.staff_app_pins where user_id=v_uid;
 return jsonb_build_object('configured',v_pin.user_id is not null,'locked',v_pin.locked_until is not null and v_pin.locked_until>now(),'locked_until',v_pin.locked_until,'failed_attempts',coalesce(v_pin.failed_attempts,0),'last_verified_at',v_pin.last_verified_at,'updated_at',v_pin.updated_at);
end;$$;

create or replace function public.set_my_staff_app_pin_v1(p_pin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_hash text;
begin
 if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if not exists(select 1 from public.users u where u.id=v_uid and coalesce(u.active,true)) then raise exception using errcode='42501',message='STAFF_ACCOUNT_INACTIVE'; end if;
 if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then raise exception using errcode='22023',message='INVALID_APP_PIN'; end if;
 if exists(select 1 from private.staff_app_pins p where p.user_id=v_uid) then raise exception using errcode='55000',message='APP_PIN_ALREADY_CONFIGURED'; end if;
 v_hash:=extensions.crypt(p_pin,extensions.gen_salt('bf',10));
 insert into private.staff_app_pins(user_id,pin_hash,failed_attempts,locked_until,created_at,updated_at) values(v_uid,v_hash,0,null,now(),now());
 insert into public.staff_pos_pins(user_id,branch_id,pin_hash,failed_attempts,locked_until,created_at,updated_at)
 select v_uid,ubr.branch_id,extensions.crypt(p_pin,extensions.gen_salt('bf',10)),0,null,now(),now() from public.user_branch_roles ubr where ubr.user_id=v_uid and ubr.active and coalesce(ubr.pos_enabled,false)
 on conflict(user_id,branch_id) do update set pin_hash=excluded.pin_hash,failed_attempts=0,locked_until=null,updated_at=now();
 insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,after_data) values('staff_app_pin',v_uid,'created',v_uid,jsonb_build_object('configured',true));
 return jsonb_build_object('ok',true,'configured',true);
end;$$;

create or replace function public.verify_my_staff_app_pin_v1(p_pin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_pin private.staff_app_pins%rowtype; v_attempts integer;
begin
 if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select * into v_pin from private.staff_app_pins where user_id=v_uid for update;
 if v_pin.user_id is null then return jsonb_build_object('ok',false,'error','APP_PIN_NOT_CONFIGURED'); end if;
 if v_pin.locked_until is not null and v_pin.locked_until>now() then return jsonb_build_object('ok',false,'error','APP_PIN_LOCKED','locked_until',v_pin.locked_until); end if;
 if p_pin is null or extensions.crypt(p_pin,v_pin.pin_hash) is distinct from v_pin.pin_hash then
  v_attempts:=v_pin.failed_attempts+1;
  update private.staff_app_pins set failed_attempts=v_attempts,locked_until=case when v_attempts>=5 then now()+interval '10 minutes' else null end,updated_at=now() where user_id=v_uid;
  return jsonb_build_object('ok',false,'error',case when v_attempts>=5 then 'APP_PIN_LOCKED' else 'INVALID_APP_PIN' end,'remaining_attempts',greatest(0,5-v_attempts),'locked_until',case when v_attempts>=5 then now()+interval '10 minutes' else null end);
 end if;
 update private.staff_app_pins set failed_attempts=0,locked_until=null,last_verified_at=now(),updated_at=now() where user_id=v_uid;
 return jsonb_build_object('ok',true,'verified_at',now());
end;$$;

create or replace function public.change_my_staff_app_pin_v1(p_current_pin text,p_new_pin text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_pin private.staff_app_pins%rowtype;
begin
 if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if p_new_pin is null or p_new_pin !~ '^[0-9]{4,6}$' then raise exception using errcode='22023',message='INVALID_APP_PIN'; end if;
 select * into v_pin from private.staff_app_pins where user_id=v_uid for update;
 if v_pin.user_id is null then raise exception using errcode='55000',message='APP_PIN_NOT_CONFIGURED'; end if;
 if v_pin.locked_until is not null and v_pin.locked_until>now() then raise exception using errcode='55000',message='APP_PIN_LOCKED'; end if;
 if extensions.crypt(coalesce(p_current_pin,''),v_pin.pin_hash) is distinct from v_pin.pin_hash then raise exception using errcode='42501',message='CURRENT_APP_PIN_INVALID'; end if;
 update private.staff_app_pins set pin_hash=extensions.crypt(p_new_pin,extensions.gen_salt('bf',10)),failed_attempts=0,locked_until=null,updated_at=now(),reset_at=null,reset_by=null where user_id=v_uid;
 insert into public.staff_pos_pins(user_id,branch_id,pin_hash,failed_attempts,locked_until,created_at,updated_at)
 select v_uid,ubr.branch_id,extensions.crypt(p_new_pin,extensions.gen_salt('bf',10)),0,null,now(),now() from public.user_branch_roles ubr where ubr.user_id=v_uid and ubr.active and coalesce(ubr.pos_enabled,false)
 on conflict(user_id,branch_id) do update set pin_hash=excluded.pin_hash,failed_attempts=0,locked_until=null,updated_at=now();
 insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,after_data) values('staff_app_pin',v_uid,'changed',v_uid,jsonb_build_object('changed',true));
 return jsonb_build_object('ok',true,'changed',true);
end;$$;

create or replace function public.reset_staff_app_pin_v1(p_user_id uuid,p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_allowed boolean:=false;
begin
 if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if private.staff_is_super_admin(v_uid) then v_allowed:=true;
 elsif p_branch_id is not null and public.has_branch_access(v_uid,p_branch_id) and public.staff_has_permission('branch.manage_staff',p_branch_id)
   and exists(select 1 from public.user_branch_roles ubr where ubr.user_id=p_user_id and ubr.branch_id=p_branch_id and ubr.active) then v_allowed:=true; end if;
 if not v_allowed then raise exception using errcode='42501',message='APP_PIN_RESET_DENIED'; end if;
 delete from private.staff_app_pins where user_id=p_user_id;
 delete from public.staff_pos_pins where user_id=p_user_id;
 insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data) values('staff_app_pin',p_user_id,'reset',v_uid,p_branch_id,jsonb_build_object('configured',false));
 return jsonb_build_object('ok',true,'user_id',p_user_id,'configured',false);
end;$$;

revoke all on function public.get_my_staff_app_pin_status_v1() from public,anon;
revoke all on function public.set_my_staff_app_pin_v1(text) from public,anon;
revoke all on function public.verify_my_staff_app_pin_v1(text) from public,anon;
revoke all on function public.change_my_staff_app_pin_v1(text,text) from public,anon;
revoke all on function public.reset_staff_app_pin_v1(uuid,uuid) from public,anon;
grant execute on function public.get_my_staff_app_pin_status_v1() to authenticated;
grant execute on function public.set_my_staff_app_pin_v1(text) to authenticated;
grant execute on function public.verify_my_staff_app_pin_v1(text) to authenticated;
grant execute on function public.change_my_staff_app_pin_v1(text,text) to authenticated;
grant execute on function public.reset_staff_app_pin_v1(uuid,uuid) to authenticated;
