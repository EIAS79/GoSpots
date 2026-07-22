# Bible §§1–40 — operator residual inventory

**As of:** 2026-07-22  
**Source:** [`ORIGINAL_AUDIT_BIBLE.md`](./ORIGINAL_AUDIT_BIBLE.md) (canonical §§1–40 tracker)  
**Purpose:** One row per section — primary status + one-line residual for operators and agents.  
**Verdict:** Ship bars largely met; **§37 production acceptance NOT DONE** until Render resume → smoke → flag soaks.

**Status legend**

| Status | Meaning |
|--------|---------|
| `DONE` | Prompt ship bar met (code + tests or required docs) |
| `PARTIAL` | Core shipped; deeper prompt residual remains |
| `OPERATOR` | Code/docs ready; human deploy, flag flip, or drill still required |
| `NOT_DONE` | Production acceptance or prompt gate not satisfied |
| `DEFERRED` | Explicitly postponed (not abandoned); dependency named |
| `PROCESS` | Meta rule / living doc — not a single feature ticket |

**Honest counts (§§1–40)**

| Status | Count |
|--------|------:|
| DONE | 16 |
| PARTIAL | 20 |
| OPERATOR | 0 *(operator work folded into PARTIAL/DONE residuals)* |
| NOT_DONE | 1 |
| DEFERRED | 0 *(§19 defer called out in PARTIAL residual)* |
| PROCESS | 3 |

**Feature slices §4–§36:** DONE **13** · PARTIAL **20** · NOT_DONE **0**  
**Acceptance:** §37 **NOT_DONE** (Render suspended; smoke blocked; flag soaks not started)

**Operator next:** [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) · [`docs/PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md)

---

## Inventory

| § | Theme | Status | One-line residual |
|---|-------|--------|-------------------|
| 1 | Critical operating rules | PROCESS | Ongoing discipline — verify before change; no reckless rewrites; never `migrate reset`. |
| 2 | Required audit deliverables | DONE | Living docs recreated 2026-07-22; keep DEEP_AUDIT / FIX_PLAN / TEST_MATRIX / MIGRATION_PLAN current. |
| 3 | Repository-wide discovery | DONE | Architecture trace complete; no open discovery ticket. |
| 4 | P0 Monetary correctness | DONE | Residual: intermediate `toMoneyNumber` paths; PATCH money inputs still numeric forms. |
| 5 | P0 Unified financial ledger | PARTIAL | Phase 1–4 on disk, flags default off; Phase 5 ledger-primary freeze + operator Gates 0–7 [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md). |
| 6 | P0 Tenant isolation | DONE | Tier A RLS + `SET LOCAL` plumbing shipped; **`TENANT_RLS` default off** — operator Gates 0–4 [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md). |
| 7 | P0 Reservation/session concurrency | DONE | GiST exclusion + lock util shipped; live Docker C1–C2 runs + optional PlaySession exclusion residual. |
| 8 | P0 Inventory concurrency | DONE | Claim-before-delete/cancel shipped; no open stock-race ticket. |
| 9 | P0 Webhook idempotency | DONE | Ship bar met — **no code residual**; operator Gates 0–2 — [`GO_SPOTS_WEBHOOK_IDEMPOTENCY.md`](./GO_SPOTS_WEBHOOK_IDEMPOTENCY.md). **§9 ≠ guest contact** (§11 tokens · §19 unified ticket · §28 public abuse). |
| 10 | P0/P1 CSRF + cookies | DONE | Code ship bar **DONE** (guard + cookies + web wiring); operator Gates 0–2 smoke + optional e2e/outage UX **residual** [`GO_SPOTS_CSRF.md`](./GO_SPOTS_CSRF.md). |
| 11 | P1 Guest token security | DONE | Hash + expiry + clear CLI shipped; operator Clear→DROP + contract DROP — **no DROP migration on disk** [`GO_SPOTS_GUEST_TOKEN.md`](./GO_SPOTS_GUEST_TOKEN.md). |
| 12 | P1 Owner account protection | PARTIAL | Owner TOTP + sessions + login challenge **DONE**; elevated staff MFA Phase 1 **DONE** (flag default off); operator Phase 0 migrate + Phase 1 flag flip **OPERATOR**; WebAuthn + org require-MFA + plain-staff MFA **residual** [`GO_SPOTS_MFA.md`](./GO_SPOTS_MFA.md). |
| 13 | P1 Dashboard URL secret | DONE | Slug-only bind + hash dual-write shipped; operator soak → stop dual-write → DROP — **no clear CLI / no DROP migration** [`GO_SPOTS_DASHBOARD_KEY.md`](./GO_SPOTS_DASHBOARD_KEY.md). |
| 14 | P1 Oversized service refactoring | DONE | Finance/auth/reservations facades complete; login/register/activate/`issueTokens` on `AuthService` **by design** [`GO_SPOTS_SERVICE_SPLIT.md`](./GO_SPOTS_SERVICE_SPLIT.md). |
| 15 | P1 Subscription/entitlement consolidation | DONE | Pack-only `resolveModules` + backfill CLI shipped; optional DROP `Subscription.tier` after soak — **no DROP migration** [`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md). |
| 16 | P1 Normalize CSV permissions/add-ons | DONE | Rows SoT + DROP migration **on disk**; operator Gates 0–6 expand → pre-DROP app gate → Neon DROP → post-DROP verify [`GO_SPOTS_CSV_CUTOVER.md`](./GO_SPOTS_CSV_CUTOVER.md) ([`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md): **18/18 applied 2026-07-21**). |
| 17 | P1 Resource/dining consolidate | PARTIAL | Phase 0–2 Option C + dual-write **DONE**; web floor/book already Resource-only; orphan `seating-tables-client.ts` (no UI); **`RES17-ui-cutover`** advisory panel + API guardrails + Phase 4 DROP **open** — **no DROP migration** [`GO_SPOTS_RESOURCE_MODEL_MERGE.md`](./GO_SPOTS_RESOURCE_MODEL_MERGE.md) §4.3–4.4. |
| 18 | P1 Unstable JSON business config | DONE | `offeringConfig` version + validators shipped; optional relational rate tables deferred. |
| 19 | P1 Unified customer ticket | PARTIAL | Phase 3a settle gate **DONE**; Option B/C settle-as-revenue-root **DEFERRED** post–ledger soak [`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md). |
| 20 | P1 Currency-change safety | PARTIAL | Preview + confirm apply + M6 stamps **DONE**; operator Gates 0–4 + nullable stamp contract + optional report-currency FX [`GO_SPOTS_CURRENCY_STAMPS.md`](./GO_SPOTS_CURRENCY_STAMPS.md). |
| 21 | P1 Timezone/scheduling | PARTIAL | Ship bar **DONE**; web `venue-timezone` + staff sessions/finance/event-requests/dining/resources + public gaming/dining schedule defaults + secondary public booking/floor-map + public event form **PARTIAL**; `formatDate(..., timeZone?)` on notifications/overview **PARTIAL**; Neon migrate OPEN; bulk `toLocale*` **residual** [`GO_SPOTS_TIMEZONE.md`](./GO_SPOTS_TIMEZONE.md). |
| 22 | P1/P2 Email + background jobs | PARTIAL | Outbox + SENT retention cron **DONE** (env-gated); prod retry proof + depth alerting **open** [`GO_SPOTS_MAIL_OUTBOX.md`](./GO_SPOTS_MAIL_OUTBOX.md). |
| 23 | P2 Real-time ops | PARTIAL | In-process notifications SSE + poll fallback **DONE**; Redis/PG NOTIFY multi-instance + floor/chat SSE **open** [`GO_SPOTS_REALTIME.md`](./GO_SPOTS_REALTIME.md). |
| 24 | P2 Observability | PARTIAL | Logs + request interceptor + optional Sentry 5xx + health **DONE**; opt-in `/metrics` stub **PARTIAL** (Lane **OBS24-metrics-phase**); OTel SDK, API tracing, web Sentry, alerts **open** [`GO_SPOTS_OBSERVABILITY.md`](./GO_SPOTS_OBSERVABILITY.md). |
| 25 | P2 Backup/DR docs | PARTIAL | Runbook + Neon 6h PITR recorded **DONE**; **PITR restore drill never executed** (`_never_` / `_TBD_`) [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md). |
| 26 | P2 Upload security | PARTIAL | Phase 0–1 harden + legacy CLIs + `LEGACY_UPLOADS_STATIC` gate **DONE**; operator cutover Gates 0–5 + private/signed GET + AV **open** [`GO_SPOTS_UPLOAD_SECURITY.md`](./GO_SPOTS_UPLOAD_SECURITY.md). |
| 27 | P2 Privacy/GDPR | PARTIAL | GDPR module + DATA_MAP + RETENTION_POLICY **DONE**; counsel-aligned public policy + automated retention soak **open**. |
| 28 | P2 Abuse protection | PARTIAL | Throttles + verify + widget + in-memory 429 escalation **DONE**; live CAPTCHA enable + Redis multi-instance store **open** [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md). |
| 29 | P2 Accessibility | PARTIAL | 13-route public axe smoke **DONE**; dashboard axe, focus trap, contrast, hard CI gate **open** [`GO_SPOTS_A11Y.md`](./GO_SPOTS_A11Y.md). |
| 30 | P2 Internationalization | PARTIAL | en/pl product UI ship bar **DONE**; secondary locale ops parity, API/email/legal English, `i18n:check` not CI-gated [`GO_SPOTS_I18N.md`](./GO_SPOTS_I18N.md). |
| 31 | Product-focus cleanup | PARTIAL | Phase A commercial UX + owner/guest split + marketplace landing **DONE**; Phase B–D sidebar/ops + operator S1–S4 / M4–M5 **open** [`GO_SPOTS_PRODUCT_FOCUS.md`](./GO_SPOTS_PRODUCT_FOCUS.md). |
| 32 | Onboarding | PARTIAL | Web wizard + apply-template API + web delegation **DONE** (no schema); server progress **Phase 1 plan ticket** (SQL/DTO/web sync — **no columns on disk**); implement lane **`ONBOARD32-phase1-implement`**; mixed dining seed + sidebar **residual** [`GO_SPOTS_ONBOARDING.md`](./GO_SPOTS_ONBOARDING.md). |
| 33 | Offline / degraded | PARTIAL | Modes A–C/F connectivity UX + fail-closed booking **DONE**; Mode E toasts, floor timestamps, offline queue/PWA **open** [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md). |
| 34 | Test coverage | PARTIAL | ~**105** API Jest specs + CI api/migrate/web + opt-in concurrency (gate + C1–C3 bodies) + Playwright smokes **DONE**; full e2e matrix, web unit tests, hard `next build`/eslint/`i18n:check` CI **open** — Phases 0–4 [`GO_SPOTS_TEST_MATRIX.md`](./GO_SPOTS_TEST_MATRIX.md). |
| 35 | Performance review | PARTIAL | Smoke + Phase 0 inventory + Phase 3 caps + Phase 1 k6 read stub **DONE** (0 HIGH left in inventory); staff read mix + SQL day-bucket aggregation + CI perf gate **open** [`GO_SPOTS_PERF.md`](./GO_SPOTS_PERF.md). |
| 36 | API consistency | PARTIAL | Envelope + OpenAPI 0–2 + booking/CAPTCHA/CSRF/MFA/guest/stock domain codes + web W2 samples **PARTIAL**; SESSION_REVOKED/permission codes + broader W2 **open** [`GO_SPOTS_API_ENVELOPE.md`](./GO_SPOTS_API_ENVELOPE.md). |
| 37 | Final acceptance gates | NOT_DONE | Render **suspended**; manual smoke **blocked**; `TENANT_RLS` / `LEDGER_*` off; flag soaks **not started** — [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) §4. |
| 38 | Final implementation report | DONE | Living [`GO_SPOTS_IMPLEMENTATION_REPORT.md`](./GO_SPOTS_IMPLEMENTATION_REPORT.md) — do not claim prompt complete. |
| 39 | Final execution order | PROCESS | Remaining work prioritized in [`GO_SPOTS_FIX_PLAN.md`](./GO_SPOTS_FIX_PLAN.md); follow fix-plan order. |
| 40 | Final behavior instruction | PROCESS | Verify → fix confirmed → test → document; never mark DONE without callers/migrations/tests aligned. |

---

## Operator flag checklist (post-smoke)

| Flag / action | § | When |
|---------------|---|------|
| Resume Render API | §37 | Before any prod smoke |
| `TENANT_RLS=on` | §6 | After migrate + smoke — Gates 0–4 |
| `LEDGER_DUAL_WRITE=on` → backfill → `LEDGER_READS=on` | §5 | After ledger migrate + smoke — Gates 0–7 |
| `CAPTCHA_PROVIDER` + site keys | §28 | When secrets set — Gates 0–4 |
| `LEGACY_UPLOADS_STATIC=false` | §26 | When legacy inventory = 0 |
| `pnpm run clear:guest-plaintext --apply` | §11 | After guest-token smoke |
| Neon PITR restore drill | §25 | Non-blocker; record date in DR doc |

---

## Evidence index (by §)

| § | Primary evidence doc |
|---|----------------------|
| 4 | [`GO_SPOTS_MONEY_WIRE.md`](./GO_SPOTS_MONEY_WIRE.md) |
| 5 | [`GO_SPOTS_LEDGER.md`](./GO_SPOTS_LEDGER.md) |
| 6 | [`GO_SPOTS_RLS.md`](./GO_SPOTS_RLS.md) |
| 7 | [`GO_SPOTS_CONCURRENCY_TESTS.md`](./GO_SPOTS_CONCURRENCY_TESTS.md) |
| 9 | [`GO_SPOTS_WEBHOOK_IDEMPOTENCY.md`](./GO_SPOTS_WEBHOOK_IDEMPOTENCY.md) · [`DEPLOY_CHECKLIST.md`](./DEPLOY_CHECKLIST.md) |
| 11 | [`GO_SPOTS_GUEST_TOKEN.md`](./GO_SPOTS_GUEST_TOKEN.md) |
| 12 | [`GO_SPOTS_MFA.md`](./GO_SPOTS_MFA.md) · [`GO_SPOTS_2FA.md`](./GO_SPOTS_2FA.md) |
| 13 | [`GO_SPOTS_DASHBOARD_KEY.md`](./GO_SPOTS_DASHBOARD_KEY.md) |
| 14 | [`GO_SPOTS_SERVICE_SPLIT.md`](./GO_SPOTS_SERVICE_SPLIT.md) |
| 15 | [`GO_SPOTS_PACK_TIER.md`](./GO_SPOTS_PACK_TIER.md) |
| 17 | [`GO_SPOTS_RESOURCE_MODEL_MERGE.md`](./GO_SPOTS_RESOURCE_MODEL_MERGE.md) |
| 19 | [`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md) |
| 20 | [`GO_SPOTS_CURRENCY_STAMPS.md`](./GO_SPOTS_CURRENCY_STAMPS.md) |
| 22 | [`GO_SPOTS_MAIL_OUTBOX.md`](./GO_SPOTS_MAIL_OUTBOX.md) |
| 23 | [`GO_SPOTS_REALTIME.md`](./GO_SPOTS_REALTIME.md) |
| 24 | [`GO_SPOTS_OBSERVABILITY.md`](./GO_SPOTS_OBSERVABILITY.md) |
| 25 | [`DISASTER_RECOVERY.md`](../operations/DISASTER_RECOVERY.md) |
| 26 | [`GO_SPOTS_UPLOAD_SECURITY.md`](./GO_SPOTS_UPLOAD_SECURITY.md) |
| 27 | [`DATA_MAP.md`](../privacy/DATA_MAP.md) · [`RETENTION_POLICY.md`](../privacy/RETENTION_POLICY.md) |
| 28 | [`GO_SPOTS_PUBLIC_ABUSE.md`](./GO_SPOTS_PUBLIC_ABUSE.md) |
| 29 | [`GO_SPOTS_A11Y.md`](./GO_SPOTS_A11Y.md) |
| 30 | [`GO_SPOTS_I18N.md`](./GO_SPOTS_I18N.md) |
| 31 | [`GO_SPOTS_PRODUCT_FOCUS.md`](./GO_SPOTS_PRODUCT_FOCUS.md) · [`GO_SPOTS_MARKETPLACE.md`](./GO_SPOTS_MARKETPLACE.md) |
| 32 | [`GO_SPOTS_ONBOARDING.md`](./GO_SPOTS_ONBOARDING.md) |
| 33 | [`GO_SPOTS_OFFLINE.md`](./GO_SPOTS_OFFLINE.md) |
| 35 | [`GO_SPOTS_PERF.md`](./GO_SPOTS_PERF.md) |
| 36 | [`GO_SPOTS_API_ENVELOPE.md`](./GO_SPOTS_API_ENVELOPE.md) |
