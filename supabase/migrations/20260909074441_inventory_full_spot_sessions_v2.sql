alter table private.inventory_audit_sessions_v2
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists scope_type text not null default 'all',
  add column if not exists scope_filter jsonb not null default '{}'::jsonb,
  add column if not exists due_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid;

alter table private.inventory_audit_sessions_v2
  drop constraint if exists inventory_audit_sessions_v2_scope_type_check;
alter table private.inventory_audit_sessions_v2
  add constraint inventory_audit_sessions_v2_scope_type_check
  check (scope_type in ('weighted','all','main_category','subcategory','company','shelf','custom'));

alter table private.inventory_audit_sessions_v2
  drop constraint if exists inventory_audit_sessions_v2_items_per_employee_check;
alter table private.inventory_audit_sessions_v2
  add constraint inventory_audit_sessions_v2_items_per_employee_check check (items_per_employee between 1 and 5000);

alter table private.inventory_audit_counts_v2
  drop constraint if exists inventory_audit_counts_v2_branch_id_audit_date_product_id_key;
alter table private.inventory_audit_counts_v2
  add constraint inventory_audit_counts_v2_session_product_key unique(session_id,product_id);

alter table private.inventory_audit_counts_v2 drop constraint if exists inventory_audit_counts_v2_status_check;
alter table private.inventory_audit_counts_v2 add constraint inventory_audit_counts_v2_status_check check(status in (
  'assigned','counting','matched','discrepancy','resolved_no_adjustment','review_required','adjusted','cancelled'
));
alter table private.inventory_audit_recounts_v2 drop constraint if exists inventory_audit_recounts_v2_status_check;
alter table private.inventory_audit_recounts_v2 add constraint inventory_audit_recounts_v2_status_check check(status in (
  'assigned','counting','matched_system','confirmed_variance','conflicting','cancelled'
));

create index if not exists inventory_audit_sessions_v2_branch_status_idx on private.inventory_audit_sessions_v2(branch_id,status,generated_at desc);
create index if not exists inventory_audit_counts_v2_session_status_idx on private.inventory_audit_counts_v2(session_id,status,assigned_to);

create or replace function private.refresh_inventory_audit_session_v2(p_session_id uuid)
returns void language plpgsql security definer set search_path=''
as $function$
declare v_total int; v_submitted int; v_match int; v_diff int; v_resolved int; v_current_status text;
begin
  select status into v_current_status from private.inventory_audit_sessions_v2 where id=p_session_id for update;
  if v_current_status is null then return; end if;
  select count(*)::int,
         count(*) filter(where submitted_at is not null)::int,
         count(*) filter(where status in ('matched','resolved_no_adjustment'))::int,
         count(*) filter(where submitted_at is not null and abs(coalesce(variance,0))>0.001)::int,
         count(*) filter(where status in ('matched','resolved_no_adjustment','adjusted'))::int
    into v_total,v_submitted,v_match,v_diff,v_resolved
  from private.inventory_audit_counts_v2 where session_id=p_session_id and status<>'cancelled';
  update private.inventory_audit_sessions_v2
     set total_tasks=coalesce(v_total,0),completed_tasks=coalesce(v_submitted,0),matched_tasks=coalesce(v_match,0),discrepancy_tasks=coalesce(v_diff,0),
         status=case when v_current_status='cancelled' then 'cancelled' when coalesce(v_total,0)>0 and coalesce(v_resolved,0)>=coalesce(v_total,0) then 'completed' else 'active' end,
         completed_at=case when v_current_status='cancelled' then completed_at when coalesce(v_total,0)>0 and coalesce(v_resolved,0)>=coalesce(v_total,0) then coalesce(completed_at,now()) else null end
   where id=p_session_id;
end;$function$;

create or replace function public.get_inventory_audit_setup_v2(p_branch_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_inventory_branch uuid; v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='INVENTORY_BRANCH_ACCESS_DENIED'; end if;
  if not (public.staff_has_permission('inventory.manage_sessions',p_branch_id) or public.staff_has_permission('inventory.manage',p_branch_id)) then raise exception using errcode='42501',message='INVENTORY_SESSION_MANAGE_DENIED'; end if;
  select coalesce(inventory_source_branch_id,id) into v_inventory_branch from public.branches where id=p_branch_id and active;
  if v_inventory_branch is null then raise exception using errcode='22023',message='BRANCH_NOT_FOUND'; end if;
  select jsonb_build_object(
    'inventory_products',(select count(*) from public.inventory where branch_id=v_inventory_branch),
    'categories',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'products',x.products) order by x.name) from (select mc.id,mc.name,count(*)::int products from public.inventory i join public.products p on p.id=i.product_id join public.main_categories mc on mc.id=p.main_category_id where i.branch_id=v_inventory_branch group by mc.id,mc.name) x),'[]'::jsonb),
    'subcategories',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'category_id',x.category_id,'products',x.products) order by x.name) from (select sc.id,sc.name,sc.category_id,count(*)::int products from public.inventory i join public.products p on p.id=i.product_id join public.subcategories sc on sc.id=p.subcategory_id where i.branch_id=v_inventory_branch group by sc.id,sc.name,sc.category_id) x),'[]'::jsonb),
    'companies',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'products',x.products) order by x.name) from (select c.id,c.name,count(*)::int products from public.inventory i join public.products p on p.id=i.product_id join public.companies c on c.id=p.company_id where i.branch_id=v_inventory_branch group by c.id,c.name) x),'[]'::jsonb),
    'shelves',coalesce((select jsonb_agg(jsonb_build_object('name',x.shelf,'products',x.products) order by x.shelf) from (select trim(p.shelf_location) shelf,count(*)::int products from public.inventory i join public.products p on p.id=i.product_id where i.branch_id=v_inventory_branch and nullif(trim(coalesce(p.shelf_location,'')),'') is not null group by trim(p.shelf_location)) x),'[]'::jsonb),
    'staff',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'role_name',x.role_name) order by x.name) from (select distinct u.id,u.name,r.name_ar role_name from public.user_branch_roles ubr join public.users u on u.id=ubr.user_id and coalesce(u.active,true) join public.staff_roles r on r.id=ubr.role_id and r.active join public.staff_role_permissions rp on rp.role_id=ubr.role_id join public.staff_permissions sp on sp.id=rp.permission_id and sp.code='inventory.count' where ubr.branch_id=p_branch_id and ubr.active) x),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;$function$;

create or replace function public.search_inventory_audit_products_v2(p_branch_id uuid,p_search text default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_inventory_branch uuid; v_limit int:=least(greatest(coalesce(p_limit,50),1),100); v_q text:=lower(trim(coalesce(p_search,''))); v_rows jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='INVENTORY_BRANCH_ACCESS_DENIED'; end if;
  if not (public.staff_has_permission('inventory.manage_sessions',p_branch_id) or public.staff_has_permission('inventory.manage',p_branch_id)) then raise exception using errcode='42501',message='INVENTORY_SESSION_MANAGE_DENIED'; end if;
  select coalesce(inventory_source_branch_id,id) into v_inventory_branch from public.branches where id=p_branch_id and active;
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'barcode',x.barcode,'shelf_location',x.shelf_location,'unit_of_measure',x.unit_of_measure,'category_name',x.category_name,'subcategory_name',x.subcategory_name) order by x.name),'[]'::jsonb)
  into v_rows from (
    select p.id,p.name,p.barcode,p.shelf_location,coalesce(p.unit_of_measure,p.base_unit,'قطعة') unit_of_measure,coalesce(mc.name,'بدون قسم') category_name,coalesce(sc.name,'بدون قسم فرعي') subcategory_name
    from public.inventory i join public.products p on p.id=i.product_id left join public.main_categories mc on mc.id=p.main_category_id left join public.subcategories sc on sc.id=p.subcategory_id
    where i.branch_id=v_inventory_branch and (v_q='' or lower(p.name) like '%'||v_q||'%' or lower(coalesce(p.barcode,'')) like '%'||v_q||'%' or lower(coalesce(p.shelf_location,'')) like '%'||v_q||'%')
    order by case when v_q<>'' and lower(coalesce(p.barcode,''))=v_q then 0 else 1 end,p.name limit v_limit
  ) x;
  return v_rows;
end;$function$;

create or replace function public.create_inventory_audit_session_v2(
  p_branch_id uuid,p_audit_kind text,p_title text default null,p_description text default null,p_scope_type text default 'all',p_scope_filter jsonb default '{}'::jsonb,p_assignee_id uuid default null,p_due_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_kind text:=lower(trim(coalesce(p_audit_kind,''))); v_scope text:=lower(trim(coalesce(p_scope_type,'all'))); v_filter jsonb:=coalesce(p_scope_filter,'{}'::jsonb);
  v_inventory_branch uuid; v_pricing_branch uuid; v_staff_count int; v_product_count int; v_items_per_employee int; v_session_id uuid; v_due timestamptz; v_title text; v_rec record; v_count_id uuid; v_task_id uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='INVENTORY_BRANCH_ACCESS_DENIED'; end if;
  if not (public.staff_has_permission('inventory.manage_sessions',p_branch_id) or public.staff_has_permission('inventory.manage',p_branch_id)) then raise exception using errcode='42501',message='INVENTORY_SESSION_MANAGE_DENIED'; end if;
  if v_kind not in ('full','spot') then raise exception using errcode='22023',message='INVALID_INVENTORY_SESSION_KIND'; end if;
  if v_scope not in ('all','main_category','subcategory','company','shelf','custom') then raise exception using errcode='22023',message='INVALID_INVENTORY_SCOPE'; end if;
  if v_kind='spot' and v_scope<>'custom' then raise exception using errcode='22023',message='SPOT_CHECK_REQUIRES_CUSTOM_PRODUCTS'; end if;
  select coalesce(inventory_source_branch_id,id),coalesce(pricing_source_branch_id,id) into v_inventory_branch,v_pricing_branch from public.branches where id=p_branch_id and active;
  if v_inventory_branch is null then raise exception using errcode='22023',message='BRANCH_NOT_FOUND'; end if;
  if p_assignee_id is not null then
    select count(*)::int into v_staff_count from public.user_branch_roles ubr join public.users u on u.id=ubr.user_id and coalesce(u.active,true) join public.staff_role_permissions rp on rp.role_id=ubr.role_id join public.staff_permissions sp on sp.id=rp.permission_id and sp.code='inventory.count' where ubr.branch_id=p_branch_id and ubr.active and ubr.user_id=p_assignee_id;
    if v_staff_count=0 then raise exception using errcode='22023',message='INVALID_INVENTORY_ASSIGNEE'; end if; v_staff_count:=1;
  else
    select count(distinct ubr.user_id)::int into v_staff_count from public.user_branch_roles ubr join public.users u on u.id=ubr.user_id and coalesce(u.active,true) join public.staff_role_permissions rp on rp.role_id=ubr.role_id join public.staff_permissions sp on sp.id=rp.permission_id and sp.code='inventory.count' where ubr.branch_id=p_branch_id and ubr.active;
    if v_staff_count=0 then raise exception using errcode='55000',message='NO_ELIGIBLE_STAFF'; end if;
  end if;
  select count(*)::int into v_product_count from public.inventory i join public.products p on p.id=i.product_id where i.branch_id=v_inventory_branch and (
    v_scope='all' or (v_scope='main_category' and p.main_category_id::text=v_filter->>'main_category_id') or (v_scope='subcategory' and p.subcategory_id::text=v_filter->>'subcategory_id') or (v_scope='company' and p.company_id::text=v_filter->>'company_id') or (v_scope='shelf' and lower(trim(coalesce(p.shelf_location,'')))=lower(trim(coalesce(v_filter->>'shelf','')))) or (v_scope='custom' and coalesce(v_filter->'product_ids','[]'::jsonb) ? p.id::text)
  );
  if v_product_count=0 then raise exception using errcode='22023',message='NO_PRODUCTS_IN_SCOPE'; end if;
  if v_product_count>5000 then raise exception using errcode='54000',message='INVENTORY_SESSION_TOO_LARGE'; end if;
  if v_kind='spot' and v_product_count>50 then raise exception using errcode='22023',message='SPOT_CHECK_TOO_LARGE'; end if;
  v_due:=coalesce(p_due_at,now()+case when v_kind='spot' then interval '4 hours' else interval '24 hours' end);
  if v_due<now()+interval '15 minutes' or v_due>now()+interval '30 days' then raise exception using errcode='22023',message='INVALID_INVENTORY_DUE_AT'; end if;
  v_title:=nullif(trim(coalesce(p_title,'')),'');
  if v_title is null then v_title:=case when v_kind='spot' then 'جرد سريع' else 'جرد شامل' end||' - '||to_char(timezone('Africa/Cairo',now()),'YYYY-MM-DD HH24:MI'); end if;
  v_items_per_employee:=greatest(1,ceil(v_product_count::numeric/v_staff_count)::int);
  insert into private.inventory_audit_sessions_v2(branch_id,inventory_branch_id,audit_date,audit_kind,status,items_per_employee,generated_by,title,description,scope_type,scope_filter,due_at,metadata)
  values(p_branch_id,v_inventory_branch,timezone('Africa/Cairo',now())::date,v_kind,'active',v_items_per_employee,auth.uid(),v_title,nullif(trim(coalesce(p_description,'')),''),v_scope,v_filter,v_due,jsonb_build_object('generator_version',3,'distribution',case when p_assignee_id is null then 'contiguous_shelf_blocks' else 'selected_assignee' end)) returning id into v_session_id;
  for v_rec in
    with eligible_staff as (
      select id,user_id,staff_rn from (
        select distinct on (u.id) u.id,u.id user_id,row_number() over(order by hashtextextended(u.id::text||':'||v_session_id::text,73)) staff_rn
        from public.user_branch_roles ubr join public.users u on u.id=ubr.user_id and coalesce(u.active,true) join public.staff_role_permissions rp on rp.role_id=ubr.role_id join public.staff_permissions sp on sp.id=rp.permission_id and sp.code='inventory.count'
        where ubr.branch_id=p_branch_id and ubr.active and (p_assignee_id is null or u.id=p_assignee_id) order by u.id
      ) q
    ), candidates as (
      select i.product_id,i.quantity,p.name,p.barcode,p.shelf_location,coalesce(p.unit_of_measure,p.base_unit,'قطعة') unit_of_measure,coalesce(bp.purchase_price,p.purchase_price,0)::numeric purchase_price,coalesce(mc.position,999999) category_position,
             ntile(v_staff_count) over(order by coalesce(p.shelf_location,'~'),coalesce(mc.position,999999),p.name,p.id) staff_bucket
      from public.inventory i join public.products p on p.id=i.product_id left join public.branch_product_pricing bp on bp.branch_id=v_pricing_branch and bp.product_id=i.product_id left join public.main_categories mc on mc.id=p.main_category_id
      where i.branch_id=v_inventory_branch and (v_scope='all' or (v_scope='main_category' and p.main_category_id::text=v_filter->>'main_category_id') or (v_scope='subcategory' and p.subcategory_id::text=v_filter->>'subcategory_id') or (v_scope='company' and p.company_id::text=v_filter->>'company_id') or (v_scope='shelf' and lower(trim(coalesce(p.shelf_location,'')))=lower(trim(coalesce(v_filter->>'shelf','')))) or (v_scope='custom' and coalesce(v_filter->'product_ids','[]'::jsonb) ? p.id::text))
    ) select c.*,s.user_id assigned_to from candidates c join eligible_staff s on s.staff_rn=c.staff_bucket order by c.staff_bucket,coalesce(c.shelf_location,'~'),c.category_position,c.name,c.product_id
  loop
    insert into private.inventory_audit_counts_v2(session_id,branch_id,inventory_branch_id,audit_date,product_id,assigned_to,expected_at_assignment,purchase_price_snapshot,risk_score,assigned_at,metadata)
    values(v_session_id,p_branch_id,v_inventory_branch,timezone('Africa/Cairo',now())::date,v_rec.product_id,v_rec.assigned_to,v_rec.quantity,v_rec.purchase_price,0,clock_timestamp(),jsonb_build_object('generator_version',3,'session_kind',v_kind)) returning id into v_count_id;
    insert into public.operations_tasks(branch_id,task_type,source_kind,source_id,amount,priority,status,title,description,claimed_by,claimed_at,due_at,metadata,created_by)
    values(p_branch_id,'inventory_daily_count','inventory_count',v_count_id,0,case when v_kind='spot' then 'high' else 'normal' end,'claimed',case when v_kind='spot' then 'جرد سريع: ' else 'جرد شامل: ' end||v_rec.name,'عدّ المنتج فعليًا بدون الاطلاع على رصيد النظام، ثم سجّل الكمية الموجودة.',v_rec.assigned_to,now(),v_due,jsonb_build_object('product_id',v_rec.product_id,'barcode',v_rec.barcode,'shelf_location',v_rec.shelf_location,'unit_of_measure',v_rec.unit_of_measure,'blind_count',true,'session_id',v_session_id,'session_kind',v_kind,'session_title',v_title),auth.uid()) returning id into v_task_id;
    update private.inventory_audit_counts_v2 set task_id=v_task_id where id=v_count_id;
    insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata) values(v_task_id,'assigned',auth.uid(),case when v_kind='spot' then 'تم إسناد جرد سريع' else 'تم توزيع مهمة من جلسة جرد شامل' end,jsonb_build_object('assigned_to',v_rec.assigned_to,'session_id',v_session_id,'session_kind',v_kind));
  end loop;
  perform private.refresh_inventory_audit_session_v2(v_session_id);
  return jsonb_build_object('session_id',v_session_id,'audit_kind',v_kind,'title',v_title,'scope_type',v_scope,'products',v_product_count,'eligible_staff',v_staff_count,'items_per_employee',v_items_per_employee,'due_at',v_due);
end;$function$;

create or replace function public.cancel_inventory_audit_session_v2(p_session_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_session private.inventory_audit_sessions_v2%rowtype; v_cancelled int:=0;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  select * into v_session from private.inventory_audit_sessions_v2 where id=p_session_id for update;
  if v_session.id is null then raise exception using errcode='22023',message='INVENTORY_SESSION_NOT_FOUND'; end if;
  if not public.has_branch_access(auth.uid(),v_session.branch_id) or not (public.staff_has_permission('inventory.manage_sessions',v_session.branch_id) or public.staff_has_permission('inventory.manage',v_session.branch_id)) then raise exception using errcode='42501',message='INVENTORY_SESSION_MANAGE_DENIED'; end if;
  if v_session.status='cancelled' then return jsonb_build_object('session_id',v_session.id,'status','cancelled','idempotent',true,'cancelled_tasks',0); end if;
  if v_session.status='completed' then raise exception using errcode='55000',message='COMPLETED_SESSION_CANNOT_BE_CANCELLED'; end if;
  insert into public.operations_task_events(task_id,event_type,actor_id,note,metadata)
  select t.id,'cancelled',auth.uid(),nullif(trim(coalesce(p_note,'')),''),jsonb_build_object('session_id',v_session.id,'reason','session_cancelled') from public.operations_tasks t join private.inventory_audit_counts_v2 c on c.task_id=t.id and c.session_id=v_session.id where c.submitted_at is null and t.status not in ('completed','cancelled');
  update public.operations_tasks t set status='cancelled',updated_at=now() from private.inventory_audit_counts_v2 c where c.task_id=t.id and c.session_id=v_session.id and c.submitted_at is null and t.status not in ('completed','cancelled');
  get diagnostics v_cancelled=row_count;
  update private.inventory_audit_counts_v2 set status='cancelled',metadata=metadata||jsonb_build_object('cancelled_at',now(),'cancelled_by',auth.uid()) where session_id=v_session.id and submitted_at is null and status in ('assigned','counting');
  update private.inventory_audit_sessions_v2 set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),completed_at=null,metadata=metadata||jsonb_build_object('cancel_note',nullif(trim(coalesce(p_note,'')),'')) where id=v_session.id;
  return jsonb_build_object('session_id',v_session.id,'status','cancelled','idempotent',false,'cancelled_tasks',v_cancelled,'note','Discrepancies already discovered remain in recount/approval queues and are not suppressed by session cancellation.');
end;$function$;

create or replace function public.get_inventory_audit_dashboard_v2(p_branch_id uuid,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=''
as $function$
declare v_limit int:=least(greatest(coalesce(p_limit,50),1),100); v_can_manage boolean; v_today date:=timezone('Africa/Cairo',now())::date; v_summary jsonb; v_sessions jsonb; v_staff jsonb; v_variances jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_branch_id is null or not public.has_branch_access(auth.uid(),p_branch_id) then raise exception using errcode='42501',message='INVENTORY_BRANCH_ACCESS_DENIED'; end if;
  if not (public.staff_has_permission('inventory.view',p_branch_id) or public.staff_has_permission('inventory.manage_sessions',p_branch_id) or public.staff_has_permission('inventory.manage',p_branch_id)) then raise exception using errcode='42501',message='INVENTORY_DASHBOARD_DENIED'; end if;
  v_can_manage:=public.staff_has_permission('inventory.manage_sessions',p_branch_id) or public.staff_has_permission('inventory.manage',p_branch_id);
  select jsonb_build_object(
    'active_sessions',(select count(*) from private.inventory_audit_sessions_v2 where branch_id=p_branch_id and status='active'),
    'today_sessions',(select count(*) from private.inventory_audit_sessions_v2 where branch_id=p_branch_id and audit_date=v_today),
    'today_daily_progress',coalesce((select case when total_tasks>0 then round(completed_tasks::numeric/total_tasks*100,1) else 0 end from private.inventory_audit_sessions_v2 where branch_id=p_branch_id and audit_date=v_today and audit_kind='daily' order by generated_at desc limit 1),0),
    'open_variances',(select count(*) from private.inventory_audit_counts_v2 where branch_id=p_branch_id and status in ('discrepancy','review_required')),
    'pending_recounts',(select count(*) from public.operations_tasks where branch_id=p_branch_id and source_kind='inventory_recount' and status not in ('completed','cancelled')),
    'pending_approvals',(select count(*) from public.operations_tasks where branch_id=p_branch_id and source_kind='inventory_adjustment' and status not in ('completed','cancelled')),
    'overdue_tasks',(select count(*) from public.operations_tasks where branch_id=p_branch_id and source_kind in ('inventory_count','inventory_recount','inventory_adjustment') and status not in ('completed','cancelled') and due_at<now()),
    'first_count_accuracy_percent',coalesce((select case when count(*) filter(where submitted_at is not null)>0 then round(count(*) filter(where status='matched')::numeric/count(*) filter(where submitted_at is not null)*100,2) else 100 end from private.inventory_audit_counts_v2 where branch_id=p_branch_id and audit_date>=v_today-30),100),
    'open_variance_value',case when v_can_manage then coalesce((select round(sum(abs(coalesce(r.variance_value,c.variance_value,0))),2) from private.inventory_audit_counts_v2 c left join private.inventory_audit_recounts_v2 r on r.original_count_id=c.id where c.branch_id=p_branch_id and c.status in ('discrepancy','review_required')),0) else null end
  ) into v_summary;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'audit_date',s.audit_date,'audit_kind',s.audit_kind,'status',s.status,'title',coalesce(s.title,case when s.audit_kind='daily' then 'الجرد اليومي' when s.audit_kind='spot' then 'جرد سريع' else 'جرد شامل' end),'description',s.description,'scope_type',s.scope_type,'scope_filter',s.scope_filter,'due_at',s.due_at,
    'total_tasks',s.total_tasks,'completed_tasks',s.completed_tasks,'matched_tasks',s.matched_tasks,'discrepancy_tasks',s.discrepancy_tasks,
    'resolved_tasks',(select count(*) from private.inventory_audit_counts_v2 c where c.session_id=s.id and c.status in ('matched','resolved_no_adjustment','adjusted')),
    'cancelled_tasks',(select count(*) from private.inventory_audit_counts_v2 c where c.session_id=s.id and c.status='cancelled'),
    'pending_recounts',(select count(*) from private.inventory_audit_counts_v2 c join private.inventory_audit_recounts_v2 r on r.original_count_id=c.id where c.session_id=s.id and r.status in ('assigned','counting')),
    'pending_approvals',(select count(*) from private.inventory_audit_counts_v2 c join private.inventory_audit_recounts_v2 r on r.original_count_id=c.id join public.operations_tasks t on t.source_kind='inventory_adjustment' and t.source_id=r.id where c.session_id=s.id and t.status not in ('completed','cancelled')),
    'progress_percent',case when s.total_tasks>0 then round(s.completed_tasks::numeric/s.total_tasks*100,1) else 0 end,'generated_at',s.generated_at,'completed_at',s.completed_at,'cancelled_at',s.cancelled_at
  ) order by s.generated_at desc),'[]'::jsonb) into v_sessions from (select * from private.inventory_audit_sessions_v2 where branch_id=p_branch_id order by generated_at desc limit v_limit) s;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',u.id,'name',u.name,
    'active_counts',(select count(*) from public.operations_tasks t where t.branch_id=p_branch_id and t.source_kind='inventory_count' and t.claimed_by=u.id and t.status in ('claimed','in_progress','failed')),
    'active_recounts',(select count(*) from public.operations_tasks t where t.branch_id=p_branch_id and t.source_kind='inventory_recount' and t.claimed_by=u.id and t.status in ('claimed','in_progress','failed')),
    'submitted_30d',(select count(*) from private.inventory_audit_counts_v2 c where c.branch_id=p_branch_id and c.assigned_to=u.id and c.audit_date>=v_today-30 and c.submitted_at is not null),
    'accuracy_30d',coalesce((select case when count(*) filter(where c.submitted_at is not null)>0 then round(count(*) filter(where c.status='matched')::numeric/count(*) filter(where c.submitted_at is not null)*100,2) else 100 end from private.inventory_audit_counts_v2 c where c.branch_id=p_branch_id and c.assigned_to=u.id and c.audit_date>=v_today-30),100)
  ) order by u.name),'[]'::jsonb) into v_staff from (select distinct u.id,u.name from public.user_branch_roles ubr join public.users u on u.id=ubr.user_id and coalesce(u.active,true) join public.staff_role_permissions rp on rp.role_id=ubr.role_id join public.staff_permissions sp on sp.id=rp.permission_id and sp.code='inventory.count' where ubr.branch_id=p_branch_id and ubr.active) u;
  select coalesce(jsonb_agg(jsonb_build_object('count_id',c.id,'session_id',c.session_id,'product_id',c.product_id,'product_name',p.name,'barcode',p.barcode,'status',c.status,'assigned_to',c.assigned_to,'assigned_to_name',u.name,'submitted_at',c.submitted_at,'recount_status',r.status,'approval_task_id',a.id,'approval_status',a.status,'variance',case when v_can_manage then coalesce(r.variance,c.variance) else null end,'variance_value',case when v_can_manage then coalesce(r.variance_value,c.variance_value) else null end) order by c.submitted_at desc nulls last),'[]'::jsonb)
  into v_variances from private.inventory_audit_counts_v2 c join public.products p on p.id=c.product_id left join public.users u on u.id=c.assigned_to left join private.inventory_audit_recounts_v2 r on r.original_count_id=c.id left join public.operations_tasks a on a.source_kind='inventory_adjustment' and a.source_id=r.id where c.branch_id=p_branch_id and c.status in ('discrepancy','review_required') limit 100;
  return jsonb_build_object('summary',v_summary,'sessions',v_sessions,'staff_workload',v_staff,'open_variances',v_variances,'permissions',jsonb_build_object('can_manage_sessions',v_can_manage,'can_approve_adjustment',public.staff_has_permission('inventory.approve_adjustment',p_branch_id)));
end;$function$;

revoke all on function public.get_inventory_audit_setup_v2(uuid) from public,anon;
revoke all on function public.search_inventory_audit_products_v2(uuid,text,integer) from public,anon;
revoke all on function public.create_inventory_audit_session_v2(uuid,text,text,text,text,jsonb,uuid,timestamptz) from public,anon;
revoke all on function public.cancel_inventory_audit_session_v2(uuid,text) from public,anon;
revoke all on function public.get_inventory_audit_dashboard_v2(uuid,integer) from public,anon;
grant execute on function public.get_inventory_audit_setup_v2(uuid) to authenticated,service_role;
grant execute on function public.search_inventory_audit_products_v2(uuid,text,integer) to authenticated,service_role;
grant execute on function public.create_inventory_audit_session_v2(uuid,text,text,text,text,jsonb,uuid,timestamptz) to authenticated,service_role;
grant execute on function public.cancel_inventory_audit_session_v2(uuid,text) to authenticated,service_role;
grant execute on function public.get_inventory_audit_dashboard_v2(uuid,integer) to authenticated,service_role;
