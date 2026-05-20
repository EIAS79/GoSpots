"use client";

import { motion } from "framer-motion";
import { ArrowRight, Banknote, Clock3, MapPin, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Magnetic } from "@/components/effects/magnetic";
import { Reveal } from "@/components/effects/reveal";
import { TiltCard } from "@/components/effects/tilt-card";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { venues as mockVenues } from "@/lib/mock-data";
import {
  fetchPublicVenues,
  type PublicVenue,
} from "@/lib/shop-settings-client";
import { resolveMediaUrl } from "@/lib/media-url";
import { venueMarketingName } from "@/lib/venue-display";

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1615722440048-da4fd9202b9d?auto=format&fit=crop&w=900&q=70";

type DisplayVenue =
  | (PublicVenue & { source: "api" })
  | {
      source: "mock";
      id: string;
      name: string;
      city: string;
      currency: string;
      locale: string;
      coverImage: string;
      open: boolean;
      rating: number;
      busy: number;
      total: number;
      tags: string[];
      accent: string;
    };

export function Venues() {
  const [apiVenues, setApiVenues] = useState<PublicVenue[] | null>(null);

  useEffect(() => {
    fetchPublicVenues()
      .then(setApiVenues)
      .catch(() => setApiVenues([]));
  }, []);

  const display: DisplayVenue[] =
    apiVenues && apiVenues.length > 0
      ? apiVenues.map((v) => ({ ...v, source: "api" as const }))
      : mockVenues.map((v, i) => ({
          source: "mock" as const,
          id: `mock-${i}`,
          name: v.name,
          city: v.city,
          currency: "EUR",
          locale: "en",
          coverImage: v.image,
          open: v.open,
          rating: v.rating,
          busy: v.busy,
          total: v.total,
          tags: v.tags,
          accent: v.accent,
        }));

  return (
    <section id="venues" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <Reveal className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="text-xs font-medium uppercase tracking-widest text-violet-300">
              For players
            </span>
            <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
              Discover venues running on{" "}
              <span className="text-gradient">VenueFlow.</span>
            </h2>
            <p className="mt-4 text-base text-zinc-400 md:text-lg">
              Check who&apos;s open right now, how busy they are, and reserve your
              table before you head out. Prices are shown in each venue&apos;s
              operating currency.
            </p>
          </div>
          <Magnetic strength={0.25}>
            <Link
              href="#"
              className="group inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-200 backdrop-blur hover:bg-violet-500/20"
            >
              Browse the full map
              <ArrowRight
                size={15}
                className="transition-transform group-hover:translate-x-1"
              />
            </Link>
          </Magnetic>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {display.map((v, i) => {
            const isMock = v.source === "mock";
            const occupancy =
              isMock ? Math.round((v.busy / v.total) * 100) : null;
            const image =
              !isMock && v.coverImage
                ? resolveMediaUrl(v.coverImage) ?? PLACEHOLDER_IMAGE
                : isMock
                  ? v.coverImage
                  : PLACEHOLDER_IMAGE;
            const publicName =
              v.source === "api" ? venueMarketingName(v) : v.name;
            const cardInner = (
                  <article className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60 backdrop-blur transition-shadow hover:shadow-[0_30px_80px_-20px_rgba(168,139,250,0.45)]">
                    <div className="relative h-40 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image ?? PLACEHOLDER_IMAGE}
                        alt={publicName}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                      {isMock ? (
                        <div
                          className={cn(
                            "absolute inset-0 bg-gradient-to-t",
                            v.accent,
                          )}
                          aria-hidden
                        />
                      ) : (
                        <div
                          className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent"
                          aria-hidden
                        />
                      )}
                      <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
                        {isMock ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur",
                              v.open
                                ? "border-emerald-400/40 bg-emerald-500/25 text-emerald-100"
                                : "border-zinc-500/40 bg-zinc-900/60 text-zinc-300",
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                v.open
                                  ? "bg-emerald-300 animate-pulse"
                                  : "bg-zinc-500",
                              )}
                            />
                            {v.open ? "Open now" : "Closed"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-1 text-[11px] text-zinc-200 backdrop-blur">
                            <Banknote size={10} />
                            {v.currency}
                          </span>
                        )}
                        {isMock ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-xs text-zinc-100 backdrop-blur">
                            <Star
                              size={11}
                              className="fill-amber-300 text-amber-300"
                            />
                            {v.rating}
                          </span>
                        ) : (
                          <span
                            className="rounded-full bg-black/60 px-2 py-1 text-[10px] text-zinc-300 backdrop-blur"
                            title="Venue operating currency"
                          >
                            from {formatMoney(15, v.currency, v.locale)}/hr
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4">
                      <h3 className="text-base font-semibold text-white">
                        {publicName}
                      </h3>
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-400">
                        <MapPin size={11} /> {v.city ?? "—"}
                      </p>
                      {!isMock && v.description ? (
                        <p className="mt-2 line-clamp-2 text-xs text-zinc-500">
                          {v.description}
                        </p>
                      ) : null}
                      {isMock ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {v.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-zinc-300"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 inline-flex items-center gap-1 rounded-md border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                          <Banknote size={10} />
                          Prices in {v.currency}
                        </p>
                      )}
                      {isMock && occupancy != null ? (
                        <div className="mt-4">
                          <div className="flex items-center justify-between text-[11px] text-zinc-500">
                            <span className="inline-flex items-center gap-1">
                              <Clock3 size={10} />
                              {v.busy}/{v.total} tables busy
                            </span>
                            <span className="tabular-nums">{occupancy}%</span>
                          </div>
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
                            <motion.div
                              initial={{ width: 0 }}
                              whileInView={{ width: `${occupancy}%` }}
                              viewport={{ once: true }}
                              transition={{
                                duration: 0.9,
                                delay: 0.1 + i * 0.05,
                              }}
                              className={cn(
                                "h-full rounded-full bg-gradient-to-r",
                                occupancy > 75
                                  ? "from-rose-400 to-amber-300"
                                  : occupancy > 40
                                    ? "from-amber-400 to-emerald-300"
                                    : "from-emerald-400 to-cyan-300",
                              )}
                            />
                          </div>
                        </div>
                      ) : null}
                      {!isMock ? (
                        <span className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition group-hover:border-emerald-400/40 group-hover:bg-emerald-500/15 group-hover:text-emerald-200">
                          View venue
                          <ArrowRight size={12} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white transition hover:border-emerald-400/40 hover:bg-emerald-500/15 hover:text-emerald-200"
                        >
                          Reserve a table
                          <ArrowRight size={12} />
                        </button>
                      )}
                    </div>
                  </article>
            );

            return (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.55, delay: i * 0.07 }}
              >
                <TiltCard max={6}>
                  {v.source === "api" ? (
                    <Link href={`/venue/${v.slug}`} className="block">
                      {cardInner}
                    </Link>
                  ) : (
                    cardInner
                  )}
                </TiltCard>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
