# Locora — City-first marketplace launch

**Date:** 2026-07-21  
**Status:** **DONE** (Phase A ship bar) — city landing + in-repo GTM checklist. Live pilot cohort execution = residual.  
**Bible:** P3 **#35** — the public marketplace should come **after** venue supply; do not lead with guest discovery before a city has enough listed venues.  
**Ship timing:** Phase A product surfaces shipped **2026-07-21** (Lane **MMMMMM**). Operator S0–S4 execution remains residual (no fake “DONE” for live cohort).

---

## Phase A ship bar (honest DONE)

| Deliverable | Status |
|-------------|--------|
| Pilot city config (`pilot-cities.ts`) — Wrocław | Shipped |
| City landing `/venues/wroclaw` (en/pl) | Shipped |
| `/for-venues` + `/` “Join the city directory” CTA | Shipped |
| `/venues` empty-state + pilot hint → city landing | Shipped |
| In-repo operator checklist | [`MARKETPLACE_GTM_CHECKLIST.md`](./MARKETPLACE_GTM_CHECKLIST.md) |
| Live S1–S4 cohort / paid promo / entitlement split | **Residual** (operator + later phases) |

**Not required for Phase A DONE:** executing the pilot cohort, hitting S2 density, national guest ads, or M4–M5 product (admin cohort, free-directory entitlement split).

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Now (Phase A shipped)** | Use `/venues/wroclaw` + checklist for **supply** outreach. Keep national guest acquisition off. `/venues` stays secondary until S2. |
| **After S2 density gate** | Local guest traffic (S3) then light promo (S4). Pair with owner/guest split ([#34](./BIBLE_STATUS.md)) and onboarding ([#31](./GO_SPOTS_ONBOARDING.md)). |

**Why supply-first:** An empty or thin `/venues` page damages trust. Order is **supply → directory density → local guest traffic → promo**.

---

## Problem (bible #35)

Locora ships a capable **guest discovery surface** (`/venues`, public venue pages, search by city/category) while **go-to-market treats it like the product headline**. That inverts the chicken-and-egg:

- Guests who land on `/venues` in a sparse city see **one or zero** results → bounce → no booking loop.
- Owners who sign up for “get discovered” churn when **no local traffic** exists yet.
- Marketing spend on guest acquisition **before** ~15–25 credible profiles in a city wastes budget and sets false expectations.

**Required fix (bible):** adopt a **city-first, supply-first launch plan**:

1. Pick **one pilot city** (or metro).  
2. **Manually onboard** venues (white-glove or founder-led).  
3. Ship **free or trial public profiles** so directory fills without paywall friction.  
4. Drive **local traffic** only when the city page looks alive.  
5. Then run **promo** (events, partnerships, light paid) with proof of supply.

---

## What exists today (product surface)

### Guest marketplace (`/venues`)

| Piece | Behavior |
|-------|----------|
| Route | `apps/web/src/app/venues/page.tsx` → `VenuesDiscovery` |
| City landing | `apps/web/src/app/venues/[citySlug]/page.tsx` → `CityLanding` (pilot: `wroclaw`) |
| API | `GET /public/venues` → `ShopService.listPublicVenues` |
| Filters | Text `q`, `city`, `country`, category tags; facet lists from published rows |
| Sort | Country → city → name ascending |
| UX | Grid/list, open-status from hours + today’s schedule exceptions, locale/currency switcher |

**Inclusion rules (both required for directory listing):**

| Flag | Meaning |
|------|---------|
| `isPublished` | Public venue page `/venue/[slug]` is live |
| `advertiseOnVenuesPage` | Venue appears on `/venues` browse |

Both toggles require the **`marketing`** module / `venue_presence` add-on (`assertShopHasFeature(..., 'marketing')` on write).

### Owner publish path

| Step | Where | Gate |
|------|-------|------|
| Register | Collects shop name, slug, **city**, **country** | Creates `Shop` + 90-day trial subscription |
| Configure | Hours, resources, cover, description | Core modules |
| Publish | Shop settings → Publish + “List on venues page” | **Marketing** entitlement |
| Preview | `/venue/[slug]` | Works when published |

Onboarding design ([#31](./GO_SPOTS_ONBOARDING.md)) step 10 already states: directory listing requires **publish + city** — this GTM doc defines **when** to ask owners to flip those toggles.

### Related surfaces (not the same as marketplace GTM)

| Surface | Audience | Notes |
|---------|----------|-------|
| `/` landing | Owners (+ pilot CTA) | #34 primary story + Phase A pilot strip |
| `/for-venues` | Owners | Acquisition — leads supply narrative + pilot CTA |
| `/venues/wroclaw` | Mixed | City SEO / launch page; CTAs for owners + browse |
| `/venue/[slug]` | Guests | Per-venue SEO; valuable even pre-directory density |
| Dashboard | Owners | Ops — not discovery |

---

## City-first launch model

### Pilot city selection

Pick **one** city to “win” before expanding. Criteria (score qualitatively):

| Criterion | Why it matters |
|-----------|----------------|
| Founder/operator access | Can visit venues, run onboarding calls, collect cover photos |
| Venue density potential | Billiard halls, PC cafés, console lounges, bowling — at least **20** reachable leads |
| Single timezone + currency | Simplifies hours, finance demos, support |
| Local community hooks | Discord/Facebook groups, esports nights, student traffic |
| No multi-city SEO yet | Avoid diluting crawl budget across empty city pages |

**Documented choice:** **Wrocław, PL** — see checklist + `pilot-cities.ts`.

### Supply phases (operator playbook)

These phases are **mostly manual**. Track checkboxes in [`MARKETPLACE_GTM_CHECKLIST.md`](./MARKETPLACE_GTM_CHECKLIST.md).

#### Phase S0 — Foundation (pre-launch, no guest promo)

| Action | Owner | Exit |
|--------|-------|------|
| Identify 20–40 target venues in pilot city | Operator | CRM sheet: name, contact, category, status |
| Fix onboarding blockers from Friday submit | Eng | Register → settings → publish path works in prod |
| Prepare white-glove checklist | Operator | Hours, slug, cover, 1-line description, category tag |

**Do not** link paid ads to `/venues` yet.

#### Phase S1 — Manual onboard (target: 10 live profiles)

| Action | Detail |
|--------|--------|
| Founder-led signup or assisted register | Use real city/country; correct slug |
| Configure minimum viable public page | Name, cover, hours, **one** bookable or visible resource category |
| Enable publish | Grant **`marketing`** on trial or comp `venue_presence` for pilot cohort — see **Free profiles** below |
| QA | Venue appears on `/venues?city=…` and `/venue/[slug]` loads |

**Quality bar per profile:** cover image, non-empty description, accurate hours, correct city — **no ghost listings**.

#### Phase S2 — Directory density (target: 15–25 listed)

| Action | Detail |
|--------|--------|
| Continue outreach | Referrals from first venues (“list your neighbors”) |
| Category mix | Aim for 2+ venues per top category tag in city facets |
| Spot-check search | `city` filter returns a full grid; facets show pilot city prominently |

**Gate before guest promo:** `/venues?city=<pilot>` shows **≥15** venues meeting quality bar **or** ≥10 with booking enabled on ≥5.

#### Phase S3 — Local guest traffic (organic first)

| Channel | Tactic |
|---------|--------|
| Venue co-marketing | Each profile links to Locora city page; QR on desk |
| Local communities | Post in city gaming groups **only after** directory looks alive |
| Per-venue SEO | `/venue/[slug]` pages indexed; structured data later |
| Events | Partner one venue for a launch night → status/booking demo |

Still **no** broad national campaigns.

#### Phase S4 — Promo (paid / partnership)

| Tactic | When |
|--------|------|
| Light paid social geo-fenced to pilot city | After S2 gate |
| Local influencer / streamer | After booking path proven |
| City landing page SEO | Phase A route `/venues/<citySlug>` already shipped; amplify after S2 |

Measure **guest → booking started → completed** — not signups alone.

---

## Free profiles strategy (supply friction)

Today, **`marketing` / `venue_presence` is a paid add-on** (~$10/mo in pack config). For city-first supply, **paywall-before-listing fights the bible**.

| Approach | Pros | Cons |
|----------|------|------|
| **A. Comp pilot cohort** | No code; operator toggles subscription/add-on in admin/DB | Manual; doesn’t scale |
| **B. Trial includes `venue_presence`** | Register already has 90-day trial — ensure trial tier grants marketing for pilot window | Billing policy decision |
| **C. “Directory free, premium marketing later”** | Product change: list on `/venues` without add-on; keep reviews/gallery upsell paid | Requires entitlement split post-Friday |

**Recommendation for first pilot:** **A + B** — use trial/marketing grant for onboarded venues; document comp list. **Defer C** until second city unless conversion data shows publish wall blocks S1.

**Non-goal for Phase A:** rewriting billing or `assertShopHasFeature` for marketing.

---

## Metrics and gates

### Supply metrics (weekly in pilot city)

| Metric | Target (S2 gate) |
|--------|------------------|
| Published + advertised venues | ≥15 |
| With cover + description | 100% of listed |
| With bookable resource or clear “call to book” | ≥50% |
| Owner activation (logged in last 7d) | ≥40% of listed |

### Demand metrics (only after S2)

| Metric | Notes |
|--------|-------|
| `/venues` sessions with `city=` pilot | Baseline before paid |
| Click-through to `/venue/[slug]` | Directory usefulness |
| Booking / event request started | Core conversion |
| Guest return within 30d | Marketplace retention (long horizon) |

### Anti-metrics (stop if)

- Guest bounce on `/venues` **>70%** with `<5` results — **pause promo**, return to S1.
- Owner churn citing “no bookings” while **<10** listed — supply problem, not product bug.

---

## Product phases

| Phase | Scope | Exit criteria | Status |
|-------|--------|---------------|--------|
| **M0** | Design + operator sheet | Pilot city chosen | Done (Wrocław) |
| **M1** | In-repo GTM checklist; trial marketing grant documented | Checklist live | Done (checklist); grant = operator |
| **M2** | `/for-venues` “Join the \<city\> directory” CTA; `/venues` empty-state names pilot | Copy live | **Done (Phase A)** |
| **M3** | City landing `/venues/[citySlug]` | Local SEO landing | **Done (Phase A)** |
| **M4** | `Shop.launchCity` or tag; admin pilot cohort view | Measurable supply funnel | Residual |
| **M5** | Entitlement split: free directory vs paid premium marketing | Scale beyond manual comp | Residual |

**Do not** run guest promo (S3–S4) before S2 gate — product Phase A does not unlock demand marketing.

---

## Overlap with other bible items

| Item | Relationship |
|------|--------------|
| **#33** Product scope too broad | Marketplace GTM **narrows** Friday story: one city, one loop — not national platform day one |
| **#34** Owner vs guest marketing | `/for-venues` = supply; `/venues` = demand **after** supply; homepage picks one primary story |
| **#31** Onboarding | White-glove onboarding uses same 10-step target; publish step explains directory **after** city density plan |
| **#26** Public abuse | More guest traffic → tighten throttles before paid promo |
| **#30** i18n | Pilot city locale drives en/pl copy on city landing + empty states |

---

## Explicit non-goals (Phase A)

- National `/venues` SEO or paid guest campaigns  
- Changing `listPublicVenues` filters or ranking algorithm  
- Marketplace payments, commissions, or guest accounts  
- Multi-city simultaneous launch  
- Replacing Lemon/subscription model in code  
- M4–M5 admin cohort tools / entitlement split  
- Claiming live S1–S4 execution as DONE  

---

## Files (this lane)

| Path | Role |
|------|------|
| `docs/audit/GO_SPOTS_MARKETPLACE.md` | This playbook |
| `docs/audit/MARKETPLACE_GTM_CHECKLIST.md` | Operator checkboxes |
| `apps/web/src/lib/pilot-cities.ts` | Pilot city config |
| `apps/web/src/app/venues/[citySlug]/page.tsx` | City landing route |
| `apps/web/src/components/venues/city-landing.tsx` | City landing UI |
| `apps/web/src/components/landing/pilot-city-cta.tsx` | for-venues / home CTA |
| `docs/audit/BIBLE_STATUS.md` | #35 → DONE (Phase A) |

**Verify:** `pnpm --filter @gospots/web run typecheck` · `pnpm --filter @gospots/web run i18n:check`

*Lane **MMMMMM** — bible #35 Phase A DONE. Live cohort + M4–M5 residual.*
