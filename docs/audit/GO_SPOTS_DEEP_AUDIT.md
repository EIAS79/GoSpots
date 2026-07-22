# GoSpots deep audit (current verification)

**As of:** 2026-07-22  
**Canonical tracker:** [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md) (§§1–40).  
**Method:** verify-against-code (prompt §1.1). This replaces earlier deleted snapshot audits.

Status values: `CONFIRMED` | `PARTIALLY CONFIRMED` | `ALREADY FIXED` | `NOT PRESENT` | `NEW RELATED ISSUE FOUND`

---

## Architecture map (brief)

- **Monorepo:** `apps/api` NestJS + Prisma/Postgres · `apps/web` Next.js  
- **Hosts:** Render (`gospots-api`) · Vercel web · Neon DB · Resend · Lemon Squeezy  
- **Auth:** JWT cookies + CSRF double-submit · refresh family · owner TOTP  
- **Money:** Decimal(19,4) + `money.util` string wire  
- **Ledger:** `LedgerEntry` dual-write / optional reads (flags default off)  
- **Jobs:** mail outbox processor  

---

## Issue sheets (compressed)

### §4 Monetary float storage

- **Status:** ALREADY FIXED (ship bar **DONE**) · accepted depth residual documented  
- **Severity:** P0  
- **Evidence:** `money.util.ts`; schema `Decimal(19,4)`; [`GO_SPOTS_MONEY_WIRE.md`](./GO_SPOTS_MONEY_WIRE.md) shipped vs residual table  
- **Impact:** Historic float column risk mitigated; API egress uses 4dp strings; web dual-read  
- **Accepted residual:** `toMoneyNumber` intermediates (ops OK); numeric form/PATCH inputs — optional Phases 2–3; **not** operator blockers  
- **Out of scope here:** ledger §5 · currency stamps §20  
- **Tests:** money util + offering + play-billing + analytics + reprice specs  

### §5 Fragmented finance / ledger

- **Status:** PARTIALLY CONFIRMED  
- **Severity:** P0  
- **Evidence:** `LedgerEntry` migration `20260721100000_*`; `ledger-post.util.ts`; `backfill-ledger.ts`; `LEDGER_READS` in analytics  
- **Impact:** Dual-write/reads available; default prod still interim channel-sum until flags  
- **Proposed residual:** operator soak → Phase 5 ledger-primary  
- **Tests:** ledger-post + backfill + finance-analytics specs  

### §6 Tenant isolation

- **Status:** ALREADY FIXED (app) · PARTIALLY CONFIRMED (RLS soak)  
- **Severity:** P0  
- **Evidence:** shopId mutators; `tenant-rls.interceptor.ts`; migration `20260721050000_*`  
- **Impact:** Cross-tenant ID attacks mitigated at app layer; RLS belt opt-in  
- **Tests:** `*.tenant.spec.ts` matrix  

### §7 Booking concurrency

- **Status:** ALREADY FIXED · PARTIAL operator residual  
- **Severity:** P0  
- **Evidence:** `booking-lock.util.ts`; exclusion `20260721060000_*` (**applied on Neon**); `reservation-overlap-detect.util.ts`  
- **Shipped:** App `FOR UPDATE` lock + half-open overlap asserts; GiST EXCLUDE; `23P01`→409; unit + harness + live C1/C2 util bodies on disk  
- **Residual:** Operator live Docker C1/C2 — [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) Gates 0–3; walk-in `PlaySession` not in exclusion; optional C4 / CI job  
- **Tests:** jest booking-lock + overlap-detect **11** PASS; `pnpm test:concurrency` gate **6** PASS (live skipped without opt-in)

### §8 Stock concurrency

- **Status:** ALREADY FIXED · PARTIAL operator residual  
- **Severity:** P0  
- **Evidence:** `adjustMenuItemStockBy` in `menu-stock-db.util.ts`; claim restore util  
- **Shipped:** Conditional stock SQL + claim-before-delete/cancel; live C3 util body on disk  
- **Residual:** Operator live Docker C3 — same Gates 0–3 [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md)  
- **Tests:** menu-stock-db + shop-order-stock **16** PASS

### §9 Webhook idempotency

- **Status:** ALREADY FIXED (ship bar) — **not guest contact** (see §11 / §19 / §28)  
- **Severity:** P0  
- **Evidence:** `BillingWebhookEvent` + `billing.service.ts`; migration `20260720210000_billing_webhook_events`  
- **Tests:** billing.service.spec  
- **Residual (code):** **none**  
- **Residual (operator):** Gates 0–2 — Neon migrate folder #1; Lemon URL/secret; duplicate-delivery smoke — [`GO_SPOTS_WEBHOOK_IDEMPOTENCY.md`](./GO_SPOTS_WEBHOOK_IDEMPOTENCY.md)  

### §10 CSRF / cookies

- **Status:** ALREADY FIXED · **DONE** (code ship bar)  
- **Severity:** P0/P1  
- **Evidence:** `csrf.guard.ts`, `cookie-options.util.ts`, web `csrf.ts` / `api.ts`  
- **Tests:** `csrf.guard.spec` — **9** PASS  
- **Residual:** operator Gates 0–2 (env + login+CSRF smoke); optional Playwright e2e; auth/CSRF outage copy — [`GO_SPOTS_CSRF.md`](./GO_SPOTS_CSRF.md)  

### §11 Guest tokens

- **Status:** ALREADY FIXED · PARTIAL cutover  
- **Severity:** P1  
- **Evidence:** `guest-token.util.ts`  
- **Residual:** DROP plaintext  

### §12 Owner sessions / 2FA

- **Status:** PARTIALLY CONFIRMED  
- **Severity:** P1  
- **Evidence:** `auth-session.service.ts`, `mfa-totp.util.ts`  
- **Residual:** staff MFA / WebAuthn / require-MFA policy — [`GO_SPOTS_MFA.md`](./GO_SPOTS_MFA.md)  

### §22 Mail outbox / background jobs

- **Status:** PARTIALLY CONFIRMED (ship bar **DONE**; operator proof **OPEN**)  
- **Severity:** P1/P2  
- **Evidence:** `mail-outbox.service.ts`, `mail-outbox.processor.ts`, migration `20260721020000_*`; [`GO_SPOTS_MAIL_OUTBOX.md`](./GO_SPOTS_MAIL_OUTBOX.md)  
- **Shipped:** durable enqueue-on-send; minute worker + GS/MO lock; owner + SUPER_ADMIN dead-letter API/UI  
- **Residual:** prod retry proof (Gates 0–5); outbox alerting; SENT-row retention purge  

### §14 Oversized services

- **Status:** PARTIALLY CONFIRMED  
- **Severity:** P1  
- **Evidence:** extracted finance reports/losses/transactions/shop-orders; `AuthSessionService`  
- **Residual:** play-* + auth remainder + reservations  

### §19 Unified ticket

- **Status:** PARTIALLY CONFIRMED  
- **Severity:** P1  
- **Evidence:** `guest-check` module + settle endpoint  
- **Residual:** settle-as-revenue-root (Option B/C)  

### §27 Privacy docs

- **Status:** PARTIALLY CONFIRMED (module) · **NOT PRESENT** (`docs/privacy/*`)  
- **Severity:** P2  
- **Evidence:** `apps/api/src/modules/gdpr/**`  
- **NEW RELATED:** recreate `docs/privacy/DATA_MAP.md` + `RETENTION_POLICY.md`  

### §35 Performance suite

- **Status:** NOT PRESENT (load tools) · PARTIAL indexes · light smoke **DONE**  
- **Severity:** P2  
- **Evidence:** `perf-smoke.mjs` → `pnpm perf:smoke`; index inventory in [`GO_SPOTS_PERF.md`](./GO_SPOTS_PERF.md)  
- **Residual:** k6/Artillery load; N+1/EXPLAIN audit; pagination pass; CI perf gate — Phases 0–4 in [`GO_SPOTS_PERF.md`](./GO_SPOTS_PERF.md)  

### §36 API error envelope

- **Status:** **PARTIAL** (ship bar **DONE**; OpenAPI + domain codes **residual**)  
- **Severity:** P2  
- **Evidence:** `api-error.util.ts`, `api-error.codes.ts`, `SentryExceptionFilter` → `{code,message,details,requestId}` + `x-request-id`; default codes `VALIDATION_FAILED` … `INTERNAL`  
- **Residual:** domain-specific caller `code`s; OpenAPI error schema; web `code` dual-read — [`GO_SPOTS_API_ENVELOPE.md`](./GO_SPOTS_API_ENVELOPE.md)  

### Live API

- **Status:** NEW RELATED / OPERATOR  
- **Evidence:** Render `x-render-routing: suspend-by-user` — must Resume before smoke  

---

## Newly discovered / reconfirmed gaps (2026-07-22)

1. ~~No unified API error contract (§36)~~ — envelope **shipped**; OpenAPI + domain codes residual [`GO_SPOTS_API_ENVELOPE.md`](./GO_SPOTS_API_ENVELOPE.md)  
2. No `docs/privacy/DATA_MAP.md` / `RETENTION_POLICY.md` (§27 prompt paths)  
3. No k6/Artillery suite (§35)  
4. Full prompt §§ still PARTIAL for service split, settle-root, ledger-primary, Redis SSE, OTel  
5. Production API currently suspended (operator)

See full § matrix in [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md).
