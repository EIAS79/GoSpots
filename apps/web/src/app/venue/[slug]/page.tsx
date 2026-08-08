import type { Metadata } from "next";
import { cache } from "react";
import { PublicVenueClient } from "@/components/venues/public/public-venue-client";
import { getApiBaseUrl } from "@/lib/api-base-url";
import { venueJsonLd } from "@/lib/seo/structured-data";
import type { PublicVenueDetail } from "@/lib/shop-settings-client";
import { getSiteUrlString } from "@/lib/site-url";
import {
  formatVenueLocation,
  venueMarketingName,
} from "@/lib/venue-display";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const loadPublicVenue = cache(async (slug: string) => {
  try {
    const res = await fetch(
      `${getApiBaseUrl()}/public/venues/${encodeURIComponent(slug)}`,
      {
        cache: "no-store",
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as PublicVenueDetail;
  } catch {
    return null;
  }
});

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const venue = await loadPublicVenue(slug);
  if (!venue) {
    return {
      title: "Venue not found",
      description: "This venue is not available or is not published.",
      robots: { index: false, follow: false },
    };
  }

  const name = venueMarketingName(venue);
  const location = formatVenueLocation(venue);
  const description =
    venue.description?.trim() ||
    (location ? `${name} — ${location}` : `${name} on GoSpots`);
  const canonical = `${getSiteUrlString()}/venue/${encodeURIComponent(venue.slug)}`;

  return {
    title: name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title: name,
      description,
      ...(venue.coverImage
        ? { images: [{ url: venue.coverImage, alt: name }] }
        : undefined),
    },
  };
}

export default async function PublicVenuePage({ params }: PageProps) {
  const { slug } = await params;
  const venue = await loadPublicVenue(slug);

  return (
    <>
      {venue ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(venueJsonLd(venue)).replace(/</g, "\\u003c"),
          }}
        />
      ) : null}
      <PublicVenueClient slug={slug} initialVenue={venue} />
    </>
  );
}
