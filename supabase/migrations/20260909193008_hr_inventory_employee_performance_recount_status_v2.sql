-- Production migration 20260909193008.
-- This intermediate correction aligned Inventory Performance V1 with the real
-- inventory_audit_recounts_v2 state machine:
-- matched_system | confirmed_variance | conflicting.
--
-- The function is replaced again by the history-safe v3 and active-time v4
-- migrations below. Keeping this version marker in source preserves migration
-- history parity; fresh environments receive the final full function in v4.
select 1;
