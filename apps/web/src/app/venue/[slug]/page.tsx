"use client";

import { Loader2, MapPin } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { GoSpotsLogo } from "@/components/brand/gospots-logo";
import { fetchPublicVenue, type PublicVenueDetail } from "@/lib/shop-settings-client";
import { resolveMediaUrl } from "@/lib/media-url";
import { formatVenueLocation, venueMarketingName } from "@/lib/venue-display";

const PLACEHOLDER =
  "https://images.unsplash.com/photo-1615722440048-da4fd9202b9d?auto=format&fit=crop&w=1400&q=80";

export default function PublicVenuePage() {
  const params = useParams();
  const slug = params.slug as string;
  const [venue, setVenue] = useState<PublicVenueDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchPublicVenue(slug)
      .then(setVenue)
      .catch(() => setError("This venue is not available or is not published."))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <Loader2 className="size-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (error || !venue) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 px-4 text-center">
        <p className="text-zinc-400">{error ?? "Venue not found."}</p>
        <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300">
          Back to home
        </Link>
      </div>
    );
  }

  const title = venueMarketingName(venue);
  const cover = resolveMediaUrl(venue.coverImage) ?? PLACEHOLDER;
  const location = formatVenueLocation(venue);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <GoSpotsLogo href="/" size="sm" showTagline />
          <span className="text-xs text-zinc-600">{venue.currency}</span>
        </div>
      </header>

      <div className="relative aspect-[21/9] w-full max-h-[420px] overflow-hidden border-b border-white/10">
        <Image src={cover} alt={title} fill className="object-cover" unoptimized />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 mx-auto max-w-5xl px-4 pb-8">
          <h1 className="text-3xl font-bold text-white md:text-4xl">{title}</h1>
          {location ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-zinc-300">
              <MapPin size={16} className="shrink-0 opacity-80" />
              {location}
            </p>
          ) : null}
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 py-10">
        {venue.tags && venue.tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {venue.tags.map((t) => (
              <span
                key={t.id}
                className="rounded-full border border-white/15 bg-zinc-900/80 px-3 py-1 text-xs font-medium"
                style={{
                  borderColor: t.color ? `${t.color}55` : undefined,
                  color: t.color ?? "#fde68a",
                }}
              >
                {t.name}
              </span>
            ))}
          </div>
        ) : null}
        {venue.description ? (
          <p className="max-w-2xl text-base leading-relaxed text-zinc-400">
            {venue.description}
          </p>
        ) : null}

        {venue.galleryItems.length > 0 ? (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-semibold text-white">Gallery</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {venue.galleryItems.map((item) => {
                const url = resolveMediaUrl(item.imageUrl);
                if (!url) return null;
                return (
                  <figure
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900"
                  >
                    <div className="relative aspect-square">
                      <Image
                        src={url}
                        alt={item.caption ?? "Venue photo"}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    {item.caption ? (
                      <figcaption className="px-2 py-1.5 text-[11px] text-zinc-500">
                        {item.caption}
                      </figcaption>
                    ) : null}
                  </figure>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
