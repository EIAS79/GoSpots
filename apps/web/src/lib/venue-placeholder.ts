/** Local SVG — avoids broken upstream Unsplash URLs in dev/prod. */
export const VENUE_PLACEHOLDER_SRC =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#27272a"/>
          <stop offset="50%" stop-color="#18181b"/>
          <stop offset="100%" stop-color="#09090b"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#g)"/>
      <circle cx="900" cy="180" r="120" fill="#f59e0b" opacity="0.08"/>
      <circle cx="240" cy="620" r="160" fill="#22d3ee" opacity="0.07"/>
      <text x="600" y="390" fill="#71717a" font-family="system-ui,sans-serif" font-size="28" text-anchor="middle">Locora venue</text>
      <text x="600" y="430" fill="#52525b" font-family="system-ui,sans-serif" font-size="16" text-anchor="middle">Cover image coming soon</text>
    </svg>`,
  );

export function venueCoverSrc(src: string | null | undefined, resolved?: string | null) {
  const url = resolved ?? src;
  return url?.trim() ? url : VENUE_PLACEHOLDER_SRC;
}

export function isDataPlaceholder(src: string) {
  return src.startsWith("data:");
}
