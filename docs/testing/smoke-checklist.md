# GoSpots Critical-Flow Smoke Checklist

**Chunk:** 00  
**Use:** Before merging a chunk that can affect shared API/database/operator behavior, and after production-sensitive migrations.  
**Rule:** A check is not marked PASS because a page renders. Verify the business state transition and the persisted/resulting state.

## Run metadata

Record for every execution:

```text
Date/time:
Commit SHA:
Environment:
API URL:
Web URL:
Database branch:
Tester:
Test shop/slug:
Owner account:
Staff account:
```

Never run destructive smoke actions against a real customer's production shop. Use an internal/test shop or preview environment unless the step is explicitly read-only.

## Automated baseline first

From repository root:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm build
```

Expected:

- API lint succeeds;
- web lint succeeds;
- API Jest suite succeeds;
- API production build succeeds;
- web production build succeeds.

Migration validation is additionally performed in CI against an empty ephemeral PostgreSQL database with `prisma migrate deploy`, `prisma migrate status` and `prisma validate`.

---

## 1. Owner login

- [ ] Open owner login surface.
- [ ] Authenticate with valid owner credentials.
- [ ] Confirm redirect into the correct tenant/shop context.
- [ ] Confirm owner-only navigation/actions expected for the test shop are available.
- [ ] Refresh the page and confirm authenticated session remains valid according to current session policy.
- [ ] Sign out and confirm protected tenant routes are no longer accessible.

**Failure evidence:** response status, route, screenshot, API error/correlation information if available.

## 2. Staff login

- [ ] Authenticate with a valid staff account.
- [ ] Confirm the user enters only the assigned shop/venue context.
- [ ] Confirm staff navigation differs from owner where permissions differ.
- [ ] Attempt one known unauthorized owner/manager action and confirm it is rejected server-side, not merely hidden in UI.
- [ ] Sign out successfully.

## 3. Tenant resolution / isolation

- [ ] Open the test tenant route directly by its current route/slug mechanism.
- [ ] Confirm the resolved shop is the expected shop.
- [ ] Call/read one shop-scoped resource through normal UI/API flow.
- [ ] Attempt to access an ID belonging to another shop with the current account where a safe test fixture exists.
- [ ] Confirm cross-shop access is rejected or returns no resource.

**Hard failure:** any cross-tenant data leak.

## 4. Public venue list

- [ ] Open `/venues` or the current public venue-list route unauthenticated.
- [ ] Confirm published venues load.
- [ ] Confirm no tenant-admin/private fields are exposed in the public payload/UI.
- [ ] Confirm search/filter/pagination behavior used by the current product still responds.

## 5. Public venue page

- [ ] Open one published venue page unauthenticated.
- [ ] Confirm venue identity/content loads.
- [ ] Confirm hours/gallery/menu/public capabilities expected for that venue render where enabled.
- [ ] Confirm an unpublished/private venue is not exposed through simple ID/slug guessing where a test fixture exists.

## 6. Resource create/update

Use a disposable test resource.

- [ ] Owner/authorized staff can create a resource.
- [ ] The resource is associated with the correct shop.
- [ ] Update a safe field such as label/name/configuration.
- [ ] Reload and confirm persistence.
- [ ] Unauthorized staff cannot perform the same mutation.
- [ ] Remove/deactivate the disposable fixture according to current product behavior.

## 7. Reservation create/update

Use a future test time and disposable guest identity.

- [ ] Create a reservation through the current staff/public path being protected.
- [ ] Confirm resource/time/shop association.
- [ ] Update the reservation through the supported transition.
- [ ] Reload and confirm the updated state.
- [ ] Confirm known conflict/double-booking rule still rejects an invalid overlapping booking where applicable.
- [ ] Cancel/clean up the test reservation.

## 8. Play session start/end

Use a disposable/free test resource.

- [ ] Start a play session.
- [ ] Confirm resource/session state becomes active.
- [ ] Confirm elapsed/billing display advances according to current behavior without creating duplicate sessions.
- [ ] End/finish the session through the supported action.
- [ ] Confirm final cost/status is persisted.
- [ ] Confirm resource returns to its expected available/post-session state.

## 9. Shop order create/complete

- [ ] Create an order with at least one menu item.
- [ ] Confirm server-calculated order total matches current pricing.
- [ ] Attach to the intended GuestCheck where the current flow supports it.
- [ ] Complete the order through the current state transition.
- [ ] Confirm canceled orders do not count as revenue/current GuestCheck running total.

## 10. GuestCheck open/current settlement

Use an internal test shop only.

- [ ] Open a GuestCheck from a supported source.
- [ ] Add or attach a current supported charge.
- [ ] Repeating the same source attachment does not create a duplicate source charge.
- [ ] Create a mixed scenario containing order + play/reservation where practical.
- [ ] Confirm linked reservation/play amount is not double counted.
- [ ] Record displayed/server total before settlement.
- [ ] Settle using the existing pre-Checkout-V2 behavior.
- [ ] Confirm GuestCheck reaches the expected settled state.
- [ ] Confirm a second settlement attempt is rejected/idempotently harmless according to current behavior.

**Hard failure:** duplicate charge, duplicate settlement or duplicate ledger revenue.

## 11. Finance report

- [ ] Open the current finance report for the test shop/date range.
- [ ] Confirm the smoke transaction appears exactly once where expected.
- [ ] Confirm canceled/excluded operations are not recognized as revenue contrary to current policy.
- [ ] Compare the relevant GuestCheck/source total with finance/ledger output.
- [ ] Confirm no other shop's data appears.

## 12. Audit

- [ ] Perform one auditable staff/owner mutation.
- [ ] Open the current audit surface/API.
- [ ] Confirm actor, shop, action/target and time are attributable.
- [ ] Confirm unauthorized users cannot read audit data they do not have permission to view.

## 13. Review/chat where enabled

Only run capabilities enabled for the selected shop.

- [ ] Public/guest review flow loads where enabled.
- [ ] Review submission/current moderation behavior still works.
- [ ] Chat/guest conversation flow loads where enabled.
- [ ] Disabled capabilities remain disabled and do not fail the whole tenant surface.

Mark `N/A` with reason when the test shop does not have the capability.

## 14. Subscription / entitlements / trial access

Use test subscriptions/shops only.

- [ ] A currently entitled feature/action remains accessible.
- [ ] A known non-entitled feature/action is rejected server-side or routed to the existing upgrade/trial behavior.
- [ ] Staff cannot bypass entitlement by calling the endpoint directly.
- [ ] Trial access guard behavior remains consistent with the shop's current trial state.
- [ ] A permission grant does not by itself bypass a missing commercial entitlement where both are required.

## 15. Health and operational sanity

- [ ] API health endpoint reports healthy in the target environment.
- [ ] No repeating server error appears during the smoke flow.
- [ ] No new Prisma migration is pending unexpectedly.
- [ ] Browser console has no new critical error on the main tested operator path.
- [ ] Logs do not show obvious cross-shop or duplicate-write anomalies.

---

# Chunk 00 minimum regression scenario

For every later money/checkout chunk, run at least this scenario in addition to the automated suite:

1. Create/open one test GuestCheck.
2. Add one normal ShopOrder.
3. Add one walk-in PlaySession.
4. Add one reservation-billed play scenario if the test fixture supports it.
5. Confirm linked play is excluded from duplicate billing.
6. Confirm expected running total before settlement.
7. Settle once through the active implementation path.
8. Confirm GuestCheck/source state.
9. Confirm finance/ledger recognizes the amount exactly once.
10. Retry/reload the relevant write path and confirm no duplicate revenue.

## Result record

```text
Automated lint: PASS / FAIL
Automated tests: PASS / FAIL
API build: PASS / FAIL
Web build: PASS / FAIL
Migration dry-run: PASS / FAIL
Owner login: PASS / FAIL / N/A
Staff login: PASS / FAIL / N/A
Tenant isolation: PASS / FAIL
Public venue list/page: PASS / FAIL
Resource flow: PASS / FAIL
Reservation flow: PASS / FAIL
Play session flow: PASS / FAIL
Order flow: PASS / FAIL
GuestCheck/settlement: PASS / FAIL
Finance reconciliation: PASS / FAIL
Audit: PASS / FAIL
Review/chat: PASS / FAIL / N/A
Entitlements: PASS / FAIL
Blocking defects:
Evidence/links:
```

Any tenant leak, duplicate money, repeatable authorization bypass, destructive migration surprise, or unreconciled finance mismatch is an automatic **FAIL** and blocks the dependent chunk.
