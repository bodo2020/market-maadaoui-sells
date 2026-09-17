# Phase 15 — Franchise Operator Portal verification

## Production migration

- Version: `20260917164205`
- Name: `franchise_operator_portal_phase15`
- Project: `marketpos`

## Integration verification

The backend was tested inside a database transaction and rolled back after assertions.

Verified:

- A non-staff Supabase Auth user with an active Franchise `owner` membership can resolve the portal identity.
- The owner is limited to the linked Franchise merchant and can view the sanitized Finance section.
- Portal membership does not grant internal staff `finance.manage` permissions.
- Access to an owned Elmadawy merchant is rejected server-side.
- A `manager` membership can use the operational portal but receives no Franchise Finance payload.
- A `staff` merchant membership cannot enter the operator portal.
- The test membership was rolled back; the post-check returned zero temporary-membership leaks.

## RPC ACL verification

- `get_my_franchise_portal_identity_v1()` — `anon`: denied, `authenticated`: allowed.
- `get_my_franchise_portal_v1(...)` — `anon`: denied, `authenticated`: allowed.
- `private.my_franchise_portal_role_v1(uuid)` — direct `anon`/`authenticated` execution denied.
- All new SECURITY DEFINER functions use an empty `search_path`.

## Frontend isolation

The Franchise portal is routed outside the employee `AuthProvider`. It therefore does not inherit Staff PIN gates, employee branch selection, Admin navigation, internal notification docks, or POS workspace restore behavior.

Routes:

- `/franchise-login`
- `/franchise-portal`
- `/franchise-portal/:merchantId`

The first release is intentionally read-only. Agreement transitions, branch creation, settlement approval/payment/cancellation, and platform controls remain internal Elmadawy operations.
