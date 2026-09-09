create or replace function public.get_hr_shift_scheduler_v1(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_templates jsonb;
  v_assignments jsonb;
  v_employees jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='HR_BRANCH_ACCESS_DENIED'; end if;
  if not (public.staff_has_permission('hr.attendance.view',p_branch_id) or public.staff_has_permission('hr.view',p_branch_id)) then
    raise exception using errcode='42501',message='SHIFT_VIEW_DENIED';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'name_ar',t.name_ar,'start_time',t.start_time,'end_time',t.end_time,
    'break_minutes',t.break_minutes,'late_grace_minutes',t.late_grace_minutes,
    'early_departure_grace_minutes',t.early_departure_grace_minutes,'active',t.active,
    'active_assignments',(select count(*) from private.hr_employee_shift_assignments a where a.shift_template_id=t.id and a.active)
  ) order by t.active desc,t.start_time,t.name_ar),'[]'::jsonb)
  into v_templates
  from private.hr_shift_templates t where t.branch_id=p_branch_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,'employee_id',a.user_id,'employee_name',u.name,'employee_code',ep.employee_code,
    'shift_template_id',a.shift_template_id,'shift_name',t.name_ar,'start_time',t.start_time,'end_time',t.end_time,
    'weekdays',a.weekdays,'effective_from',a.effective_from,'effective_to',a.effective_to,'active',a.active,
    'template_active',t.active
  ) order by a.active desc,u.name,a.effective_from desc),'[]'::jsonb)
  into v_assignments
  from private.hr_employee_shift_assignments a
  join public.users u on u.id=a.user_id
  join private.hr_employee_profiles ep on ep.user_id=a.user_id
  join private.hr_shift_templates t on t.id=a.shift_template_id
  where a.branch_id=p_branch_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'employee_id',u.id,'employee_name',u.name,'employee_code',ep.employee_code,
    'employment_status',ep.employment_status,'work_mode',ep.work_mode,
    'active_assignment_count',(select count(*) from private.hr_employee_shift_assignments a where a.user_id=u.id and a.branch_id=p_branch_id and a.active and (a.effective_to is null or a.effective_to>=current_date))
  ) order by u.name),'[]'::jsonb)
  into v_employees
  from private.hr_employee_profiles ep
  join public.users u on u.id=ep.user_id
  where ep.primary_branch_id=p_branch_id and ep.employment_status in ('active','leave') and coalesce(u.active,true);

  return jsonb_build_object('version',1,'branch_id',p_branch_id,'templates',v_templates,'assignments',v_assignments,'employees',v_employees,'generated_at',now());
end;
$$;

create or replace function public.save_hr_shift_template_v1(
  p_branch_id uuid,
  p_template_id uuid,
  p_name_ar text,
  p_start_time time,
  p_end_time time,
  p_break_minutes integer default 0,
  p_late_grace_minutes integer default 10,
  p_early_departure_grace_minutes integer default 5,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row private.hr_shift_templates%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='HR_BRANCH_ACCESS_DENIED'; end if;
  if not public.staff_has_permission('hr.attendance.manage',p_branch_id) then raise exception using errcode='42501',message='SHIFT_MANAGE_DENIED'; end if;
  if length(trim(coalesce(p_name_ar,'')))<2 then raise exception using errcode='22023',message='SHIFT_NAME_REQUIRED'; end if;
  if p_start_time is null or p_end_time is null or p_start_time=p_end_time then raise exception using errcode='22023',message='SHIFT_TEMPLATE_TIMES_INVALID'; end if;
  if coalesce(p_break_minutes,0) not between 0 and 360 or coalesce(p_late_grace_minutes,0) not between 0 and 180 or coalesce(p_early_departure_grace_minutes,0) not between 0 and 180 then
    raise exception using errcode='22023',message='SHIFT_TEMPLATE_LIMITS_INVALID';
  end if;

  if p_template_id is null then
    begin
      insert into private.hr_shift_templates(branch_id,name_ar,start_time,end_time,break_minutes,late_grace_minutes,early_departure_grace_minutes,active)
      values(p_branch_id,trim(p_name_ar),p_start_time,p_end_time,coalesce(p_break_minutes,0),coalesce(p_late_grace_minutes,10),coalesce(p_early_departure_grace_minutes,5),coalesce(p_active,true))
      returning * into v_row;
    exception when unique_violation then
      raise exception using errcode='23505',message='SHIFT_TEMPLATE_NAME_EXISTS';
    end;
  else
    select * into v_row from private.hr_shift_templates where id=p_template_id for update;
    if v_row.id is null or v_row.branch_id<>p_branch_id then raise exception using errcode='22023',message='SHIFT_TEMPLATE_NOT_FOUND'; end if;
    if coalesce(p_active,true)=false and v_row.active and exists(select 1 from private.hr_employee_shift_assignments a where a.shift_template_id=v_row.id and a.active and (a.effective_to is null or a.effective_to>=current_date)) then
      raise exception using errcode='55000',message='SHIFT_TEMPLATE_IN_USE';
    end if;
    begin
      update private.hr_shift_templates set
        name_ar=trim(p_name_ar),start_time=p_start_time,end_time=p_end_time,
        break_minutes=coalesce(p_break_minutes,0),late_grace_minutes=coalesce(p_late_grace_minutes,10),
        early_departure_grace_minutes=coalesce(p_early_departure_grace_minutes,5),active=coalesce(p_active,true),updated_at=now()
      where id=v_row.id returning * into v_row;
    exception when unique_violation then
      raise exception using errcode='23505',message='SHIFT_TEMPLATE_NAME_EXISTS';
    end;
  end if;

  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data)
  values('shift_template',v_row.id,'save',auth.uid(),p_branch_id,to_jsonb(v_row));
  return jsonb_build_object('ok',true,'template',to_jsonb(v_row));
end;
$$;

create or replace function public.save_hr_shift_assignment_v1(
  p_branch_id uuid,
  p_assignment_id uuid,
  p_employee_id uuid,
  p_shift_template_id uuid,
  p_weekdays smallint[],
  p_effective_from date,
  p_effective_to date default null,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row private.hr_employee_shift_assignments%rowtype;
  v_days smallint[];
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='HR_BRANCH_ACCESS_DENIED'; end if;
  if not public.staff_has_permission('hr.attendance.manage',p_branch_id) then raise exception using errcode='42501',message='SHIFT_MANAGE_DENIED'; end if;
  if not exists(select 1 from private.hr_employee_profiles ep where ep.user_id=p_employee_id and ep.primary_branch_id=p_branch_id and ep.employment_status in ('active','leave')) then
    raise exception using errcode='22023',message='SHIFT_EMPLOYEE_NOT_FOUND';
  end if;
  if not exists(select 1 from private.hr_shift_templates t where t.id=p_shift_template_id and t.branch_id=p_branch_id and t.active) then
    raise exception using errcode='22023',message='SHIFT_TEMPLATE_NOT_FOUND_OR_INACTIVE';
  end if;
  select array_agg(distinct d order by d) into v_days from unnest(coalesce(p_weekdays,'{}'::smallint[])) d where d between 0 and 6;
  if coalesce(array_length(v_days,1),0)=0 then raise exception using errcode='22023',message='SHIFT_WEEKDAYS_REQUIRED'; end if;
  if p_effective_from is null then raise exception using errcode='22023',message='SHIFT_EFFECTIVE_FROM_REQUIRED'; end if;
  if p_effective_to is not null and p_effective_to<p_effective_from then raise exception using errcode='22023',message='SHIFT_EFFECTIVE_RANGE_INVALID'; end if;

  if coalesce(p_active,true) and exists(
    select 1 from private.hr_employee_shift_assignments a
    where a.user_id=p_employee_id and a.branch_id=p_branch_id and a.active
      and (p_assignment_id is null or a.id<>p_assignment_id)
      and a.weekdays && v_days
      and a.effective_from<=coalesce(p_effective_to,'infinity'::date)
      and coalesce(a.effective_to,'infinity'::date)>=p_effective_from
  ) then
    raise exception using errcode='55000',message='SHIFT_ASSIGNMENT_CONFLICT';
  end if;

  if p_assignment_id is null then
    insert into private.hr_employee_shift_assignments(user_id,branch_id,shift_template_id,weekdays,effective_from,effective_to,active)
    values(p_employee_id,p_branch_id,p_shift_template_id,v_days,p_effective_from,p_effective_to,coalesce(p_active,true))
    returning * into v_row;
  else
    select * into v_row from private.hr_employee_shift_assignments where id=p_assignment_id for update;
    if v_row.id is null or v_row.branch_id<>p_branch_id then raise exception using errcode='22023',message='SHIFT_ASSIGNMENT_NOT_FOUND'; end if;
    update private.hr_employee_shift_assignments set
      user_id=p_employee_id,shift_template_id=p_shift_template_id,weekdays=v_days,
      effective_from=p_effective_from,effective_to=p_effective_to,active=coalesce(p_active,true),updated_at=now()
    where id=v_row.id returning * into v_row;
  end if;

  insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data)
  values('shift_assignment',v_row.id,'save',auth.uid(),p_branch_id,to_jsonb(v_row));
  return jsonb_build_object('ok',true,'assignment',to_jsonb(v_row));
end;
$$;

revoke all on function public.get_hr_shift_scheduler_v1(uuid) from public,anon;
revoke all on function public.save_hr_shift_template_v1(uuid,uuid,text,time,time,integer,integer,integer,boolean) from public,anon;
revoke all on function public.save_hr_shift_assignment_v1(uuid,uuid,uuid,uuid,smallint[],date,date,boolean) from public,anon;
grant execute on function public.get_hr_shift_scheduler_v1(uuid) to authenticated;
grant execute on function public.save_hr_shift_template_v1(uuid,uuid,text,time,time,integer,integer,integer,boolean) to authenticated;
grant execute on function public.save_hr_shift_assignment_v1(uuid,uuid,uuid,uuid,smallint[],date,date,boolean) to authenticated;
