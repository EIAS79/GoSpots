"use client";

import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
import {
  ArrowRight,
  Banknote,
  Clock3,
  Gamepad2,
  Globe2,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  Sparkles,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LocoraLogo } from "@/components/brand/locora-logo";
import { LocaleCurrencySwitcher } from "@/components/public/locale-currency-switcher";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { VenueCoverImage } from "@/components/ui/venue-cover-image";
import {
  VenueSearchForm,
  type VenueSearchFormValues,
} from "@/components/venues/venue-search-form";
import { cn } from "@/lib/cn";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import {
  fetchPublicVenues,
  type PublicVenue,
  type VenueCategoryTag,
} from "@/lib/shop-settings-client";
import {
  DEFAULT_PILOT_CITY,
  pilotCityLandingHref,
} from "@/lib/pilot-cities";
import {
  buildVenueSearchQuery,
  parseVenueSearchParams,
} from "@/lib/venue-search";
import { formatVenueLocation, venueMarketingName } from "@/lib/venue-display";
import { venueOpenStatus } from "@/lib/venue-open-status";

type OpenState = "open" | "closed" | "opens-later" | "unknown";

type OpenStatus = {
  state: OpenState;
  /** e.g. "Open · until 22:00" or "Opens 09:00" or "Closed today" */
  label: string;
  /** Today's raw window, e.g. "09:00 – 22:00" */
  window: string | null;
};

function valuesFromParams(searchParams: URLSearchParams): VenueSearchFormValues {
  const parsed = parseVenueSearchParams(searchParams);
  return {
    q: parsed.q ?? "",
    city: parsed.city ?? "",
    country: parsed.country ?? "",
    categories: new Set(parsed.categories ?? []),
  };
}

export function VenuesDiscovery() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = usePublicPrefs();
  const [form, setForm] = useState<VenueSearchFormValues>(() =>
    valuesFromParams(searchParams),
  );
  const [venues, setVenues] = useState<PublicVenue[]>([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState<{ countries: string[]; cities: string[] }>({
    countries: [],
    cities: [],
  });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");

  const activeQuery = useMemo(
    () => parseVenueSearchParams(searchParams),
    [searchParams],
  );

  useEffect(() => {
    setForm(valuesFromParams(searchParams));
  }, [searchParams]);

  const load = useCallback(() => {
    setLoading(true);
    fetchPublicVenues({
      q: activeQuery.q,
      city: activeQuery.city,
      country: activeQuery.country,
      categories: activeQuery.categories,
    })
      .then((data) => {
        setVenues(data.items);
        setTotal(data.total);
        setFacets(data.facets);
      })
      .catch(() => {
        setVenues([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [activeQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  function patchForm(patch: Partial<VenueSearchFormValues>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function applySearch() {
    const qs = buildVenueSearchQuery({
      q: form.q,
      city: form.city,
      country: form.country,
      categories: form.categories.size ? [...form.categories] : undefined,
    }).toString();
    router.push(qs ? `/venues?${qs}` : "/venues");
  }

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (activeQuery.q) parts.push(`“${activeQuery.q}”`);
    if (activeQuery.city) parts.push(activeQuery.city);
    if (activeQuery.country) parts.push(activeQuery.country);
    if (activeQuery.categories?.length) {
      parts.push(`${activeQuery.categories.length} categor${activeQuery.categories.length === 1 ? "y" : "ies"}`);
    }
    return parts;
  }, [activeQuery]);

  return (
    <div className="relative min-h-screen text-[var(--color-foreground)]">
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-background)_88%,transparent)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 md:px-8">
          <LocoraLogo
            href="/"
            size="md"
            showTagline
            animated
            tone="auto"
            className="hidden shrink-0 sm:inline-flex"
          />
          <LocoraLogo
            href="/"
            size="sm"
            tone="auto"
            className="shrink-0 sm:hidden"
          />
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <LocaleCurrencySwitcher tone="auto" compact />
            <ThemeToggle />
            <Link
              href="/for-venues"
              className="hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:border-amber-400/40 hover:text-zinc-950 sm:inline-flex dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:border-amber-400/40 dark:hover:text-[var(--color-foreground)] sm:text-sm"
            >
              {t("nav.iOwnVenue")}
            </Link>
            <Link
              href="/register"
              className="shrink-0 rounded-full bg-amber-400 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 sm:px-4 sm:text-sm"
            >
              <span className="sm:hidden">{t("nav.listVenueShort")}</span>
              <span className="hidden sm:inline">{t("nav.listVenue")}</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative mx-auto max-w-7xl px-4 pb-8 pt-12 sm:px-6 md:px-8 md:pt-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl"
        >
          <p className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-200">
            <Globe2 size={14} />
            {facets.countries.length > 0
              ? t(
                  total === 1 ? "venues.publishedOne" : "venues.published",
                  {
                    total,
                    countries: facets.countries.length,
                  },
                )
              : t("venues.worldwide")}
          </p>
          <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight md:text-6xl">
            <span className="text-gradient">{t("venues.tagline")}</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
            {t("venues.subtitle")}
          </p>
          <p className="mt-3 max-w-xl text-sm text-zinc-500">
            {t("venues.pilotHint", { city: DEFAULT_PILOT_CITY.name })}{" "}
            <Link
              href={pilotCityLandingHref()}
              className="font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
            >
              {t("venues.pilotLink", { city: DEFAULT_PILOT_CITY.name })}
            </Link>
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="mt-10"
        >
          <VenueSearchForm
            values={form}
            onChange={patchForm}
            onSubmit={applySearch}
            facets={facets}
          />
        </motion.div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 md:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-300">
              {loading
                ? t("venues.searching")
                : t(total === 1 ? "venues.foundOne" : "venues.found", {
                    total,
                  })}
            </p>
            {filterSummary.length > 0 ? (
              <p className="mt-0.5 truncate text-xs text-zinc-500">
                {t("venues.filters", { summary: filterSummary.join(" · ") })}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-zinc-500">
                {t("venues.showingAll")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={cn(
                "grid size-8 place-items-center rounded-md transition",
                view === "grid"
                  ? "bg-amber-500/20 text-amber-800 dark:text-amber-200"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300",
              )}
              aria-label={t("venuesDiscovery.gridView")}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={cn(
                "grid size-8 place-items-center rounded-md transition",
                view === "list"
                  ? "bg-amber-500/20 text-amber-800 dark:text-amber-200"
                  : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300",
              )}
              aria-label={t("venuesDiscovery.listView")}
            >
              <List size={14} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="size-10 animate-spin text-amber-500 dark:text-amber-400" />
          </div>
        ) : venues.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]/60 py-20 text-center dark:bg-white/[0.03]"
          >
            <Sparkles className="mx-auto size-10 text-amber-400/60" />
            <p className="mt-4 text-lg font-medium text-zinc-800 dark:text-zinc-300">
              {t("venues.emptyTitle")}
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              {t("venues.emptyBodyPilot", { city: DEFAULT_PILOT_CITY.name })}
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href={pilotCityLandingHref()}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-5 py-2.5 text-sm font-medium text-zinc-800 dark:bg-white/[0.03] dark:text-zinc-100"
              >
                {t("venues.pilotLink", { city: DEFAULT_PILOT_CITY.name })}
              </Link>
              <Link
                href="/for-venues"
                className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-zinc-950"
              >
                {t("venues.getListed")} <ArrowRight size={16} />
              </Link>
            </div>
          </motion.div>
        ) : (
          <LayoutGroup>
            <motion.ul
              layout
              className={cn(
                "relative grid gap-3 md:gap-4",
                view === "grid"
                  ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
                  : "grid-cols-1",
              )}
            >
              <AnimatePresence mode="popLayout">
                {venues.map((v, i) => (
                  <VenueCard key={v.id} venue={v} index={i} variant={view} />
                ))}
              </AnimatePresence>
            </motion.ul>
          </LayoutGroup>
        )}
      </section>
    </div>
  );
}

function VenueCard({
  venue,
  index,
  variant,
}: {
  venue: PublicVenue;
  index: number;
  variant: "grid" | "list";
}) {
  const { t } = usePublicPrefs();
  const title = venueMarketingName(venue);
  const location = formatVenueLocation(venue);
  const status = venueOpenStatus(venue.openingHours, venue.scheduleExceptions) as OpenStatus;
  const accent = venue.tags?.[0]?.color ?? "#f59e0b";

  if (variant === "list") {
    return (
      <motion.li
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ delay: Math.min(index * 0.03, 0.2) }}
        className="list-none"
      >
        <Link
          href={`/venue/${venue.slug}`}
          className="group flex flex-col gap-4 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-4 transition hover:border-amber-400/40 dark:bg-white/[0.03] sm:flex-row"
        >
          <div className="relative h-36 w-full shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-44">
            <VenueCoverImage src={venue.coverImage} sizes="176px" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-semibold text-[var(--color-foreground)] group-hover:text-amber-700 dark:group-hover:text-amber-100">
                {title}
              </h2>
              <VenueMetaBadges venue={venue} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
              {location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} className="shrink-0 text-amber-500/80" />
                  {location}
                </span>
              ) : null}
              <OpenStatusPill status={status} compact />
              <RatingBadge venue={venue} />
            </div>
            {venue.description ? (
              <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{venue.description}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(venue.tags ?? []).slice(0, 4).map((t) => (
                <CategoryPill key={t.id} tag={t} />
              ))}
            </div>
          </div>
        </Link>
      </motion.li>
    );
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0, scale: 0.94, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{
        delay: Math.min(index * 0.03, 0.3),
        type: "spring",
        stiffness: 260,
        damping: 22,
      }}
      whileHover={{ y: -4 }}
      className="group relative list-none"
    >
      {/* Gradient ring — invisible until hover, tinted by first category color */}
      <div
        aria-hidden
        className="absolute -inset-px rounded-[17px] opacity-0 blur-[1px] transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `linear-gradient(140deg, ${accent}80, transparent 38%, transparent 62%, ${accent}4d)`,
        }}
      />
      <Link
        href={`/venue/${venue.slug}`}
        className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 shadow-lg backdrop-blur-sm transition-[border-color,box-shadow] duration-300 group-hover:border-amber-400/35 dark:bg-white/[0.03]"
        style={{
          boxShadow: `0 20px 50px -28px ${accent}00`,
        }}
      >
        <span className="venue-card-shine" aria-hidden />

        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden">
          <VenueCoverImage
            src={venue.coverImage}
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 220px"
            className="transition-transform duration-700 ease-out group-hover:scale-[1.07]"
          />
          {/* Depth scrims */}
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--hero-scrim-edge)] via-[var(--color-background)]/10 to-transparent" />
          <div
            aria-hidden
            className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            style={{
              background: `radial-gradient(120% 90% at 50% 110%, ${accent}2e, transparent 60%)`,
            }}
          />

          <div className="absolute left-2 top-2 max-w-[calc(100%-4.5rem)]">
            <OpenStatusPill status={status} compactLabel />
          </div>
          <div className="absolute right-2 top-2">
            <RatingBadge venue={venue} />
          </div>

          {/* Name + hours sit on the image for a poster feel */}
          <div className="absolute inset-x-0 bottom-0 min-w-0 p-3">
            <h2 className="truncate text-[15px] font-bold leading-tight text-zinc-900 drop-shadow-md dark:text-[var(--color-foreground)]">
              {title}
            </h2>
            {status.window ? (
              <p className="mt-0.5 flex items-center gap-1 text-[10.5px] font-medium text-zinc-700 dark:text-zinc-300/90">
                <Clock3 size={10} className="shrink-0 opacity-80" />
                {status.window}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1.5 p-3 pt-2.5">
          {venue.description ? (
            <p className="line-clamp-2 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              {venue.description}
            </p>
          ) : (
            <p className="text-[11px] italic text-zinc-500">
              {t("venuesDiscovery.noDescription")}
            </p>
          )}

          {(venue.tags?.length ?? 0) > 0 ? (
            <div className="flex flex-wrap gap-1">
              {venue.tags!.slice(0, 2).map((t) => (
                <CategoryPill key={t.id} tag={t} />
              ))}
              {venue.tags!.length > 2 ? (
                <span className="rounded-full border border-[var(--color-border)] px-1.5 py-0.5 text-[9.5px] text-zinc-500">
                  +{venue.tags!.length - 2}
                </span>
              ) : null}
            </div>
          ) : null}

          {location ? (
            <p className="flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400">
              <MapPin size={11} className="shrink-0 text-amber-500/80" />
              <span className="truncate">{location}</span>
            </p>
          ) : null}

          <div className="mt-auto flex items-center justify-between border-t border-[var(--color-border)] pt-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-amber-700 transition-colors group-hover:text-amber-600 dark:text-amber-300/90 dark:group-hover:text-amber-200">
              More details
            </span>
            <span
              className="grid size-6 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/40 text-zinc-500 transition-all duration-300 group-hover:border-amber-400/40 group-hover:bg-amber-400/15 group-hover:text-amber-700 dark:text-zinc-400 dark:group-hover:text-amber-200"
            >
              <ArrowRight
                size={12}
                className="transition-transform duration-300 group-hover:translate-x-0.5"
              />
            </span>
          </div>
        </div>
      </Link>
    </motion.li>
  );
}

function OpenStatusPill({
  status,
  compact,
  compactLabel,
}: {
  status: OpenStatus;
  compact?: boolean;
  /** Shorter label on narrow cards (e.g. "Open" instead of "Open · until 22:00") */
  compactLabel?: boolean;
}) {
  const { t } = usePublicPrefs();
  if (status.state === "unknown") return null;
  const open = status.state === "open";
  const later = status.state === "opens-later";
  const label = compactLabel
    ? open
      ? t("venuesDiscovery.statusOpen")
      : later
        ? t("venuesDiscovery.statusOpensLater")
        : t("venuesDiscovery.statusClosed")
    : status.label;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur-md",
        open &&
          "border-emerald-400/30 bg-emerald-500/15 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300",
        later &&
          "border-amber-400/30 bg-amber-500/15 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300",
        !open &&
          !later &&
          "border-[var(--color-border)] bg-[var(--color-surface)]/80 text-zinc-600 dark:bg-[var(--color-background)]/70 dark:text-zinc-400",
        compact && "bg-transparent backdrop-blur-none",
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          open && "venue-status-dot bg-emerald-400",
          later && "bg-amber-400",
          !open && !later && "bg-zinc-600",
        )}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

function RatingBadge({ venue }: { venue: PublicVenue }) {
  const { t } = usePublicPrefs();
  const count = venue.reviewCount ?? 0;
  const avg = venue.averageRating;

  if (count > 0 && avg != null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/70 px-2 py-0.5 text-[10px] font-medium text-amber-800 backdrop-blur-md dark:text-amber-200">
        <Star size={10} className="fill-amber-500 text-amber-600 dark:fill-amber-300 dark:text-amber-300" />
        {avg.toFixed(1)}
        <span className="text-zinc-600 dark:text-zinc-400">({count})</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/70 px-2 py-0.5 text-[10px] font-medium text-zinc-700 backdrop-blur-md dark:text-zinc-300">
      <Star size={10} className="text-amber-600 dark:text-amber-400/70" />
      {t("venues.new")}
    </span>
  );
}

function VenueMetaBadges({ venue }: { venue: PublicVenue }) {
  const { t, currency } = usePublicPrefs();
  const gameCount = venue.gameOfferingCount ?? 0;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/70 px-2 py-0.5 text-[10px] text-zinc-700 backdrop-blur dark:text-zinc-200">
        <Banknote size={10} />
        {t("venues.pricesIn", { currency })}
      </span>
      {gameCount > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-200 backdrop-blur">
          <Gamepad2 size={10} />
          {t(gameCount === 1 ? "venues.gameOne" : "venues.games", {
            count: gameCount,
          })}
        </span>
      ) : null}
    </div>
  );
}

function CategoryPill({ tag }: { tag: VenueCategoryTag }) {
  return (
    <span
      className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)]/70 px-2 py-0.5 text-[10px] font-medium backdrop-blur-md"
      style={{
        borderColor: tag.color ? `${tag.color}66` : undefined,
        color: tag.color ?? "#fde68a",
      }}
    >
      {tag.name}
    </span>
  );
}
