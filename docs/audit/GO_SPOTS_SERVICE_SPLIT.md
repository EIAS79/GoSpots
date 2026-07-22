# Oversized services — capability split

**Date:** 2026-07-21  
**Status:** Bible item **#11 DONE** for **Phase 0+1 ship bar** (auth types + finance reports/losses extract). Phases 2–9 residual.  
**Related:** Deep audit §2.11; `GO_SPOTS_FIX_PLAN.md` Phase F → G; hot files on [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md); [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) (finance poster seam); [`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md) (settle-root will touch finance + reservations again).

---

## 1. Why split

Three Nest `@Injectable()` services carry most dashboard + public booking + money side-effects. They are **hot files** (coordination board locks them to one lane at a time) and exceed comfortable review size:

| File | Lines (2026-07-21) | Public methods (approx.) | Mixes |
|------|-------------------:|-------------------------:|-------|
| `finance.service.ts` | ~2 370 | 26 | Quick sales, menu orders, losses, analytics, play billing, walk-in sessions, stock mutations, overlap locks |
| `auth.service.ts` | ~1 340 | 18 + 4 private | Register/onboard, multi-venue link, login lockout, password reset, staff invite, refresh family, sessions API, `/me`, venue dashboard bind |
| `reservations.service.ts` | ~1 510 | 9 + large private schedule builder | Staff CRUD, schedule (staff + public), public guest book/status/cancel, mail, guest tokens, walk-in schedule blocks |

**Impact today:** harder reviews, weak unit-test seams, high regression risk when parallel agents touch unrelated capabilities in the same file.

**Goal of split:** same HTTP routes and behavior; smaller modules with **one primary capability each**. Extraction is a **move-only refactor** guarded by characterization tests — not a feature wave.

---

## 2. Extraction pattern (Nest)

Recommended shape (matches existing module layout):

```
finance/
  finance.service.ts          ← thin facade (optional; keeps controller DI stable)
  shop-order.service.ts
  finance-transaction.service.ts
  play-billing.service.ts
  play-session.service.ts
  finance-reports.service.ts    ← thin; delegates to finance-analytics.util
  shop-loss.service.ts          ← small; may fold into transaction service

auth/
  auth.service.ts               ← thin facade OR keep as session + credentials entry
  auth-registration.service.ts
  auth-venue-onboarding.service.ts
  auth-password.service.ts
  auth-staff-invite.service.ts
  auth-session.service.ts
  auth-venue-access.service.ts
  auth.types.ts                 ← JwtAccessPayload (break circular imports)

reservations/
  reservations.service.ts       ← thin facade
  reservation-crud.service.ts
  reservation-schedule.service.ts
  reservation-public-guest.service.ts
```

**Rules:**

1. **Controllers unchanged** in wave 1 — inject facade or rename internally only.
2. **Shared helpers stay in `common/`** (money, locks, overlap, guest-token, play-billing util) — do not duplicate business rules into new services.
3. **Cross-capability calls** go facade → sub-service or sub-service → sub-service via constructor injection; avoid static imports that recreate a monolith.
4. **`JwtAccessPayload`** moves to `auth.types.ts` (many modules import the type from `auth.service.ts` today).
5. One coordination-board lane **owns one hot file at a time** — split commits are sequential per file, not parallel.

---

## 3. `finance.service.ts` — proposed capabilities

### 3.1 Capability map

| Capability | Methods (today) | Primary models | Side effects |
|------------|-----------------|----------------|--------------|
| **Quick sales (POS)** | `listTransactions`, `createTransaction` | `Transaction`, `TransactionLineItem` | Menu stock decrement on SALE; audit |
| **Reports / analytics** | `salesByItem`, `getFinanceAnalytics`, `getTopSellers` | read-only aggregates | audit on sales-by-item; uses `finance-analytics.util` |
| **Shop orders (kitchen)** | `listShopOrders`, `getShopOrder`, `createShopOrder`, `updateShopOrder`, `addShopOrderLine`, `patchShopOrderLine`, `deleteShopOrderLine`, `deleteShopOrder`, `archiveShopOrders`, `unarchiveShopOrders` | `ShopOrder`, `ShopOrderLine` | Stock on complete/cancel/line patch; `shop-order-audit.util`; notifications on handoff |
| **Losses** | `listLosses`, `createLoss`, `deleteLoss` | `ShopLoss` | Large-loss notification threshold |
| **Play billing (booked + walk-in list/pay)** | `listPlayBilling`, `markPlayBillingPaid`, `updatePlayBilling`, `cancelPlayBilling` | `Reservation` (resource-backed), `PlaySession` (walk-in rows in list) | Conditional pay claim; `billedAmount` / discount; overlaps with reservations lifecycle |
| **Play sessions (floor walk-in)** | `listPlaySessions`, `createPlaySession`, `updatePlaySession`, `markPlaySessionPaid`, `cancelPlaySession` | `PlaySession`, `Resource` | `withResourceBookingLock`, walk-in overlap assert, opening hours |

Private helpers to move with their capability: `serializeTransaction`, `shopOrderInclude`, `loadShopOrder`, `recalcShopOrderTotal`, `mapPlayBillingRow`, `mapWalkInBillingRow`, `playBillingInclude`, `playSessionInclude`, order audit record helpers tied to shop orders.

Shared private on facade or small `finance-guard.util`: `assert`, `requireFeature`, `serializeLoss`.

### 3.2 Suggested target services

| Service | Owns | Defer coupling with |
|---------|------|---------------------|
| `FinanceTransactionService` | Quick sales CRUD | Stock util; later ledger poster (#6) |
| `ShopOrderService` | Full menu ticket lifecycle + archive | Stock util; unified ticket (#10) |
| `ShopLossService` | Loss CRUD | Could merge into transaction service if &lt;150 lines after extract |
| `FinanceReportsService` | Analytics endpoints | Keep logic in `finance-analytics.util`; service is permissions + feature gate |
| `PlayBillingService` | Billing tabs, mark paid, billing edits | Reservations status; ledger post on pay |
| `PlaySessionService` | Walk-in session lifecycle | Booking locks shared with reservations |

**Order of extract (lowest coupling first):** Reports → Losses → Transactions → Shop orders → Play sessions → Play billing (billing reads both reservations and sessions).

**Do not split before ledger/unified-ticket redesign lands** if that redesign would move pay posting — but **module boundaries above still stand**; only the “mark paid” poster hook would move to a shared `FinancePostingService` later (`GO_SPOTS_LEDGER.md` phase 3+).

---

## 4. `auth.service.ts` — proposed capabilities

### 4.1 Capability map

| Capability | Methods | Notes |
|------------|---------|-------|
| **Owner registration** | `register` | Creates user, first shop, trial subscription, membership, welcome notifications |
| **Venue onboarding** | `createVenueForOwner`, `previewLinkVenuesByEmail`, `linkVenuesByEmail` | Multi-venue entitlement asserts; pack/addOn sync |
| **Credentials / login** | `login`, `verifyOwnerCredentials` (private) | Failed-login lockout (`MAX_FAILED`, `LOCK_MINUTES`); staff single-session wipe |
| **Password reset** | `requestOwnerPasswordReset`, `resetOwnerPassword`, `requestStaffPasswordReset` | Hash + TTL tokens; mail |
| **Staff invite activate** | `activateStaffInvite` | Seat capacity; permission row sync |
| **Session family / tokens** | `refresh`, `logout`, `issueTokens` (private), `revokeSessionFamily` (private), `resolveCurrentSessionFamilyId` (private) | Refresh rotation; UA persist; **hot** for future 2FA (`GO_SPOTS_2FA.md`) |
| **Session management API** | `listAuthSessions`, `revokeAuthSession`, `revokeOtherAuthSessions` | Already partially tested (`auth.service.sessions.spec.ts`) |
| **Profile** | `me`, `resolveDashboardPathForUser` | Membership + subscription shape for web shell |
| **Venue dashboard access** | `verifyVenueDashboard`, `bindVenueSession` | Slug+key path; re-issue scoped JWT |

### 4.2 Suggested target services

| Service | Methods | Extract priority |
|---------|---------|------------------|
| `AuthSessionService` | refresh, logout, issueTokens, revoke*, list/revoke sessions | **After** characterization tests for rotation + family (existing specs are a start) |
| `AuthPasswordService` | owner + staff password reset | Existing `auth.service.spec.ts` covers owner reset |
| `AuthStaffInviteService` | `activateStaffInvite` | `auth.service.activate.spec.ts` |
| `AuthRegistrationService` | `register` | Needs new golden tests |
| `AuthVenueOnboardingService` | create venue + link venues | Entitlement + pack sync |
| `AuthCredentialsService` | `login` + lockout | Needs lockout golden tests |
| `AuthVenueAccessService` | verify + bind dashboard | Related to #19 |
| `AuthProfileService` | `me`, `resolveDashboardPathForUser` | Low risk |

**2FA note:** When implemented, MFA enroll/verify branches should live in `AuthCredentialsService` + `AuthSessionService`, not expand `auth.service.ts` again (`GO_SPOTS_2FA.md`).

---

## 5. `reservations.service.ts` — proposed capabilities

### 5.1 Capability map

| Capability | Methods | Notes |
|------------|---------|-------|
| **Staff reservation CRUD** | `list`, `create`, `update`, `delete` | Permissions assert; booking lock on create/update; overlap + opening hours |
| **Schedule (staff + public)** | `getSchedule`, `getPublicSchedule`, `buildScheduleForShop` (private, ~280 lines) | Timezone day bounds; gaming vs dining kind gate; merges reservations + walk-in blocks + floor status |
| **Public guest flows** | `createPublicGamingBooking`, `getPublicGamingStatus`, `cancelPublicGamingBooking` | Guest token issue/hash; mail; public controller routes dining + gaming |
| **Shared notification/mail** | `sendGuestReservationMail`, `logBooking`, `maybeNotifyStaff`, `formatWindow`, `guestStatusPath` | Move with public guest + CRUD respectively |

### 5.2 Suggested target services

| Service | Owns | Extract priority |
|---------|------|------------------|
| `ReservationScheduleService` | Schedule builder + horizon asserts | Extract **after** schedule golden fixtures (largest private method) |
| `ReservationPublicGuestService` | Public book/status/cancel | Existing `reservations.service.spec.ts` focuses here — extend before move |
| `ReservationCrudService` | Staff list/create/update/delete | Add staff-path characterization tests (currently thin) |

**Boundary with finance:** Reservation **billing** (mark paid, amounts) stays in finance play-billing; reservations service must not grow billing methods during split.

**Boundary with public controller:** Facade keeps method names so `public.controller.ts` requires no route changes in wave 1.

---

## 6. Characterization-test gate (mandatory before any move)

Per `GO_SPOTS_FIX_PLAN.md` Phase F → G: **no extract until behavior is pinned by tests**. “Characterization” = assert **current** outputs (including error types/messages and audit/notification side-effect calls), not idealized behavior.

### 6.1 Gate checklist — finance

| Bucket | Existing specs | Add before extract |
|--------|----------------|-------------------|
| Quick sale + stock | partial via tenant spec | Golden: SALE create → stock adjust called; REFUND path; permission denied |
| Shop order lifecycle | — | Golden: create → add line → complete (stock) → cancel restore; archive/unarchive |
| Losses | — | create + large-loss notification threshold |
| Analytics | `finance-analytics.util.spec.ts` | Service-level: feature gate + `buildFinanceAnalytics` delegation |
| Play billing pay | `finance-play-billing.spec.ts` | Extend: update/cancel billing; list tab filters |
| Play session | `finance-play-session.spec.ts` | Extend: create + overlap rejection; mark paid claim |

**Exit:** Jest files named `finance.*.characterization.spec.ts` (or extend existing) with **≥1 happy + ≥1 denial** per public method group above; CI green.

### 6.2 Gate checklist — auth

| Bucket | Existing specs | Add before extract |
|--------|----------------|-------------------|
| Password reset | `auth.service.spec.ts` | Staff forgot path |
| Staff activate | `auth.service.activate.spec.ts` | — |
| Refresh / family | `auth.service.refresh.spec.ts` | Reuse → family revoke |
| Sessions API | `auth.service.sessions.spec.ts` | — |
| Login lockout | — | Golden: MAX_FAILED → lockedUntil |
| Register / create venue | — | Snapshot shop+membership create args (mock prisma) |
| bindVenueSession | — | Wrong key; membership required |

### 6.3 Gate checklist — reservations

| Bucket | Existing specs | Add before extract |
|--------|----------------|-------------------|
| Public gaming book | `reservations.service.spec.ts` | Dining parity; horizon rejection; capacity |
| Public status/cancel | partial in same file | Token revoked; cancel rules |
| Staff create/update | — | Lock invoked; overlap error surfaced |
| Schedule | — | Fixture shop: day bounds, kind filter, walk-in block merge |

### 6.4 Process per extract commit

1. Run full gate suite — **must pass on main branch before move**.
2. Move methods + privates to new `@Injectable()`; wire in module; **no logic edits**.
3. Re-run gate + `tsc` + `nest build` + full Jest.
4. Delete only dead code from monolith when facade delegates 100%.
5. One capability per PR; update coordination board hot-file lock.

---

## 7. Phased plan (post-Friday)

| Phase | Scope | Risk | Depends on | Status |
|-------|--------|------|------------|--------|
| **0** | `auth.types.ts` + re-export `JwtAccessPayload` | Low | — | **DONE** (SPLIT11) |
| **1** | Finance reports + losses extract | Low | Finance gate rows | **DONE** (SPLIT11) |
| **2** | Finance transactions + shop orders | Medium | Stock side-effects pinned | Residual |
| **3** | Finance play session + play billing | Medium | Pay claim tests (Lane A) | Residual |
| **4** | Auth password + staff invite + sessions | Medium | Existing auth specs | Residual |
| **5** | Auth registration + venue onboarding + login | Medium | New register/lockout tests | Residual |
| **6** | Auth venue access + profile | Low | — | Residual |
| **7** | Reservations public guest extract | Medium | Public book specs | Residual |
| **8** | Reservations schedule extract | High | Schedule golden fixtures | Residual |
| **9** | Reservations staff CRUD extract | Medium | Staff CRUD tests | Residual |

**Explicitly out of scope for split wave:** ledger dual-write (`GO_SPOTS_LEDGER.md`), unified ticket settle root (`GO_SPOTS_UNIFIED_TICKET.md`), resource model merge — those may **add** methods to finance/reservations; complete split design first, then fold new posters into the smallest service (likely `PlayBillingService` + future `LedgerPostingService`).

---

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Silent behavior change during move | Characterization gate; move-only commits; no “cleanup” in same PR |
| Circular DI (finance ↔ reservations) | Keep billing in finance; reservations never imports finance |
| Parallel agents on hot files | One lane per file on coordination board |
| Type import churn | Phase 0 `auth.types.ts` |
| Test mock drift | Prefer testing through facade until sub-service stable, then duplicate one golden test per sub-service |
| Split blocked by missing e2e | Unit characterization sufficient for Phase G exit; e2e smoke still recommended (`GO_SPOTS_TEST_MATRIX.md`) |

---

## 9. Ship decision (Phase 0+1 DONE)

| Deliverable | Status |
|-------------|--------|
| Capability boundaries documented | **This doc** |
| Phase 0 `auth.types.ts` | **DONE** — `JwtAccessPayload` + re-export from `auth.service` |
| Phase 1 reports + losses extract | **DONE** — `FinanceReportsService` / `ShopLossService` + facade |
| Characterization (reports + losses) | **DONE** — `finance.reports-losses.characterization.spec.ts` |
| Controller / route changes | **None** |
| Phases 2–9 | **Residual** |

**Verify:** jest characterization + finance tenant/play suites **22** PASS; `nest build` PASS.

---

*Board: [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) · Status: [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) #11 · Finished log: [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md)*
