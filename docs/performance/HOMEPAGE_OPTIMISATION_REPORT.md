# Homepage optimisation report

Date: 2026-07-25  
App: `apps/web` (Next.js 16.2.6 / React 19)  
Build: `pnpm --filter @gospots/web run build` — **succeeded** (~41s compile, TS clean).

## Before

See [`HOMEPAGE_BASELINE.md`](./HOMEPAGE_BASELINE.md) for the inspection classification.

Primary costs:

1. Entire `LandingPage` behind `"use client"`.
2. Hero collage: 4 columns + dual distribution passes + loop duplicates + scroll parallax + many `priority` images.
3. Word-by-word headline Framer spans overlapping collage motion, shine, magnetic CTA, live preview timers.
4. Marquee / collage / live preview never paused when offscreen.
5. Magnetic called `getBoundingClientRect` on every pointer move.
6. Section dividers each owned a Framer observer for a decorative dot.
7. Compact mode previously **disabled** section reveals entirely (sections felt static / sometimes blank).

## Changes

| File | Previous | New | Why | Visual |
| --- | --- | --- | --- | --- |
| `landing-page.tsx` | Client shell importing everything | **Server** composition + `MotionProvider` + `SectionReveal` per section + `dynamic()` for below-fold | Shrink client graph; keep SSR | Same layout |
| `lib/motion-system.ts` | — | Shared ease / duration / distance / hero timing | One choreography language | Consistent motion |
| `lib/motion-capability.ts` | Width-only compact | `full` / `balanced` / `compact` / `reduced` (+ fine pointer, save-data, memory/cores hints) | Adaptive quality | Premium desktop, lighter phone |
| `lib/use-active-when-visible.ts` | — | IO + Page Visibility | Pause continuous FX offscreen | No visual change when scrolled away |
| `effects/section-reveal.tsx` | Ad-hoc Reveals | Shared opacity+y reveal (+ optional stagger) | One entrance per section | Premium section transitions remain |
| `effects/reveal.tsx` | Off on compact | Short/small reveal on compact; instant on reduced | Mobile stays animated | Softer phone entrances |
| `effects/motion-provider.tsx` | Full `motion` everywhere | `LazyMotion` + `domAnimation` | Smaller Framer feature set for `m.*` | Same |
| `effects/magnetic.tsx` | Always (non-compact) | Fine pointer + `full` only; bounds on enter; rAF | No touch thrash | Desktop CTA only |
| `effects/marquee.tsx` | Always looping | Pause offscreen; compact = horizontal scroll row | Less main-thread work | Same content |
| `effects/section-divider.tsx` | Framer whileInView | Static gradient + dot | Remove observers | Same separation |
| `landing/hero.tsx` | Word stagger + AnimatePresence | ~6 phrase-level entrance groups; timed via `heroEntrance` | Fewer motion nodes | Still premium hero |
| `landing/hero-collage.tsx` | 4 cols + parallax + many priority | 3 cols; **no parallax**; pause when offscreen; 1 priority tile; single distribution pass | One continuous BG system | Same vibe, calmer |
| `landing/live-preview.tsx` | Timers always (desktop) | Pause offscreen; static on compact/reduced | No setState loop when away | Same when visible |
| `landing/stats-strip.tsx` | Per-card whileInView | `SectionReveal` stagger | Shared tokens | Soft card stagger |
| `scripts/perf-smoke.mjs` | — | File + optional HTTP smoke | Repeatable check | — |
| Docs | — | Baseline + this report | Honesty / budgets | — |

## After

### Build

- Production build: **pass**
- Typecheck: **pass**
- Route `/` remains static (○)

### Architecture outcome

```text
Continuous (when in view + document visible + not compact/reduced):
  - Hero collage columns (transform only)
  - Marquee (desktop/balanced)

Once:
  - Hero content entrance (~6 groups)
  - SectionReveal per major section
  - Optional small staggers (stats)

Pointer (full + fine pointer only):
  - Magnetic primary CTA

Paused / simplified on compact:
  - Static collage poster
  - Scrollable marquee row
  - No magnetic / shine / live timers
  - Short SectionReveal still runs
```

### Metrics to capture locally (Chrome)

Run production:

```bash
pnpm --filter @gospots/web run build
pnpm --filter @gospots/web run start
pnpm --filter @gospots/web run perf:smoke
```

Then Lighthouse (mobile 390×844, 4× CPU, Slow 4G) and desktop 1440×900.
Fill in:

| Metric | Before | After |
| --- | --- | --- |
| Lighthouse Performance (mobile) | — | _measure_ |
| Lighthouse Performance (desktop) | — | _measure_ |
| LCP | — | _measure_ |
| INP | — | _measure_ |
| CLS | — | _measure_ |
| Initial JS transferred | — | _measure_ |
| Hero image requests (first paint) | many + priority spam | prefer 1 priority + lazy rest |
| Offscreen continuous FX | running | paused |

This environment did not run an automated Lighthouse CI agent; do not treat empty cells as “improved”.

## Motion inventory

| Animation | Component | Active when | Paused when | Mobile | Reduced motion |
| --- | --- | --- | --- | --- | --- |
| Collage columns | `HeroCollage` | In view + full/balanced | Offscreen, hidden tab, compact | Static tiles | Static |
| Marquee | `Marquee` | In view + full/balanced | Offscreen / compact | Scroll row | Static row |
| Hero entrance | `Hero` | Mount | — | Faster/shorter | Instant |
| Section reveal | `SectionReveal` | Once near viewport | After complete | Shorter y/duration | Instant |
| Stats stagger | `StatsStrip` | Once | After complete | Compact stagger | Instant |
| Magnetic CTA | `Magnetic` | Full + fine pointer | Touch / balanced / compact | Off | Off |
| Live preview timers | `LivePreview` | In view + not compact | Offscreen / compact | Static | Static |
| Features rail draw | `Features` | Scroll (existing) | Compact uses full rail | Simplified | Simplified |
| Shine / soft pulse | CSS | Full desktop hero | Compact / reduced | Off | Off |

## Remaining limitations

- Hero photographs are still JPG (~0.9 MB total source); AVIF/WebP conversion not done in this pass (Next Image still serves optimized derivatives at request time).
- Nested `Reveal` / card `whileInView` still exists inside some section components (who-its-for, audience, features, pricing, venues). Outer `SectionReveal` already covers section entrance; further dedupe is optional follow-up.
- Features timeline still uses scroll-linked spring on desktop — acceptable but not free.
- No Lighthouse CI wired yet; `perf:smoke` is a smoke gate, not a score budget.
- `LazyMotion` covers `m.*` / `SectionReveal` / `Reveal`; some sections still import full `motion` (hero, pricing, features, faq). Migrating those to `m` is a good next step.
- Aurora / global paint layers were already reduced on compact in an earlier pass; not re-audited here beyond homepage composition.

## Core rule followed

Fewer **simultaneous** systems, not fewer sections:

- One continuous hero background effect (columns **or** static — no parallax combo)
- One hero entrance sequence
- One reveal per section
- Small staggers only where useful
- Continuous FX paused offscreen
- Mobile remains animated (short opacity + translate), not blank
