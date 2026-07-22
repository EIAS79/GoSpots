# Locora — Accessibility + i18n sweep

**Date:** 2026-07-20 (design) / 2026-07-21 (#29 a11y smoke DONE)  
**Status:** **Bible #29 DONE** for public axe smoke ship bar (Lane **WWWWW**). **Bible #30 DONE** for en/pl product UI ship bar (Lane **TTTTT**); secondary locales residual.  
**Audit:** P2/P3 §2.20 — a11y formal-testing bar met for listed public routes; dashboard a11y + contrast polish residual.  
**Ship timing:** Public axe smoke + en/pl product UI shipped; dashboard focus-trap / hard CI gate / full contrast / de/fr/es/ar still post-submit polish.

### #29 ship bar (Lane WWWWW + CI follow-up)

| In scope (DONE) | Explicit residual |
|-----------------|-------------------|
| `pnpm --filter @gospots/web run test:a11y:smoke` on **13** public routes | Dashboard / settings / sessions / dialogs axe (needs auth) |
| Critical hard-fail; soft-log serious/moderate/minor | Formal contrast + focus-trap sweep (soft serious already logged) |
| Skip when Next is down | Hard CI gate + Next boot in Actions (auth secrets) |
| Reliable probe via Node `http` (not undici `fetch`) | — |
| Optional CI job `web-a11y-smoke` (`continue-on-error`) | — |

**Verify (2026-07-21):** with Next on `:3000`, **13 passed** (no critical). Soft: color-contrast + link-in-text-block on several routes. Without Next: **13 skipped**.

---

## Recommendation (operator / ship timing)

| When | Action |
|------|--------|
| **Before / through Friday submit** | Do **not** start a string-extraction or axe-CI lane. Keep existing `en`/`pl` catalogs and scattered `aria-*` as-is. |
| **After Friday** | Phase 0 baseline (focus ring + dialog trap + axe on 3–5 routes), then dashboard **en/pl** coverage for ops surfaces, then contrast + map keyboard paths. |

**Why defer:** Large surface area across `apps/web` (ops pages still mostly hardcoded English). Touching many UI files during submit week risks merge conflict with hot ops lanes and does not unblock Neon/CORS smoke.

---

## Current i18n surface

### Two catalogs (do not merge casually)

| Layer | Source | Locale source of truth | Locales | Lookup |
|-------|--------|------------------------|---------|--------|
| **Dashboard (tenant)** | `apps/web/src/lib/i18n.ts` + `i18n-locale-blocks.ts` | Shop `locale` via `VenueSettingsProvider` → `t()` / `tList()` | `en`, `pl`, `de`, `fr`, `es`, `ar` (`SUPPORTED_LOCALES`) | Dot-path tree; missing leaf → **English** → raw key |
| **Public / marketing** | `apps/web/src/lib/public-i18n.ts` | Guest prefs (`public-prefs` / localStorage) → `translatePublic` | Same six codes (`PUBLIC_LOCALES`) | Flat key → locale → **English** → raw key |

RTL: `isRtlLocale` / `isRtlPublicLocale` treat `ar` as RTL; dashboard sets `document.documentElement.dir` from venue locale.

### Dashboard catalog shape (en / pl)

Full parallel trees for **en** and **pl** under the same top-level namespaces:

| Namespace | Role |
|-----------|------|
| `nav` (+ `nav.group.*`) | Sidebar labels |
| `common` | Save / cancel / loading / view-only |
| `subscription`, `pack`, `addon`, `featureGate` | Plan / billing / gates (`i18n-locale-blocks` for de/fr/es/ar) |
| `financeHub` | Finance tab labels |
| `settings` | Shop settings incl. regional, privacy export, **sessions** UI strings |
| `hours` | Weekly hours / exceptions |
| `guide.*` | Section info tips (`useDashboardGuide` → `translateGuide`) |

**en ≈ pl parity:** Polish is a full sibling of English for those namespaces (including recent `settings.privacy*` / `settings.sessions*` keys). This is the **primary** product pair for staff UX.

### Secondary dashboard locales (de / fr / es / ar)

Comment in `i18n.ts`: *override high-traffic UI; fall back to English*.

Pattern: `...en` spread, then override `nav`, `common`, subscription/pack/addon/featureGate (from locale blocks), partial `settings`, `guide`. Anything not overridden (and most **page body** copy that never calls `t()`) stays English.

### Where `t()` is actually used today

**Well wired (locale-sensitive):**

- Tenant shell nav (`tenant-shell.tsx`)
- Shop settings + auth sessions panel + hours panel
- Subscription / pack / feature-gate surfaces
- Finance hub chrome + several finance subpanels (money formatting via venue currency)
- Section guides / info tips

**Mostly hardcoded English (catalog unused):**

- Ops: **sessions** (bookings / floor / agenda), **messages**, **notifications** list copy, dining/gaming **editors**, many dialogs
- Auth: login / register / forgot / reset / staff activate — English only (`Field` labels, no catalog)
- API/error strings often shown raw (`e.message`) regardless of locale

**Public layer:** Landing, directory, and public venue flows are the stronger of the two systems — flat `en`/`pl` (and peers) keys cover marketing + guest booking/chat chrome. Residual gaps are newer copy and brand renames, not a missing Polish tree.

### i18n gaps (ranked)

1. **Dashboard coverage gap (P0 for “i18n sweep”)** — Ops staff live on sessions / messages / orders; switching language to Polski only translates shell + settings + guides. Feels broken for PL venues.
2. **Auth English-only** — First-run and lockout paths ignore shop/public locale.
3. **Secondary locales incomplete on dashboard** — de/fr/es/ar are marketing-adjacent; do not claim “full dashboard translation.”
4. **No key-parity CI** — Missing PL key silently falls back to EN; no test that `pl` leaf set ⊇ `en` for dashboard namespaces.
5. **Dual systems** — Dashboard tree vs public flat dict; new strings often land in one place only.
6. **Server / email copy** — Outside this web sweep (mail templates, API validation messages); track separately if guest emails must match venue locale.

---

## Current a11y surface (dashboard focus)

### What already helps

| Area | Evidence |
|------|----------|
| **Landmarks / chrome** | Mobile nav uses `aria-expanded`, `aria-modal`, labelled open/close; venue switcher uses listbox/expanded patterns |
| **Confirm dialog** | `role="alertdialog"` + `aria-labelledby` / `aria-describedby` (`confirm-dialog.tsx`) |
| **Auth fields** | Visible `Field` labels + sensible `autoComplete` on login |
| **Scattered `aria-*`** | Floor/map controls, menu boards, notification bell, dining collapsibles, some icon buttons |
| **Motion** | `prefers-reduced-motion` hooks in `globals.css` for marquee / hero-style motion |

### Gaps (prioritized for dashboard)

#### 1. Focus management (highest leverage)

| Issue | Notes |
|-------|-------|
| **No focus trap / restore** | `ModalPortal` only portals; `ConfirmDialog` and most ops modals do not trap Tab or return focus to the opener |
| **Almost no `focus-visible` styling** | One consumer found; keyboard users often get browser default or low-visibility outlines on dark zinc chrome |
| **Escape / dismiss inconsistency** | Backdrop click cancels some dialogs; keyboard Escape not standardized |
| **Mobile drawer** | Open nav should move focus into panel and restore on close |

**Target:** One shared modal primitive (trap + Escape + initial focus + restore) used by confirm + reservation/menu/resource dialogs.

#### 2. Labels & names

| Issue | Notes |
|-------|-------|
| **Icon-only controls** | Shell sign-out / nav toggles have English `aria-label`s; many finance/ops icon buttons may lack accessible names |
| **Hardcoded English labels** | Even when `aria-label` exists, it does not follow `t()` — PL locale still announces English |
| **Decorative icons** | Mixed `aria-hidden`; incomplete |
| **Dynamic status** | Live floor / chat / toasts need polite `aria-live` where content changes without navigation (partial today) |

**Target:** Every interactive control has a visible label or `aria-label` from the dashboard catalog; icon-only requires a name.

#### 3. Contrast (dark dashboard)

| Issue | Notes |
|-------|-------|
| **Zinc-on-zinc body** | Common `text-zinc-400` / `500` on near-black panels — likely fails WCAG AA for small text in places |
| **Disabled / muted** | Opacity stacking on borders and helper text |
| **Charts / floor colors** | Status hues may rely on color alone (busy vs free) without text/pattern |

**Target:** Tokenized text roles (`primary` / `secondary` / `muted`) with documented contrast pairs; status always paired with text or icon+text.

#### 4. Complex widgets (defer after chrome)

Floor maps, gaming/dining layout editors, day agendas — pointer-first. Post-chrome: keyboard list/agenda equivalent for booking actions; map remains progressive enhancement with labelled unit controls where already present.

#### 5. Testing gap

**Shipped (#29):** optional `test:a11y:smoke` on 13 public routes (critical hard-fail; CI `web-a11y-smoke` non-blocking).  
**Residual:** dashboard/settings/sessions axe; contrast/focus CI gate (`GO_SPOTS_TEST_MATRIX.md`).

---

## Scope boundaries

| In scope (post-submit lanes) | Out of scope / later |
|------------------------------|----------------------|
| Dashboard **en/pl** string extraction for ops + auth | Perfect de/fr/es/ar dashboard parity |
| Focus trap modal primitive + focus-visible tokens | Full WCAG AAA |
| Contrast pass on tenant shell + settings + sessions | Marketing landing redesign |
| axe smoke on login, settings, sessions, messages | Rewriting floor editors as fully keyboard-first v1 |
| i18n key-parity test en⊆pl for dashboard namespaces | API error localization / email i18n |

---

## Phased post-submit plan

### Phase 0 — Baseline (≤3 days, low risk)

1. Add **focus-visible** ring tokens in tenant CSS; apply to buttons/links/inputs in shell + shared UI.
2. Upgrade shared **dialog/modal** helper: focus trap, Escape, return focus (start with `ConfirmDialog` + 1 ops dialog).
3. Wire **axe** (or equivalent) smoke on: `/login`, dashboard settings, sessions, messages — fail CI on serious/critical only.
4. Document “string in catalog” rule in web AGENTS or a short `I18N.md` note (no big refactor yet).

**Exit:** Keyboard can open/close confirm without mouse; axe clean on those four routes for serious issues.

### Phase 1 — Dashboard en/pl for ops (1–2 weeks)

Extract user-visible strings into `i18n.ts` **en + pl** (keep de/fr/es/ar on English fallback):

1. **Sessions** page + booking dialogs / agenda chrome  
2. **Messages** + notification inbox copy  
3. **Orders / play-billing** staff-facing chrome  
4. Shell leftover English `aria-label`s → `t()`  

**Exit:** With shop locale `pl`, sidebar + settings + sessions + messages read Polish end-to-end (errors may still be EN).

### Phase 2 — Auth + labels + contrast (parallelizable)

1. Auth pages: small catalog slice or reuse `common` + `auth.*` en/pl; honor browser/`?lang` or last shop locale if known.  
2. Audit icon-only buttons in finance + staff; add names.  
3. Contrast pass: replace borderline zinc text tokens; verify light/dark if both ship.  
4. Key-parity unit test: every dashboard en leaf has pl leaf (same namespaces).

**Exit:** Login/register usable in PL; AA contrast on primary text/roles for shell + forms.

### Phase 3 — Maps & live regions (stretch)

1. Agenda/list keyboard path for primary booking actions (complement floor map).  
2. Consistent `aria-live` for notification toasts and chat “guest waiting.”  
3. Optional: deepen de/fr/es/ar dashboard only for `nav`/`common`/`settings` already partial — **not** full ops until en/pl stable.

### Phase 4 — Public polish (optional, separate lane)

Public catalog is healthier; treat as maintenance: key-parity check en⊆pl (and peers), guest booking dialog keyboard audit, avoid blocking dashboard work.

---

## Suggested lane split (when implementing)

| Lane | Owns | Avoid |
|------|------|-------|
| Q1-a11y-baseline | Shared UI + `globals.css` focus/dialog + axe smoke | Mass string moves |
| Q2-i18n-ops-enpl | Sessions / messages / notifications strings → `i18n.ts` en/pl | Auth, public-i18n rewrite |
| Q3-a11y-contrast-labels | Tokens + icon names + auth a11y | Floor editor rewrite |
| Q4-i18n-auth-enpl | Auth pages catalog | Ops pages |

Claim via `AGENT_COORDINATION.md`; do not parallelize two lanes on `i18n.ts` without sequencing.

---

## Non-goals before Friday

- No new i18n framework (keep custom catalogs).  
- No screenshot/visual regression suite.  
- No claim of WCAG 2.2 AA product-wide until Phases 0–2 exit.  
- No apps code in this design lane.

---

## References

| Doc / code | Relevance |
|------------|-----------|
| `GO_SPOTS_DEEP_AUDIT.md` §2.20 | a11y/i18n PARTIALLY |
| `GO_SPOTS_TEST_MATRIX.md` | i18n / a11y smoke Need |
| `FOUR_DAY_SHIP_PLAN.md` / `REMAINING_P0_FRIDAY.md` | Sweeps deferred post-submit |
| `apps/web/src/lib/i18n.ts` | Dashboard catalogs |
| `apps/web/src/lib/public-i18n.ts` | Public catalogs |
| `apps/web/src/lib/venue-settings-context.tsx` | `t()` + RTL dir |
| `apps/web/src/components/ui/confirm-dialog.tsx` | Dialog a11y baseline |

---

## Verify (this lane)

n/a (docs only)
