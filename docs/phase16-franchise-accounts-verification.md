# Phase 16 — Franchise Accounts & Invitations Verification

## Scope

Phase 16 adds secure Franchise operator account lifecycle management on top of Phase 15. It does not merge or modify `main` directly.

## Production database

- Migration applied: `20260917181957_franchise_accounts_invitations_phase16`.
- New private tables:
  - `private.franchise_account_invitations_v1`
  - `private.franchise_account_events_v1`
- Both tables have RLS enabled.
- `anon` and `authenticated` have no direct table access.
- Service-role-only helper RPCs are not executable by browser roles.
- SECURITY DEFINER functions in this phase use an empty `search_path`.

## Integration transaction

A real production transaction was executed and rolled back. It verified:

- creating a Franchise invitation;
- rejecting an owned/non-Franchise merchant;
- rejecting internal pseudo-email addresses;
- rejecting invitation acceptance from an Auth user with a different email;
- accepting the invitation from the matching Auth user;
- creating the merchant membership with the requested role;
- changing an account role;
- disabling and reactivating the merchant membership;
- password-reset preparation for a deliverable email;
- account workspace visibility;
- blocking disable/downgrade of the final active owner.

Rollback post-check:

- temporary membership leaks: `0`
- temporary invitation leaks: `0`
- temporary audit-event leaks: `0`

No real external mailbox was used by this database integration test.

## Trusted Auth delivery

Production Edge Function: `franchise-account-admin`

- deployed with `verify_jwt=true`;
- validates caller Supabase Auth JWT;
- browser never receives the service-role key;
- new email addresses use Supabase Auth invitation delivery;
- existing Auth users use recovery/setup delivery;
- password resets are delivered by email rather than allowing an internal admin to set the operator password;
- delivery attempts are recorded in the account audit trail.

The function currently falls back to `https://elmaday-market.lovable.app` for the portal base URL when `FRANCHISE_PORTAL_BASE_URL` is not configured.

## Frontend isolation

- Internal account management appears only on `/franchise/:merchantId` for Admin/Super Admin.
- `/franchise-auth` handles invitation/recovery completion outside the staff Auth/PIN lifecycle.
- Invite/recovery URL hashes are routed into the Franchise auth shell even when the provider falls back to the application root.
- The operator sets their own password.
- Accepting an invitation is still enforced server-side by matching the authenticated Auth email to the pending invitation.
- Last sign-in, session count, and latest user-agent may be displayed internally; IP addresses are not displayed.

## CI

Pending on the Phase 16 head. The draft PR is temporarily retargeted to `main` only to trigger the repository workflows, then will be restored to `work/franchise-operator-portal-phase15` after verification.
