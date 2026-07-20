"use client";

import { motion } from "framer-motion";
import { ArrowRight, Banknote, Clock3, MapPin, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Reveal } from "@/components/effects/reveal";
import { VenueCoverImage } from "@/components/ui/venue-cover-image";
import { cn } from "@/lib/cn";
import {
  fetchPublicVenues,
  type PublicVenue,
} from "@/lib/shop-settings-client";
import {
  type ShopStatus,
  venues as mockVenues,
  formatVenueLocation as formatMockVenueLocation,
} from "@/lib/mock-data";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import { formatVenueLocation, venueMarketingName } from "@/lib/venue-display";
import { useMode } from "./mode-context";

/** Sample cards only in local development — never on production builds. */
const allowMockVenues = process.env.NODE_ENV === "development";

type DisplayVenue =
  | (PublicVenue & { source: "api" })
  | {
      source: "mock";
      id: string;
      name: string;
      cityLine: string;
      country: string;
      currency: string;
      locale: string;
      coverImage: string;
      shopStatus: ShopStatus;
      rating: number;
      busy: number;
      total: number;
      tags: string[];
      accent: string;
      description: string;
      rateFromEur: number;
      rateUnit: "hr" | "session";
      visitorsInside: number;
      maxVisitors: number;
      mockIndex: number;
    };

function VenueImage({
  src,
  alt,
  mock,
}: {
  src: string | null | undefined;
  alt: string;
  mock: boolean;
}) {
  return (
    <VenueCoverImage
      src={mock ? null : src}
      alt={alt}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
      className={cn(
        "transition-transform duration-700",
        mock ? "scale-105 saturate-[0.85] opacity-90" : "group-hover:scale-105",
      )}
    />
  );
}

function statusI18nKey(status: ShopStatus) {
  if (status === "closing_soon") return "status.closingSoon";
  return `status.${status}`;
}

export function Venues() {
  const { mode } = useMode();
  const { t, formatMoney } = usePublicPrefs();
  const isPlay = mode === "play";
  const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");
  const [apiVenues, setApiVenues] = useState<PublicVenue[]>([]);

  useEffect(() => {
    fetchPublicVenues()
      .then((data) => {
        setApiVenues(data.items);
        setLoadState("ok");
      })
      .catch(() => {
        setApiVenues([]);
        setLoadState("error");
      });
  }, []);

  const loading = loadState === "loading";
  const hasApi = apiVenues.length > 0;
  const useMock = !loading && !hasApi && allowMockVenues;

  const display: DisplayVenue[] = loading
    ? []
    : hasApi
      ? apiVenues.map((v) => ({ ...v, source: "api" as const }))
      : useMock
        ? mockVenues.map((v, i) => ({
            source: "mock" as const,
            id: `mock-${i}`,
            name: v.name,
            cityLine: formatMockVenueLocation(v),
            country: v.country,
            currency: "EUR",
            locale: "en",
            coverImage: v.image,
            shopStatus: v.shopStatus,
            rating: v.rating,
            busy: v.busy,
            total: v.total,
            tags: v.tags,
            accent: v.accent,
            description: v.description,
            rateFromEur: v.rateFromEur,
            rateUnit: v.rateUnit,
            visitorsInside: v.visitorsInside,
            maxVisitors: v.maxVisitors,
            mockIndex: i,
          }))
        : [];

  const empty =
    !loading && display.length === 0
      ? loadState === "error"
        ? t("homeVenues.emptyError")
        : t("homeVenues.emptyNone")
      : null;

  const banner =
    useMock && loadState === "error"
      ? t("homeVenues.bannerError")
      : useMock && loadState === "ok"
        ? t("homeVenues.bannerMock")
        : empty;

  function mockRateLabel(rateFromEur: number, rateUnit: "hr" | "session") {
    const unit = t(
      rateUnit === "hr" ? "homeVenues.unitHr" : "homeVenues.unitSession",
    );
    return t("homeVenues.fromRate", {
      price: formatMoney(rateFromEur, "EUR"),
      unit,
    });
  }

  function tagLabel(tag: string) {
    const key = `homeVenues.tag.${tag}`;
    const translated = t(key);
    return translated === key ? tag : translated;
  }

  function mockDesc(index: number, fallback: string) {
    const key = `homeVenues.mock.${index + 1}.desc`;
    const translated = t(key);
    return translated === key ? fallback : translated;
  }

  return (
    <section id="venues" className="relative py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-8">
        <Reveal className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <span className="text-xs font-medium uppercase tracking-widest text-violet-700 dark:text-violet-300">
              {t(isPlay ? "homeVenues.play.eyebrow" : "homeVenues.manage.eyebrow")}
            </span>
            <h2 className="mt-3 text-balance text-3xl font-bold md:text-5xl">
              {isPlay ? (
                <>
                  {t("homeVenues.play.title")}{" "}
                  <span className="text-gradient">
                    {t("homeVenues.play.titleAccent")}
                  </span>
                </>
              ) : (
                <>
                  {t("homeVenues.manage.title")}{" "}
                  <span className="text-gradient">
                    {t("homeVenues.manage.titleAccent")}
                  </span>
                </>
              )}
            </h2>
            <p className="mt-4 text-base text-zinc-600 dark:text-zinc-400 md:text-lg">
              {t(
                isPlay
                  ? "homeVenues.play.subtitle"
                  : "homeVenues.manage.subtitle",
              )}
            </p>
          </div>
          <Link
            href="/venues"
            className="group inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-700 backdrop-blur transition hover:bg-violet-500/20 dark:text-violet-200"
          >
            {t("homeVenues.openDirectory")}
            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-1"
            />
          </Link>
        </Reveal>

        {banner ? (
          <div
            className={
              useMock || loadState === "error"
                ? "mt-8 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100/95"
                : "mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-4 py-8 text-center text-sm text-zinc-600 dark:border-white/10 dark:text-zinc-400"
            }
            role="status"
          >
            {banner}
          </div>
        ) : null}

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={`sk-${i}`}
                  className="h-[320px] animate-pulse rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 dark:border-white/10 dark:bg-zinc-900/40"
                />
              ))
            : display.length === 0
              ? null
              : display.map((v, i) => {
                  const isMock = v.source === "mock";
                  const occupancy =
                    isMock ? Math.round((v.busy / v.total) * 100) : null;
                  const visitorPct = isMock
                    ? Math.min(
                        100,
                        Math.round(
                          (v.visitorsInside / Math.max(1, v.maxVisitors)) * 100,
                        ),
                      )
                    : null;
                  const image =
                    !isMock && v.coverImage ? v.coverImage : null;
                  const publicName =
                    v.source === "api" ? venueMarketingName(v) : v.name;
                  const locationLine =
                    v.source === "api"
                      ? formatVenueLocation(v) ?? v.city ?? "—"
                      : v.cityLine;
                  const rateText = isMock
                    ? mockRateLabel(v.rateFromEur, v.rateUnit)
                    : null;
                  const cardInner = (
                    <article className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur transition-shadow hover:shadow-[0_30px_80px_-20px_rgba(168,139,250,0.35)] dark:border-white/10 dark:bg-zinc-950/60">
                      <div className="relative h-40 overflow-hidden">
                        <VenueImage
                          src={isMock ? v.coverImage : image}
                          alt={publicName}
                          mock={isMock}
                        />
                        {isMock ? (
                          <div
                            className={cn(
                              "pointer-events-none absolute inset-0 bg-gradient-to-t",
                              v.accent,
                            )}
                            aria-hidden
                          />
                        ) : (
                          <div
                            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent"
                            aria-hidden
                          />
                        )}
                        {isMock ? (
                          <span
                            className={cn(
                              "absolute left-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                              v.shopStatus === "open" &&
                                "bg-emerald-500/95 text-white shadow-lg",
                              v.shopStatus === "closing_soon" &&
                                "bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 shadow-lg",
                              v.shopStatus === "closed" &&
                                "bg-zinc-800/95 text-zinc-300",
                            )}
                          >
                            {t(statusI18nKey(v.shopStatus))}
                          </span>
                        ) : null}
                        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
                          {isMock ? (
                            <span className="max-w-[55%] truncate rounded-full border border-white/15 bg-black/55 px-2 py-1 text-[10px] font-medium text-amber-100 backdrop-blur">
                              {rateText}
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
                          ) : null}
                        </div>
                      </div>

                      <div className="p-4">
                        <h3 className="text-base font-semibold text-[var(--color-foreground)] dark:text-white">
                          {publicName}
                        </h3>
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                          <MapPin size={11} /> {locationLine}
                        </p>
                        {isMock ? (
                          <>
                            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300/90">
                              {rateText}
                            </p>
                            <p className="mt-2 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-500">
                              {mockDesc(v.mockIndex, v.description)}
                            </p>
                          </>
                        ) : null}
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
                                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-2 py-0.5 text-[10px] text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
                              >
                                {tagLabel(tag)}
                              </span>
                            ))}
                          </div>
                        ) : (v.tags?.length ?? 0) > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {v.tags!.slice(0, 3).map((tag) => (
                              <span
                                key={tag.id}
                                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-2 py-0.5 text-[10px] text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300"
                                style={{
                                  borderColor: tag.color
                                    ? `${tag.color}44`
                                    : undefined,
                                }}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 inline-flex items-center gap-1 rounded-md border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-200">
                            <Banknote size={10} />
                            {t("homeVenues.pricesIn", { currency: v.currency })}
                          </p>
                        )}
                        {isMock && visitorPct != null ? (
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-[10px] text-zinc-500">
                              <span>{t("homeVenues.visitorsInside")}</span>
                              <span className="tabular-nums">
                                {v.visitorsInside} / {v.maxVisitors}
                              </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-white/10">
                              <motion.div
                                initial={{ width: 0 }}
                                whileInView={{ width: `${visitorPct}%` }}
                                viewport={{ once: true }}
                                transition={{
                                  duration: 0.85,
                                  delay: 0.08 + i * 0.05,
                                }}
                                className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-400 to-yellow-300 dark:from-orange-500 dark:via-amber-400 dark:to-yellow-200"
                              />
                            </div>
                          </div>
                        ) : null}
                        {isMock && occupancy != null ? (
                          <div className="mt-4">
                            <div className="flex items-center justify-between text-[11px] text-zinc-500">
                              <span className="inline-flex items-center gap-1">
                                <Clock3 size={10} />
                                {t("homeVenues.tablesBusy", {
                                  busy: v.busy,
                                  total: v.total,
                                })}
                              </span>
                              <span className="tabular-nums">{occupancy}%</span>
                            </div>
                            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
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
                          <span className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-3 py-2 text-xs font-semibold text-[var(--color-foreground)] transition group-hover:border-emerald-400/40 group-hover:bg-emerald-500/15 group-hover:text-emerald-700 dark:border-white/10 dark:bg-white/5 dark:text-white dark:group-hover:text-emerald-200">
                            {t("homeVenues.viewVenue")}
                            <ArrowRight size={12} />
                          </span>
                        ) : (
                          <Link
                            href="/venues"
                            className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-3 py-2 text-xs font-semibold text-[var(--color-foreground)] transition hover:border-emerald-400/40 hover:bg-emerald-500/15 hover:text-emerald-700 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:text-emerald-200"
                          >
                            {t("homeVenues.seeDirectory")}
                            <ArrowRight size={12} />
                          </Link>
                        )}
                      </div>
                    </article>
                  );

                  return (
                    <motion.div
                      key={v.id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-50px" }}
                      transition={{ duration: 0.45, delay: i * 0.06 }}
                    >
                      {v.source === "api" ? (
                        <Link href={`/venue/${v.slug}`} className="block">
                          {cardInner}
                        </Link>
                      ) : (
                        cardInner
                      )}
                    </motion.div>
                  );
                })}
        </div>
      </div>
    </section>
  );
}
