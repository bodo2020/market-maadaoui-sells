# Online Money Flow

## Core rule
`online_orders.payment_status = paid` does **not** mean the money is inside the branch safe.
The financial location of the money must always be explicit.

## 1. Cash on delivery

Current rollout (before driver accounts exist):

1. Customer order is delivered and payment is confirmed as `cash`.
2. The order amount is posted once to the branch `online_collection` cash account.
3. The branch safe is unchanged.
4. When the delivery/online collection is physically handed to the branch, a manager uses **Online Cash -> Branch Safe**.
5. One atomic cash transfer posts:
   - `online_collection - amount`
   - `branch_safe + amount`

This avoids showing money in the safe while it is still outside the safe.

### Next delivery-app upgrade
When delivery staff use real authenticated `delivery_user_id` identities:

- Create one physical cash custody account per driver / active delivery shift.
- A COD delivery posts to the driver's custody account instead of the branch pool.
- Driver handover becomes `driver_custody -> branch_safe` or `driver_custody -> online_collection -> branch_safe` depending operational preference.
- Driver cannot finish a cash collection shift until expected cash vs counted cash is reconciled.

The current branch `online_collection` account is intentionally compatible with that future split.

## 2. Wallet / card / bank transfer

Digital paid orders never affect physical cash accounts.

1. Payment confirmation posts the gross order amount to a `gateway_clearing` account for that payment method.
2. The amount remains in clearing while the provider holds it.
3. When the provider sends a settlement, the manager records:
   - Gross settlement
   - Provider fee
   - Net received
   - Provider / bank reference
4. The system posts:
   - Clearing decreases by the gross settlement.
   - Bank increases by the net settlement.
   - Provider fee is recorded separately against clearing.

Example:
- Gross: 1,000 EGP
- Fee: 25 EGP
- Net to bank: 975 EGP

After settlement the 1,000 EGP receivable is fully cleared and 975 EGP is represented in the bank account.

## 3. Refunds

### Cash refund
- Return approval restores inventory to `inventory_source_branch_id`.
- Refund is deducted from a real cash account (currently branch safe for admin return flow).
- Return approval, inventory restore and cash refund are one database transaction.

### Digital refund
- Return approval restores inventory and creates a `payment_refunds` row with `pending` status.
- A negative `refund_pending` entry reduces the provider clearing balance / creates a provider refund liability.
- The return is shown as `pending_provider`, not `completed`.
- Only `confirm_online_refund` marks the refund completed after a provider reference/confirmation.
- The online order becomes fully `refunded` only when confirmed refunds reach the full order total.

## 4. Historical data

Do not automatically backfill old `cash_transactions` or old paid/cancelled orders into the new ledgers.
Historical data contains mixed semantics (`store`, `online`, `merged`) and several old `paid + cancelled` states.
The new ledgers start from the controlled cutover point.

## 5. Source of truth

Physical cash:
- `cash_accounts`
- `cash_ledger`
- `cash_transfers`

Digital money:
- `payment_accounts`
- `payment_ledger`
- `payment_settlements`
- `payment_refunds`

Operational order state remains in `online_orders`, but order status is not a replacement for a financial ledger.

## 6. Required future delivery fields

When the Delivery App is connected, add/standardize:

- `online_orders.delivery_user_id`
- `delivery_shifts`
- driver cash custody account id
- `cash_collected_at`
- `cash_collected_by`
- `cash_handed_over_at`
- handover / settlement id

Never rely on free-text `delivery_person` as the financial custodian.
