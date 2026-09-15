insert into public.staff_permissions(code,name_ar,module,description) values
 ('expense.manage_budgets','إدارة موازنات المصروفات','finance','إنشاء وتعديل موازنات المصروفات والتنبيهات'),
 ('expense.manage_recurring','إدارة المصروفات الدورية','finance','إنشاء وإيقاف قواعد المصروفات الدورية')
on conflict(code) do update set name_ar=excluded.name_ar,module=excluded.module,description=excluded.description;

insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r cross join public.staff_permissions p
where r.active and p.code in ('expense.manage_budgets','expense.manage_recurring')
  and (r.code in ('accountant','branch_admin','branch_manager','super_admin') or exists(
    select 1 from public.staff_role_permissions rp2 join public.staff_permissions fp on fp.id=rp2.permission_id
    where rp2.role_id=r.id and fp.code='finance.manage'
  ))
on conflict do nothing;

create table if not exists private.expense_budgets_v2(
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  category_id uuid references private.expense_categories_v2(id) on delete cascade,
  period_month date not null,
  budget_amount numeric(14,2) not null check(budget_amount>=0),
  alert_80 boolean not null default true,
  alert_100 boolean not null default true,
  notes text,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(period_month=date_trunc('month',period_month)::date)
);
create unique index if not exists expense_budgets_v2_branch_month_uq on private.expense_budgets_v2(branch_id,period_month) where category_id is null;
create unique index if not exists expense_budgets_v2_category_month_uq on private.expense_budgets_v2(branch_id,category_id,period_month) where category_id is not null;
create index if not exists expense_budgets_v2_branch_period_idx on private.expense_budgets_v2(branch_id,period_month,category_id);

create table if not exists private.expense_recurring_rules_v2(
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  category_id uuid not null references private.expense_categories_v2(id),
  amount numeric(14,2) not null check(amount>0),
  tax_amount numeric(14,2) not null default 0 check(tax_amount>=0),
  description text not null,
  beneficiary_name text,
  notes text,
  cadence text not null check(cadence in ('weekly','monthly','quarterly','yearly')),
  next_run_date date not null,
  end_date date,
  auto_submit boolean not null default true,
  active boolean not null default true,
  last_generated_at timestamptz,
  generated_count integer not null default 0 check(generated_count>=0),
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(end_date is null or end_date>=next_run_date or not active)
);
create index if not exists expense_recurring_rules_v2_due_idx on private.expense_recurring_rules_v2(active,next_run_date,branch_id);

create table if not exists private.expense_recurring_runs_v2(
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references private.expense_recurring_rules_v2(id) on delete cascade,
  run_date date not null,
  expense_document_id uuid references private.expense_documents_v2(id),
  status text not null default 'created',
  created_at timestamptz not null default now(),
  unique(rule_id,run_date)
);

alter table private.expense_documents_v2 add column if not exists recurring_rule_id uuid references private.expense_recurring_rules_v2(id);
alter table private.expense_documents_v2 add column if not exists recurring_run_date date;
create index if not exists expense_documents_v2_recurring_idx on private.expense_documents_v2(recurring_rule_id,recurring_run_date) where recurring_rule_id is not null;

create or replace function private.expense_next_recurring_date_v2(p_date date,p_cadence text)
returns date language sql immutable set search_path='' as $$
  select case p_cadence
    when 'weekly' then p_date+7
    when 'monthly' then (p_date+interval '1 month')::date
    when 'quarterly' then (p_date+interval '3 months')::date
    when 'yearly' then (p_date+interval '1 year')::date
    else null end
$$;

create or replace function public.upsert_expense_budget_v2(
  p_id uuid,p_branch_id uuid,p_category_id uuid,p_period_month date,p_budget_amount numeric,
  p_alert_80 boolean default true,p_alert_100 boolean default true,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.expense_budgets_v2%rowtype; c private.expense_categories_v2%rowtype; v_month date; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.manage_budgets',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_BUDGET_MANAGE_DENIED'; end if;
  if p_branch_id is null or p_period_month is null or coalesce(p_budget_amount,-1)<0 then raise exception using errcode='22023',message='INVALID_EXPENSE_BUDGET'; end if;
  v_month:=date_trunc('month',p_period_month)::date;
  if p_category_id is not null then
    select * into c from private.expense_categories_v2 where id=p_category_id and active and accounting_treatment='opex' and (branch_id is null or branch_id=p_branch_id);
    if c.id is null then raise exception using errcode='22023',message='EXPENSE_BUDGET_CATEGORY_INVALID'; end if;
  end if;
  if p_id is not null then
    select * into b from private.expense_budgets_v2 where id=p_id and branch_id=p_branch_id for update;
    if b.id is null then raise exception using errcode='22023',message='EXPENSE_BUDGET_NOT_FOUND'; end if;
    update private.expense_budgets_v2 set category_id=p_category_id,period_month=v_month,budget_amount=round(p_budget_amount,2),
      alert_80=coalesce(p_alert_80,true),alert_100=coalesce(p_alert_100,true),notes=nullif(trim(coalesce(p_notes,'')),''),updated_by=auth.uid(),updated_at=now()
    where id=b.id returning * into b;
  else
    select * into b from private.expense_budgets_v2 where branch_id=p_branch_id and period_month=v_month and category_id is not distinct from p_category_id for update;
    if b.id is null then
      insert into private.expense_budgets_v2(branch_id,category_id,period_month,budget_amount,alert_80,alert_100,notes,created_by,updated_by)
      values(p_branch_id,p_category_id,v_month,round(p_budget_amount,2),coalesce(p_alert_80,true),coalesce(p_alert_100,true),nullif(trim(coalesce(p_notes,'')),''),auth.uid(),auth.uid()) returning * into b;
    else
      update private.expense_budgets_v2 set budget_amount=round(p_budget_amount,2),alert_80=coalesce(p_alert_80,true),alert_100=coalesce(p_alert_100,true),
        notes=nullif(trim(coalesce(p_notes,'')),''),updated_by=auth.uid(),updated_at=now() where id=b.id returning * into b;
    end if;
  end if;
  return to_jsonb(b);
end $$;

create or replace function public.get_expense_budget_workspace_v2(p_branch_id uuid,p_period_month date default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_month date:=date_trunc('month',coalesce(p_period_month,timezone('Africa/Cairo',now())::date))::date; v_next date; v_rows jsonb; v_summary jsonb; v_categories jsonb; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.view',p_branch_id) or public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_VIEW_DENIED'; end if;
  v_next:=(v_month+interval '1 month')::date;
  with actual as (
    select d.category_id,sum(d.amount)::numeric amount
    from private.expense_documents_v2 d
    where d.branch_id=p_branch_id and d.accounting_treatment='opex' and d.status in ('approved','partially_paid','paid')
      and timezone('Africa/Cairo',d.incurred_at)::date>=v_month and timezone('Africa/Cairo',d.incurred_at)::date<v_next
    group by d.category_id
  ), budget_rows as (
    select b.*,c.name_ar category_name,c.group_name_ar,
      case when b.category_id is null then coalesce((select sum(amount) from actual),0) else coalesce(a.amount,0) end actual_amount
    from private.expense_budgets_v2 b
    left join private.expense_categories_v2 c on c.id=b.category_id
    left join actual a on a.category_id=b.category_id
    where b.branch_id=p_branch_id and b.period_month=v_month
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'branch_id',branch_id,'category_id',category_id,'category_name',coalesce(category_name,'إجمالي الفرع'),'group_name_ar',coalesce(group_name_ar,'الموازنة العامة'),
    'period_month',period_month,'budget_amount',budget_amount,'actual_amount',actual_amount,'remaining_amount',greatest(budget_amount-actual_amount,0),
    'usage_percent',case when budget_amount>0 then round(actual_amount*100/budget_amount,2) else case when actual_amount>0 then 999 else 0 end end,
    'alert_80',alert_80,'alert_100',alert_100,'notes',notes
  ) order by category_id nulls first,category_name),'[]'::jsonb) into v_rows from budget_rows;

  with actual as (
    select coalesce(sum(d.amount),0)::numeric actual_amount
    from private.expense_documents_v2 d
    where d.branch_id=p_branch_id and d.accounting_treatment='opex' and d.status in ('approved','partially_paid','paid')
      and timezone('Africa/Cairo',d.incurred_at)::date>=v_month and timezone('Africa/Cairo',d.incurred_at)::date<v_next
  ), totals as (
    select coalesce((select budget_amount from private.expense_budgets_v2 where branch_id=p_branch_id and period_month=v_month and category_id is null limit 1),
      (select coalesce(sum(budget_amount),0) from private.expense_budgets_v2 where branch_id=p_branch_id and period_month=v_month and category_id is not null),0)::numeric budget_amount
  )
  select jsonb_build_object('period_month',v_month,'budget_amount',t.budget_amount,'actual_amount',a.actual_amount,'remaining_amount',greatest(t.budget_amount-a.actual_amount,0),
    'usage_percent',case when t.budget_amount>0 then round(a.actual_amount*100/t.budget_amount,2) else case when a.actual_amount>0 then 999 else 0 end end)
  into v_summary from actual a cross join totals t;

  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'name_ar',c.name_ar,'group_name_ar',c.group_name_ar) order by c.group_name_ar,c.name_ar),'[]'::jsonb)
  into v_categories from private.expense_categories_v2 c where c.active and c.accounting_treatment='opex' and (c.branch_id is null or c.branch_id=p_branch_id);
  return jsonb_build_object('version',2,'branch_id',p_branch_id,'period_month',v_month,'summary',v_summary,'budgets',v_rows,'categories',v_categories,
    'permissions',jsonb_build_object('can_manage',public.staff_has_permission('expense.manage_budgets',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)));
end $$;

create or replace function private.expense_evaluate_budget_alerts_v2(p_document_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare d private.expense_documents_v2%rowtype; b private.expense_budgets_v2%rowtype; v_month date; v_next date; v_actual numeric; v_pct numeric; v_threshold int; begin
  select * into d from private.expense_documents_v2 where id=p_document_id;
  if d.id is null or d.accounting_treatment<>'opex' or d.status not in ('approved','partially_paid','paid') then return; end if;
  v_month:=date_trunc('month',timezone('Africa/Cairo',d.incurred_at)::date)::date; v_next:=(v_month+interval '1 month')::date;
  for b in select * from private.expense_budgets_v2 where branch_id=d.branch_id and period_month=v_month and (category_id is null or category_id=d.category_id) loop
    select coalesce(sum(x.amount),0) into v_actual from private.expense_documents_v2 x
    where x.branch_id=d.branch_id and x.accounting_treatment='opex' and x.status in ('approved','partially_paid','paid')
      and timezone('Africa/Cairo',x.incurred_at)::date>=v_month and timezone('Africa/Cairo',x.incurred_at)::date<v_next
      and (b.category_id is null or x.category_id=b.category_id);
    v_pct:=case when b.budget_amount>0 then v_actual*100/b.budget_amount else case when v_actual>0 then 999 else 0 end end;
    v_threshold:=case when b.alert_100 and v_pct>=100 then 100 when b.alert_80 and v_pct>=80 then 80 else null end;
    if v_threshold is not null then
      insert into private.notification_events_v2(audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at)
      select 'staff',u.id,d.branch_id,'expense.budget_threshold','finance',case when v_threshold=100 then 'high' else 'normal' end,
        case when v_threshold=100 then 'تم تجاوز موازنة المصروفات' else 'تنبيه موازنة المصروفات 80%' end,
        coalesce((select name_ar from private.expense_categories_v2 where id=b.category_id),'إجمالي مصروفات الفرع')||' · '||round(v_actual,2)||' / '||round(b.budget_amount,2)||' ج.م',
        'expense_budget',b.id,'/finance/expenses/budgets','عرض الموازنة',true,'expense-budget:'||b.id::text||':'||v_threshold::text,array['in_app']::text[],'active',
        jsonb_build_object('budget_id',b.id,'period_month',v_month,'threshold',v_threshold,'budget_amount',b.budget_amount,'actual_amount',v_actual,'usage_percent',round(v_pct,2)),now(),now()
      from public.users u where coalesce(u.active,true) and (private.staff_user_has_permission_v3(u.id,'expense.manage_budgets',d.branch_id) or private.staff_user_has_permission_v3(u.id,'finance.manage',d.branch_id))
      on conflict(recipient_user_id,dedupe_key) do update set title=excluded.title,body=excluded.body,severity=excluded.severity,status='active',resolved_at=null,metadata=excluded.metadata,updated_at=now();
    end if;
  end loop;
end $$;

create or replace function private.expense_budget_document_trigger_v2()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (tg_op='INSERT' and new.status in ('approved','partially_paid','paid')) or (tg_op='UPDATE' and new.status is distinct from old.status and new.status in ('approved','partially_paid','paid')) then
    perform private.expense_evaluate_budget_alerts_v2(new.id);
  end if;
  return new;
end $$;
drop trigger if exists expense_budget_document_trigger_v2 on private.expense_documents_v2;
create trigger expense_budget_document_trigger_v2 after insert or update of status on private.expense_documents_v2 for each row execute function private.expense_budget_document_trigger_v2();

create or replace function public.upsert_expense_recurring_rule_v2(
  p_id uuid,p_branch_id uuid,p_category_id uuid,p_amount numeric,p_description text,p_beneficiary_name text,
  p_tax_amount numeric,p_cadence text,p_next_run_date date,p_end_date date,p_auto_submit boolean,p_active boolean,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.expense_recurring_rules_v2%rowtype; c private.expense_categories_v2%rowtype; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.manage_recurring',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_RECURRING_MANAGE_DENIED'; end if;
  if coalesce(p_amount,0)<=0 or nullif(trim(coalesce(p_description,'')),'') is null or p_next_run_date is null or p_cadence not in ('weekly','monthly','quarterly','yearly') or (p_end_date is not null and p_end_date<p_next_run_date) then raise exception using errcode='22023',message='INVALID_RECURRING_EXPENSE'; end if;
  select * into c from private.expense_categories_v2 where id=p_category_id and active and (branch_id is null or branch_id=p_branch_id);
  if c.id is null or c.accounting_treatment='employee_advance' then raise exception using errcode='22023',message='RECURRING_CATEGORY_INVALID'; end if;
  if p_id is null then
    insert into private.expense_recurring_rules_v2(branch_id,category_id,amount,tax_amount,description,beneficiary_name,notes,cadence,next_run_date,end_date,auto_submit,active,created_by,updated_by)
    values(p_branch_id,p_category_id,round(p_amount,2),round(coalesce(p_tax_amount,0),2),trim(p_description),nullif(trim(coalesce(p_beneficiary_name,'')),''),nullif(trim(coalesce(p_notes,'')),''),p_cadence,p_next_run_date,p_end_date,coalesce(p_auto_submit,true),coalesce(p_active,true),auth.uid(),auth.uid()) returning * into r;
  else
    select * into r from private.expense_recurring_rules_v2 where id=p_id and branch_id=p_branch_id for update;
    if r.id is null then raise exception using errcode='22023',message='RECURRING_RULE_NOT_FOUND'; end if;
    update private.expense_recurring_rules_v2 set category_id=p_category_id,amount=round(p_amount,2),tax_amount=round(coalesce(p_tax_amount,0),2),description=trim(p_description),
      beneficiary_name=nullif(trim(coalesce(p_beneficiary_name,'')),''),notes=nullif(trim(coalesce(p_notes,'')),''),cadence=p_cadence,next_run_date=p_next_run_date,end_date=p_end_date,
      auto_submit=coalesce(p_auto_submit,true),active=coalesce(p_active,true),updated_by=auth.uid(),updated_at=now() where id=r.id returning * into r;
  end if;
  return to_jsonb(r);
end $$;

create or replace function public.get_expense_recurring_workspace_v2(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_rules jsonb; v_categories jsonb; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.view',p_branch_id) or public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_VIEW_DENIED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'branch_id',r.branch_id,'category_id',r.category_id,'category_name',c.name_ar,'accounting_treatment',c.accounting_treatment,
    'amount',r.amount,'tax_amount',r.tax_amount,'description',r.description,'beneficiary_name',r.beneficiary_name,'notes',r.notes,'cadence',r.cadence,'next_run_date',r.next_run_date,
    'end_date',r.end_date,'auto_submit',r.auto_submit,'active',r.active,'last_generated_at',r.last_generated_at,'generated_count',r.generated_count) order by r.active desc,r.next_run_date,r.created_at desc),'[]'::jsonb)
  into v_rules from private.expense_recurring_rules_v2 r join private.expense_categories_v2 c on c.id=r.category_id where r.branch_id=p_branch_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'name_ar',c.name_ar,'group_name_ar',c.group_name_ar,'accounting_treatment',c.accounting_treatment,'receipt_required_above',c.receipt_required_above) order by c.group_name_ar,c.name_ar),'[]'::jsonb)
  into v_categories from private.expense_categories_v2 c where c.active and c.accounting_treatment<>'employee_advance' and (c.branch_id is null or c.branch_id=p_branch_id);
  return jsonb_build_object('version',2,'branch_id',p_branch_id,'rules',v_rules,'categories',v_categories,'today',timezone('Africa/Cairo',now())::date,
    'permissions',jsonb_build_object('can_manage',public.staff_has_permission('expense.manage_recurring',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)));
end $$;

create or replace function private.generate_due_recurring_expenses_v2()
returns integer language plpgsql security definer set search_path='' as $$
declare r private.expense_recurring_rules_v2%rowtype; c private.expense_categories_v2%rowtype; v_run_id uuid; v_doc private.expense_documents_v2%rowtype; v_status text; v_auto boolean; v_today date:=timezone('Africa/Cairo',now())::date; v_count int:=0; v_guard int; begin
  for r in select * from private.expense_recurring_rules_v2 where active and next_run_date<=v_today order by next_run_date,id for update skip locked loop
    v_guard:=0;
    while r.active and r.next_run_date<=v_today and v_guard<24 loop
      v_guard:=v_guard+1;
      if r.end_date is not null and r.next_run_date>r.end_date then
        update private.expense_recurring_rules_v2 set active=false,updated_at=now() where id=r.id; exit;
      end if;
      select * into c from private.expense_categories_v2 where id=r.category_id and active and (branch_id is null or branch_id=r.branch_id);
      if c.id is null then update private.expense_recurring_rules_v2 set active=false,updated_at=now() where id=r.id; exit; end if;
      insert into private.expense_recurring_runs_v2(rule_id,run_date,status) values(r.id,r.next_run_date,'creating') on conflict(rule_id,run_date) do nothing returning id into v_run_id;
      if v_run_id is not null then
        v_auto:=r.auto_submit and c.receipt_required_above<=0 and (not c.approval_required or (c.auto_approve_limit>0 and r.amount<=c.auto_approve_limit));
        v_status:=case when not r.auto_submit or (c.receipt_required_above>0 and r.amount>=c.receipt_required_above) then 'draft' when v_auto then 'approved' else 'pending_approval' end;
        insert into private.expense_documents_v2(request_id,document_number,branch_id,category_id,category_code,category_name,accounting_treatment,amount,beneficiary_name,tax_amount,description,notes,incurred_at,source,status,requested_by,submitted_at,approved_by,approved_at,recurring_rule_id,recurring_run_date)
        values(gen_random_uuid(),private.expense_document_number_v2(),r.branch_id,c.id,c.code,c.name_ar,c.accounting_treatment,r.amount,r.beneficiary_name,r.tax_amount,r.description,r.notes,
          (r.next_run_date::timestamp at time zone 'Africa/Cairo'),'business',v_status,r.created_by,case when v_status<>'draft' then now() end,case when v_auto then r.created_by end,case when v_auto then now() end,r.id,r.next_run_date)
        returning * into v_doc;
        update private.expense_recurring_runs_v2 set expense_document_id=v_doc.id,status=v_status where id=v_run_id;
        perform private.expense_write_audit_v2(v_doc.id,'recurring_generated',r.created_by,null,jsonb_build_object('recurring_rule_id',r.id,'run_date',r.next_run_date,'status',v_status));
        if v_status='approved' then perform private.expense_recognize_v2(v_doc.id,r.created_by); perform private.expense_evaluate_budget_alerts_v2(v_doc.id);
        elsif v_status='pending_approval' then perform private.expense_create_approval_task_v2(v_doc.id);
        else
          insert into private.notification_events_v2(audience,recipient_user_id,branch_id,event_key,category,severity,title,body,source_kind,source_id,action_url,action_label,requires_action,dedupe_key,eligible_channels,status,metadata,created_at,updated_at)
          values('staff',r.created_by,r.branch_id,'expense.recurring_draft','finance','normal','مصروف دوري يحتاج إثباتًا','تم إنشاء '||v_doc.document_number||' كمسودة. ارفع الإثبات ثم أرسله للاعتماد.','expense_document',v_doc.id,'/finance/expenses','فتح المصروف',true,'expense-recurring-draft:'||v_doc.id::text,array['in_app']::text[],'active',jsonb_build_object('document_number',v_doc.document_number,'rule_id',r.id),now(),now())
          on conflict(recipient_user_id,dedupe_key) do nothing;
        end if;
        v_count:=v_count+1;
      end if;
      r.next_run_date:=private.expense_next_recurring_date_v2(r.next_run_date,r.cadence);
      if r.next_run_date is null or (r.end_date is not null and r.next_run_date>r.end_date) then r.active:=false; end if;
      update private.expense_recurring_rules_v2 set next_run_date=r.next_run_date,active=r.active,last_generated_at=case when v_run_id is not null then now() else last_generated_at end,
        generated_count=generated_count+case when v_run_id is not null then 1 else 0 end,updated_at=now() where id=r.id;
      v_run_id:=null;
    end loop;
  end loop;
  return v_count;
end $$;

create or replace function public.run_due_recurring_expenses_v2(p_branch_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count int; begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if not (public.staff_has_permission('expense.manage_recurring',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='EXPENSE_RECURRING_MANAGE_DENIED'; end if;
  v_count:=private.generate_due_recurring_expenses_v2();
  return jsonb_build_object('generated',v_count,'ran_at',now());
end $$;

do $$ declare v_job bigint; begin
  select jobid into v_job from cron.job where jobname='expense-recurring-v2' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('expense-recurring-v2','17 * * * *','select private.generate_due_recurring_expenses_v2();');
end $$;

revoke all on table private.expense_budgets_v2 from public,anon,authenticated;
revoke all on table private.expense_recurring_rules_v2 from public,anon,authenticated;
revoke all on table private.expense_recurring_runs_v2 from public,anon,authenticated;
revoke all on function private.expense_next_recurring_date_v2(date,text) from public,anon,authenticated;
revoke all on function private.expense_evaluate_budget_alerts_v2(uuid) from public,anon,authenticated;
revoke all on function private.expense_budget_document_trigger_v2() from public,anon,authenticated;
revoke all on function private.generate_due_recurring_expenses_v2() from public,anon,authenticated;
revoke all on function public.upsert_expense_budget_v2(uuid,uuid,uuid,date,numeric,boolean,boolean,text) from public,anon;
revoke all on function public.get_expense_budget_workspace_v2(uuid,date) from public,anon;
revoke all on function public.upsert_expense_recurring_rule_v2(uuid,uuid,uuid,numeric,text,text,numeric,text,date,date,boolean,boolean,text) from public,anon;
revoke all on function public.get_expense_recurring_workspace_v2(uuid) from public,anon;
revoke all on function public.run_due_recurring_expenses_v2(uuid) from public,anon;
grant execute on function public.upsert_expense_budget_v2(uuid,uuid,uuid,date,numeric,boolean,boolean,text) to authenticated;
grant execute on function public.get_expense_budget_workspace_v2(uuid,date) to authenticated;
grant execute on function public.upsert_expense_recurring_rule_v2(uuid,uuid,uuid,numeric,text,text,numeric,text,date,date,boolean,boolean,text) to authenticated;
grant execute on function public.get_expense_recurring_workspace_v2(uuid) to authenticated;
grant execute on function public.run_due_recurring_expenses_v2(uuid) to authenticated;