create table if not exists private.online_order_sla_policies_v1 (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  enabled boolean not null default false,
  first_response_target_minutes integer not null default 30 check(first_response_target_minutes between 1 and 1440),
  preparation_target_minutes integer not null default 60 check(preparation_target_minutes between 1 and 1440),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

create table if not exists private.online_order_sla_policy_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  changed_by uuid not null references public.users(id),
  changed_at timestamptz not null default now(),
  old_policy jsonb,
  new_policy jsonb not null
);
create index if not exists online_order_sla_policy_audit_branch_time_idx on private.online_order_sla_policy_audit_v1(branch_id,changed_at desc);

revoke all on private.online_order_sla_policies_v1 from public,anon,authenticated;
revoke all on private.online_order_sla_policy_audit_v1 from public,anon,authenticated;

create or replace function public.get_online_order_sla_policy_v1(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_row private.online_order_sla_policies_v1%rowtype;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_branch_id is null then raise exception 'branch_required'; end if;
  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('online_orders.manage',p_branch_id)
     and not public.staff_has_permission('branch.manage_staff',p_branch_id) then
    raise exception 'permission_denied';
  end if;
  select * into v_row from private.online_order_sla_policies_v1 where branch_id=p_branch_id;
  if v_row.branch_id is null then
    return jsonb_build_object('branch_id',p_branch_id,'enabled',false,'first_response_target_minutes',30,'preparation_target_minutes',60,'updated_at',null,'updated_by',null);
  end if;
  return jsonb_build_object('branch_id',v_row.branch_id,'enabled',v_row.enabled,'first_response_target_minutes',v_row.first_response_target_minutes,'preparation_target_minutes',v_row.preparation_target_minutes,'updated_at',v_row.updated_at,'updated_by',v_row.updated_by);
end;
$function$;

create or replace function public.set_online_order_sla_policy_v1(
  p_branch_id uuid,
  p_enabled boolean,
  p_first_response_target_minutes integer,
  p_preparation_target_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_old jsonb;
  v_new jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  if p_branch_id is null then raise exception 'branch_required'; end if;
  if p_enabled is null then raise exception 'enabled_required'; end if;
  if p_first_response_target_minutes is null or p_first_response_target_minutes<1 or p_first_response_target_minutes>1440 then raise exception 'invalid_first_response_target'; end if;
  if p_preparation_target_minutes is null or p_preparation_target_minutes<1 or p_preparation_target_minutes>1440 then raise exception 'invalid_preparation_target'; end if;
  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('online_orders.manage',p_branch_id)
     and not public.staff_has_permission('branch.manage_staff',p_branch_id) then
    raise exception 'permission_denied';
  end if;
  if not exists(select 1 from public.branches b where b.id=p_branch_id) then raise exception 'branch_not_found'; end if;

  select to_jsonb(x) into v_old from private.online_order_sla_policies_v1 x where x.branch_id=p_branch_id for update;
  insert into private.online_order_sla_policies_v1(branch_id,enabled,first_response_target_minutes,preparation_target_minutes,updated_at,updated_by)
  values(p_branch_id,p_enabled,p_first_response_target_minutes,p_preparation_target_minutes,now(),v_uid)
  on conflict(branch_id) do update set enabled=excluded.enabled,first_response_target_minutes=excluded.first_response_target_minutes,preparation_target_minutes=excluded.preparation_target_minutes,updated_at=excluded.updated_at,updated_by=excluded.updated_by;

  select to_jsonb(x) into v_new from private.online_order_sla_policies_v1 x where x.branch_id=p_branch_id;
  if v_old is distinct from v_new then
    insert into private.online_order_sla_policy_audit_v1(branch_id,changed_by,old_policy,new_policy)
    values(p_branch_id,v_uid,v_old,v_new);
  end if;
  return v_new;
end;
$function$;

revoke all on function public.get_online_order_sla_policy_v1(uuid) from public,anon;
revoke all on function public.set_online_order_sla_policy_v1(uuid,boolean,integer,integer) from public,anon;
grant execute on function public.get_online_order_sla_policy_v1(uuid) to authenticated,service_role;
grant execute on function public.set_online_order_sla_policy_v1(uuid,boolean,integer,integer) to authenticated,service_role;
