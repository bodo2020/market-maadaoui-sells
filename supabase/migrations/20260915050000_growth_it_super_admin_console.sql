create table if not exists public.staff_password_reset_audit_v1 (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  target_user_id uuid not null,
  target_username text,
  target_role text,
  reason text,
  source text not null default 'admin-reset-staff-password',
  created_at timestamptz not null default now()
);

alter table public.staff_password_reset_audit_v1 enable row level security;
revoke all on table public.staff_password_reset_audit_v1 from anon, authenticated;
comment on table public.staff_password_reset_audit_v1 is 'Service-role only audit trail for administrative staff password resets. Password values are never stored.';
comment on column public.staff_password_reset_audit_v1.actor_user_id is 'Authenticated administrator who performed the reset. Null only for controlled system/bootstrap resets.';

create or replace function public.is_growth_it_super_admin_v1()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select auth.uid() is not null and private.staff_is_super_admin(auth.uid());
$function$;

revoke all on function public.is_growth_it_super_admin_v1() from public, anon;
grant execute on function public.is_growth_it_super_admin_v1() to authenticated;

create or replace function public.get_growth_it_super_admin_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_accounts jsonb;
  v_pos jsonb;
begin
  if v_uid is null then
    raise exception using errcode='42501', message='AUTH_REQUIRED';
  end if;
  if not private.staff_is_super_admin(v_uid) then
    raise exception using errcode='42501', message='SUPER_ADMIN_REQUIRED';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.active desc, x.name, x.username), '[]'::jsonb)
    into v_accounts
  from (
    select
      u.id,
      u.name,
      u.username,
      u.role,
      u.active,
      u.created_at,
      au.last_sign_in_at,
      au.email as auth_email,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'branch_id', ubr.branch_id,
          'branch_name', b.name,
          'role', ubr.role,
          'active', ubr.active,
          'is_primary', ubr.is_primary,
          'pos_enabled', ubr.pos_enabled
        ) order by ubr.is_primary desc, b.name)
        from public.user_branch_roles ubr
        left join public.branches b on b.id=ubr.branch_id
        where ubr.user_id=u.id
      ), '[]'::jsonb) as branches
    from public.users u
    left join auth.users au on au.id=u.id
    where lower(coalesce(u.role,'')) not in ('customer','client')
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.branch_name, x.device_name), '[]'::jsonb)
    into v_pos
  from (
    select
      d.id as device_id,
      d.branch_id,
      b.name as branch_name,
      d.device_code,
      d.name as device_name,
      d.active as device_active,
      d.last_seen_at,
      d.revoked_at,
      (d.active and d.revoked_at is null and coalesce(d.last_seen_at,'epoch'::timestamptz)>now()-interval '2 minutes') as online,
      s.id as shift_id,
      s.user_id as cashier_user_id,
      u.name as cashier_name,
      u.username as cashier_username,
      s.opened_at,
      s.status as shift_status,
      coalesce(s.drawer_account_id, ca.id) as drawer_account_id,
      ca.name as drawer_account_name,
      case when coalesce(s.drawer_account_id,ca.id) is null then null else private.cash_account_balance(coalesce(s.drawer_account_id,ca.id)) end as drawer_balance
    from public.pos_devices d
    left join public.branches b on b.id=d.branch_id
    left join lateral (
      select ps.*
      from public.pos_shifts ps
      where ps.device_id=d.id and ps.status='open'
      order by ps.opened_at desc
      limit 1
    ) s on true
    left join public.users u on u.id=s.user_id
    left join public.cash_accounts ca on ca.id=coalesce(
      s.drawer_account_id,
      (select ca2.id from public.cash_accounts ca2 where ca2.device_id=d.id and ca2.account_type='pos_drawer' and ca2.active order by ca2.created_at desc limit 1)
    )
    where d.revoked_at is null
  ) x;

  return jsonb_build_object(
    'is_super_admin', true,
    'accounts', v_accounts,
    'pos_drawers', v_pos,
    'generated_at', now()
  );
end;
$function$;

revoke all on function public.get_growth_it_super_admin_v1() from public, anon;
grant execute on function public.get_growth_it_super_admin_v1() to authenticated;
