create index if not exists purchases_created_by_v2_idx
  on public.purchases (created_by)
  where created_by is not null;

create index if not exists purchases_posted_by_v2_idx
  on public.purchases (posted_by)
  where posted_by is not null;

create index if not exists purchases_pricing_branch_v2_idx
  on public.purchases (pricing_branch_id)
  where pricing_branch_id is not null;

create index if not exists purchases_voided_by_v2_idx
  on public.purchases (voided_by)
  where voided_by is not null;

create index if not exists product_batches_supplier_v2_idx
  on public.product_batches (supplier_id)
  where supplier_id is not null;

drop index if exists private.supplier_representatives_v1_supplier_active_idx;
