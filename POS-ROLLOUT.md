# POS order workspace and checkout compatibility

## Implemented on this draft branch

- Responsive order list: desktop table, tablet/mobile cards, actual branch counts, searchable customer/phone/reference, paginated results, independent preparation/payment filters.
- Responsive order detail: products and delivery snapshot, summary and deliberate status actions, no invented stage timestamps, print layout.
- Version 1 customer orders retain their saved name/address and do not deduct inventory again when delivered; their commercial items are read-only.
- POS sale creation calls `create_pos_sale`: sale, branch stock and cash receipt commit or roll back together. Browser cash logging and aggregate-product stock writes were removed from this sale path.
- Persistent request per cashier/branch/cart keeps retries on one sale UUID and original invoice. Received cash over the total is change, not revenue. Reset clears only a confirmed request.
- Inventory delta helper calls arithmetic `adjust_branch_inventory`; callers may supply a stable request UUID for a retry. Existing callers without one get atomic arithmetic, not cross-call retry deduplication.

## Database state

`supabase/atomic_pos_sales.sql` was applied to marketpos as `atomic_pos_sale_and_branch_stock`. Its test file passes inside BEGIN/ROLLBACK, covering units, bulk packs, fractional kg, overselling rollback, duplicate request/cash receipt, stock adjustment retries and customer-role denial. These RPCs are additive; the published POS still uses its old source until rollout.

## Validation and remaining rollout gates

The responsive UI commit passed the existing GitHub Build workflow. Re-run that workflow for the final service integration commit. No browser/device screenshots have been verified and this branch has not been deployed or merged.

Keep `private.customer_checkout_rollout.enabled` false. The customer source version 8 is also not deployed. Before enabling that separate checkout engine:

1. Deploy all online status/payment callers together. `online_order_operations.sql` now handles legacy delivery stock, modern order transitions, confirmation references and cash receipt once. The four delivery/status paths and payment dialog use this API. Historical delivered/paid orders are not backfilled. The published old POS still contains its previous writes until rollout.
2. Replace remaining absolute inventory writers in inventory management/import/legacy delivery and remove permissive catalog/inventory write policies in a coordinated staff rollout.
3. Replace legacy direct customer order INSERT policy with the new placement flow; verify customer isolation with independent sessions.
4. Verify the responsive UI and full order lifecycle on the preview, then coordinate customer/POS deployment. Build success alone is not device or production acceptance.

The new POS sale RPC validates staff totals/payment split but retains existing staff-authorized item pricing. Cash balance calculation in the legacy cash function is not claimed to serialize every other cash writer. Do not describe the full rollout as completed based on this draft.


## Online order operations follow-up

`atomic_online_order_operations` was applied additively. Its rollback-only test covers legacy units/bulk/fractional kg, modern checkout without a second stock deduction, preserving wallet method, payment before/after delivery, repeated calls, stock shortage rollback, stale/out-of-sequence transitions, cancellation restocking once and customer-role rejection.

The RPC is restricted to active admin/super_admin accounts, matching the existing checkout manager guard. Branchless orders require branch assignment before processing. Card/wallet/bank payments are confirmed and referenced but do not enter the physical cash balance. Refunds remain a separate process; cancelling does not claim a refund.

Existing inventory management/import writers and permissive database policies still require coordinated replacement. This additive API does not secure old clients that continue writing tables directly, and the customer checkout activation flag remains false.
