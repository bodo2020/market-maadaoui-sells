# POS Offline-first

## What works offline

- The installed/cached POS application shell can reopen without a network connection.
- The latest branch catalog (up to the server catalog limit of 5,000 rows) is kept in IndexedDB.
- Product search, exact barcode lookup, scale barcodes, cart editing, cash checkout, and receipt printing work from the local snapshot.
- Cash sales are written atomically to the local outbox together with the provisional stock deduction.
- Each sale keeps one UUID request ID. Replaying it through `create_pos_sale_v4` cannot create a duplicate sale.
- Pending sales sync automatically when connectivity returns. Deterministic server conflicts move to `needs_review` instead of being retried forever.
- The cashier session, open shift, and an offline PIN verifier are cached for up to 12 hours. The PIN verifier uses PBKDF2-SHA256 (250,000 iterations) and a per-device random salt.
- A shift cannot be closed while offline, while sales are waiting to sync, or while a sale needs review.

## Deliberate restrictions

Offline checkout is cash-only. The following operations require a live server check:

- card, wallet, bank transfer, and mixed payments;
- customer loyalty lookup and earning;
- vouchers;
- employee credit and employee points;
- opening/closing a shift and switching cashiers;
- returns and refunds;
- changing prices, payment methods, users, devices, or permissions.

These restrictions avoid accepting a payment or consuming a balance that cannot be authorized while disconnected.

## First-use requirement

Before the device can sell offline, it must complete one online cycle:

1. Sign in and unlock the app with the staff PIN.
2. Select the branch and open a POS shift.
3. Open the POS workspace and wait for the catalog/payment methods to load.

The app then has the device, user, shift, catalog, cash method, and PIN snapshots required for offline operation.

## Reconciliation behavior

The local receipt number starts with `OFF-`. The authoritative invoice number is assigned by the server during sync. If stock, price, device, permission, or shift validation fails, the item is marked `needs_review` and closing the shift is blocked until it is resolved.

## Manual acceptance checklist

1. Load POS online, confirm the green `متصل` badge, and make one normal cash sale.
2. In browser DevTools, switch Network to Offline.
3. Refresh the page, unlock with PIN, search and scan a cached product, then complete a cash sale.
4. Confirm the temporary `OFF-...` receipt and the amber offline banner.
5. Restore Network to Online and confirm the pending count returns to zero.
6. Confirm exactly one server sale exists for the outbox request UUID and that inventory/cash ledger changed once.
7. Repeat with a stock conflict and verify the red `تحتاج مراجعة` status blocks shift closure.
