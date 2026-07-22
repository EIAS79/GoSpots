# Locora — Guided venue onboarding

**Date:** 2026-07-21  
**Status:** **DONE** (web ship bar) — guided wizard + templates/checklist over existing APIs.  
**Bible:** P2 **#31**  
**Lane:** **LLLLLL-onboarding-wizard**

---

## Ship bar (what landed)

| Piece | Implementation |
|-------|----------------|
| Route | `/dashboard/[venuePath]/onboarding` |
| Progress | `localStorage` (`locora.onboarding.v1.{slug}`) — resume banner until finish/dismiss |
| Templates | Five declarative seeds in `onboarding-templates.ts`; apply via `createResourceCategory` + `syncVenueCategories` (no new API) |
| Steps 1–10 | Details, TZ/currency, hours, template, categories, resources, pricing, test play-session, staff invite, public preview/checklist |
| Entry | Register + create-venue → onboarding; owner resume banner in tenant shell |
| i18n | `onboarding.*` en/pl |

**Explicitly not in this ship bar:** schema columns (`onboardingCompletedAt`), `POST /shop/onboarding/apply-template`, Neon, dining table-group auto-seed in mixed template.

---

## Problem (bible #31)

Venue owners must discover and configure many unrelated dashboard areas before the product feels “live.” There was no single path from signup → bookable/visible venue.

**Required fix:** guided templates + staged onboarding (10 steps + five templates).

---

## Architecture

```
[Register / create venue] --> [/onboarding wizard]
                                    |
         +--------------------------+--------------------------+
         |              |           |            |             |
   shop settings    hours API   resources CRUD  staff invite  play-session
   venue-categories             (template seed)
```

Wizard is a thin orchestrator — no monolithic onboarding service.

---

## Five templates

`billiard_hall` · `console_lounge` · `pc_cafe` · `bowling_center` · `mixed_activity`  
(See `apps/web/src/lib/onboarding-templates.ts`.)

---

## Residuals

- Server progress persistence / multi-device resume  
- Dedicated idempotent apply-template API  
- Mixed template dining table groups via dining section APIs  
- #33 Phase B sidebar F&B polish  

---

## Verify

- `pnpm --filter @gospots/web run i18n:check` — dashboard **1953**/1953, public **1003**/1003  
- `pnpm --filter @gospots/web run typecheck` — PASS  
