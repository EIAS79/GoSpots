"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PublicVenueView } from "@/components/venues/public/public-venue-view";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import {
  fetchPublicVenue,
  type PublicVenueDetail,
} from "@/lib/shop-settings-client";

export function PublicVenueClient({
  slug,
  initialVenue = null,
}: {
  slug: string;
  initialVenue?: PublicVenueDetail | null;
}) {
  const { t } = usePublicPrefs();
  const [venue, setVenue] = useState<PublicVenueDetail | null>(initialVenue);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialVenue);

  useEffect(() => {
    if (initialVenue) {
      setVenue(initialVenue);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void fetchPublicVenue(slug)
      .then((data) => {
        if (!cancelled) setVenue(data);
      })
      .catch(() => {
        if (!cancelled) {
          setError(t("venuePage.notAvailable"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, initialVenue, t]);

  if (loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center text-[var(--color-foreground)]">
        <Loader2 className="size-8 animate-spin text-amber-400" />
      </div>
    );
  }

  if (error || !venue) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center text-[var(--color-foreground)]">
        <p className="text-zinc-600 dark:text-zinc-400">
          {error ?? t("venuePage.notFound")}
        </p>
        <Link
          href="/venues"
          className="text-sm text-amber-700 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
        >
          {t("venuePage.browseVenues")}
        </Link>
      </div>
    );
  }

  return <PublicVenueView venue={venue} slug={slug} />;
}
