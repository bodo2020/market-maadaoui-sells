create or replace function private.ai_action_route_v1(p_action_type text)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select case p_action_type
    when 'inventory_recount_review' then jsonb_build_object('destination','task','source_kind','ai_inventory_review')
    when 'low_stock_review' then jsonb_build_object('destination','task','source_kind','ai_inventory_review')
    when 'overdue_order_followup' then jsonb_build_object('destination','task','source_kind','ai_order_followup')
    when 'shift_variance_review' then jsonb_build_object('destination','task','source_kind','ai_shift_review')
    when 'expense_anomaly_review' then jsonb_build_object('destination','approval','source_kind','ai_expense_review')
    when 'supplier_reorder_review' then jsonb_build_object('destination','approval','source_kind','ai_purchase_review')
    when 'attendance_anomaly_review' then jsonb_build_object('destination','task','source_kind','ai_hr_attendance_review')
    when 'shift_coverage_review' then jsonb_build_object('destination','task','source_kind','ai_hr_shift_review')
    when 'leave_request_review' then jsonb_build_object('destination','approval','source_kind','ai_hr_leave_review')
    when 'payroll_anomaly_review' then jsonb_build_object('destination','approval','source_kind','ai_hr_payroll_review')
    when 'employee_followup' then jsonb_build_object('destination','task','source_kind','ai_hr_employee_followup')
    when 'growth_content_review' then jsonb_build_object('destination','task','source_kind','ai_growth_content_review')
    when 'growth_campaign_review' then jsonb_build_object('destination','task','source_kind','ai_growth_campaign_review')
    when 'growth_offer_review' then jsonb_build_object('destination','approval','source_kind','ai_growth_offer_review')
    when 'branch_performance_review' then jsonb_build_object('destination','task','source_kind','ai_business_review')
    else null::jsonb
  end
$$;

create or replace function private.ai_action_dispatch_allowed_v1(p_user_id uuid, p_action_type text, p_branch_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select case p_action_type
    when 'inventory_recount_review' then private.staff_user_has_permission_v3(p_user_id,'inventory.manage',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'inventory.count',p_branch_id)
    when 'low_stock_review' then private.staff_user_has_permission_v3(p_user_id,'inventory.manage',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'purchases.manage',p_branch_id)
    when 'overdue_order_followup' then private.staff_user_has_permission_v3(p_user_id,'online_orders.manage',p_branch_id)
    when 'shift_variance_review' then private.staff_user_has_permission_v3(p_user_id,'pos.manage_shifts',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
    when 'expense_anomaly_review' then private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
    when 'supplier_reorder_review' then private.staff_user_has_permission_v3(p_user_id,'purchases.manage',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'finance.manage',p_branch_id)
    when 'attendance_anomaly_review' then private.staff_user_has_permission_v3(p_user_id,'hr.attendance.manage',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'hr.attendance.approve',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'hr.admin',p_branch_id)
    when 'shift_coverage_review' then private.staff_user_has_permission_v3(p_user_id,'hr.shifts.manage',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'hr.admin',p_branch_id)
    when 'leave_request_review' then private.staff_user_has_permission_v3(p_user_id,'hr.leave.approve',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'hr.leave.manage',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'hr.admin',p_branch_id)
    when 'payroll_anomaly_review' then private.staff_user_has_permission_v3(p_user_id,'hr.payroll.approve',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'hr.payroll.manage',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'hr.admin',p_branch_id)
    when 'employee_followup' then private.staff_user_has_permission_v3(p_user_id,'hr.manage_employees',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'hr.admin',p_branch_id)
    when 'growth_content_review' then private.staff_user_has_permission_v3(p_user_id,'home_content.manage',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'home_content.publish',p_branch_id)
    when 'growth_campaign_review' then private.staff_user_has_permission_v3(p_user_id,'growth_console.access',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'home_content.manage',p_branch_id)
    when 'growth_offer_review' then private.staff_user_has_permission_v3(p_user_id,'home_content.publish',p_branch_id) or private.staff_user_has_permission_v3(p_user_id,'home_content.manage',p_branch_id)
    when 'branch_performance_review' then private.staff_user_has_permission_v3(p_user_id,'reports.view',p_branch_id)
    else false
  end
$$;

create or replace function public.create_ai_action_proposal_v1(
  p_branch_id uuid, p_conversation_id uuid, p_action_type text, p_title text,
  p_description text default null, p_priority text default 'normal', p_evidence jsonb default '{}'::jsonb,
  p_payload jsonb default '{}'::jsonb, p_provider text default null, p_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
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
  v_route:=private.ai_action_route_v1(v_action_type);
  if v_route is null then raise exception using errcode='22023',message='INVALID_AI_ACTION_TYPE'; end if;
  if not (private.staff_is_super_admin(v_uid) or public.staff_has_permission('reports.view',p_branch_id) or private.ai_action_dispatch_allowed_v1(v_uid,v_action_type,p_branch_id)) then
    raise exception using errcode='42501',message='AI_ACTION_PROPOSE_PERMISSION_DENIED';
  end if;
  if lower(coalesce(p_priority,'normal')) not in ('normal','high','urgent') then raise exception using errcode='22023',message='INVALID_AI_ACTION_PRIORITY'; end if;
  if char_length(v_title)<3 then raise exception using errcode='22023',message='AI_ACTION_TITLE_REQUIRED'; end if;
  if p_conversation_id is not null and not exists(
    select 1 from public.ai_conversations c where c.id=p_conversation_id and c.created_by=v_uid and c.branch_id=p_branch_id
  ) then raise exception using errcode='42501',message='AI_ACTION_CONVERSATION_DENIED'; end if;
  v_dedupe_key:=md5(coalesce(p_conversation_id::text,'none') || '|' || v_action_type || '|' || lower(v_title));
  insert into public.ai_action_proposals(conversation_id,branch_id,created_by,action_type,destination,source_kind,title,description,priority,evidence,payload,provider,model,dedupe_key)
  values(p_conversation_id,p_branch_id,v_uid,v_action_type,v_route->>'destination',v_route->>'source_kind',v_title,left(nullif(trim(coalesce(p_description,'')),''),2000),lower(coalesce(p_priority,'normal')),
    case when jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))='object' then coalesce(p_evidence,'{}'::jsonb) else '{}'::jsonb end,
    case when jsonb_typeof(coalesce(p_payload,'{}'::jsonb))='object' then coalesce(p_payload,'{}'::jsonb) else '{}'::jsonb end,
    left(nullif(trim(coalesce(p_provider,'')),''),60),left(nullif(trim(coalesce(p_model,'')),''),120),v_dedupe_key)
  on conflict (created_by,branch_id,dedupe_key) where status in ('proposed','dispatched') do nothing
  returning * into v_row;
  if v_row.id is null then
    select * into v_row from public.ai_action_proposals where created_by=v_uid and branch_id=p_branch_id and dedupe_key=v_dedupe_key and status in ('proposed','dispatched') order by created_at desc limit 1;
  end if;
  return jsonb_build_object('id',v_row.id,'action_type',v_row.action_type,'destination',v_row.destination,'title',v_row.title,'description',v_row.description,'priority',v_row.priority,'status',v_row.status,'expires_at',v_row.expires_at,'task_id',v_row.dispatched_task_id);
end
$$;

create or replace function private.operations_task_can_claim(p_source_kind text, p_branch_id uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
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
  when p_source_kind='ai_hr_attendance_review' then public.staff_has_permission('hr.attendance.manage',p_branch_id) or public.staff_has_permission('hr.attendance.approve',p_branch_id) or public.staff_has_permission('hr.admin',p_branch_id)
  when p_source_kind='ai_hr_shift_review' then public.staff_has_permission('hr.shifts.manage',p_branch_id) or public.staff_has_permission('hr.admin',p_branch_id)
  when p_source_kind='ai_hr_leave_review' then public.staff_has_permission('hr.leave.approve',p_branch_id) or public.staff_has_permission('hr.leave.manage',p_branch_id) or public.staff_has_permission('hr.admin',p_branch_id)
  when p_source_kind='ai_hr_payroll_review' then public.staff_has_permission('hr.payroll.approve',p_branch_id) or public.staff_has_permission('hr.payroll.manage',p_branch_id) or public.staff_has_permission('hr.admin',p_branch_id)
  when p_source_kind='ai_hr_employee_followup' then public.staff_has_permission('hr.manage_employees',p_branch_id) or public.staff_has_permission('hr.admin',p_branch_id)
  when p_source_kind in ('ai_growth_content_review','ai_growth_campaign_review','ai_growth_offer_review') then public.staff_has_permission('growth_console.access',p_branch_id) or public.staff_has_permission('home_content.manage',p_branch_id) or public.staff_has_permission('home_content.publish',p_branch_id)
  when p_source_kind='ai_business_review' then public.staff_has_permission('reports.view',p_branch_id)
  else false end
$$;

create or replace function private.approval_center_is_review_task_v1(p_source_kind text)
returns boolean
language sql
immutable
set search_path to ''
as $$
 select coalesce(p_source_kind,'') in (
   'inventory_adjustment','shift_reconciliation','cash_handoff','inventory_transfer_variance','attendance_exception','hr_request',
   'order_substitution','order_substitution_financial_adjustment','order_shortage_financial_adjustment','expense_approval',
   'ai_expense_review','ai_purchase_review','ai_hr_leave_review','ai_hr_payroll_review','ai_growth_offer_review'
 )
$$;

create or replace function private.approval_center_action_url_v1(p_source_kind text)
returns text
language sql
immutable
set search_path to ''
as $$
 select case
   when p_source_kind in ('inventory_adjustment','attendance_exception','hr_request','order_substitution','order_substitution_financial_adjustment','order_shortage_financial_adjustment','ai_expense_review','ai_purchase_review','ai_hr_leave_review','ai_hr_payroll_review','ai_growth_offer_review') then '/approvals'
   when p_source_kind='expense_approval' then '/finance/expenses'
   when p_source_kind='shift_reconciliation' then '/tasks?type=shift'
   when p_source_kind='cash_handoff' then '/tasks?type=cash_handoff'
   when p_source_kind='inventory_transfer_variance' then '/inventory-transfers'
   else '/tasks' end
$$;