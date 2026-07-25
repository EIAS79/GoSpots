/**
 * Shared marketing-page motion tokens.
 * Prefer opacity + transform only — no blur/shadow/layout animation.
 */

export const motionEase = [0.22, 1, 0.36, 1] as const;

export const motionDuration = {
  fast: 0.18,
  normal: 0.32,
  section: 0.55,
  sectionCompact: 0.38,
  hero: 0.7,
} as const;

export const motionDistance = {
  mobile: 12,
  desktop: 22,
} as const;

export const motionStagger = {
  compact: 0.04,
  normal: 0.07,
} as const;

/** Hero content choreography (ms → seconds for Framer). */
export const heroEntrance = {
  badge: 0.08,
  titleA: 0.14,
  titleB: 0.21,
  subtitle: 0.3,
  cta: 0.38,
  trust: 0.45,
  preview: 0.48,
} as const;

export const sectionRevealViewport = {
  once: true,
  amount: 0.18,
  margin: "0px 0px -8% 0px",
} as const;
