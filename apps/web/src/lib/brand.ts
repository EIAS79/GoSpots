export const BRAND_NAME = "GoSpots";
/** Short brand mantra under the wordmark (nav / chrome). */
export const BRAND_TAGLINE = "Discover · Go · Enjoy";

/** Supporting SEO / hero line — verticals + dashboard + public site */
export const BRAND_SUPPORTING =
  "Dashboard for gaming centers, restaurants, and venues — publish your site, take reservations, collect reviews.";

/** Horizontal lockup — dark navy wordmark (light backgrounds) */
export const BRAND_LOGO_SRC = "/brand/gospots-logo.png";
/** Horizontal lockup — white wordmark (dark chrome / hero) */
export const BRAND_LOGO_LIGHT_SRC = "/brand/gospots-logo-light.png";
/** Gold pin only — same mark that sits inside the logo lockup (not a second logo) */
export const BRAND_MARK_SRC = "/brand/gospots-mark.png";
/** Square app icon — browser tab / apple / PWA */
export const BRAND_ICON_SRC = "/brand/gospots-icon.png";
export const BRAND_OG_SRC = "/brand/gospots-og.png";

/**
 * Drop assets under `apps/web/public/brand/`:
 * - `gospots-logo.png` — horizontal icon + GoSpots wordmark (dark text)
 * - `gospots-logo-light.png` — same lockup with light wordmark
 * - `gospots-mark.png` — gold pin alone (extracted from the lockup)
 * - `gospots-icon.png` — square tab / app icon
 * - `gospots-og.png` — optional OG share image
 * Also copy the square icon to `apps/web/src/app/icon.png` + `favicon.ico`
 *
 * Regenerate from exports: `python apps/web/scripts/process-brand-assets.py`
 */