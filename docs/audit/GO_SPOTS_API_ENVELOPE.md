# Locora — API error envelope (§36)

**Date:** 2026-07-22 (residual docs lane **API36-openapi-docs**; throw-site lanes **API36-domain-booking-codes**, **API36-domain-captcha-codes**, **API36-domain-csrf-codes**, **API36-domain-guest-token**, **API36-domain-jwt-session**, **API36-domain-mfa-codes**, **API36-domain-permission-codes**, **API36-domain-session-revoked**, **API36-domain-venue-reviews**)  
**Status:** **Bible §36 PARTIAL** — unified JSON error envelope + stable default codes = **DONE** ship bar. OpenAPI error schema polish = **DONE** (Phases 0–2). Domain-specific caller `code`s = **PARTIAL (throw-site migration)** — **booking slice DONE** (`booking-overlap.util`, `booking-lock.util` emit `ApiDomainErrorCode`); **captcha slice DONE** (`captcha.util` emits `CAPTCHA_REQUIRED` / `CAPTCHA_FAILED`); **CSRF slice DONE** (`csrf.guard` emits `CSRF_INVALID`); **guest-token slice DONE** (`assertGuestTokenActive` emits `GUEST_TOKEN_EXPIRED` / `GUEST_TOKEN_REVOKED`); **MFA slice DONE** (`auth-mfa.service` emits `MFA_REQUIRED` / `MFA_INVALID` on verify + factor checks); **session-revoked slice DONE** (`auth-refresh.service` emits `SESSION_REVOKED` on refresh reuse / family revoke); **permission/venue slice DONE** (`roles.guard`, `finance-guard.util`, `resolve-venue-shop`, `venue-reviews.service` emit `PERMISSION_DENIED` / `VENUE_ACCESS_DENIED`); **stock slice DONE** (util helpers + `shop-order.service` / `finance-transaction.service` adoption emit `MENU_STOCK_INSUFFICIENT`); onboarding throw sites **RESIDUAL**. Web dual-read **PARTIAL (W1 + 8 call sites)** — public book + login + staff reservation dialog + staff menu orders + finance quick sale + play-billing walk-in + CSRF post-retry copy + guest status/chat token errors.  
**Audit:** P2 §36 API consistency · original prompt **§36**.

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| JSON envelope `{ code, message, details, requestId }` on all HTTP errors | **DONE** | `buildApiErrorBody` → `SentryExceptionFilter` |
| `x-request-id` echoed on error responses | **DONE** | `resolveRequestIdFromRequest` + filter `setHeader` |
| Stable default codes by HTTP status | **DONE** | `api-error.codes.ts` (`ApiErrorCode` + `errorCodeForHttpStatus`) |
| Custom exception `code` wins when present | **DONE** | `HttpException` body `{ code, message, details? }` — see `api-error.util.spec.ts` |
| 5xx message sanitization (no Prisma/SQL leak) | **DONE** | `sanitizeClientMessage` |
| Sentry 5xx-only (4xx not reported) | **DONE** | `sentry-exception.filter.ts` |
| Swagger UI (`/docs`) non-prod only | **DONE** | `main.ts` `DocumentBuilder` — **success** shapes only today |
| Shared OpenAPI `ApiErrorBody` schema on routes | **DONE (Phase 0)** | `ApiErrorBodyDto` + `extraModels` in `main.ts`; pattern routes: `/ready`, `/public/venues/:slug`, `/shop/settings` |
| Domain-specific machine codes at throw sites | **PARTIAL (throw-site migration)** | **Booking slice DONE** — `apiConflictException` + `ApiDomainErrorCode` on `booking-overlap.util` / `booking-lock.util` (5 codes). **Captcha slice DONE** — `apiForbiddenException` + `CAPTCHA_REQUIRED` / `CAPTCHA_FAILED` on `captcha.util`. **CSRF slice DONE** — `apiForbiddenException` + `CSRF_INVALID` on `csrf.guard`. **Guest-token slice DONE** — `apiUnauthorizedException` + `GUEST_TOKEN_EXPIRED` / `GUEST_TOKEN_REVOKED` on `assertGuestTokenActive`. **MFA slice DONE** — `apiUnauthorizedException` + `MFA_REQUIRED` / `MFA_INVALID` on `auth-mfa.service.ts`. ~370+ message-only throws remain in other modules. |
| Route-level error docs (high-traffic) | **PARTIAL (Phase 1 sample + finance writes DONE)** | `@ApiStandardErrorResponses` on auth login/refresh/MFA verify + public booking POST + Phase 0 pattern routes; `@ApiStaffErrorResponses` on **8** finance write routes (lane **API36-openapi-finance**); remaining controllers undecorated |
| Web client branches on `code` (dual-read) | **RESIDUAL** | `apps/web/src/lib/api.ts` reads `message` + `status` only |
| Public error-code catalog (integrators) | **DONE (OpenAPI enum)** | `API_ERROR_CODE_CATALOG` + `ApiErrorCode` schema in `/docs` (lane **API36-openapi-phase2**); throw-site emission **RESIDUAL** |

**§36 classification:** **PARTIAL** — Friday ship bar met (envelope + defaults + tests); OpenAPI + domain codes documented here, not hidden.

---

## Error contract (code truth)

Every failed HTTP request returns:

```json
{
  "code": "RESERVATION_OVERLAP",
  "message": "This unit already has a booking that overlaps that time.",
  "details": {},
  "requestId": "req_m2k9x7_abc123"
}
```

| Field | Rules |
|-------|--------|
| `code` | UPPER_SNAKE machine string. Default from HTTP status when throw site omits custom `code`. |
| `message` | Human-readable; safe for UI toast. Never stack traces or DB internals on 5xx. |
| `details` | Optional structured context (validation `messages[]`, Nest legacy `error`, domain fields). Opaque to most clients. |
| `requestId` | Correlates with API request logs and `x-request-id` header. |

### Default codes (`ApiErrorCode`)

| HTTP | Default `code` |
|------|----------------|
| 400 | `VALIDATION_FAILED` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 500+ | `INTERNAL` |
| other 4xx | `HTTP_<status>` (e.g. `HTTP_429`) |

### Custom code at throw site (supported today)

```typescript
throw new ConflictException({
  code: 'RESERVATION_OVERLAP',
  message: 'This unit already has a booking that overlaps that time.',
  details: { resourceId, startsAt, endsAt },
});
```

**Today:** booking shared helpers + captcha `assertCaptchaOrThrow` emit domain `code`s (see Phase 1 — Booking; Phase 4 — Guest / public). Most other modules still pass a string → envelope gets generic `CONFLICT` / `FORBIDDEN` etc. Clients cannot distinguish overlap vs walk-in vs maintenance without parsing English `message` strings **unless** the route goes through wired booking helpers or captcha assert.

---

## OpenAPI residual plan

**Problem:** Swagger at `/docs` (non-production) documents `@ApiTags` + success DTOs only. Integrators and frontend codegen cannot see error shapes or domain codes.

**Non-goals:** Publishing Swagger in production without auth; documenting every 4xx variant on every route in v1; breaking existing clients.

### Phase 0 — Shared components (**DONE** — lane **API36-openapi-phase0**)

| Work | Notes |
|------|--------|
| Add `ApiErrorBodyDto` | `@ApiProperty` mirror of `ApiErrorBody` in `common/dto/api-error-body.dto.ts` |
| Register global `extraModels` | `SwaggerModule.createDocument` in `main.ts` |
| Document default error responses | `@ApiStandardErrorResponses` / `@ApiStaffErrorResponses` on `/ready` (503), `/public/venues/:slug` (404), `/shop/settings` (staff 4xx/409) |
| Envelope in OpenAPI description | `DocumentBuilder.setDescription` default codes table |

**Exit:** `/docs` shows `ApiErrorBodyDto` schema; three pattern routes list error response bodies referencing it.

### Phase 1 — High-traffic route errors (**PARTIAL (sample set DONE)** — lane **API36-openapi-phase1**)

| Work | Notes |
|------|--------|
| Health readiness | `/ready` — 503 (`ApiErrorBodyDto`) — **DONE** (Phase 0) |
| Auth | `POST /auth/login`, `/auth/refresh`, `/auth/mfa/verify` — 400/401 via `@ApiStandardErrorResponses` |
| Public booking | `POST /public/venues/:slug/gaming|dining/reservations` — 400 validation, 403 captcha, 404 venue, 409 overlap |
| Finance write | shop order / play session / txns / losses — staff 400/401/403/404/409 via `@ApiStaffErrorResponses` — **DONE** (lane **API36-openapi-finance**): `POST /finance/transactions`, `POST /finance/losses`, `POST /finance/play-sessions`, `PATCH /finance/play-billing/:reservationId/mark-paid`, `POST /finance/orders`, `PATCH /finance/orders/:id`, `PATCH /finance/play-sessions/:id/mark-paid`, `POST /finance/orders/:id/lines` |

Use `@ApiStandardErrorResponses` per route with default `ApiErrorCode` descriptions (domain-specific example codes from Phase 2 registry once assigned).

**Exit (sample):** Integrator-facing auth + public booking + finance write sample endpoints list explicit `ApiErrorBodyDto` error responses in `/docs`. Remaining finance writes + other controllers = **RESIDUAL**.

### Phase 2 — Full catalog export (**DONE (catalog enum)** — lane **API36-openapi-phase2**)

| Work | Notes |
|------|--------|
| `codes` enum in OpenAPI | **DONE** — `components.schemas.ApiErrorCode` via `ApiErrorBodyDto.code` `enumName` + `API_ERROR_CODE_CATALOG` (defaults + domain registry in `api-error.codes.ts`) |
| CI drift check | Optional — **deferred** |
| Staging `/docs` behind basic auth | Optional — **deferred** |

**Exit:** `/docs` components include `ApiErrorCode` enum (6 defaults + 22 domain registry codes). Dynamic `HTTP_<status>` documented in property description, not in enum. Throw-site migration **PARTIAL** — booking + captcha slices **DONE**; remaining domains **RESIDUAL**.

---

## Domain-specific codes — phased migration

**Principle:** Add codes **at shared throw helpers first** (one edit → many call sites). Prefer `{ code, message }` objects over string throws. Keep English `message` for backward compatibility until web dual-read ships.

**Naming:** `<DOMAIN>_<REASON>` — UPPER_SNAKE, stable forever once published.

### Registry (target — not all wired)

| Phase | `code` | HTTP | Throw locus (today) | Notes |
|-------|--------|------|---------------------|-------|
| **1 — Booking** | `RESERVATION_OVERLAP` | 409 | `booking-overlap.util`, `booking-lock.util` | **DONE** — same copy for app check + GiST exclusion |
| | `WALK_IN_ACTIVE` | 409 | `assertNoActiveWalkIn` | **DONE** |
| | `WALK_IN_OVERLAP` | 409 | `assertNoWalkInOverlap` | **DONE** |
| | `RESOURCE_MAINTENANCE` | 409 | `assertResourceBookable` | **DONE** |
| | `RESOURCE_NOT_BOOKABLE` | 409 | `assertResourceBookable` | **DONE** — missing resource (consider 404 later) |
| **2 — Auth / tenant** | `CSRF_INVALID` | 403 | `csrf.guard` | **DONE** — distinct from generic forbidden |
| | `SESSION_REVOKED` | 401 | `auth-refresh.service` | **DONE** — refresh reuse / family revoke |
| | `MFA_REQUIRED` | 401 | `auth-mfa.service` verifyMfaLogin | **DONE** — invalid/expired challenge JWT or ineligible user |
| | `MFA_INVALID` | 401 | `auth-mfa.service` | **DONE** — TOTP / recovery mismatch on verify, enroll confirm, disable, recovery regen |
| | `VENUE_ACCESS_DENIED` | 403 | `resolve-venue-shop`, `finance-guard.util` | **DONE** — missing membership / bad path / unbound shop |
| | `PERMISSION_DENIED` | 403 | `roles.guard`, `finance-guard.util` | **DONE** — role/perm miss (`details.permission` or `details.permissions`) |
| **3 — Commerce** | `IDEMPOTENCY_PAYLOAD_MISMATCH` | 409 | `idempotency.util` | Key reused with different body |
| | `MENU_STOCK_INSUFFICIENT` | 409 | `assertMenuStockQty`, `adjustMenuItemStockByOrThrow` | **DONE (util helpers)** — finance services still use legacy `BadRequestException` until follow-on lane |
| | `SHOP_ORDER_STATE` | 409 | `shop-order.service` | Wrong status transition |
| | `PLAY_SESSION_ACTIVE` | 409 | `play-session.service` | Duplicate active session |
| | `GUEST_CHECK_CLOSED` | 409 | `guest-check.service` | Mutations on settled/closed tab |
| **4 — Guest / public** | `GUEST_TOKEN_EXPIRED` | 401 | `assertGuestTokenActive` | **DONE** — hash valid but past expiry |
| | `GUEST_TOKEN_REVOKED` | 401 | cancel / NO_SHOW paths | **DONE** — via `assertGuestTokenActive` |
| | `CAPTCHA_REQUIRED` | 403 | `captcha.util` | **DONE** — missing token when required (always / escalated) |
| | `CAPTCHA_FAILED` | 403 | `captcha.util` | **DONE** — token present but verify failed |
| **5 — Onboarding / billing** | `EMAIL_ALREADY_REGISTERED` | 409 | `auth.service` register | |
| | `SLUG_TAKEN` | 409 | register / slug change | |
| | `SUBSCRIPTION_REQUIRED` | 403 | `venue-entitlements` | **DONE** — feature gate + multi_shop + staff seats |

**Implementation helper (lanes API36-domain-booking-codes / API36-domain-captcha-codes / API36-domain-csrf-codes / API36-domain-mfa-codes):**

```typescript
// common/api-error.util.ts
export function apiConflictException(
  code: ApiDomainErrorCodeValue,
  message: string,
  details?: Record<string, unknown>,
): ConflictException {
  return new ConflictException(
    details !== undefined ? { code, message, details } : { code, message },
  );
}

export function apiForbiddenException(
  code: ApiDomainErrorCodeValue,
  message: string,
  details?: Record<string, unknown>,
): ForbiddenException {
  return new ForbiddenException(
    details !== undefined ? { code, message, details } : { code, message },
  );
}

export function apiUnauthorizedException(
  code: ApiDomainErrorCodeValue,
  message: string,
  details?: Record<string, unknown>,
): UnauthorizedException {
  return new UnauthorizedException(
    details !== undefined ? { code, message, details } : { code, message },
  );
}
```

Use at shared throw helpers first; extend to auth / commerce / onboarding slices in follow-on lanes.

**Guest-token slice (lane API36-domain-guest-token):** `assertGuestTokenActive` (`guest-token.util.ts`) emits `GUEST_TOKEN_EXPIRED` / `GUEST_TOKEN_REVOKED` via `apiUnauthorizedException`. Callers (`reservations-public.service`, `event-requests.service`, `guest-chat.service`) inherit domain codes without service edits. Web dual-read **DONE** on public guest status + chat (lane **API36-web-w2-guest-token**).

**CSRF slice (lane API36-domain-csrf-codes):** `CsrfGuard` emits `CSRF_INVALID` via `apiForbiddenException` when double-submit token missing or mismatched. English `message` unchanged for web retry path. Web post-retry UX **DONE** (lane **API36-web-w2-csrf**). Residual: `auth-venue` still uses generic 401 (not 403 envelope).

**Session-revoked slice (lanes API36-domain-session-revoked + API36-domain-jwt-session):** `auth-refresh.service.ts` emits `SESSION_REVOKED` via `apiUnauthorizedException` on refresh reuse (`session.revokedAt`) and lost-claim race (family revoke). Unknown/expired refresh tokens keep generic `UNAUTHORIZED` with unchanged English `message`. `jwt-access.strategy.ts` emits `SESSION_REVOKED` on staff session miss (missing `sid` in access JWT, or DB session revoked/expired/superseded); English `message` unchanged. Specs lock `{ code }`: `auth.service.refresh.spec.ts` + `auth.service.refresh.characterization.spec.ts` + `jwt-access.strategy.spec.ts`. Residual: web dual-read for refresh/sign-out UX.

**MFA slice (lane API36-domain-mfa-codes):** `auth-mfa.service.ts` emits `MFA_REQUIRED` via `apiUnauthorizedException` when MFA challenge JWT is invalid/expired or user no longer MFA-login-eligible; emits `MFA_INVALID` on TOTP/recovery mismatch in `verifyMfaLogin`, enroll confirm, disable, and recovery regen. Login password path still returns `{ mfaRequired, mfaToken }` (no throw). Account lock during MFA verify keeps generic `UNAUTHORIZED`.

**Permission/venue slice (lanes API36-domain-permission-codes + API36-domain-venue-reviews):** `RolesGuard` emits `PERMISSION_DENIED` via `apiForbiddenException` on missing auth context, insufficient system/shop role, or missing `@RequirePermissions` (any-of list in `details.permissions`). `assertFinancePerm` (`finance-guard.util.ts`) emits `VENUE_ACCESS_DENIED` when `shopId` unbound and `PERMISSION_DENIED` with `details.permission` on CSV miss. `resolveVenueShopId` (`resolve-venue-shop.ts`) emits `VENUE_ACCESS_DENIED` on all 403 reject paths. `VenueReviewsService.assertRead` / `assertWrite` emit `PERMISSION_DENIED` with `details.permission` (`reviews.read` / `reviews.write`; unchanged English `message`). Specs: `roles.guard.spec.ts`, `finance-guard.util.spec.ts`, `resolve-venue-shop.spec.ts`, `venue-reviews.service.spec.ts`. Web dual-read **PARTIAL** — builtin `resolveApiErrorDisplay` fallbacks + staff menu orders / reservation save / finance quick-sale en/pl (lanes **API36-web-w2-permission**, **API36-web-w2-permission-expand**). Residual: `auth-venue.service` 401 throws; broader W2 call sites.

**Stock slice (lanes API36-domain-stock-codes + API36-stock-service-adopt):** `assertMenuStockQty` (`menu-stock.util.ts`) + `adjustMenuItemStockByOrThrow` (`menu-stock-db.util.ts`) emit `MENU_STOCK_INSUFFICIENT`. Adopted in `shop-order.service.ts` + `finance-transaction.service.ts` (replaced all stock `BadRequestException` paths). `shop-order-stock.util.ts` has no conflict throw sites (restore-only). Residual: other commerce domain codes.

**Subscription slice (lane API36-domain-subscription):** `assertShopHasFeature`, `assertOwnerMayAddVenue`, `assertMultiVenueEntitlement`, and `assertStaffSeatCapacity` (`venue-entitlements.ts`) emit `SUBSCRIPTION_REQUIRED` via `apiForbiddenException` with unchanged English `message` and optional `details.feature` (plus seat cap fields on limit paths). Callers (`auth.service`, `staff.service`, `shop.service`, feature-gated modules) inherit domain codes without service edits. Specs: `venue-entitlements.spec.ts`. Residual: web dual-read for subscription upsell UX; onboarding/billing codes (`EMAIL_ALREADY_REGISTERED`, `SLUG_TAKEN`).

### Migration gates (operator / QA)

| Gate | Check |
|------|--------|
| G0 | Jest characterization: each new helper throws `{ code }` shape — **booking slice DONE** (`booking-lock.util.spec.ts`); **captcha slice DONE** (`captcha.util.spec.ts`); **CSRF slice DONE** (`csrf.guard.spec.ts`); **guest-token slice DONE** (`guest-token.util.spec.ts`); **MFA slice DONE** (`auth.service.mfa.spec.ts`, `auth.service.mfa.characterization.spec.ts`); **session-revoked slice DONE** (`auth.service.refresh.spec.ts`, `auth.service.refresh.characterization.spec.ts`, `jwt-access.strategy.spec.ts`); **permission/venue slice DONE** (`roles.guard.spec.ts`, `finance-guard.util.spec.ts`, `resolve-venue-shop.spec.ts`); **stock util + service adoption DONE** (`menu-stock.util.spec.ts`, `menu-stock-db.util.spec.ts`, `finance.shop-orders.characterization.spec.ts`, `finance.transactions.characterization.spec.ts`); **subscription slice DONE** (`venue-entitlements.spec.ts`) |
| G1 | Public book E2E: overlap returns `RESERVATION_OVERLAP` (not only `CONFLICT`) |
| G2 | Web dual-read: UI still works when `code` absent (legacy deploy) |
| G3 | OpenAPI examples match live responses for documented routes |
| G4 | No English-only branching added in web — use `code` with `message` fallback |

---

## Web client dual-read (**PARTIAL (W1 + 8 call sites)** — lanes **API36-web-dual-read**, **API36-web-w2-staff**, **API36-web-w2-stock**, **API36-web-w2-finance-stock**, **API36-web-w2-play-billing**, **API36-web-w2-csrf**, **API36-web-w2-guest-token**, **API36-web-w2-permission**)

**Today:** `ApiError` carries `status`, optional `code`, and parsed `body` in `details`; fetch helpers parse `{code,message}` from the envelope.

**Phase W1 (minimal):** **DONE** — `parseApiErrorEnvelope` / `apiErrorFromResponse` in `api-error-message.ts`; `ApiError.code` on `api()` + public fetch clients.

**Phase W2:** **PARTIAL** — branch UX on stable codes where product needs it:
- `RESERVATION_OVERLAP` → localized copy + schedule refresh (`public-gaming-booking-dialog.tsx`)
- `CAPTCHA_REQUIRED` / `CAPTCHA_FAILED` → captcha reset + localized copy (same dialog)
- `MFA_INVALID` → localized MFA verify copy (`login-form.tsx`)
- `RESERVATION_OVERLAP` → localized dining/unit copy + schedule refresh on staff create/update (`reservation-dialog.tsx` via sessions floor board; lane **API36-web-w2-staff**)
- `MENU_STOCK_INSUFFICIENT` → localized copy + menu refresh on staff add-line / order mutations (`menu-orders-panel.tsx` `run()` catch; lane **API36-web-w2-stock**)
- `MENU_STOCK_INSUFFICIENT` → localized copy on staff quick-sale / transaction create (`finance-transactions-panel.tsx` `onSubmit` catch; lane **API36-web-w2-finance-stock**; reuses `orders.stockInsufficient` en/pl)
- `PERMISSION_DENIED` / `VENUE_ACCESS_DENIED` → localized en/pl on staff quick-sale / transaction create (`finance-transactions-panel.tsx` `onSubmit` catch; lane **API36-web-w2-permission-expand**; reuses `common.permissionDenied` / `common.venueAccessDenied`)
- `RESERVATION_OVERLAP` → localized unit copy + schedule refresh on walk-in create / walk-in or booking edit save (`game-billing-panel.tsx` `onCreateWalkIn` + `game-billing-edit-dialog.tsx` `handleSave`; lane **API36-web-w2-play-billing**; reuses `reservationDialog.overlapUnit` en/pl; `WALK_IN_OVERLAP` / `WALK_IN_ACTIVE` fall back to server `message` + same refresh)
- `CSRF_INVALID` → localized “refresh and retry” copy after `api()` CSRF bootstrap retry fails (`api.ts` + login form; lane **API36-web-w2-csrf**)
- `GUEST_TOKEN_EXPIRED` / `GUEST_TOKEN_REVOKED` → localized en/pl copy on public guest status load/cancel + guest chat mutations (`guest-token-error-display.ts` → `guestStatus.tokenExpired` / `guestStatus.tokenRevoked` in `public-i18n.ts`; gaming/dining/event status pages, `venue-guest-chat-widget.tsx`; lanes **API36-web-w2-guest-token**, **API36-guest-token-i18n**)
- `PERMISSION_DENIED` / `VENUE_ACCESS_DENIED` → builtin friendly copy in `resolveApiErrorDisplay` (`api-error-message.ts` + `api.ts`); localized en/pl on staff menu order mutations (`menu-orders-panel.tsx`; lane **API36-web-w2-permission**); staff reservation create/update save (`reservation-dialog.tsx`; lane **API36-web-w2-permission-expand**; reuses `common.permissionDenied` / `common.venueAccessDenied`)

Always fall back to `message` when `code` is generic default or absent (legacy deploy — gate G2).

**Non-goals:** i18n of server `message` strings in v1; exposing raw `details` to screen readers without review (see [`GO_SPOTS_A11Y.md`](./GO_SPOTS_A11Y.md) §30/§36 note).

---

## Verify (shipped bar)

```bash
pnpm --filter @gospots/api exec jest \
  src/common/api-error.codes.spec.ts \
  src/common/api-error.util.spec.ts \
  src/common/sentry-exception.filter.spec.ts \
  src/common/booking-lock.util.spec.ts \
  src/common/captcha.util.spec.ts \
  src/common/captcha-escalation.util.spec.ts \
  --no-coverage
# Expect api-error suites PASS + booking-lock.util.spec + captcha.util.spec (domain code assertions)
```

Manual smoke (after Render resume): trigger 404 + 409 on a known route; confirm JSON envelope + `x-request-id` (not Nest legacy `{ statusCode, message, error }`).

---

## File reference

| Path | Role |
|------|------|
| `docs/audit/GO_SPOTS_API_ENVELOPE.md` | This design + residual plan |
| `apps/api/src/common/api-error.util.ts` | Envelope builder + `apiConflictException` / `apiForbiddenException` / `apiUnauthorizedException` throw helpers |
| `apps/api/src/common/booking-overlap.util.ts` | Booking overlap / walk-in / resource asserts (**domain codes wired**) |
| `apps/api/src/common/booking-lock.util.ts` | Resource row lock + GiST exclusion → `RESERVATION_OVERLAP` |
| `apps/api/src/common/captcha.util.ts` | CAPTCHA verify + `assertCaptchaOrThrow` (**CAPTCHA_REQUIRED** / **CAPTCHA_FAILED** wired) |
| `apps/api/src/modules/auth/auth-mfa.service.ts` | MFA verify/enroll/disable/recovery throws (**MFA_REQUIRED** / **MFA_INVALID** wired) |
| `apps/api/src/common/api-error.codes.ts` | Default status → code map + domain registry + OpenAPI catalog |
| `apps/api/src/common/sentry-exception.filter.ts` | Global filter + Sentry 5xx |
| `apps/api/src/common/dto/api-error-body.dto.ts` | OpenAPI schema for error envelope |
| `apps/api/src/common/dto/api-error-responses.decorator.ts` | Reusable `@ApiStandardErrorResponses` helpers |
| `apps/api/src/main.ts` | Swagger bootstrap (non-prod) + `extraModels` |

## Non-goals

- Rewriting all controllers in one lane
- Localized server error messages (i18n stays client-side for now)
- Replacing HTTP status codes with 200 + `success: false` wrapper
- Documenting Prisma `P2002` / Postgres `23P01` in public API (map to domain codes at boundary)

## Recommendation (when to pull which phase)

| When | Action |
|------|--------|
| **Today (internal web + single tenant ops)** | Envelope + defaults sufficient; use `requestId` for support. |
| **External API partners / mobile app** | Phase 0 OpenAPI + Phase 1 booking/auth errors. |
| **UX that must not parse English errors** | Phase 1 booking codes + Web W1/W2 dual-read. |
| **Compliance / integrator SLA** | Phase 2 full catalog + CI drift check. |
