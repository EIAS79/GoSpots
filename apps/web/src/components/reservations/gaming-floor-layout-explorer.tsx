"use client";

import {
  ChevronLeft,
  ChevronRight,
  Crown,
  LayoutGrid,
  Layers,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SeatFloorMap } from "@/components/reservations/seat-floor-map";
import { cn } from "@/lib/cn";
import {
  buildFloorSectionGroups,
  groupSectionsByFloor,
  layoutKey,
  layoutLabel,
} from "@/lib/gaming-floor-groups";
import type { FloorMapVisualType } from "@/lib/gaming-floor-visual";
import type {
  ScheduleBooking,
  ScheduleCategorySection,
  ScheduleUnit,
} from "@/lib/reservations-client";

const DEFAULT_STATIONS_PER_PAGE = 12;

export function GamingFloorLayoutExplorer({
  units,
  sections = [],
  categoryLabel,
  visualType,
  stationsPerPage = DEFAULT_STATIONS_PER_PAGE,
  canWrite = false,
  nowMs,
  highlightedUnitId,
  onBookUnit,
  onEditBooking,
  precomputedStatus = false,
  blockingBookingsByUnitId,
  onInspectBlocked,
  displayOnly = false,
  floorTabsSlot,
  onToggleNotWorking,
  mapVariant = "full",
}: {
  units: ScheduleUnit[];
  sections?: ScheduleCategorySection[];
  categoryLabel?: string;
  visualType: FloorMapVisualType;
  stationsPerPage?: number;
  canWrite?: boolean;
  nowMs?: number;
  highlightedUnitId?: string | null;
  onBookUnit?: (unitId: string) => void;
  onEditBooking?: (booking: ScheduleBooking, unitId: string) => void;
  precomputedStatus?: boolean;
  blockingBookingsByUnitId?: Record<string, ScheduleBooking>;
  onInspectBlocked?: (unitId: string, booking: ScheduleBooking) => void;
  displayOnly?: boolean;
  /** Render floor tabs elsewhere (e.g. inside map controls header). */
  floorTabsSlot?: (tabs: ReactNode) => ReactNode;
  onToggleNotWorking?: (unitId: string, notWorking: boolean) => void;
  /** Compact seats for narrow public screens. */
  mapVariant?: "full" | "compact";
}) {
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

  const unitsInLayout = activeLayout?.units ?? [];
  const pageCount = Math.max(
    1,
    Math.ceil(unitsInLayout.length / stationsPerPage),
  );
  const safePage = Math.min(page, pageCount - 1);
  const pageUnits = useMemo(() => {
    const start = safePage * stationsPerPage;
    return unitsInLayout.slice(start, start + stationsPerPage);
  }, [unitsInLayout, safePage, stationsPerPage]);

  const activeSection = activeLayout?.section;
  const multiFloor = floors.length > 1;
  const multiLayout = layoutsOnFloor.length > 1;

  useEffect(() => {
    const firstFloor = floors[0] ?? 1;
    setActiveFloor(firstFloor);
    const firstLayouts = floorMap.get(firstFloor) ?? [];
    setActiveLayoutKey(
      firstLayouts.length ? layoutKey(firstLayouts[0], 0) : "",
    );
    setPage(0);
  }, [units, sections, floors, floorMap]);

  const handleFloorChange = (floor: number) => {
    setActiveFloor(floor);
    const layouts = floorMap.get(floor) ?? [];
    setActiveLayoutKey(layouts.length ? layoutKey(layouts[0], 0) : "");
    setPage(0);
  };

  const handleLayoutChange = (key: string) => {
    setActiveLayoutKey(key);
    setPage(0);
  };

  useEffect(() => {
    if (!layoutsOnFloor.length) return;
    const exists = layoutsOnFloor.some(
      (g, i) => layoutKey(g, i) === activeLayoutKey,
    );
    if (!exists) {
      setActiveLayoutKey(layoutKey(layoutsOnFloor[0], 0));
    }
  }, [layoutsOnFloor, activeLayoutKey]);

  const floorTabs = multiFloor ? (
    <div className="flex flex-wrap gap-1">
      {floors.map((floor) => {
        const groups = floorMap.get(floor) ?? [];
        const free = groups
          .flatMap((g) => g.units)
          .filter((u) => u.floorStatus === "AVAILABLE").length;
        const count = groups.reduce((n, g) => n + g.units.length, 0);
        const selected = activeFloor === floor;
        return (
          <button
            key={floor}
            type="button"
            onClick={() => handleFloorChange(floor)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition",
              selected
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                : "border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-300",
            )}
          >
            <Layers size={10} className="opacity-70" />
            Floor {floor}
            <span className="opacity-70">
              · {free}/{count}
            </span>
          </button>
        );
      })}
    </div>
  ) : null;

  if (!units.length) {
    return (
      <p className="px-6 py-12 text-center text-sm text-zinc-500">
        No stations configured for this activity yet.
      </p>
    );
  }

  const explorerBody = (
    <>
      {floorTabsSlot ? (
        floorTabsSlot(floorTabs)
      ) : floorTabs ? (
        <div className="border-b border-white/10 bg-zinc-950/40 px-3 py-2.5">
          <p className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
            <Layers size={10} className="text-emerald-400/70" />
            Floor
          </p>
          {floorTabs}
        </div>
      ) : null}

      {multiLayout ? (
        <div className="border-b border-white/10 bg-zinc-900/20 px-3 py-2">
          <p className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
            <LayoutGrid size={10} className="text-amber-400/70" />
            Layout / zone
          </p>
          <div className="flex flex-wrap gap-1">
            {layoutsOnFloor.map((group, index) => {
              const key = layoutKey(group, index);
              const selected = activeLayoutKey === key;
              const free = group.units.filter(
                (u) => u.floorStatus === "AVAILABLE",
              ).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleLayoutChange(key)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition",
                    selected
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

      <div className="min-w-0 p-2 md:p-3">
        {pageUnits.length > 0 ? (
          <SeatFloorMap
            units={pageUnits}
            sections={
              activeSection
                ? [
                    {
                      id: activeSection.id,
                      name: activeSection.name,
                      floor: activeSection.floor,
                      isVip: activeSection.isVip,
                      seatsPerRow: activeSection.seatsPerRow,
                      sortOrder: activeSection.sortOrder,
                    },
                  ]
                : []
            }
            categoryLabel={categoryLabel}
            canWrite={canWrite}
            displayOnly={displayOnly}
            variant={mapVariant}
            pageSize={stationsPerPage}
            visualType={visualType}
            nowMs={nowMs}
            highlightedUnitId={highlightedUnitId}
            precomputedStatus={precomputedStatus}
            blockingBookingsByUnitId={blockingBookingsByUnitId}
            onInspectBlocked={onInspectBlocked}
            onBookUnit={onBookUnit}
            onEditBooking={onEditBooking}
            onToggleNotWorking={onToggleNotWorking}
            showScreenHeader={false}
          />
        ) : (
          <p className="py-12 text-center text-sm text-zinc-500">
            No stations in this layout.
          </p>
        )}
      </div>

      {unitsInLayout.length > stationsPerPage ? (
        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-zinc-950/50 px-3 py-2.5">
          <button
            type="button"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="inline-flex items-center gap-0.5 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-white/5 disabled:opacity-40"
          >
            <ChevronLeft size={14} />
            Prev
          </button>
          <p className="text-[11px] text-zinc-500">
            Page {safePage + 1} of {pageCount}
            <span className="text-zinc-600">
              {" "}
              · stations {safePage * stationsPerPage + 1}–
              {Math.min(
                (safePage + 1) * stationsPerPage,
                unitsInLayout.length,
              )}{" "}
              of {unitsInLayout.length}
            </span>
          </p>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            className="inline-flex items-center gap-0.5 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-400 transition hover:bg-white/5 disabled:opacity-40"
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      ) : null}
    </>
  );

  return <div className="flex min-w-0 w-full flex-col">{explorerBody}</div>;
}
