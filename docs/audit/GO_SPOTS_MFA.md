# Locora — MFA residual plan (Bible §12 / #18)

**Date:** 2026-07-22 (residual docs lane **MFA12-residual-docs**; Phase 0 prep **MFA12-staff-phase0**)  
**Status:** Owner TOTP + sessions **DONE** (ship bar met). Staff/manager MFA, WebAuthn, org require-MFA, and broader forced reauth remain **explicitly deferred** — phased plan below. **Do not implement WebAuthn in this lane.**  
**Bible:** P1 **§12** / **#18** — owner account protection.  
**Owner v1 design (shipped):** [`GO_SPOTS_2FA.md`](./GO_SPOTS_2FA.md)

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Owner TOTP enroll / confirm / disable | **DONE** | `auth.service.ts` (`assertVenueOwner`); `mfa-totp.util.ts` |
| Recovery codes + login `mfaToken` challenge | **DONE** | `mfa-recovery.util.ts`, `mfa-challenge.util.ts`; `POST /auth/mfa/verify` |
| MFA failures share password lockout | **DONE** | `failedLogins` / `lockedUntil` on verify failure |
| Password reset keeps TOTP | **DONE** | `auth.service.mfa.spec.ts` |
| Sessions list / revoke / revoke-others | **DONE** | `AuthSessionService`; settings Sessions UI |
| New-device sign-in email (fail-open) | **DONE** | `new-device-alert.util.ts` |
| Web settings panel + login MFA step | **DONE** | `auth-mfa-panel.tsx`; owner gate on settings page |
| Migration `20260721080000_user_mfa_totp` | On disk — **OPERATOR** Neon deploy | never from workstation prod `.env` |
| Staff / manager MFA (Phase 1 opt-in) | **DONE** (flag default off) | `AuthMfaService` guards + `auth.service.ts` login branch; `STAFF_MFA_OPT_IN`; web settings panel for eligible staff |
| Staff / manager MFA (Phase 2+) | **RESIDUAL** | Plain `STAFF` enroll; org require-MFA Phase 3 |
| WebAuthn / passkeys | **RESIDUAL** | No deps, schema, or routes — **out of scope until Phase 4** |
| Org “require MFA for role X” | **RESIDUAL** | No `Shop` policy column or login enforcement |
| Broader forced reauth (beyond guest erase) | **RESIDUAL** | Password reauth on erase + MFA mutations + dashboard-key regen only |
| Session `amr` / `mfaAt` metadata | **RESIDUAL** (optional UX) | Not required for v1 ship bar |

**§12 classification:** **PARTIAL** — owner ship bar met; residuals documented here, not hidden.

---

## What exists today (code truth)

### Owner TOTP (shipped Lane **AAAAAA**)

| Surface | Behavior |
|---------|----------|
| Who | `User.accountType === VENUE_OWNER` only — staff get `403 Two-factor authentication is owner-only.` |
| Factors | TOTP (authenticator app) + single-use recovery codes |
| Secret at rest | AES-GCM via `MFA_TOTP_ENCRYPTION_KEY` (+ JWT secret fallback in dev) |
| Login | Password OK → `{ mfaRequired, mfaToken }` (~5 min JWT) → verify → cookies |
| Enroll API | `GET /auth/mfa/status`, `POST /auth/mfa/totp/begin|confirm|disable`, `POST /auth/mfa/recovery/regenerate` |
| Web | `AuthMfaPanel` mounted only when `isOwner` on venue settings |

### Sessions (same §12 story — not a second device-trust model)

| Surface | Behavior |
|---------|----------|
| Owner | Multi-session families; refresh rotation + reuse → family revoke |
| Staff | `issueTokens` revokes all prior staff sessions on each login (single active session) |
| UX | Settings Sessions panel; revoke-others recommended after MFA enroll (panel calls existing API) |

### Adjacent owner protection (not MFA, but §12 scope)

| Surface | Behavior |
|---------|----------|
| Guest erase | Forced password reauth (`assertUserPassword`) before PII redact |
| Dashboard key regen | Owner password reauth in `shop.service` |
| New sign-in alert | Email on new UA / first session after login (fail-open) |

### Explicitly absent (residual)

| Gap | Why it matters |
|-----|----------------|
| Staff MFA | Managers hold finance, staff invites, floor ops — password-only today |
| WebAuthn | Phishing-resistant second factor; audit mentions passkeys |
| Org require-MFA | Compliance / franchise policy (“all managers must enroll”) |
| Email OTP login factor | Rejected for v1 — weak for synthetic staff inboxes; see [`GO_SPOTS_2FA.md`](./GO_SPOTS_2FA.md) |
| SMS OTP | Non-goal |

---

## Why staff MFA is harder than owner MFA

| Constraint | Detail |
|------------|--------|
| Synthetic staff emails | `@shop-slug.gospots` — not real inboxes; email OTP is not a second factor |
| Account type | Elevated access is `ShopMembership.role` (`MANAGER`, `OWNER` on membership) on `VENUE_STAFF` users |
| Session model | Staff already get session wipe on re-login; MFA must hook **before** `issueTokens`, same as owners |
| Recovery | Staff lockout blocks floor ops — recovery codes + owner/manager break-glass policy required before force-enroll |
| Service split | Future MFA branches should land in `AuthCredentialsService` + `AuthSessionService`, not re-expand `auth.service.ts` ([`GO_SPOTS_SERVICE_SPLIT.md`](./GO_SPOTS_SERVICE_SPLIT.md)) |

**Product default for staff v1:** TOTP-only (same crypto stack as owners), optional opt-in — never email/SMS fallback.

---

## Recommended phased plan

Phases are ordered by risk reduction vs implementation cost. **Do not skip Phase 0 operator deploy** before expanding MFA to staff.

### Phase 0 — Owner baseline (**DONE** + operator)

- [x] Migration + utils + API + web owner panel + login challenge
- [ ] **OPERATOR:** Neon `migrate deploy` of `20260721080000_user_mfa_totp` after app smoke
- [ ] Support runbook: lost phone → recovery codes only; no email MFA bypass

**Exit:** Owners can opt in; prod schema matches app.

**Phase 0 operator migrate plan (hard gate before Phase 1 code):**

| Step | Action | Verify |
|------|--------|--------|
| 0 | App release includes MFA utils + `AuthMfaService` + owner web panel | `nest build`; owner enroll smoke on staging |
| 1 | Set `MFA_TOTP_ENCRYPTION_KEY` (64-byte hex) in prod secrets | Key present in Render/host env |
| 2 | Neon `migrate deploy` includes `20260721080000_user_mfa_totp` | `\d "User"` shows `totpEnabled` / `totpSecretEnc` / `totpVerifiedAt`; `MfaRecoveryCode` exists |
| 3 | Owner smoke: enroll → logout → TOTP login → recovery path | Manual + `jest auth.service.mfa.spec.ts` |
| 4 | Support runbook: lost phone → recovery codes only; no email MFA bypass | [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) / submit notes |

**Schema note for Phase 1:** Staff MFA **reuses** the Phase 0 migration — `User.totp*` columns and `MfaRecoveryCode` are account-type agnostic. **No new migration** for Phase 1. Phase 3 org require-MFA is when `Shop` policy columns appear.

### Phase 1 — Elevated staff opt-in (manager / membership `OWNER`) — **DONE** (operator flag)

**Lane ID:** `MFA12-staff-phase1`  
**Prerequisite:** Phase 0 operator migrate **DONE** on Neon.  
**Schema:** **None** — reuse `20260721080000_user_mfa_totp`.  
**Feature flag:** `STAFF_MFA_OPT_IN` default **off** — helpers in `apps/api/src/common/staff-mfa.util.ts`; web mirrors with `NEXT_PUBLIC_STAFF_MFA_OPT_IN`. Documented in `.env.example` / `.env.production.example`.

**Goal:** Optional TOTP for `VENUE_STAFF` users with elevated membership, without org-wide force.

#### Eligibility (membership role, not permission CSV)

| Actor | Phase 1 enroll / login MFA |
|-------|----------------------------|
| `User.accountType === VENUE_OWNER` | **Already shipped** — unchanged |
| `VENUE_STAFF` + active `Membership.role === MANAGER` | **Allowed** when `STAFF_MFA_OPT_IN=on` |
| `VENUE_STAFF` + active `Membership.role === OWNER` | **Allowed** (venue-granted admin on membership, not platform owner) |
| `VENUE_STAFF` + `Membership.role === STAFF` | **403** until Phase 2 |
| No active membership | **403** / login disabled (existing staff gate) |

**Not a permission key:** MFA enroll is **account security**, not dashboard RBAC. Do **not** add `requireStaffMfa` to `PERMISSIONS` — org **force** enroll is Phase 3 (`Shop.requireMfaForRoles`). Phase 1 is opt-in only.

**Multi-venue staff:** Eligibility = **any** active membership with `MANAGER` or `OWNER` role. Enroll is per **user** (TOTP on `User`), not per shop — same as owners.

#### API surface (same paths — widen guards only)

| Method | Path | Phase 1 change |
|--------|------|----------------|
| `GET` | `/auth/mfa/status` | Replace `assertVenueOwner` → `assertMfaEligible(userId)` in `AuthMfaService` |
| `POST` | `/auth/mfa/totp/begin` | Same guard; staff `email` label in otpauth URI uses synthetic `@shop-slug.gospots` login id |
| `POST` | `/auth/mfa/totp/confirm` | Same |
| `POST` | `/auth/mfa/totp/disable` | Same; password + TOTP/recovery step-up unchanged |
| `POST` | `/auth/mfa/recovery/regenerate` | Same |
| `POST` | `/auth/mfa/verify` | Same login verify; JWT `acct` already carries `UserAccountType` |
| `POST` | `/auth/login` | Extend MFA challenge branch in `AuthService.login` (minimal diff): when `totpEnabled` and (`VENUE_OWNER` **or** eligible staff + flag on), return `{ mfaRequired, mfaToken }` **before** staff session wipe |

**OpenAPI / errors:** Reuse existing `@ApiStandardErrorResponses` on MFA routes (lane **API36-openapi-phase1**). New 403 copy: distinguish owner-only (flag off) vs role-ineligible (plain STAFF).

**CSRF / throttle:** Unchanged — authenticated MFA mutations use CSRF; login + verify use existing auth throttles.

#### Service split (where code lands)

| Concern | Owner today | Phase 1 target |
|---------|-------------|----------------|
| Enroll / disable / recovery / verify | `AuthMfaService` | Extend guards + optional owner notification on staff lockout |
| Login MFA challenge JWT | `AuthService.login` | **Minimal** branch widen — do **not** re-expand facade; consider `AuthCredentialsService` only if split doc Phase lands first |
| Session completion post-MFA | `AuthService.mfaCompleteLogin` | Unchanged wire hook |
| Staff session wipe on login | `AuthService.issueTokens` | Runs **after** MFA verify (same as owners) |

#### Recovery / lockout policy

| Event | Behavior |
|-------|----------|
| Failed TOTP / recovery at verify | Same `failedLogins` / `lockedUntil` as owners (shared counters on `User`) |
| Staff locked | Login message: existing staff copy (“Ask your venue owner…”) |
| Recovery codes exhausted mid-login | Same 401; user must contact venue owner |
| **New (Phase 1):** manager exhausts codes or locks | **Fail-open email** to venue `VENUE_OWNER` user(s) for that shop — mirror `new-device-alert.util.ts` pattern; no secrets in mail |
| Break-glass | Owner issues staff password reset (existing `requestStaffPasswordReset` + invite flow); owner cannot disable staff TOTP without staff credentials — product accepts this for v1 |

#### Web UX

| Surface | Phase 1 |
|---------|---------|
| Owner | `AuthMfaPanel` on venue settings — **unchanged** |
| Eligible staff | New **Account security** entry (profile or `/dashboard/.../account/security`) mounting shared `AuthMfaPanel` when `isStaffMfaEligible && STAFF_MFA_OPT_IN` |
| Plain staff | No panel; 403 if API called directly |
| Login | Existing MFA step component — no account-type fork if API returns `mfaRequired` for staff |
| i18n | Reuse `settings.mfa*` keys; add staff-specific hint string if copy differs |

#### Tests (minimum bar)

| File | Cases |
|------|-------|
| `auth.service.mfa.spec.ts` | Manager enroll + login challenge; plain `STAFF` forbidden; owner unchanged |
| `auth.service.mfa.characterization.spec.ts` | Extend guard matrix for staff eligible / ineligible |
| `staff-mfa.util.spec.ts` | Flag + role helpers (**prep DONE**) |
| Web | Manual smoke: manager enroll on staging with flag on |

Verify: `jest src/modules/auth/auth.service.mfa.spec.ts` + `jest staff-mfa.util.spec.ts`; `nest build`; web `typecheck`; `i18n:check` if new strings.

#### Phase 1 deploy checklist (operator)

- [ ] Phase 0 Neon migrate confirmed
- [ ] Deploy Phase 1 app build (**on disk**)
- [ ] Set `STAFF_MFA_OPT_IN=on` (+ web `NEXT_PUBLIC_STAFF_MFA_OPT_IN=on`) on staging → manager smoke → prod when ready
- [ ] Submit notes: staff MFA opt-in for managers; org force still Phase 3

**Exit:** Managers can opt in when flag on; owners unchanged; plain staff blocked.

### Phase 2 — All staff optional MFA

**Goal:** Any activated `VENUE_STAFF` may enroll TOTP (still opt-in).

| Work | Notes |
|------|--------|
| Remove role gate from Phase 1 | Keep synthetic-email guard — TOTP + recovery only |
| Floor UX | Login challenge on shared tablets — document “one device per staff login” vs session wipe |
| i18n | Extend `settings.mfa*` keys beyond owner settings slice |

**Exit:** Parity with owner factor stack for all staff accounts.

### Phase 3 — Org require-MFA policy

**Goal:** Venue owner can require MFA for selected roles before dashboard access.

| Work | Notes |
|------|--------|
| Schema | e.g. `Shop.requireMfaForRoles ShopRole[]` or JSON policy `{ manager: true, staff: false }` |
| Enforcement | After password OK: if policy requires MFA and `!totpEnabled` → block login with enroll-required error (or grace-period banner) |
| Owner UI | Toggle in venue security settings; audit log policy changes |
| Grace period | Recommended 14-day enroll window before hard block — product decision |
| Billing / GDPR | Require-MFA must not lock owner out of billing portal without recovery path |

**Exit:** Policy enforced at login; documented in privacy/security copy.

### Phase 4 — WebAuthn / passkeys (**deferred — design only here**)

**Goal:** Add phishing-resistant factor; optional alongside or instead of TOTP per user.

| Work | Notes |
|------|--------|
| Schema | `WebAuthnCredential` (credentialId, publicKey, signCount, userId, nickname) |
| API | `@simplewebauthn/server` — register (authenticated) + authenticate (login / step-up) |
| UX | “Add passkey” beside authenticator app; platform vs roaming keys |
| Policy | Org require-MFA may accept passkey **or** TOTP (`amr` in session optional) |
| Prerequisite | Phase 0 operator deploy + Phase 1–2 stable; extract auth credentials service per split doc |

**Explicit:** **No WebAuthn implementation in current repo.** This phase is a future lane.

### Phase 5 — Broader forced reauth + session MFA metadata (optional)

**Goal:** Sensitive mutations require recent password **or** step-up MFA; session list shows MFA completion time.

| Candidate actions | Today |
|-------------------|--------|
| Account wipe (`POST /gdpr/erase-account`) | Password only |
| Billing / payout changes | Password varies |
| Staff invite / role elevation | No step-up |
| MFA disable / recovery regen | Password + TOTP/recovery (done) |

| Work | Notes |
|------|--------|
| `assertRecentAuth` helper | Password or TOTP verified within N minutes |
| Optional `AuthSession.mfaAt` | Display in sessions UI; not a skip-MFA cookie |

**Exit:** Documented list of step-up-protected routes; audit events without secrets in logs.

---

## API sketch (future phases — not implemented)

| Phase | Method | Path | Notes |
|-------|--------|------|--------|
| 1–2 | *(existing)* | `/auth/mfa/*` | Extend guards — same paths, wider `accountType` / role |
| 3 | `PATCH` | `/shops/:id/security` | `{ requireMfaForRoles: ['MANAGER'] }` |
| 4 | `POST` | `/auth/webauthn/register/options` | Authenticated enroll |
| 4 | `POST` | `/auth/webauthn/register/verify` | Persist credential |
| 4 | `POST` | `/auth/webauthn/authenticate/*` | Login or step-up |
| 5 | header/body | `X-Confirm-Password` / `stepUpToken` | Reuse GDPR pattern |

CSRF and throttle: follow existing login/MFA patterns (`csrf.guard`, `throttle.config`).

---

## Tests required (when implementing residuals)

| Phase | Minimum bar |
|-------|-------------|
| 1 | Manager staff enroll + login challenge; plain staff forbidden; owner unchanged |
| 2 | Any staff enroll; session wipe + MFA interaction |
| 3 | Policy blocks login when MFA required but not enrolled; grace period if enabled |
| 4 | Register + authenticate WebAuthn; fallback TOTP still works |
| 5 | Step-up rejects stale session on protected mutations |

Verify: `jest src/modules/auth/auth.service.mfa.spec.ts` + new webauthn specs; `nest build`; web typecheck; `i18n:check` for new strings.

---

## Operator checklist (Phase 0)

- [ ] App release with MFA env: `MFA_TOTP_ENCRYPTION_KEY` (64-byte hex) set in prod secrets
- [ ] Neon `migrate deploy` includes `20260721080000_user_mfa_totp`
- [ ] Smoke: owner enroll → logout → login with TOTP → recovery code path
- [ ] Document in submit notes: **owner MFA available; staff/WebAuthn/org policy residual** ([`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md))

---

## Related

- Owner v1 shipped design — [`GO_SPOTS_2FA.md`](./GO_SPOTS_2FA.md)
- Bible §12 tracker — [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md) §12
- Ship log — [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md) #18
- Auth service split — [`GO_SPOTS_SERVICE_SPLIT.md`](./GO_SPOTS_SERVICE_SPLIT.md)
- Operator deploy — [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md), [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md)
