alter table public.customers add column if not exists management_status text not null default 'active';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='customers_management_status_check' and conrelid='public.customers'::regclass) then
    alter table public.customers add constraint customers_management_status_check check (management_status in ('active','watch','blocked'));
  end if;
end $$;

create table if not exists public.customer_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.customer_tag_assignments (
  customer_id uuid not null references public.customers(id) on delete cascade,
  tag_id uuid not null references public.customer_tags(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key (customer_id,tag_id)
);

create table if not exists public.customer_admin_audit (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  action_type text not null,
  branch_id uuid references public.branches(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists customer_admin_audit_customer_created_idx on public.customer_admin_audit(customer_id,created_at desc);
create index if not exists customer_interactions_customer_created_idx on public.customer_interactions(customer_id,created_at desc);

insert into public.staff_permissions(id,code,name_ar,module,description)
values
  (gen_random_uuid(),'customers.view','عرض العملاء','customers','عرض قسم العملاء وملفات Customer 360'),
  (gen_random_uuid(),'customers.manage','إدارة العملاء','customers','إضافة الملاحظات والتصنيفات وتغيير حالة العميل'),
  (gen_random_uuid(),'customers.loyalty.adjust','تعديل نقاط العملاء','customers','إضافة أو خصم نقاط الولاء يدويًا مع سبب وسجل مراجعة')
on conflict (code) do update set name_ar=excluded.name_ar,module=excluded.module,description=excluded.description;

insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r join public.staff_permissions p on p.code='customers.view'
where r.code in ('branch_manager','branch_admin','accountant') on conflict do nothing;
insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r join public.staff_permissions p on p.code='customers.manage'
where r.code in ('branch_manager','branch_admin') on conflict do nothing;
insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r join public.staff_permissions p on p.code='customers.loyalty.adjust'
where r.code in ('branch_manager','branch_admin') on conflict do nothing;

revoke all on public.customer_tags,public.customer_tag_assignments,public.customer_admin_audit from anon,authenticated;

drop function if exists public.get_customer_management_workspace(uuid,uuid);
create function public.get_customer_management_workspace(p_customer_id uuid,p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_super boolean; v_can_view boolean; v_can_manage boolean; v_can_adjust boolean; v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_super:=private.staff_is_super_admin(auth.uid());
  v_can_view:=v_super or (p_branch_id is not null and (public.staff_has_permission('customers.view',p_branch_id) or public.staff_has_permission('sales.view',p_branch_id)));
  v_can_manage:=v_super or (p_branch_id is not null and public.staff_has_permission('customers.manage',p_branch_id));
  v_can_adjust:=v_super or (p_branch_id is not null and public.staff_has_permission('customers.loyalty.adjust',p_branch_id));
  if not v_can_view then raise exception using errcode='42501',message='CUSTOMER_ACCESS_DENIED'; end if;
  if not exists(select 1 from public.customers where id=p_customer_id) then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
  select jsonb_build_object(
    'management_status',c.management_status,
    'permissions',jsonb_build_object('can_view',v_can_view,'can_manage',v_can_manage,'can_adjust_points',v_can_adjust),
    'tags',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'color',t.color,'assigned_at',a.assigned_at) order by a.assigned_at desc) from public.customer_tag_assignments a join public.customer_tags t on t.id=a.tag_id where a.customer_id=c.id and t.active),'[]'::jsonb),
    'interactions',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,type,subject,description,status,priority,scheduled_at,created_by,created_at from public.customer_interactions where customer_id=c.id order by created_at desc limit 50) x),'[]'::jsonb),
    'audit',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,action_type,branch_id,created_by,metadata,created_at from public.customer_admin_audit where customer_id=c.id order by created_at desc limit 50) x),'[]'::jsonb)
  ) into v_result from public.customers c where c.id=p_customer_id;
  return v_result;
end $$;
revoke all on function public.get_customer_management_workspace(uuid,uuid) from public,anon;
grant execute on function public.get_customer_management_workspace(uuid,uuid) to authenticated;

drop function if exists public.set_customer_management_tag(uuid,text,boolean,uuid);
create function public.set_customer_management_tag(p_customer_id uuid,p_tag_name text,p_assigned boolean,p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_super boolean; v_tag_id uuid; v_name text:=btrim(coalesce(p_tag_name,''));
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 v_super:=private.staff_is_super_admin(auth.uid());
 if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.manage',p_branch_id)) then raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED'; end if;
 if length(v_name)<2 or length(v_name)>40 then raise exception using errcode='22023',message='INVALID_TAG_NAME'; end if;
 if not exists(select 1 from public.customers where id=p_customer_id) then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
 insert into public.customer_tags(name,created_by) values(v_name,auth.uid()) on conflict(name) do update set active=true returning id into v_tag_id;
 if p_assigned then insert into public.customer_tag_assignments(customer_id,tag_id,assigned_by) values(p_customer_id,v_tag_id,auth.uid()) on conflict(customer_id,tag_id) do nothing;
 else delete from public.customer_tag_assignments where customer_id=p_customer_id and tag_id=v_tag_id; end if;
 insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata) values(p_customer_id,case when p_assigned then 'tag_added' else 'tag_removed' end,p_branch_id,auth.uid(),jsonb_build_object('tag',v_name));
 return public.get_customer_management_workspace(p_customer_id,p_branch_id);
end $$;
revoke all on function public.set_customer_management_tag(uuid,text,boolean,uuid) from public,anon;
grant execute on function public.set_customer_management_tag(uuid,text,boolean,uuid) to authenticated;

drop function if exists public.add_customer_management_note(uuid,text,text,text,uuid);
create function public.add_customer_management_note(p_customer_id uuid,p_subject text,p_description text,p_priority text default 'medium',p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_super boolean; v_subject text:=btrim(coalesce(p_subject,'')); v_desc text:=nullif(btrim(coalesce(p_description,'')),'');
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 v_super:=private.staff_is_super_admin(auth.uid());
 if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.manage',p_branch_id)) then raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED'; end if;
 if length(v_subject)<2 or length(v_subject)>120 then raise exception using errcode='22023',message='INVALID_NOTE_SUBJECT'; end if;
 if p_priority not in ('low','medium','high') then raise exception using errcode='22023',message='INVALID_PRIORITY'; end if;
 insert into public.customer_interactions(customer_id,type,subject,description,status,priority,created_by) values(p_customer_id,'note',v_subject,v_desc,'completed',p_priority,auth.uid());
 insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata) values(p_customer_id,'note_added',p_branch_id,auth.uid(),jsonb_build_object('subject',v_subject,'priority',p_priority));
 return public.get_customer_management_workspace(p_customer_id,p_branch_id);
end $$;
revoke all on function public.add_customer_management_note(uuid,text,text,text,uuid) from public,anon;
grant execute on function public.add_customer_management_note(uuid,text,text,text,uuid) to authenticated;

drop function if exists public.set_customer_management_status(uuid,text,text,uuid);
create function public.set_customer_management_status(p_customer_id uuid,p_status text,p_reason text,p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_super boolean; v_old text; v_reason text:=btrim(coalesce(p_reason,''));
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 v_super:=private.staff_is_super_admin(auth.uid());
 if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.manage',p_branch_id)) then raise exception using errcode='42501',message='CUSTOMER_MANAGE_DENIED'; end if;
 if p_status not in ('active','watch','blocked') then raise exception using errcode='22023',message='INVALID_CUSTOMER_STATUS'; end if;
 if length(v_reason)<3 then raise exception using errcode='22023',message='STATUS_REASON_REQUIRED'; end if;
 select management_status into v_old from public.customers where id=p_customer_id for update;
 if v_old is null then raise exception using errcode='22023',message='CUSTOMER_NOT_FOUND'; end if;
 update public.customers set management_status=p_status,updated_at=now() where id=p_customer_id;
 insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata) values(p_customer_id,'status_changed',p_branch_id,auth.uid(),jsonb_build_object('from',v_old,'to',p_status,'reason',v_reason));
 return public.get_customer_management_workspace(p_customer_id,p_branch_id);
end $$;
revoke all on function public.set_customer_management_status(uuid,text,text,uuid) from public,anon;
grant execute on function public.set_customer_management_status(uuid,text,text,uuid) to authenticated;

drop function if exists public.adjust_customer_loyalty_points(uuid,bigint,text,uuid);
create function public.adjust_customer_loyalty_points(p_customer_id uuid,p_points_delta bigint,p_reason text,p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_super boolean; v_reason text:=btrim(coalesce(p_reason,'')); v_before bigint; v_after bigint; v_redemption_points bigint; v_redemption_value numeric; v_value numeric;
begin
 if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 v_super:=private.staff_is_super_admin(auth.uid());
 if not v_super and (p_branch_id is null or not public.staff_has_permission('customers.loyalty.adjust',p_branch_id)) then raise exception using errcode='42501',message='CUSTOMER_LOYALTY_ADJUST_DENIED'; end if;
 if p_points_delta=0 or abs(p_points_delta)>10000000 then raise exception using errcode='22023',message='INVALID_POINTS_DELTA'; end if;
 if length(v_reason)<3 then raise exception using errcode='22023',message='ADJUSTMENT_REASON_REQUIRED'; end if;
 select points_balance into v_before from public.customer_loyalty_accounts where customer_id=p_customer_id for update;
 if v_before is null then raise exception using errcode='22023',message='LOYALTY_ACCOUNT_NOT_FOUND'; end if;
 v_after:=v_before+p_points_delta;
 if v_after<0 then raise exception using errcode='22023',message='INSUFFICIENT_POINTS'; end if;
 select redemption_points,redemption_value_egp into v_redemption_points,v_redemption_value from public.loyalty_settings where singleton=true limit 1;
 v_value:=case when coalesce(v_redemption_points,0)>0 then round((p_points_delta::numeric/v_redemption_points::numeric)*coalesce(v_redemption_value,0),2) else null end;
 update public.customer_loyalty_accounts set points_balance=v_after,updated_at=now() where customer_id=p_customer_id;
 insert into public.loyalty_ledger(customer_id,entry_type,points_delta,value_egp,source_type,branch_id,reference,metadata,created_by)
 values(p_customer_id,'adjustment',p_points_delta,v_value,'admin_adjustment',p_branch_id,'ADM-'||substr(replace(gen_random_uuid()::text,'-',''),1,12),jsonb_build_object('reason',v_reason,'before',v_before,'after',v_after),auth.uid());
 insert into public.customer_admin_audit(customer_id,action_type,branch_id,created_by,metadata) values(p_customer_id,'points_adjusted',p_branch_id,auth.uid(),jsonb_build_object('points_delta',p_points_delta,'before',v_before,'after',v_after,'reason',v_reason));
 return jsonb_build_object('before',v_before,'after',v_after,'delta',p_points_delta,'workspace',public.get_customer_management_workspace(p_customer_id,p_branch_id));
end $$;
revoke all on function public.adjust_customer_loyalty_points(uuid,bigint,text,uuid) from public,anon;
grant execute on function public.adjust_customer_loyalty_points(uuid,bigint,text,uuid) to authenticated;
