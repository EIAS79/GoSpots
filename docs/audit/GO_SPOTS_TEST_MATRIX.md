# GoSpots / Locora — Test Matrix (Phase 1)

Based on **real modules** under `apps/api/src/modules/*` and current suite inventory.

## 1. Current test suite (inspected)

| Location | What exists |
|----------|-------------|
| `apps/api/src/app.controller.spec.ts` | Unit: root API metadata |
| `apps/api/src/common/venue-packs.spec.ts` | Unit: add-on modules + prices |
| `apps/api/test/app.e2e-spec.ts` | E2E: `GET /api/v1`, `GET /api/v1/health` only |
| `apps/api/package.json` | Jest unit (`test`), e2e (`test:e2e`) |
| `apps/web/package.json` | **No** `test` script; no Playwright/Vitest/Jest config found |
| CI | **No** `.github/workflows` |

**Commands for later phases:**

- `pnpm --filter @gospots/api test`
- `pnpm --filter @gospots/api test:e2e`
- `pnpm --filter @gospots/api test:cov`
- Root: `pnpm lint`, `pnpm build`

---

## 2. Expanded matrix

Legend: **U** = Unit, **I** = Integration (API + DB), **E** = E2E (browser or full HTTP), **C** = Concurrency / race

| Domain / workflow | Module(s) | U | I | E | C | Notes / gap |
|-------------------|-----------|---|---|---|---|-------------|
| Health / bootstrap | health, app | ✓ exists | ✓ smoke | — | — | Only covered area today |
| Venue packs / pricing catalog | `venue-packs`, `subscription-tier` | ✓ partial | Need | — | — | Expand matrix for every pack×add-on→modules |
| Register owner + trial sub | auth | Need | Need | Need | — | Creates Shop+Subscription+Membership |
| Login / lockout | auth | Need | Need | Need | — | failedLogins / lockedUntil |
| Refresh rotation | auth | ✓ unit | Need | — | ✓ reuse→family | Rotate + reuse family revoke |
| Staff activate / invite | auth, staff | ✓ unit | Need | Need | ✓ consume race | Hash+TTL; seat assert; dual-write perms |
| Owner password reset | auth, mail | Need | Need | — | — | Hash + expiry |
| Bind dashboard path | auth, venue-context | Need | Need | Need | — | Wrong key / no membership |
| Staff CRUD + seats | staff, billing seats | Need | Need | — | — | seat limits vs pack |
| Menu CRUD + stock baseline | menu | Need | Need | — | — | |
| Menu stock decrement | menu-stock-db, finance | Need | Need | — | **Need** | Last-unit race |
| Quick sale Transaction | finance | Need | Need | — | **Need** | create-before-stock bug |
| Shop order lifecycle | finance | Need | Need | Need | Need | pending→complete→cancel + stock |
| Finance analytics totals | finance-analytics | Need | Need | — | — | Multi-source sum fixtures |
| Play walk-in start/pay | finance | Need | Need | Need | Need | Overlap with reservation |
| Reservation billing pay | finance, reservations | Need | Need | — | — | billedAmount path |
| Resource categories / rates | resources | Need | Need | — | — | |
| offeringConfig validation | resources, bowling-modes | Need | Need | — | — | Reject garbage JSON |
| Gaming / dining layout | resources | Need | Need | Need | — | DiningTableGroup |
| Seating table groups | seating-tables | Need | Need | — | — | Dual model |
| Public gaming book | reservations, public | Need | Need | **Need** | **Need** | Overlap race P0 |
| Public dining book | reservations, public | Need | Need | Need | Need | |
| Guest status / cancel by token | reservations | Need | Need | Need | — | Token hash/expiry later |
| Event requests | event-requests | Need | Need | Need | — | |
| Auto no-show / complete cron | reservation-reminders | Need | Need | — | Need | Multi-instance |
| Opening hours / exceptions | hours | Need | Need | — | — | |
| Gallery / media serve | gallery, media | Need | Need | — | — | Cross-tenant media policy |
| Shop settings + currency change | shop, currency-rates | Need | Need | — | Need | Atomic reprice |
| Subscription pack change | dashboard | Need | Need | Need | — | Trial vs pending paid |
| Lemon checkout start | billing | Need | Need* | — | — | *mock Lemon client |
| Lemon webhook signature | billing | Need | Need | — | — | |
| Lemon webhook idempotency | billing | Need | Need | — | Need | Replay |
| Notifications dedupe | notifications | Need | Need | — | Need | Unique constraint |
| Audit write | audit | Need | Need | — | — | |
| Guest chat token access | guest-chat | Need | Need | Need | — | |
| Reviews / contact | guest | Need | Need | Need | — | Throttle |
| Public venue browse | shop, public, web | — | Need | Need | — | |
| Tenant shell nav / feature locks | web + dashboard | — | — | Need | — | No web tests today |
| i18n smoke | web | — | — | Need | — | Locale switch |
| a11y smoke | web | — | — | Need | — | Critical dialogs |
| Abuse throttle | auth, public | — | Need | — | Need | |

✓ = already present (minimal). “Need” = gap vs risk.

---

## 3. Highest-priority tests to add (ordered)

1. **C+I:** Parallel public booking same `resourceId`+slot → exactly one success  
2. **C+I:** Parallel stock sale of last unit → no negative stock; no orphan SALE without decrement  
3. **I:** Webhook invalid signature rejected; valid replay no double apply (after idempotency)  
4. **I:** Cross-tenant order/reservation update by id → 404/403  
5. **U:** Money util rounding / FX convertAmount  
6. **I:** Analytics fixture: order-only vs tx-only vs both (detect double count)  
7. **E:** Login → bind venue → create order (Playwright)  
8. **E:** Public book → status page → cancel  

---

## 4. Gaps summary

| Gap | Severity |
|-----|----------|
| Almost no domain tests beyond health + pack prices | P0 for quality gate |
| Zero concurrency tests | P0 given race findings |
| Zero web/E2E product tests | P1 |
| No CI to run tests on PR | P1 |
| No webhook / finance / auth integration tests | P0–P1 |
| No mail mock contract tests | P2 |

---

## 5. Suggested tooling (later phases)

- API: keep Jest + Supertest; add testcontainers or Neon branch DB for integration  
- Concurrency: Jest workers hitting shared Postgres, or `async` parallel `Promise.all` against real API  
- Web: Playwright against `pnpm dev` or preview; start with 3 smokes  
- CI: `pnpm lint` + `pnpm --filter @gospots/api test` + e2e with service containers  

**Do not** use `prisma migrate reset` in CI against shared/prod databases; use ephemeral DB per job.
