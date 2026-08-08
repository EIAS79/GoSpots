import type { PublicVenueDetail } from "@/lib/shop-settings-client";
import { BRAND_NAME, BRAND_SUPPORTING } from "@/lib/brand";
import { getSiteUrlString } from "@/lib/site-url";

export function organizationJsonLd() {
  const url = getSiteUrlString();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND_NAME,
    url,
    logo: `${url}/brand/gospots-icon.png`,
    description: BRAND_SUPPORTING,
  };
}

export function websiteJsonLd() {
  const url = getSiteUrlString();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BRAND_NAME,
    url,
    description: BRAND_SUPPORTING,
    potentialAction: {
      "@type": "SearchAction",
      target: `${url}/venues?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function softwareApplicationJsonLd() {
  const url = getSiteUrlString();
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url,
    description: BRAND_SUPPORTING,
  };
}

function openingHoursSpecification(venue: PublicVenueDetail) {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return venue.openingHours
    ?.filter((hour) => !hour.isClosed)
    .map((hour) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: days[(hour.weekday + 6) % 7],
      opens: hour.opensAt,
      closes: hour.closesAt,
    }));
}

export function venueJsonLd(venue: PublicVenueDetail) {
  const url = `${getSiteUrlString()}/venue/${encodeURIComponent(venue.slug)}`;
  const isRestaurant = venue.tags?.some((tag) => /restaurant|dining|food|cafe/i.test(`${tag.name} ${tag.slug}`));
  const type = isRestaurant ? "Restaurant" : "LocalBusiness";

  return {
    "@context": "https://schema.org",
    "@type": type,
    name: venue.displayName?.trim() || venue.name,
    url,
    ...(venue.description ? { description: venue.description } : {}),
    ...(venue.coverImage ? { image: venue.coverImage } : {}),
    ...(venue.phone ? { telephone: venue.phone } : {}),
    ...(venue.email ? { email: venue.email } : {}),
    ...(venue.address || venue.city || venue.country
      ? {
          address: {
            "@type": "PostalAddress",
            ...(venue.address ? { streetAddress: venue.address } : {}),
            ...(venue.city ? { addressLocality: venue.city } : {}),
            ...(venue.country ? { addressCountry: venue.country } : {}),
          },
        }
      : {}),
    ...(venue.averageRating && venue.reviewCount
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: venue.averageRating,
            reviewCount: venue.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(openingHoursSpecification(venue)?.length
      ? { openingHoursSpecification: openingHoursSpecification(venue) }
      : {}),
  };
}
