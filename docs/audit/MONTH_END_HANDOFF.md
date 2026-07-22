# Month-end handoff (2026-07-22)

**Credits pause:** Agent chaining stopped (Cursor usage limit). Resume next month after recharge.

## Verdict — is the site “ready”?

**Code ship bars: yes (strong).** Nest build + web typecheck **PASS**. Agent board **clear**.

**Production acceptance (§37): not yet.** Live API probe still returns **503** `x-render-routing: suspend-by-user`. Until you **Resume Render**, nothing end-to-end works (login, book, proxy).

## You (operator) — do these first after resume

1. **Resume** Render service `gospots-api` → wait healthy  
2. Smoke: `/api/v1/live` + `/api/v1/ready` (direct + `https://www.gospots.eu/api/v1/ready`)  
3. Login + CSRF + one public book + guest status link  
4. Keep flags **off** until soak: `TENANT_RLS`, `LEDGER_DUAL_WRITE`, `LEDGER_READS`  
5. Optional: `STAFF_MFA_OPT_IN` / `NEXT_PUBLIC_STAFF_MFA_OPT_IN` only after MFA migrate confirmed on Neon  

Full checklist: [`WHAT_TO_DO_NOW.md`](./WHAT_TO_DO_NOW.md) · [`docs/PRODUCTION_STATUS.md`](../PRODUCTION_STATUS.md)

## Safe defaults already on disk

| Item | State |
|------|--------|
| Neon migrate 18 folders | Applied |
| Host env / domains | Set |
| CSRF / cookies / throttles | Prod-safe defaults |
| Ledger / RLS | Off until soak |
| Staff MFA | Behind `STAFF_MFA_OPT_IN` (default off) |
| Metrics | `METRICS_ENDPOINT` default off; optional `METRICS_BEARER_TOKEN` |

## Next month (code residuals — not ship blockers)

Priority order when credits return:

1. `ONBOARD32-phase1-implement` — `Shop.onboardingCompletedAt` + progress API (ticket in [`GO_SPOTS_ONBOARDING.md`](./GO_SPOTS_ONBOARDING.md))  
2. Mixed dining seed (Phase 3)  
3. Web Sentry (`@sentry/nextjs`) opt-in  
4. Guest-token strings → `public-i18n`  
5. §37 soaks after smoke (RLS → ledger)  
6. PITR restore drill (`DISASTER_RECOVERY.md` still `_never_`)  

Inventory: [`BIBLE_RESIDUAL_INVENTORY.md`](./BIBLE_RESIDUAL_INVENTORY.md)

## Do not claim

Do **not** mark the full §§1–40 bible **DONE** until §37 smoke + soaks complete. Ship bars ≠ production acceptance.
