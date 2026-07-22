# Locora — Internationalization residual plan (Bible §30 / #30)

**Date:** 2026-07-22 (residual docs lane **I18N30-residual-docs**)  
**Status:** en/pl product UI ship bar **DONE** (Lane **TTTTT**). Secondary locales, API/email copy, legal prose, and CI hard gate remain **explicitly deferred** — phased plan below. **Do not claim full dashboard translation for de/fr/es/ar until Phase 1 exit.**  
**Bible:** P2 **§30** / **#30** — web internationalization.  
**Combined a11y + i18n design (historical):** [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md).

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Dashboard catalog **en/pl** full parity | **DONE** | `apps/web/src/lib/i18n.ts` — **1992** keys each (`i18n:check`) |
| Public catalog **en/pl** full parity | **DONE** | `apps/web/src/lib/public-i18n.ts` — **1020** keys each |
| `i18n:check` en⊆pl leaf detector | **DONE** | `apps/web/scripts/i18n-check.mjs` → `pnpm --filter @gospots/web run i18n:check` |
| Tenant shell nav + settings + hours | **DONE** | `nav.*`, `settings.*`, `hours.*` wired via `VenueSettingsProvider` → `t()` |
| Finance hub + panels + invoice print | **DONE** | `finance.*`, `finance.invDoc*` (lanes DDDDD/HHHHH) |
| Ops: sessions / floor / agenda / schedule actions | **DONE** | `sessionsPage.*`, `floor.*`, `staff-floor-i18n.ts` helpers (lanes MMM–PPP, TTTTT) |
| Messages + notifications + staff/team | **DONE** | `msg.*`, `notif.*`, `team.*`, `team.accessGroup.*` (lanes NNNN–KKKK) |
| Menu + orders dashboard chrome | **DONE** | `menu.*`, `orders.*` (lane PPPP) |
| Auth pages (login/register/forgot/reset/activate) | **DONE** | `public-i18n` `auth.*` via `usePublicPrefs` (lane YY) |
| Public venue + booking + guest chat + floor maps | **DONE** | `venuePage.*`, `guestStatus.*`, floor residual (lanes GGG–LLL) |
| Guest discovery + marketplace + onboarding | **DONE** | `venueSearch.*`, `venuesDiscovery.*`, `onboarding.*` |
| RTL for `ar` | **DONE** (when locale selected) | `isRtlLocale` / `document.documentElement.dir` |
| Secondary locales **de/fr/es/ar** (dashboard) | **PARTIAL** | `i18n-locale-blocks.ts` overrides `nav`, `common`, subscription/pack/addon/featureGate, partial `settings`/`guide`; **ops page bodies fall back to English** |
| Secondary locales (public) | **PARTIAL** | Same six codes in `PUBLIC_LOCALES`; parity varies — missing key → English |
| API validation / error messages | **RESIDUAL** | Server returns English strings; web often surfaces raw `e.message` |
| Email / mail template bodies | **RESIDUAL** | Outbox **UI** en/pl; outbound message content English |
| Legal prose (privacy / terms) | **RESIDUAL** | Marketing legal pages not fully localized |
| Venue business content | **RESIDUAL** (by design) | Menu names, descriptions, reviews — operator-entered, not product i18n |
| `i18n:check` in CI hard gate | **RESIDUAL** | Script exists; **not** wired in `.github/workflows/ci.yml` |
| Unused plan-catalog / live-preview mocks | **RESIDUAL** | English-only dev fixtures |
| Product-wide six-locale dashboard claim | **RESIDUAL** | Explicit non-goal until Phase 1–2 exit |

**§30 classification:** **PARTIAL** — en/pl product UI ship bar met; secondary locales and server/email copy documented here, not hidden.

---

## Ship bar (Lane TTTTT — en/pl product UI)

| In scope (DONE) | Explicit residual |
|-----------------|-------------------|
| Dashboard + public + auth UI chrome keyed **en/pl** | de/fr/es/ar beyond high-traffic overrides |
| `i18n:check` **0** missing keys (en vs pl per catalog) | CI merge gate for `i18n:check` |
| Locale from shop `locale` (dashboard) or guest prefs (public) | API/email locale negotiation |
| Money/date formatting via venue currency + locale where wired | Legal page translation |
| RTL document direction for `ar` | Full ops translation for secondary locales |

### Dashboard namespaces in ship bar (representative)

| Namespace | Role |
|-----------|------|
| `nav`, `common`, `settings`, `hours` | Shell + shop config |
| `subscription`, `pack`, `addon`, `featureGate` | Plan / billing / gates |
| `finance.*`, `finance.invDoc*` | Finance hub + print |
| `floor.*`, `sessionsPage.*`, `reservationDialog.*` | Ops / floor / bookings |
| `msg.*`, `notif.*`, `team.*` | Comms + staff |
| `menu.*`, `orders.*` | F&B ops |
| `dashOverview.*`, `galleryPanel.*`, `reviewsStaff.*`, `notesPanel.*` | Venue content staff tools |
| `gamingSetup.*`, `diningSetup.*`, `eventRequests.*`, `auditPage.*` | Setup + audit |
| `onboarding.*`, `opsOutage.*`, `mailOutbox.*`, `mailSystemOutbox.*` | Onboarding + ops runbook + mail UI |

### Public namespaces in ship bar (representative)

| Namespace | Role |
|-----------|------|
| `auth.*` | Login / register / recovery / staff activate |
| `venuePage.*`, `guestStatus.*` | Guest venue + token status pages |
| `venueSearch.*`, `venuesDiscovery.*`, `theme.*` | Directory + theme |
| `menu.*` (public availability) | Guest menu schedule copy |
| `pack.{id}.*` | Register venue-pack labels |

**Verify (2026-07-22):**

```bash
pnpm --filter @gospots/web run i18n:check
# [OK] dashboard en=1992 pl=1992
# [OK] public en=1020 pl=1020
```

---

## What exists today (code truth)

### Two catalogs (intentionally separate)

| Layer | Source | Locale source of truth | Locales | Lookup |
|-------|--------|------------------------|---------|--------|
| **Dashboard (tenant)** | `i18n.ts` + `i18n-locale-blocks.ts` | Shop `locale` via `VenueSettingsProvider` → `t()` / `tList()` | `en`, `pl`, `de`, `fr`, `es`, `ar` | Dot-path tree; missing leaf → **English** → raw key |
| **Public / marketing** | `public-i18n.ts` | Guest prefs (`public-prefs` / localStorage) → `translatePublic` | Same six codes | Flat key → locale → **English** → raw key |

**Rule for new UI strings:** pick the catalog for the surface (dashboard vs public); add **both** `en` and `pl` leaves; run `i18n:check` before merge.

### Secondary locale pattern (de / fr / es / ar)

Comment in `i18n.ts`: *override high-traffic UI; fall back to English*.

- `i18n-locale-blocks.ts` supplies overrides for subscription/pack/addon/featureGate/guide (+ partial settings) per locale.
- Anything not overridden — including most ops page body copy that never calls `t()` — stays English even when shop locale is `de`.
- **Do not** tell operators “full German dashboard” today.

### Automated checking

| Piece | Role | Gap |
|-------|------|-----|
| `i18n-check.mjs` | en vs pl leaf parity in both catalogs | Does not scan TSX for hardcoded strings |
| `pnpm --filter @gospots/web run i18n:check` | Local / pre-merge verify | **Not** in CI workflow |
| Typecheck | Catches some missing imports | Does not enforce translation coverage |

### Explicitly outside web catalogs (residual)

| Surface | Why residual |
|---------|--------------|
| Nest validation pipes / exception filters | English default messages |
| Mail HTML/text templates | No locale template variants |
| `/privacy`, `/terms` long-form prose | Legal copy not keyed |
| Operator menu/item/review text | Business data, not product strings |
| Stripe/webhook-facing admin copy | English ops messages |

---

## Why secondary locales are deferred

| Constraint | Detail |
|------------|--------|
| Market priority | Primary ship pair is **en/pl** (Polish venues + English default) |
| Partial blocks already exist | de/fr/es/ar subscription/nav overrides — expanding ops namespaces is large surface |
| Ops English fallback | Staff can work in English while shell is localized — acceptable for v1 |
| Translation cost | Full ops parity for four locales is post-submit polish, not submit blocker |
| Dual-catalog drift | New strings must land in dashboard **and** public when both surfaces share UX |

**Interim:** Offer de/fr/es/ar for marketing/public high-traffic paths; document English fallback on dashboard ops when locale ≠ en/pl.

---

## Phased residual plan

### Phase 0 — CI + hygiene (≤1 day, low risk)

| Work | Notes |
|------|--------|
| Wire `i18n:check` in CI | Add to web job or dedicated step; fail on missing en/pl keys |
| Contributor note | Short rule in `apps/web/AGENTS.md` or pointer here: new UI → catalog + both locales |
| Smoke after large merges | Run `i18n:check` in pre-commit doc for i18n lanes |

**Exit:** PR merge blocked when en/pl keys diverge; contributors know which catalog to edit.

### Phase 1 — Secondary locale chrome (1–2 weeks)

Expand `i18n-locale-blocks.ts` + public peers for **de/fr/es/ar**:

1. `nav`, `common`, `settings` (regional tab labels) — already partial; complete gaps  
2. `financeHub` tab labels + read-only summaries (not full report prose)  
3. Public: `auth.*`, `venuePage.booking.*`, directory headings  
4. **Not in scope:** full `floor.*` / `sessionsPage.*` ops namespaces until en/pl stable in CI  

**Exit:** Guest + owner can browse marketing/auth/booking in de/fr/es/ar without English shell chrome; ops pages may still English-body.

### Phase 2 — Server + error copy (parallelizable)

| Work | Notes |
|------|--------|
| API `Accept-Language` or shop locale header | Map to message catalog for 4xx/5xx user-facing errors |
| Web error boundary | Prefer stable error **codes** + client `t()` over raw `e.message` (pairs with §36) |
| Mail template locale | At minimum: guest booking confirmation respects shop `locale` when known |

**Exit:** Common booking/auth failures show localized web copy; one guest email template localized en/pl.

### Phase 3 — Legal + content guidance (optional)

1. `/privacy` / `/terms` — separate legal review per locale; do not machine-translate compliance prose  
2. Document operator content policy: venue descriptions are single-locale unless multi-locale fields added later  
3. Remove or key unused English-only dev mocks (plan-catalog, live-preview)  

**Exit:** Legal pages either localized with counsel sign-off or explicitly English-only with banner; no stray English fixtures in prod paths.

### Phase 4 — Full secondary ops parity (**RESIDUAL** / stretch)

| Work | Notes |
|------|--------|
| `floor.*`, `msg.*`, `orders.*` for de/fr/es/ar | Only after Phase 0–1 green + operator demand |
| Public key parity beyond en/pl | Extend `i18n:check` or sibling script for de/fr/es/ar vs en |
| RTL polish for `ar` | Audit mirrored layouts on dashboard ops, not just `dir=rtl` |

**Exit:** Claim six-locale dashboard ops parity with automated key parity checks.

---

## Operator / developer verify

```bash
# Key parity (en vs pl — both catalogs)
pnpm --filter @gospots/web run i18n:check

# Typecheck
pnpm --filter @gospots/web run typecheck

# Manual: set shop locale Polski → walk settings, sessions, finance, messages
# Manual: set guest public locale pl → walk /venues, venue booking, guest status placeholder routes
```

**CI today:** `i18n:check` is **not** in `.github/workflows/ci.yml` — run locally before i18n-touching merges.

---

## Non-goals

- Replacing custom catalogs with react-intl / next-intl (keep current pattern)  
- Machine-translating operator menu/review content  
- Perfect de/fr/es/ar ops parity before en/pl CI gate  
- Localizing internal SUPER_ADMIN / platform-admin copy (English OK)  
- API admin/debug messages for developers (English OK)

---

## References

| Doc / code | Relevance |
|------------|-----------|
| [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md) | Historical combined design + early phase notes |
| [`GO_SPOTS_A11Y.md`](./GO_SPOTS_A11Y.md) | §29 — `aria-label` locale pairs with §30 |
| [`GO_SPOTS_TEST_MATRIX.md`](./GO_SPOTS_TEST_MATRIX.md) | Manual `i18n:check` command |
| [`GO_SPOTS_FIX_PLAN.md`](./GO_SPOTS_FIX_PLAN.md) | §30 row — secondary locales when needed |
| [`BIBLE_FINISHED.md`](./BIBLE_FINISHED.md) | Lane **TTTTT-i18n-enpl-done** ship log |
| `apps/web/src/lib/i18n.ts` | Dashboard catalogs |
| `apps/web/src/lib/i18n-locale-blocks.ts` | de/fr/es/ar overrides |
| `apps/web/src/lib/public-i18n.ts` | Public catalogs |
| `apps/web/scripts/i18n-check.mjs` | en/pl parity script |

---

## Verify (this lane)

n/a (docs only)
