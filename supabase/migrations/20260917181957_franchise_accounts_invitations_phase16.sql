-- Phase 16 — Franchise Accounts & Invitations
-- Secure invitation, membership lifecycle, password reset preparation, and account audit.

create table if not exists private.franchise_account_invitations_v1 (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  email text not null,
  email_normalized text generated always as (lower(btrim(email))) stored,
  role text not null check (role in ('owner','admin','manager')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  auth_user_id uuid references auth.users(id) on delete set null,
  invited_by uuid not null references auth.users(id) on delete restrict,
  invited_at timestamptz not null default now(),
  last_sent_at timestamptz,
  expires_at timestamptz not null default (now() + interval '72 hours'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text,
  delivery_kind text check (delivery_kind is null or delivery_kind in ('invite','recovery')),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_franchise_account_invite_pending_v1
  on private.franchise_account_invitations_v1(merchant_id,email_normalized)
  where status='pending';
create index if not exists idx_franchise_account_invite_merchant_v1
  on private.franchise_account_invitations_v1(merchant_id,status,created_at desc);
create index if not exists idx_franchise_account_invite_auth_user_v1
  on private.franchise_account_invitations_v1(auth_user_id,created_at desc)
  where auth_user_id is not null;

create table if not exists private.franchise_account_events_v1 (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  invitation_id uuid references private.franchise_account_invitations_v1(id) on delete set null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_franchise_account_events_merchant_v1
  on private.franchise_account_events_v1(merchant_id,created_at desc);
create index if not exists idx_franchise_account_events_target_v1
  on private.franchise_account_events_v1(target_user_id,created_at desc)
  where target_user_id is not null;

alter table private.franchise_account_invitations_v1 enable row level security;
alter table private.franchise_account_events_v1 enable row level security;
revoke all on private.franchise_account_invitations_v1 from public, anon, authenticated;
revoke all on private.franchise_account_events_v1 from public, anon, authenticated;
grant select,insert,update,delete on private.franchise_account_invitations_v1 to service_role;
grant select,insert,update,delete on private.franchise_account_events_v1 to service_role;

create or replace function private.log_franchise_account_event_v1(
  p_tenant_id uuid,
  p_merchant_id uuid,
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_invitation_id uuid,
  p_action text,
  p_before_state jsonb,
  p_after_state jsonb,
  p_reason text,
  p_metadata jsonb
)
returns void
language sql
security definer
set search_path=''
as $$
  insert into private.franchise_account_events_v1(
    tenant_id,merchant_id,actor_user_id,target_user_id,invitation_id,action,before_state,after_state,reason,metadata
  ) values(
    p_tenant_id,p_merchant_id,p_actor_user_id,p_target_user_id,p_invitation_id,p_action,
    p_before_state,p_after_state,nullif(btrim(coalesce(p_reason,'')),''),coalesce(p_metadata,'{}'::jsonb)
  );
$$;
revoke all on function private.log_franchise_account_event_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb) from public, anon, authenticated;
grant execute on function private.log_franchise_account_event_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,jsonb) to service_role;

create or replace function public.can_manage_franchise_accounts_v1(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select m.merchant_type='franchise' and public.can_manage_business_structure_v1(m.tenant_id)
    from public.merchants m
    where m.id=p_merchant_id
  ),false);
$$;
revoke all on function public.can_manage_franchise_accounts_v1(uuid) from public, anon;
grant execute on function public.can_manage_franchise_accounts_v1(uuid) to authenticated, service_role;

create or replace function private.assert_franchise_owner_continuity_v1(
  p_merchant_id uuid,
  p_target_user_id uuid,
  p_next_role text,
  p_next_active boolean
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_current public.merchant_members%rowtype;
  v_other_owners integer;
begin
  select * into v_current
  from public.merchant_members mm
  where mm.merchant_id=p_merchant_id and mm.user_id=p_target_user_id;

  if v_current.id is null then return; end if;
  if v_current.role='owner' and v_current.is_active and (not p_next_active or p_next_role<>'owner') then
    select count(*) into v_other_owners
    from public.merchant_members mm
    where mm.merchant_id=p_merchant_id
      and mm.user_id<>p_target_user_id
      and mm.role='owner'
      and mm.is_active;
    if v_other_owners=0 then
      raise exception using errcode='22023',message='FRANCHISE_LAST_OWNER_REQUIRED';
    end if;
  end if;
end;
$$;
revoke all on function private.assert_franchise_owner_continuity_v1(uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function private.assert_franchise_owner_continuity_v1(uuid,uuid,text,boolean) to service_role;

create or replace function public.get_franchise_accounts_v1(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_merchant public.merchants%rowtype;
  v_accounts jsonb;
  v_invitations jsonb;
  v_events jsonb;
begin
  select * into v_merchant from public.merchants m where m.id=p_merchant_id and m.merchant_type='franchise';
  if v_merchant.id is null then raise exception using errcode='P0002',message='FRANCHISE_NOT_FOUND'; end if;
  if not public.can_manage_franchise_accounts_v1(p_merchant_id) then
    raise exception using errcode='42501',message='FRANCHISE_ACCOUNT_MANAGER_REQUIRED';
  end if;

  select coalesce(jsonb_agg(x.obj order by x.sort_role,x.email,x.user_id),'[]'::jsonb)
  into v_accounts
  from (
    select mm.user_id,
      case mm.role when 'owner' then 1 when 'admin' then 2 when 'manager' then 3 else 9 end sort_role,
      coalesce(au.email,'') email,
      jsonb_build_object(
        'user_id',mm.user_id,
        'role',mm.role,
        'portal_access',mm.role in ('owner','admin','manager'),
        'is_active',mm.is_active,
        'email',au.email,
        'email_deliverable',case when au.email is null then false when au.email ilike '%@staff.elmadawymarket.local' then false else true end,
        'account_kind',case when au.email ilike '%@staff.elmadawymarket.local' then 'internal_staff_link' else 'franchise_email' end,
        'email_confirmed_at',au.email_confirmed_at,
        'invited_at',au.invited_at,
        'last_sign_in_at',au.last_sign_in_at,
        'auth_created_at',au.created_at,
        'auth_updated_at',au.updated_at,
        'active_session_count',(
          select count(*) from auth.sessions s
          where s.user_id=mm.user_id and (s.not_after is null or s.not_after>now())
        ),
        'last_session_at',(
          select max(s.updated_at) from auth.sessions s where s.user_id=mm.user_id
        ),
        'last_user_agent',(
          select left(coalesce(s.user_agent,''),180)
          from auth.sessions s
          where s.user_id=mm.user_id
          order by s.updated_at desc nulls last,s.created_at desc
          limit 1
        ),
        'membership_created_at',mm.created_at,
        'membership_updated_at',mm.updated_at
      ) obj
    from public.merchant_members mm
    left join auth.users au on au.id=mm.user_id
    where mm.merchant_id=p_merchant_id
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'email',i.email,'role',i.role,
    'status',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,
    'auth_user_id',i.auth_user_id,'invited_by',i.invited_by,'invited_at',i.invited_at,
    'last_sent_at',i.last_sent_at,'expires_at',i.expires_at,'accepted_at',i.accepted_at,
    'revoked_at',i.revoked_at,'revoke_reason',i.revoke_reason,'delivery_kind',i.delivery_kind,
    'last_error_code',i.last_error_code,'created_at',i.created_at,'updated_at',i.updated_at
  ) order by i.created_at desc),'[]'::jsonb)
  into v_invitations
  from private.franchise_account_invitations_v1 i
  where i.merchant_id=p_merchant_id;

  select coalesce(jsonb_agg(e.obj order by e.created_at desc),'[]'::jsonb)
  into v_events
  from (
    select a.created_at,jsonb_build_object(
      'id',a.id,'actor_user_id',a.actor_user_id,'target_user_id',a.target_user_id,'invitation_id',a.invitation_id,
      'action',a.action,'reason',a.reason,'metadata',a.metadata,'created_at',a.created_at
    ) obj
    from private.franchise_account_events_v1 a
    where a.merchant_id=p_merchant_id
    order by a.created_at desc
    limit 100
  ) e;

  return jsonb_build_object(
    'merchant',jsonb_build_object('id',v_merchant.id,'name',v_merchant.name,'code',v_merchant.code,'status',v_merchant.status),
    'accounts',v_accounts,
    'invitations',v_invitations,
    'events',v_events
  );
end;
$$;
revoke all on function public.get_franchise_accounts_v1(uuid) from public, anon;
grant execute on function public.get_franchise_accounts_v1(uuid) to authenticated, service_role;

create or replace function public.create_franchise_account_invitation_v1(
  p_merchant_id uuid,
  p_email text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_merchant public.merchants%rowtype;
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_invite private.franchise_account_invitations_v1%rowtype;
  v_auth_user_id uuid;
  v_member public.merchant_members%rowtype;
  v_action text;
begin
  select * into v_merchant from public.merchants m where m.id=p_merchant_id and m.merchant_type='franchise';
  if v_merchant.id is null then raise exception using errcode='P0002',message='FRANCHISE_NOT_FOUND'; end if;
  if not public.can_manage_franchise_accounts_v1(p_merchant_id) then
    raise exception using errcode='42501',message='FRANCHISE_ACCOUNT_MANAGER_REQUIRED';
  end if;
  if p_role not in ('owner','admin','manager') then raise exception using errcode='22023',message='FRANCHISE_ACCOUNT_ROLE_INVALID'; end if;
  if v_email='' or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception using errcode='22023',message='FRANCHISE_ACCOUNT_EMAIL_INVALID';
  end if;
  if v_email like '%@staff.elmadawymarket.local' then
    raise exception using errcode='22023',message='FRANCHISE_ACCOUNT_EMAIL_NOT_DELIVERABLE';
  end if;

  update private.franchise_account_invitations_v1
  set status='expired',updated_at=now()
  where merchant_id=p_merchant_id and status='pending' and expires_at<=now();

  select u.id into v_auth_user_id
  from auth.users u
  where lower(u.email)=v_email and u.deleted_at is null
  limit 1;

  if v_auth_user_id is not null then
    select * into v_member
    from public.merchant_members mm
    where mm.merchant_id=p_merchant_id and mm.user_id=v_auth_user_id;
    if v_member.id is not null and v_member.is_active then
      raise exception using errcode='23505',message='FRANCHISE_ACCOUNT_ALREADY_MEMBER';
    elsif v_member.id is not null and not v_member.is_active then
      raise exception using errcode='22023',message='FRANCHISE_ACCOUNT_MEMBERSHIP_INACTIVE';
    end if;
  end if;

  select * into v_invite
  from private.franchise_account_invitations_v1 i
  where i.merchant_id=p_merchant_id and i.email_normalized=v_email and i.status='pending'
  for update;

  if v_invite.id is null then
    insert into private.franchise_account_invitations_v1(tenant_id,merchant_id,email,role,invited_by)
    values(v_merchant.tenant_id,p_merchant_id,v_email,p_role,auth.uid())
    returning * into v_invite;
    v_action:='invitation_created';
  else
    update private.franchise_account_invitations_v1 i
    set role=p_role,invited_by=auth.uid(),invited_at=now(),expires_at=now()+interval '72 hours',
        last_error_code=null,updated_at=now()
    where i.id=v_invite.id
    returning * into v_invite;
    v_action:='invitation_refreshed';
  end if;

  perform private.log_franchise_account_event_v1(
    v_merchant.tenant_id,p_merchant_id,auth.uid(),v_auth_user_id,v_invite.id,v_action,null,
    jsonb_build_object('email',v_invite.email,'role',v_invite.role,'status',v_invite.status,'expires_at',v_invite.expires_at),
    null,'{}'::jsonb
  );

  return jsonb_build_object(
    'id',v_invite.id,'merchant_id',p_merchant_id,'tenant_id',v_merchant.tenant_id,
    'email',v_invite.email,'role',v_invite.role,'status',v_invite.status,'expires_at',v_invite.expires_at
  );
end;
$$;
revoke all on function public.create_franchise_account_invitation_v1(uuid,text,text) from public, anon;
grant execute on function public.create_franchise_account_invitation_v1(uuid,text,text) to authenticated, service_role;

create or replace function public.revoke_franchise_account_invitation_v1(
  p_invitation_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_invite private.franchise_account_invitations_v1%rowtype;
  v_before jsonb;
begin
  select * into v_invite from private.franchise_account_invitations_v1 i where i.id=p_invitation_id for update;
  if v_invite.id is null then raise exception using errcode='P0002',message='FRANCHISE_INVITATION_NOT_FOUND'; end if;
  if not public.can_manage_franchise_accounts_v1(v_invite.merchant_id) then
    raise exception using errcode='42501',message='FRANCHISE_ACCOUNT_MANAGER_REQUIRED';
  end if;
  if v_invite.status<>'pending' then raise exception using errcode='22023',message='FRANCHISE_INVITATION_NOT_PENDING'; end if;
  v_before:=to_jsonb(v_invite);
  update private.franchise_account_invitations_v1
  set status='revoked',revoked_at=now(),revoked_by=auth.uid(),revoke_reason=nullif(btrim(coalesce(p_reason,'')),''),updated_at=now()
  where id=p_invitation_id
  returning * into v_invite;
  perform private.log_franchise_account_event_v1(
    v_invite.tenant_id,v_invite.merchant_id,auth.uid(),v_invite.auth_user_id,v_invite.id,'invitation_revoked',v_before,to_jsonb(v_invite),p_reason,'{}'::jsonb
  );
  return jsonb_build_object('id',v_invite.id,'status',v_invite.status,'revoked_at',v_invite.revoked_at);
end;
$$;
revoke all on function public.revoke_franchise_account_invitation_v1(uuid,text) from public, anon;
grant execute on function public.revoke_franchise_account_invitation_v1(uuid,text) to authenticated, service_role;

create or replace function public.get_my_pending_franchise_invitations_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_email text;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='AUTH_REQUIRED'; end if;
  select lower(u.email) into v_email from auth.users u where u.id=auth.uid() and u.deleted_at is null;
  if v_email is null then raise exception using errcode='42501',message='FRANCHISE_INVITATION_EMAIL_REQUIRED'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'merchant_id',i.merchant_id,'merchant_name',m.name,'merchant_code',m.code,
    'role',i.role,'email',i.email,'expires_at',i.expires_at,'invited_at',i.invited_at
  ) order by i.invited_at desc),'[]'::jsonb)
  into v_result
  from private.franchise_account_invitations_v1 i
  join public.merchants m on m.id=i.merchant_id and m.merchant_type='franchise'
  join public.tenants t on t.id=i.tenant_id and t.status='active'
  where i.status='pending' and i.expires_at>now() and i.email_normalized=v_email;

  return v_result;
end;
$$;
revoke all on function public.get_my_pending_franchise_invitations_v1() from public, anon;
grant execute on function public.get_my_pending_franchise_invitations_v1() to authenticated, service_role;

create or replace function public.accept_my_franchise_invitation_v1(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_invite private.franchise_account_invitations_v1%rowtype;
  v_email text;
  v_merchant public.merchants%rowtype;
  v_before jsonb;
begin
  if auth.uid() is null then raise exception using errcode='28000',message='AUTH_REQUIRED'; end if;
  select lower(u.email) into v_email from auth.users u where u.id=auth.uid() and u.deleted_at is null;
  if v_email is null then raise exception using errcode='42501',message='FRANCHISE_INVITATION_EMAIL_REQUIRED'; end if;

  select * into v_invite from private.franchise_account_invitations_v1 i where i.id=p_invitation_id for update;
  if v_invite.id is null then raise exception using errcode='P0002',message='FRANCHISE_INVITATION_NOT_FOUND'; end if;
  if v_invite.status<>'pending' then raise exception using errcode='22023',message='FRANCHISE_INVITATION_NOT_PENDING'; end if;
  if v_invite.expires_at<=now() then
    update private.franchise_account_invitations_v1 set status='expired',updated_at=now() where id=v_invite.id;
    raise exception using errcode='22023',message='FRANCHISE_INVITATION_EXPIRED';
  end if;
  if v_invite.email_normalized<>v_email then raise exception using errcode='42501',message='FRANCHISE_INVITATION_EMAIL_MISMATCH'; end if;

  select m.* into v_merchant
  from public.merchants m join public.tenants t on t.id=m.tenant_id
  where m.id=v_invite.merchant_id and m.merchant_type='franchise' and t.status='active';
  if v_merchant.id is null then raise exception using errcode='22023',message='FRANCHISE_NOT_ACTIVE'; end if;

  v_before:=to_jsonb(v_invite);
  insert into public.merchant_members(tenant_id,merchant_id,user_id,role,is_active)
  values(v_invite.tenant_id,v_invite.merchant_id,auth.uid(),v_invite.role,true)
  on conflict(merchant_id,user_id) do update set role=excluded.role,is_active=true,updated_at=now();

  update private.franchise_account_invitations_v1
  set status='accepted',auth_user_id=auth.uid(),accepted_at=now(),accepted_by=auth.uid(),last_error_code=null,updated_at=now()
  where id=v_invite.id
  returning * into v_invite;

  perform private.log_franchise_account_event_v1(
    v_invite.tenant_id,v_invite.merchant_id,auth.uid(),auth.uid(),v_invite.id,'invitation_accepted',v_before,to_jsonb(v_invite),null,
    jsonb_build_object('role',v_invite.role)
  );

  return jsonb_build_object('merchant_id',v_merchant.id,'merchant_name',v_merchant.name,'role',v_invite.role,'status','accepted');
end;
$$;
revoke all on function public.accept_my_franchise_invitation_v1(uuid) from public, anon;
grant execute on function public.accept_my_franchise_invitation_v1(uuid) to authenticated, service_role;

create or replace function public.update_franchise_member_role_v1(
  p_merchant_id uuid,
  p_user_id uuid,
  p_role text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_merchant public.merchants%rowtype;
  v_member public.merchant_members%rowtype;
  v_before jsonb;
begin
  select * into v_merchant from public.merchants m where m.id=p_merchant_id and m.merchant_type='franchise';
  if v_merchant.id is null then raise exception using errcode='P0002',message='FRANCHISE_NOT_FOUND'; end if;
  if not public.can_manage_franchise_accounts_v1(p_merchant_id) then raise exception using errcode='42501',message='FRANCHISE_ACCOUNT_MANAGER_REQUIRED'; end if;
  if p_role not in ('owner','admin','manager') then raise exception using errcode='22023',message='FRANCHISE_ACCOUNT_ROLE_INVALID'; end if;

  select * into v_member from public.merchant_members mm where mm.merchant_id=p_merchant_id and mm.user_id=p_user_id for update;
  if v_member.id is null then raise exception using errcode='P0002',message='FRANCHISE_MEMBER_NOT_FOUND'; end if;
  if v_member.role not in ('owner','admin','manager') then raise exception using errcode='22023',message='FRANCHISE_MEMBER_NOT_PORTAL_ACCOUNT'; end if;
  perform private.assert_franchise_owner_continuity_v1(p_merchant_id,p_user_id,p_role,v_member.is_active);
  v_before:=to_jsonb(v_member);
  update public.merchant_members set role=p_role,updated_at=now() where id=v_member.id returning * into v_member;
  perform private.log_franchise_account_event_v1(v_merchant.tenant_id,p_merchant_id,auth.uid(),p_user_id,null,'member_role_changed',v_before,to_jsonb(v_member),p_reason,jsonb_build_object('role',p_role));
  return jsonb_build_object('user_id',p_user_id,'role',v_member.role,'is_active',v_member.is_active);
end;
$$;
revoke all on function public.update_franchise_member_role_v1(uuid,uuid,text,text) from public, anon;
grant execute on function public.update_franchise_member_role_v1(uuid,uuid,text,text) to authenticated, service_role;

create or replace function public.set_franchise_member_active_v1(
  p_merchant_id uuid,
  p_user_id uuid,
  p_active boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_merchant public.merchants%rowtype;
  v_member public.merchant_members%rowtype;
  v_before jsonb;
  v_action text;
begin
  select * into v_merchant from public.merchants m where m.id=p_merchant_id and m.merchant_type='franchise';
  if v_merchant.id is null then raise exception using errcode='P0002',message='FRANCHISE_NOT_FOUND'; end if;
  if not public.can_manage_franchise_accounts_v1(p_merchant_id) then raise exception using errcode='42501',message='FRANCHISE_ACCOUNT_MANAGER_REQUIRED'; end if;
  select * into v_member from public.merchant_members mm where mm.merchant_id=p_merchant_id and mm.user_id=p_user_id for update;
  if v_member.id is null then raise exception using errcode='P0002',message='FRANCHISE_MEMBER_NOT_FOUND'; end if;
  if v_member.role not in ('owner','admin','manager') then raise exception using errcode='22023',message='FRANCHISE_MEMBER_NOT_PORTAL_ACCOUNT'; end if;
  if not p_active and nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception using errcode='22023',message='FRANCHISE_MEMBER_DISABLE_REASON_REQUIRED'; end if;
  perform private.assert_franchise_owner_continuity_v1(p_merchant_id,p_user_id,v_member.role,p_active);
  v_before:=to_jsonb(v_member);
  update public.merchant_members set is_active=p_active,updated_at=now() where id=v_member.id returning * into v_member;
  v_action:=case when p_active then 'member_reactivated' else 'member_disabled' end;
  perform private.log_franchise_account_event_v1(v_merchant.tenant_id,p_merchant_id,auth.uid(),p_user_id,null,v_action,v_before,to_jsonb(v_member),p_reason,'{}'::jsonb);
  return jsonb_build_object('user_id',p_user_id,'role',v_member.role,'is_active',v_member.is_active);
end;
$$;
revoke all on function public.set_franchise_member_active_v1(uuid,uuid,boolean,text) from public, anon;
grant execute on function public.set_franchise_member_active_v1(uuid,uuid,boolean,text) to authenticated, service_role;

create or replace function public.prepare_franchise_password_reset_v1(
  p_merchant_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_member public.merchant_members%rowtype;
  v_email text;
begin
  if not public.can_manage_franchise_accounts_v1(p_merchant_id) then raise exception using errcode='42501',message='FRANCHISE_ACCOUNT_MANAGER_REQUIRED'; end if;
  select * into v_member from public.merchant_members mm where mm.merchant_id=p_merchant_id and mm.user_id=p_user_id;
  if v_member.id is null or v_member.role not in ('owner','admin','manager') then raise exception using errcode='P0002',message='FRANCHISE_MEMBER_NOT_FOUND'; end if;
  select lower(u.email) into v_email from auth.users u where u.id=p_user_id and u.deleted_at is null;
  if v_email is null then raise exception using errcode='22023',message='FRANCHISE_ACCOUNT_EMAIL_REQUIRED'; end if;
  if v_email like '%@staff.elmadawymarket.local' then raise exception using errcode='22023',message='FRANCHISE_ACCOUNT_EMAIL_NOT_DELIVERABLE'; end if;
  return jsonb_build_object('merchant_id',p_merchant_id,'user_id',p_user_id,'email',v_email,'role',v_member.role,'is_active',v_member.is_active);
end;
$$;
revoke all on function public.prepare_franchise_password_reset_v1(uuid,uuid) from public, anon;
grant execute on function public.prepare_franchise_password_reset_v1(uuid,uuid) to authenticated, service_role;

create or replace function public.service_resolve_auth_user_by_email_v1(p_email text)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select case when u.id is null then null else jsonb_build_object(
    'user_id',u.id,'email',u.email,'email_confirmed_at',u.email_confirmed_at,'invited_at',u.invited_at,'last_sign_in_at',u.last_sign_in_at
  ) end
  from (select lower(btrim(coalesce(p_email,''))) email) q
  left join lateral (
    select au.id,au.email,au.email_confirmed_at,au.invited_at,au.last_sign_in_at
    from auth.users au
    where lower(au.email)=q.email and au.deleted_at is null
    limit 1
  ) u on true;
$$;
revoke all on function public.service_resolve_auth_user_by_email_v1(text) from public, anon, authenticated;
grant execute on function public.service_resolve_auth_user_by_email_v1(text) to service_role;

create or replace function public.service_mark_franchise_invitation_delivery_v1(
  p_invitation_id uuid,
  p_actor_user_id uuid,
  p_auth_user_id uuid,
  p_delivery_kind text,
  p_success boolean,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_invite private.franchise_account_invitations_v1%rowtype;
  v_before jsonb;
  v_action text;
begin
  if p_delivery_kind not in ('invite','recovery') then raise exception using errcode='22023',message='FRANCHISE_INVITATION_DELIVERY_KIND_INVALID'; end if;
  select * into v_invite from private.franchise_account_invitations_v1 i where i.id=p_invitation_id for update;
  if v_invite.id is null then raise exception using errcode='P0002',message='FRANCHISE_INVITATION_NOT_FOUND'; end if;
  v_before:=to_jsonb(v_invite);
  update private.franchise_account_invitations_v1
  set auth_user_id=coalesce(p_auth_user_id,auth_user_id),delivery_kind=p_delivery_kind,
      last_sent_at=case when p_success then now() else last_sent_at end,
      last_error_code=case when p_success then null else nullif(btrim(coalesce(p_error_code,'')),'') end,
      updated_at=now()
  where id=p_invitation_id
  returning * into v_invite;
  v_action:=case when p_success then 'invitation_delivery_sent' else 'invitation_delivery_failed' end;
  perform private.log_franchise_account_event_v1(v_invite.tenant_id,v_invite.merchant_id,p_actor_user_id,p_auth_user_id,v_invite.id,v_action,v_before,to_jsonb(v_invite),null,jsonb_build_object('delivery_kind',p_delivery_kind,'error_code',p_error_code));
  return jsonb_build_object('id',v_invite.id,'status',v_invite.status,'last_sent_at',v_invite.last_sent_at,'last_error_code',v_invite.last_error_code);
end;
$$;
revoke all on function public.service_mark_franchise_invitation_delivery_v1(uuid,uuid,uuid,text,boolean,text) from public, anon, authenticated;
grant execute on function public.service_mark_franchise_invitation_delivery_v1(uuid,uuid,uuid,text,boolean,text) to service_role;

create or replace function public.service_log_franchise_password_reset_v1(
  p_merchant_id uuid,
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_success boolean,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_tenant_id uuid;
begin
  select m.tenant_id into v_tenant_id
  from public.merchants m
  join public.merchant_members mm on mm.merchant_id=m.id and mm.user_id=p_target_user_id
  where m.id=p_merchant_id and m.merchant_type='franchise' and mm.role in ('owner','admin','manager');
  if v_tenant_id is null then raise exception using errcode='P0002',message='FRANCHISE_MEMBER_NOT_FOUND'; end if;
  perform private.log_franchise_account_event_v1(
    v_tenant_id,p_merchant_id,p_actor_user_id,p_target_user_id,null,
    case when p_success then 'password_reset_sent' else 'password_reset_failed' end,
    null,null,null,jsonb_build_object('error_code',p_error_code)
  );
end;
$$;
revoke all on function public.service_log_franchise_password_reset_v1(uuid,uuid,uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.service_log_franchise_password_reset_v1(uuid,uuid,uuid,boolean,text) to service_role;
