-- M19b — cover settlement timeline reads used by the partner settlement control.
create index if not exists merchant_settlement_events_settlement_created_v1_idx
  on private.merchant_settlement_events_v1(settlement_id,created_at);
