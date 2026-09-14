create table if not exists private.order_picker_assignment_policy_v1 (
  branch_id uuid primary key references public.branches(id) on delete cascade,
  mode text not null default 'shadow' check (mode in ('shadow','assisted')),
  offer_ttl_seconds integer not null default 90 check (offer_ttl_seconds between 30 and 300),
  updated_by uuid null references public.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists private.order_picker_assignment_offers_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.online_orders(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  offered_user_id uuid not null references public.users(id),
  recommended_score numeric null,
  status text not null default 'offered' check (status in ('offered','accepted','declined','expired','cancelled')),
  reason text null,
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists order_picker_assignment_offers_one_live_order_v1
  on private.order_picker_assignment_offers_v1(order_id)
  where status='offered';
create unique index if not exists order_picker_assignment_offers_one_live_user_v1
  on private.order_picker_assignment_offers_v1(offered_user_id)
  where status='offered';
create index if not exists order_picker_assignment_offers_branch_status_v1
  on private.order_picker_assignment_offers_v1(branch_id,status,expires_at);

revoke all on private.order_picker_assignment_policy_v1 from public, anon, authenticated;
revoke all on private.order_picker_assignment_offers_v1 from public, anon, authenticated;