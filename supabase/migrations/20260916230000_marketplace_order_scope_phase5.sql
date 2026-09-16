-- Phase 5: Marketplace order ownership (MVP: one order belongs to one merchant)
-- Existing orders are backfilled without firing business triggers.

begin;

alter table public.online_orders add column if not exists tenant_id uuid;
alter table public.online_orders add column if not exists merchant_id uuid;
alter table public.online_orders add column if not exists merchant_snapshot jsonb;

-- Historical metadata-only backfill. Suppress business triggers so this migration cannot
-- emit notifications, loyalty, delivery signals, or authorization side effects.
alter table public.online_orders disable trigger user;

update public.online_orders o
set tenant_id=b.tenant_id,
    merchant_id=b.merchant_id
from public.branches b
where o.branch_id=b.id
  and (o.tenant_id is null or o.merchant_id is null);

do $$
declare
  v_owned_count integer;
  v_tenant_id uuid;
  v_merchant_id uuid;
begin
  select count(*) into v_owned_count
  from public.merchants m
  where m.merchant_type='owned' and m.status='active';

  if exists (select 1 from public.online_orders where merchant_id is null) then
    if v_owned_count <> 1 then
      raise exception 'cannot_backfill_branchless_orders_ambiguous_owned_merchant';
    end if;

    select m.tenant_id,m.id into v_tenant_id,v_merchant_id
    from public.merchants m
    where m.merchant_type='owned' and m.status='active'
    limit 1;

    update public.online_orders
    set tenant_id=v_tenant_id,
        merchant_id=v_merchant_id
    where merchant_id is null;
  end if;
end $$;

update public.online_orders o
set merchant_snapshot=jsonb_build_object(
  'id',m.id,
  'code',m.code,
  'name',m.name,
  'type',m.merchant_type
)
from public.merchants m
where o.merchant_id=m.id
  and o.merchant_snapshot is null;

alter table public.online_orders enable trigger user;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='online_orders_tenant_id_fkey'
      and conrelid='public.online_orders'::regclass
  ) then
    alter table public.online_orders
      add constraint online_orders_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='online_orders_merchant_id_fkey'
      and conrelid='public.online_orders'::regclass
  ) then
    alter table public.online_orders
      add constraint online_orders_merchant_id_fkey
      foreign key (merchant_id) references public.merchants(id) on delete restrict;
  end if;
end $$;

alter table public.online_orders alter column tenant_id set not null;
alter table public.online_orders alter column merchant_id set not null;

create index if not exists idx_online_orders_tenant_merchant_created
  on public.online_orders (tenant_id, merchant_id, created_at desc);
create index if not exists idx_online_orders_merchant_status_created
  on public.online_orders (merchant_id, status, created_at desc);

create or replace function private.set_online_order_merchant_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_merchant_id uuid;
  v_merchant_name text;
  v_merchant_code text;
  v_merchant_type text;
  v_merchant_status text;
  v_branch_active boolean;
  v_count integer;
begin
  if new.branch_id is not null then
    select b.tenant_id, b.merchant_id, b.active,
           m.name, m.code, m.merchant_type, m.status
      into v_tenant_id, v_merchant_id, v_branch_active,
           v_merchant_name, v_merchant_code, v_merchant_type, v_merchant_status
    from public.branches b
    join public.merchants m on m.id=b.merchant_id
    where b.id=new.branch_id;

    if v_tenant_id is null then
      raise exception 'order_branch_not_found';
    end if;

    if coalesce(v_branch_active,false)=false or v_merchant_status <> 'active' then
      raise exception 'order_branch_or_merchant_inactive';
    end if;

    if new.tenant_id is not null and new.tenant_id <> v_tenant_id then
      raise exception 'order_cross_tenant_not_allowed';
    end if;

    if new.merchant_id is not null and new.merchant_id <> v_merchant_id then
      raise exception 'order_cross_merchant_not_allowed';
    end if;

  elsif new.merchant_id is not null then
    select m.tenant_id,m.id,m.name,m.code,m.merchant_type,m.status
      into v_tenant_id,v_merchant_id,v_merchant_name,v_merchant_code,v_merchant_type,v_merchant_status
    from public.merchants m
    where m.id=new.merchant_id;

    if v_tenant_id is null then
      raise exception 'order_merchant_not_found';
    end if;

    if v_merchant_status <> 'active' then
      raise exception 'order_merchant_inactive';
    end if;

    if v_merchant_type <> 'owned' then
      raise exception 'marketplace_order_requires_branch';
    end if;

    if new.tenant_id is not null and new.tenant_id <> v_tenant_id then
      raise exception 'order_cross_tenant_not_allowed';
    end if;

  else
    if new.tenant_id is not null then
      select count(*) into v_count
      from public.merchants m
      where m.tenant_id=new.tenant_id
        and m.merchant_type='owned'
        and m.status='active';

      if v_count=1 then
        select m.tenant_id,m.id,m.name,m.code,m.merchant_type,m.status
          into v_tenant_id,v_merchant_id,v_merchant_name,v_merchant_code,v_merchant_type,v_merchant_status
        from public.merchants m
        where m.tenant_id=new.tenant_id
          and m.merchant_type='owned'
          and m.status='active'
        limit 1;
      end if;
    else
      select count(*) into v_count
      from public.merchants m
      where m.merchant_type='owned' and m.status='active';

      if v_count=1 then
        select m.tenant_id,m.id,m.name,m.code,m.merchant_type,m.status
          into v_tenant_id,v_merchant_id,v_merchant_name,v_merchant_code,v_merchant_type,v_merchant_status
        from public.merchants m
        where m.merchant_type='owned' and m.status='active'
        limit 1;
      end if;
    end if;

    if v_merchant_id is null then
      raise exception 'order_merchant_scope_required';
    end if;
  end if;

  new.tenant_id := v_tenant_id;
  new.merchant_id := v_merchant_id;

  if tg_op='INSERT'
     or new.merchant_snapshot is null
     or old.merchant_id is distinct from new.merchant_id then
    new.merchant_snapshot := jsonb_build_object(
      'id',v_merchant_id,
      'code',v_merchant_code,
      'name',v_merchant_name,
      'type',v_merchant_type
    );
  end if;

  return new;
end;
$$;

revoke all on function private.set_online_order_merchant_scope_v1() from public;

drop trigger if exists zz_set_online_order_merchant_scope_v1 on public.online_orders;
create trigger zz_set_online_order_merchant_scope_v1
before insert or update of branch_id, tenant_id, merchant_id
on public.online_orders
for each row
execute function private.set_online_order_merchant_scope_v1();

commit;
