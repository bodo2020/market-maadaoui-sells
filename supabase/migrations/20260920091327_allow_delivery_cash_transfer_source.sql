alter table public.cash_transfers
  drop constraint if exists cash_transfers_from_register_check;

alter table public.cash_transfers
  add constraint cash_transfers_from_register_check
  check (from_register in ('store', 'online', 'safe', 'drawer', 'delivery'));
