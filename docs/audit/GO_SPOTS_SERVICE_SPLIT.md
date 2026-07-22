# Oversized services — capability split

**Date:** 2026-07-22  
**Status:** Bible item **#11 / §14 DONE** (ship bar) — Phases 0–9 complete. Finance: all domain services extracted; `FinanceService` thin facade (~223 lines). Auth: `AuthSessionService`, `AuthRefreshService`, `AuthLogoutService`, `AuthPasswordService` (owner + staff), `AuthVenueService`, `AuthMfaService` extracted; `AuthService` facade delegates — **by design** login/register/activate/me/`issueTokens` remain (~1 170 lines). Reservations: `ReservationsPublicService`, `ReservationsScheduleService`, `ReservationsStaffService` extracted; `ReservationsService` facade shell (~109 lines). **Residual (non-blockers):** credential/onboarding entry stays on `AuthService`; `ReservationRemindersService` cron tick may remain outside facade; optional future auth slices documented below but out of §14 scope.  
**Related:** Deep audit §2.11; `GO_SPOTS_FIX_PLAN.md` Phase F → G; hot files on [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md); [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) (finance poster seam); [`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md) (settle-root will touch finance + reservations again).

---

## 1. Why split

Three Nest `@Injectable()` services were **hot files** (coordination board locked them to one lane at a time) and exceeded comfortable review size before §14 split:

| File | Lines (2026-07-22, post-split) | Public methods (approx.) | Mixes |
|------|-------------------------------:|-------------------------:|-------|
| `finance.service.ts` | ~223 (**facade**) | 26 (delegates) | Thin DI entry — capabilities live in sub-services below |
| `auth.service.ts` | ~1 170 (**facade + credential entry**) | 18 + 4 private | **Delegates** session/refresh/logout/password/venue/MFA; **still owns** register/onboard, login (+ MFA challenge JWT), staff activate, `/me`, shared `issueTokens` |
| `reservations.service.ts` | ~109 (**facade shell**) | 9 (delegates) | Staff CRUD, schedule, public guest book/status/cancel — all delegate to Public + Schedule + Staff sub-services |

**Impact before split (resolved for extracted capabilities):** harder reviews, weak unit-test seams, high regression risk when parallel agents touched unrelated capabilities in the same file.

**Goal of split:** same HTTP routes and behavior; smaller modules with **one primary capability each**. Extraction is a **move-only refactor** guarded by characterization tests — not a feature wave.

---

## 2. Extraction pattern (Nest)

**Shipped on disk** (2026-07-22):

```
finance/
  finance.service.ts            ← thin facade (~223 lines)
  finance-transaction.service.ts
  shop-order.service.ts
  play-billing.service.ts
  play-session.service.ts
  finance-reports.service.ts    ← thin; delegates to finance-analytics.util
  shop-loss.service.ts

auth/
  auth.service.ts               ← facade + credential/onboarding entry (~1 170 lines)
  auth-session.service.ts
  auth-refresh.service.ts
  auth-logout.service.ts
  auth-password.service.ts      ← owner + staff forgot-password
  auth-venue.service.ts
  auth-mfa.service.ts
  auth.types.ts                 ← JwtAccessPayload (break circular imports)

reservations/
  reservations.service.ts       ← thin facade (~109 lines)
  reservations-staff.service.ts
  reservations-schedule.service.ts
  reservations-public.service.ts
  reservation-reminders.service.ts  ← cron tick; may remain outside facade
```

**Optional future slices (out of §14 scope):** `AuthRegistrationService`, `AuthCredentialsService`, `AuthStaffInviteService` — login/register/activate/me/`issueTokens` stay on `AuthService` by design.

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
| **2** | Finance transactions + shop orders | Medium | Stock side-effects pinned | **DONE** — transactions (`SPLIT11-finance-tx`) + shop-orders (`SPLIT11-shop-orders`) |
| **3** | Finance play session + play billing | Medium | Pay claim tests (Lane A) | **DONE** — `PlaySessionService` + `PlayBillingService` + facade (`SPLIT11-play-billing`) |
| **4** | Auth password + staff invite + sessions | Medium | Existing auth specs | **DONE** — `AuthPasswordService` (owner + staff), `AuthSessionService`, `AuthLogoutService` (`SPLIT14-auth-*`) |
| **5** | Auth registration + venue onboarding + login | Medium | New register/lockout tests | **Out of §14 scope (by design)** — login/register/activate/me/`issueTokens` remain on `AuthService` facade |
| **6** | Auth venue access + profile | Low | — | **DONE** — `AuthVenueService` + `AuthMfaService` (`SPLIT14-auth-venue`, `SPLIT14-auth-mfa`) |
| **7** | Reservations public guest extract | Medium | Public book specs | **DONE** (`SPLIT14-reservations-public` + status) |
| **8** | Reservations schedule extract | High | Schedule golden fixtures | **DONE** (`SPLIT14-reservations-schedule`) |
| **9** | Reservations staff CRUD extract | Medium | Staff CRUD tests | **DONE** (`SPLIT14-reservations-staff`) |

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

## 9. Ship decision (§14 DONE — ship bar)

| Deliverable | Status |
|-------------|--------|
| Capability boundaries documented | **This doc** |
| Phase 0 `auth.types.ts` | **DONE** — `JwtAccessPayload` + re-export from `auth.service` |
| Phase 1 reports + losses extract | **DONE** — `FinanceReportsService` / `ShopLossService` + facade |
| Phase 2 finance-transactions extract | **DONE** (`SPLIT11-finance-tx`) — `FinanceTransactionService` (list/create SALE/REFUND + stock); facade delegates |
| Phase 2 shop-orders extract | **DONE** (`SPLIT11-shop-orders`) — `ShopOrderService` + facade; char **10** PASS |
| Phase 3 play-session extract | **DONE** (`SPLIT11-play-billing`) — `PlaySessionService` + facade; char **6** PASS |
| Phase 3 play-billing extract | **DONE** (`SPLIT11-play-billing`) — `PlayBillingService` + facade; char **6** PASS |
| Characterization (reports + losses + transactions) | **DONE** — `finance.reports-losses.characterization.spec.ts` + transactions characterization **3** |
| Controller / route changes | **None** |
| `FinanceService` facade | **DONE** — ~223 lines; delegates to 6 sub-services |
| Auth session/refresh/logout/password/venue/MFA slices | **DONE** (`SPLIT14-auth-*`) — facade delegates; login MFA challenge JWT stays on `AuthService.login` |
| Reservations public/schedule/staff slices | **DONE** (`SPLIT14-reservations-*`) — facade shell ~109 lines |
| Phases 5 optional auth credential/onboarding extract | **Out of scope (by design)** — register/login/activate/me/`issueTokens` remain on `AuthService` |
| Reminders cron | **May remain** on `ReservationRemindersService` outside reservations facade — not a §14 blocker |

**Verify:** `jest src/modules/finance` → **9** suites / **55** PASS; `jest src/modules/auth` → **13** suites / **74+** PASS; `jest src/modules/reservations` → schedule + staff + public characterization PASS; `nest build` PASS.

**Honest residual:** §14 ship bar met; further auth monolith shrink (registration/login/activate extract) is optional future work, not required for bible exit.

---

*Board: [`AGENT_COORDINATION.md`](./AGENT_COORDINATION.md) · Status: [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) #11 · Finished log: [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md)*
