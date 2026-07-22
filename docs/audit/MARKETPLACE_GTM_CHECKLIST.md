# Marketplace GTM checklist (in-repo)

**Bible:** #35 Phase A  
**Playbook:** [`GO_SPOTS_MARKETPLACE.md`](./GO_SPOTS_MARKETPLACE.md)  
**Product surfaces:** `/venues/wroclaw` (pilot landing), `/for-venues` + `/` pilot CTA, `/venues` empty-state hint  

This checklist is the **operator execution runbook**. Phase A **DONE** means the surfaces + this checklist exist in-repo — **not** that S1–S4 have been completed live.

---

## Pilot city (locked for Phase A)

| Field | Value |
|-------|--------|
| City | **Wrocław** |
| Country | PL |
| Landing | `/venues/wroclaw` |
| Directory filter | `/venues?city=Wrocław&country=PL` |
| Shop.city string | `Wrocław` (match exactly when registering) |
| Timezone | `Europe/Warsaw` |

Change only by editing `apps/web/src/lib/pilot-cities.ts` + i18n — do not invent a second city until S2 gate.

---

## S0 — Foundation (pre guest promo)

- [ ] CRM sheet: 20–40 target venues (name, contact, category, status)
- [ ] Confirm register → settings → publish path works in prod
- [ ] White-glove pack ready: hours, slug, cover, 1-line description, category tag
- [ ] **Do not** link paid ads to `/venues` yet

## S1 — Manual onboard (target: 10 live profiles)

- [ ] Founder-led or assisted register with city=`Wrocław`, country=`PL`
- [ ] MVP public page: name, cover, hours, ≥1 visible resource category
- [ ] Grant trial / comp `marketing` (`venue_presence`) for pilot cohort
- [ ] QA: appears on `/venues?city=Wrocław` and `/venue/[slug]` loads
- [ ] Quality bar: cover + description + accurate hours — **no ghost listings**

## S2 — Directory density (gate before guest promo)

- [ ] Listed venues ≥**15** meeting quality bar **or** ≥10 with booking on ≥5
- [ ] Category mix: ≥2 venues per top facet tags where possible
- [ ] Spot-check facets show Wrocław prominently
- [ ] Weekly density check every Friday — if `<15`, **no guest promo** next week

## S3 — Local guest traffic (organic first)

- [ ] Each profile links guests to `/venues/wroclaw` (QR / bio)
- [ ] Post in city gaming groups **only after** S2
- [ ] Index `/venue/[slug]` pages; defer national SEO
- [ ] Optional: one venue launch night with booking demo

## S4 — Promo (paid / partnership)

- [ ] Light geo-fenced paid social **only after S2**
- [ ] Measure guest → booking started → completed (not signups alone)
- [ ] Pause if `/venues` bounce **>70%** with `<5` results

---

## Anti-metrics (stop)

| Signal | Action |
|--------|--------|
| Guest bounce >70% with thin results | Pause promo → return to S1 |
| Owner churn “no bookings” while `<10` listed | Supply problem, not product bug |

---

## Free profiles (pilot)

Prefer **comp cohort + trial marketing grant** (approaches A+B in playbook). Do **not** rewrite entitlement split (M5) until second city or data shows publish wall blocks S1.

---

## Weekly rhythm

1. **Monday** — 5 new leads; 2 onboarding calls  
2. **Wednesday** — Assisted setup + publish QA  
3. **Friday** — Density count; gate guest promo  
4. **Monthly** — Deepen Wrocław vs open second city  

**Owner pitch:** “We’re building the directory for Wrocław gaming venues. Free listing during launch — local players once the map is full.”  

**Guest pitch (after S2):** “Find billiard halls, PC cafés, and console lounges in Wrocław — book or check availability.”
