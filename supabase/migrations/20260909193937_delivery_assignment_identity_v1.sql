create table if not exists private.delivery_order_assignments_v1 (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.online_orders(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  delivery_user_id uuid not null references public.users(id) on delete restrict,
  assigned_by uuid not null references public.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unassigned_by uuid references public.users(id) on delete restrict,
  unassigned_at timestamptz,
  unassign_reason text,
  metadata jsonb not null default '{}'::jsonb,
  constraint delivery_assignment_unassign_actor_check check ((unassigned_at is null and unassigned_by is null) or unassigned_at is not null)
);

alter table private.delivery_order_assignments_v1 enable row level security;

create unique index if not exists delivery_order_assignments_v1_one_active_order_idx
  on private.delivery_order_assignments_v1(order_id)
  where unassigned_at is null;
create index if not exists delivery_order_assignments_v1_driver_time_idx
  on private.delivery_order_assignments_v1(delivery_user_id, assigned_at desc);
create index if not exists delivery_order_assignments_v1_branch_time_idx
  on private.delivery_order_assignments_v1(branch_id, assigned_at desc);

-- Assignment RPCs introduced with this production migration were refined in
-- v2/v3 below. Fresh environments receive the final definitions in v3.
