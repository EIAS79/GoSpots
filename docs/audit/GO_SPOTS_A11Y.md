# Locora — Accessibility residual plan (Bible §29 / #29)

**Date:** 2026-07-22 (residual docs lane **A11Y29-residual-docs**)  
**Status:** Public axe smoke ship bar **DONE** (Lane **WWWWW**). Dashboard axe, focus management, contrast pass, and hard CI gate remain **explicitly deferred** — phased plan below. **Do not claim WCAG 2.2 AA product-wide until Phases 0–2 exit.**  
**Bible:** P2 **§29** / **#29** — web accessibility.  
**Combined a11y + i18n design (historical):** [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md). **§30 i18n residual:** [`GO_SPOTS_I18N.md`](./GO_SPOTS_I18N.md).

---

## Shipped vs residual (honest)

| Item | State | Evidence |
|------|--------|----------|
| Public axe smoke — **13 routes** | **DONE** | `apps/web/e2e/a11y.spec.ts`; `pnpm --filter @gospots/web run test:a11y:smoke` |
| Critical violations hard-fail | **DONE** | Spec filters `impact === "critical"` only |
| Serious/moderate/minor soft-log (no fail) | **DONE** | `console.warn` in spec — known noise documented |
| Skip entire suite when Next down | **DONE** | `beforeAll` + Node `http` probe (not undici `fetch`) |
| CI job `web-a11y-smoke` | **DONE** (non-blocking) | `.github/workflows/ci.yml`; `continue-on-error: true` — **does not boot Next** |
| Scattered `aria-*` on public + tenant chrome | **DONE** (partial coverage) | `tenant-shell`, `venue-switcher`, `confirm-dialog`, booking dialogs, etc. |
| `ConfirmDialog` alertdialog semantics | **DONE** | `role="alertdialog"` + `aria-labelledby` / `aria-describedby` |
| `prefers-reduced-motion` hooks | **DONE** | `apps/web/src/app/globals.css` — marquee/hero motion paused |
| Notification toasts `aria-live="polite"` | **DONE** | `notification-toasts.tsx` |
| Offline banner `role="status"` | **DONE** | `offline-banner.tsx` |
| Auth form visible labels + `autoComplete` | **DONE** (baseline) | Login `Field` components |
| Dashboard authenticated axe | **RESIDUAL** | Settings, sessions, messages, finance need cookie auth + venue bind |
| Shared modal focus trap + restore | **RESIDUAL** | `ModalPortal` portals only — **no** trap, Escape standard, or focus restore |
| Global `focus-visible` tokens | **RESIDUAL** | One consumer (`section-info-tip.tsx`); most chrome uses browser default |
| Contrast / color-only status pass | **RESIDUAL** | Soft axe: `color-contrast`, `link-in-text-block` on several public routes |
| Hard CI gate (serious+ fail + Next in Actions) | **RESIDUAL** | Needs Next boot + auth secrets for dashboard routes |
| Web eslint / `jsx-a11y` baseline | **RESIDUAL** | `eslint-plugin-jsx-a11y` transitive via Next config; web lint **not CI-gated** |
| Skip link / skip-to-content | **RESIDUAL** | Not present |
| Floor/map keyboard-first paths | **RESIDUAL** (stretch) | Pointer-first editors; progressive enhancement only |
| Product-wide WCAG 2.2 AA attestation | **RESIDUAL** | Explicit non-goal until Phases 0–2 exit |

**§29 classification:** **PARTIAL** — public smoke ship bar met; dashboard and polish residuals documented here, not hidden.

---

## Ship bar (Lane WWWWW — public routes only)

| In scope (DONE) | Explicit residual |
|-----------------|-------------------|
| `test:a11y:smoke` on **13** public routes (see table below) | Dashboard / settings / sessions / messages / finance axe |
| WCAG 2.x tags via axe (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) | Fail CI on serious+ (today: critical only) |
| Critical hard-fail; soft-log serious/moderate/minor | Formal contrast + focus-trap sweep |
| Skip when Next is down (exit 0) | Boot Next in Actions + auth fixture for staff routes |
| Reliable probe via Node `http` (Windows-safe) | `eslint-plugin-jsx-a11y` enforced baseline |
| Optional CI job `web-a11y-smoke` (`continue-on-error`) | Product-wide AA claim |

### Public routes in smoke (13)

| Route | Notes |
|-------|-------|
| `/` | Marketing home |
| `/login` | Auth entry |
| `/register` | Owner signup |
| `/forgot-password` | Auth recovery |
| `/reset-password` | Auth recovery |
| `/staff/activate` | Staff onboarding |
| `/venues` | Guest discovery |
| `/for-venues` | Owner landing |
| `/privacy` | Legal |
| `/terms` | Legal |
| `/venue/a11y-smoke/gaming-status/a11y-placeholder` | Guest status shell (placeholder token) |
| `/venue/a11y-smoke/dining-status/a11y-placeholder` | Guest status shell |
| `/venue/a11y-smoke/event-status/a11y-placeholder` | Guest status shell |

**Verify (with Next on `:3000`):** **13 passed**, no critical. Soft violations typically include `color-contrast` and `link-in-text-block`. **Without Next:** **13 skipped**.

---

## What exists today (code truth)

### Automated testing

| Piece | Role |
|-------|------|
| `apps/web/e2e/a11y.spec.ts` | Playwright + `@axe-core/playwright`; per-route analyze |
| `apps/web/package.json` → `test:a11y:smoke` | Local / CI entry |
| Root `package.json` → `test:a11y:smoke` | Monorepo shortcut |
| `.github/workflows/ci.yml` → `web-a11y-smoke` | Installs Chromium; runs smoke **without** starting Next → usually all skip |

### Component patterns (manual / partial)

| Area | Evidence | Gap |
|------|----------|-----|
| **Tenant shell** | Mobile nav `aria-expanded`, `aria-modal`, labelled open/close; sign-out `aria-label` via `t()` | Drawer does not trap focus or restore on close |
| **Venue switcher** | `listbox` / `option` / `aria-selected` | Modal uses `ModalPortal` only |
| **Confirm dialog** | `alertdialog` + labelled title/description | No focus trap; backdrop click dismisses; no Escape |
| **Modals generally** | ~15 consumers of `ModalPortal` (reservations, finance, dining/gaming editors, public booking) | Portal helper has **no** a11y behavior |
| **Public booking dialog** | `aria-modal`, `aria-labelledby`, close label, `aria-live="polite"` on status | Contrast soft failures possible |
| **Notifications** | Toast region `aria-live="polite"`; dismiss labels via `t()` | Inbox list live regions incomplete |
| **Offline** | `role="status"` + `aria-live="polite"` | — |
| **Motion** | `prefers-reduced-motion` in CSS | Not exhaustive on all animations |
| **Focus visible** | `section-info-tip.tsx` uses `focus-visible:outline-*` | Rest of dashboard relies on browser default |

### Explicitly absent (residual)

| Gap | Why it matters |
|-----|----------------|
| Authenticated axe matrix | Staff spend most time in dashboard — untested by automation today |
| Focus trap primitive | Keyboard users can Tab behind modals; focus lost on open/close |
| Contrast tokens | Dark zinc palette (`text-zinc-400` on near-black) fails soft axe on public pages |
| Hard CI gate | Merge bar does not enforce a11y; job skips when Next absent |
| Skip link | No bypass block for keyboard users on long pages |
| eslint jsx-a11y | Static analysis not part of web lint gate (`GO_SPOTS_TEST_MATRIX.md`) |

---

## Why dashboard axe is deferred

| Constraint | Detail |
|------------|--------|
| Cookie auth | Staff routes need session cookies after login |
| Venue bind | Dashboard URLs require `dashboardPath` / venue context |
| CI secrets | GitHub Actions would need test credentials + stable seed shop |
| Flake risk | Cold Next compile + Playwright already use **60s** timeout on public routes |

**Interim:** Manual axe on `/login` + spot-check settings after login locally. Automated dashboard matrix is Phase 0 exit criteria.

---

## Phased residual plan

### Phase 0 — Baseline (≤3 days, low risk)

| Work | Notes |
|------|--------|
| **focus-visible** ring tokens | Tenant CSS; apply to shell buttons/links/inputs |
| **Modal primitive** | Trap Tab, Escape, initial focus, restore opener — start with `ConfirmDialog` + one ops dialog |
| **Dashboard axe smoke** | Add Playwright auth fixture; axe `/login` post-auth redirect, settings, sessions, messages — **serious+ fail** locally |
| **Document rule** | New interactive control → visible label or `aria-label` |

**Exit:** Confirm dialog keyboard-complete; axe **serious-clean** on four staff routes locally.

### Phase 1 — Labels + live regions (1 week)

| Work | Notes |
|------|--------|
| Icon-only audit | Finance + ops toolbars — every control named |
| `aria-label` locale | Wire shell labels through `t()` where English-only today (pairs with §30 i18n) |
| `aria-live` consistency | Toasts, chat “guest waiting”, booking status updates |
| Mobile drawer focus | Move focus into nav panel; restore on close |

**Exit:** No unnamed icon buttons in shell + finance hub; polite live regions on notification path.

### Phase 2 — Contrast + public polish (parallelizable)

| Work | Notes |
|------|--------|
| Contrast pass | Replace borderline `text-zinc-400/500` with tokenized roles meeting AA |
| Status not color-only | Floor busy/free, chart series — pair hue with text or icon |
| Public route soft violations | Drive `color-contrast` / `link-in-text-block` to zero on 13-route matrix |
| Skip link | Optional `Skip to main content` on marketing + tenant layout |

**Exit:** 13 public routes serious-clean; primary dashboard text meets AA on shell + forms.

### Phase 3 — Complex widgets (stretch)

| Work | Notes |
|------|--------|
| Agenda/list keyboard path | Complement floor map for primary booking actions |
| Map progressive enhancement | Labelled unit controls where present; document pointer-first limitation |
| Reduced motion audit | Remaining CSS/JS animations respect `prefers-reduced-motion` |

**Exit:** Primary booking workflow usable without pointer on sessions page (list path).

### Phase 4 — CI hard gate (**RESIDUAL** until Phase 0–2 stable)

| Work | Notes |
|------|--------|
| Boot Next in Actions | `pnpm --filter @gospots/web run build && start` or preview server |
| Auth fixture | Encrypted repo secrets → login → venue bind for dashboard routes |
| Fail on serious+ | Remove soft-log-only policy for merged routes |
| Optional: eslint jsx-a11y | Enable web lint in CI once baseline green (`GO_SPOTS_TEST_MATRIX.md` §34) |

**Exit:** PR merge blocked on public + dashboard axe serious-clean; CI no longer skip-by-default.

---

## Operator / developer verify

```bash
# Public smoke (needs Next on :3000)
pnpm --filter @gospots/web run dev
pnpm --filter @gospots/web run test:a11y:smoke

# Without server — expect 13 skipped, exit 0
pnpm --filter @gospots/web run test:a11y:smoke

# Typecheck (unchanged gate)
pnpm --filter @gospots/web run typecheck
```

**CI today:** `web-a11y-smoke` runs without Next → typically **13 skipped**; job is **non-blocking** (`continue-on-error: true`).

---

## Non-goals

- WCAG 2.2 **AAA** or formal VPAT before Phase 2 exit  
- Full keyboard rewrite of floor/layout editors in v1  
- Screenshot / visual regression suite  
- Native mobile app a11y (web only)  
- API error message accessibility (screen-reader exposure of raw `e.message` — track under §30/§36; domain `code` plan [`GO_SPOTS_API_ENVELOPE.md`](./GO_SPOTS_API_ENVELOPE.md))

---

## References

| Doc / code | Relevance |
|------------|-----------|
| [`GO_SPOTS_A11Y_I18N.md`](./GO_SPOTS_A11Y_I18N.md) | Combined design (historical) |
| [`GO_SPOTS_I18N.md`](./GO_SPOTS_I18N.md) | **§30 canonical** shipped vs residual + Phases 0–4 |
| [`GO_SPOTS_TEST_MATRIX.md`](./GO_SPOTS_TEST_MATRIX.md) | A11y row: public **P**, dashboard **N** |
| [`GO_SPOTS_FIX_PLAN.md`](./GO_SPOTS_FIX_PLAN.md) | §29/§34 dashboard axe + CI gates |
| `apps/web/e2e/a11y.spec.ts` | Public smoke implementation |
| `apps/web/src/components/ui/modal-portal.tsx` | Portal-only — trap deferred |
| `apps/web/src/components/ui/confirm-dialog.tsx` | Dialog semantics baseline |
| `.github/workflows/ci.yml` | `web-a11y-smoke` job |

---

## Verify (this lane)

n/a (docs only)
