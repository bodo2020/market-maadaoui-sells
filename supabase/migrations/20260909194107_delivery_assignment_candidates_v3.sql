create or replace function public.get_delivery_assignment_workspace_v1(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_order public.online_orders%rowtype;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_order from public.online_orders where id=p_order_id;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.branch_id is null then raise exception 'order_branch_required'; end if;
  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('delivery.manage',v_order.branch_id)
     and not public.staff_has_permission('online_orders.manage',v_order.branch_id) then
    raise exception 'permission_denied';
  end if;

  select jsonb_build_object(
    'order_id',v_order.id,
    'branch_id',v_order.branch_id,
    'order_status',v_order.status::text,
    'tracking_number',coalesce((
      select a.tracking_number from private.delivery_order_assignments_v1 a
      where a.order_id=v_order.id and a.unassigned_at is null
      order by a.assigned_at desc limit 1
    ),v_order.tracking_number),
    'legacy_delivery_person',v_order.delivery_person,
    'current',(
      select jsonb_build_object(
        'assignment_id',a.id,'delivery_user_id',a.delivery_user_id,'name',u.name,'assigned_at',a.assigned_at,'tracking_number',a.tracking_number
      )
      from private.delivery_order_assignments_v1 a
      join public.users u on u.id=a.delivery_user_id
      where a.order_id=v_order.id and a.unassigned_at is null
      order by a.assigned_at desc limit 1
    ),
    'candidates',coalesce((
      select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'role',u.role) order by u.name)
      from public.users u
      where coalesce(u.active,true)
        and u.role='delivery'
        and (
          exists(select 1 from public.user_branch_roles ubr where ubr.user_id=u.id and ubr.branch_id=v_order.branch_id and ubr.active)
          or exists(select 1 from private.hr_employee_profiles ep where ep.user_id=u.id and ep.primary_branch_id=v_order.branch_id and coalesce(ep.employment_status,'active')<>'terminated')
        )
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;

create or replace function public.set_delivery_order_assignment_v1(
  p_order_id uuid,
  p_delivery_user_id uuid,
  p_tracking_number text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_order public.online_orders%rowtype;
  v_current private.delivery_order_assignments_v1%rowtype;
  v_driver public.users%rowtype;
  v_assignment private.delivery_order_assignments_v1%rowtype;
  v_tracking text:=nullif(trim(coalesce(p_tracking_number,'')),'');
begin
  if v_uid is null then raise exception 'authentication_required'; end if;
  select * into v_order from public.online_orders where id=p_order_id for update;
  if v_order.id is null then raise exception 'order_not_found'; end if;
  if v_order.branch_id is null then raise exception 'order_branch_required'; end if;
  if v_order.status::text in ('delivered','cancelled') then raise exception 'terminal_order_assignment_denied'; end if;
  if not private.staff_is_super_admin(v_uid)
     and not public.staff_has_permission('delivery.manage',v_order.branch_id)
     and not public.staff_has_permission('online_orders.manage',v_order.branch_id) then
    raise exception 'permission_denied';
  end if;

  select * into v_current
  from private.delivery_order_assignments_v1
  where order_id=p_order_id and unassigned_at is null
  order by assigned_at desc limit 1
  for update;

  if p_delivery_user_id is null then
    if v_current.id is not null then
      update private.delivery_order_assignments_v1
         set unassigned_at=now(),unassigned_by=v_uid,unassign_reason=nullif(trim(coalesce(p_reason,'')),'')
       where id=v_current.id;
    end if;
    update public.online_orders set delivery_person=null,updated_at=now() where id=p_order_id;
    return jsonb_build_object('order_id',p_order_id,'delivery_user_id',null,'tracking_number',v_tracking,'unassigned',true,'idempotent',v_current.id is null);
  end if;

  select * into v_driver from public.users where id=p_delivery_user_id and coalesce(active,true);
  if v_driver.id is null then raise exception 'delivery_user_not_found'; end if;
  if v_driver.role<>'delivery' then raise exception 'delivery_user_not_eligible'; end if;
  if not (
    exists(select 1 from public.user_branch_roles ubr where ubr.user_id=v_driver.id and ubr.branch_id=v_order.branch_id and ubr.active)
    or exists(select 1 from private.hr_employee_profiles ep where ep.user_id=v_driver.id and ep.primary_branch_id=v_order.branch_id and coalesce(ep.employment_status,'active')<>'terminated')
  ) then raise exception 'delivery_user_out_of_branch'; end if;

  if v_current.id is not null and v_current.delivery_user_id=p_delivery_user_id then
    update private.delivery_order_assignments_v1 set tracking_number=v_tracking where id=v_current.id returning * into v_current;
    update public.online_orders set delivery_person=v_driver.name,updated_at=now() where id=p_order_id;
    return jsonb_build_object('order_id',p_order_id,'assignment_id',v_current.id,'delivery_user_id',v_driver.id,'delivery_name',v_driver.name,'tracking_number',v_tracking,'idempotent',true);
  end if;

  if v_current.id is not null then
    update private.delivery_order_assignments_v1
       set unassigned_at=now(),unassigned_by=v_uid,unassign_reason=coalesce(nullif(trim(coalesce(p_reason,'')),''),'reassigned')
     where id=v_current.id;
  end if;

  insert into private.delivery_order_assignments_v1(order_id,branch_id,delivery_user_id,assigned_by,tracking_number,metadata)
  values(p_order_id,v_order.branch_id,v_driver.id,v_uid,v_tracking,jsonb_build_object('order_status_at_assignment',v_order.status::text))
  returning * into v_assignment;

  update public.online_orders set delivery_person=v_driver.name,updated_at=now() where id=p_order_id;

  return jsonb_build_object('order_id',p_order_id,'assignment_id',v_assignment.id,'delivery_user_id',v_driver.id,'delivery_name',v_driver.name,'tracking_number',v_tracking,'idempotent',false);
end;
$function$;

revoke all on function public.get_delivery_assignment_workspace_v1(uuid) from public,anon;
grant execute on function public.get_delivery_assignment_workspace_v1(uuid) to authenticated,service_role;
revoke all on function public.set_delivery_order_assignment_v1(uuid,uuid,text,text) from public,anon;
grant execute on function public.set_delivery_order_assignment_v1(uuid,uuid,text,text) to authenticated,service_role;
