# Locora — Owner 2FA

**Date:** 2026-07-20 (design) · **Shipped:** 2026-07-21 (Lane **AAAAAA**)  
**Status:** **DONE** for owner TOTP + recovery codes + login challenge (API + web). Staff MFA / WebAuthn / org require-MFA deferred — phased plan: [`GO_SPOTS_MFA.md`](./GO_SPOTS_MFA.md).  
**Audit:** P1 §2.9  
**Operator:** Neon `migrate deploy` of `20260721080000_user_mfa_totp` (never from workstation prod `.env`).

---

## Ship status

| Item | Status |
|------|--------|
| Owner TOTP enroll / confirm / disable | **Shipped** (Lane **AAAAAA**) |
| Recovery codes + login `mfaToken` challenge | **Shipped** |
| Web settings panel + login MFA step | **Shipped** |
| Migration `20260721080000_user_mfa_totp` | On disk — **OPERATOR** Neon deploy |
| Staff / manager MFA, WebAuthn, org require-MFA | Deferred |

**Prerequisite already shipped (API):**

| Surface | Status |
|---------|--------|
| `GET /api/v1/auth/sessions` | List active sessions (`id`, `createdAt`, `userAgent`, `expiresAt`) |
| `DELETE /api/v1/auth/sessions/:id` | Revoke one session via **family** |
| `POST /api/v1/auth/sessions/revoke-others` | Keep current family; revoke the rest |
| Refresh rotation + reuse → family revoke | Done (`AuthSession.familyId`) |

Web sessions panel (Lane O) is complementary UX — **not** blocked on 2FA, and 2FA must not invent a second session model.

---

## What exists today

| Piece | Behavior |
|-------|----------|
| Factors | Password only |
| Lockout | `failedLogins` / `lockedUntil` on `User` |
| Sessions | Multi-session for owners; staff login historically revokes prior sessions on `issueTokens` |
| Secrets at rest | Refresh = SHA-256 hash; password = bcrypt/argon style hash; guest tokens hashed (separate lane) |
| Mail | Transactional (`MailService` + durable outbox) — password reset for owners; **not** a per-login OTP pipeline |
| Grep | No `2fa` / `totp` / `mfa` / recovery-code paths in apps |

Guests and public status tokens are **out of scope** for MFA (opaque guest tokens, not owner accounts).

---

## Goal (post-submit)

Optional second factor for **venue owners** so a leaked password alone cannot complete dashboard login. Staff accounts (`VENUE_STAFF`, synthetic `@shop-slug.gospots` emails) stay password-only in v1.

**Non-goals for v1 MFA:**

- WebAuthn / passkeys  
- SMS OTP  
- Forced MFA for all roles / all shops  
- Per-device “remember this browser” longer than a normal AuthSession (use session revoke instead)  
- Changing guest / public auth

---

## TOTP vs email OTP

| Criterion | **TOTP (authenticator)** | **Email OTP** |
|-----------|--------------------------|---------------|
| Security | Second factor independent of inbox; phishing-resistant if user checks issuer/account | Same channel as password reset → **not** a strong second factor if mailbox is compromised |
| UX | QR once at enroll; 6-digit code at login | No app install; depends on mail latency / spam |
| Ops cost | No per-login mail; works offline | Every login = send; couples MFA to mail deliverability and outbox durability (email OTP deferred — [`GO_SPOTS_MAIL_OUTBOX.md`](./GO_SPOTS_MAIL_OUTBOX.md) prod proof still operator) |
| Abuse | Rate-limit verify attempts; reuse existing lockout | Rate-limit + inbox flooding risk; OTP brute-force windows |
| Fit with Locora | Owners already use real emails for reset; staff emails are **not** real inboxes | Email OTP for staff is especially weak (synthetic addresses) |
| Schema / deps | Secret (encrypted/hashed at rest) + recovery codes; small lib (`otplib` / `otpauth`) | Challenge table or cache + TTL; mail templates |

### Decision

**Primary factor: TOTP.**  
**Email OTP: not for v1 login MFA** (optional later only as a recovery *assist*, never as the sole second factor). Password-reset email remains separate and must **not** bypass TOTP once enrolled (see recovery codes).

Rationale: owner accounts hold billing, staff invites, GDPR export, and finance. Inbox-as-second-factor collapses to “steal password + steal/reset email.” TOTP matches the audit proposal (“optional TOTP for owners”) and avoids depending on durable mail before outbox is real.

---

## Owner-first rollout

| Phase | Who | Policy |
|-------|-----|--------|
| **v1** | `User.accountType === VENUE_OWNER` only | Opt-in enroll in account/security settings; challenge on password success when `totpEnabled` |
| **v1.1** | `ShopRole.OWNER` / `MANAGER` membership holders who are staff-typed users | Only if product wants MFA on elevated staff; **requires real email** or TOTP-only (no email fallback) |
| **Later** | All staff | Optional org policy (“require MFA for role X”) — product decision, not submit |

**Why owners first:** Highest blast radius; real email already; session multi-device is owner-heavy; staff already get session wipe on re-login in places. Keep `auth.service` change surface small.

Enroll UI: same account-security area as sessions list (Lane O), behind “owner” gate — not a pack/feature flag unless product wants paid MFA later (default: **all owners**, free).

---

## Recovery codes

Mandatory when enabling TOTP. Without them, a lost phone locks the owner out of billing and venues.

| Rule | Detail |
|------|--------|
| Count | 8–10 single-use codes at enroll (and on regenerate) |
| Display | Show **once**; user must download/copy; never re-show plaintext |
| Storage | Store **only** hashes (same family as password / refresh hashing); constant-time compare |
| Use | On login challenge screen: “Use a recovery code” → consumes one code → completes MFA step |
| Regenerate | Requires current TOTP **or** remaining recovery code **or** support break-glass (out of band); regenerating invalidates old unused codes |
| Exhaustion | If zero codes left, force re-enroll or support path; warn at 2 remaining |

**Password reset interaction:** Completing email password reset while MFA is enabled must **not** silently disable TOTP. After new password: still require TOTP (or a recovery code) before issuing tokens. Optional: password reset + recovery code in one flow for locked-out owners; document in support runbook.

**Disable MFA:** Require TOTP or recovery code + password; then wipe secret + remaining codes; optionally offer “revoke other sessions” (recommended default: **yes**).

---

## Login / enroll flows (sketch)

### Enroll (authenticated owner)

1. `POST .../mfa/totp/begin` → server generates secret, returns `otpauth://` URI + QR payload (secret never logged).  
2. User confirms with a valid TOTP → `POST .../mfa/totp/confirm` → persist encrypted/hashed secret, `totpEnabled=true`, issue recovery codes (plaintext once).  
3. Recommended: call existing `POST /auth/sessions/revoke-others` so only the enrolling device remains trusted.

### Login (when `totpEnabled`)

1. Password OK → **do not** issue access/refresh yet. Return short-lived `mfaToken` (signed, ~5 min, bound to `userId` + purpose `mfa_challenge`).  
2. `POST .../auth/mfa/verify` with `mfaToken` + TOTP **or** recovery code.  
3. On success → existing `issueTokens` (new or continued family per current login rules).  
4. On failure → increment MFA fail counter; reuse / extend `failedLogins` + `lockedUntil` so password and MFA share lockout budget (avoid infinite MFA guessing after password leak).

Staff login paths and guest tokens: **unchanged**.

---

## Session interaction with family revoke

MFA and sessions are one security story. Do not invent parallel “device trust” rows.

| Event | Session behavior |
|-------|------------------|
| Successful MFA login | Issue AuthSession as today (`familyId`, hashed refresh, rotation) |
| Refresh reuse detected | Existing **family revoke** — unchanged; MFA does not soften this |
| User revokes session via `DELETE /auth/sessions/:id` | Family revoke — MFA enrollment stays; that device must re-login (+ MFA) |
| `revoke-others` | Keeps current family; other devices need password + MFA again |
| TOTP enroll confirm | **Recommend** auto `revoke-others` (or explicit checkbox default-on) |
| TOTP disable | **Recommend** revoke all other families (or all including current → force re-login) |
| Recovery code success | Treat like TOTP success; optionally flag session `userAgent` / audit “recovery_code” for owner review in session list later |
| Password change | Existing policy + strongly recommend revoke-others; MFA remains on |

**Do not:** tie MFA “remember me” to a cookie that skips MFA forever without an AuthSession. If product wants 30-day trust, implement as a normal long-lived session family the user can see and revoke in the sessions UI — still subject to family revoke on refresh reuse.

**Audit:** Log enroll, disable, recovery-code use, verify failures (no secrets/codes in logs). Reuse existing audit module patterns where present.

---

## Schema sketch (post-submit migration — do not add before Friday)

Illustrative only; freeze Friday’s six migrations.

```text
User
  totpEnabled          Boolean  @default(false)
  totpSecretEnc        String?  // app-level encryption, not plaintext
  totpVerifiedAt       DateTime?
  mfaFailCount         Int      @default(0)  // or fold into failedLogins

MfaRecoveryCode
  id                   cuid
  userId               FK → User
  codeHash             String   // unique per user
  usedAt               DateTime?
  createdAt            DateTime
  @@index([userId])
```

No MFA fields on `AuthSession` required for v1. Optional later: `amr` / `mfaAt` on session for “this family completed MFA at T” — only if session list UX needs it.

---

## API sketch (post-submit)

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/auth/mfa/status` | `{ totpEnabled, recoveryCodesRemaining }` |
| `POST` | `/auth/mfa/totp/begin` | Owner + password recently confirmed |
| `POST` | `/auth/mfa/totp/confirm` | Enable + return recovery codes once |
| `POST` | `/auth/mfa/totp/disable` | Password + TOTP or recovery |
| `POST` | `/auth/mfa/recovery/regenerate` | Invalidates prior unused codes |
| `POST` | `/auth/login` (extend) | If MFA on → `{ mfaRequired, mfaToken }` instead of cookies |
| `POST` | `/auth/mfa/verify` | Completes login; sets cookies / tokens |

CSRF: cookie-issuing verify endpoint follows existing CSRF policy (`csrf.guard` / SkipCsrf only where login already exempts). No new CSRF exceptions without matching login patterns.

Rate limits: verify and begin share throttle with auth login (`throttle.config`).

---

## Tests required (when implemented)

- Enroll confirm rejects bad TOTP; enables only after success  
- Login with MFA on does not set refresh until verify  
- Recovery code is single-use; reuse fails  
- Disable + regenerate revoke old codes  
- Password reset does not clear `totpEnabled`  
- After enroll, revoke-others leaves one family  
- Refresh reuse still family-revokes with MFA enabled  
- Staff / non-owner cannot call enroll  
- Lockout after N MFA failures  

Verify commands when coded (not this lane): `tsc` + `nest build` + focused jest on auth MFA specs.

---

## Phased post-submit plan

1. **Migration + crypto helpers** — encrypt TOTP secret; hash recovery codes; no UI yet.  
2. **API enroll / verify / disable** — wire into `auth.service` carefully; keep session APIs as source of truth for devices.  
3. **Web** — settings security: QR enroll, recovery download, login challenge step; mount beside sessions panel.  
4. **Hardening** — audit events, throttle, support runbook for lost device (recovery codes only; no email MFA bypass).  
5. **Optional** — manager MFA; org “require MFA”; never SMS.

---

## Explicitly out of scope until after submit

- Any Prisma migration or `schema.prisma` MFA fields  
- `otplib` / QR deps in `apps/api` or `apps/web`  
- Changes to `auth.service.ts` login/issueTokens for MFA branching  
- Email OTP login factor  
- Claiming “2FA done” in deploy notes — keep **known limitation: no 2FA** through Friday

---

## Related

- Residual phased plan (staff / WebAuthn / org policy) — [`GO_SPOTS_MFA.md`](./GO_SPOTS_MFA.md)  
- Audit §2.9 — `GO_SPOTS_DEEP_AUDIT.md`  
- Session API — Lane J (`GO_SPOTS_IMPLEMENTATION_REPORT.md`); web UI Lane O  
- Fix plan Phase E “(Later) optional owner 2FA” — `GO_SPOTS_FIX_PLAN.md`  
- Mail durability — `GO_SPOTS_MAIL_OUTBOX.md` (why email OTP is a poor v1 choice)  
- Submit limitations — `DEPLOY_CHECKLIST.md`, `REMAINING_P0_FRIDAY.md`
