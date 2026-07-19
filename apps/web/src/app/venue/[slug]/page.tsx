import type { Metadata } from "next";
import { cache } from "react";
import { PublicVenueClient } from "@/components/venues/public/public-venue-client";
import { getApiBaseUrl } from "@/lib/api-base-url";
import type { PublicVenueDetail } from "@/lib/shop-settings-client";
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
    };
  }

  const name = venueMarketingName(venue);
  const location = formatVenueLocation(venue);
  const description =
    venue.description?.trim() ||
    (location
      ? `${name} — ${location}`
      : `${name} on GoSpots`);

  return {
    title: name,
    description,
    openGraph: {
      title: name,
      description,
      ...(venue.coverImage
        ? { images: [{ url: venue.coverImage }] }
        : undefined),
    },
  };
}

export default async function PublicVenuePage({ params }: PageProps) {
  const { slug } = await params;
  const venue = await loadPublicVenue(slug);

  return <PublicVenueClient slug={slug} initialVenue={venue} />;
}
