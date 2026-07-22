"use client";

import { useEffect, useMemo, useState } from "react";
import { BowlingLaneFloorMap } from "@/components/reservations/bowling-lane-floor-map";
import { GamingFloorMapControls } from "@/components/venues/public/gaming-floor-map-controls";
import { GamingFloorLayoutExplorer } from "@/components/reservations/gaming-floor-layout-explorer";
import { cn } from "@/lib/cn";
import { getBookingUnitKind } from "@/lib/booking-unit-kind";
import {
  buildFloorSectionGroups,
  groupSectionsByFloor,
} from "@/lib/gaming-floor-groups";
import type { FloorMapVisualType } from "@/lib/gaming-floor-visual";
import {
  applyWindowToUnits,
  buildBlockingMap,
} from "@/lib/gaming-window-availability";
import { usePublicPrefs } from "@/lib/public-prefs-context";
import type {
  ScheduleBooking,
  ScheduleCategory,
  ScheduleUnit,
} from "@/lib/reservations-client";
import type { UnitFloorStatus } from "@/lib/booking-floor-status";

const STATIONS_PER_PAGE = 10;

function useCompactMap() {
  const [compact, setCompact] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setCompact(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return compact;
}

export function PublicGamingFloorExplorer({
  category,
  mapLabel,
  scheduleDate,
  onScheduleDateChange,
  windowStartTime,
  windowEndTime,
  windowError,
  onWindowStartTimeChange,
  onWindowEndTimeChange,
  visualType,
  highlightedUnitId,
  onBookUnit,
  onInspectBlocked,
  timezone,
  venueLocale,
}: {
  category: ScheduleCategory;
  mapLabel?: string;
  scheduleDate: string;
  onScheduleDateChange: (date: string) => void;
  windowStartTime: string;
  windowEndTime: string;
  windowError?: string | null;
  onWindowStartTimeChange: (time: string) => void;
  onWindowEndTimeChange: (time: string) => void;
  visualType: FloorMapVisualType;
  highlightedUnitId?: string | null;
  onBookUnit: (unit: ScheduleUnit) => void;
  onInspectBlocked?: (unitId: string, booking: ScheduleBooking) => void;
  timezone?: string;
  venueLocale?: string;
}) {
  const { t } = usePublicPrefs();
  const [activeFloor, setActiveFloor] = useState(1);
  const compactMap = useCompactMap();

  const unitKind = category.unitKind ?? getBookingUnitKind(category.type);
  const isLaneMap = unitKind === "LANE";

  const guestStatusLabels = useMemo(
    (): Record<UnitFloorStatus, string> => ({
      AVAILABLE: t("venuePage.floor.statusAvailable"),
      UNAVAILABLE: t("venuePage.floor.statusUnavailable"),
      NOT_WORKING: t("venuePage.floor.statusNotWorking"),
    }),
    [t],
  );

  const chromeLabels = useMemo(
    () => ({
      floor: t("venuePage.floor.floor"),
      floorN: (n: number) => t("venuePage.floor.floorN", { n }),
      layoutZone: t("venuePage.floor.layoutZone"),
      noStations: t("venuePage.floor.noStations"),
      noStationsInLayout: t("venuePage.floor.noStationsInLayout"),
      prev: t("venuePage.floor.prev"),
      next: t("venuePage.floor.next"),
      pageOf: (page: number, total: number) =>
        t("venuePage.floor.pageOf", { page, total }),
      stationsRange: (from: number, to: number, total: number) =>
        t("venuePage.floor.stationsRange", { from, to, total }),
    }),
    [t],
  );

  const bowlingChromeLabels = useMemo(
    () => ({
      floor: t("venuePage.floor.floor"),
      floorN: (n: number) => t("venuePage.floor.floorN", { n }),
      layoutZone: t("venuePage.floor.layoutZone"),
      noLanes: t("venuePage.floor.noLanes"),
      alleyHint: t("venuePage.floor.bowlingAlleyHint"),
      swipeLanes: t("venuePage.floor.swipeLanes"),
      prev: t("venuePage.floor.prev"),
      next: t("venuePage.floor.next"),
      lanesRange: (from: number, to: number, total: number) =>
        t("venuePage.floor.lanesRange", { from, to, total }),
    }),
    [t],
  );

  const windowedUnits = useMemo(
    () =>
      applyWindowToUnits(
        category.units,
        scheduleDate,
        windowStartTime,
        windowEndTime,
      ),
    [category.units, scheduleDate, windowStartTime, windowEndTime],
  );

  const blockingMap = useMemo(
    () =>
      buildBlockingMap(
        category.units,
        scheduleDate,
        windowStartTime,
        windowEndTime,
      ),
    [category.units, scheduleDate, windowStartTime, windowEndTime],
  );

  const sectionGroups = useMemo(
    () => buildFloorSectionGroups(windowedUnits, category.sections ?? []),
    [windowedUnits, category.sections],
  );

  const floorMap = useMemo(
    () => groupSectionsByFloor(sectionGroups),
    [sectionGroups],
  );

  const floors = useMemo(() => [...floorMap.keys()], [floorMap]);

  useEffect(() => {
    setActiveFloor(floors[0] ?? 1);
  }, [category.id, floors]);

  const unitsOnFloor = useMemo(() => {
    const groups = floorMap.get(activeFloor) ?? [];
    return groups.flatMap((g) => g.units);
  }, [floorMap, activeFloor]);

  const sectionsOnFloor = useMemo(() => {
    const groups = floorMap.get(activeFloor) ?? [];
    return (category.sections ?? []).filter((s) =>
      groups.some((g) => g.section?.id === s.id),
    );
  }, [floorMap, activeFloor, category.sections]);

  const floorTabs =
    floors.length > 1 ? (
      <div className="flex flex-wrap gap-1">
        {floors.map((floor) => {
          const free = (floorMap.get(floor) ?? [])
            .flatMap((g) => g.units)
            .filter((u) => u.floorStatus === "AVAILABLE").length;
          const count = (floorMap.get(floor) ?? []).reduce(
            (n, g) => n + g.units.length,
            0,
          );
          const selected = activeFloor === floor;
          return (
            <button
              key={floor}
              type="button"
              onClick={() => setActiveFloor(floor)}
              className={cn(
                "snap-start shrink-0 rounded-md border px-2.5 py-1 text-[11px] font-medium transition",
                selected
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                  : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300",
              )}
            >
              {t("venuePage.floor.floorN", { n: floor })}
              <span className="ml-1 opacity-70">
                · {free}/{count}
              </span>
            </button>
          );
        })}
      </div>
    ) : null;

  if (!windowedUnits.length) {
    return (
      <div className="flex flex-col">
        <GamingFloorMapControls
          mapLabel={mapLabel}
          scheduleDate={scheduleDate}
          onScheduleDateChange={onScheduleDateChange}
          windowStartTime={windowStartTime}
          windowEndTime={windowEndTime}
          onWindowStartTimeChange={onWindowStartTimeChange}
          onWindowEndTimeChange={onWindowEndTimeChange}
          windowError={windowError}
          timezone={timezone}
          venueLocale={venueLocale}
        />
        <p className="px-6 py-12 text-center text-sm text-zinc-500">
          {t("venuePage.floor.noStations")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <GamingFloorMapControls
        mapLabel={mapLabel}
        scheduleDate={scheduleDate}
        onScheduleDateChange={onScheduleDateChange}
        windowStartTime={windowStartTime}
        windowEndTime={windowEndTime}
        onWindowStartTimeChange={onWindowStartTimeChange}
        onWindowEndTimeChange={onWindowEndTimeChange}
        windowError={windowError}
        floorTabs={isLaneMap ? undefined : floorTabs}
        timezone={timezone}
        venueLocale={venueLocale}
      />

      {windowError ? (
        <p className="py-12 text-center text-sm text-zinc-500">
          {t("venuePage.floor.fixTimeRange")}
        </p>
      ) : isLaneMap ? (
        <BowlingLaneFloorMap
          units={windowedUnits}
          sections={category.sections}
          canWrite
          displayOnly={false}
          highlightedUnitId={highlightedUnitId}
          precomputedStatus
          blockingBookingsByUnitId={blockingMap}
          onInspectBlocked={onInspectBlocked}
          chromeLabels={bowlingChromeLabels}
          guestStatusLabels={guestStatusLabels}
          onBookUnit={(unitId) => {
            const unit = windowedUnits.find((u) => u.id === unitId);
            if (unit) onBookUnit(unit);
          }}
        />
      ) : (
        <GamingFloorLayoutExplorer
          key={`${category.id}-${activeFloor}-${scheduleDate}-${windowStartTime}-${windowEndTime}`}
          units={unitsOnFloor}
          sections={sectionsOnFloor}
          categoryLabel={category.name}
          visualType={visualType}
          stationsPerPage={STATIONS_PER_PAGE}
          canWrite
          highlightedUnitId={highlightedUnitId}
          precomputedStatus
          blockingBookingsByUnitId={blockingMap}
          mapVariant={compactMap ? "compact" : "full"}
          onInspectBlocked={onInspectBlocked}
          chromeLabels={chromeLabels}
          guestStatusLabels={guestStatusLabels}
          onBookUnit={(unitId) => {
            const unit = unitsOnFloor.find((u) => u.id === unitId);
            if (unit) onBookUnit(unit);
          }}
        />
      )}
    </div>
  );
}
