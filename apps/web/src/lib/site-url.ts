/** Canonical site URL for metadata and OG tags (override in prod with NEXT_PUBLIC_SITE_URL). */
export function getSiteUrlString(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`;
  return "https://Locora.vercel.app";
}
