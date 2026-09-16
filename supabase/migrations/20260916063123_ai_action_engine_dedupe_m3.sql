alter table public.ai_action_proposals
  add column if not exists dedupe_key text;

update public.ai_action_proposals
set dedupe_key = md5(
  coalesce(conversation_id::text,'none') || '|' || action_type || '|' || lower(trim(title))
)
where dedupe_key is null;

alter table public.ai_action_proposals
  alter column dedupe_key set not null;

create unique index if not exists ai_action_proposals_active_dedupe_idx
  on public.ai_action_proposals(created_by,branch_id,dedupe_key)
  where status in ('proposed','dispatched');

revoke select on table public.ai_action_proposals from authenticated;

create or replace function public.create_ai_action_proposal_v1(
  p_branch_id uuid,
  p_conversation_id uuid,
  p_action_type text,
  p_title text,
  p_description text default null,
  p_priority text default 'normal',
  p_evidence jsonb default '{}'::jsonb,
  p_payload jsonb default '{}'::jsonb,
  p_provider text default null,
  p_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_route jsonb;
  v_row public.ai_action_proposals%rowtype;
  v_action_type text:=lower(trim(coalesce(p_action_type,'')));
  v_title text:=left(trim(coalesce(p_title,'')),200);
  v_dedupe_key text;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='AI_ACTION_BRANCH_ACCESS_DENIED';
  end if;
  if not (private.staff_is_super_admin(v_uid) or public.staff_has_permission('reports.view',p_branch_id)) then
    raise exception using errcode='42501',message='AI_ACTION_PROPOSE_PERMISSION_DENIED';
  end if;

  v_route:=private.ai_action_route_v1(v_action_type);
  if v_route is null then raise exception using errcode='22023',message='INVALID_AI_ACTION_TYPE'; end if;
  if lower(coalesce(p_priority,'normal')) not in ('normal','high','urgent') then
    raise exception using errcode='22023',message='INVALID_AI_ACTION_PRIORITY';
  end if;
  if char_length(v_title)<3 then
    raise exception using errcode='22023',message='AI_ACTION_TITLE_REQUIRED';
  end if;
  if p_conversation_id is not null and not exists(
    select 1 from public.ai_conversations c
    where c.id=p_conversation_id and c.created_by=v_uid and c.branch_id=p_branch_id
  ) then
    raise exception using errcode='42501',message='AI_ACTION_CONVERSATION_DENIED';
  end if;

  v_dedupe_key:=md5(coalesce(p_conversation_id::text,'none') || '|' || v_action_type || '|' || lower(v_title));

  insert into public.ai_action_proposals(
    conversation_id,branch_id,created_by,action_type,destination,source_kind,
    title,description,priority,evidence,payload,provider,model,dedupe_key
  ) values (
    p_conversation_id,p_branch_id,v_uid,v_action_type,v_route->>'destination',v_route->>'source_kind',
    v_title,left(nullif(trim(coalesce(p_description,'')),''),2000),lower(coalesce(p_priority,'normal')),
    case when jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))='object' then coalesce(p_evidence,'{}'::jsonb) else '{}'::jsonb end,
    case when jsonb_typeof(coalesce(p_payload,'{}'::jsonb))='object' then coalesce(p_payload,'{}'::jsonb) else '{}'::jsonb end,
    left(nullif(trim(coalesce(p_provider,'')),''),60),left(nullif(trim(coalesce(p_model,'')),''),120),v_dedupe_key
  )
  on conflict (created_by,branch_id,dedupe_key)
    where status in ('proposed','dispatched')
  do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row
    from public.ai_action_proposals
    where created_by=v_uid and branch_id=p_branch_id and dedupe_key=v_dedupe_key
      and status in ('proposed','dispatched')
    order by created_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'id',v_row.id,'action_type',v_row.action_type,'destination',v_row.destination,
    'title',v_row.title,'description',v_row.description,'priority',v_row.priority,
    'status',v_row.status,'expires_at',v_row.expires_at,'task_id',v_row.dispatched_task_id
  );
end
$function$;