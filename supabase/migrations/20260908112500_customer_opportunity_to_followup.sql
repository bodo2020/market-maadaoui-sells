alter table public.customer_interactions add column if not exists source_type text;
alter table public.customer_interactions add column if not exists source_key text;

create unique index if not exists customer_interactions_pending_opportunity_unique
on public.customer_interactions(customer_id,branch_id,source_type,source_key)
where status='pending' and source_type='opportunity';

drop function if exists public.create_customer_followup_from_opportunity(uuid,text,text,timestamptz,text,uuid,text,uuid);
create function public.create_customer_followup_from_opportunity(
  p_customer_id uuid,
  p_opportunity_key text,
  p_type text,
  p_scheduled_at timestamptz,
  p_priority text default 'medium',
  p_assigned_to uuid default null,
  p_note text default null,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_super boolean;
  v_key text:=lower(btrim(coalesce(p_opportunity_key,'')));
  v_assignee uuid:=coalesce(p_assigned_to,auth.uid());
  v_subject text;
  v_note text:=nullif(btrim(coalesce(p_note,'')),'');
  v_id uuid;
  v_existing uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null then raise exception using errcode='22023',message='FOLLOWUP_BRANCH_REQUIRED'; end if;

  v_super:=private.staff_is_super_admin(auth.uid());
  if not v_super and not public.staff_has_permission('customers.manage',p_branch_id) then
    raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED';
  end if;

  if not exists(select 1 from public.customers c where c.id=p_customer_id) then
    raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND';
  end if;

  if v_key not in ('abandoned_cart','purchase_overdue','purchase_due','under_watch','coupon_ready') then
    raise exception using errcode='22023',message='INVALID_OPPORTUNITY_KEY';
  end if;
  if p_type not in ('call','whatsapp','email','meeting') then raise exception using errcode='22023',message='INVALID_FOLLOWUP_TYPE'; end if;
  if p_priority not in ('low','medium','high') then raise exception using errcode='22023',message='INVALID_PRIORITY'; end if;
  if p_scheduled_at is null then raise exception using errcode='22023',message='FOLLOWUP_SCHEDULE_REQUIRED'; end if;
  if p_scheduled_at > now()+interval '90 days' then raise exception using errcode='22023',message='FOLLOWUP_SCHEDULE_TOO_FAR'; end if;
  if v_note is not null and length(v_note)>1000 then raise exception using errcode='22023',message='FOLLOWUP_NOTE_TOO_LONG'; end if;

  if not exists(
    select 1
    from public.users u
    where u.id=v_assignee and coalesce(u.active,true)
      and exists(
        select 1 from public.user_branch_roles ubr
        where ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
          and (
            private.staff_is_super_admin(u.id)
            or exists(
              select 1
              from public.staff_role_permissions srp
              join public.staff_permissions sp on sp.id=srp.permission_id and sp.code='customers.manage'
              where srp.role_id=ubr.role_id
            )
          )
      )
  ) then
    raise exception using errcode='42501',message='FOLLOWUP_ASSIGNEE_OUT_OF_SCOPE';
  end if;

  select i.id into v_existing
  from public.customer_interactions i
  where i.customer_id=p_customer_id
    and i.branch_id=p_branch_id
    and i.status='pending'
    and i.source_type='opportunity'
    and i.source_key=v_key
  limit 1;
  if v_existing is not null then
    return jsonb_build_object('id',v_existing,'created',false,'duplicate',true);
  end if;

  v_subject:=case v_key
    when 'abandoned_cart' then 'متابعة سلة متروكة'
    when 'purchase_overdue' then 'إعادة تنشيط عميل متأخر عن الشراء'
    when 'purchase_due' then 'متابعة موعد شراء متوقع'
    when 'under_watch' then 'متابعة عميل تحت المتابعة'
    when 'coupon_ready' then 'تذكير بكوبون خصم متاح'
  end;

  insert into public.customer_interactions(
    customer_id,type,subject,description,status,priority,scheduled_at,
    created_by,branch_id,assigned_to,source_type,source_key
  ) values(
    p_customer_id,p_type,v_subject,v_note,'pending',p_priority,p_scheduled_at,
    auth.uid(),p_branch_id,v_assignee,'opportunity',v_key
  ) returning id into v_id;

  insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata)
  values(
    p_customer_id,'followup_created_from_opportunity',p_branch_id,auth.uid(),
    jsonb_build_object('interaction_id',v_id,'opportunity_key',v_key,'assigned_to',v_assignee,'scheduled_at',p_scheduled_at,'priority',p_priority,'type',p_type)
  );

  return jsonb_build_object('id',v_id,'created',true,'duplicate',false);
end $$;

revoke all on function public.create_customer_followup_from_opportunity(uuid,text,text,timestamptz,text,uuid,text,uuid) from public,anon;
grant execute on function public.create_customer_followup_from_opportunity(uuid,text,text,timestamptz,text,uuid,text,uuid) to authenticated;
