"use client";

import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
import {
  ArrowRight,
  Globe2,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GoSpotsLogo } from "@/components/brand/gospots-logo";
import { cn } from "@/lib/cn";
import { BRAND_TAGLINE } from "@/lib/brand";
import { resolveMediaUrl } from "@/lib/media-url";
import {
  fetchPublicVenues,
  type PublicVenue,
  type VenueCategoryTag,
} from "@/lib/shop-settings-client";
import { venueMarketingName } from "@/lib/venue-display";
import { VENUE_CATEGORY_PRESETS } from "@/lib/venue-categories";

const PLACEHOLDER =
  "https://images.unsplash.com/photo-1615722440048-da4fd9202b9d?auto=format&fit=crop&w=1200&q=75";

const BENTO =
  "col-span-12 sm:col-span-6 lg:col-span-4 xl:col-span-3 min-h-[220px] sm:min-h-[260px]";

const BENTO_FEATURED =
  "col-span-12 md:col-span-8 lg:col-span-6 min-h-[280px] md:min-h-[320px]";

const BENTO_TALL =
  "col-span-12 sm:col-span-6 lg:col-span-4 min-h-[300px] sm:min-h-[340px]";

function cardLayout(i: number) {
  if (i === 0) return BENTO_FEATURED;
  if (i % 7 === 3) return BENTO_TALL;
  if (i % 5 === 2) return "col-span-12 sm:col-span-6 lg:col-span-8 min-h-[240px]";
  return BENTO;
}

export function VenuesDiscovery() {
  const [venues, setVenues] = useState<PublicVenue[] | null>(null);
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchPublicVenues({
      q: q.trim() || undefined,
      city: city.trim() || undefined,
      country: country.trim() || undefined,
      categories: categories.size ? [...categories] : undefined,
    })
      .then(setVenues)
      .catch(() => setVenues([]))
      .finally(() => setLoading(false));
  }, [q, city, country, categories]);

  useEffect(() => {
    const t = window.setTimeout(load, 280);
    return () => window.clearTimeout(t);
  }, [load]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    (venues ?? []).forEach((v) => {
      if (v.country?.trim()) set.add(v.country.trim());
    });
    return [...set].sort();
  }, [venues]);

  function toggleCategory(slug: string) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="aurora-mesh absolute inset-0 opacity-50" />
        <motion.div
          className="absolute -left-32 top-20 h-96 w-96 rounded-full bg-amber-500/20 blur-[100px]"
          animate={{ x: [0, 40, 0], y: [0, 20, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-cyan-500/15 blur-[90px]"
          animate={{ x: [0, -30, 0], y: [0, -25, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <header className="sticky top-0 z-40 border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <GoSpotsLogo href="/" size="lg" showTagline animated />
          <Link
            href="/register"
            className="hidden rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 sm:inline-flex"
          >
            List your venue
          </Link>
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-4 pb-8 pt-12 md:px-8 md:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl"
        >
          <p className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">
            <Globe2 size={14} />
            Worldwide venues
          </p>
          <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight md:text-6xl">
            <span className="text-gradient">{BRAND_TAGLINE}</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-zinc-400">
            Gaming lounges, billiard halls, bars, and nightlife — search by name,
            city, country, or vibe.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="mt-10 rounded-2xl border border-white/10 bg-zinc-900/60 p-4 shadow-2xl shadow-black/40 backdrop-blur md:p-5"
        >
          <div className="grid gap-3 md:grid-cols-12">
            <label className="relative md:col-span-5">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name or description…"
                className="w-full rounded-xl border border-white/10 bg-zinc-950/80 py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-amber-400/50"
              />
            </label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className="rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-3 text-sm text-white outline-none focus:border-amber-400/50 md:col-span-3"
            />
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Country"
              list="venue-countries"
              className="rounded-xl border border-white/10 bg-zinc-950/80 px-4 py-3 text-sm text-white outline-none focus:border-amber-400/50 md:col-span-3"
            />
            <datalist id="venue-countries">
              {countries.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {VENUE_CATEGORY_PRESETS.map((p) => {
              const on = categories.has(p.slug);
              return (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => toggleCategory(p.slug)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition",
                    on
                      ? "border-amber-400/60 bg-amber-500/20 text-amber-100"
                      : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300",
                  )}
                  style={on ? { boxShadow: `0 0 14px ${p.color}55` } : undefined}
                >
                  {p.name}
                </button>
              );
            })}
            {categories.size > 0 && (
              <button
                type="button"
                onClick={() => setCategories(new Set())}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-zinc-500 hover:text-zinc-300"
              >
                <X size={12} /> Clear filters
              </button>
            )}
          </div>
        </motion.div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-24 md:px-8">
        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="size-10 animate-spin text-amber-400" />
          </div>
        ) : venues && venues.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-dashed border-white/15 bg-zinc-900/40 py-20 text-center"
          >
            <Sparkles className="mx-auto size-10 text-amber-400/60" />
            <p className="mt-4 text-lg font-medium text-zinc-300">No spots match yet</p>
            <p className="mt-2 text-sm text-zinc-500">
              Try another city or category — or list your venue on GoSpots.
            </p>
            <Link
              href="/register"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-zinc-950"
            >
              Get listed <ArrowRight size={16} />
            </Link>
          </motion.div>
        ) : (
          <LayoutGroup>
            <motion.ul
              layout
              className="grid grid-cols-12 gap-4 md:gap-5"
            >
              <AnimatePresence mode="popLayout">
                {venues?.map((v, i) => (
                  <VenueBentoCard key={v.id} venue={v} layoutClass={cardLayout(i)} index={i} />
                ))}
              </AnimatePresence>
            </motion.ul>
          </LayoutGroup>
        )}
      </section>
    </div>
  );
}

function VenueBentoCard({
  venue,
  layoutClass,
  index,
}: {
  venue: PublicVenue;
  layoutClass: string;
  index: number;
}) {
  const title = venueMarketingName(venue);
  const cover = resolveMediaUrl(venue.coverImage) || PLACEHOLDER;
  const location = [venue.city, venue.country].filter(Boolean).join(", ");

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.92, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: Math.min(index * 0.04, 0.35), type: "spring", stiffness: 260, damping: 22 }}
      className={cn("group relative list-none", layoutClass)}
    >
      <Link
        href={`/venue/${venue.slug}`}
        className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 shadow-xl transition duration-300 hover:border-amber-400/30 hover:shadow-amber-500/10"
      >
        <div className="relative min-h-[140px] flex-1 overflow-hidden">
          <Image
            src={cover}
            alt=""
            fill
            className="object-cover transition duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 33vw"
            unoptimized={cover.startsWith("http")}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {(venue.tags ?? []).slice(0, 3).map((t) => (
              <CategoryPill key={t.id} tag={t} />
            ))}
          </div>
        </div>
        <div className="relative p-4 pt-2">
          <h2 className="text-lg font-semibold text-white group-hover:text-amber-100">
            {title}
          </h2>
          {location ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-zinc-400">
              <MapPin size={12} className="shrink-0 text-amber-400/80" />
              {location}
            </p>
          ) : null}
          {venue.description ? (
            <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{venue.description}</p>
          ) : null}
          <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-amber-300/90">
            View venue <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </motion.li>
  );
}

function CategoryPill({ tag }: { tag: VenueCategoryTag }) {
  return (
    <span
      className="rounded-full border border-white/20 bg-zinc-950/70 px-2 py-0.5 text-[10px] font-medium backdrop-blur-md"
      style={{
        borderColor: tag.color ? `${tag.color}66` : undefined,
        color: tag.color ?? "#fde68a",
      }}
    >
      {tag.name}
    </span>
  );
}
