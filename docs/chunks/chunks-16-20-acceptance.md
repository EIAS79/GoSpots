# Chunks 16–20 — Growth Platform acceptance

## Stack discipline

This branch implements Chunks 16–20 on top of the Chunks 11–15 branch. Chunks 11–15 remain unmerged while this stacked PR is validated. `main` must not be changed from this PR until the dependency stack is intentionally merged in order.

## Chunk 16 — Reservations 2.0

Implemented:

- Existing `Reservation` remains the booking source of truth.
- One capacity engine serves staff/public booking and evaluates flexible resources, categories, party size, opening hours, maintenance, active sessions, event holds and reservation overlap.
- Capacity policies provide pre/post buffers and party-size limits.
- Recurring bookings are generated as one series and written under deterministic resource locks.
- Public bookings return a one-time guest management token; new rows persist only its SHA-256 hash plus expiry/revocation metadata.
- Public manage flows support reschedule and cancellation with booking evidence updates and token revocation.
- Reservation policies snapshot deposits, cancellation and no-show behavior.
- Reservation deposit movements are append-only and correlation-idempotent; capture/refund evidence links to successful payment/refund records.
- Waitlist offers expire server-side. Conversion locks both the offered waitlist row and the selected resource, then re-checks all booking conflicts before inserting the Reservation.
- `/growth/waitlist/:id/convert` is the canonical conversion endpoint. `/claim` is retained only as an explicitly deprecated compatibility alias.
- Reservation-to-Operations conversion is idempotent and reuses the existing `OperationsSession` domain.
- Timeline API combines reservations, waitlist, active sessions and event resource holds.
- Stripe-hosted deposit Checkout uses server-generated return URLs, provider idempotency, one open attempt per reservation/balance, hashed Checkout URL storage, and webhook-authoritative capture.
- The public-deposit checkout migration enables and forces RLS and uses `app_tenant_rls_ok("shopId")` for both `USING` and `WITH CHECK`.

Automated gates cover reservation/event/maintenance/session overlap, waitlist race/claim behavior, deposit over-refund/idempotency, recurring public booking, public guest-token management, Stripe Checkout reuse/create/webhook/mismatch/capture behavior and migration deployment/Prisma validation.

## Chunk 17 — Promotions, Packages and Tips

Implemented:

- Pricing rules execute server-side with deterministic priority, stackability and exclusive-group behavior.
- Rule evidence records every evaluated rule, including rule metadata, minimum-subtotal result, each condition input/result, each benefit input/calculation, selected benefit, skip/apply status and explanation.
- Quote evidence also stores normalized evaluation inputs: requested subtotal/tax/tip, promotion ids/codes, package ids and pricing context.
- Immutable pricing snapshots persist the complete evaluation evidence under a content hash.
- Packages are first-class priced bundles with direct component-cost inputs; quote output exposes package revenue, package direct cost and contribution before other costs.
- Tips use an append-only signed ledger. Refund/reversal movements are preserved rather than mutating prior entries, and reports reconcile card/cash totals after negative movements.

Automated gates cover deterministic ordering, exclusive-group conflicts, non-stackable conflicts, condition failures, zero-benefit matches, full rule evidence, package direct-cost reconciliation and tip refund/reversal reporting.

## Chunk 18 — CRM, Membership, Loyalty and Stored Value

Implemented:

- Tenant-scoped customer profiles normalize identities and preserve explicit marketing-consent timestamp/source.
- Staff can explicitly grant or revoke marketing consent for a tenant customer.
- Duplicate merge uses deterministic customer locks and moves identities, loyalty rows, stored-value accounts, visits and review proofs to the canonical customer; membership resolves to the higher-ranked effective tier and a merge audit is written.
- Membership tiers and enrollment are venue-scoped.
- Loyalty is append-only/correlation-idempotent. Refund/cancellation reward reversal computes only the positive net points attributable to the canonical source.
- Verified visits are created only from canonical settlement/completion evidence.
- Verified-review proof tokens are returned once and only their SHA-256 hash is stored.
- Stored-value codes are returned once and stored only as SHA-256 hashes. Balance movements are append-only and redemption is serialized to prevent a negative balance.
- GDPR/DSAR erasure now reaches Growth CRM: customer PII/consent/notes are redacted, identity rows are removed, review proof tokens are revoked, ledger notes are cleared and stored-value accounts are detached while financial balances/ledger rows are retained.
- An operator page exposes consent, membership, loyalty, refund reward reversal, verified visit/review-proof, stored-value, package and tip workflows from the dashboard.

Automated gates cover merge behavior, reward reversal, stored-value concurrency, verified visits/review proofs, consent grant/revoke tenant isolation and Growth GDPR/DSAR redaction semantics.

## Chunk 19 — Events / Parties 2.0

Implemented:

- Existing `EventRequest` remains the inquiry source of truth.
- Proposal versions are allocated under an event-scoped advisory lock.
- Resource holds are conflict-checked and expire server-side; stale HOLD state rolls back when no active hold remains.
- Accepted/confirmed event holds convert into existing `Reservation` rows instead of introducing a competing resource calendar.
- Payment schedules link to successful existing payments.
- Event execution attaches an existing GuestCheck for order/settlement continuity.
- Service close is blocked while checklist items remain open.
- Completion is hard-blocked until the Event GuestCheck is `SETTLED` and due payment milestones are paid.
- Cancellation releases active resource holds.
- Event result exposes profitability reconciliation inputs/contribution.
- Operator UI exposes proposal, hold, checklist, start, final-payment, completion and cancellation actions.

Automated gates cover proposal version serialization, hold expiry/rollback, checklist enforcement, GuestCheck settlement enforcement, due-payment enforcement, cancellation hold release and profitability output.

## Chunk 20 — Analytics 2.0

Implemented:

- `LedgerEntry` is the financial source of truth for settled revenue/refunds.
- Provider `Payment`/`Refund` rows are reconciled by currency against Ledger and variance is surfaced explicitly; provider drift is never silently treated as reconciled.
- Finance output incorporates latest immutable pricing evidence, tip ledger, Inventory COGS and Workforce labor cost.
- Operations analytics use venue-local opening windows, maintenance and session intervals; durations are clipped to the half-open reporting window.
- Guest analytics include verified visits/repeat visits, loyalty liability, stored-value liability, public acquisition to settled-visit attribution and promotion contribution inputs.
- Semantic `AnalyticsFact` range facts rebuild deterministically for Finance, Operations and Guests using a source-version contract.
- The web exposes exactly four decision surfaces: `Overview`, `Operations`, `Guests`, `Finance`, with resource/promotion/acquisition/reconciliation detail tables used as drill-down evidence.
- Venue timezone/DST behavior is shared with the booking opening-hours engine. Automated tests cover Europe/Warsaw spring-forward, autumn fall-back, clipping and overnight windows.

Automated gates cover Ledger/provider reconciliation, explicit variance, latest pricing-snapshot deduplication, invalid reporting windows, semantic-fact rebuild and venue-local timezone/DST edges.

## Security and integrity

- New direct shop-scoped tables use the established `app_tenant_rls_ok("shopId")` RLS contract.
- Financial/customer ledgers and pricing snapshots are append-only/immutable at the database layer where defined by the migrations; corrections are additional movements.
- Reservation writes are protected by transaction-time overlap checks and database overlap constraints.
- Public guest/deposit secrets are not persisted as plaintext by new writes.
- Stripe deposit money is created only from a verified paid webhook event whose amount/currency matches the server-side checkout attempt.

## Operator/public UI

- Staff Growth workspace: capacity/booking, waitlist, pricing preview, customer identity/merge, event execution.
- Advanced customer/commerce controls: consent, membership, loyalty/reversal, verified visit/review proof, stored value, packages and tips.
- Public reservation booking and guest management flow remains routed through the unified capacity engine.
- Public Stripe deposit return page reads server status; it does not treat the browser return as payment authority.
- Analytics provides the four required decision screens and navigation from Growth.

## CI acceptance gate

This stack may be called **automated-gate complete** only when the exact PR head passes all of the following after the last code/document change:

1. frozen-lockfile dependency installation;
2. Prisma client generation;
3. API Jest suite;
4. API TypeScript build;
5. web checkout/offline tests;
6. web TypeScript check and production build;
7. Edge Hub tests/build;
8. empty-Postgres `prisma migrate deploy`;
9. `prisma migrate status` with no pending migrations;
10. `prisma validate`;
11. PR review-thread cleanup at the same head.

The temporary TypeScript CI diagnostic wrapper used while isolating the Prisma/install failure has been removed; API build now executes the normal `pnpm run build` gate.

## External environment validation

The following cannot be truthfully proven by repository CI and must not be represented as provider-verified until the environment is available:

- Stripe account keys/webhook endpoint configured in the target environment and at least one real Stripe test-mode Checkout → webhook → deposit status round trip observed end to end.
- Vercel deployment itself while the account is refusing deployments because its free deployment quota is exhausted.
- Final human browser/device visual QA against the deployed target environment.

These external checks do not justify weakening or bypassing the automated gates above.
