const PRODUCTION_CANONICAL_SITE_URL = "https://www.gospots.eu";

/**
 * Canonical site URL for metadata, structured data, sitemap and robots.
 * gospots.pl may serve the same application, but search-facing canonical URLs
 * remain on gospots.eu unless NEXT_PUBLIC_SITE_URL deliberately overrides them.
 */
export function getSiteUrlString(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_CANONICAL_SITE_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`;
  }

  return PRODUCTION_CANONICAL_SITE_URL;
}
