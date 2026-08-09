# Chunk 03 Completion — Checkout V2 Operator UI

## Status

**PASS — implementation completed and implementation CI is green.**

- Branch: `agent/gospots-00-repository-baseline`
- Draft PR: #10
- Main branch at implementation verification: **not merged / untouched**
- Implementation commit: `1753976477dd4ac92390fdb707dfba2ce6b1a494`
- Implementation verification: GitHub Actions CI #109 (`31338490124`)
- Production rollout: `checkout_v2` remains controlled by the per-Shop backend feature flag.

## Scope delivered

### One shared Checkout V2 surface

Added a single operator workspace at:

- `/dashboard/[venuePath]/checkout`

The workspace lists open GuestChecks and renders the selected check through one reusable Checkout V2 component hierarchy:

- `checkout-workspace.tsx`
- `checkout-drawer.tsx`
- `charge-groups.tsx`
- `checkout-totals.tsx`
- `tender-buttons.tsx`
- `settlement-status.tsx`
- `checkout-presenter.ts`

There is no separate checkout implementation for gaming, dining, or reservation modules. Mixed GuestChecks flow through the same Chunk 02 preview API and the same UI.

### Entry point

The existing Guest Tabs page now exposes **Open Checkout V2** for owners and staff with `checkout.read`.

The legacy Guest Tabs UI and its existing Settle behavior remain unchanged. Chunk 03 does not replace or remove the legacy path while rollout is feature-flagged.

### Authoritative server preview

Added `apps/web/src/lib/checkout-client.ts` consuming:

- `POST /checkout/checks/:checkId/preview`

The UI renders server-returned strings for:

- subtotal;
- adjustments;
- tax;
- deposits;
- total;
- amount due;
- charge lines and discounts.

Client code performs no summation or settlement arithmetic. `Intl.NumberFormat` is used only for display formatting of already-authoritative server values.

The amount due is visually prominent and explicitly labeled as a server-authoritative live preview.

### Charge grouping

Server charge lines are grouped only by their source type:

- `PLAY_SESSION` → **Play**
- `SHOP_ORDER` → **Food & Drink**
- `RESERVATION` → **Booking**
- future/unknown source type → **Event / Other**

This supports gaming-only, dining-only, booking-only, and mixed checks without introducing module-specific money logic.

### Tender controls without payment side effects

The Checkout V2 surface contains the required primary actions:

- Cash
- Card
- Split
- More

In Chunk 03 these are intentionally payment placeholders. For users with `checkout.write`, selecting a tender first refreshes the authoritative server preview and then displays an explicit notice that no money was charged, allocated, or posted.

Chunk 03 does **not** call the settlement-create endpoint from these tender controls and does not create:

- provider payments;
- tender allocations;
- payment attempts;
- `Transaction` revenue entries;
- `LedgerEntry` revenue entries.

Real payment allocation remains a Chunk 04+ responsibility.

### Concurrency behavior

Initial Checkout preview sends the GuestCheck version returned by the GuestCheck API.

If the backend returns `VERSION_CONFLICT`, the UI displays the execution-plan message:

> This check changed on another device. Reloading latest total.

It then automatically requests the latest authoritative server preview without the stale expected version.

Manual refresh and tender-placeholder actions also refresh the authoritative server preview.

### Offline / backend unavailable behavior

When the browser is offline or the API client reports a network failure, the checkout surface displays:

> Checkout requires connection until Offline Checkout is enabled.

No local/offline financial fallback is fabricated in Chunk 03.

### Feature flag behavior

The frontend does not duplicate the Shop feature-flag decision. The Chunk 02 API remains the authoritative `checkout_v2` gate.

If the selected Shop is not enabled, the Checkout V2 surface reports that Checkout V2 is not enabled for the venue while legacy Guest Tabs behavior remains available.

### Role-aware behavior

Checkout access uses the existing membership model:

- OWNER: read + write;
- staff/manager with `checkout.read`: can view checkout;
- staff/manager with `checkout.write`: tender-placeholder controls are enabled;
- staff without `checkout.read`: explicit access-required state;
- read-only users see disabled tender controls and a clear permission explanation.

No finance-admin controls are exposed in Checkout V2.

### Loading, empty, error and large-check states

Implemented explicit states for:

- loading authoritative total;
- loading open GuestChecks;
- no open GuestChecks;
- selected check with no charges;
- version conflict;
- offline/network unavailable;
- feature disabled;
- unauthorized staff;
- generic API error;
- large item counts using a bounded scrolling charge area.

## Existing GuestCheck client compatibility

Updated the frontend `GuestCheck` type to include Chunk 02 fields already returned by the API:

- `version`
- `currentSettlementId`

No existing GuestCheck client method was removed or changed semantically.

## Automated tests added

`checkout-presenter.test.tsx` covers the Chunk 03 execution-plan cases:

- mixed charge rendering;
- owner access;
- operator/staff access;
- unauthorized staff;
- state conflict classification and exact reload message;
- offline classification and exact connection-required message;
- loading state;
- no-charge state;
- large item count (120 lines);
- amount due rendered directly from the server preview;
- read-only tender controls.

The web package exposes:

```text
pnpm --filter @gospots/web run test:checkout
```

The root blocking `pnpm verify` gate now includes the Checkout UI test suite.

## CI integration

The web CI job is now:

**Web checkout test · typecheck · build**

and runs, in order:

1. Checkout UI tests;
2. TypeScript check;
3. Next.js production build.

### Implementation CI #109

All blocking jobs passed on `1753976477dd4ac92390fdb707dfba2ce6b1a494`:

- Checkout UI tests: **PASS**
- Web TypeScript check: **PASS**
- Web production build: **PASS**
- API Jest suite: **PASS**
- API production build: **PASS**
- Fresh PostgreSQL `prisma migrate deploy`: **PASS**
- `prisma migrate status`: **PASS**
- `prisma validate`: **PASS**

Strict lint remains the documented Chunk 00 advisory debt; it is non-destructive and does not block the baseline gate.

## Chunk 03 acceptance gate

- [x] One checkout surface handles GuestChecks containing play, orders, bookings, or mixed sources.
- [x] No module-specific duplicate checkout UI introduced.
- [x] Charge groups are Play / Food & Drink / Booking / Event-Other.
- [x] Amount due is prominent and comes from the server preview.
- [x] Client performs no authoritative money summation.
- [x] Cash / Card / Split / More controls exist.
- [x] Tender controls do not charge or post money in Chunk 03.
- [x] Owner role covered.
- [x] Checkout operator role covered.
- [x] Unauthorized staff covered.
- [x] State conflict auto-reloads the latest server preview.
- [x] Offline checkout is explicitly blocked with the required message.
- [x] Loading state covered.
- [x] No-charge state covered.
- [x] Large item count covered.
- [x] Legacy Guest Tabs settlement remains intact.
- [x] API/web/migration implementation regression gate passed.

## Combined 00–03 merge gate

This completion record creates a new current head. The final combined 00–03 CI must pass on that current head before PR #10 is merged into `main`.
