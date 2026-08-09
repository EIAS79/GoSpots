# GoSpots critical-flow smoke checklist

Use this checklist before merging architecture-sensitive work and after production-like deployments. It protects current behavior while new checkout/payment/offline domains are introduced.

## Preconditions

- Use a non-production test/pilot shop unless the step is explicitly read-only.
- Have one owner account and one staff account with known permissions.
- Confirm API `/api/v1/ready` is healthy.
- Confirm the web app can reach the intended API.
- Record the commit SHA and environment used for the smoke run.

## A. Authentication and tenant isolation

- [ ] Owner can log in and reach the correct venue dashboard.
- [ ] Staff can log in and reaches only the venue(s) granted by membership.
- [ ] Invalid/expired authentication is rejected cleanly.
- [ ] A user from Shop A cannot read or mutate Shop B by changing an ID/slug/request payload.
- [ ] Venue context survives normal page navigation and API calls.

## B. Public discovery

- [ ] Public venue list loads.
- [ ] A published venue page loads by slug.
- [ ] An unpublished/non-advertised venue follows current visibility rules.
- [ ] Public page does not expose dashboard/private staff data.

## C. Resources

- [ ] Owner/authorized staff can create a resource.
- [ ] Resource can be updated.
- [ ] Resource status/availability appears consistently in the operator UI.
- [ ] Unauthorized staff cannot perform restricted resource mutations.

## D. Reservations

- [ ] Create a reservation for a valid resource/time.
- [ ] Update reservation timing/details.
- [ ] Status transition used by the current product still works.
- [ ] Reservation appears in the relevant dashboard/operator view.
- [ ] Existing billed/currency fields remain readable.
- [ ] Cross-shop reservation access is rejected.

## E. Play sessions

- [ ] Start a walk-in play session.
- [ ] Active session appears in the correct live/billing view.
- [ ] End/complete the session using the current flow.
- [ ] Amount/duration displayed by the current UI agrees with server output.
- [ ] In-progress / awaiting-payment / paid billing tabs show consistent item counts.
- [ ] A reservation-linked play session still works.

## F. Shop orders

- [ ] Create a pending order.
- [ ] Add at least two order lines.
- [ ] Complete the order using the current flow.
- [ ] Total/currency and line snapshots remain correct.
- [ ] Canceled/archived behavior follows the current product rules.

## G. GuestCheck

- [ ] Open a GuestCheck.
- [ ] Attach or create at least two source types where supported (for example play + order).
- [ ] GuestCheck details show its current child records.
- [ ] Settle using the current pre-Checkout-V2 behavior.
- [ ] Void flow works where currently allowed.
- [ ] Shop A cannot access Shop B GuestCheck.

Until Chunk 02 is enabled for a pilot shop, this section protects the legacy GuestCheck behavior.

## H. Finance and ledger

- [ ] Finance overview/report loads for the selected period.
- [ ] A known completed order/session/reservation is represented once, not duplicated.
- [ ] Currency formatting matches the shop currency/current policy.
- [ ] Play-billing totals equal the rendered classified rows for the selected tab.
- [ ] Audit/ledger-linked references used by current reports still resolve.

## I. Audit and privileged actions

- [ ] Perform one auditable owner/staff mutation.
- [ ] Audit entry is created with the expected actor/shop/action context.
- [ ] A restricted action is blocked for a role without permission.
- [ ] Staff approval behavior still works for actions that require it.

## J. Subscription / entitlements

- [ ] Active/trial shop can access features currently included in its pack.
- [ ] A feature not included by the current entitlement rules remains inaccessible/hidden as designed.
- [ ] Trial/access guard does not block valid public endpoints.
- [ ] SaaS billing status pages/endpoints remain separate from venue guest transactions.

## K. Reviews / guest communication (where enabled)

- [ ] Venue review flow loads according to `reviewsMode`.
- [ ] Guest chat/contact path used by the product still creates/loads messages.
- [ ] Disabled review/chat modes do not expose forbidden functionality.

## L. Build and migration regression

Run from repository root:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
```

Expected:

- [ ] install succeeds with the pnpm lockfile;
- [ ] lint exits 0 and does not rewrite files;
- [ ] API Jest suite exits 0;
- [ ] API build exits 0;
- [ ] web build exits 0.

For migration-changing PRs also run against a disposable PostgreSQL database:

```bash
pnpm --filter @gospots/api exec prisma generate
pnpm --filter @gospots/api exec prisma migrate deploy
pnpm --filter @gospots/api exec prisma migrate status
pnpm --filter @gospots/api exec prisma validate
```

- [ ] empty-database deploy succeeds;
- [ ] no pending migration remains;
- [ ] Prisma schema validates.

## Smoke result record

Record in the PR or deployment note:

```text
Commit:
Environment:
Shop:
Tester:
Date/time:
Automated gate: PASS / FAIL
Manual smoke: PASS / FAIL / PARTIAL
Failures/notes:
```

A failed critical-flow item blocks the dependent chunk unless the failure is proven to be pre-existing and documented as baseline debt with an explicit owner/follow-up.
