# Phase 16 production security review

Source: GoSpots Master Product & Engineering Execution Plan v2 — Phase 16.3 and 16.4.

This review records the production controls that must remain true. It is not a substitute for the blocking CI security/dependency gates.

## Review matrix

| Area | Control / evidence | Phase 16 disposition |
|---|---|---|
| Authentication | JWT/cookie auth module; lockout/backoff state on `User`; auth tests in normal API CI | VERIFIED BY CI |
| Cookies/tokens | secure-cookie settings are environment-controlled; production secret boot assertions reject weak/missing critical secrets | VERIFIED BY SOURCE + CI |
| CSRF | state-changing cookie-auth requests use the existing CSRF double-submit contract; browser E2E mutations exercise it | VERIFIED BY E2E |
| CORS | `main.ts` resolves an explicit origin allowlist; arbitrary origin reflection is not used | VERIFIED BY SOURCE |
| Security headers | API uses Helmet; production HSTS enabled; JSON API CSP intentionally delegated to the web app | VERIFIED BY SOURCE |
| Rate limiting / brute force | global throttling plus auth lockout/backoff; `THROTTLE_DISABLED` is test-only configuration | VERIFIED BY TESTS/CONFIG |
| Secret management | production boot secret assertions; secrets must remain in Render/Vercel/provider secret stores, never repository/database | VERIFIED BY SOURCE/OPS |
| Permission matrix | `PERMISSIONS` + server guards/capability checks; normal API permission/tenant suites remain blocking | VERIFIED BY CI |
| Support/admin access | system/admin actions are permissioned and audited; no Phase 16 bypass added | VERIFIED BY EXISTING DOMAIN TESTS |
| Tenant isolation / IDOR | tenant/shop derives from authenticated context across domain services; cross-tenant suites remain blocking | VERIFIED BY CI/E2E |
| Public booking abuse | public growth policy includes throttling/validation boundaries; `growth-public-policy.spec.ts` and auth-boundary test are in Phase 16 validation | BLOCKING P16 TEST |
| Webhook verification/replay | Stripe/reservation routing signature/raw-body boundary + durable idempotency; duplicate/replay tests remain blocking | BLOCKING P16 TEST |
| File upload/media | new media uses `StoredImage`; legacy static `/uploads` is explicitly gated by `LEGACY_UPLOADS_STATIC` and disabled in CI. Directory indexes are disabled | VERIFIED BY SOURCE; keep legacy gate off unless migration requires it |
| Device credentials | device/terminal ownership and readiness are venue-scoped; secret material must not be logged | VERIFIED BY EXISTING DEVICE TESTS |
| Edge pairing/signing | Phase 12 signed envelope/device identity and replay protections remain blocking in Edge CI | VERIFIED BY EDGE CI |
| SQL/ORM scoping | Prisma service/domain tenant scoping; raw SQL added in Phase 16 is aggregate-only and returns no tenant/customer fields | REVIEWED |
| Audit integrity | high-risk domain mutations use existing audit mechanisms; Phase 16 does not introduce an unaudited mutation | REVIEWED |
| Dependency advisories | `pnpm audit --prod --audit-level high` is a blocking Phase 16 job | BLOCKING P16 TEST |

## Fraud / abuse controls

Existing financial/operational controls remain authoritative:

- discount/price override and refund permissions/approval thresholds;
- stored-value ledger + idempotency rather than direct balance mutation;
- duplicate ticket/access scan rejection;
- request/API throttles;
- login failure lockout/backoff;
- cash movements and manual drawer/high-risk actions are attributed/audited;
- payment `UNKNOWN` is reconciled rather than retried blindly.

Phase 16 adds visibility for login failures/lockouts and unresolved payment/provider failures; it does not weaken or duplicate the canonical financial permission model.

## Secrets and logs

Never log or persist in operational diagnostics:

- `Authorization` bearer tokens;
- cookie values;
- CSRF values;
- API keys or webhook secrets;
- payment card data;
- raw provider payloads containing credentials;
- customer identifiers as Prometheus labels.

`RequestLoggingInterceptor` strips query strings and redacts known token/secret patterns. Prometheus path labels replace identifier-like segments with `:id`.

## Release gate

Phase 16 may not merge if:

1. high/critical production dependency advisories remain unresolved without an explicit, evidence-backed exception;
2. normal permission/tenant/browser CI is not green on the exact head;
3. Phase 16 public-auth/webhook/privacy/fault tests fail;
4. the metrics collector reports errors;
5. a critical/high security defect discovered during this review remains open.
