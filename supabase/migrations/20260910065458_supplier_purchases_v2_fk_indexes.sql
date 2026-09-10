create index if not exists supplier_payments_v2_cash_ledger_entry_idx
  on private.supplier_payments_v2 (cash_ledger_entry_id)
  where cash_ledger_entry_id is not null;

create index if not exists supplier_payments_v2_created_by_idx
  on private.supplier_payments_v2 (created_by)
  where created_by is not null;

create index if not exists supplier_payments_v2_fee_ledger_entry_idx
  on private.supplier_payments_v2 (fee_ledger_entry_id)
  where fee_ledger_entry_id is not null;

create index if not exists supplier_payments_v2_payment_ledger_entry_idx
  on private.supplier_payments_v2 (payment_ledger_entry_id)
  where payment_ledger_entry_id is not null;

create index if not exists supplier_payments_v2_representative_idx
  on private.supplier_payments_v2 (representative_id)
  where representative_id is not null;

create index if not exists supplier_payments_v2_supplier_idx
  on private.supplier_payments_v2 (supplier_id);

create index if not exists supplier_payments_v2_voided_by_idx
  on private.supplier_payments_v2 (voided_by)
  where voided_by is not null;

create index if not exists supplier_payments_v2_wallet_operation_idx
  on private.supplier_payments_v2 (wallet_operation_id)
  where wallet_operation_id is not null;

create index if not exists supplier_purchase_return_items_v2_product_idx
  on private.supplier_purchase_return_items_v2 (product_id);

create index if not exists supplier_purchase_return_items_v2_return_idx
  on private.supplier_purchase_return_items_v2 (return_id);

create index if not exists supplier_purchase_returns_v2_branch_idx
  on private.supplier_purchase_returns_v2 (branch_id);

create index if not exists supplier_purchase_returns_v2_created_by_idx
  on private.supplier_purchase_returns_v2 (created_by)
  where created_by is not null;

create index if not exists supplier_purchase_returns_v2_supplier_idx
  on private.supplier_purchase_returns_v2 (supplier_id);

create index if not exists supplier_purchase_returns_v2_voided_by_idx
  on private.supplier_purchase_returns_v2 (voided_by)
  where voided_by is not null;
