# GoSpots Phase 9 — Customer Value Acceptance

## Status

`ACCEPTED`

Phase 9 of the GoSpots Master Product & Engineering Execution Plan v2 is accepted. The implementation, exact-head CI, guarded merge, resulting `main`, production deployment, runtime health and the critical customer-portal production route have been verified. Phase 10 was not started as part of this acceptance.

## Final acceptance evidence

- Phase 9 implementation PR: `#69` — `Phase 9: customer value integrity and growth completion`.
- Final PR head validated before merge: `3c0e3b861d49780df06d646f4f00731b4c6165af`.
- All required workflows were green on that exact PR head, including the dedicated Phase 9 gate and repository-wide Chromium E2E.
- PR `#69` was squash-merged with expected-head protection.
- Resulting `main` revision: `c23167ff348b6afe27b69e2b53a615fcc2c28a9d`.
- Vercel production deployment: `dpl_9hiNFga1vkNoAKkdSXtUd2NSCsM3`, target `production`, exact Git revision `c23167ff348b6afe27b69e2b53a615fcc2c28a9d`, state `READY`.
- Canonical production domains include `gospots.pl`, `www.gospots.pl`, `gospots.eu`, and `www.gospots.eu`; `https://www.gospots.pl/` returned HTTP `200` after deployment.
- Production Phase 9 route `https://www.gospots.pl/customer/<token>` matched `/customer/[token]` and returned HTTP `200` in the production smoke check. A deliberately invalid token was used so the smoke check did not read or mutate real customer data.
- Vercel production runtime-error inspection after deployment returned no runtime errors, and production `error`/`fatal` log inspection returned no matching log entries.
- The merge commit's Vercel status changed to `success`.

## Scope

Phase 9 owns:

- anonymous-first customer identity;
- customer deduplication and consent provenance;
- membership lifecycle and benefit usage;
- prepaid package balances;
- loyalty earn/redeem/expiry/refund reversal;
- stored value and transfer policy;
- deterministic promotions and usage limits;
- customer portal projections, booking history, profile and consent controls;
- reconciliation of benefits with financial value.

Phase 10 workforce/approval work is not part of this change.

## Existing work reused

The implementation extends the existing Growth domain instead of creating parallel customer or financial truth:

- `CustomerProfile`, `CustomerIdentity`, `CustomerMergeAudit`;
- `CustomerMembership`, `MembershipTier`;
- `LoyaltyLedgerEntry`, `StoredValueAccount`, `StoredValueLedgerEntry`;
- `PackageDefinition`, `PromotionRule`, `RuleCondition`, `RuleBenefit`;
- canonical `Payment` / `CheckSettlement` lineage;
- shared `withClientIdempotency` request-hash primitive;
- tenant context and RLS conventions;
- audit service and permission catalog;
- immutable pricing snapshots and rule applications.

## Phase 9 delta

### Customers and privacy

- Ordinary walk-ins can be represented without email or phone.
- Marketing consent writes append-only provenance events.
- Customer preferences are versioned operational data.
- Merge finalization moves Phase 9 consent, preference and value history to the canonical customer while preserving prior evidence.
- Cross-tenant customer references fail.

### Memberships

- Enrollment is recorded as lifecycle evidence.
- Effective membership status evaluates expiry server-side.
- Tier included benefits are granted into an immutable usage ledger.
- Benefit consumption is serialized and cannot make the balance negative.
- Renewal is idempotent and auditable.
- Client-provided `isMember` is overridden by server-derived membership state for pricing.

### Loyalty

- Loyalty mutations use shared canonical idempotency with request hashes.
- Same key + same payload replays the same result.
- Same key + changed payload returns the canonical idempotency conflict.
- Concurrent redemption cannot make the ledger balance negative.
- Program policy is versioned.
- Due points become explicit `EXPIRE` ledger facts instead of balance edits.
- Refund/cancel reward effects become explicit `REVERSAL` ledger facts.

### Prepaid packages

- Purchased customer package accounts reference the existing `PackageDefinition`.
- Balance is the sum of immutable package ledger entries.
- Loads require successful canonical payment lineage.
- Concurrent consumption is serialized and cannot create a negative balance.
- Exhausted packages move to a terminal `DEPLETED` state without deleting history.

### Stored value

- Existing stored-value ledger remains authoritative.
- Load/redeem/refund/reversal/adjustment operations are idempotent and serialized.
- Loads require successful canonical payment lineage.
- Expiry, refund and transfer behavior is explicit policy.
- Transfers lock both accounts deterministically and create balanced debit/credit facts.
- Reconciliation surfaces negative balances, expired liabilities, missing/failed payment lineage, currency mismatch and missing settlement lineage.

### Promotions

- Usage policies add first-visit, quantity, total-use and per-customer limits.
- Usage-limited promotions require explicit code/selection to avoid invisible consumption.
- Redemption evidence is immutable and correlated to the pricing snapshot/source.
- Product and timed-resource targeting may not be mixed in one unsafe rule.
- Existing deterministic priority, stacking, exclusive group, start/end and time-window behavior is preserved.

### Customer portal

- Portal access uses random opaque tokens; only the SHA-256 token hash is persisted.
- Portal tokens expire and can be revoked.
- Projection is built from canonical customer, reservation, visit, membership, loyalty, package, stored-value and compliance-document facts.
- Portal exposes upcoming reservations, past booking history, visit history, membership, loyalty, package balances, stored value and receipts/invoices.
- Customers can update their current name/email/phone and marketing consent from the portal.
- Profile changes are audited and cannot claim another same-tenant customer's email/phone identity.
- Historical identity aliases remain linked to the canonical customer so prior reservation history remains visible after contact details change.
- Portal does not create a second customer or financial source of truth.
- Portal capability-token controllers are explicitly public capability surfaces; dashboard/staff Phase 9 APIs remain JWT/permission protected. This prevents dashboard session cookies from incorrectly forcing session-CSRF semantics onto customer capability-token mutations without disabling CSRF for authenticated dashboard mutations.

## Database and migration strategy

The Phase 9 migration is expand-only. It adds lifecycle/policy/evidence tables and leaves existing Growth v2 ledgers intact.

Direct shop-scoped Phase 9 tables:

- enable and force PostgreSQL row-level security;
- use the canonical `app_tenant_rls_ok("shopId")` policy;
- use check constraints for states, signed-entry invariants, positive versions and policy bounds;
- use unique correlation/source evidence where deterministic replay requires a database backstop.

The dedicated CI gate verifies both:

1. clean deployment of the complete migration chain;
2. representative upgrade from a pre-Phase-9 database containing a real legacy customer, consent, loyalty points and stored-value liability.

## Acceptance tests

### Pure rules

- membership expiry;
- signed loyalty/stored-value/package movements;
- invalid amount rejection;
- promotion first-visit/quantity/usage limits;
- product vs timed-resource promotion separation;
- stored-value expiry;
- promotion stacking/non-stacking;
- normal and overnight time windows.

### Persisted PostgreSQL pilot

The Phase 9 operational pilot proves:

- anonymous customer creation;
- consent provenance and preference retention across merge;
- cross-tenant customer rejection;
- membership included-benefit grant and concurrent redemption protection;
- server-authoritative member pricing context;
- loyalty replay, changed-payload conflict, concurrent redemption and expiry;
- stored-value payment lineage, replay, changed-payload conflict, concurrent redemption and transfer;
- prepaid package purchase and concurrent consumption;
- deterministic promotion redemption and usage-cap rejection;
- customer portal projection and consent revocation.

A separate persisted assertion proves loyalty benefit reversal after refund/cancel and deterministic replay of that reversal.

A dedicated portal/profile assertion proves profile normalization, identity-conflict rejection and historical booking continuity after the customer changes their current contact details.

A reconciliation assertion proves the final pilot has no silent customer-value discrepancy.

### Browser acceptance

`apps/web/e2e/integrity/phase9-customer-portal.spec.ts` is part of the permanent Chromium suite and verifies:

- authenticated operator creates an anonymous customer;
- loyalty value is visible in the customer portal;
- portal route renders through the real API;
- booking-history surface exists;
- customer can update name, email and phone through the portal;
- customer can grant marketing consent;
- persisted portal projection reflects profile, consent provenance and loyalty value.

The permanent Chromium suite exposed a final pre-merge defect: dashboard cookies caused the customer capability-token profile mutation to be evaluated under dashboard session-CSRF semantics. The fix classifies the customer portal controllers with the repository's existing `@Public()` capability pattern. The same permanent Chromium test and its persisted-state assertion passed afterward on the exact merged candidate.

## CI gate

Blocking workflow: `.github/workflows/phase9-validation.yml`

It requires:

1. frozen dependency install;
2. Prisma generation and validation;
3. clean PostgreSQL migration chain;
4. Phase 9 + Growth regression tests;
5. persisted operational pilot;
6. portal profile/historical booking continuity assertion;
7. persisted refund/reversal assertion;
8. reconciliation assertion;
9. API build;
10. representative upgrade migration and assertions;
11. web typecheck;
12. web production build.

Repository-wide CI and the earlier phase regression workflows were also green on the final PR head before the guarded merge.

## Acceptance gate P9

- [x] benefits with financial value use immutable ledgers;
- [x] retryable value mutations use canonical request-hash idempotency;
- [x] same-key changed-payload conflicts are tested;
- [x] concurrent redemption cannot create negative balances;
- [x] customer merge preserves Phase 9 history and consent evidence;
- [x] membership expiry is server-authoritative;
- [x] promotion stacking, time windows and usage caps are deterministic;
- [x] stored value and packages retain canonical payment/settlement lineage;
- [x] reconciliation surfaces customer-value anomalies;
- [x] customer portal uses canonical projections, booking history, profile and consent controls;
- [x] profile changes preserve historical identity/booking evidence and reject identity conflicts;
- [x] clean migration proof exists in CI;
- [x] representative upgrade proof exists in CI;
- [x] exact final Phase 9 PR head is green across all required CI;
- [x] PR is merged with expected-head protection;
- [x] resulting `main` is verified;
- [x] exact merged revision is deployed to production;
- [x] production runtime and critical Phase 9 route are verified.

**Gate P9: ACCEPTED.**
