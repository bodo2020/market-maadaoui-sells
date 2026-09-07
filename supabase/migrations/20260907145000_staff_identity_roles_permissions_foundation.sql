-- Staff identity / branch roles / permissions foundation.
-- Source of truth for new authorization:
--   users.system_role_id -> system-wide role (currently super_admin)
--   user_branch_roles.role_id -> role inside one branch
--   staff_has_permission(permission, branch_id) -> canonical authorization check
-- The legacy users.role and user_branch_roles.role columns remain temporarily for compatibility.

create table if not exists public.staff_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_]+$'),
  name_ar text not null,
  scope text not null check (scope in ('system','branch')),
  description text,
  is_system boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9_.]+$'),
  name_ar text not null,
  module text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_role_permissions (
  role_id uuid not null references public.staff_roles(id) on delete cascade,
  permission_id uuid not null references public.staff_permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(role_id,permission_id)
);

insert into public.staff_roles(code,name_ar,scope,description) values
 ('super_admin','مدير النظام','system','وصول كامل لكل الفروع وإعدادات النظام'),
 ('branch_admin','مسؤول الفرع','branch','إدارة تشغيل الفرع والموظفين'),
 ('branch_manager','مدير الفرع','branch','إدارة تشغيل الفرع والموظفين'),
 ('cashier','كاشير','branch','استخدام نقطة البيع'),
 ('inventory_manager','مسؤول المخزون','branch','المخزون والجرد والمشتريات والتحويلات'),
 ('online_orders','مسؤول الطلبات الإلكترونية','branch','إدارة وتجهيز الطلبات الإلكترونية'),
 ('delivery_manager','مسؤول التوصيل','branch','إدارة التوصيل والسائقين'),
 ('delivery_driver','مندوب توصيل','branch','تنفيذ طلبات التوصيل المسندة'),
 ('delivery','مندوب توصيل - قديم','branch','دور توافق للحسابات القديمة'),
 ('accountant','محاسب','branch','المالية والتقارير')
on conflict(code) do update set name_ar=excluded.name_ar,scope=excluded.scope,description=excluded.description,active=true,updated_at=now();

insert into public.staff_permissions(code,name_ar,module,description) values
 ('branch.view','عرض بيانات الفرع','branch','عرض بيانات الفرع التشغيلية'),
 ('branch.manage_settings','إدارة إعدادات الفرع','branch','تعديل إعدادات تشغيل الفرع'),
 ('branch.manage_staff','إدارة موظفي الفرع','branch','إضافة وربط وإيقاف موظفي الفرع'),
 ('products.view','عرض المنتجات','products','عرض الكتالوج'),
 ('products.manage','إدارة المنتجات','products','إضافة وتعديل المنتجات'),
 ('pricing.manage','إدارة الأسعار','pricing','تعديل أسعار الفرع'),
 ('inventory.view','عرض المخزون','inventory','عرض مخزون الفرع'),
 ('inventory.manage','إدارة المخزون','inventory','تعديل وجرد المخزون'),
 ('inventory.transfer','تحويل المخزون','inventory','إنشاء واستلام التحويلات'),
 ('purchases.manage','إدارة المشتريات','purchases','تسجيل مشتريات الموردين'),
 ('pos.use','استخدام نقطة البيع','pos','فتح واستخدام شاشة الكاشير'),
 ('sales.view','عرض المبيعات','sales','عرض مبيعات الفرع'),
 ('sales.refund','تنفيذ المرتجعات','sales','تنفيذ مرتجع أو إلغاء بيع حسب القواعد'),
 ('online_orders.view','عرض الطلبات الإلكترونية','online_orders','عرض طلبات الفرع'),
 ('online_orders.manage','إدارة الطلبات الإلكترونية','online_orders','تحديث وتجهيز الطلبات'),
 ('delivery.manage','إدارة التوصيل','delivery','إدارة السائقين والتكليفات'),
 ('delivery.execute','تنفيذ التوصيل','delivery','استلام وتحديث حالة مهام المندوب'),
 ('finance.view','عرض المالية','finance','عرض المالية والنقدية'),
 ('finance.manage','إدارة المالية','finance','إدارة المصروفات والنقدية'),
 ('reports.view','عرض التقارير','reports','عرض تقارير الفرع'),
 ('reports.profit','عرض الأرباح','reports','عرض هامش وصافي الأرباح')
on conflict(code) do update set name_ar=excluded.name_ar,module=excluded.module,description=excluded.description;

-- Role permission seeds.
insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r cross join public.staff_permissions p where r.code='super_admin'
on conflict do nothing;
insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r cross join public.staff_permissions p where r.code in ('branch_manager','branch_admin')
on conflict do nothing;
insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r join public.staff_permissions p on p.code in ('branch.view','products.view','inventory.view','pos.use','sales.view','sales.refund') where r.code='cashier'
on conflict do nothing;
insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r join public.staff_permissions p on p.code in ('branch.view','products.view','products.manage','pricing.manage','inventory.view','inventory.manage','inventory.transfer','purchases.manage','reports.view') where r.code='inventory_manager'
on conflict do nothing;
insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r join public.staff_permissions p on p.code in ('branch.view','products.view','inventory.view','online_orders.view','online_orders.manage') where r.code='online_orders'
on conflict do nothing;
insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r join public.staff_permissions p on p.code in ('branch.view','online_orders.view','delivery.manage','reports.view') where r.code='delivery_manager'
on conflict do nothing;
insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r join public.staff_permissions p on p.code in ('branch.view','delivery.execute') where r.code in ('delivery_driver','delivery')
on conflict do nothing;
insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r join public.staff_permissions p on p.code in ('branch.view','sales.view','finance.view','finance.manage','reports.view','reports.profit') where r.code='accountant'
on conflict do nothing;

alter table public.users add column if not exists system_role_id uuid references public.staff_roles(id) on delete set null;
alter table public.user_branch_roles add column if not exists role_id uuid references public.staff_roles(id) on delete restrict;
alter table public.user_branch_roles add column if not exists active boolean not null default true;
alter table public.user_branch_roles add column if not exists is_primary boolean not null default false;
alter table public.user_branch_roles add column if not exists pos_enabled boolean not null default false;
alter table public.user_branch_roles add column if not exists updated_at timestamptz not null default now();

update public.users u set system_role_id=r.id
from public.staff_roles r where r.code='super_admin' and u.role='super_admin' and u.system_role_id is null;
update public.user_branch_roles ubr set role_id=r.id
from public.staff_roles r where ubr.role_id is null and r.code=case when ubr.role='admin' then 'branch_admin' else ubr.role end;
update public.user_branch_roles ubr set pos_enabled=true
from public.staff_roles r where ubr.role_id=r.id and r.code in ('cashier','branch_manager','branch_admin');

with ranked as (
  select id,row_number() over(partition by user_id order by created_at,id) rn from public.user_branch_roles
), chosen as (select id from ranked where rn=1)
update public.user_branch_roles ubr set is_primary=true from chosen c where ubr.id=c.id
and not exists(select 1 from public.user_branch_roles x where x.user_id=ubr.user_id and x.is_primary);

create or replace function private.sync_staff_branch_role_columns() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_code text; v_id uuid;
begin
  if new.role_id is null then
    select id,code into v_id,v_code from public.staff_roles
    where code=case when new.role='admin' then 'branch_admin' else new.role end and scope='branch' and active;
    if v_id is null then raise exception using errcode='22023',message='INVALID_BRANCH_ROLE'; end if;
    new.role_id:=v_id; new.role:=v_code;
  else
    select code into v_code from public.staff_roles where id=new.role_id and scope='branch' and active;
    if v_code is null then raise exception using errcode='22023',message='INVALID_BRANCH_ROLE'; end if;
    new.role:=v_code;
  end if;
  new.updated_at:=now();
  return new;
end $$;

drop trigger if exists sync_staff_branch_role_columns on public.user_branch_roles;
create trigger sync_staff_branch_role_columns before insert or update of role,role_id on public.user_branch_roles
for each row execute function private.sync_staff_branch_role_columns();

create unique index if not exists user_branch_roles_one_primary_idx on public.user_branch_roles(user_id) where is_primary and active;
create index if not exists user_branch_roles_branch_active_idx on public.user_branch_roles(branch_id,user_id) where active;
create index if not exists staff_role_permissions_permission_idx on public.staff_role_permissions(permission_id,role_id);

create or replace function private.staff_is_super_admin(p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from public.users u join public.staff_roles r on r.id=u.system_role_id
   where u.id=p_user_id and coalesce(u.active,true) and r.code='super_admin' and r.scope='system' and r.active
 );
$$;
revoke all on function private.staff_is_super_admin(uuid) from public,anon,authenticated;

create or replace function public.staff_has_permission(p_permission_code text,p_branch_id uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select case
   when auth.uid() is null then false
   when private.staff_is_super_admin(auth.uid()) then true
   when p_branch_id is null then false
   else exists(
     select 1 from public.users u
     join public.user_branch_roles ubr on ubr.user_id=u.id and ubr.branch_id=p_branch_id and ubr.active
     join public.staff_roles r on r.id=ubr.role_id and r.active and r.scope='branch'
     join public.staff_role_permissions rp on rp.role_id=r.id
     join public.staff_permissions p on p.id=rp.permission_id and p.code=p_permission_code
     where u.id=auth.uid() and coalesce(u.active,true)
   )
 end;
$$;
revoke all on function public.staff_has_permission(text,uuid) from public,anon;
grant execute on function public.staff_has_permission(text,uuid) to authenticated;

create or replace function public.get_my_staff_identity() returns jsonb
language sql stable security definer set search_path='' as $$
 select case when u.id is null then null else jsonb_build_object(
   'user_id',u.id,'name',u.name,'username',u.username,'phone',u.phone,'active',coalesce(u.active,true),
   'is_super_admin',private.staff_is_super_admin(u.id),'system_role',sr.code
 ) end
 from (select auth.uid() id) a
 left join public.users u on u.id=a.id
 left join public.staff_roles sr on sr.id=u.system_role_id;
$$;
revoke all on function public.get_my_staff_identity() from public,anon;
grant execute on function public.get_my_staff_identity() to authenticated;

create or replace function public.get_my_staff_branches() returns table(
 branch_id uuid,branch_name text,branch_code text,role_code text,role_name_ar text,
 is_primary boolean,pos_enabled boolean,permissions text[]
)
language sql stable security definer set search_path='' as $$
 with me as (
   select u.id,private.staff_is_super_admin(u.id) as super_admin
   from public.users u where u.id=auth.uid() and coalesce(u.active,true)
 ), all_permissions as (
   select coalesce(array_agg(p.code order by p.code),'{}'::text[]) permissions from public.staff_permissions p
 ), assigned as (
   select b.id,b.name,b.code,r.code,r.name_ar,ubr.is_primary,ubr.pos_enabled,
          coalesce(array_agg(p.code order by p.code) filter(where p.code is not null),'{}'::text[])
   from me
   join public.user_branch_roles ubr on ubr.user_id=me.id and ubr.active and not me.super_admin
   join public.branches b on b.id=ubr.branch_id and b.active
   join public.staff_roles r on r.id=ubr.role_id and r.active
   left join public.staff_role_permissions rp on rp.role_id=r.id
   left join public.staff_permissions p on p.id=rp.permission_id
   group by b.id,b.name,b.code,r.code,r.name_ar,ubr.is_primary,ubr.pos_enabled
 ), system_branches as (
   select b.id,b.name,b.code,'super_admin'::text,'مدير النظام'::text,
          row_number() over(order by b.created_at,b.id)=1,true,ap.permissions
   from me cross join all_permissions ap join public.branches b on b.active where me.super_admin
 )
 select * from assigned
 union all select * from system_branches
 order by is_primary desc,branch_name,branch_id;
$$;
revoke all on function public.get_my_staff_branches() from public,anon;
grant execute on function public.get_my_staff_branches() to authenticated;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path='' as $$ select private.staff_is_super_admin(auth.uid()); $$;
revoke all on function public.is_super_admin() from public,anon;
grant execute on function public.is_super_admin() to authenticated;

alter table public.staff_roles enable row level security;
alter table public.staff_permissions enable row level security;
alter table public.staff_role_permissions enable row level security;

drop policy if exists staff_roles_authenticated_read on public.staff_roles;
create policy staff_roles_authenticated_read on public.staff_roles for select to authenticated using(true);
drop policy if exists staff_permissions_authenticated_read on public.staff_permissions;
create policy staff_permissions_authenticated_read on public.staff_permissions for select to authenticated using(true);
drop policy if exists staff_role_permissions_authenticated_read on public.staff_role_permissions;
create policy staff_role_permissions_authenticated_read on public.staff_role_permissions for select to authenticated using(true);

revoke insert,update,delete on public.staff_roles from anon,authenticated;
revoke insert,update,delete on public.staff_permissions from anon,authenticated;
revoke insert,update,delete on public.staff_role_permissions from anon,authenticated;

comment on function public.is_admin() is 'LEGACY compatibility only. Do not use for new authorization. Use staff_has_permission(permission_code, branch_id).';
comment on function public.is_super_admin() is 'System super-admin check backed by users.system_role_id -> staff_roles.';
comment on function public.staff_has_permission(text,uuid) is 'Canonical branch-scoped authorization check for staff features.';
comment on function public.get_my_staff_branches() is 'Canonical authenticated branch/role/permission context. Super admins receive every active branch.';
