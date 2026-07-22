"use client";

import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Layers,
  LayoutGrid,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BowlingLaneIcon } from "@/components/icons/bowling-lane-icon";
import { resolveEffectiveFloorStatus } from "@/components/reservations/seat-floor-map";
import { cn } from "@/lib/cn";
import {
  FLOOR_STATUS_DOT,
  FLOOR_STATUS_LABELS,
  type UnitFloorStatus,
} from "@/lib/booking-floor-status";
import { isLiveBooking } from "@/lib/booking-time";
import {
  buildFloorSectionGroups,
  groupSectionsByFloor,
  layoutKey,
  layoutLabel,
} from "@/lib/gaming-floor-groups";
import type {
  ScheduleBooking,
  ScheduleCategorySection,
  ScheduleUnit,
} from "@/lib/reservations-client";
import { UnitStaffMenu } from "@/components/reservations/unit-staff-menu";

const LANES_PER_PAGE = 8;

export type BowlingLaneChromeLabels = {
  floor?: string;
  floorN?: (n: number) => string;
  layoutZone?: string;
  noLanes?: string;
  alleyHint?: string;
  swipeLanes?: string;
  prev?: string;
  next?: string;
  lanesRange?: (from: number, to: number, total: number) => string;
  staffLaneHint?: string;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function findLiveBooking(
  unit: ScheduleUnit,
  nowMs: number,
): ScheduleBooking | null {
  return (
    unit.bookings.find(
      (b) =>
        isLiveBooking(b, nowMs) &&
        new Date(b.startsAt).getTime() <= nowMs &&
        new Date(b.endsAt).getTime() > nowMs,
    ) ?? null
  );
}

function laneNumber(name: string) {
  const digits = name.replace(/\D/g, "");
  return digits || name;
}

export function BowlingLaneFloorMap({
  units,
  sections = [],
  canWrite = false,
  nowMs = Date.now(),
  highlightedUnitId,
  onBookUnit,
  onEditBooking,
  onInspectBlocked,
  onToggleNotWorking,
  precomputedStatus = false,
  blockingBookingsByUnitId,
  displayOnly = false,
  showLegend = true,
  lanesPerPage = LANES_PER_PAGE,
  chromeLabels,
  guestStatusLabels,
}: {
  units: ScheduleUnit[];
  sections?: ScheduleCategorySection[];
  canWrite?: boolean;
  nowMs?: number;
  highlightedUnitId?: string | null;
  onBookUnit?: (unitId: string) => void;
  onEditBooking?: (booking: ScheduleBooking, unitId: string) => void;
  onInspectBlocked?: (unitId: string, booking: ScheduleBooking) => void;
  onToggleNotWorking?: (unitId: string, notWorking: boolean) => void;
  precomputedStatus?: boolean;
  blockingBookingsByUnitId?: Record<string, ScheduleBooking>;
  displayOnly?: boolean;
  showLegend?: boolean;
  lanesPerPage?: number;
  /** Optional guest/public i18n chrome (staff callers omit → English defaults). */
  chromeLabels?: BowlingLaneChromeLabels;
  /** Optional guest-window legend / tile status labels (public i18n). */
  guestStatusLabels?: Record<UnitFloorStatus, string>;
}) {
  const statusLabels = guestStatusLabels ?? FLOOR_STATUS_LABELS;
  const [activeFloor, setActiveFloor] = useState(1);
  const [activeLayoutKey, setActiveLayoutKey] = useState("");
  const [page, setPage] = useState(0);

  const sectionGroups = useMemo(
    () => buildFloorSectionGroups(units, sections),
    [units, sections],
  );
  const floorMap = useMemo(
    () => groupSectionsByFloor(sectionGroups),
    [sectionGroups],
  );
  const floors = useMemo(() => [...floorMap.keys()], [floorMap]);
  const layoutsOnFloor = useMemo(
    () => floorMap.get(activeFloor) ?? [],
    [floorMap, activeFloor],
  );
  const activeLayout = useMemo(() => {
    if (!layoutsOnFloor.length) return null;
    const found = layoutsOnFloor.find(
      (g, i) => layoutKey(g, i) === activeLayoutKey,
    );
    return found ?? layoutsOnFloor[0];
  }, [layoutsOnFloor, activeLayoutKey]);

  const lanesInLayout = activeLayout?.units ?? units;
  const pageCount = Math.max(1, Math.ceil(lanesInLayout.length / lanesPerPage));
  const safePage = Math.min(page, pageCount - 1);
  const pageLanes = useMemo(() => {
    const start = safePage * lanesPerPage;
    return lanesInLayout.slice(start, start + lanesPerPage);
  }, [lanesInLayout, safePage, lanesPerPage]);

  useEffect(() => {
    const firstFloor = floors[0] ?? 1;
    setActiveFloor(firstFloor);
    const firstLayouts = floorMap.get(firstFloor) ?? [];
    setActiveLayoutKey(
      firstLayouts.length ? layoutKey(firstLayouts[0], 0) : "",
    );
    setPage(0);
  }, [units, sections, floors, floorMap]);

  useEffect(() => {
    if (!layoutsOnFloor.length) return;
    const exists = layoutsOnFloor.some(
      (g, i) => layoutKey(g, i) === activeLayoutKey,
    );
    if (!exists) {
      setActiveLayoutKey(layoutKey(layoutsOnFloor[0], 0));
    }
  }, [layoutsOnFloor, activeLayoutKey]);

  if (!units.length) {
    return (
      <p className="px-6 py-12 text-center text-sm text-zinc-500">
        {chromeLabels?.noLanes ?? "No lanes configured yet."}
      </p>
    );
  }

  const multiFloor = floors.length > 1;
  const multiLayout = layoutsOnFloor.length > 1;

  return (
    <div className="flex min-w-0 w-full flex-col">
      {multiFloor ? (
        <div className="border-b border-white/10 bg-zinc-950/40 px-3 py-2.5">
          <p className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
            <Layers size={10} className="text-emerald-400/70" />
            {chromeLabels?.floor ?? "Floor"}
          </p>
          <div className="flex flex-wrap gap-1">
            {floors.map((floor) => {
              const groups = floorMap.get(floor) ?? [];
              const free = groups
                .flatMap((g) => g.units)
                .filter((u) => u.floorStatus === "AVAILABLE").length;
              const count = groups.reduce((n, g) => n + g.units.length, 0);
              return (
                <button
                  key={floor}
                  type="button"
                  onClick={() => {
                    setActiveFloor(floor);
                    const layouts = floorMap.get(floor) ?? [];
                    setActiveLayoutKey(
                      layouts.length ? layoutKey(layouts[0], 0) : "",
                    );
                    setPage(0);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition",
                    activeFloor === floor
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                      : "border-white/10 text-zinc-500 hover:text-zinc-300",
                  )}
                >
                  {chromeLabels?.floorN
                    ? chromeLabels.floorN(floor)
                    : `Floor ${floor}`}
                  <span className="opacity-70">
                    · {free}/{count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {multiLayout ? (
        <div className="border-b border-white/10 bg-zinc-900/20 px-3 py-2">
          <p className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
            <LayoutGrid size={10} className="text-amber-400/70" />
            {chromeLabels?.layoutZone ?? "Layout / zone"}
          </p>
          <div className="flex flex-wrap gap-1">
            {layoutsOnFloor.map((group, index) => {
              const key = layoutKey(group, index);
              const free = group.units.filter(
                (u) => u.floorStatus === "AVAILABLE",
              ).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setActiveLayoutKey(key);
                    setPage(0);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition",
                    activeLayoutKey === key
                      ? "border-amber-400/35 bg-amber-500/12 text-amber-200"
                      : "border-white/10 text-zinc-500 hover:text-zinc-300",
                  )}
                >
                  {group.section?.isVip ? (
                    <Crown size={9} className="text-amber-400" />
                  ) : null}
                  {layoutLabel(group)}
                  <span className="opacity-70">
                    · {free}/{group.units.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="min-w-0 p-3 md:p-6">
        <div className="mx-auto w-full min-w-0 max-w-4xl rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/80 to-zinc-950/90 px-2 py-4 md:px-6 md:py-6">
          <p className="mb-4 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 sm:tracking-[0.25em]">
            {chromeLabels?.alleyHint ?? "Bowling alley · approach → pins"}
          </p>
          <div className="overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5">
            <p className="mb-2 text-center text-[10px] text-zinc-500 md:hidden">
              {chromeLabels?.swipeLanes ?? "Swipe to see lanes"}
            </p>
            <div className="flex min-w-min items-end justify-center gap-2 px-1 pb-1 sm:gap-3 md:gap-4">
            {pageLanes.map((unit) => (
              <LaneTile
                key={unit.id}
                unit={unit}
                nowMs={nowMs}
                canWrite={canWrite}
                displayOnly={displayOnly}
                highlighted={highlightedUnitId === unit.id}
                precomputedStatus={precomputedStatus}
                blockingBooking={blockingBookingsByUnitId?.[unit.id]}
                statusLabels={statusLabels}
                onBookUnit={onBookUnit}
                onEditBooking={onEditBooking}
                onInspectBlocked={onInspectBlocked}
                onToggleNotWorking={onToggleNotWorking}
              />
            ))}
            </div>
          </div>
        </div>
      </div>

      {lanesInLayout.length > lanesPerPage ? (
        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-zinc-950/50 px-3 py-2.5">
          <button
            type="button"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="inline-flex items-center gap-0.5 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-white/5 disabled:opacity-40"
          >
            <ChevronLeft size={14} />
            {chromeLabels?.prev ?? "Prev"}
          </button>
          <p className="text-[11px] text-zinc-500">
            {chromeLabels?.lanesRange
              ? chromeLabels.lanesRange(
                  safePage * lanesPerPage + 1,
                  Math.min(
                    (safePage + 1) * lanesPerPage,
                    lanesInLayout.length,
                  ),
                  lanesInLayout.length,
                )
              : `Lanes ${safePage * lanesPerPage + 1}–${Math.min((safePage + 1) * lanesPerPage, lanesInLayout.length)} of ${lanesInLayout.length}`}
          </p>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            className="inline-flex items-center gap-0.5 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-white/5 disabled:opacity-40"
          >
            {chromeLabels?.next ?? "Next"}
            <ChevronRight size={14} />
          </button>
        </div>
      ) : null}

      {showLegend ? (
        <div className="space-y-2">
          {canWrite && onToggleNotWorking && !displayOnly ? (
            <p className="text-center text-[10px] text-zinc-600">
              {chromeLabels?.staffLaneHint ?? (
                <>
                  Tap a free lane to book · use{" "}
                  <span className="text-zinc-500">⋮</span> to mark out of
                  service · tap gray lanes to restore
                </>
              )}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-center gap-3 border-t border-white/5 px-4 py-3 text-[10px] text-zinc-400">
          {(["AVAILABLE", "UNAVAILABLE", "NOT_WORKING"] as UnitFloorStatus[]).map(
            (s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <BowlingLaneIcon status={s} className="h-8 w-5" />
                {statusLabels[s]}
              </span>
            ),
          )}
        </div>
        </div>
      ) : null}
    </div>
  );
}

function LaneTile({
  unit,
  nowMs,
  canWrite,
  displayOnly,
  highlighted,
  precomputedStatus,
  blockingBooking,
  statusLabels,
  onBookUnit,
  onEditBooking,
  onInspectBlocked,
  onToggleNotWorking,
}: {
  unit: ScheduleUnit;
  nowMs: number;
  canWrite: boolean;
  displayOnly: boolean;
  highlighted: boolean;
  precomputedStatus: boolean;
  blockingBooking?: ScheduleBooking;
  statusLabels: Record<UnitFloorStatus, string>;
  onBookUnit?: (unitId: string) => void;
  onEditBooking?: (booking: ScheduleBooking, unitId: string) => void;
  onInspectBlocked?: (unitId: string, booking: ScheduleBooking) => void;
  onToggleNotWorking?: (unitId: string, notWorking: boolean) => void;
}) {
  const status = precomputedStatus
    ? unit.floorStatus
    : resolveEffectiveFloorStatus(unit, nowMs);
  const live = precomputedStatus
    ? blockingBooking ?? null
    : findLiveBooking(unit, nowMs);
  const interactive = canWrite && !displayOnly;

  const handleClick = () => {
    if (!interactive) return;
    if (status === "NOT_WORKING" && onToggleNotWorking) {
      onToggleNotWorking(unit.id, false);
      return;
    }
    if (status === "AVAILABLE") {
      onBookUnit?.(unit.id);
      return;
    }
    if (status === "UNAVAILABLE" && live) {
      if (precomputedStatus && onInspectBlocked) {
        onInspectBlocked(unit.id, live);
      } else {
        onEditBooking?.(live, unit.id);
      }
    }
  };

  const tooltip = live
    ? `${unit.name} · ${formatTime(live.startsAt)}–${formatTime(live.endsAt)}`
    : `${unit.name} · ${statusLabels[status]}`;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!interactive}
        onClick={handleClick}
        title={tooltip}
        className={cn(
          "group flex w-[3.25rem] shrink-0 flex-col items-center gap-1 rounded-xl border border-transparent p-1 transition sm:w-14",
          interactive &&
            status === "AVAILABLE" &&
            "cursor-pointer hover:border-emerald-400/40 hover:bg-emerald-500/10",
          interactive &&
            status === "UNAVAILABLE" &&
            live &&
            "cursor-pointer hover:border-rose-400/40 hover:bg-rose-500/10",
          interactive &&
            status === "NOT_WORKING" &&
            "cursor-pointer hover:border-zinc-400/40 hover:bg-zinc-500/10",
          !interactive && "cursor-default opacity-80",
          highlighted && "ring-2 ring-sky-400/60 ring-offset-2 ring-offset-zinc-950",
        )}
      >
        <div
          className={cn(
            "rounded-lg transition group-hover:scale-[1.02]",
            status === "AVAILABLE" && "shadow-[0_0_14px_rgba(52,211,153,0.25)]",
            status === "UNAVAILABLE" && "shadow-[0_0_14px_rgba(251,113,133,0.25)]",
          )}
        >
          <BowlingLaneIcon status={status} className="h-[4.5rem] w-9 sm:h-20 sm:w-10" />
        </div>
        <span className="text-[10px] font-semibold text-zinc-200">
          {laneNumber(unit.name)}
        </span>
        <span
          className={cn(
            "flex items-center gap-0.5 text-[8px] font-medium uppercase tracking-wide",
            status === "AVAILABLE" && "text-emerald-300/90",
            status === "UNAVAILABLE" && "text-rose-300/90",
            status === "NOT_WORKING" && "text-zinc-500",
          )}
        >
          <span className={cn("size-1 rounded-full", FLOOR_STATUS_DOT[status])} />
          {statusLabels[status].split(/\s|—|–|-/)[0]}
        </span>
        {live && status === "UNAVAILABLE" ? (
          <span className="max-w-full truncate text-[8px] text-zinc-500">
            {live.guestName}
          </span>
        ) : null}
      </button>
      {interactive && onToggleNotWorking && status !== "UNAVAILABLE" ? (
        <UnitStaffMenu
          unitName={unit.name}
          isOutOfService={status === "NOT_WORKING"}
          onToggleOutOfService={() =>
            onToggleNotWorking(unit.id, status !== "NOT_WORKING")
          }
        />
      ) : null}
    </div>
  );
}
