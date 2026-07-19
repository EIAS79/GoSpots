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
import { getBookingUnitKind } from "@/lib/booking-unit-kind";
import { listBowlingModes } from "@/lib/bowling-modes";
import { validateBookingWindow } from "@/lib/booking-time";
import {
  applyWindowToUnits,
  defaultCheckWindowTimes,
} from "@/lib/gaming-window-availability";
import {
  getFloorMapVisualType,
  layoutMapLabel,
} from "@/lib/gaming-floor-visual";
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
import { todayDateInput } from "@/lib/seating-event-datetime";
import { useLiveData } from "@/lib/use-live-data";
import { RESOURCE_TYPE_LABELS } from "@/lib/resource-types";
import type { ResourceType } from "@/lib/resource-types";
import { BilliardTableIcon } from "@/components/icons/billiard-table-icon";
import { ArcadeCabinetIcon } from "@/components/icons/arcade-cabinet-icon";
import { FoosballTableIcon } from "@/components/icons/foosball-table-icon";
import { PingPongTableIcon } from "@/components/icons/ping-pong-table-icon";

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
  const offerings = venue.gamingOfferings ?? [];
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    initialCategoryId ?? offerings[0]?.id ?? "",
  );
  const [scheduleDate, setScheduleDate] = useState(() => todayDateInput());
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
      } catch (e) {
        if (!opts.silent) {
          setSchedule(null);
          setError(
            e instanceof Error ? e.message : "Could not load floor map.",
          );
        }
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [slug, scheduleDate, selectedCategoryId],
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
    ? layoutMapLabel(
        selectedOffering.type as ResourceType,
        getBookingUnitKind(selectedOffering.type as ResourceType),
      )
    : undefined;

  if (!offerings.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-zinc-900/30 px-6 py-16 text-center">
        <Gamepad2 className="mx-auto text-zinc-600" size={32} />
        <p className="mt-3 text-sm text-zinc-400">No gaming activities listed yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero strip */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/50 via-zinc-900/80 to-zinc-950 p-5 md:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-emerald-400/90">
              <Sparkles size={12} />
              Live floor booking
            </p>
            <h2 className="mt-1 text-xl font-bold text-white md:text-2xl">
              Pick your station on the digital map
            </h2>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              See PCs, consoles, billiard tables, and more — exactly like the venue
              floor. Tap an available seat or table, register, and staff are notified
              instantly.
            </p>
          </div>
          {activeCategory ? (
            <div className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-left backdrop-blur-sm sm:w-auto sm:text-right">
              <p className="text-2xl font-bold text-emerald-300">{freeCount}</p>
              <p className="text-[11px] text-zinc-500">
                free of {totalCount} stations at this time
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Activity picker */}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Choose activity
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
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/40 shadow-xl">
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
            />
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-zinc-500">
              <Loader2 size={28} className="animate-spin text-emerald-400/80" />
              <p className="text-sm">Loading live floor…</p>
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
            />
            <div className="px-6 py-16 text-center">
              <p className="text-sm text-rose-300">{error}</p>
              <button
                type="button"
                onClick={() => void loadSchedule()}
                className="mt-3 text-xs text-amber-300 underline"
              >
                Try again
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
            />
            <div className="px-6 py-16 text-center text-sm text-zinc-500">
              Could not load stations for this activity. Try another date or
              activity.
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
          locale={venue.locale}
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
  const cover = resolveMediaUrl(offering.imageUrl);
  const typeLabel =
    RESOURCE_TYPE_LABELS[offering.type as keyof typeof RESOURCE_TYPE_LABELS] ??
    offering.type;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex min-w-[9.5rem] shrink-0 snap-start items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition",
        selected
          ? "border-emerald-400/40 bg-emerald-500/15 text-white shadow-[0_0_20px_rgba(52,211,153,0.1)]"
          : "border-white/10 bg-zinc-900/60 text-zinc-300 hover:border-white/20 hover:text-white",
      )}
    >
      {cover ? (
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/10">
          <Image src={cover} alt="" fill className="object-cover" unoptimized />
        </div>
      ) : (
        <div
          className={cn(
            "grid shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-zinc-800 text-amber-400/80",
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
          {typeLabel} · {offering.unitCount} units
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
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-3 md:p-4">
      {offering.description ? (
        <p className="text-sm leading-relaxed text-zinc-400">
          {offering.description}
        </p>
      ) : null}
      {offering.type === "PLAYSTATION" && offering.playstationGames.length > 0 ? (
        <div className={offering.description ? "mt-3" : undefined}>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Games on deck
          </p>
          <div className="flex flex-wrap gap-1.5">
            {offering.playstationGames.map((game) => (
              <span
                key={game}
                className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-0.5 text-[11px] text-violet-200"
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
