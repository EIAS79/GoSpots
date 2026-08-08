const PRODUCTION_CANONICAL_SITE_URL = "https://www.gospots.eu";

/**
 * Canonical site URL for metadata, structured data, sitemap and robots.
 * Production always resolves to www.gospots.eu so an accidental Vercel env
 * value cannot make .pl or a deployment hostname canonical.
 */
export function getSiteUrlString(): string {
  if (process.env.NODE_ENV === "production") {
    return PRODUCTION_CANONICAL_SITE_URL;
  }

  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`;
  }

  return PRODUCTION_CANONICAL_SITE_URL;
}
