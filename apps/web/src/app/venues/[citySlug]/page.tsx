import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityLanding } from "@/components/venues/city-landing";
import {
  getPilotCityBySlug,
  PILOT_CITIES,
} from "@/lib/pilot-cities";

type PageProps = {
  params: Promise<{ citySlug: string }>;
};

export function generateStaticParams() {
  return PILOT_CITIES.map((c) => ({ citySlug: c.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { citySlug } = await params;
  const city = getPilotCityBySlug(citySlug);
  if (!city) {
    return { title: "City not found — GoSpots" };
  }
  return {
    title: `Gaming venues in ${city.name} — GoSpots`,
    description: `City-first GoSpots directory for ${city.name}, ${city.countryName}. Venue owners: join the local launch. Guests: browse when the map is full.`,
  };
}

/** City landing for marketplace GTM (bible #35 Phase A) — not the full `/venues` grid. */
export default async function CityLandingPage({ params }: PageProps) {
  const { citySlug } = await params;
  const city = getPilotCityBySlug(citySlug);
  if (!city) notFound();
  return <CityLanding city={city} />;
}
