-- Targeted index hardening for Finance Settlement Transfer V2.
-- Covers the settlement account foreign keys used by finance reconciliation/audit.

create index if not exists payment_settlements_clearing_account_idx
  on public.payment_settlements(clearing_account_id);

create index if not exists payment_settlements_bank_account_idx
  on public.payment_settlements(bank_account_id)
  where bank_account_id is not null;

create index if not exists payment_settlements_cash_account_idx
  on public.payment_settlements(cash_account_id)
  where cash_account_id is not null;

create index if not exists payment_ledger_settlement_idx
  on public.payment_ledger(settlement_id)
  where settlement_id is not null;
