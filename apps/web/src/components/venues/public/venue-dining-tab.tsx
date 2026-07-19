"use client";

import { Loader2, PartyPopper, Sparkles, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicGamingFloorExplorer } from "@/components/venues/public/public-gaming-floor-explorer";
import { PublicGamingBookingDialog } from "@/components/venues/public/public-gaming-booking-dialog";
import { GamingUnitBlockDialog } from "@/components/venues/public/gaming-unit-block-dialog";
import { GamingFloorMapControls } from "@/components/venues/public/gaming-floor-map-controls";
import { cn } from "@/lib/cn";
import { getBookingUnitKind } from "@/lib/booking-unit-kind";
import { validateBookingWindow } from "@/lib/booking-time";
import {
  applyWindowToUnits,
  defaultCheckWindowTimes,
} from "@/lib/gaming-window-availability";
import {
  getFloorMapVisualType,
  layoutMapLabel,
} from "@/lib/gaming-floor-visual";
import { fetchPublicDiningSchedule } from "@/lib/public-dining-client";
import type {
  DaySchedule,
  ScheduleBooking,
  ScheduleCategory,
  ScheduleUnit,
} from "@/lib/reservations-client";
import type { PublicVenueDetail } from "@/lib/shop-settings-client";
import { todayDateInput } from "@/lib/seating-event-datetime";
import { useLiveData } from "@/lib/use-live-data";
import type { ResourceType } from "@/lib/resource-types";

const PARTY_SIZE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12];

export function VenueDiningTab({
  venue,
  slug,
}: {
  venue: PublicVenueDetail;
  slug: string;
}) {
  const offerings = useMemo(
    () => (venue.diningOfferings ?? []).filter((o) => o.unitCount > 0),
    [venue.diningOfferings],
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    offerings[0]?.id ?? "",
  );

  useEffect(() => {
    if (!offerings.some((o) => o.id === selectedCategoryId)) {
      setSelectedCategoryId(offerings[0]?.id ?? "");
    }
  }, [offerings, selectedCategoryId]);

  const selectedOffering = useMemo(
    () => offerings.find((o) => o.id === selectedCategoryId),
    [offerings, selectedCategoryId],
  );
  const defaultSlot =
    selectedOffering?.slotMinutes ?? offerings[0]?.slotMinutes ?? 90;
  const categoryId = selectedCategoryId;

  const [partySize, setPartySize] = useState(2);
  const [scheduleDate, setScheduleDate] = useState(() => todayDateInput());
  const [windowStartTime, setWindowStartTime] = useState(
    () => defaultCheckWindowTimes(defaultSlot).start,
  );
  const [windowEndTime, setWindowEndTime] = useState(
    () => defaultCheckWindowTimes(defaultSlot).end,
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
    const next = defaultCheckWindowTimes(defaultSlot);
    setWindowStartTime(next.start);
    setWindowEndTime(next.end);
  }, [defaultSlot, selectedCategoryId]);

  const loadSchedule = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!categoryId) return;
      if (!opts.silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await fetchPublicDiningSchedule(slug, {
          date: scheduleDate,
          categoryId,
        });
        setSchedule(data);
      } catch (e) {
        if (!opts.silent) {
          setSchedule(null);
          setError(
            e instanceof Error ? e.message : "Could not load table map.",
          );
        }
      } finally {
        if (!opts.silent) setLoading(false);
      }
    },
    [slug, scheduleDate, categoryId],
  );

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  useLiveData(() => loadSchedule({ silent: true }), [loadSchedule], {
    enabled: Boolean(categoryId),
    intervalMs: 15_000,
  });

  const activeCategory = schedule?.categories[0] ?? null;

  const windowError = validateBookingWindow(
    scheduleDate,
    windowStartTime,
    windowEndTime,
  );

  const partyFilteredUnits = useMemo(() => {
    if (!activeCategory) return [];
    return activeCategory.units.filter(
      (u) => u.capacity == null || u.capacity >= partySize,
    );
  }, [activeCategory, partySize]);

  const windowedUnits = useMemo(() => {
    if (!activeCategory || windowError) return [];
    return applyWindowToUnits(
      partyFilteredUnits,
      scheduleDate,
      windowStartTime,
      windowEndTime,
    );
  }, [
    activeCategory,
    partyFilteredUnits,
    scheduleDate,
    windowStartTime,
    windowEndTime,
    windowError,
  ]);

  const freeCount = windowedUnits.filter(
    (u) => u.floorStatus === "AVAILABLE",
  ).length;
  const totalCount = windowedUnits.length;

  const displayCategory = useMemo(() => {
    if (!activeCategory) return null;
    return { ...activeCategory, units: partyFilteredUnits };
  }, [activeCategory, partyFilteredUnits]);

  const mapLabel = layoutMapLabel(
    "DINING" as ResourceType,
    getBookingUnitKind("DINING"),
  );

  if (!offerings.length) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-zinc-900/30 px-6 py-16 text-center">
        <UtensilsCrossed className="mx-auto text-zinc-600" size={32} />
        <p className="mt-3 text-sm text-zinc-400">
          Digital table booking is not set up yet.
        </p>
        <Link
          href={`/venue/${slug}?tab=book`}
          className="mt-4 inline-block text-xs text-amber-300 underline"
        >
          Request a table or event instead
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/40 via-zinc-900/80 to-zinc-950 p-5 md:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-400/90">
              <Sparkles size={12} />
              Instant table booking
            </p>
            <h2 className="mt-1 text-xl font-bold text-white md:text-2xl">
              Pick your table on the live floor map
            </h2>
            <p className="mt-2 max-w-xl text-sm text-zinc-400">
              Same dining layout as the venue dashboard — floors, areas, and
              table capacities. Choose party size, see what&apos;s free for your
              arrival window, confirm in seconds, and cancel from your status
              link anytime before you are seated.
            </p>
          </div>
          {activeCategory ? (
            <div className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-left backdrop-blur-sm sm:w-auto sm:text-right">
              <p className="text-2xl font-bold text-amber-300">{freeCount}</p>
              <p className="text-[11px] text-zinc-500">
                free of {totalCount} tables for {partySize} guest
                {partySize === 1 ? "" : "s"}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {offerings.length > 1 ? (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4 md:p-5">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Restaurant / area
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {offerings.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelectedCategoryId(o.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                  selectedCategoryId === o.id
                    ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200",
                )}
              >
                {o.name}
                <span className="ml-1.5 text-[10px] text-zinc-500">
                  {o.unitCount}
                </span>
              </button>
            ))}
          </div>
          {selectedOffering?.description ? (
            <p className="mt-3 text-sm text-zinc-400">
              {selectedOffering.description}
            </p>
          ) : null}
        </section>
      ) : selectedOffering?.description ? (
        <p className="text-sm text-zinc-400">{selectedOffering.description}</p>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-4 md:p-5">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Party size
        </h3>
        <p className="mt-1 text-sm text-zinc-400">
          Only tables with enough seats are shown on the map.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PARTY_SIZE_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPartySize(n)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                partySize === n
                  ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                  : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        {partySize >= 10 ? (
          <p className="mt-3 flex items-start gap-2 text-xs text-zinc-500">
            <PartyPopper size={14} className="mt-0.5 shrink-0 text-violet-300" />
            <span>
              Large group?{" "}
              <Link
                href={`/venue/${slug}?tab=book#book-event`}
                className="text-violet-300 underline-offset-2 hover:underline"
              >
                Request a private event
              </Link>{" "}
              so staff can plan against this dining layout.
            </span>
          </p>
        ) : null}
      </section>

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
              <Loader2 size={28} className="animate-spin text-amber-400/80" />
              <p className="text-sm">Loading table map…</p>
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
        ) : displayCategory ? (
          <PublicGamingFloorExplorer
            category={displayCategory}
            mapLabel={mapLabel}
            scheduleDate={scheduleDate}
            onScheduleDateChange={setScheduleDate}
            windowStartTime={windowStartTime}
            windowEndTime={windowEndTime}
            windowError={windowError}
            onWindowStartTimeChange={setWindowStartTime}
            onWindowEndTimeChange={setWindowEndTime}
            visualType={getFloorMapVisualType("DINING")}
            highlightedUnitId={highlightedUnitId}
            onBookUnit={(unit) => {
              if (unit.floorStatus !== "AVAILABLE") return;
              if (unit.capacity != null && partySize > unit.capacity) return;
              setHighlightedUnitId(unit.id);
              setBookingUnit({ unit, category: displayCategory });
            }}
            onInspectBlocked={(unitId, booking) => {
              const unit = displayCategory.units.find((u) => u.id === unitId);
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
              Could not load tables for this date. Try another time or check
              back later.
            </div>
          </>
        )}
      </section>

      {bookingUnit ? (
        <PublicGamingBookingDialog
          slug={slug}
          bookingKind="dining"
          category={bookingUnit.category}
          unit={bookingUnit.unit}
          scheduleDate={scheduleDate}
          initialStartTime={windowStartTime}
          initialEndTime={windowEndTime}
          initialPartySize={partySize}
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
