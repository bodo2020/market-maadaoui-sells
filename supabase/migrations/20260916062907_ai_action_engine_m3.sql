create table if not exists public.ai_action_proposals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid null references public.ai_conversations(id) on delete set null,
  branch_id uuid not null references public.branches(id),
  created_by uuid not null references public.users(id),
  action_type text not null check (action_type in (
    'inventory_recount_review','low_stock_review','overdue_order_followup',
    'shift_variance_review','expense_anomaly_review','supplier_reorder_review'
  )),
  destination text not null check (destination in ('task','approval')),
  source_kind text not null,
  title text not null check (char_length(title) between 3 and 200),
  description text null check (description is null or char_length(description) <= 2000),
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  evidence jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'proposed' check (status in ('proposed','dispatched','rejected','expired','failed')),
  provider text null,
  model text null,
  dispatched_task_id uuid null references public.operations_tasks(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  confirmed_at timestamptz null,
  rejected_at timestamptz null,
  rejection_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_action_proposals_owner_status_idx
  on public.ai_action_proposals(created_by,status,created_at desc);
create index if not exists ai_action_proposals_branch_status_idx
  on public.ai_action_proposals(branch_id,status,created_at desc);

alter table public.ai_action_proposals enable row level security;
revoke all on table public.ai_action_proposals from anon;
revoke insert,update,delete on table public.ai_action_proposals from authenticated;
grant select on table public.ai_action_proposals to authenticated;

drop policy if exists ai_action_proposals_select_own on public.ai_action_proposals;
create policy ai_action_proposals_select_own
on public.ai_action_proposals for select
to authenticated
using (
  created_by=(select auth.uid())
  and public.has_branch_access((select auth.uid()),branch_id)
);

create or replace function private.ai_action_route_v1(p_action_type text)
returns jsonb
language sql
immutable
set search_path=''
as $function$
  select case p_action_type
    when 'inventory_recount_review' then jsonb_build_object('destination','task','source_kind','ai_inventory_review')
    when 'low_stock_review' then jsonb_build_object('destination','task','source_kind','ai_inventory_review')
    when 'overdue_order_followup' then jsonb_build_object('destination','task','source_kind','ai_order_followup')
    when 'shift_variance_review' then jsonb_build_object('destination','task','source_kind','ai_shift_review')
    when 'expense_anomaly_review' then jsonb_build_object('destination','approval','source_kind','ai_expense_review')
    when 'supplier_reorder_review' then jsonb_build_object('destination','approval','source_kind','ai_purchase_review')
    else null::jsonb
  end
$function$;

create or replace function private.ai_action_dispatch_allowed_v1(p_user_id uuid,p_action_type text,p_branch_id uuid)
returns boolean
language sql
stable security definer
set search_path=''
as $function$
  select case p_action_type
    when 'inventory_recount_review' then private.staff_user_has_permission_v3(p_user_id,'inventory.manage',p_branch_id)
      or private.staff_user_has_permission_v3(p_user_id,'inventory.count',p_branch_id)
    when 'low_stock_review' then private.staff_user_has_permission_v3(p_user_id,'inventory.manage',p_branch_id)
      or private.staff_user_has_permission_v3(p_user_id,'purchases.manage',p_branch_id)
    when 'overdue_order_followup' then private.staff_user_has_permission_v3(p_user_id,'online_orders.manage',p_branch_id)
    when 'shift_variance_review' then private.staff_user_has_permission_v3(p_user_id,'pos.manage_shifts',p_branch_id)
      or private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
    when 'expense_anomaly_review' then private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
    when 'supplier_reorder_review' then private.staff_user_has_permission_v3(p_user_id,'purchases.manage',p_branch_id)
      or private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
    else false
  end
$function$;

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
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(v_uid,p_branch_id) then
    raise exception using errcode='42501',message='AI_ACTION_BRANCH_ACCESS_DENIED';
  end if;
  if not (private.staff_is_super_admin(v_uid) or public.staff_has_permission('reports.view',p_branch_id)) then
    raise exception using errcode='42501',message='AI_ACTION_PROPOSE_PERMISSION_DENIED';
  end if;
  v_route:=private.ai_action_route_v1(lower(trim(coalesce(p_action_type,''))));
  if v_route is null then raise exception using errcode='22023',message='INVALID_AI_ACTION_TYPE'; end if;
  if lower(coalesce(p_priority,'normal')) not in ('normal','high','urgent') then
    raise exception using errcode='22023',message='INVALID_AI_ACTION_PRIORITY';
  end if;
  if char_length(trim(coalesce(p_title,'')))<3 then
    raise exception using errcode='22023',message='AI_ACTION_TITLE_REQUIRED';
  end if;
  if p_conversation_id is not null and not exists(
    select 1 from public.ai_conversations c
    where c.id=p_conversation_id and c.created_by=v_uid and c.branch_id=p_branch_id
  ) then
    raise exception using errcode='42501',message='AI_ACTION_CONVERSATION_DENIED';
  end if;

  insert into public.ai_action_proposals(
    conversation_id,branch_id,created_by,action_type,destination,source_kind,
    title,description,priority,evidence,payload,provider,model
  ) values (
    p_conversation_id,p_branch_id,v_uid,lower(trim(p_action_type)),v_route->>'destination',v_route->>'source_kind',
    left(trim(p_title),200),left(nullif(trim(coalesce(p_description,'')),''),2000),lower(coalesce(p_priority,'normal')),
    case when jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))='object' then coalesce(p_evidence,'{}'::jsonb) else '{}'::jsonb end,
    case when jsonb_typeof(coalesce(p_payload,'{}'::jsonb))='object' then coalesce(p_payload,'{}'::jsonb) else '{}'::jsonb end,
    left(nullif(trim(coalesce(p_provider,'')),''),60),left(nullif(trim(coalesce(p_model,'')),''),120)
  ) returning * into v_row;

  return jsonb_build_object(
    'id',v_row.id,'action_type',v_row.action_type,'destination',v_row.destination,
    'title',v_row.title,'description',v_row.description,'priority',v_row.priority,
    'status',v_row.status,'expires_at',v_row.expires_at
  );
end
$function$;

create or replace function public.confirm_ai_action_proposal_v1(p_proposal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_proposal public.ai_action_proposals%rowtype;
  v_task public.operations_tasks%rowtype;
  v_due timestamptz;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_proposal from public.ai_action_proposals where id=p_proposal_id for update;
  if not found then raise exception using errcode='P0002',message='AI_ACTION_PROPOSAL_NOT_FOUND'; end if;
  if not public.has_branch_access(v_uid,v_proposal.branch_id) then
    raise exception using errcode='42501',message='AI_ACTION_BRANCH_ACCESS_DENIED';
  end if;
  if v_proposal.created_by<>v_uid and not private.staff_is_super_admin(v_uid) then
    raise exception using errcode='42501',message='AI_ACTION_CONFIRM_OWNER_DENIED';
  end if;
  if v_proposal.status='dispatched' and v_proposal.dispatched_task_id is not null then
    return jsonb_build_object('proposal_id',v_proposal.id,'status','dispatched','task_id',v_proposal.dispatched_task_id,'destination',v_proposal.destination);
  end if;
  if v_proposal.status<>'proposed' then raise exception using errcode='22023',message='AI_ACTION_PROPOSAL_NOT_PENDING'; end if;
  if v_proposal.expires_at<=now() then
    update public.ai_action_proposals set status='expired',updated_at=now() where id=v_proposal.id;
    return jsonb_build_object('proposal_id',v_proposal.id,'status','expired');
  end if;
  if not (private.staff_is_super_admin(v_uid) or private.ai_action_dispatch_allowed_v1(v_uid,v_proposal.action_type,v_proposal.branch_id)) then
    raise exception using errcode='42501',message='AI_ACTION_DISPATCH_PERMISSION_DENIED';
  end if;

  v_due:=case v_proposal.priority when 'urgent' then now()+interval '1 hour' when 'high' then now()+interval '4 hours' else now()+interval '24 hours' end;

  insert into public.operations_tasks(
    branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,due_at,metadata,created_by
  ) values (
    v_proposal.branch_id,'ai_action_review',v_proposal.source_kind,v_proposal.id,0,v_proposal.priority,'open',
    v_proposal.title,v_proposal.description,v_due,
    jsonb_build_object(
      'ai_generated',true,'ai_proposal_id',v_proposal.id,'ai_action_type',v_proposal.action_type,
      'ai_destination',v_proposal.destination,'conversation_id',v_proposal.conversation_id,
      'evidence',v_proposal.evidence,'payload',v_proposal.payload,'provider',v_proposal.provider,'model',v_proposal.model
    ),v_uid
  )
  on conflict(task_type,source_kind,source_id) do update set updated_at=now()
  returning * into v_task;

  insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
  values(v_task.id,'ai_action_dispatched',v_uid,'تم إنشاء المهمة من اقتراح Elmadawy AI',jsonb_build_object('proposal_id',v_proposal.id,'destination',v_proposal.destination));

  update public.ai_action_proposals
  set status='dispatched',dispatched_task_id=v_task.id,confirmed_at=coalesce(confirmed_at,now()),updated_at=now()
  where id=v_proposal.id;

  return jsonb_build_object(
    'proposal_id',v_proposal.id,'status','dispatched','task_id',v_task.id,
    'destination',v_proposal.destination,'source_kind',v_proposal.source_kind,'due_at',v_due,
    'action_url',case when v_proposal.destination='approval' then '/approvals' else '/tasks' end
  );
end
$function$;

create or replace function public.reject_ai_action_proposal_v1(p_proposal_id uuid,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_proposal public.ai_action_proposals%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_proposal from public.ai_action_proposals where id=p_proposal_id for update;
  if not found then raise exception using errcode='P0002',message='AI_ACTION_PROPOSAL_NOT_FOUND'; end if;
  if v_proposal.created_by<>v_uid and not private.staff_is_super_admin(v_uid) then
    raise exception using errcode='42501',message='AI_ACTION_REJECT_OWNER_DENIED';
  end if;
  if v_proposal.status<>'proposed' then
    return jsonb_build_object('proposal_id',v_proposal.id,'status',v_proposal.status);
  end if;
  update public.ai_action_proposals
  set status='rejected',rejected_at=now(),rejection_note=left(nullif(trim(coalesce(p_note,'')),''),500),updated_at=now()
  where id=v_proposal.id;
  return jsonb_build_object('proposal_id',v_proposal.id,'status','rejected');
end
$function$;

revoke all on function public.create_ai_action_proposal_v1(uuid,uuid,text,text,text,text,jsonb,jsonb,text,text) from public,anon;
revoke all on function public.confirm_ai_action_proposal_v1(uuid) from public,anon;
revoke all on function public.reject_ai_action_proposal_v1(uuid,text) from public,anon;
grant execute on function public.create_ai_action_proposal_v1(uuid,uuid,text,text,text,text,jsonb,jsonb,text,text) to authenticated;
grant execute on function public.confirm_ai_action_proposal_v1(uuid) to authenticated;
grant execute on function public.reject_ai_action_proposal_v1(uuid,text) to authenticated;

create or replace function private.operations_task_can_claim(p_source_kind text,p_branch_id uuid)
returns boolean
language sql
stable security definer
set search_path=''
as $function$
 select case
  when p_source_kind='online_order_fulfillment' then private.fulfillment_actor_allowed_v1(auth.uid(),p_branch_id)
  when p_source_kind='online_order_intake' then public.staff_has_permission('online_orders.manage',p_branch_id) or public.staff_has_permission('delivery.manage',p_branch_id)
  when p_source_kind='order_substitution' then public.staff_has_permission('online_orders.manage',p_branch_id)
  when p_source_kind in ('order_substitution_financial_adjustment','order_shortage_financial_adjustment') then public.staff_has_permission('online_money.settle_digital',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)
  when p_source_kind='pos_refund' then public.staff_has_permission('sales.refund',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)
  when p_source_kind='online_refund' then public.staff_has_permission('online_money.settle_digital',p_branch_id)
  when p_source_kind='shift_reconciliation' then public.staff_has_permission('pos.manage_shifts',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)
  when p_source_kind='cash_handoff' then public.staff_has_permission('finance.manage',p_branch_id) or public.staff_has_permission('pos.manage_shifts',p_branch_id)
  when p_source_kind='inventory_count' then public.staff_has_permission('inventory.count',p_branch_id)
  when p_source_kind='inventory_recount' then public.staff_has_permission('inventory.recount',p_branch_id)
  when p_source_kind='inventory_adjustment' then public.staff_has_permission('inventory.approve_adjustment',p_branch_id)
  when p_source_kind in ('inventory_transfer_dispatch','inventory_transfer_receive') then public.staff_has_permission('inventory.transfer',p_branch_id)
  when p_source_kind='inventory_transfer_variance' then public.staff_has_permission('inventory.manage',p_branch_id) or public.staff_has_permission('inventory.approve_adjustment',p_branch_id)
  when p_source_kind='attendance_exception' then public.staff_has_permission('hr.attendance.approve',p_branch_id) or public.staff_has_permission('branch.manage_staff',p_branch_id)
  when p_source_kind='hr_request' then private.hr_request_can_review_for_user_v1(auth.uid(),p_branch_id)
  when p_source_kind='hr_salary_advance_payout' then public.staff_has_permission('finance.manage',p_branch_id)
  when p_source_kind in ('hr_treasury_payout','hr_treasury_payroll') then public.has_branch_access(auth.uid(),p_branch_id)
  when p_source_kind='hr_attendance_correction_apply' then public.staff_has_permission('hr.attendance.manage',p_branch_id) or public.staff_has_permission('branch.manage_staff',p_branch_id)
  when p_source_kind='ai_inventory_review' then public.staff_has_permission('inventory.manage',p_branch_id) or public.staff_has_permission('inventory.count',p_branch_id) or public.staff_has_permission('purchases.manage',p_branch_id)
  when p_source_kind='ai_order_followup' then public.staff_has_permission('online_orders.manage',p_branch_id)
  when p_source_kind='ai_shift_review' then public.staff_has_permission('pos.manage_shifts',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)
  when p_source_kind='ai_expense_review' then public.staff_has_permission('finance.manage',p_branch_id)
  when p_source_kind='ai_purchase_review' then public.staff_has_permission('purchases.manage',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)
  else false end
$function$;

create or replace function private.operations_task_can_claim_for_user_v3(p_user_id uuid,p_source_kind text,p_branch_id uuid)
returns boolean
language sql
stable security definer
set search_path=''
as $function$
 select case
  when p_source_kind='online_order_fulfillment' then private.fulfillment_actor_allowed_v1(p_user_id,p_branch_id)
  when p_source_kind='online_order_intake' then private.staff_user_has_permission_v3(p_user_id,'online_orders.manage',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'delivery.manage',p_branch_id)
  when p_source_kind='order_substitution' then private.staff_user_has_permission_v3(p_user_id,'online_orders.manage',p_branch_id)
  when p_source_kind in ('order_substitution_financial_adjustment','order_shortage_financial_adjustment') then private.staff_user_has_permission_v3(p_user_id,'online_money.settle_digital',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
  when p_source_kind='pos_refund' then private.staff_user_has_permission_v3(p_user_id,'sales.refund',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
  when p_source_kind='online_refund' then private.staff_user_has_permission_v3(p_user_id,'online_money.settle_digital',p_branch_id)
  when p_source_kind='shift_reconciliation' then private.staff_user_has_permission_v3(p_user_id,'pos.manage_shifts',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
  when p_source_kind='cash_handoff' then private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'pos.manage_shifts',p_branch_id)
  when p_source_kind='inventory_count' then private.staff_user_has_permission_v3(p_user_id,'inventory.count',p_branch_id)
  when p_source_kind='inventory_recount' then private.staff_user_has_permission_v3(p_user_id,'inventory.recount',p_branch_id)
  when p_source_kind='inventory_adjustment' then private.staff_user_has_permission_v3(p_user_id,'inventory.approve_adjustment',p_branch_id)
  when p_source_kind in ('inventory_transfer_dispatch','inventory_transfer_receive') then private.staff_user_has_permission_v3(p_user_id,'inventory.transfer',p_branch_id)
  when p_source_kind='inventory_transfer_variance' then private.staff_user_has_permission_v3(p_user_id,'inventory.manage',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'inventory.approve_adjustment',p_branch_id)
  when p_source_kind='attendance_exception' then private.staff_user_has_permission_v3(p_user_id,'hr.attendance.approve',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'branch.manage_staff',p_branch_id)
  when p_source_kind='hr_request' then private.hr_request_can_review_for_user_v1(p_user_id,p_branch_id)
  when p_source_kind='hr_salary_advance_payout' then private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
  when p_source_kind='hr_attendance_correction_apply' then private.staff_user_has_permission_v3(p_user_id,'hr.attendance.manage',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'branch.manage_staff',p_branch_id)
  when p_source_kind='ai_inventory_review' then private.staff_user_has_permission_v3(p_user_id,'inventory.manage',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'inventory.count',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'purchases.manage',p_branch_id)
  when p_source_kind='ai_order_followup' then private.staff_user_has_permission_v3(p_user_id,'online_orders.manage',p_branch_id)
  when p_source_kind='ai_shift_review' then private.staff_user_has_permission_v3(p_user_id,'pos.manage_shifts',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
  when p_source_kind='ai_expense_review' then private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
  when p_source_kind='ai_purchase_review' then private.staff_user_has_permission_v3(p_user_id,'purchases.manage',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
  else false end
$function$;

create or replace function private.approval_center_is_review_task_v1(p_source_kind text)
returns boolean
language sql
immutable
set search_path=''
as $function$
 select coalesce(p_source_kind,'') in (
   'inventory_adjustment','shift_reconciliation','cash_handoff','inventory_transfer_variance','attendance_exception','hr_request',
   'order_substitution','order_substitution_financial_adjustment','order_shortage_financial_adjustment','expense_approval',
   'ai_expense_review','ai_purchase_review'
 )
$function$;

create or replace function private.operations_task_action_url_v1(p_source_kind text)
returns text
language sql
immutable
set search_path=''
as $function$
 select case
   when p_source_kind='online_order_fulfillment' then '/online-orders/operations'
   when p_source_kind='online_order_intake' then '/online-orders'
   when p_source_kind in ('order_substitution','order_substitution_financial_adjustment','order_shortage_financial_adjustment','ai_expense_review','ai_purchase_review') then '/approvals'
   when p_source_kind in ('inventory_transfer_dispatch','inventory_transfer_receive') then '/inventory-transfers'
   when p_source_kind like 'inventory_%' then '/tasks?type=inventory'
   when p_source_kind='shift_reconciliation' then '/tasks?type=shift'
   when p_source_kind='cash_handoff' then '/tasks?type=cash_handoff'
   when p_source_kind in ('pos_refund','online_refund') then '/tasks?type=refund'
   else '/tasks' end
$function$;

create or replace function private.approval_center_action_url_v1(p_source_kind text)
returns text
language sql
immutable
set search_path=''
as $function$
 select case
   when p_source_kind in ('inventory_adjustment','attendance_exception','hr_request','order_substitution','order_substitution_financial_adjustment','order_shortage_financial_adjustment','ai_expense_review','ai_purchase_review') then '/approvals'
   when p_source_kind='expense_approval' then '/finance/expenses'
   when p_source_kind='shift_reconciliation' then '/tasks?type=shift'
   when p_source_kind='cash_handoff' then '/tasks?type=cash_handoff'
   when p_source_kind='inventory_transfer_variance' then '/inventory-transfers'
   else '/tasks' end
$function$;

create or replace function private.route_approval_task_notification_to_center_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
 if new.source_kind in ('inventory_adjustment','shift_reconciliation','cash_handoff','inventory_transfer_variance','attendance_exception','hr_request','ai_expense_review','ai_purchase_review') then
  update private.notification_events_v2
     set action_url='/approvals',action_label='فتح الموافقة',updated_at=now()
   where source_kind='operations_task' and source_id=new.id and status='active';
 end if;
 return new;
end
$function$;