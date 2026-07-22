"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BowlingLaneFloorMap } from "@/components/reservations/bowling-lane-floor-map";
import { GamingFloorMapControls } from "@/components/venues/public/gaming-floor-map-controls";
import { GamingFloorLayoutExplorer } from "@/components/reservations/gaming-floor-layout-explorer";
import { getBookingUnitKind } from "@/lib/booking-unit-kind";
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
  const compactMap = useCompactMap();

  const unitKind = category.unitKind ?? getBookingUnitKind(category.type);
  const isLaneMap = unitKind === "LANE";
  const isDining = visualType === "dining";

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
      mainArea: t("venuePage.floor.mainArea"),
      zoneIndoor: t("venuePage.floor.zoneIndoor"),
      zoneOutdoor: t("venuePage.floor.zoneOutdoor"),
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

  const mapControls = (floorTabs?: ReactNode) => (
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
  );

  if (!windowedUnits.length) {
    return (
      <div className="flex flex-col">
        {mapControls()}
        <p className="px-6 py-12 text-center text-sm text-zinc-500">
          {t("venuePage.floor.noStations")}
        </p>
      </div>
    );
  }

  if (windowError) {
    return (
      <div className="flex flex-col">
        {mapControls()}
        <p className="py-12 text-center text-sm text-zinc-500">
          {t("venuePage.floor.fixTimeRange")}
        </p>
      </div>
    );
  }

  if (isLaneMap) {
    return (
      <div className="flex flex-col">
        {mapControls()}
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
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <GamingFloorLayoutExplorer
        key={`${category.id}-${scheduleDate}-${windowStartTime}-${windowEndTime}`}
        units={windowedUnits}
        sections={category.sections ?? []}
        categoryLabel={category.name}
        visualType={visualType}
        stationsPerPage={isDining ? undefined : 10}
        canWrite
        highlightedUnitId={highlightedUnitId}
        precomputedStatus
        blockingBookingsByUnitId={blockingMap}
        mapVariant={compactMap ? "compact" : "full"}
        onInspectBlocked={onInspectBlocked}
        chromeLabels={chromeLabels}
        guestStatusLabels={guestStatusLabels}
        floorTabsSlot={(tabs) => mapControls(tabs)}
        onBookUnit={(unitId) => {
          const unit = windowedUnits.find((u) => u.id === unitId);
          if (unit) onBookUnit(unit);
        }}
      />
    </div>
  );
}
