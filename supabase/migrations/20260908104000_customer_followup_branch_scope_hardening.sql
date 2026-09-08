create or replace function public.create_customer_followup(
  p_customer_id uuid,p_type text,p_subject text,p_description text default null,p_scheduled_at timestamptz default null,
  p_priority text default 'medium',p_assigned_to uuid default null,p_branch_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_super boolean; v_id uuid; v_subject text:=btrim(coalesce(p_subject,'')); v_desc text:=nullif(btrim(coalesce(p_description,'')),''); v_assignee uuid:=coalesce(p_assigned_to,auth.uid());
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.manage',p_branch_id)) then raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id) then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
  if p_type not in ('call','email','meeting','whatsapp') then raise exception using errcode='22023',message='INVALID_FOLLOWUP_TYPE'; end if;
  if length(v_subject)<2 or length(v_subject)>120 then raise exception using errcode='22023',message='INVALID_FOLLOWUP_SUBJECT'; end if;
  if p_priority not in ('low','medium','high') then raise exception using errcode='22023',message='INVALID_PRIORITY'; end if;
  if p_scheduled_at is null then raise exception using errcode='22023',message='FOLLOWUP_SCHEDULE_REQUIRED'; end if;
  if not v_super then
    if not exists(select 1 from public.users u join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active where u.id=v_assignee and coalesce(u.active,true)) then raise exception using errcode='42501',message='FOLLOWUP_ASSIGNEE_OUT_OF_SCOPE'; end if;
  elsif p_assigned_to is not null and not exists(select 1 from public.users u where u.id=v_assignee and coalesce(u.active,true)) then
    raise exception using errcode='22023',message='FOLLOWUP_ASSIGNEE_NOT_FOUND';
  end if;
  insert into public.customer_interactions(customer_id,type,subject,description,status,priority,scheduled_at,created_by,branch_id,assigned_to)
  values(p_customer_id,p_type,v_subject,v_desc,'pending',p_priority,p_scheduled_at,auth.uid(),p_branch_id,v_assignee) returning id into v_id;
  insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata)
  values(p_customer_id,'followup_created',p_branch_id,auth.uid(),jsonb_build_object('interaction_id',v_id,'type',p_type,'subject',v_subject,'scheduled_at',p_scheduled_at,'priority',p_priority,'assigned_to',v_assignee));
  return jsonb_build_object('id',v_id,'workspace',public.get_customer_management_workspace(p_customer_id,p_branch_id));
end $$;
revoke all on function public.create_customer_followup(uuid,text,text,text,timestamptz,text,uuid,uuid) from public,anon;
grant execute on function public.create_customer_followup(uuid,text,text,text,timestamptz,text,uuid,uuid) to authenticated;

create or replace function public.complete_customer_followup(p_interaction_id uuid,p_outcome text,p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_super boolean; v_customer_id uuid; v_status text; v_interaction_branch uuid; v_outcome text:=btrim(coalesce(p_outcome,''));
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.manage',p_branch_id)) then raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED'; end if;
  if length(v_outcome)<2 then raise exception using errcode='22023',message='FOLLOWUP_OUTCOME_REQUIRED'; end if;
  select customer_id,status,branch_id into v_customer_id,v_status,v_interaction_branch from public.customer_interactions where id=p_interaction_id and type in ('call','email','meeting','whatsapp') for update;
  if v_customer_id is null then raise exception using errcode='22023',message='FOLLOWUP_NOT_FOUND'; end if;
  if not v_super and v_interaction_branch is distinct from p_branch_id then raise exception using errcode='42501',message='FOLLOWUP_BRANCH_SCOPE_DENIED'; end if;
  if v_status<>'pending' then raise exception using errcode='22023',message='FOLLOWUP_ALREADY_CLOSED'; end if;
  update public.customer_interactions set status='completed',description=concat_ws(E'\n\n',nullif(description,''),'النتيجة: '||v_outcome),completed_at=now(),completed_by=auth.uid(),updated_at=now() where id=p_interaction_id;
  insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata) values(v_customer_id,'followup_completed',coalesce(v_interaction_branch,p_branch_id),auth.uid(),jsonb_build_object('interaction_id',p_interaction_id,'outcome',v_outcome));
  return public.get_customer_management_workspace(v_customer_id,p_branch_id);
end $$;
revoke all on function public.complete_customer_followup(uuid,text,uuid) from public,anon;
grant execute on function public.complete_customer_followup(uuid,text,uuid) to authenticated;

create or replace function public.cancel_customer_followup(p_interaction_id uuid,p_reason text,p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_super boolean; v_customer_id uuid; v_status text; v_interaction_branch uuid; v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.manage',p_branch_id)) then raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED'; end if;
  if length(v_reason)<2 then raise exception using errcode='22023',message='FOLLOWUP_CANCEL_REASON_REQUIRED'; end if;
  select customer_id,status,branch_id into v_customer_id,v_status,v_interaction_branch from public.customer_interactions where id=p_interaction_id and type in ('call','email','meeting','whatsapp') for update;
  if v_customer_id is null then raise exception using errcode='22023',message='FOLLOWUP_NOT_FOUND'; end if;
  if not v_super and v_interaction_branch is distinct from p_branch_id then raise exception using errcode='42501',message='FOLLOWUP_BRANCH_SCOPE_DENIED'; end if;
  if v_status<>'pending' then raise exception using errcode='22023',message='FOLLOWUP_ALREADY_CLOSED'; end if;
  update public.customer_interactions set status='cancelled',description=concat_ws(E'\n\n',nullif(description,''),'سبب الإلغاء: '||v_reason),completed_at=now(),completed_by=auth.uid(),updated_at=now() where id=p_interaction_id;
  insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata) values(v_customer_id,'followup_cancelled',coalesce(v_interaction_branch,p_branch_id),auth.uid(),jsonb_build_object('interaction_id',p_interaction_id,'reason',v_reason));
  return public.get_customer_management_workspace(v_customer_id,p_branch_id);
end $$;
revoke all on function public.cancel_customer_followup(uuid,text,uuid) from public,anon;
grant execute on function public.cancel_customer_followup(uuid,text,uuid) to authenticated;
