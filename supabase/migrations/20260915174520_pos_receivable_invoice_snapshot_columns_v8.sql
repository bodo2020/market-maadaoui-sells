alter table public.sales
  add column if not exists receivable_party_kind text,
  add column if not exists receivable_balance_before numeric(14,2),
  add column if not exists receivable_balance_after numeric(14,2),
  add column if not exists receivable_credit_limit numeric(14,2),
  add column if not exists receivable_credit_available_after numeric(14,2);

alter table public.pos_invoices
  add column if not exists receivable_party_kind text,
  add column if not exists receivable_balance_before numeric(14,2),
  add column if not exists receivable_balance_after numeric(14,2),
  add column if not exists receivable_credit_limit numeric(14,2),
  add column if not exists receivable_credit_available_after numeric(14,2);
