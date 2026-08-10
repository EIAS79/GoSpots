# Chunk 05 — Cash Drawer and Shift Reconciliation

Status: **COMPLETE**

Depends on: Chunk 04 payment/allocation settlement.

## Scope delivered

Chunk 05 turns the existing `CASH` checkout tender into a controlled physical-cash workflow while keeping settlement/revenue accounting separate from drawer reconciliation.

### Data model

Expand-only migration:

`apps/api/prisma/migrations/20260810095000_chunk05_cash_drawer_shift_reconciliation/migration.sql`

Added:

- `CashDrawer`
- `CashSession`
- `CashMovement`
- `CashCount`
- `ShiftCloseApproval`

Added enums:

- `CashSessionStatus`: `OPEN`, `CLOSED`
- `CashMovementType`: `CASH_SALE`, `PAY_IN`, `PAY_OUT`, `CASH_REFUND`, `SAFE_DROP`
- `ShiftCloseApprovalStatus`: `PENDING`, `APPROVED`

Added Shop policy:

- `cashSessionRequired` — default `true`
- `cashBlindCountEnabled` — default `true`
- `cashVarianceApprovalThreshold Decimal(19,4)` — default `0`

All new cash-domain tables are Shop-scoped, use foreign keys, and have PostgreSQL RLS enabled/forced with the existing `app_tenant_rls_ok("shopId")` policy helper.

Operational uniqueness prevents two simultaneous open sessions for one physical drawer and two simultaneous open sessions for the same cashier in one Shop.

`CashMovement.paymentId` links one automatic `CASH_SALE` movement to the successful Checkout `Payment` that caused it.

## Reconciliation invariant

The server is authoritative for expected physical cash:

```text
opening float
+ CASH_SALE
+ PAY_IN
- CASH_REFUND
- PAY_OUT
- SAFE_DROP
= expected drawer cash
```

All values use Prisma `Decimal` at the venue-money 4-decimal convention. Browser values are not used as reconciliation authority.

## Checkout integration

Chunk 04's settlement/payment records remain the payment source of truth.

For a `CASH` checkout payment:

1. Checkout locks and validates the settlement as before.
2. If `cash_sessions` is enabled and Shop policy requires a cash session, the actor must have an OPEN session in the settlement currency.
3. Checkout creates the `Payment`.
4. The same database transaction creates one linked `CashMovement(type=CASH_SALE)`.
5. Payment allocations and settlement state changes continue normally.

If the session requirement is active and no matching session exists, Checkout rejects CASH with:

> Open a cash session in My Shift before taking cash.

`MANUAL_CARD` and `OTHER` are unchanged and do not require a cash session.

This chunk does **not** create or duplicate legacy finance `Transaction` or `LedgerEntry` revenue rows.

## Cash operations

API module: `apps/api/src/modules/cash/`

Routes:

- `GET /cash/my-shift`
- `GET /cash/policy`
- `PATCH /cash/policy`
- `POST /cash/sessions`
- `POST /cash/sessions/:id/movements`
- `POST /cash/sessions/:id/counts`
- `POST /cash/sessions/:id/approve-variance`
- `POST /cash/sessions/:id/close`
- `GET /cash/reports`

State-changing session/movement/count/approval/close requests use the existing durable Shop-scoped idempotency framework.

Manual `CASH_SALE` creation is prohibited; only Checkout creates it.

Every manual cash movement requires:

- movement type;
- positive amount;
- reason category;
- actor;
- optional note.

Closed sessions reject further mutations.

## Blind count and close

When `cashBlindCountEnabled` is active, an ordinary cashier does not receive expected drawer cash before count submission unless they have `cash.view_expected`.

Count submission atomically captures:

- counted cash;
- expected cash at submission;
- variance;
- whether blind-count policy applied.

If cash moves after the count, close is rejected and the cashier must recount.

If:

```text
abs(variance) > cashVarianceApprovalThreshold
```

then a `ShiftCloseApproval` is required before close. Closing freezes expected cash, counted cash, variance, close actor and close time on the session.

## Permissions

Added:

- `cash.open`
- `cash.movement`
- `cash.close`
- `cash.view_expected`
- `cash.approve_variance`

Owners retain full access through the existing owner permission convention.

## UI

### My Shift

Route:

`/dashboard/:venuePath/my-shift`

Cashier workflow includes:

- opening float;
- open session state;
- automatic cash-sale activity;
- pay-in;
- pay-out;
- cash refund;
- safe drop;
- blind physical count;
- post-count reconciliation;
- variance approval state;
- shift close.

### Shift Reports

Route:

`/dashboard/:venuePath/shift-reports`

Manager/owner view includes:

- session history;
- opening float;
- sales/pay-ins/refunds/pay-outs/safe drops;
- expected cash;
- counted cash;
- variance;
- pending/approved variance state;
- variance approval action;
- Shop cash policy controls.

## Feature rollout

`cash_sessions` becomes a product-default feature after Chunk 05. An explicit per-Shop `ShopFeatureFlag(enabled=false)` remains an emergency kill switch.

This is independent of subscription entitlements.

## Automated acceptance coverage

Cash tests cover:

- exact reconciliation arithmetic;
- no cash payment without an open session when required;
- Shop policy allowing CASH without a session when explicitly configured;
- cash-session currency mismatch;
- exactly one payment-linked automatic cash-sale movement;
- closed-session immutability;
- blind expected-cash hiding;
- variance threshold creating approval;
- above-threshold close blocked without approval;
- stale count rejected after cash movement;
- approved material variance successfully closing and freezing reconciliation values.

Checkout regression covers partial `CASH` + `MANUAL_CARD` to zero remainder while confirming only CASH creates a cash movement and no legacy revenue row is duplicated.

Feature-flag regression covers per-Shop isolation and `cash_sessions` product-default behavior.

Normal CI remains responsible for:

- API Jest suite and build;
- Checkout/web tests, TypeScript and production build;
- empty PostgreSQL `prisma migrate deploy`, migration status and Prisma validation.

## Gate 05

Cashier Core milestone acceptance:

- [x] checkout
- [x] split
- [x] cash tender
- [x] partial tender
- [x] cash session
- [x] shift close
- [x] variance
- [x] reporting

## Finance safety

Chunk 05 adds a **physical cash subledger** only.

It does not reinterpret settlement totals, create external terminal payments, or post duplicate revenue. Checkout `Payment`/`PaymentAllocation` remains the settlement source of truth; `CashMovement` answers how much physical cash should be present in a drawer.

## Rollback / compatibility

The migration is expand-only. Existing non-cash payment data is unchanged.

Application rollback strategy:

1. Disable `cash_sessions` for affected Shops with `ShopFeatureFlag(enabled=false)` if emergency compatibility is needed.
2. Roll application code back while leaving new cash tables/columns in place.
3. Do not drop cash tables as the first rollback action; preserving movement/count/approval evidence is safer and keeps forward compatibility.

A destructive schema rollback should only be considered after confirming no production cash-session data must be retained.

## Next dependency

Chunk 06 may build provider-neutral device/payment hardening on top of the completed settlement and cashier-core layers. It should not move physical cash reconciliation back into Checkout or the legacy finance revenue tables.
