# Chunks 16–20 — Growth Platform Ready acceptance

## Implementation status

This stacked branch implements the engineering scope for Chunks 16–20 on top of the validated Chunks 11–15 head. `main` is intentionally untouched until the stack is reviewed and merged in dependency order.

## Chunk 16 — Reservations 2.0

- Existing `Reservation` remains booking source-of-truth.
- Policy snapshots add fixed/percentage deposits, late-cancel and no-show handling.
- Deposit movements are append-only and must link to an existing successful `Payment`/`Refund` for capture/refund evidence.
- Waitlist supports priority, expiring offers and conflict-safe conversion into existing reservations.
- Reservation-to-Operations conversion reuses `OperationsSession` and effective rate-plan snapshots.
- Timeline API combines reservations, waitlist, active sessions and event resource holds.
- Resource/event races are serialized with advisory locks; database exclusion constraints remain the final overlap guard.

## Chunk 17 — Promotions, Packages and Tips

- Pricing rules execute server-side with deterministic priority, exclusive-group and stackability behavior.
- Packages are first-class priced bundles with immutable component snapshots.
- Pricing snapshots are content-hashed and immutable.
- Tips use an append-only signed ledger with reversal/refund entries rather than destructive edits.

## Chunk 18 — CRM, Membership, Loyalty and Stored Value

- Tenant-scoped customer profiles preserve explicit marketing-consent timestamp/source.
- Membership tiers are venue-defined and effective customer enrollment is unique per venue/customer.
- Loyalty and stored-value accounting are append-only, idempotent by correlation ID and protected against negative redemption balances under an advisory lock.
- Stored-value codes are stored only as SHA-256 hashes; plaintext is returned only when an account is created.
- Customer history reads existing reservations and GuestChecks rather than copying transaction history.

## Chunk 19 — Events / Parties 2.0

- Existing `EventRequest` remains the inquiry source-of-truth.
- Versioned proposals, resource holds, payment schedules and execution state extend it.
- Accepting a proposal converts confirmed holds into existing `Reservation` rows.
- Successful existing checkout payments are linked to scheduled event payments.
- Event execution may attach an existing GuestCheck for ordering/settlement continuity.

## Chunk 20 — Analytics 2.0

- Analytics reads canonical operational sources: successful `Payment`, successful `Refund`, immutable pricing snapshots/tips, Operations sessions, Reservation, KDS prep tickets, Inventory 2.0 stock movements, Workforce punches, CRM ledgers and Event execution/payment schedule.
- Response includes explicit reconciliation variance between successful-payment net revenue and pricing-snapshot totals instead of silently pretending incomplete snapshot coverage is reconciled.
- Resource utilization and labor duration are interval-clipped to the requested reporting window.

## Security and integrity

All new direct shop-scoped tables use the same `app_tenant_rls_ok("shopId")` RLS policy as Chunks 01–15. Financial/customer ledgers and pricing snapshots have database triggers that reject UPDATE/DELETE. Corrections are reversal entries.

## Validation gate

Do not mark this stack DONE until Prisma generation/schema validation, API build/lint/tests, web build/lint/tests, migration deployment against empty PostgreSQL, exact-head CI and automated review cleanup all pass.
