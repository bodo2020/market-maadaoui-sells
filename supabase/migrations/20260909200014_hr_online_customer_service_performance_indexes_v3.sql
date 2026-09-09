create index if not exists order_status_history_actor_time_order_idx
  on public.order_status_history (changed_by, created_at desc, order_id)
  where changed_by is not null;

create index if not exists order_status_history_order_time_idx
  on public.order_status_history (order_id, created_at desc);

create index if not exists customer_interactions_branch_assignee_created_idx
  on public.customer_interactions (branch_id, assigned_to, created_at desc)
  where assigned_to is not null;

create index if not exists customer_interactions_branch_completer_completed_idx
  on public.customer_interactions (branch_id, completed_by, completed_at desc)
  where completed_by is not null and completed_at is not null;

create index if not exists customer_interactions_branch_creator_created_idx
  on public.customer_interactions (branch_id, created_by, created_at desc)
  where created_by is not null;
