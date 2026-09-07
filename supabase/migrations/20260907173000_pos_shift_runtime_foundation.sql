create table if not exists public.pos_shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  device_id uuid not null references public.pos_devices(id) on delete restrict,
  status text not null default 'open' check (status in ('open','closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric not null default 0 check (opening_cash >= 0),
  closing_cash numeric check (closing_cash is null or closing_cash >= 0),
  expected_cash numeric,
  cash_difference numeric,
  closing_notes text,
  closed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pos_shifts_one_open_per_device on public.pos_shifts(device_id) where status='open';
create unique index if not exists pos_shifts_one_open_per_user on public.pos_shifts(user_id) where status='open';
create index if not exists pos_shifts_branch_opened_idx on public.pos_shifts(branch_id, opened_at desc);

alter table public.pos_shifts enable row level security;
revoke all on public.pos_shifts from anon, authenticated;

alter table public.sales add column if not exists shift_id uuid references public.pos_shifts(id) on delete set null;
alter table public.sales add column if not exists device_id uuid references public.pos_devices(id) on delete set null;
create index if not exists sales_shift_id_idx on public.sales(shift_id);
create index if not exists sales_device_id_idx on public.sales(device_id);

insert into public.staff_permissions(code,name_ar,module,description)
values ('pos.manage_shifts','إدارة ورديات نقطة البيع','pos','عرض وإغلاق ورديات الكاشير داخل الفرع')
on conflict (code) do nothing;

insert into public.staff_role_permissions(role_id,permission_id)
select r.id,p.id from public.staff_roles r cross join public.staff_permissions p
where p.code='pos.manage_shifts' and r.code in ('branch_admin','branch_manager','super_admin')
on conflict do nothing;

create or replace function private.pos_device_for_user(p_device_id uuid,p_device_token text,p_user_id uuid)
returns public.pos_devices language plpgsql stable security definer set search_path='' as $$
declare v_device public.pos_devices%rowtype;
begin
  select * into v_device from public.pos_devices where id=p_device_id;
  if v_device.id is null or not v_device.active or v_device.revoked_at is not null
     or encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex') is distinct from v_device.device_token_hash
     or not exists(select 1 from public.branches b where b.id=v_device.branch_id and b.active) then
    raise exception using errcode='42501',message='DEVICE_UNAVAILABLE';
  end if;
  if not (
    exists(select 1 from public.user_branch_roles ubr
      join public.staff_roles r on r.id=ubr.role_id and r.active
      join public.staff_role_permissions rp on rp.role_id=r.id
      join public.staff_permissions sp on sp.id=rp.permission_id and sp.code='pos.use'
      where ubr.user_id=p_user_id and ubr.branch_id=v_device.branch_id and ubr.active and ubr.pos_enabled)
    or exists(select 1 from public.users u join public.staff_roles r on r.id=u.system_role_id
      where u.id=p_user_id and r.code='super_admin' and r.active)
  ) then raise exception using errcode='42501',message='POS_NOT_ALLOWED'; end if;
  return v_device;
end;
$$;
revoke all on function private.pos_device_for_user(uuid,text,uuid) from public,anon,authenticated;

create or replace function public.get_my_open_pos_shift(p_device_id uuid,p_device_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_device public.pos_devices%rowtype; v_shift public.pos_shifts%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());
  select * into v_shift from public.pos_shifts where user_id=auth.uid() and device_id=v_device.id and branch_id=v_device.branch_id and status='open' order by opened_at desc limit 1;
  if v_shift.id is null then return null; end if;
  return to_jsonb(v_shift)||jsonb_build_object('device_name',v_device.name,'device_code',v_device.device_code,'branch_name',(select b.name from public.branches b where b.id=v_shift.branch_id));
end;
$$;
revoke all on function public.get_my_open_pos_shift(uuid,text) from public,anon;
grant execute on function public.get_my_open_pos_shift(uuid,text) to authenticated;

create or replace function public.open_pos_shift(p_device_id uuid,p_device_token text,p_opening_cash numeric default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device public.pos_devices%rowtype; v_shift public.pos_shifts%rowtype; v_other public.pos_shifts%rowtype;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_opening_cash is null or p_opening_cash<0 or p_opening_cash::text in ('NaN','Infinity','-Infinity') then raise exception using errcode='22023',message='INVALID_OPENING_CASH'; end if;
  v_device:=private.pos_device_for_user(p_device_id,p_device_token,auth.uid());
  perform pg_advisory_xact_lock(hashtextextended('pos-device:'||v_device.id::text,11));
  perform pg_advisory_xact_lock(hashtextextended('pos-user:'||auth.uid()::text,12));
  select * into v_shift from public.pos_shifts where device_id=v_device.id and status='open' for update;
  if v_shift.id is not null then
    if v_shift.user_id=auth.uid() then return to_jsonb(v_shift)||jsonb_build_object('already_open',true); end if;
    raise exception using errcode='55000',message='DEVICE_SHIFT_BUSY';
  end if;
  select * into v_other from public.pos_shifts where user_id=auth.uid() and status='open' for update;
  if v_other.id is not null then raise exception using errcode='55000',message='USER_SHIFT_ALREADY_OPEN'; end if;
  insert into public.pos_shifts(user_id,branch_id,device_id,opening_cash) values(auth.uid(),v_device.branch_id,v_device.id,round(p_opening_cash,2)) returning * into v_shift;
  update public.pos_devices set last_seen_at=now(),updated_at=now() where id=v_device.id;
  return to_jsonb(v_shift)||jsonb_build_object('already_open',false,'device_name',v_device.name,'branch_name',(select b.name from public.branches b where b.id=v_device.branch_id));
end;
$$;
revoke all on function public.open_pos_shift(uuid,text,numeric) from public,anon;
grant execute on function public.open_pos_shift(uuid,text,numeric) to authenticated;

create or replace function public.close_pos_shift(p_shift_id uuid,p_device_id uuid,p_device_token text,p_closing_cash numeric,p_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_device public.pos_devices%rowtype; v_shift public.pos_shifts%rowtype; v_expected numeric; v_movement numeric; v_sales_count bigint; v_sales_total numeric;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
  if p_closing_cash is null or p_closing_cash<0 or p_closing_cash::text in ('NaN','Infinity','-Infinity') then raise exception using errcode='22023',message='INVALID_CLOSING_CASH'; end if;
  select * into v_device from public.pos_devices where id=p_device_id;
  if v_device.id is null or not v_device.active or v_device.revoked_at is not null or encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex') is distinct from v_device.device_token_hash then raise exception using errcode='42501',message='DEVICE_UNAVAILABLE'; end if;
  select * into v_shift from public.pos_shifts where id=p_shift_id for update;
  if v_shift.id is null or v_shift.status<>'open' or v_shift.device_id<>v_device.id then raise exception using errcode='22023',message='SHIFT_NOT_OPEN'; end if;
  if auth.uid()<>v_shift.user_id and not public.staff_has_permission('pos.manage_shifts',v_shift.branch_id) then raise exception using errcode='42501',message='SHIFT_ACCESS_DENIED'; end if;
  select coalesce(sum(case when ct.transaction_type='deposit' then ct.amount when ct.transaction_type='withdrawal' then -ct.amount else 0 end),0) into v_movement
  from public.cash_transactions ct where ct.branch_id=v_shift.branch_id and ct.created_by=v_shift.user_id and ct.register_type='store' and ct.transaction_date>=v_shift.opened_at and ct.transaction_date<=now();
  v_expected:=round(v_shift.opening_cash+v_movement,2);
  select count(*),coalesce(sum(total),0) into v_sales_count,v_sales_total from public.sales where shift_id=v_shift.id;
  update public.pos_shifts set status='closed',closed_at=now(),closing_cash=round(p_closing_cash,2),expected_cash=v_expected,cash_difference=round(p_closing_cash-v_expected,2),closing_notes=nullif(trim(coalesce(p_notes,'')),''),closed_by=auth.uid(),updated_at=now() where id=v_shift.id returning * into v_shift;
  return to_jsonb(v_shift)||jsonb_build_object('cash_movement',v_movement,'sales_count',v_sales_count,'sales_total',v_sales_total,'employee_name',(select u.name from public.users u where u.id=v_shift.user_id),'device_name',v_device.name,'branch_name',(select b.name from public.branches b where b.id=v_shift.branch_id));
end;
$$;
revoke all on function public.close_pos_shift(uuid,uuid,text,numeric,text) from public,anon;
grant execute on function public.close_pos_shift(uuid,uuid,text,numeric,text) to authenticated;

create or replace function private.attach_pos_shift_to_sale()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_shift public.pos_shifts%rowtype;
begin
  if new.request_fingerprint is null then return new; end if;
  select * into v_shift from public.pos_shifts where user_id=new.cashier_id and branch_id=new.branch_id and status='open' order by opened_at desc limit 1;
  if v_shift.id is null then raise exception using errcode='55000',message='POS_SHIFT_REQUIRED'; end if;
  new.shift_id:=v_shift.id; new.device_id:=v_shift.device_id; return new;
end;
$$;

drop trigger if exists attach_pos_shift_to_sale on public.sales;
create trigger attach_pos_shift_to_sale before insert on public.sales for each row execute function private.attach_pos_shift_to_sale();
