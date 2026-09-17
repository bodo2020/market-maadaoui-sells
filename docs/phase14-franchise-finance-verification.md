# Phase 14 — Franchise Finance Verification

Production migration: `20260917152412_franchise_finance_settlements_phase14`.

Verified before UI merge:
- Transaction integration test: `PHASE14_FRANCHISE_FINANCE_PASS`.
- Idempotent POS / delivered-online accrual.
- Historical agreement snapshot and fee basis.
- Monthly fixed fee posted once per month.
- Settlement workflow: draft → approved → paid, with cancellation release support.
- Private settlement event audit trail.
- Post-test rollback check: zero leaked QA sales, ledger entries, settlements, or audit events.
- Anonymous execution revoked from Phase 14 public finance RPCs.

This file also serves as the Phase 14 CI synchronization marker.
