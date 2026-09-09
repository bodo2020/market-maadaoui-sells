-- Treasury custody + delegated HR salary-advance payout workflow.
-- Applied live to marketpos as migration 20260909204815.

alter table public.cash_accounts add column if not exists custodian_user_id uuid references public.users(id) on delete restrict;
alter table public.payment_accounts add column if not exists custodian_user_id uuid references public.users(id) on delete restrict;
create index if not exists cash_accounts_custodian_idx on public.cash_accounts(custodian_user_id) where custodian_user_id is not null;
create index if not exists payment_accounts_custodian_idx on public.payment_accounts(custodian_user_id) where custodian_user_id is not null;

alter table private.hr_salary_advances
  add column if not exists payout_responsible_user_id uuid references public.users(id) on delete restrict,
  add column if not exists payout_requested_by uuid references public.users(id) on delete restrict,
  add column if not exists payout_requested_at timestamptz,
  add column if not exists payout_delegated_task_id uuid references public.operations_tasks(id) on delete restrict;
create index if not exists hr_salary_advances_payout_responsible_idx on private.hr_salary_advances(payout_responsible_user_id) where payout_responsible_user_id is not null;
create index if not exists hr_salary_advances_payout_requested_by_idx on private.hr_salary_advances(payout_requested_by) where payout_requested_by is not null;
create index if not exists hr_salary_advances_payout_delegated_task_idx on private.hr_salary_advances(payout_delegated_task_id) where payout_delegated_task_id is not null;

alter table private.hr_salary_advances drop constraint if exists hr_salary_advances_payout_source_check;
alter table private.hr_salary_advances add constraint hr_salary_advances_payout_source_check check (
  (payout_source_kind is null and payout_cash_account_id is null and payout_payment_account_id is null and payout_cash_ledger_id is null and payout_payment_ledger_id is null)
  or (payout_source_kind in ('branch_safe','pos_drawer') and payout_cash_account_id is not null and payout_payment_account_id is null and payout_payment_ledger_id is null)
  or (payout_source_kind='bank' and payout_cash_account_id is null and payout_payment_account_id is not null and payout_cash_ledger_id is null)
);

create or replace function private.resolve_finance_account_custodian_v1(p_branch_id uuid,p_source_kind text,p_source_account_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid;v_name text;v_balance numeric;v_account_name text;v_shift_id uuid;
begin
  if p_source_kind='branch_safe' then
    select ca.custodian_user_id,u.name,private.cash_account_balance(ca.id),ca.name into v_uid,v_name,v_balance,v_account_name
    from public.cash_accounts ca left join public.users u on u.id=ca.custodian_user_id
    where ca.id=p_source_account_id and ca.branch_id=p_branch_id and ca.account_type='branch_safe' and ca.active;
  elsif p_source_kind='pos_drawer' then
    select ps.user_id,u.name,private.cash_account_balance(ca.id),ca.name,ps.id into v_uid,v_name,v_balance,v_account_name,v_shift_id
    from public.cash_accounts ca
    join lateral (select s.id,s.user_id from public.pos_shifts s where s.drawer_account_id=ca.id and s.status='open' order by s.opened_at desc limit 1) ps on true
    join public.users u on u.id=ps.user_id
    where ca.id=p_source_account_id and ca.branch_id=p_branch_id and ca.account_type='pos_drawer' and ca.active;
  elsif p_source_kind='bank' then
    select pa.custodian_user_id,u.name,private.payment_account_balance(pa.id),pa.name into v_uid,v_name,v_balance,v_account_name
    from public.payment_accounts pa left join public.users u on u.id=pa.custodian_user_id
    where pa.id=p_source_account_id and pa.branch_id=p_branch_id and pa.account_type='bank' and pa.active;
  else return null;
  end if;
  if v_account_name is null then return null; end if;
  return jsonb_build_object('responsible_user_id',v_uid,'responsible_user_name',v_name,'balance',round(coalesce(v_balance,0),2),'account_name',v_account_name,'shift_id',v_shift_id);
end;$$;
revoke all on function private.resolve_finance_account_custodian_v1(uuid,text,uuid) from public,anon,authenticated;

create or replace function public.set_finance_account_custodian_v1(p_branch_id uuid,p_account_kind text,p_account_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_name text;v_user_name text;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED'; end if;
 if p_user_id is not null then
   select u.name into v_user_name from public.users u where u.id=p_user_id and coalesce(u.active,true) and public.has_branch_access(u.id,p_branch_id);
   if v_user_name is null then raise exception using errcode='22023',message='FINANCE_CUSTODIAN_INVALID'; end if;
 end if;
 if p_account_kind='cash' then
   select name into v_name from public.cash_accounts where id=p_account_id and branch_id=p_branch_id and account_type='branch_safe' and active;
   if v_name is null then raise exception using errcode='22023',message='FINANCE_ACCOUNT_UNAVAILABLE'; end if;
   update public.cash_accounts set custodian_user_id=p_user_id,updated_at=now() where id=p_account_id;
 elsif p_account_kind='payment' then
   select name into v_name from public.payment_accounts where id=p_account_id and branch_id=p_branch_id and account_type='bank' and active;
   if v_name is null then raise exception using errcode='22023',message='FINANCE_ACCOUNT_UNAVAILABLE'; end if;
   update public.payment_accounts set custodian_user_id=p_user_id,updated_at=now() where id=p_account_id;
 else raise exception using errcode='22023',message='FINANCE_ACCOUNT_KIND_INVALID'; end if;
 return jsonb_build_object('ok',true,'account_id',p_account_id,'account_name',v_name,'custodian_user_id',p_user_id,'custodian_user_name',v_user_name);
end;$$;

create or replace function public.get_finance_treasury_workspace_v2(p_branch_id uuid,p_limit integer default 80)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_limit integer:=least(greatest(coalesce(p_limit,80),20),200);v_cash jsonb:='[]';v_payment jsonb:='[]';v_recent jsonb:='[]';v_unlinked jsonb:='[]';v_staff jsonb:='[]';v_pending jsonb:='[]';v_can_manage boolean:=false;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='FINANCE_BRANCH_ACCESS_DENIED'; end if;
 if not (public.staff_has_permission('finance.view',p_branch_id) or public.staff_has_permission('finance.manage',p_branch_id) or private.staff_is_super_admin(auth.uid())) then raise exception using errcode='42501',message='FINANCE_VIEW_DENIED'; end if;
 v_can_manage:=public.staff_has_permission('finance.manage',p_branch_id) or private.staff_is_super_admin(auth.uid());
 select coalesce(jsonb_agg(jsonb_build_object('account_id',ca.id,'account_type',ca.account_type,'name',ca.name,'currency',ca.currency,'active',ca.active,'balance',round(private.cash_account_balance(ca.id),2),'device_id',ca.device_id,'device_name',d.name,'open_shift_id',s.id,'responsible_user_id',case when ca.account_type='pos_drawer' then s.user_id else ca.custodian_user_id end,'responsible_user_name',case when ca.account_type='pos_drawer' then su.name else cu.name end,'responsibility_source',case when ca.account_type='pos_drawer' then 'open_shift' else 'configured' end,'last_movement_at',(select max(l.created_at) from public.cash_ledger l where l.account_id=ca.id)) order by case ca.account_type when 'branch_safe' then 0 when 'pos_drawer' then 1 else 2 end,ca.name),'[]') into v_cash from public.cash_accounts ca left join public.pos_devices d on d.id=ca.device_id left join lateral(select ps.id,ps.user_id from public.pos_shifts ps where ps.drawer_account_id=ca.id and ps.status='open' order by ps.opened_at desc limit 1)s on true left join public.users su on su.id=s.user_id left join public.users cu on cu.id=ca.custodian_user_id where ca.branch_id=p_branch_id and (ca.active or abs(private.cash_account_balance(ca.id))>0.005);
 select coalesce(jsonb_agg(jsonb_build_object('account_id',pa.id,'account_type',pa.account_type,'provider_code',pa.provider_code,'name',pa.name,'currency',pa.currency,'active',pa.active,'balance',round(private.payment_account_balance(pa.id),2),'responsible_user_id',pa.custodian_user_id,'responsible_user_name',u.name,'responsibility_source','configured','last_movement_at',(select max(l.created_at) from public.payment_ledger l where l.account_id=pa.id)) order by case pa.account_type when 'bank' then 0 else 1 end,pa.name),'[]') into v_payment from public.payment_accounts pa left join public.users u on u.id=pa.custodian_user_id where pa.branch_id=p_branch_id and (pa.active or abs(private.payment_account_balance(pa.id))>0.005);
 select coalesce(jsonb_agg(jsonb_build_object('user_id',u.id,'name',u.name,'role',ubr.role) order by u.name),'[]') into v_staff from public.user_branch_roles ubr join public.users u on u.id=ubr.user_id where ubr.branch_id=p_branch_id and coalesce(ubr.active,true) and coalesce(u.active,true);
 select coalesce(jsonb_agg(jsonb_build_object('advance_id',a.id,'employee_id',a.employee_id,'employee_name',u.name,'amount',a.principal_amount,'outstanding_amount',a.outstanding_amount,'status',a.status,'paid_at',a.paid_at,'payout_reference',a.payout_reference,'source_status','unlinked') order by a.paid_at desc),'[]') into v_unlinked from private.hr_salary_advances a join public.users u on u.id=a.employee_id where a.branch_id=p_branch_id and a.paid_at is not null and a.payout_source_kind is null and a.status in ('active','settled');
 select coalesce(jsonb_agg(jsonb_build_object('task_id',t.id,'advance_id',a.id,'employee_name',u.name,'amount',a.principal_amount,'source_kind',a.payout_source_kind,'source_account_id',coalesce(a.payout_cash_account_id,a.payout_payment_account_id),'source_account_name',a.payout_account_name_snapshot,'responsible_user_id',a.payout_responsible_user_id,'responsible_user_name',ru.name,'status',t.status,'created_at',t.created_at) order by t.created_at desc),'[]') into v_pending from public.operations_tasks t join private.hr_salary_advances a on a.payout_delegated_task_id=t.id join public.users u on u.id=a.employee_id left join public.users ru on ru.id=a.payout_responsible_user_id where t.branch_id=p_branch_id and t.source_kind='hr_treasury_payout' and t.status in ('claimed','in_progress','failed');
 with movements as (select cl.id,'cash'::text ledger_kind,ca.id account_id,ca.account_type,ca.name account_name,cl.entry_type,cl.signed_amount,cl.description,cl.reference_type,cl.reference_id,cl.created_at,cl.created_by,u.name actor_name from public.cash_ledger cl join public.cash_accounts ca on ca.id=cl.account_id left join public.users u on u.id=cl.created_by where cl.branch_id=p_branch_id union all select pl.id,'payment',pa.id,pa.account_type,pa.name,pl.entry_type,pl.signed_amount,pl.description,'payment_ledger',null::uuid,pl.created_at,pl.created_by,u.name from public.payment_ledger pl join public.payment_accounts pa on pa.id=pl.account_id left join public.users u on u.id=pl.created_by where pl.branch_id=p_branch_id),limited as(select * from movements order by created_at desc limit v_limit) select coalesce(jsonb_agg(jsonb_build_object('id',id,'ledger_kind',ledger_kind,'account_id',account_id,'account_type',account_type,'account_name',account_name,'entry_type',entry_type,'signed_amount',round(signed_amount,2),'description',description,'reference_type',reference_type,'reference_id',reference_id,'created_at',created_at,'created_by',created_by,'actor_name',actor_name) order by created_at desc),'[]') into v_recent from limited;
 return jsonb_build_object('version',2,'branch_id',p_branch_id,'permissions',jsonb_build_object('can_manage',v_can_manage),'cash_accounts',v_cash,'payment_accounts',v_payment,'eligible_staff',v_staff,'unlinked_salary_advances',v_unlinked,'pending_disbursements',v_pending,'recent_movements',v_recent,'generated_at',now());
end;$$;

create or replace function public.get_finance_payout_sources_v2(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.manage',p_branch_id)) then raise exception using errcode='42501',message='FINANCE_MANAGE_DENIED'; end if;
 with sources as (
  select ca.id account_id,ca.account_type source_kind,ca.name,ca.currency,private.cash_account_balance(ca.id) balance,case when ca.account_type='pos_drawer' then s.user_id else ca.custodian_user_id end responsible_user_id,case when ca.account_type='pos_drawer' then su.name else cu.name end responsible_user_name,case when ca.account_type='pos_drawer' then s.id else null end shift_id from public.cash_accounts ca left join lateral(select ps.id,ps.user_id from public.pos_shifts ps where ps.drawer_account_id=ca.id and ps.status='open' order by ps.opened_at desc limit 1)s on true left join public.users su on su.id=s.user_id left join public.users cu on cu.id=ca.custodian_user_id where ca.branch_id=p_branch_id and ca.account_type in ('branch_safe','pos_drawer') and ca.active
  union all
  select pa.id,'bank',pa.name,pa.currency,private.payment_account_balance(pa.id),pa.custodian_user_id,u.name,null::uuid from public.payment_accounts pa left join public.users u on u.id=pa.custodian_user_id where pa.branch_id=p_branch_id and pa.account_type='bank' and pa.active
 ) select coalesce(jsonb_agg(jsonb_build_object('account_id',account_id,'source_kind',source_kind,'name',name,'currency',currency,'balance',round(balance,2),'responsible_user_id',responsible_user_id,'responsible_user_name',responsible_user_name,'shift_id',shift_id,'assignable',responsible_user_id is not null) order by case source_kind when 'branch_safe' then 0 when 'pos_drawer' then 1 else 2 end,name),'[]') into v_items from sources;
 return jsonb_build_object('version',2,'branch_id',p_branch_id,'items',v_items,'generated_at',now());
end;$$;

create or replace function private.operations_task_can_claim(p_source_kind text,p_branch_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select case
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
  when p_source_kind='hr_treasury_payout' then public.has_branch_access(auth.uid(),p_branch_id)
  when p_source_kind='hr_attendance_correction_apply' then public.staff_has_permission('hr.attendance.manage',p_branch_id) or public.staff_has_permission('branch.manage_staff',p_branch_id)
  else false end;
$$;

create or replace function public.delegate_hr_salary_advance_payout_v3(p_task_id uuid,p_source_kind text,p_source_account_id uuid,p_note text,p_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_task public.operations_tasks%rowtype;v_r private.hr_requests%rowtype;v_a private.hr_salary_advances%rowtype;v_res jsonb;v_resp uuid;v_resp_name text;v_account_name text;v_balance numeric;v_child public.operations_tasks%rowtype;v_employee_name text;
begin
 if v_uid is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if p_source_kind not in ('branch_safe','pos_drawer','bank') or p_source_account_id is null then raise exception using errcode='22023',message='HR_PAYOUT_SOURCE_REQUIRED'; end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception using errcode='22023',message='HR_PAYOUT_NOTE_REQUIRED'; end if;
 select * into v_task from public.operations_tasks where id=p_task_id for update; if v_task.id is null or v_task.source_kind<>'hr_salary_advance_payout' then raise exception using errcode='22023',message='HR_ADVANCE_PAYOUT_TASK_NOT_FOUND'; end if;
 select * into v_r from private.hr_requests where id=v_task.source_id for update; select * into v_a from private.hr_salary_advances where request_id=v_r.id for update; if v_r.id is null or v_a.id is null then raise exception using errcode='22023',message='HR_ADVANCE_NOT_FOUND'; end if;
 if not (private.staff_is_super_admin(v_uid) or public.staff_has_permission('finance.manage',v_r.branch_id)) then raise exception using errcode='42501',message='HR_ADVANCE_PAYOUT_DENIED'; end if;
 if v_a.status<>'pending_payout' then raise exception using errcode='55000',message='HR_ADVANCE_NOT_PENDING_PAYOUT'; end if;
 v_res:=private.resolve_finance_account_custodian_v1(v_r.branch_id,p_source_kind,p_source_account_id); if v_res is null then raise exception using errcode='22023',message='HR_PAYOUT_SOURCE_UNAVAILABLE'; end if;
 v_resp:=nullif(v_res->>'responsible_user_id','')::uuid;v_resp_name:=v_res->>'responsible_user_name';v_account_name:=v_res->>'account_name';v_balance:=coalesce((v_res->>'balance')::numeric,0);
 if v_resp is null then raise exception using errcode='55000',message='HR_PAYOUT_SOURCE_HAS_NO_RESPONSIBLE'; end if;
 if not exists(select 1 from public.users u where u.id=v_resp and coalesce(u.active,true) and public.has_branch_access(u.id,v_r.branch_id)) then raise exception using errcode='55000',message='HR_PAYOUT_RESPONSIBLE_UNAVAILABLE'; end if;
 if round(v_a.principal_amount,2)>round(v_balance,2) then raise exception using errcode='22023',message='HR_PAYOUT_INSUFFICIENT_BALANCE'; end if;
 if v_a.payout_delegated_task_id is not null then select * into v_child from public.operations_tasks where id=v_a.payout_delegated_task_id; end if;
 if v_child.id is not null and v_child.status in ('claimed','in_progress') then
   if v_a.payout_source_kind=p_source_kind and coalesce(v_a.payout_cash_account_id,v_a.payout_payment_account_id)=p_source_account_id and v_a.payout_responsible_user_id=v_resp then return jsonb_build_object('ok',true,'idempotent',true,'delegated_task_id',v_child.id,'responsible_user_id',v_resp,'responsible_user_name',v_resp_name,'source_account_name',v_account_name); end if;
   raise exception using errcode='55000',message='HR_PAYOUT_ALREADY_DELEGATED';
 end if;
 if v_task.status='open' then update public.operations_tasks set status='in_progress',claimed_by=v_uid,claimed_at=now(),started_at=now(),updated_at=now() where id=v_task.id returning * into v_task; elsif v_task.claimed_by is distinct from v_uid then raise exception using errcode='42501',message='TASK_NOT_OWNER'; elsif v_task.status in ('claimed','failed') then update public.operations_tasks set status='in_progress',started_at=coalesce(started_at,now()),failure_reason=null,updated_at=now() where id=v_task.id returning * into v_task; elsif v_task.status<>'in_progress' then raise exception using errcode='55000',message='TASK_NOT_COMPLETABLE'; end if;
 select name into v_employee_name from public.users where id=v_a.employee_id;
 insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,claimed_by,claimed_at,metadata,created_by)
 values(v_r.branch_id,'treasury_disbursement','hr_treasury_payout',v_a.id,0,'high','claimed','صرف عهدة مالية معتمدة','راجع عملية الصرف من '||v_account_name||' ثم أكد بعد تسليم المبلغ.',v_resp,now(),jsonb_build_object('parent_task_id',v_task.id,'advance_id',v_a.id,'employee_id',v_a.employee_id,'source_kind',p_source_kind,'source_account_id',p_source_account_id,'source_account_name',v_account_name,'responsible_user_id',v_resp,'reference',nullif(trim(coalesce(p_reference,'')),''),'sensitive',true),v_uid) returning * into v_child;
 update private.hr_salary_advances set payout_source_kind=p_source_kind,payout_cash_account_id=case when p_source_kind in ('branch_safe','pos_drawer') then p_source_account_id else null end,payout_payment_account_id=case when p_source_kind='bank' then p_source_account_id else null end,payout_account_name_snapshot=v_account_name,payout_responsible_user_id=v_resp,payout_requested_by=v_uid,payout_requested_at=now(),payout_delegated_task_id=v_child.id,payout_reference=nullif(trim(coalesce(p_reference,'')),''),payout_note=trim(p_note),payout_cash_ledger_id=null,payout_payment_ledger_id=null,updated_at=now() where id=v_a.id;
 update public.operations_tasks set metadata=coalesce(metadata,'{}')||jsonb_build_object('delegated_task_id',v_child.id,'payout_source_kind',p_source_kind,'payout_source_account_id',p_source_account_id,'payout_source_name',v_account_name,'payout_responsible_user_id',v_resp,'payout_responsible_user_name',v_resp_name),updated_at=now() where id=v_task.id;
 insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata) values(v_task.id,'delegated',v_uid,trim(p_note),jsonb_build_object('delegated_task_id',v_child.id,'source_kind',p_source_kind,'source_account_id',p_source_account_id,'source_name',v_account_name,'responsible_user_id',v_resp,'responsible_user_name',v_resp_name));
 return jsonb_build_object('ok',true,'idempotent',false,'delegated_task_id',v_child.id,'responsible_user_id',v_resp,'responsible_user_name',v_resp_name,'source_kind',p_source_kind,'source_account_id',p_source_account_id,'source_account_name',v_account_name,'balance',v_balance,'amount',v_a.principal_amount,'employee_name',v_employee_name);
end;$$;

create or replace function public.delegate_legacy_hr_salary_advance_source_v1(p_advance_id uuid,p_source_kind text,p_source_account_id uuid,p_note text,p_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_a private.hr_salary_advances%rowtype;v_res jsonb;v_resp uuid;v_resp_name text;v_account_name text;v_balance numeric;v_task public.operations_tasks%rowtype;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 select * into v_a from private.hr_salary_advances where id=p_advance_id for update;if v_a.id is null then raise exception using errcode='22023',message='HR_ADVANCE_NOT_FOUND';end if;
 if not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.manage',v_a.branch_id)) then raise exception using errcode='42501',message='HR_ADVANCE_PAYOUT_DENIED';end if;
 if v_a.paid_at is null or v_a.status not in ('active','settled') or v_a.payout_source_kind is not null then raise exception using errcode='55000',message='HR_ADVANCE_NOT_UNLINKED';end if;
 if p_source_kind not in ('branch_safe','pos_drawer','bank') then raise exception using errcode='22023',message='HR_PAYOUT_SOURCE_REQUIRED';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception using errcode='22023',message='HR_PAYOUT_NOTE_REQUIRED';end if;
 v_res:=private.resolve_finance_account_custodian_v1(v_a.branch_id,p_source_kind,p_source_account_id);if v_res is null then raise exception using errcode='22023',message='HR_PAYOUT_SOURCE_UNAVAILABLE';end if;
 v_resp:=nullif(v_res->>'responsible_user_id','')::uuid;v_resp_name:=v_res->>'responsible_user_name';v_account_name:=v_res->>'account_name';v_balance:=coalesce((v_res->>'balance')::numeric,0);
 if v_resp is null then raise exception using errcode='55000',message='HR_PAYOUT_SOURCE_HAS_NO_RESPONSIBLE';end if;
 if round(v_a.principal_amount,2)>round(v_balance,2) then raise exception using errcode='22023',message='HR_PAYOUT_INSUFFICIENT_BALANCE';end if;
 insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,claimed_by,claimed_at,metadata,created_by)
 values(v_a.branch_id,'treasury_disbursement','hr_treasury_payout',v_a.id,0,'high','claimed','تسوية صرف سلفة سابقة','أكد مصدر الصرف التاريخي من '||v_account_name||' بعد مراجعة المستندات.',v_resp,now(),jsonb_build_object('legacy_reconciliation',true,'advance_id',v_a.id,'source_kind',p_source_kind,'source_account_id',p_source_account_id,'source_account_name',v_account_name,'responsible_user_id',v_resp,'reference',coalesce(nullif(trim(coalesce(p_reference,'')),''),v_a.payout_reference),'sensitive',true),auth.uid()) returning * into v_task;
 update private.hr_salary_advances set payout_source_kind=p_source_kind,payout_cash_account_id=case when p_source_kind in ('branch_safe','pos_drawer') then p_source_account_id else null end,payout_payment_account_id=case when p_source_kind='bank' then p_source_account_id else null end,payout_account_name_snapshot=v_account_name,payout_responsible_user_id=v_resp,payout_requested_by=auth.uid(),payout_requested_at=now(),payout_delegated_task_id=v_task.id,payout_note=trim(p_note),payout_reference=coalesce(nullif(trim(coalesce(p_reference,'')),''),payout_reference),updated_at=now() where id=v_a.id;
 return jsonb_build_object('ok',true,'delegated_task_id',v_task.id,'responsible_user_id',v_resp,'responsible_user_name',v_resp_name,'source_account_name',v_account_name,'balance',v_balance,'amount',v_a.principal_amount);
end;$$;

create or replace function public.get_my_hr_treasury_payout_task_v1(p_task_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_task public.operations_tasks%rowtype;v_a private.hr_salary_advances%rowtype;v_parent uuid;v_emp text;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 select * into v_task from public.operations_tasks where id=p_task_id and source_kind='hr_treasury_payout';if v_task.id is null then raise exception using errcode='22023',message='TREASURY_TASK_NOT_FOUND';end if;
 if v_task.claimed_by is distinct from auth.uid() and not (private.staff_is_super_admin(auth.uid()) or public.staff_has_permission('finance.manage',v_task.branch_id)) then raise exception using errcode='42501',message='TREASURY_TASK_ACCESS_DENIED';end if;
 select * into v_a from private.hr_salary_advances where id=v_task.source_id;if v_a.id is null then raise exception using errcode='22023',message='HR_ADVANCE_NOT_FOUND';end if;
 select name into v_emp from public.users where id=v_a.employee_id;v_parent:=nullif(v_task.metadata->>'parent_task_id','')::uuid;
 return jsonb_build_object('task',jsonb_build_object('id',v_task.id,'status',v_task.status,'claimed_by',v_task.claimed_by,'created_at',v_task.created_at),'advance',jsonb_build_object('id',v_a.id,'employee_id',v_a.employee_id,'employee_name',v_emp,'amount',v_a.principal_amount,'outstanding_amount',v_a.outstanding_amount,'status',v_a.status,'original_paid_at',v_a.paid_at,'legacy_reconciliation',coalesce((v_task.metadata->>'legacy_reconciliation')::boolean,false)),'source',jsonb_build_object('kind',v_a.payout_source_kind,'account_id',coalesce(v_a.payout_cash_account_id,v_a.payout_payment_account_id),'account_name',v_a.payout_account_name_snapshot,'responsible_user_id',v_a.payout_responsible_user_id,'balance',case when v_a.payout_source_kind in ('branch_safe','pos_drawer') then private.cash_account_balance(v_a.payout_cash_account_id) else private.payment_account_balance(v_a.payout_payment_account_id) end),'reference',v_a.payout_reference,'parent_task_id',v_parent);
end;$$;

create or replace function public.confirm_hr_treasury_payout_v1(p_task_id uuid,p_note text,p_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_task public.operations_tasks%rowtype;v_a private.hr_salary_advances%rowtype;v_parent uuid;v_cash public.cash_accounts%rowtype;v_bank public.payment_accounts%rowtype;v_balance numeric;v_ledger uuid;v_legacy boolean;v_ref text;v_emp text;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception using errcode='22023',message='TREASURY_CONFIRM_NOTE_REQUIRED';end if;
 select * into v_task from public.operations_tasks where id=p_task_id for update;if v_task.id is null or v_task.source_kind<>'hr_treasury_payout' then raise exception using errcode='22023',message='TREASURY_TASK_NOT_FOUND';end if;
 if v_task.status='completed' then return jsonb_build_object('ok',true,'idempotent',true,'task_id',v_task.id);end if;
 if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TREASURY_TASK_NOT_OWNER';end if;
 if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TREASURY_TASK_NOT_CONFIRMABLE';end if;
 select * into v_a from private.hr_salary_advances where id=v_task.source_id for update;if v_a.id is null then raise exception using errcode='22023',message='HR_ADVANCE_NOT_FOUND';end if;
 if v_a.payout_responsible_user_id is distinct from auth.uid() or v_a.payout_delegated_task_id is distinct from v_task.id then raise exception using errcode='42501',message='TREASURY_RESPONSIBILITY_CHANGED';end if;
 v_legacy:=coalesce((v_task.metadata->>'legacy_reconciliation')::boolean,false);v_ref:=coalesce(nullif(trim(coalesce(p_reference,'')),''),v_a.payout_reference);select name into v_emp from public.users where id=v_a.employee_id;
 if v_a.payout_source_kind in ('branch_safe','pos_drawer') then
   select * into v_cash from public.cash_accounts where id=v_a.payout_cash_account_id and branch_id=v_a.branch_id and account_type=v_a.payout_source_kind and active;if v_cash.id is null then raise exception using errcode='22023',message='TREASURY_SOURCE_UNAVAILABLE';end if;
   if v_a.payout_source_kind='branch_safe' and v_cash.custodian_user_id is distinct from auth.uid() then raise exception using errcode='42501',message='TREASURY_RESPONSIBILITY_CHANGED';end if;
   if v_a.payout_source_kind='pos_drawer' and not exists(select 1 from public.pos_shifts s where s.drawer_account_id=v_cash.id and s.status='open' and s.user_id=auth.uid()) then raise exception using errcode='42501',message='TREASURY_DRAWER_SHIFT_CHANGED';end if;
   perform pg_advisory_xact_lock(hashtextextended('cash-account:'||v_cash.id::text,101));v_balance:=private.cash_account_balance(v_cash.id);if round(v_a.principal_amount,2)>round(v_balance,2) then raise exception using errcode='22023',message='TREASURY_INSUFFICIENT_BALANCE';end if;
   insert into public.cash_ledger(account_id,branch_id,user_id,entry_type,signed_amount,reference_type,reference_id,description,metadata,created_by) values(v_cash.id,v_a.branch_id,v_a.employee_id,case when v_legacy then 'hr_salary_advance_legacy_reconciliation' else 'hr_salary_advance_payout' end,-round(v_a.principal_amount,2),'hr_salary_advance',v_a.id,case when v_legacy then 'تأكيد مصدر صرف سلفة سابقة: ' else 'صرف سلفة للموظف: ' end||coalesce(v_emp,''),jsonb_build_object('treasury_task_id',v_task.id,'responsible_user_id',auth.uid(),'reference',v_ref,'legacy_reconciliation',v_legacy),auth.uid()) returning id into v_ledger;
 else
   select * into v_bank from public.payment_accounts where id=v_a.payout_payment_account_id and branch_id=v_a.branch_id and account_type='bank' and active;if v_bank.id is null then raise exception using errcode='22023',message='TREASURY_SOURCE_UNAVAILABLE';end if;if v_bank.custodian_user_id is distinct from auth.uid() then raise exception using errcode='42501',message='TREASURY_RESPONSIBILITY_CHANGED';end if;
   perform pg_advisory_xact_lock(hashtextextended('payment-account:'||v_bank.id::text,102));v_balance:=private.payment_account_balance(v_bank.id);if round(v_a.principal_amount,2)>round(v_balance,2) then raise exception using errcode='22023',message='TREASURY_INSUFFICIENT_BALANCE';end if;
   insert into public.payment_ledger(account_id,branch_id,entry_type,signed_amount,payment_method,external_reference,description,metadata,created_by) values(v_bank.id,v_a.branch_id,case when v_legacy then 'hr_salary_advance_legacy_reconciliation' else 'hr_salary_advance_payout' end,-round(v_a.principal_amount,2),'bank',v_ref,case when v_legacy then 'تأكيد مصدر صرف سلفة سابقة: ' else 'صرف سلفة للموظف: ' end||coalesce(v_emp,''),jsonb_build_object('advance_id',v_a.id,'treasury_task_id',v_task.id,'responsible_user_id',auth.uid(),'legacy_reconciliation',v_legacy),auth.uid()) returning id into v_ledger;
 end if;
 update private.hr_salary_advances set payout_reference=v_ref,payout_cash_ledger_id=case when payout_source_kind in ('branch_safe','pos_drawer') then v_ledger else null end,payout_payment_ledger_id=case when payout_source_kind='bank' then v_ledger else null end,paid_by=coalesce(paid_by,auth.uid()),payout_note=trim(p_note),source_reconciled_by=case when v_legacy then auth.uid() else source_reconciled_by end,source_reconciled_at=case when v_legacy then now() else source_reconciled_at end,status=case when v_legacy then status else 'active' end,paid_at=case when v_legacy then paid_at else now() end,updated_at=now() where id=v_a.id returning * into v_a;
 update public.operations_tasks set status='completed',started_at=coalesce(started_at,now()),completed_by=auth.uid(),completed_at=now(),failure_reason=null,metadata=coalesce(metadata,'{}')||jsonb_build_object('resolution_note',trim(p_note),'ledger_entry_id',v_ledger,'confirmed_at',now()),updated_at=now() where id=v_task.id;
 insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata) values(v_task.id,'completed',auth.uid(),trim(p_note),jsonb_build_object('ledger_entry_id',v_ledger,'source_account_id',coalesce(v_a.payout_cash_account_id,v_a.payout_payment_account_id),'reference',v_ref));
 if not v_legacy then
   update private.hr_requests set status='fulfilled',fulfilled_at=now(),updated_at=now() where id=v_a.request_id;
   v_parent:=nullif(v_task.metadata->>'parent_task_id','')::uuid;if v_parent is not null then update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),failure_reason=null,metadata=coalesce(metadata,'{}')||jsonb_build_object('treasury_confirmed_task_id',v_task.id,'ledger_entry_id',v_ledger,'confirmed_by',auth.uid()),updated_at=now() where id=v_parent and status in ('claimed','in_progress','failed');insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata) values(v_parent,'completed',auth.uid(),'تم تأكيد صرف السلفة من مسؤول الخزنة',jsonb_build_object('treasury_task_id',v_task.id,'ledger_entry_id',v_ledger));end if;
 end if;
 insert into private.hr_audit_log(entity_type,entity_id,action,actor_user_id,branch_id,after_data) values('salary_advance',v_a.id,case when v_legacy then 'payout_source_reconciled' else 'paid' end,auth.uid(),v_a.branch_id,jsonb_build_object('amount',v_a.principal_amount,'source_kind',v_a.payout_source_kind,'source_account_id',coalesce(v_a.payout_cash_account_id,v_a.payout_payment_account_id),'source_name',v_a.payout_account_name_snapshot,'ledger_entry_id',v_ledger,'treasury_task_id',v_task.id,'reference',v_ref));
 return jsonb_build_object('ok',true,'idempotent',false,'advance_id',v_a.id,'amount',v_a.principal_amount,'source_kind',v_a.payout_source_kind,'source_account_id',coalesce(v_a.payout_cash_account_id,v_a.payout_payment_account_id),'source_account_name',v_a.payout_account_name_snapshot,'source_balance_after',case when v_a.payout_source_kind in ('branch_safe','pos_drawer') then private.cash_account_balance(v_a.payout_cash_account_id) else private.payment_account_balance(v_a.payout_payment_account_id) end,'legacy_reconciliation',v_legacy);
end;$$;

create or replace function public.reject_hr_treasury_payout_v1(p_task_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_task public.operations_tasks%rowtype;v_a private.hr_salary_advances%rowtype;v_parent uuid;v_legacy boolean;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;if length(trim(coalesce(p_reason,'')))<3 then raise exception using errcode='22023',message='TREASURY_REJECTION_REASON_REQUIRED';end if;
 select * into v_task from public.operations_tasks where id=p_task_id for update;if v_task.id is null or v_task.source_kind<>'hr_treasury_payout' then raise exception using errcode='22023',message='TREASURY_TASK_NOT_FOUND';end if;if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TREASURY_TASK_NOT_OWNER';end if;if v_task.status not in ('claimed','in_progress','failed') then raise exception using errcode='55000',message='TREASURY_TASK_NOT_REJECTABLE';end if;
 select * into v_a from private.hr_salary_advances where id=v_task.source_id for update;if v_a.id is null then raise exception using errcode='22023',message='HR_ADVANCE_NOT_FOUND';end if;v_legacy:=coalesce((v_task.metadata->>'legacy_reconciliation')::boolean,false);v_parent:=nullif(v_task.metadata->>'parent_task_id','')::uuid;
 update public.operations_tasks set status='cancelled',completed_by=auth.uid(),completed_at=now(),failure_reason=trim(p_reason),updated_at=now() where id=v_task.id;insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'rejected',auth.uid(),trim(p_reason));
 update private.hr_salary_advances set payout_source_kind=null,payout_cash_account_id=null,payout_payment_account_id=null,payout_account_name_snapshot=null,payout_responsible_user_id=null,payout_requested_by=null,payout_requested_at=null,payout_delegated_task_id=null,payout_cash_ledger_id=null,payout_payment_ledger_id=null,updated_at=now() where id=v_a.id;
 if not v_legacy and v_parent is not null then update public.operations_tasks set status='failed',failure_reason='رفض مسؤول الخزنة: '||trim(p_reason),metadata=coalesce(metadata,'{}')||jsonb_build_object('treasury_rejected_task_id',v_task.id,'treasury_rejection_reason',trim(p_reason)),updated_at=now() where id=v_parent and status in ('claimed','in_progress','failed');insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_parent,'failed',auth.uid(),'رفض مسؤول الخزنة: '||trim(p_reason));end if;
 return jsonb_build_object('ok',true,'advance_id',v_a.id,'legacy_reconciliation',v_legacy,'status','returned_to_finance');
end;$$;

create or replace function public.complete_hr_salary_advance_payout_v2(p_task_id uuid,p_source_kind text,p_source_account_id uuid,p_note text,p_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$begin if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;raise exception using errcode='55000',message='HR_PAYOUT_DELEGATION_REQUIRED';end;$$;
create or replace function public.reconcile_hr_salary_advance_payout_source_v1(p_advance_id uuid,p_source_kind text,p_source_account_id uuid,p_note text,p_reference text default null)
returns jsonb language plpgsql security definer set search_path='' as $$begin if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;raise exception using errcode='55000',message='HR_PAYOUT_DELEGATION_REQUIRED';end;$$;

create or replace function public.complete_operations_task(p_task_id uuid,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$declare v_task public.operations_tasks%rowtype;v_note text;begin if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;v_note:=nullif(trim(coalesce(p_note,'')),'');if v_note is null or length(v_note)<3 then raise exception using errcode='22023',message='TASK_COMPLETION_NOTE_REQUIRED';end if;select * into v_task from public.operations_tasks where id=p_task_id for update;if v_task.id is null then raise exception using errcode='22023',message='TASK_NOT_FOUND';end if;if v_task.task_type in ('refund_transfer','inventory_daily_count','inventory_variance_recount','inventory_adjustment_review','inventory_transfer_dispatch','inventory_transfer_receive','hr_request_review','hr_salary_advance_payout','hr_attendance_correction_apply','treasury_disbursement') then raise exception using errcode='55000',message='TASK_REQUIRES_SPECIAL_COMPLETION';end if;if v_task.status='completed' then return to_jsonb(v_task)||jsonb_build_object('idempotent',true);end if;if v_task.claimed_by is distinct from auth.uid() then raise exception using errcode='42501',message='TASK_NOT_OWNER';end if;if not private.operations_task_can_claim(v_task.source_kind,v_task.branch_id) then raise exception using errcode='42501',message='TASK_ACTION_DENIED';end if;if v_task.status not in ('claimed','in_progress') then raise exception using errcode='55000',message='TASK_NOT_COMPLETABLE';end if;update public.operations_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),updated_at=now(),failure_reason=null,metadata=coalesce(metadata,'{}')||jsonb_build_object('resolution_note',v_note,'resolved_at',now(),'resolved_by',auth.uid()) where id=v_task.id returning * into v_task;insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'completed',auth.uid(),v_note);return to_jsonb(v_task)||jsonb_build_object('idempotent',false);end$$;

create or replace function public.release_operations_task(p_task_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path='' as $$declare v_task public.operations_tasks%rowtype;begin if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED';end if;select * into v_task from public.operations_tasks where id=p_task_id for update;if v_task.id is null then raise exception using errcode='22023',message='TASK_NOT_FOUND';end if;if v_task.source_kind='hr_treasury_payout' then raise exception using errcode='55000',message='TASK_REQUIRES_SPECIAL_COMPLETION';end if;if v_task.status not in ('claimed','in_progress','failed') then raise exception using errcode='55000',message='TASK_NOT_RELEASABLE';end if;if v_task.claimed_by is distinct from auth.uid() and not public.staff_has_permission('finance.manage',v_task.branch_id) and not (v_task.source_kind='shift_reconciliation' and public.staff_has_permission('pos.manage_shifts',v_task.branch_id)) then raise exception using errcode='42501',message='TASK_RELEASE_DENIED';end if;update public.operations_tasks set status='open',claimed_by=null,claimed_at=null,started_at=null,failure_reason=null,updated_at=now() where id=v_task.id returning * into v_task;insert into public.operations_task_events(task_id,event_type,actor_id,note) values(v_task.id,'released',auth.uid(),nullif(trim(coalesce(p_note,'')),''));return to_jsonb(v_task);end$$;

-- Hide sensitive HR finance tasks from unrelated branch staff in the generic queue.
do $$declare v_def text;begin
 select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='list_operations_tasks' and pg_get_function_identity_arguments(p.oid)='p_branch_id uuid, p_scope text, p_limit integer';
 if v_def is null then raise exception 'list_operations_tasks definition not found';end if;
 if position('where t.branch_id=p_branch_id' in v_def)=0 then raise exception 'list_operations_tasks expected clause not found';end if;
 v_def:=replace(v_def,'where t.branch_id=p_branch_id','where t.branch_id=p_branch_id and (t.source_kind not in (''hr_request'',''hr_salary_advance_payout'',''hr_treasury_payout'') or t.claimed_by=auth.uid() or public.staff_has_permission(''finance.manage'',t.branch_id) or public.staff_has_permission(''hr.manage_employees'',t.branch_id) or private.staff_is_super_admin(auth.uid()))');
 execute v_def;
end$$;

revoke all on function public.set_finance_account_custodian_v1(uuid,text,uuid,uuid) from public,anon;
revoke all on function public.get_finance_treasury_workspace_v2(uuid,integer) from public,anon;
revoke all on function public.get_finance_payout_sources_v2(uuid) from public,anon;
revoke all on function public.delegate_hr_salary_advance_payout_v3(uuid,text,uuid,text,text) from public,anon;
revoke all on function public.delegate_legacy_hr_salary_advance_source_v1(uuid,text,uuid,text,text) from public,anon;
revoke all on function public.get_my_hr_treasury_payout_task_v1(uuid) from public,anon;
revoke all on function public.confirm_hr_treasury_payout_v1(uuid,text,text) from public,anon;
revoke all on function public.reject_hr_treasury_payout_v1(uuid,text) from public,anon;
grant execute on function public.set_finance_account_custodian_v1(uuid,text,uuid,uuid) to authenticated;
grant execute on function public.get_finance_treasury_workspace_v2(uuid,integer) to authenticated;
grant execute on function public.get_finance_payout_sources_v2(uuid) to authenticated;
grant execute on function public.delegate_hr_salary_advance_payout_v3(uuid,text,uuid,text,text) to authenticated;
grant execute on function public.delegate_legacy_hr_salary_advance_source_v1(uuid,text,uuid,text,text) to authenticated;
grant execute on function public.get_my_hr_treasury_payout_task_v1(uuid) to authenticated;
grant execute on function public.confirm_hr_treasury_payout_v1(uuid,text,text) to authenticated;
grant execute on function public.reject_hr_treasury_payout_v1(uuid,text) to authenticated;
