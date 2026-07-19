"use client";

import { motion } from "framer-motion";
import { ArrowRight, Loader2, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  VenueSearchForm,
  type VenueSearchFormValues,
} from "@/components/venues/venue-search-form";
import { VenueCoverImage } from "@/components/ui/venue-cover-image";
import { fetchPublicVenues, type PublicVenue } from "@/lib/shop-settings-client";
import { venuesSearchHref } from "@/lib/venue-search";
import { venueMarketingName } from "@/lib/venue-display";

export function VenueFinder() {
  const router = useRouter();
  const [form, setForm] = useState<VenueSearchFormValues>({
    q: "",
    city: "",
    country: "",
    categories: new Set(),
  });
  const [preview, setPreview] = useState<PublicVenue[]>([]);
  const [facets, setFacets] = useState<{ countries: string[]; cities: string[] }>({
    countries: [],
    cities: [],
  });
  const [loadingPreview, setLoadingPreview] = useState(true);

  useEffect(() => {
    fetchPublicVenues()
      .then((data) => {
        setPreview(data.items.slice(0, 3));
        setFacets(data.facets);
      })
      .catch(() => setPreview([]))
      .finally(() => setLoadingPreview(false));
  }, []);

  function goSearch() {
    router.push(
      venuesSearchHref({
        q: form.q,
        city: form.city,
        country: form.country,
        categories: form.categories.size ? [...form.categories] : undefined,
      }),
    );
  }

  return (
    <div className="relative w-full">
      <div className="absolute inset-x-0 -inset-y-10 -z-10 rounded-[40px] bg-gradient-to-br from-amber-400/20 via-orange-400/10 to-rose-400/15 blur-2xl sm:-inset-x-4 dark:from-cyan-500/15 dark:via-violet-500/10 dark:to-amber-400/15" />

      <div className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-950/95">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/70 px-4 py-3 sm:px-5 dark:border-white/5 dark:bg-zinc-900/60">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500/80" />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400/80" />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400/80" />
            <span className="ml-2 truncate text-xs text-zinc-500 sm:ml-3">
              gospots.app / venues
            </span>
          </div>
          <Link
            href="/venues"
            className="hidden shrink-0 text-xs font-medium text-amber-800 hover:text-amber-700 sm:inline dark:text-amber-400 dark:hover:text-amber-300"
          >
            Open full directory
          </Link>
        </div>

        <div className="p-5">
          <VenueSearchForm
            values={form}
            onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            onSubmit={goSearch}
            facets={facets}
            compact
            showCategories
            className="border-0 bg-transparent p-0 shadow-none"
          />

          <div className="mt-6 border-t border-[var(--color-border)] pt-5 dark:border-white/5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                {preview.length > 0 ? "Published on GoSpots" : "Directory preview"}
              </p>
              <Link
                href="/venues"
                className="inline-flex items-center gap-1 text-xs text-amber-800 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
              >
                See all <ArrowRight size={12} />
              </Link>
            </div>

            {loadingPreview ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-6 animate-spin text-amber-600 dark:text-amber-500" />
              </div>
            ) : preview.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-4 py-6 text-center text-sm text-zinc-500 dark:border-white/10 dark:bg-zinc-900/40">
                No published venues yet. Operators can list for free — search will
                light up as they go live.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-3">
                {preview.map((v, i) => {
                  const title = venueMarketingName(v);
                  const location = [v.city, v.country].filter(Boolean).join(", ");
                  return (
                    <motion.li
                      key={v.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="list-none"
                    >
                      <Link
                        href={`/venue/${v.slug}`}
                        className="group block overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/70 transition hover:border-amber-500/40 dark:border-white/10 dark:bg-zinc-900/50 dark:hover:border-amber-400/40"
                      >
                        <div className="relative h-24 w-full overflow-hidden">
                          <VenueCoverImage src={v.coverImage} sizes="200px" />
                        </div>
                        <div className="p-3">
                          <p className="truncate text-sm font-medium text-[var(--color-foreground)] dark:text-white">
                            {title}
                          </p>
                          {location ? (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-zinc-500">
                              <MapPin size={10} />
                              {location}
                            </p>
                          ) : null}
                        </div>
                      </Link>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
