# Homepage performance baseline

Captured against the GoSpots marketing homepage (`apps/web`) **before** the
optimisation pass documented in `HOMEPAGE_OPTIMISATION_REPORT.md`.

Date: 2026-07-25  
Environment: local Windows, Node 26.x (engines want 24.x), `next build` + code audit.

## Inspection classification

| Suspected issue | Status |
| --- | --- |
| Broad `"use client"` on `landing-page.tsx` | **CONFIRMED** |
| Hero collage: 12 images × 4 columns × duplicated loop | **CONFIRMED** |
| Multiple collage tiles marked `priority` | **CONFIRMED** |
| Column motion + scroll parallax simultaneously | **CONFIRMED** |
| Word-by-word headline motion spans | **CONFIRMED** |
| Live preview intervals + AnimatePresence | **CONFIRMED** |
| Magnetic `getBoundingClientRect` every move | **CONFIRMED** |
| Per-section / per-card Framer observers | **CONFIRMED** |
| Large blur / backdrop-blur / glow stacks | **PARTIALLY CONFIRMED** |
| Below-the-fold sections eager in client graph | **CONFIRMED** |
| Continuous animations stay active offscreen | **CONFIRMED** (collage, marquee, live preview) |
| Compact viewport already tones some motion | **ALREADY OPTIMISED** (partial — Reveal was fully off on phones) |

## Structural costs (code audit)

- Landing composition forced the full section tree into one client module.
- Hero collage built **4** columns with **two** distribution passes + DOM duplicate for looping.
- `useScroll` / `useTransform` parallax ran while columns already translated infinitely.
- Hero entrance used per-word `motion.span` plus badge / subtitle / CTA / trust / preview.
- Magnetic always mounted springs on non-compact viewports (including coarse pointers).
- Marquee duplicated children and never paused offscreen.
- Section dividers each spun a Framer `whileInView` observer for a 2px dot.

## Hero image inventory (public/hero)

| File | Approx size |
| --- | --- |
| restaurant.jpg | 158 KB |
| arcade.jpg | 138 KB |
| cafe.jpg | 135 KB |
| billiard.jpg | 86 KB |
| bowling.jpg | 86 KB |
| bar.jpg | 74 KB |
| esports.jpg | 70 KB |
| boardgame.jpg | 56 KB |
| darts.jpg | 56 KB |
| pcgaming.jpg | 48 KB |
| controller.jpg | 24 KB |
| neon.jpg | 18 KB |
| **Total source** | **~949 KB** |

Many tiles were also duplicated in the DOM for looping and several were `priority`.

## Measurement notes

Full Lighthouse CI was not available in this environment at baseline capture time.
Use the production build route bundle summary (after `pnpm --filter @gospots/web run build`)
and Chrome Performance on:

- 390×844 + 4× CPU + Slow 4G
- 1440×900 desktop

as the before/after comparison surface. Record numbers in the optimisation report
after the production build completes.

## Targets (from optimisation brief)

| Metric | Target |
| --- | --- |
| Mobile Lighthouse Performance | ≥ 85 |
| Desktop Lighthouse Performance | ≥ 92 |
| LCP | < 2.5 s |
| INP | < 200 ms |
| CLS | < 0.1 |
| Offscreen continuous motion | paused |
| Initial hero image transfer (mobile) | prefer < 500–800 KB |
