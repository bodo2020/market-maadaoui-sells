alter table public.customer_interactions drop constraint if exists customer_interactions_created_by_fkey;
alter table public.customer_interactions drop constraint if exists customer_interactions_assigned_to_fkey;
alter table public.customer_interactions drop constraint if exists customer_interactions_completed_by_fkey;
alter table public.customer_interactions
  add constraint customer_interactions_created_by_fkey foreign key (created_by) references public.users(id) on delete set null,
  add constraint customer_interactions_assigned_to_fkey foreign key (assigned_to) references public.users(id) on delete set null,
  add constraint customer_interactions_completed_by_fkey foreign key (completed_by) references public.users(id) on delete set null;

alter table public.customer_admin_audit drop constraint if exists customer_admin_audit_created_by_fkey;
alter table public.customer_admin_audit
  add constraint customer_admin_audit_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;

alter table public.customer_tags drop constraint if exists customer_tags_created_by_fkey;
alter table public.customer_tags
  add constraint customer_tags_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;

alter table public.customer_tag_assignments drop constraint if exists customer_tag_assignments_assigned_by_fkey;
alter table public.customer_tag_assignments
  add constraint customer_tag_assignments_assigned_by_fkey foreign key (assigned_by) references public.users(id) on delete set null;

alter table public.customer_opportunity_queue_actions drop constraint if exists customer_opportunity_queue_actions_created_by_fkey;
alter table public.customer_opportunity_queue_actions
  add constraint customer_opportunity_queue_actions_created_by_fkey foreign key (created_by) references public.users(id) on delete set null;

create or replace function public.get_customer_followup_assignees(p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_super boolean;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.manage',p_branch_id)) then
    raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED';
  end if;

  if p_branch_id is null then
    select coalesce(jsonb_agg(to_jsonb(q) order by q.overdue_count asc,q.pending_count asc,q.name),'[]'::jsonb)
    into v_result
    from (
      select u.id,u.name,u.phone,u.role,
        count(i.id) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp'))::bigint pending_count,
        count(i.id) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.scheduled_at<now())::bigint overdue_count,
        min(i.scheduled_at) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp')) next_due_at
      from public.users u
      left join public.customer_interactions i on i.assigned_to=u.id
      where coalesce(u.active,true)
        and (
          private.staff_is_super_admin(u.id)
          or exists(
            select 1 from public.user_branch_roles ubr
            join public.staff_role_permissions srp on srp.role_id=ubr.role_id
            join public.staff_permissions sp on sp.id=srp.permission_id and sp.code='customers.manage'
            where ubr.user_id=u.id and ubr.active
          )
        )
      group by u.id,u.name,u.phone,u.role
    ) q;
  else
    select coalesce(jsonb_agg(to_jsonb(q) order by q.overdue_count asc,q.pending_count asc,q.name),'[]'::jsonb)
    into v_result
    from (
      select u.id,u.name,u.phone,
        coalesce(sr.name_ar,ubr.role,u.role) role,
        count(i.id) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.branch_id=p_branch_id)::bigint pending_count,
        count(i.id) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.branch_id=p_branch_id and i.scheduled_at<now())::bigint overdue_count,
        min(i.scheduled_at) filter(where i.status='pending' and i.type in ('call','email','meeting','whatsapp') and i.branch_id=p_branch_id) next_due_at
      from public.users u
      join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
      left join public.staff_roles sr on sr.id=ubr.role_id
      left join public.customer_interactions i on i.assigned_to=u.id
      where coalesce(u.active,true)
        and (
          private.staff_is_super_admin(u.id)
          or exists(
            select 1 from public.staff_role_permissions srp
            join public.staff_permissions sp on sp.id=srp.permission_id and sp.code='customers.manage'
            where srp.role_id=ubr.role_id
          )
        )
      group by u.id,u.name,u.phone,coalesce(sr.name_ar,ubr.role,u.role)
    ) q;
  end if;
  return v_result;
end $$;
revoke all on function public.get_customer_followup_assignees(uuid) from public,anon;
grant execute on function public.get_customer_followup_assignees(uuid) to authenticated;

create or replace function public.create_customer_followup(
  p_customer_id uuid,
  p_type text,
  p_subject text,
  p_description text default null,
  p_scheduled_at timestamptz default null,
  p_priority text default 'medium',
  p_assigned_to uuid default null,
  p_branch_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_super boolean;
  v_id uuid;
  v_subject text:=btrim(coalesce(p_subject,''));
  v_desc text:=nullif(btrim(coalesce(p_description,'')),'');
  v_assignee uuid:=coalesce(p_assigned_to,auth.uid());
  v_assignee_allowed boolean:=false;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.manage',p_branch_id)) then raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id) then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
  if p_type not in ('call','email','meeting','whatsapp') then raise exception using errcode='22023',message='INVALID_FOLLOWUP_TYPE'; end if;
  if length(v_subject)<2 or length(v_subject)>120 then raise exception using errcode='22023',message='INVALID_FOLLOWUP_SUBJECT'; end if;
  if p_priority not in ('low','medium','high') then raise exception using errcode='22023',message='INVALID_PRIORITY'; end if;
  if p_scheduled_at is null then raise exception using errcode='22023',message='FOLLOWUP_SCHEDULE_REQUIRED'; end if;

  if p_branch_id is null then
    v_assignee_allowed:=private.staff_is_super_admin(v_assignee);
  else
    v_assignee_allowed:=private.staff_is_super_admin(v_assignee) or exists(
      select 1 from public.users u
      join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
      join public.staff_role_permissions srp on srp.role_id=ubr.role_id
      join public.staff_permissions sp on sp.id=srp.permission_id and sp.code='customers.manage'
      where u.id=v_assignee and coalesce(u.active,true)
    );
  end if;
  if not v_assignee_allowed then raise exception using errcode='42501',message='FOLLOWUP_ASSIGNEE_OUT_OF_SCOPE'; end if;

  insert into public.customer_interactions(customer_id,type,subject,description,status,priority,scheduled_at,created_by,branch_id,assigned_to)
  values(p_customer_id,p_type,v_subject,v_desc,'pending',p_priority,p_scheduled_at,auth.uid(),p_branch_id,v_assignee)
  returning id into v_id;
  insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata)
  values(p_customer_id,'followup_created',p_branch_id,auth.uid(),jsonb_build_object('interaction_id',v_id,'type',p_type,'subject',v_subject,'scheduled_at',p_scheduled_at,'priority',p_priority,'assigned_to',v_assignee));
  return jsonb_build_object('id',v_id,'workspace',public.get_customer_management_workspace(p_customer_id,p_branch_id));
end $$;
revoke all on function public.create_customer_followup(uuid,text,text,text,timestamptz,text,uuid,uuid) from public,anon;
grant execute on function public.create_customer_followup(uuid,text,text,text,timestamptz,text,uuid,uuid) to authenticated;

drop function if exists public.reassign_customer_followup(uuid,uuid,uuid);
create function public.reassign_customer_followup(p_interaction_id uuid,p_assigned_to uuid,p_branch_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_super boolean;
  v_customer_id uuid;
  v_status text;
  v_interaction_branch uuid;
  v_old_assignee uuid;
  v_target_branch uuid;
  v_allowed boolean:=false;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.manage',p_branch_id)) then raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED'; end if;
  if p_assigned_to is null then raise exception using errcode='22023',message='FOLLOWUP_ASSIGNEE_REQUIRED'; end if;
  select customer_id,status,branch_id,assigned_to into v_customer_id,v_status,v_interaction_branch,v_old_assignee
  from public.customer_interactions where id=p_interaction_id and type in ('call','email','meeting','whatsapp') for update;
  if v_customer_id is null then raise exception using errcode='22023',message='FOLLOWUP_NOT_FOUND'; end if;
  if v_status<>'pending' then raise exception using errcode='22023',message='FOLLOWUP_ALREADY_CLOSED'; end if;
  if not v_super and v_interaction_branch is distinct from p_branch_id then raise exception using errcode='42501',message='FOLLOWUP_BRANCH_SCOPE_DENIED'; end if;
  v_target_branch:=coalesce(v_interaction_branch,p_branch_id);
  if v_target_branch is null then
    v_allowed:=private.staff_is_super_admin(p_assigned_to);
  else
    v_allowed:=private.staff_is_super_admin(p_assigned_to) or exists(
      select 1 from public.users u
      join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=v_target_branch and ubr.active
      join public.staff_role_permissions srp on srp.role_id=ubr.role_id
      join public.staff_permissions sp on sp.id=srp.permission_id and sp.code='customers.manage'
      where u.id=p_assigned_to and coalesce(u.active,true)
    );
  end if;
  if not v_allowed then raise exception using errcode='42501',message='FOLLOWUP_ASSIGNEE_OUT_OF_SCOPE'; end if;
  update public.customer_interactions set assigned_to=p_assigned_to,updated_at=now() where id=p_interaction_id;
  insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata)
  values(v_customer_id,'followup_reassigned',v_target_branch,auth.uid(),jsonb_build_object('interaction_id',p_interaction_id,'from',v_old_assignee,'to',p_assigned_to));
  return public.get_customer_management_workspace(v_customer_id,p_branch_id);
end $$;
revoke all on function public.reassign_customer_followup(uuid,uuid,uuid) from public,anon;
grant execute on function public.reassign_customer_followup(uuid,uuid,uuid) to authenticated;
