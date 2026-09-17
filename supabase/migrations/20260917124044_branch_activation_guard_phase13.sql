-- Phase 13 follow-up: explicit branch activation lifecycle and audit.
-- A Franchise branch may only be activated while its operator and current agreement are active.

create table if not exists private.branch_state_events_v1 (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete cascade,
  from_active boolean not null,
  to_active boolean not null,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_branch_state_events_v1_branch_created
  on private.branch_state_events_v1(branch_id, created_at desc);
create index if not exists idx_branch_state_events_v1_tenant_created
  on private.branch_state_events_v1(tenant_id, created_at desc);

alter table private.branch_state_events_v1 enable row level security;
revoke all on table private.branch_state_events_v1 from anon, authenticated;
grant select on table private.branch_state_events_v1 to service_role;

create or replace function public.set_branch_active_v1(
  p_branch_id uuid,
  p_active boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.branches%rowtype;
  v_merchant public.merchants%rowtype;
  v_agreement private.franchise_agreements_v1%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception using errcode='42501', message='AUTHENTICATION_REQUIRED';
  end if;

  select * into v_branch
  from public.branches
  where id = p_branch_id
  for update;

  if v_branch.id is null then
    raise exception using errcode='P0002', message='BRANCH_NOT_FOUND';
  end if;

  if not public.can_manage_business_structure_v1(v_branch.tenant_id) then
    raise exception using errcode='42501', message='BUSINESS_STRUCTURE_MANAGER_REQUIRED';
  end if;

  select * into v_merchant
  from public.merchants
  where id = v_branch.merchant_id;

  if v_merchant.id is null then
    raise exception using errcode='P0002', message='BRANCH_MERCHANT_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext('branch-active:' || p_branch_id::text));

  if v_branch.active = p_active then
    if v_merchant.merchant_type = 'franchise' then
      select * into v_agreement
      from private.franchise_agreements_v1
      where merchant_id = v_merchant.id
        and is_current = true
      order by version desc
      limit 1;
    end if;

    return jsonb_build_object(
      'branch_id', v_branch.id,
      'tenant_id', v_branch.tenant_id,
      'merchant_id', v_branch.merchant_id,
      'merchant_type', v_merchant.merchant_type,
      'merchant_status', v_merchant.status,
      'active', v_branch.active,
      'changed', false,
      'reason', v_reason,
      'agreement_status', v_agreement.status,
      'agreement_starts_on', v_agreement.starts_on,
      'agreement_ends_on', v_agreement.ends_on
    );
  end if;

  if not p_active and v_reason is null then
    raise exception using errcode='22023', message='BRANCH_DISABLE_REASON_REQUIRED';
  end if;

  if p_active then
    if v_merchant.status <> 'active' then
      raise exception using errcode='P0001', message='BRANCH_MERCHANT_NOT_ACTIVE';
    end if;

    if v_merchant.merchant_type = 'franchise' then
      select * into v_agreement
      from private.franchise_agreements_v1
      where merchant_id = v_merchant.id
        and is_current = true
      order by version desc
      limit 1;

      if v_agreement.id is null then
        raise exception using errcode='P0001', message='FRANCHISE_AGREEMENT_REQUIRED';
      end if;
      if v_agreement.status <> 'active' then
        raise exception using errcode='P0001', message='FRANCHISE_AGREEMENT_NOT_ACTIVE';
      end if;
      if v_agreement.starts_on > current_date then
        raise exception using errcode='P0001', message='FRANCHISE_AGREEMENT_NOT_STARTED';
      end if;
      if v_agreement.ends_on is not null and v_agreement.ends_on < current_date then
        raise exception using errcode='P0001', message='FRANCHISE_AGREEMENT_EXPIRED';
      end if;
    end if;
  end if;

  update public.branches
  set active = p_active,
      updated_at = now()
  where id = p_branch_id;

  insert into private.branch_state_events_v1(
    tenant_id,
    merchant_id,
    branch_id,
    from_active,
    to_active,
    reason,
    actor_user_id,
    metadata
  ) values (
    v_branch.tenant_id,
    v_branch.merchant_id,
    v_branch.id,
    v_branch.active,
    p_active,
    v_reason,
    v_actor,
    jsonb_build_object(
      'merchant_type', v_merchant.merchant_type,
      'merchant_status', v_merchant.status,
      'agreement_id', v_agreement.id,
      'agreement_status', v_agreement.status,
      'agreement_starts_on', v_agreement.starts_on,
      'agreement_ends_on', v_agreement.ends_on
    )
  );

  return jsonb_build_object(
    'branch_id', v_branch.id,
    'tenant_id', v_branch.tenant_id,
    'merchant_id', v_branch.merchant_id,
    'merchant_type', v_merchant.merchant_type,
    'merchant_status', v_merchant.status,
    'active', p_active,
    'changed', true,
    'reason', v_reason,
    'agreement_status', v_agreement.status,
    'agreement_starts_on', v_agreement.starts_on,
    'agreement_ends_on', v_agreement.ends_on
  );
end;
$$;

revoke all on function public.set_branch_active_v1(uuid, boolean, text) from public, anon;
grant execute on function public.set_branch_active_v1(uuid, boolean, text) to authenticated, service_role;

comment on function public.set_branch_active_v1(uuid, boolean, text) is
  'Explicit Branch 360 activation/deactivation. Franchise activation requires an active in-date agreement; deactivation requires a reason and is audited.';
