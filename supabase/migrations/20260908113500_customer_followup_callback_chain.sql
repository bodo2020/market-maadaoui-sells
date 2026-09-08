drop function if exists public.complete_customer_followup_v3(uuid,text,text,timestamptz,uuid);
create function public.complete_customer_followup_v3(
  p_interaction_id uuid,
  p_outcome_code text,
  p_outcome_note text default null,
  p_callback_at timestamptz default null,
  p_branch_id uuid default null
)
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
  v_code text:=lower(btrim(coalesce(p_outcome_code,'')));
  v_note text:=nullif(btrim(coalesce(p_outcome_note,'')),'');
  v_label text;
  v_type text;
  v_subject text;
  v_priority text;
  v_assigned_to uuid;
  v_next_id uuid;
  v_workspace jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.manage',p_branch_id)) then
    raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED';
  end if;

  if v_code not in ('reached','no_answer','interested','not_interested','issue_resolved','callback_requested','wrong_number') then
    raise exception using errcode='22023',message='INVALID_FOLLOWUP_OUTCOME_CODE';
  end if;
  if v_note is not null and length(v_note)>1000 then raise exception using errcode='22023',message='FOLLOWUP_OUTCOME_NOTE_TOO_LONG'; end if;
  if v_code='callback_requested' then
    if p_callback_at is null then raise exception using errcode='22023',message='CALLBACK_SCHEDULE_REQUIRED'; end if;
    if p_callback_at<=now() then raise exception using errcode='22023',message='CALLBACK_SCHEDULE_MUST_BE_FUTURE'; end if;
    if p_callback_at>now()+interval '90 days' then raise exception using errcode='22023',message='CALLBACK_SCHEDULE_TOO_FAR'; end if;
  end if;

  select i.customer_id,i.status,i.branch_id,i.type,i.subject,i.priority,i.assigned_to
  into v_customer_id,v_status,v_interaction_branch,v_type,v_subject,v_priority,v_assigned_to
  from public.customer_interactions i
  where i.id=p_interaction_id and i.type in ('call','email','meeting','whatsapp')
  for update;

  if v_customer_id is null then raise exception using errcode='22023',message='FOLLOWUP_NOT_FOUND'; end if;
  if not v_super and v_interaction_branch is distinct from p_branch_id then raise exception using errcode='42501',message='FOLLOWUP_BRANCH_SCOPE_DENIED'; end if;
  if v_status<>'pending' then raise exception using errcode='22023',message='FOLLOWUP_ALREADY_CLOSED'; end if;

  v_label:=case v_code
    when 'reached' then 'تم التواصل'
    when 'no_answer' then 'لم يرد'
    when 'interested' then 'مهتم'
    when 'not_interested' then 'غير مهتم'
    when 'issue_resolved' then 'تم حل المشكلة'
    when 'callback_requested' then 'طلب إعادة التواصل'
    when 'wrong_number' then 'رقم غير صحيح'
  end;

  update public.customer_interactions
  set status='completed',outcome_code=v_code,outcome_note=v_note,
      description=concat_ws(E'\n\n',nullif(description,''),'النتيجة: '||v_label,case when v_note is not null then 'ملاحظة النتيجة: '||v_note end),
      completed_at=now(),completed_by=auth.uid(),updated_at=now()
  where id=p_interaction_id;

  insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata)
  values(v_customer_id,'followup_completed',coalesce(v_interaction_branch,p_branch_id),auth.uid(),
    jsonb_build_object('interaction_id',p_interaction_id,'outcome_code',v_code,'outcome_label',v_label,'outcome_note',v_note));

  if v_code='callback_requested' then
    v_assigned_to:=coalesce(v_assigned_to,auth.uid());
    if not exists(
      select 1 from public.users u
      where u.id=v_assigned_to and coalesce(u.active,true)
        and exists(
          select 1 from public.user_branch_roles ubr
          where ubr.user_id=u.id and ubr.branch_id=coalesce(v_interaction_branch,p_branch_id) and ubr.active
            and (
              private.staff_is_super_admin(u.id)
              or exists(
                select 1 from public.staff_role_permissions srp
                join public.staff_permissions sp on sp.id=srp.permission_id and sp.code='customers.manage'
                where srp.role_id=ubr.role_id
              )
            )
        )
    ) then raise exception using errcode='42501',message='CALLBACK_ASSIGNEE_OUT_OF_SCOPE'; end if;

    insert into public.customer_interactions(
      customer_id,type,subject,description,status,priority,scheduled_at,
      created_by,branch_id,assigned_to,source_type,source_key
    ) values(
      v_customer_id,v_type,left('إعادة تواصل: '||v_subject,120),
      concat_ws(E'\n','تم إنشاء المهمة تلقائيًا لأن العميل طلب إعادة التواصل.',case when v_note is not null then 'ملاحظة: '||v_note end),
      'pending',v_priority,p_callback_at,auth.uid(),coalesce(v_interaction_branch,p_branch_id),v_assigned_to,'callback',p_interaction_id::text
    ) returning id into v_next_id;

    insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata)
    values(v_customer_id,'callback_followup_created',coalesce(v_interaction_branch,p_branch_id),auth.uid(),
      jsonb_build_object('from_interaction_id',p_interaction_id,'new_interaction_id',v_next_id,'scheduled_at',p_callback_at,'assigned_to',v_assigned_to));
  end if;

  v_workspace:=public.get_customer_management_workspace(v_customer_id,p_branch_id);
  return jsonb_build_object('workspace',v_workspace,'completed_interaction_id',p_interaction_id,'callback_created',v_next_id is not null,'callback_interaction_id',v_next_id);
end $$;

revoke all on function public.complete_customer_followup_v3(uuid,text,text,timestamptz,uuid) from public,anon;
grant execute on function public.complete_customer_followup_v3(uuid,text,text,timestamptz,uuid) to authenticated;
