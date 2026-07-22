"use client";

import {
  Gamepad2,
  Loader2,
  Monitor,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicGamingFloorExplorer } from "@/components/venues/public/public-gaming-floor-explorer";
import { PublicGamingBookingDialog } from "@/components/venues/public/public-gaming-booking-dialog";
import { GamingUnitBlockDialog } from "@/components/venues/public/gaming-unit-block-dialog";
import { GamingFloorMapControls } from "@/components/venues/public/gaming-floor-map-controls";
import { OfferingPricingPanel } from "@/components/venues/public/offering-pricing-panel";
import { cn } from "@/lib/cn";
import {
  getBookingUnitKind,
  type BookingUnitKind,
} from "@/lib/booking-unit-kind";
import { listBowlingModes } from "@/lib/bowling-modes";
import { validateBookingWindow } from "@/lib/booking-time";
import {
  applyWindowToUnits,
  defaultCheckWindowTimes,
} from "@/lib/gaming-window-availability";
import { getFloorMapVisualType } from "@/lib/gaming-floor-visual";
import { resolveMediaUrl } from "@/lib/media-url";
import { fetchPublicGamingSchedule } from "@/lib/public-gaming-client";
import type {
  DaySchedule,
  ScheduleBooking,
  ScheduleCategory,
  ScheduleUnit,
} from "@/lib/reservations-client";
import type {
  PublicGamingOffering,
  PublicVenueDetail,
} from "@/lib/shop-settings-client";
import {
  resolveVenueTimeZone,
  venueDayKey,
} from "@/lib/venue-timezone";
import { useLiveData } from "@/lib/use-live-data";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import type { ResourceType } from "@/lib/resource-types";
import { BilliardTableIcon } from "@/components/icons/billiard-table-icon";
import { ArcadeCabinetIcon } from "@/components/icons/arcade-cabinet-icon";
import { FoosballTableIcon } from "@/components/icons/foosball-table-icon";
import { PingPongTableIcon } from "@/components/icons/ping-pong-table-icon";

function publicMapLabel(
  type: ResourceType,
  unitKind: BookingUnitKind,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  if (type === "DINING") return t("venuePage.floor.mapLabelTables");
  if (type === "BOWLING" || unitKind === "LANE") {
    return t("venuePage.floor.mapLabelLanes");
  }
  if (unitKind === "TABLE") return t("venuePage.floor.mapLabelTables");
  return t("venuePage.floor.mapLabelStations");
}

export function VenueGamingTab({
  venue,
  slug,
  initialCategoryId,
  onCategoryChange,
}: {
  venue: PublicVenueDetail;
  slug: string;
  initialCategoryId?: string;
  onCategoryChange?: (categoryId: string) => void;
}) {
  const { t } = usePublicPrefs();
  const venueTzProps = {
    timezone: venue.timezone,
    venueLocale: venue.locale,
  };
  const offerings = venue.gamingOfferings ?? [];
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    initialCategoryId ?? offerings[0]?.id ?? "",
  );
  const [scheduleDate, setScheduleDate] = useState(() =>
    venueDayKey(
      resolveVenueTimeZone({
        timezone: venue.timezone,
        locale: venue.locale,
      }),
    ),
  );
  const [windowStartTime, setWindowStartTime] = useState(
    () => defaultCheckWindowTimes().start,
  );
  const [windowEndTime, setWindowEndTime] = useState(
    () => defaultCheckWindowTimes().end,
  );
  const [schedule, setSchedule] = useState<DaySchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingUnit, setBookingUnit] = useState<{
    unit: ScheduleUnit;
    category: ScheduleCategory;
  } | null>(null);
  const [highlightedUnitId, setHighlightedUnitId] = useState<string | null>(
    null,
  );
  const [blockedInspect, setBlockedInspect] = useState<{
    unit: ScheduleUnit;
    booking: ScheduleBooking;
  } | null>(null);

  useEffect(() => {
    if (initialCategoryId) setSelectedCategoryId(initialCategoryId);
  }, [initialCategoryId]);

  const selectedOffering = useMemo(
    () => offerings.find((o) => o.id === selectedCategoryId),
    [offerings, selectedCategoryId],
  );

  const loadSchedule = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!selectedCategoryId) return;
      if (!opts.silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await fetchPublicGamingSchedule(slug, {
          date: scheduleDate,
          categoryId: selectedCategoryId,
        });
        setSchedule(data);
        return true;
      } catch (e) {
        if (!opts.silent) {
          setSchedule(null);
          setError(
            e instanceof Error
              ? e.message
              : t("venuePage.floor.loadFloorFailed"),
          );
        }
        return false;
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [slug, scheduleDate, selectedCategoryId, t],
  );

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  useLiveData(() => loadSchedule({ silent: true }), [loadSchedule], {
    enabled: Boolean(selectedCategoryId),
    intervalMs: 15_000,
  });

  const activeCategory = schedule?.categories[0] ?? null;

  const windowError = validateBookingWindow(
    scheduleDate,
    windowStartTime,
    windowEndTime,
  );

  const windowedUnits = useMemo(() => {
    if (!activeCategory || windowError) return [];
    return applyWindowToUnits(
      activeCategory.units,
      scheduleDate,
      windowStartTime,
      windowEndTime,
    );
  }, [activeCategory, scheduleDate, windowStartTime, windowEndTime, windowError]);

  const freeCount = windowedUnits.filter(
    (u) => u.floorStatus === "AVAILABLE",
  ).length;
  const totalCount = windowedUnits.length;

  const mapLabel = selectedOffering
    ? publicMapLabel(
        selectedOffering.type as ResourceType,
        getBookingUnitKind(selectedOffering.type as ResourceType),
        t,
      )
    : undefined;

  if (!offerings.length) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-16 text-center">
        <Gamepad2 className="mx-auto text-zinc-400" size={32} />
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{t("gaming.noActivities")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero strip */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-[var(--color-surface)] to-[var(--color-background)] p-5 md:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400/90">
              <Sparkles size={12} />
              {t("gaming.liveFloor")}
            </p>
            <h2 className="mt-1 text-xl font-bold text-[var(--color-foreground)] md:text-2xl">
              {t("gaming.pickStation")}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-400">
              {t("gaming.pickStationBody")}
            </p>
          </div>
          {activeCategory ? (
            <div className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]/70 px-4 py-3 text-left backdrop-blur-sm sm:w-auto sm:text-right">
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{freeCount}</p>
              <p className="text-[11px] text-zinc-500">
                {t("gaming.freeOfStations", { total: totalCount })}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Activity picker */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          {t("gaming.chooseActivity")}
        </h3>
        <div className="venue-tab-scroll flex gap-2.5 overflow-x-auto pb-1 snap-x snap-mandatory">
          {offerings.map((o) => (
            <OfferingPill
              key={o.id}
              offering={o}
              selected={selectedCategoryId === o.id}
              onSelect={() => {
                setSelectedCategoryId(o.id);
                onCategoryChange?.(o.id);
              }}
            />
          ))}
        </div>
      </section>

      {selectedOffering && hasOfferingDetails(selectedOffering) ? (
        <OfferingDetailCard
          offering={selectedOffering}
          currency={venue.currency}
          locale={venue.locale}
        />
      ) : null}

      {/* Floor map */}
      <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
        {loading ? (
          <>
            <GamingFloorMapControls
              mapLabel={mapLabel}
              scheduleDate={scheduleDate}
              onScheduleDateChange={setScheduleDate}
              windowStartTime={windowStartTime}
              windowEndTime={windowEndTime}
              onWindowStartTimeChange={setWindowStartTime}
              onWindowEndTimeChange={setWindowEndTime}
              windowError={windowError}
              {...venueTzProps}
            />
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-zinc-500">
              <Loader2 size={28} className="animate-spin text-emerald-400/80" />
              <p className="text-sm">{t("gaming.loadingFloor")}</p>
            </div>
          </>
        ) : error ? (
          <>
            <GamingFloorMapControls
              mapLabel={mapLabel}
              scheduleDate={scheduleDate}
              onScheduleDateChange={setScheduleDate}
              windowStartTime={windowStartTime}
              windowEndTime={windowEndTime}
              onWindowStartTimeChange={setWindowStartTime}
              onWindowEndTimeChange={setWindowEndTime}
              windowError={windowError}
              {...venueTzProps}
            />
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
              <button
                type="button"
                onClick={() => void loadSchedule()}
                className="mt-3 text-xs text-amber-700 underline dark:text-amber-300"
              >
                {t("gaming.tryAgain")}
              </button>
            </div>
          </>
        ) : activeCategory ? (
          <PublicGamingFloorExplorer
            category={activeCategory}
            mapLabel={mapLabel}
            scheduleDate={scheduleDate}
            onScheduleDateChange={setScheduleDate}
            windowStartTime={windowStartTime}
            windowEndTime={windowEndTime}
            windowError={windowError}
            onWindowStartTimeChange={setWindowStartTime}
            onWindowEndTimeChange={setWindowEndTime}
            {...venueTzProps}
            visualType={getFloorMapVisualType(activeCategory.type)}
            highlightedUnitId={highlightedUnitId}
            onBookUnit={(unit) => {
              if (unit.floorStatus !== "AVAILABLE") return;
              setHighlightedUnitId(unit.id);
              setBookingUnit({ unit, category: activeCategory });
            }}
            onInspectBlocked={(unitId, booking) => {
              const unit = activeCategory.units.find((u) => u.id === unitId);
              if (unit) setBlockedInspect({ unit, booking });
            }}
          />
        ) : (
          <>
            <GamingFloorMapControls
              mapLabel={mapLabel}
              scheduleDate={scheduleDate}
              onScheduleDateChange={setScheduleDate}
              windowStartTime={windowStartTime}
              windowEndTime={windowEndTime}
              onWindowStartTimeChange={setWindowStartTime}
              onWindowEndTimeChange={setWindowEndTime}
              windowError={windowError}
              {...venueTzProps}
            />
            <div className="px-6 py-16 text-center text-sm text-zinc-500">
              {t("gaming.couldNotLoad")}
            </div>
          </>
        )}
      </section>

      {bookingUnit ? (
        <PublicGamingBookingDialog
          slug={slug}
          category={bookingUnit.category}
          unit={bookingUnit.unit}
          scheduleDate={scheduleDate}
          initialStartTime={windowStartTime}
          initialEndTime={windowEndTime}
          offeringRates={selectedOffering?.rates ?? []}
          currency={venue.currency}
          {...venueTzProps}
          onClose={() => {
            setBookingUnit(null);
            setHighlightedUnitId(null);
          }}
          onBooked={() => void loadSchedule({ silent: true })}
        />
      ) : null}

      {blockedInspect ? (
        <GamingUnitBlockDialog
          unit={blockedInspect.unit}
          booking={blockedInspect.booking}
          onClose={() => setBlockedInspect(null)}
        />
      ) : null}
    </div>
  );
}

function OfferingPill({
  offering,
  selected,
  onSelect,
}: {
  offering: PublicGamingOffering;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = usePublicPrefs();
  const cover = resolveMediaUrl(offering.imageUrl);
  const typeLabel = t(`resource.${offering.type as ResourceType}`);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex min-w-[9.5rem] shrink-0 snap-start items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition",
        selected
          ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-950 shadow-[0_0_20px_rgba(52,211,153,0.08)] dark:text-white"
          : "border-[var(--color-border)] bg-[var(--color-surface)] text-zinc-700 hover:border-emerald-400/30 hover:text-[var(--color-foreground)] dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:text-white",
      )}
    >
      {cover ? (
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)]">
          <Image src={cover} alt="" fill className="object-cover" unoptimized />
        </div>
      ) : (
        <div
          className={cn(
            "grid shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-amber-600 dark:bg-zinc-800 dark:text-amber-400/80",
            offeringIconShellClass(offering.type),
          )}
        >
          <OfferingTypeIcon type={offering.type} size={22} compact />
        </div>
      )}
      <div className="min-w-0 pr-1">
        <p className="truncate text-sm font-semibold leading-snug">
          {offering.name}
        </p>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {typeLabel} ·{" "}
          {t(
            offering.unitCount === 1 ? "resource.unitOne" : "resource.units",
            { count: offering.unitCount },
          )}
        </p>
      </div>
    </button>
  );
}

function hasOfferingDetails(offering: PublicGamingOffering): boolean {
  if (offering.description?.trim()) return true;
  if (offering.type === "PLAYSTATION" && offering.playstationGames.length > 0) {
    return true;
  }
  if (offering.type === "BOWLING") {
    const modes = listBowlingModes(
      offering.offeringConfig,
      offering.bookingMode,
      offering.rates,
      offering.slotMinutes,
    );
    return modes.length > 0;
  }
  if (offering.rates.length > 0) return true;
  return false;
}

function OfferingDetailCard({
  offering,
  currency,
  locale = "en",
}: {
  offering: PublicGamingOffering;
  currency: string;
  locale?: string;
}) {
  const { t } = usePublicPrefs();
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 md:p-4">
      {offering.description ? (
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {offering.description}
        </p>
      ) : null}
      {offering.type === "PLAYSTATION" && offering.playstationGames.length > 0 ? (
        <div className={offering.description ? "mt-3" : undefined}>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            {t("gaming.gamesOnDeck")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {offering.playstationGames.map((game) => (
              <span
                key={game}
                className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-0.5 text-[11px] text-violet-800 dark:text-violet-200"
              >
                {game}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <OfferingPricingPanel
        offering={offering}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}

function offeringIconShellClass(type: string) {
  switch (type) {
    case "BILLIARD":
    case "FOOSBALL":
      return "h-11 w-14";
    case "TABLE_TENNIS":
      return "h-11 w-12";
    case "ARCADE":
      return "h-11 w-9";
    default:
      return "h-11 w-11";
  }
}

function OfferingTypeIcon({
  type,
  size = 24,
  compact = false,
}: {
  type: string;
  size?: number;
  compact?: boolean;
}) {
  switch (type) {
    case "PC":
      return <Monitor size={size} />;
    case "PLAYSTATION":
      return <Gamepad2 size={size} />;
    case "BILLIARD":
      return (
        <BilliardTableIcon
          status="AVAILABLE"
          className={compact ? "h-6 w-10" : "h-7 w-12"}
        />
      );
    case "TABLE_TENNIS":
      return (
        <PingPongTableIcon
          status="AVAILABLE"
          className={compact ? "h-6 w-9" : "h-7 w-11"}
        />
      );
    case "FOOSBALL":
      return (
        <FoosballTableIcon
          status="AVAILABLE"
          className={compact ? "h-6 w-10" : "h-7 w-12"}
        />
      );
    case "ARCADE":
      return (
        <ArcadeCabinetIcon
          status="AVAILABLE"
          className={compact ? "h-9 w-5" : "h-8 w-6"}
        />
      );
    default:
      return <Gamepad2 size={size} />;
  }
}
