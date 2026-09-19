create or replace function private.employee_is_in_branch_v2(p_employee_id uuid,p_branch_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from private.hr_employee_profiles e
    where e.user_id=p_employee_id and e.employment_status='active'
      and (
        e.primary_branch_id=p_branch_id
        or exists(select 1 from private.hr_employee_shift_assignments a where a.user_id=e.user_id and a.branch_id=p_branch_id and a.active and a.effective_from<=timezone('Africa/Cairo',now())::date and (a.effective_to is null or a.effective_to>=timezone('Africa/Cairo',now())::date))
      )
  )
$$;

create or replace function public.create_employee_advance_request_v2(
  p_request_id uuid,p_branch_id uuid,p_employee_id uuid,p_amount numeric,p_purpose text,p_due_date date default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.expense_categories_v2%rowtype; d private.expense_documents_v2%rowtype; v_name text; v_auto boolean; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.manage_advances',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_ADVANCE_MANAGE_DENIED'; end if;
  if p_request_id is null or p_employee_id is null or coalesce(p_amount,0)<=0 or nullif(trim(coalesce(p_purpose,'')),'') is null then raise exception using errcode='22023',message='INVALID_EMPLOYEE_ADVANCE'; end if;
  select * into d from private.expense_documents_v2 where request_id=p_request_id; if d.id is not null then return to_jsonb(d); end if;
  if not private.employee_is_in_branch_v2(p_employee_id,p_branch_id) then raise exception using errcode='22023',message='EMPLOYEE_NOT_ELIGIBLE'; end if;
  select coalesce(nullif(u.name,''),e.employee_code,'موظف') into v_name from private.hr_employee_profiles e left join public.users u on u.id=e.user_id where e.user_id=p_employee_id limit 1;
  select * into c from private.expense_categories_v2 where active and accounting_treatment='employee_advance' and (branch_id=p_branch_id or branch_id is null) order by (branch_id=p_branch_id) desc limit 1;
  if c.id is null then raise exception using errcode='22023',message='EMPLOYEE_ADVANCE_CATEGORY_NOT_FOUND'; end if;
  v_auto:=not c.approval_required or (c.auto_approve_limit>0 and p_amount<=c.auto_approve_limit);
  insert into private.expense_documents_v2(request_id,document_number,branch_id,category_id,category_code,category_name,accounting_treatment,amount,beneficiary_name,employee_id,description,notes,incurred_at,source,status,requested_by,submitted_at,approved_by,approved_at)
  values(p_request_id,private.expense_document_number_v2(),p_branch_id,c.id,c.code,c.name_ar,'employee_advance',round(p_amount,2),v_name,p_employee_id,trim(p_purpose),
    concat_ws(' · ',nullif(trim(coalesce(p_notes,'')),''),case when p_due_date is not null then 'تاريخ التسوية المطلوب: '||p_due_date::text end),now(),'business',case when v_auto then 'approved' else 'pending_approval' end,auth.uid(),now(),case when v_auto then auth.uid() end,case when v_auto then now() end)
  returning * into d;
  perform private.expense_write_audit_v2(d.id,'advance_requested',auth.uid(),p_notes,jsonb_build_object('employee_id',p_employee_id,'due_date',p_due_date));
  if v_auto then perform private.employee_advance_notify_v2(d.id,'expense.advance_approved','تم اعتماد العهدة',d.document_number||' · '||round(d.amount,2)||' ج.م','approved','normal'); else perform private.expense_create_approval_task_v2(d.id); end if;
  return to_jsonb(d);
end $$;

create or replace function private.employee_advance_status_notification_v2()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.accounting_treatment='employee_advance' and new.employee_id is not null and new.status is distinct from old.status then
    if new.status='approved' then
      perform private.employee_advance_notify_v2(new.id,'expense.advance_approved','تم اعتماد العهدة',new.document_number||' · '||round(new.amount,2)||' ج.م','approved','normal');
    elsif new.status='rejected' then
      perform private.employee_advance_notify_v2(new.id,'expense.advance_rejected','تم رفض طلب العهدة',new.document_number||coalesce(' · '||nullif(new.rejection_reason,''),''),'rejected','high');
    elsif new.status='voided' then
      perform private.employee_advance_notify_v2(new.id,'expense.advance_voided','تم عكس العهدة',new.document_number||coalesce(' · '||nullif(new.void_reason,''),''),'voided','high');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists employee_advance_status_notification_v2 on private.expense_documents_v2;
create trigger employee_advance_status_notification_v2 after update of status on private.expense_documents_v2 for each row execute function private.employee_advance_status_notification_v2();

create or replace function public.get_employee_advance_workspace_v2(p_branch_id uuid,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_docs jsonb; v_employees jsonb; v_sources jsonb; v_categories jsonb; v_summary jsonb; v_limit int:=least(greatest(coalesce(p_limit,100),10),300); begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.view',p_branch_id) or public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id) or public.staff_has_permission('expense.manage_advances',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_VIEW_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',e.user_id,'employee_code',e.employee_code,'name',coalesce(nullif(u.name,''),e.employee_code),'primary_branch_id',e.primary_branch_id) order by coalesce(nullif(u.name,''),e.employee_code)),'[]'::jsonb)
  into v_employees from private.hr_employee_profiles e left join public.users u on u.id=e.user_id
  where e.employment_status='active' and private.employee_is_in_branch_v2(e.user_id,p_branch_id);
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name_ar',c.name_ar,'group_name_ar',c.group_name_ar,'receipt_required_above',c.receipt_required_above) order by c.group_name_ar,c.name_ar),'[]'::jsonb)
  into v_categories from private.expense_categories_v2 c where c.active and c.accounting_treatment='opex' and (c.branch_id is null or c.branch_id=p_branch_id);
  with sources as (
    select ca.id account_id,'branch_safe'::text source_kind,ca.name,ca.currency,private.cash_account_balance(ca.id) balance,ca.account_type,null::text provider_code from public.cash_accounts ca where ca.branch_id=p_branch_id and ca.active and ca.account_type='branch_safe'
    union all
    select pa.id,case when pa.account_type='bank' then 'bank' else 'payment_account' end,pa.name,pa.currency,private.payment_account_balance(pa.id),pa.account_type,pa.provider_code from public.payment_accounts pa where pa.branch_id=p_branch_id and pa.active
  ) select coalesce(jsonb_agg(jsonb_build_object('account_id',account_id,'source_kind',source_kind,'name',name,'currency',currency,'balance',balance,'account_type',account_type,'provider_code',provider_code) order by source_kind,name),'[]'::jsonb) into v_sources from sources;
  with docs as (
    select d.*,coalesce(nullif(u.name,''),e.employee_code,d.beneficiary_name,'موظف') employee_name,
      coalesce((select sum(s.amount) from private.employee_advance_settlements_v2 s where s.expense_document_id=d.id and s.status='active'),0)::numeric settled_amount
    from private.expense_documents_v2 d left join private.hr_employee_profiles e on e.user_id=d.employee_id left join public.users u on u.id=d.employee_id
    where d.branch_id=p_branch_id and d.accounting_treatment='employee_advance' order by d.created_at desc limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(docs)||jsonb_build_object('employee_name',employee_name,'settled_amount',settled_amount,'advance_outstanding',greatest(paid_amount-settled_amount,0),
    'undisbursed_amount',greatest(amount-paid_amount,0),'settlement_status',case when paid_amount<=0 then 'not_disbursed' when greatest(paid_amount-settled_amount,0)<=0 then 'settled' else 'open' end,
    'settlements',coalesce((select jsonb_agg(to_jsonb(s) order by s.settled_at desc) from private.employee_advance_settlements_v2 s where s.expense_document_id=docs.id),'[]'::jsonb)) order by created_at desc),'[]'::jsonb)
  into v_docs from docs;
  select jsonb_build_object('requested_amount',coalesce(sum(amount) filter(where status not in ('rejected','cancelled','voided')),0),'disbursed_amount',coalesce(sum(paid_amount) filter(where status not in ('rejected','cancelled','voided')),0),
    'unsettled_amount',coalesce(sum(greatest(paid_amount-coalesce((select sum(s.amount) from private.employee_advance_settlements_v2 s where s.expense_document_id=d.id and s.status='active'),0),0)) filter(where status not in ('rejected','cancelled','voided')),0),
    'open_advances',count(*) filter(where status not in ('rejected','cancelled','voided') and paid_amount>coalesce((select sum(s.amount) from private.employee_advance_settlements_v2 s where s.expense_document_id=d.id and s.status='active'),0)))
  into v_summary from private.expense_documents_v2 d where d.branch_id=p_branch_id and d.accounting_treatment='employee_advance';
  return jsonb_build_object('version',2,'branch_id',p_branch_id,'summary',v_summary,'documents',v_docs,'employees',v_employees,'payout_sources',v_sources,'expense_categories',v_categories,
    'permissions',jsonb_build_object('can_manage',public.staff_has_permission('expense.manage_advances',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)));
end $$;

revoke all on function private.employee_is_in_branch_v2(uuid,uuid) from public,anon,authenticated;
revoke all on function private.employee_advance_status_notification_v2() from public,anon,authenticated;
revoke all on function public.create_employee_advance_request_v2(uuid,uuid,uuid,numeric,text,date,text) from public,anon;
revoke all on function public.get_employee_advance_workspace_v2(uuid,integer) from public,anon;
grant execute on function public.create_employee_advance_request_v2(uuid,uuid,uuid,numeric,text,date,text) to authenticated;
grant execute on function public.get_employee_advance_workspace_v2(uuid,integer) to authenticated;
