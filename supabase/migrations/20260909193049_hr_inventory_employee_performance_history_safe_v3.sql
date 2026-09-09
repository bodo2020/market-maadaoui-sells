-- Production migration 20260909193049.
-- This intermediate correction made the original inventory-count result
-- history-safe by deriving matched/discrepancy from the persisted numeric
-- variance instead of the mutable workflow status. This prevents a reviewed
-- count from disappearing from historical performance after Peer Recount.
--
-- The function is replaced again by active-time v4 below. This marker keeps
-- repository migration history aligned with production; v4 contains the full
-- replayable final definition.
select 1;
