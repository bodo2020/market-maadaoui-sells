# Staff Inventory Preview QA

This runbook validates the Staff Expiry V2 and Batch Reconciliation V1 work before any Production migration.

## Safety rules

- Run only on a Supabase Development/Preview branch.
- Never run these migrations or this test suite directly on Production.
- The integration suite is self-contained in a transaction and ends with `ROLLBACK`.
- If a statement fails, treat the run as failed; do not continue to Production.

## Migrations under test

1. `supabase/migrations/20260921003500_staff_expiry_actions_v2.sql`
2. `supabase/migrations/20260921083000_staff_batch_reconciliation_v1.sql`

The notification push routing migration is independent and should be tested separately.

## Preflight

1. Create/rebase a Supabase Development Branch from current Production.
2. Confirm project health is ACTIVE_HEALTHY.
3. Apply the two migrations above in order.
4. Verify these RPCs exist:
   - `get_expiry_workspace_v2(uuid,integer,integer)`
   - `process_expiry_batch_action_v2(uuid,uuid,uuid,numeric,text,text)`
   - `get_supplier_returns_workspace_v2(uuid,text,integer)`
   - `settle_supplier_return_v2(uuid,numeric,text,text)`
   - `get_inventory_batch_reconciliation_workspace_v1(uuid,integer)`
   - `get_inventory_batch_reconciliation_suppliers_v1(uuid)`
   - `reconcile_product_batches_v1(uuid,uuid,uuid,jsonb,text)`
5. Verify `SECURITY DEFINER` functions have `search_path=''` and explicit EXECUTE revokes/grants.
6. Run Supabase security and performance advisors.

## Automated integration suite

Run:

`supabase/staff_inventory_hardening.test.sql`

Expected final row:

`PASS: staff inventory authorization, batch reconciliation, idempotency, rollback, zero-stock cleanup, expiry freshness, batch-ledger alignment, and atomic disposal`

The suite covers:

- unauthorized reconciliation workspace denial;
- minimal supplier selector privacy;
- duplicate/legacy batch detection;
- fresh matched inventory-count gate;
- reconciliation preserving Inventory;
- reconciliation request idempotency;
- request-id conflict rejection;
- invalid-total rollback;
- duplicate canonical-line rollback;
- zero-Inventory cleanup to no active batches;
- expiry workspace audit readiness;
- stale matched-count rejection after Inventory changes;
- batch-ledger mismatch rejection even with a refreshed count;
- successful expiry disposal only after fresh count + batch ledger alignment;
- expiry action idempotency;
- noncash expiry expense behavior.

## Manual Staff UI QA

### Batch Reconciliation

1. Open Staff → العمل → المخزون والجرد → تسوية الدفعات.
2. Verify only users with both `inventory.manage` + `purchases.manage`, or Super Admin, can access.
3. Confirm card shows:
   - Inventory;
   - active batch total;
   - gap;
   - legacy / zero-cost / duplicate flags.
4. Without a current matched count, “فتح التسوية” must be disabled.
5. Create “جرد تحقق”, submit matching count, then reopen reconciliation.
6. Ensure supplier dropdown exposes only supplier name/code.
7. Change canonical line quantities so total differs from Inventory: submit must remain disabled.
8. Restore exact total and submit.
9. Verify:
   - Inventory quantity unchanged;
   - no Inventory movement created;
   - no expense/payment/supplier-credit created;
   - canonical batches total = Inventory;
   - superseded old active rows are quantity 0;
   - DAMAGED history remains untouched;
   - audit snapshot has before/after + actor + note + verified count.

### Expiry

1. Open Staff → المخزون → الصلاحية.
2. Verify summary shows:
   - expired;
   - expires today;
   - action ready;
   - purchase value at risk.
3. Verify readiness banner shows batch mismatch and audit-pending counts.
4. A legacy/duplicate/missing-cost row must not allow financial action.
5. A clean row with no fresh matched count must not allow financial action.
6. A clean row with fresh count but batch total != Inventory must require Batch Reconciliation.
7. Only when:
   - data quality is safe;
   - active batch total = Inventory;
   - matched count is fresh and actual_count = current Inventory;
   may disposal/return buttons enable.
8. Disposal:
   - decrements Inventory and the batch atomically;
   - creates a noncash expense;
   - retry with same request ID must not duplicate.
9. Supplier return:
   - decrements Inventory and batch atomically;
   - creates `pending_credit` return;
   - must not mutate supplier balance/cash at this stage.
10. Credit Note settlement is a separate explicit step.

## Release decision

Do not merge or apply to Production unless:

- automated suite passes;
- security advisor has no new critical errors from these migrations;
- real Staff UI QA passes on Android;
- migration behavior is confirmed on a Production-like Preview schema.

After approval, deploy migrations through the normal migration path; do not copy/paste ad-hoc SQL into Production.
