create index if not exists pos_invoices_employee_id_idx
  on public.pos_invoices(employee_id)
  where employee_id is not null;

create index if not exists hr_employee_wallet_ledger_branch_idx
  on private.hr_employee_wallet_ledger(branch_id);

create index if not exists hr_employee_wallet_ledger_actor_idx
  on private.hr_employee_wallet_ledger(actor_user_id)
  where actor_user_id is not null;
