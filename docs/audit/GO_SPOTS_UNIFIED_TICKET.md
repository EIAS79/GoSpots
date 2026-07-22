# Unified customer ticket / guest tab

**Date:** 2026-07-20 (design) · **Impl lane NNNNNN-guest-check-done:** 2026-07-21  
**Status:** Phase 0 option **A** recorded; Phase 1–2 shipped (schema + attach APIs + staff open-tabs UI). Phase 3 single-settle = residual.  
**Related:** Deep audit §2.16, §2.2; `GO_SPOTS_FINANCE_CONTRACT.md`; `schema.prisma` (`GuestCheck`, `Reservation`, `PlaySession`, `ShopOrder`, …); `apps/api/src/modules/guest-check/**`.

---

## 1. Why this exists

A guest visit today is **four (plus) parallel objects** with separate identity, status, money, and guest links:

| Slice | Primary model | Guest-facing surface | Staff settle path |
|-------|---------------|----------------------|-------------------|
| Booked slot | `Reservation` | `/venue/…/gaming-status|dining-status/[token]` | Game / dining billing → `billedAmount` |
| Walk-in / active play | `PlaySession` | (staff floor only; optional link via `reservationId`) | Complete session → `amount` |
| Menu ticket | `ShopOrder` | (staff POS / kitchen) | Complete order → `total` (+ optional `reservationFee`) |
| Live messaging | `GuestChat` | Venue page widget + token | End chat (no money) |
| Party / event inquiry | `EventRequest` | `/venue/…/event-status/[token]` | Approve/decline (no ticket) |

There is **no** `GuestCheck` / `CustomerBill` / open-tab root. Staff reconcile food + play + table fee mentally; analytics stay multi-channel (`GO_SPOTS_FINANCE_CONTRACT.md`). Audit **P1 §2.16** called this out as a confirmed gap.

This doc freezes the as-is fragmentation, a target **unified guest tab**, and a **post-submit phased plan**. Shipping schema or app code for unification before Friday is out of scope.

---

## 2. Current fragmentation (as-is)

### 2.1 Reservation (time-bound booking)

**Owns:** guest identity snapshot (`guestName` / email / phone), `partySize`, `startsAt`/`endsAt`, status lifecycle, optional `resourceId`, **play billing fields** on the same row (`billedAmount`, `billingBaseAmount`, `billingDiscountPercent`, `billingPaymentMethod`, `billedAt`), and its **own** guest token (`guestToken` / hash / expiry / revoke).

**Money:** Billed resource reservations feed **play / tables** or **dining / other** revenue depending on `resourceId` (see finance contract). Completing a reservation bill does **not** create a `Transaction` or attach `ShopOrder` lines.

**Link outs:** Optional 1:1 `PlaySession` (`PlaySession.reservationId` unique). No FK to `ShopOrder` or `GuestChat`.

**Mental model:** “This party is booked for this interval (and maybe we charge play on the reservation).”

### 2.2 PlaySession (floor / walk-in clock)

**Owns:** `playerCount`, `startedAt`/`endedAt`, `durationMinutes`, `amount`, discount %, `paymentMethod`, `status`, optional `resourceId`, optional `reservationId`, label/note.

**Money:** Walk-in paid sessions (`reservationId = null`) count in **play** revenue. Linked sessions (`reservationId` set) are **excluded** from revenue so payment lives on `Reservation.billedAmount` only — a deliberate anti-double-count rule, not a unified tab.

**Guest identity:** No guest name/email/phone on the session itself (only label/note). Walk-ins are staff-labeled, not guest-tokened.

**Mental model:** “This table/console is occupied / was occupied; here is the play charge.”

### 2.3 ShopOrder (menu ticket)

**Owns:** line items (`ShopOrderLine`), `total`, `guestCount`, `paymentMethod`, status (`PENDING` → `COMPLETED` / `CANCELED`), optional `label`/`note`.

**Weak bridge to reservations:** `tableReserved` + `reservationFee` — boolean + fee **embedded in order total**, **not** an FK to `Reservation`. Finance contract: fee is menu-channel only; do not also write the same fee to `Reservation.billedAmount`.

**No play merge:** Completing an order does not pull in `PlaySession.amount` or reservation billing. No shared guest token.

**Mental model:** “Kitchen / bar ticket for covers N.”

### 2.4 GuestChat (messaging thread)

**Owns:** guest contact fields, chat status (`WAITING`/`OPEN`/…), messages, **separate** guest token family (hash/expiry/revoke), staff join metadata.

**Money:** None. **No FK** to reservation, order, or play session. A guest who booked and then opens chat gets a **second** identity + token unless staff correlates by name/email manually.

**Mental model:** “Live message thread with someone on the venue page.”

### 2.5 Adjacent (same guest journey, still separate)

| Model | Role vs “tab” |
|-------|----------------|
| `EventRequest` | Inquiry + its own guest status token; approval may create seating blocks / category links — **not** a billable tab. |
| `Transaction` | Quick-sale / expense path; completing a shop order **does not** post here. Same-menu double entry is an ops hazard (finance contract). |
| Public status pages | One token → one entity type (gaming / dining / event). No “visit home” that lists food + play + chat. |

### 2.6 How paths meet today (sparse)

```
Public book ──► Reservation (+ guest token A)
                    │ optional 1:1
                    └──► PlaySession (amount ignored if linked; bill on Reservation)

Walk-in play ──► PlaySession (no reservation, no guest token)

Staff POS ──► ShopOrder (± reservationFee flag, no Reservation FK)
                    ✗ no PlaySession / Reservation merge

Venue widget ──► GuestChat (+ guest token B)
                    ✗ no link to booking or order

Event inquire ──► EventRequest (+ guest token C)
```

**Identity:** up to three guest-token namespaces (reservation, chat, event) plus staff-only play/order labels.  
**Settle:** up to three payment moments (reservation bill, play complete, order complete) with manual discipline to avoid double-count.  
**Staff UX:** separate dashboard areas (reservations, finance/play, orders, messages).

---

## 3. Target: unified guest tab (`GuestCheck`)

### 3.1 Product contract (recommended)

Introduce an optional **open guest tab** (working name: `GuestCheck`) as the **settle root** for one visit:

1. **One check per active visit** (shop-scoped), with lifecycle `OPEN` → `SETTLED` | `VOID`.
2. **Lines** (or attached children) from:
   - Menu (`ShopOrder` / lines, or migrated line type `MENU`)
   - Play time (`PlaySession` or reservation play charge, type `PLAY`)
   - Booking / cover fee (today’s `reservationFee` / dining fee, type `FEE`)
3. **Settle once:** one tender (or split tenders later), one `settledAt`, one guest-facing receipt/status.
4. **Guest identity + one token** on the check (or shared visit token), with optional links to chat / event as *attachments*, not parallel money roots.
5. **Finance:** settlement posts to **one** revenue path (or posts channel lines that remain mutually exclusive) — must not break the interim four-channel contract without an explicit migration of `GO_SPOTS_FINANCE_CONTRACT.md`.

### 3.2 Suggested shape (sketch only — not schema this wave)

```
GuestCheck
  id, shopId, status, guestName/email/phone, partySize
  resourceId?, reservationId?, openedAt, settledAt
  currency (align with M6 stamps when that lands)
  paymentMethod?, total?, guestTokenHash…

GuestCheckLine
  checkId, kind (MENU | PLAY | FEE | ADJUSTMENT)
  sourceType + sourceId (ShopOrderLine | PlaySession | …)  // provenance
  name, quantity, unitPrice, amount
```

**Provenance over rewrite:** Prefer attaching existing rows (`shopOrderId`, `playSessionId`, `reservationId`) in Phase 1–2 rather than deleting `ShopOrder` / `PlaySession` on day one.

### 3.3 What stays outside the tab (initially)

| Keep separate | Why |
|---------------|-----|
| Quick `Transaction` SALE | Instant counter sale without a visit; optional “add to open check” later |
| `ShopLoss` | Not guest-facing |
| `EventRequest` until approved/converted | Inquiry ≠ open tab; convert on approve if product wants |
| SaaS `Subscription` / Lemon webhooks | Different product surface |

### 3.4 Guest UX target

- One status URL (or visit hub): booking window + open kitchen lines + play estimate + “message venue” on the **same** visit identity.
- Staff: one open-tabs board → add food, link play, settle → single receipt.

---

## 4. Risks of unifying

### 4.1 Finance double-count

Today’s safety depends on **channel exclusivity** (linked play ignored; order fee not also on reservation). A naive “sum all children on settle **and** keep old complete hooks” will inflate revenue. Cutover must either:

- Make settle the **only** revenue stamp for attached children, or  
- Keep children as channel sources and treat the check as a **UI/ops container** only (weaker product win).

**Recommendation:** settle-as-posting-root eventually; until then, dual-write with explicit “revenue owner” flag per child.

### 4.2 Partial payments & mid-visit edits

Open tabs need line void, discounts, split tender, walk-out — none of which exist as first-class check ops today (discounts live on reservation/play fields separately).

### 4.3 Concurrency

Attaching the same `PlaySession` or `ShopOrder` to two checks; settling while kitchen still adds lines; linking a reservation already billed. Need conditional updates / unique “attached to at most one OPEN check”.

### 4.4 Guest tokens & GDPR

Merging tokens affects status pages, mail links, chat widget, and export (`GET /gdpr/export`). Prefer expand (check token + dual-read old tokens) over big-bang revoke.

### 4.5 Engineering blast radius

Touches: Prisma + migrations, `finance.service.ts` (**hot**), reservations / play billing, menu order flows, guest chat, public status routes, web finance + messages + public venue, analytics util, finance contract doc. **Do not** parallelize with other finance/reservation lanes without the coordination board.

### 4.6 Rollback

Hard after UI assumes one settle. Use expand → link optional FKs → dual-read staff UI → settle posts → stop old complete-as-revenue → drop duplicate fields.

---

## 5. Phased approach (post–Friday submit only)

**Gate:** Friday operator submit complete; money Decimal + guest-token hash work already deployed; claim a dedicated lane before touching `finance.service.ts` / `schema.prisma`.

### Phase 0 — Product decision (doc only)

Choose posting model:

| Option | Summary | Fit |
|--------|---------|-----|
| **A. Ops container** | `GuestCheck` groups FKs; each child still completes/bills as today; analytics unchanged | Fastest; staff UX only |
| **B. Settle root** | Completing children does not count revenue until check settle posts once (or posts channel lines atomically) | Real “one bill”; needs finance contract rewrite |
| **C. Hybrid** | Menu orders can complete for kitchen flow but revenue deferred; play/reservation keep current bill until linked then reparent | Likely pragmatic path |

**Recommendation (design bias):** start **A** for staff open-tabs UX, move to **C/B** when ledger / single posting is scheduled (`GO_SPOTS_MIGRATION_PLAN` M3 adjacency).

**Phase 0 decision (2026-07-21):** **Option A — ops container.** `GuestCheck` groups optional FKs on `ShopOrder` / `PlaySession` / `Reservation`; children still complete/bill via existing endpoints; analytics / finance contract **unchanged**. Staff UI shows a **running total** that applies the same anti-double-count rules as the finance contract (linked play excluded when reservation billed; `reservationFee` only via order total). Phase 3 (Option B/C settle root) remains residual — do **not** update `GO_SPOTS_FINANCE_CONTRACT.md` until settle posts revenue.

### Phase 1 — Schema expand + soft links (no behavior change)

- Add `GuestCheck` (+ optional `guestCheckId` on `ShopOrder`, `PlaySession`, `Reservation`, optionally `GuestChat`).
- No requirement to open a check for existing flows.
- Read APIs: “open checks” list; detail with attached children.
- Tests: create check → attach order/play/reservation → detach; cross-tenant shopId guards.

### Phase 2 — Staff open-tab UX

- Dashboard: open tabs board; add menu lines / start or link play / show reservation window.
- Public: optional visit hub behind flag; keep legacy status URLs working (dual-read tokens).
- Still settle via existing complete/bill endpoints if Option A.

### Phase 3 — Single settle (Option B/C)

- `POST …/guest-checks/:id/settle`: atomic tender + mark children paid/completed + one revenue posting strategy.
- Disable or no-op revenue side-effects on child complete when `guestCheckId` set and check still OPEN.
- Update `GO_SPOTS_FINANCE_CONTRACT.md` and analytics tests.

### Phase 4 — Guest identity consolidation

- Prefer check-level guest token; chat/event attach to check; migrate status pages.
- GDPR export includes check + children as one visit bundle.
- Deprecate plaintext dual-read when already planned elsewhere.

### Phase 5 — Contract drop

- Remove redundant `ShopOrder.tableReserved` / `reservationFee` if fees are always check lines.
- Consider folding quick-sale “add to tab” only if product demands it.
- Mark deep audit §2.16 Resolved.

**Out of scope until separately scheduled:** full append-only ledger rewrite, realtime tab sync (websockets), resource/dining model merge, multi-currency ledger beyond M6 stamps.

---

## 6. Explicit non-goals for Phase 1–2 (shipped Option A)

- No single-settle revenue posting (Phase 3).
- No merge of guest status URLs or chat tokens (Phase 4).
- No finance analytics / channel-sum changes (children still complete/bill as today).
- No Neon `migrate deploy` from workstation.

---

## 7. Acceptance criteria (when a future lane implements)

1. Phase 0 option (A / B / C) recorded and finance contract updated if posting changes.
2. Staff can open a tab, attach menu + play (+ optional reservation), and see one running total.
3. Revenue for a visit is **not** double-counted vs today’s channel rules (tests for linked play + billed reservation + completed order + reservationFee).
4. Cross-tenant: checks and attachments always `shopId`-scoped.
5. Legacy status tokens and complete/bill endpoints keep working through dual-read/dual-write window.
6. Expand-only migrations; rollback = stop writing `guestCheckId` and hide UI.
7. Coordination board lane claimed for finance + schema touchpoints.

---

## 8. Verify

Implementation verify (Lane **NNNNNN**): jest `guest-check-total` + `guest-check.service` **12** PASS; `nest build` PASS; web typecheck PASS; `i18n:check` **1989**+**1020**.  
Operator: Neon `migrate deploy` for `20260721110000_guest_check` (never from workstation `.env`).
