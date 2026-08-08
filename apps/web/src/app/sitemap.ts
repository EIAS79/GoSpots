import type { MetadataRoute } from "next";
import { getApiBaseUrl } from "@/lib/api-base-url";
import { getSiteUrlString } from "@/lib/site-url";
import type { PublicVenuesResponse } from "@/lib/shop-settings-client";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrlString();
  const staticEntries: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/venues`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/for-venues`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${siteUrl}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  try {
    const res = await fetch(`${getApiBaseUrl()}/public/venues`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return staticEntries;

    const data = (await res.json()) as PublicVenuesResponse;
    const venueEntries: MetadataRoute.Sitemap = data.items.map((venue) => ({
      url: `${siteUrl}/venue/${encodeURIComponent(venue.slug)}`,
      changeFrequency: "daily",
      priority: 0.8,
    }));

    return [...staticEntries, ...venueEntries];
  } catch {
    return staticEntries;
  }
}
