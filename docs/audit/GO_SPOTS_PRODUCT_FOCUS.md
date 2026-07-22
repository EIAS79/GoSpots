# Locora — Product scope & narrow focus

**Date:** 2026-07-21  
**Status:** **DONE** (Phase A commercial UX ship bar) — gaming-first self-serve register/pricing/landing; hide > delete. Phase B–D residual.  
**Bible:** P3 **#33** — the product scope is too broad; Locora sells five venue types, seven billable add-ons, gaming + dining + menu + chat + events + marketplace discovery as parallel stories.  
**Ship timing:** Phase A shipped **2026-07-21** (Lane **KKKKKK**). Phase B–D remain post-Friday residuals.

**Related (separate lanes):** P3 **#34** owner vs guest marketing surfaces · P3 **#35** supply-first marketplace GTM.

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Shipped (Phase A — commercial UX)** | Lead with gaming venues on homepage, register, and pricing. Collapse seven add-ons into **three bundles** in marketing UI only. Hide `hotel_fb` and `bar` (and dining as equal tile) from self-serve picker — restaurant/hotel → contact sales. Default register pack = **`gaming`**. |
| **After Friday (Phase B — dashboard shrink, ~1–2 sprints)** | Onboarding wizard ([`GO_SPOTS_ONBOARDING.md`](./GO_SPOTS_ONBOARDING.md)) seeds **gaming templates only** for v1. Move dining/menu/event/chat behind explicit “Add F&B” upgrade. No code removal — **hide + defer discoverability**. |
| **Post-Q1 (Phase C — evaluate)** | If dining/hotel attach rate stays low, merge `bar` + `dining` → **`hospitality`** pack in catalog; keep legacy pack ids in DB. Do **not** rip out dining APIs until a paying customer needs them. |

**One-line strategy:** **Win gaming-floor operators first** (reservations + live floor + play billing). Everything else is optional expansion, not co-equal product pillars.

---

## Problem (bible #33)

Locora reads as **five products in one SKU**:

| Surface | Breadth today |
|---------|----------------|
| Signup | Five `packId` choices (`gaming`, `dining`, `bar`, `hotel_fb`, `mixed`) |
| Subscription | Seven à la carte add-ons (`ops_alerts`, `gaming_suite`, `menu_orders`, `dining_floor`, `venue_presence`, `guest_chat`, `team_accounts`) |
| Dashboard nav | Gaming setup, dining floor, menu, sessions, orders, play billing, finance, events, chat, reviews, audit, marketing |
| Public guest | Gaming + dining booking, event requests, guest chat, reviews, venue directory |
| README / landing | “Gaming centers, restaurants, and venues” — no single hero customer |

**Impact:**

- Owners don’t know which path is “for them”; empty dashboards after signup (#31).
- Sales/support must explain module matrices instead of outcomes.
- Engineering pays rent on dual floor models ([`GO_SPOTS_RESOURCE_MODEL_MERGE.md`](./GO_SPOTS_RESOURCE_MODEL_MERGE.md)), unified ticket debt ([`GO_SPOTS_UNIFIED_TICKET.md`](./GO_SPOTS_UNIFIED_TICKET.md)), and F&B + gaming concurrency paths — while **no wedge market is saturated**.
- Marketing competes with guest marketplace story (#34–#35) before supply exists.

**Required fix (bible):** a **deliberate scope cut** — what we lead with, what we keep but don’t sell, what we defer — not accidental breadth.

---

## Target customer (choose one primary ICP)

### Primary ICP — **Gaming venue operator**

**Who:** Billiard hall, PC/console lounge, bowling, arcade, VR, esports café owner (1–3 locations, 5–40 stations/tables).

**Job to be done:** “Run tonight’s floor — who’s booked, what’s free, what we charged — without Excel and WhatsApp.”

**Must-have outcomes (already in product):**

| Outcome | Modules / surfaces |
|---------|-------------------|
| See floor + take bookings | `resource`, `reservation`, gaming setup |
| Clock play / walk-ins / close tab | `transaction`, play billing, sessions |
| Staff can operate shifts | `roles` / `team_accounts`, hours |
| Guests get status link | Public gaming booking + guest token |
| Owner sees day revenue | Finance (interim contract — not full ledger) |

**Nice-to-have (sell later, not hero):** menu orders, dining tables, guest chat, events, directory promo.

### Secondary ICP — **Mixed entertainment venue**

**Who:** Family entertainment center, cinema+bowling, gaming lounge with a bar snack menu.

**Positioning:** “Gaming-first, plus light F&B when you need it” — **`mixed` pack**, not a third parallel product story.

### Explicitly not primary (keep code, shrink story)

| Persona | Pack / modules | Product stance |
|---------|----------------|----------------|
| Full-service restaurant | `dining`, `dining_floor`, `menu_orders` | **Partner later** or manual onboard only; don’t lead landing/pricing |
| Bar / nightclub | `bar` | Fold into hospitality story in Phase C; no dedicated hero |
| Hotel F&B team | `hotel_fb`, per-seat `team_accounts` | **Enterprise manual** — hide from self-serve signup |
| Guest marketplace shopper | `/venues`, `venue_presence` | **Defer GTM** until local supply (#35) |

---

## Scope tiers (what to lead with vs keep vs defer)

### Tier 1 — **Core wedge (lead everywhere)**

Ship messaging, onboarding defaults, and sales around this set only:

- Gaming floor layout + categories + rates  
- Gaming reservations + live sessions + play billing  
- Opening hours + timezone (core)  
- Staff roles (minimal seats)  
- Public venue page (basic — not directory promo)  
- Owner finance snapshot (existing contract)

**Commercial bundle (marketing label):** **Gaming Operations**  
Maps to add-ons: `gaming_suite` + `ops_alerts` (optional `team_accounts` if seats > 1).

### Tier 2 — **Expansion (explicit upgrade, not default)**

Available for mixed venues and upsell — **not on homepage hero, not in default trial bundle:**

| Capability | Add-on / module | Why defer from default |
|------------|-----------------|------------------------|
| Menu + kitchen tickets | `menu_orders` | Different ops muscle; unified ticket not shipped |
| Dining tables + restaurant bookings | `dining_floor` | Duplicate floor model vs gaming resources |
| Guest live chat | `guest_chat` | Polling chat; realtime design deferred |
| Event / party inquiries | `reservation` + events UI | Sales-led feature, not wedge |
| Directory promo | `venue_presence` | Needs supply-first GTM (#35) |

**Commercial bundle (marketing label):** **F&B & guest extras**  
Maps to: `menu_orders` + `dining_floor` + optional `guest_chat`.

### Tier 3 — **Defer from self-serve product (keep for legacy / manual)**

Do not show in register, pricing calculator, or onboarding v1:

| Item | Rationale |
|------|-----------|
| `hotel_fb` pack | Narrow TAM; per-seat pricing complexity |
| `bar` as standalone pack | Overlaps dining; splits marketing |
| `multi_shop` | No catalog add-on; enterprise-only |
| `integrations` module | Not a submit story |
| Full marketplace discovery UX | #35 — supply before demand marketing |
| Unified guest tab / ledger | Design-only; out of scope cut (#6, #10) |

**Rule:** Tier 3 stays **build-compatible** (existing shops keep access via entitlements). Scope cut is **positioning + discoverability**, not deleting routes pre-customer.

---

## Pack & add-on simplification (target catalog UX)

Today: 5 packs × 7 add-ons × 18 module keys — too many choices at signup.

### Target self-serve catalog (Phase A — UX only)

| Customer-facing choice | Maps to today | Default modules |
|------------------------|---------------|-----------------|
| **Gaming venue** | `packId: gaming` | CORE + `gaming_suite` + `ops_alerts` |
| **Mixed venue** | `packId: mixed` | Above + optional F&B bundle |
| **I run a restaurant / hotel** | `dining` / `hotel_fb` | **Contact us** — not self-serve tile |

### Target add-on bundles (replace seven checkboxes)

| Bundle | Includes (add-on ids) | Price story |
|--------|-------------------------|-------------|
| **Ops & trust** | `ops_alerts` | Notifications, audit, reviews |
| **Gaming floor** | `gaming_suite` | Floor, bookings, play billing, reports |
| **Food & dining** | `menu_orders` + `dining_floor` | Menu + table bookings |
| **Team seats** | `team_accounts` | Per-seat, shown only when inviting staff |

Remove from default picker (manual grant only): `venue_presence`, `guest_chat` until Tier 2 upsell flow exists.

### Legacy / tier compatibility

- Keep `legacyAddOnsFromTier` and CSV dual-read ([`GO_SPOTS_CSV_CUTOVER.md`](./GO_SPOTS_CSV_CUTOVER.md)) — **scope cut must not shrink paid access**.
- `STARTER` empty pack stays intentional (CORE only) — do not auto-expand on scope project.
- Pack id renames (`bar` → `hospitality`) are **Phase C** with DB alias, not Friday.

---

## Dashboard & UX shrink (Phase B)

Align with onboarding design — **compose existing pages**, don’t fork services.

| Area | Today | Target for gaming-first default |
|------|-------|--------------------------------|
| Sidebar | All entitled modules visible | Same gates; **collapse “F&B” group** until F&B bundle purchased |
| Register redirect | `/subscription` | After onboarding ships: **setup wizard** before subscription upsell |
| Operations landing | Sessions + orders + play billing equal weight | **Sessions + play billing** primary; orders secondary tab |
| Events | Staff event-request inbox | Settings deep link; not nav hero |
| Marketing publish | Settings + add-on gate | Step 10 of onboarding only |
| Finance | Full channel breakdown | Keep; label “Play” first in gaming template |

**Do not remove** dining/gaming API endpoints or staff paths for entitled shops — bible #33 is **focus**, not amputation.

---

## What stays in the Friday submit bundle

No contradiction with [`FOUR_DAY_SHIP_PLAN.md`](./FOUR_DAY_SHIP_PLAN.md):

| Keep shipping (technical) | Out of Friday (already) |
|---------------------------|-------------------------|
| Money safety, booking locks, CSRF, guest tokens | Full ledger, unified ticket, model merge |
| Pack gates + feature asserts | Realtime, 2FA, full GDPR |
| All modules for existing tenants | Marketing polish |

This design doc **does not** add Friday code work — it records **what to stop selling as co-equal** after submit.

---

## Success metrics (post-implementation)

Track whether the cut worked — not vanity signup breadth:

| Metric | Target (90 days post Phase A) |
|--------|-------------------------------|
| New shops choosing `gaming` or `mixed` | **≥ 80%** of self-serve signups |
| Median time to first booking or play session | **< 7 days** (depends on #31 wizard) |
| Support tickets mentioning “which module do I need?” | **Down 50%** vs baseline |
| Paid attach: F&B bundle | **Optional** — measure separately; don’t block gaming wedge |
| `/venues` traffic as % of acquisition | Flat or down until #35 supply play |

---

## Phased implementation checklist

| Phase | Deliverable | Status |
|-------|-------------|--------|
| **A** | Gaming-first landing, register, pricing bundles | **DONE** (**KKKKKK**) — web marketing + register; `SELF_SERVE_PACK_*` + `MARKETING_BUNDLES` in `apps/web/src/lib/venue-packs.ts` |
| **B** | Onboarding wizard + sidebar group collapse | Residual (#31) |
| **C** | Pack alias / hospitality merge evaluation | Residual |
| **D** | Tier 3 manual-only flows | Residual (sales ops) |

**Explicit non-goals for this bible item:**

- Deleting dining or menu modules from API  
- Merging resource models (see #14)  
- Unified guest check (see #10)  
- Marketplace GTM execution (see #35)  
- Owner vs guest marketing split (see #34)

---

## Decision log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary ICP | Gaming venue operator | Repo origin, strongest module cohesion, clearest wedge |
| Restaurant/hotel | Manual / later | High scope cost; weak differentiated story today |
| Add-ons | 3 bundles + seats | Reduces signup paralysis; maps 1:1 to outcomes |
| Code removal | **No** pre-revenue | Entitlements protect existing trials; hide > delete |
| Marketplace | Defer demand marketing | #35 supply-first |
| Mixed venues | Secondary ICP | Real segment; still gaming-led narrative |

---

## References

- Bible status: [`BIBLE_STATUS.md`](./BIBLE_STATUS.md) (#33)  
- Ship slice: [`FOUR_DAY_SHIP_PLAN.md`](./FOUR_DAY_SHIP_PLAN.md)  
- Onboarding compose: [`GO_SPOTS_ONBOARDING.md`](./GO_SPOTS_ONBOARDING.md)  
- Packs source: `apps/api/src/common/venue-packs.ts`  
- Dashboard nav: `apps/web/src/components/layout/tenant-shell.tsx`  
- Deep audit breadth: [`GO_SPOTS_DEEP_AUDIT.md`](./GO_SPOTS_DEEP_AUDIT.md)

---

*Lane **KKKKKK** — bible #33 Phase A DONE. Phase B–D residual.*
