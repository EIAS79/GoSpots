"use client";

import { ChevronLeft, ChevronRight, Crown, Gamepad2, Layers, Monitor } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BilliardTableIcon } from "@/components/icons/billiard-table-icon";
import { ArcadeCabinetIcon } from "@/components/icons/arcade-cabinet-icon";
import { FoosballTableIcon } from "@/components/icons/foosball-table-icon";
import { PingPongTableIcon } from "@/components/icons/ping-pong-table-icon";
import { DiningTableIcon } from "@/components/icons/dining-table-icon";
import type { FloorMapVisualType } from "@/lib/gaming-floor-visual";
import { cn } from "@/lib/cn";
import {
  FLOOR_STATUS_DOT,
  FLOOR_STATUS_LABELS,
  type UnitFloorStatus,
} from "@/lib/booking-floor-status";
import { isLiveBooking } from "@/lib/booking-time";
import type {
  ScheduleBooking,
  ScheduleCategorySection,
  ScheduleUnit,
} from "@/lib/reservations-client";
import { UnitStaffMenu } from "@/components/reservations/unit-staff-menu";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import { usePublicPrefsOptional } from "@/lib/public-prefs-context";

/**
 * Chrome translator shared by the staff dashboard (VenueSettingsProvider,
 * "floor.*" keys) and public guest pages (PublicPrefsProvider,
 * "venuePage.floor.*" keys). Returns `undefined` when neither provider is
 * mounted, or when the resolved value is just the raw dotted key (i.e. the
 * key doesn't exist in that catalog) — callers should `??` an English default.
 */
function useFloorChromeT() {
  const venueSettings = useVenueSettingsOptional();
  const publicPrefs = usePublicPrefsOptional();
  return (suffix: string, vars?: Record<string, string | number>) => {
    if (venueSettings?.t) {
      const key = `floor.${suffix}`;
      const val = venueSettings.t(key, vars);
      if (val && val !== key) return val;
    }
    if (publicPrefs?.t) {
      const key = `venuePage.floor.${suffix}`;
      const val = publicPrefs.t(key, vars);
      if (val && val !== key) return val;
    }
    return undefined;
  };
}

function screenLabelFor(
  visualType: FloorMapVisualType,
  t: (suffix: string) => string | undefined,
): string {
  switch (visualType) {
    case "dining":
    case "billiard":
    case "pingpong":
    case "foosball":
      return t("screenTables") ?? "Tables";
    case "arcade":
      return t("screenCabinets") ?? "Cabinets";
    case "playstation":
      return t("screenStations") ?? "Stations";
    default:
      return t("screenScreen") ?? "Screen";
  }
}

function tapHintFor(
  visualType: FloorMapVisualType,
  t: (suffix: string) => string | undefined,
): string {
  if (visualType === "dining") {
    return t("tapHintDining") ?? "Tap a table that fits your party size to book";
  }
  if (visualType === "billiard" || visualType === "pingpong" || visualType === "foosball") {
    return t("tapHintTable") ?? "Tap a table to book or view the active session";
  }
  if (visualType === "arcade") {
    return t("tapHintCabinet") ?? "Tap a cabinet to book or view the active session";
  }
  return t("tapHintSeat") ?? "Tap a seat to book or view the active session";
}

const DEFAULT_SEATS_PER_ROW = 6;
const FULL_PAGE_SIZE = 48;
const COMPACT_PAGE_SIZE = 8;
const COMPACT_MOBILE_PAGE_SIZE = 6;
/** Dining maps: fewer tables per page so areas stay readable. */
const DINING_FULL_PAGE_SIZE = 8;
const DINING_COMPACT_PAGE_SIZE = 6;
const DINING_COMPACT_MOBILE_PAGE_SIZE = 4;

const CHAIR_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-emerald-500/90 stroke-emerald-300",
  UNAVAILABLE: "fill-rose-500/90 stroke-rose-300",
  NOT_WORKING: "fill-zinc-600/80 stroke-zinc-400",
};

const CHAIR_GLOW: Record<UnitFloorStatus, string> = {
  AVAILABLE: "shadow-[0_0_12px_rgba(52,211,153,0.35)]",
  UNAVAILABLE: "shadow-[0_0_12px_rgba(251,113,133,0.35)]",
  NOT_WORKING: "shadow-none",
};

export type SeatSectionMeta = {
  id: string;
  name: string;
  floor: number;
  isVip: boolean;
  seatsPerRow: number;
  sortOrder?: number;
  /** INDOOR | OUTDOOR when set (dining areas). */
  zone?: string | null;
};

export type { FloorMapVisualType };

function SectionZoneIcon({
  visualType,
  className,
}: {
  visualType: FloorMapVisualType;
  className?: string;
}) {
  if (visualType === "billiard") {
    return <BilliardTableIcon status="AVAILABLE" className={className} />;
  }
  if (visualType === "pingpong") {
    return <PingPongTableIcon status="AVAILABLE" className={className} />;
  }
  if (visualType === "foosball") {
    return <FoosballTableIcon status="AVAILABLE" className={className} />;
  }
  if (visualType === "arcade") {
    return <ArcadeCabinetIcon status="AVAILABLE" className={className} />;
  }
  if (visualType === "playstation") {
    return <Gamepad2 size={12} className={cn("text-emerald-400/80", className)} />;
  }
  if (visualType === "dining") {
    return <DiningTableIcon status="AVAILABLE" seats={4} className={className ?? "h-3.5 w-3.5"} />;
  }
  return <Monitor size={12} className={cn("text-emerald-400/80", className)} />;
}

function UnitMapIcon({
  visualType,
  status,
  seats,
  className,
}: {
  visualType: FloorMapVisualType;
  status: UnitFloorStatus;
  seats?: number | null;
  className?: string;
}) {
  switch (visualType) {
    case "playstation":
      return <ConsoleStationIcon status={status} className={className} />;
    case "billiard":
      return <BilliardTableIcon status={status} className={className} />;
    case "pingpong":
      return <PingPongTableIcon status={status} className={className} />;
    case "foosball":
      return <FoosballTableIcon status={status} className={className} />;
    case "arcade":
      return <ArcadeCabinetIcon status={status} className={className} />;
    case "dining":
      return (
        <DiningTableIcon status={status} seats={seats} className={className} />
      );
    default:
      return <CinemaChairIcon status={status} className={className} />;
  }
}

function unitMapIconSize(
  visualType: FloorMapVisualType,
  sm: boolean,
): string | undefined {
  if (visualType === "dining") {
    return sm ? "h-7 w-7" : "h-9 w-9";
  }
  if (visualType === "billiard") {
    return sm ? "h-5 w-9" : "h-7 w-12";
  }
  if (visualType === "pingpong") return sm ? "h-5 w-8" : "h-7 w-11";
  if (visualType === "foosball") return sm ? "h-5 w-9" : "h-7 w-12";
  if (visualType === "arcade") return sm ? "h-6 w-5" : "h-8 w-6";
  if (visualType === "playstation") return sm ? "h-6 w-7" : "h-8 w-9";
  return sm ? "h-6 w-5" : undefined;
}

function legendMapIcon(
  visualType: FloorMapVisualType,
  status: UnitFloorStatus,
  compact: boolean,
) {
  const sm = compact;
  return (
    <UnitMapIcon
      visualType={visualType}
      status={status}
      seats={4}
      className={unitMapIconSize(visualType, sm)}
    />
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function resolveEffectiveFloorStatus(
  unit: ScheduleUnit,
  nowMs: number,
): UnitFloorStatus {
  const hasLiveBlocking = unit.bookings.some(
    (b) =>
      isLiveBooking(b, nowMs) &&
      new Date(b.startsAt).getTime() <= nowMs &&
      new Date(b.endsAt).getTime() > nowMs,
  );
  if (unit.floorStatus === "UNAVAILABLE" && !hasLiveBlocking) {
    return "AVAILABLE";
  }
  return unit.floorStatus;
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

function chunkRows<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

type DiningLayoutGroup = {
  id: string;
  label: string;
  capacity: number;
  seatsPerRow: number;
  sortOrder: number;
  units: ScheduleUnit[];
};

function buildDiningLayoutGroups(
  units: ScheduleUnit[],
  t?: (suffix: string, vars?: Record<string, string | number>) => string | undefined,
): DiningLayoutGroup[] {
  const byKey = new Map<string, DiningLayoutGroup>();

  for (const unit of units) {
    const capacity = unit.capacity ?? unit.tableGroup?.capacity ?? 4;
    const key = unit.tableGroup?.id ?? `capacity-${capacity}`;
    let group = byKey.get(key);
    if (!group) {
      const customName = unit.tableGroup?.name?.trim();
      group = {
        id: key,
        label:
          customName && customName !== `${capacity}-seat table`
            ? customName
            : capacity === 1
              ? (t?.("nTopTables", { n: 1 }) ?? "1-top tables")
              : (t?.("nTopTables", { n: capacity }) ?? `${capacity}-top tables`),
        capacity,
        seatsPerRow: unit.tableGroup?.seatsPerRow ?? 4,
        sortOrder: unit.tableGroup?.sortOrder ?? capacity * 100,
        units: [],
      };
      byKey.set(key, group);
    }
    group.units.push(unit);
  }

  return [...byKey.values()]
    .map((group) => ({
      ...group,
      units: [...group.units].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.capacity - b.capacity);
}

function CinemaChairIcon({
  status,
  className,
}: {
  status: UnitFloorStatus;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 36"
      className={cn("h-9 w-8", className)}
      aria-hidden
    >
      <path
        d="M6 14h20v4a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-4Z"
        className={cn(CHAIR_FILL[status], "stroke-[1.5]")}
      />
      <path
        d="M8 6h16a2 2 0 0 1 2 2v8H6V8a2 2 0 0 1 2-2Z"
        className={cn(CHAIR_FILL[status], "stroke-[1.5]")}
      />
      <path
        d="M10 28h12v3H10z"
        className={cn(CHAIR_FILL[status], "stroke-[1.5]")}
      />
    </svg>
  );
}

function ConsoleStationIcon({
  status,
  className,
}: {
  status: UnitFloorStatus;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 44 36"
      className={cn("h-9 w-10", className)}
      aria-hidden
    >
      <path
        d="M8 7h28a3 3 0 0 1 3 3v10a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V10a3 3 0 0 1 3-3Z"
        className={cn(CHAIR_FILL[status], "stroke-[1.5]")}
      />
      <path
        d="M14 28h16"
        className={cn(CHAIR_FILL[status], "stroke-[1.5] fill-none")}
      />
      <path
        d="M19 24v4M25 24v4"
        className={cn(CHAIR_FILL[status], "stroke-[1.5] fill-none")}
      />
      <path
        d="M14 12h16v6H14z"
        className="fill-zinc-950/55 stroke-none"
      />
    </svg>
  );
}

type SectionGroup = {
  section: SeatSectionMeta | null;
  units: ScheduleUnit[];
};

function buildSectionGroups(
  units: ScheduleUnit[],
  sections: SeatSectionMeta[],
): SectionGroup[] {
  const sorted = [...sections].sort(
    (a, b) =>
      a.floor - b.floor ||
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.name.localeCompare(b.name),
  );
  const groups: SectionGroup[] = [];
  const assigned = new Set<string>();

  for (const section of sorted) {
    const sectionUnits = units.filter((u) => u.section?.id === section.id);
    sectionUnits.forEach((u) => assigned.add(u.id));
    if (sectionUnits.length > 0) {
      groups.push({ section, units: sectionUnits });
    }
  }

  const unassigned = units.filter((u) => !u.section?.id && !assigned.has(u.id));
  if (unassigned.length > 0) {
    groups.push({ section: null, units: unassigned });
  }

  if (groups.length === 0 && units.length > 0) {
    groups.push({ section: null, units });
  }

  return groups;
}

function groupByFloor(groups: SectionGroup[]): Map<number, SectionGroup[]> {
  const floors = new Map<number, SectionGroup[]>();
  for (const group of groups) {
    const floor = group.section?.floor ?? 1;
    const list = floors.get(floor) ?? [];
    list.push(group);
    floors.set(floor, list);
  }
  return new Map([...floors.entries()].sort(([a], [b]) => a - b));
}

const GUEST_WINDOW_STATUS_LABELS: Record<UnitFloorStatus, string> = {
  AVAILABLE: "Available for your time — tap to book",
  UNAVAILABLE: "Reserved during your time — tap for details",
  NOT_WORKING: "Out of service",
};

export type SeatFloorMapProps = {
  units: ScheduleUnit[];
  sections?: ScheduleCategorySection[] | SeatSectionMeta[];
  categoryLabel?: string;
  canWrite?: boolean;
  nowMs?: number;
  highlightedUnitId?: string | null;
  displayOnly?: boolean;
  /** Full = reservations schedule. Compact = embedded preview on gaming cards. */
  variant?: "full" | "compact";
  pageSize?: number;
  visualType?: FloorMapVisualType;
  onBookUnit?: (unitId: string) => void;
  onEditBooking?: (booking: ScheduleBooking, unitId: string) => void;
  /** When true, use unit.floorStatus as-is (e.g. guest time-window check). */
  precomputedStatus?: boolean;
  /** Blocking booking per unit for tooltips / inspect (guest window mode). */
  blockingBookingsByUnitId?: Record<string, ScheduleBooking>;
  onInspectBlocked?: (unitId: string, booking: ScheduleBooking) => void;
  onToggleNotWorking?: (unitId: string, notWorking: boolean) => void;
  /** Hide the centered screen title (when the parent already shows the activity name). */
  showScreenHeader?: boolean;
  /** Always show section/area name headers (even for a single section). */
  showSectionLabels?: boolean;
  /** When true, parent owns paging — do not render internal pagination bars. */
  disablePagination?: boolean;
  /** Hide the bottom status legend (when the parent renders its own). */
  showLegend?: boolean;
  /** Optional status legend / tile labels (public guest or staff i18n). */
  guestStatusLabels?: Record<UnitFloorStatus, string>;
  /** Optional fallback zone name when a section has no name. */
  mainAreaLabel?: string;
  /** Optional staff hint under the legend (write mode). */
  staffStationHint?: string;
};

export function SeatFloorMap({
  units,
  sections = [],
  categoryLabel,
  canWrite = false,
  nowMs: nowMsProp,
  highlightedUnitId,
  displayOnly = false,
  variant = "full",
  pageSize: pageSizeProp,
  visualType = "pc",
  onBookUnit,
  onEditBooking,
  precomputedStatus = false,
  blockingBookingsByUnitId,
  onInspectBlocked,
  onToggleNotWorking,
  showScreenHeader = true,
  showSectionLabels = false,
  disablePagination = false,
  showLegend = true,
  guestStatusLabels,
  mainAreaLabel,
  staffStationHint,
}: SeatFloorMapProps) {
  const t = useFloorChromeT();
  const compact = variant === "compact";
  const fallbackZone = mainAreaLabel ?? t("mainArea") ?? "Main area";
  const tileLabels: Record<UnitFloorStatus, string> = {
    AVAILABLE: t("tileFree") ?? "Free",
    UNAVAILABLE: t("tileBusy") ?? "Busy",
    NOT_WORKING: t("tileOff") ?? "Off",
  };
  const statusLabels =
    guestStatusLabels ??
    (precomputedStatus ? GUEST_WINDOW_STATUS_LABELS : FLOOR_STATUS_LABELS);
  const pageSize =
    pageSizeProp ??
    (visualType === "dining"
      ? compact
        ? DINING_COMPACT_PAGE_SIZE
        : DINING_FULL_PAGE_SIZE
      : compact
        ? COMPACT_PAGE_SIZE
        : FULL_PAGE_SIZE);
  const mobilePageSize =
    visualType === "dining"
      ? DINING_COMPACT_MOBILE_PAGE_SIZE
      : COMPACT_MOBILE_PAGE_SIZE;
  const [page, setPage] = useState(0);
  const [mobilePage, setMobilePage] = useState(0);
  const [activeZoneId, setActiveZoneId] = useState<string | "all">("all");
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setPage(0);
    setMobilePage(0);
  }, [units.length, sections.length, activeZoneId]);

  const nowMs = nowMsProp ?? tick;

  const sectionMeta: SeatSectionMeta[] = useMemo(() => {
    if (sections.length > 0) {
      return sections.map((s) => ({
        id: s.id,
        name: s.name,
        floor: s.floor,
        isVip: s.isVip,
        seatsPerRow: s.seatsPerRow,
        sortOrder: s.sortOrder,
        zone: "zone" in s ? (s.zone ?? null) : null,
      }));
    }
    const fromUnits = new Map<string, SeatSectionMeta>();
    for (const unit of units) {
      if (unit.section && !fromUnits.has(unit.section.id)) {
        fromUnits.set(unit.section.id, {
          id: unit.section.id,
          name: unit.section.name,
          floor: unit.section.floor,
          isVip: unit.section.isVip,
          seatsPerRow: unit.section.seatsPerRow,
          zone: unit.section.zone ?? null,
        });
      }
    }
    return [...fromUnits.values()];
  }, [sections, units]);

  const sectionGroups = useMemo(
    () => buildSectionGroups(units, sectionMeta),
    [units, sectionMeta],
  );
  const floorGroups = useMemo(
    () => groupByFloor(sectionGroups),
    [sectionGroups],
  );
  const multiFloor = floorGroups.size > 1;
  const multiSection = sectionGroups.length > 1;
  const showAreaHeaders = multiSection || showSectionLabels;

  const zoneTabs = useMemo(() => {
    return sectionGroups.map((g, i) => ({
      id: g.section?.id ?? `zone-${i}`,
      label: g.section?.name ?? fallbackZone,
      isVip: g.section?.isVip ?? false,
      floor: g.section?.floor ?? 1,
      units: g.units,
      seatsPerRow: g.section?.seatsPerRow ?? DEFAULT_SEATS_PER_ROW,
    }));
  }, [sectionGroups, fallbackZone]);

  useEffect(() => {
    if (compact && multiSection && zoneTabs.length > 0) {
      setActiveZoneId((prev) =>
        prev === "all" || !zoneTabs.some((z) => z.id === prev)
          ? zoneTabs[0].id
          : prev,
      );
    }
  }, [compact, multiSection, zoneTabs]);

  const compactVisibleGroups = useMemo(() => {
    if (!compact || !multiSection) return sectionGroups;
    if (activeZoneId === "all") return sectionGroups;
    return sectionGroups.filter(
      (g, i) => (g.section?.id ?? `zone-${i}`) === activeZoneId,
    );
  }, [compact, multiSection, sectionGroups, activeZoneId]);

  const groupsForPaging = compact ? compactVisibleGroups : sectionGroups;
  const unitsForPaging = useMemo(
    () => groupsForPaging.flatMap((g) => g.units),
    [groupsForPaging],
  );

  const pageCount = Math.max(1, Math.ceil(unitsForPaging.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  const mobilePageCount = Math.max(
    1,
    Math.ceil(unitsForPaging.length / mobilePageSize),
  );
  const safeMobilePage = Math.min(mobilePage, mobilePageCount - 1);

  const pagedSectionGroups = useMemo(() => {
    const effectivePageSize = pageSize;
    if (unitsForPaging.length <= effectivePageSize) return groupsForPaging;
    const start = safePage * effectivePageSize;
    let offset = 0;
    const result: SectionGroup[] = [];
    for (const group of groupsForPaging) {
      const groupStart = offset;
      const groupEnd = offset + group.units.length;
      offset = groupEnd;
      if (groupEnd <= start) continue;
      if (groupStart >= start + effectivePageSize) break;
      const sliceStart = Math.max(0, start - groupStart);
      const sliceEnd = Math.min(
        group.units.length,
        start + effectivePageSize - groupStart,
      );
      const sliced = group.units.slice(sliceStart, sliceEnd);
      if (sliced.length > 0) {
        result.push({ section: group.section, units: sliced });
      }
    }
    return result;
  }, [groupsForPaging, unitsForPaging.length, safePage, compact, pageSize]);

  const mobilePagedSectionGroups = useMemo(() => {
    if (!compact) return pagedSectionGroups;
    if (unitsForPaging.length <= mobilePageSize) {
      return compactVisibleGroups;
    }
    const start = safeMobilePage * mobilePageSize;
    let offset = 0;
    const result: SectionGroup[] = [];
    for (const group of compactVisibleGroups) {
      const groupStart = offset;
      const groupEnd = offset + group.units.length;
      offset = groupEnd;
      if (groupEnd <= start) continue;
      if (groupStart >= start + mobilePageSize) break;
      const sliceStart = Math.max(0, start - groupStart);
      const sliceEnd = Math.min(
        group.units.length,
        start + mobilePageSize - groupStart,
      );
      const sliced = group.units.slice(sliceStart, sliceEnd);
      if (sliced.length > 0) {
        result.push({ section: group.section, units: sliced });
      }
    }
    return result;
  }, [
    compact,
    pagedSectionGroups,
    unitsForPaging.length,
    safeMobilePage,
    compactVisibleGroups,
    mobilePageSize,
  ]);

  const displayFloors = useMemo(
    () => groupByFloor(pagedSectionGroups),
    [pagedSectionGroups],
  );

  const mobileDisplayFloors = useMemo(
    () => groupByFloor(mobilePagedSectionGroups),
    [mobilePagedSectionGroups],
  );

  const showDesktopPagination =
    !disablePagination && unitsForPaging.length > pageSize;
  const showMobilePagination =
    !disablePagination && compact && unitsForPaging.length > mobilePageSize;

  const renderFloors = (
    floors: Map<number, SectionGroup[]>,
    seatSize: "default" | "sm",
    seatsPerRowCap?: number,
  ) => (
    <div className={cn(compact ? "space-y-4" : "space-y-8")}>
      {[...floors.entries()].map(([floor, groups]) => (
        <div key={floor} className={cn(compact ? "space-y-3" : "space-y-6")}>
          {multiFloor && !compact ? (
            <div className="flex items-center justify-center gap-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              <Layers size={12} />
              {t("floorN", { n: floor }) ?? `Floor ${floor}`}
            </div>
          ) : multiFloor && compact ? (
            <p className="text-center text-[9px] font-medium uppercase tracking-wide text-zinc-500">
              {t("floorN", { n: floor }) ?? `Floor ${floor}`}
            </p>
          ) : null}

          {groups.map((group, groupIndex) => {
            const sectionKey =
              group.section?.id ?? `unassigned-${floor}-${groupIndex}`;

            const diningLayouts =
              visualType === "dining"
                ? buildDiningLayoutGroups(group.units, t)
                : [
                    {
                      id: sectionKey,
                      label: "",
                      capacity: 0,
                      seatsPerRow:
                        group.section?.seatsPerRow ?? DEFAULT_SEATS_PER_ROW,
                      sortOrder: 0,
                      units: group.units,
                    },
                  ];

            const zoneHint =
              group.section?.zone === "OUTDOOR"
                ? (t("zoneOutdoor") ?? "Outdoors")
                : group.section?.zone === "INDOOR"
                  ? (t("zoneIndoor") ?? "Indoors")
                  : null;

            return (
              <div key={sectionKey} className="space-y-2">
                {showAreaHeaders && !compact ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="flex w-full max-w-md items-center gap-3">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-600 to-transparent" />
                      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
                        <SectionZoneIcon visualType={visualType} className="h-3 w-5" />
                        {group.section?.name ??
                          (categoryLabel ? `${categoryLabel}` : fallbackZone)}
                        {zoneHint ? (
                          <span className="font-normal normal-case tracking-normal text-zinc-500">
                            · {zoneHint}
                          </span>
                        ) : null}
                        {group.section?.isVip ? (
                          <Crown
                            size={10}
                            className="text-amber-400/90"
                            aria-label="VIP"
                          />
                        ) : null}
                      </div>
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-600 to-transparent" />
                    </div>
                    {multiFloor ? null : (
                      <span className="text-[9px] text-zinc-600">
                        {t("floorN", { n: group.section?.floor ?? floor }) ??
                          `Floor ${group.section?.floor ?? floor}`}
                      </span>
                    )}
                  </div>
                ) : showAreaHeaders && compact && activeZoneId === "all" ? (
                  <p className="text-center text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                    {group.section?.name ?? fallbackZone}
                    {zoneHint ? ` · ${zoneHint}` : ""}
                    {group.section?.isVip ? " · VIP" : ""}
                  </p>
                ) : null}

                <div className="space-y-3">
                  {diningLayouts.map((layout) => {
                    const base =
                      layout.seatsPerRow ||
                      group.section?.seatsPerRow ||
                      DEFAULT_SEATS_PER_ROW;
                    const seatsPerRow = seatsPerRowCap
                      ? Math.min(seatsPerRowCap, base)
                      : base;
                    const rows = chunkRows(layout.units, seatsPerRow);
                    const showTypeHeader =
                      visualType === "dining" && diningLayouts.length > 1;

                    return (
                      <div key={layout.id} className="space-y-1.5">
                        {showTypeHeader ? (
                          <p className="text-center text-[9px] font-medium text-zinc-500">
                            <span className="text-amber-200/90">
                              {layout.label}
                            </span>
                            {" · "}
                            {t("diningLayoutMeta", {
                              tables: layout.units.length,
                              seats: layout.capacity,
                            }) ??
                              `${layout.units.length} table${
                                layout.units.length === 1 ? "" : "s"
                              } · ${layout.capacity} seat${
                                layout.capacity === 1 ? "" : "s"
                              } each`}
                          </p>
                        ) : null}
                        <div className="space-y-2">
                          {rows.map((row, rowIndex) => (
                            <div
                              key={rowIndex}
                              className={cn(
                                "flex flex-wrap justify-center",
                                compact ? "gap-1.5" : "gap-2 sm:gap-3",
                              )}
                            >
                              {row.map((unit) => (
                                <SeatButton
                                  key={unit.id}
                                  unit={unit}
                                  nowMs={nowMs}
                                  canWrite={canWrite}
                                  displayOnly={displayOnly}
                                  highlightedUnitId={highlightedUnitId}
                                  visualType={visualType}
                                  size={seatSize}
                                  onBookUnit={onBookUnit}
                                  onEditBooking={onEditBooking}
                                  precomputedStatus={precomputedStatus}
                                  blockingBooking={
                                    blockingBookingsByUnitId?.[unit.id]
                                  }
                                  onInspectBlocked={onInspectBlocked}
                                  onToggleNotWorking={onToggleNotWorking}
                                  statusLabels={statusLabels}
                                  tileLabels={tileLabels}
                                />
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  const paginationBar = (
    current: number,
    total: number,
    onPrev: () => void,
    onNext: () => void,
    className?: string,
  ) => (
    <div
      className={cn(
        "flex items-center justify-center gap-2 text-[11px] text-zinc-500",
        className,
      )}
    >
      <button
        type="button"
        disabled={current <= 0}
        onClick={onPrev}
        className="grid size-7 place-items-center rounded-md border border-white/10 disabled:opacity-40"
        aria-label={t("prev") ?? "Previous page"}
      >
        <ChevronLeft size={14} />
      </button>
      <span className="min-w-[3rem] text-center tabular-nums">
        {current + 1} / {total}
      </span>
      <button
        type="button"
        disabled={current >= total - 1}
        onClick={onNext}
        className="grid size-7 place-items-center rounded-md border border-white/10 disabled:opacity-40"
        aria-label={t("next") ?? "Next page"}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );

  const legend = (
    <div
      className={cn(
        "flex flex-wrap justify-center gap-2 text-[10px]",
        compact
          ? "gap-3 pt-2"
          : "gap-3 border-t border-white/5 pt-3",
      )}
    >
      {(["AVAILABLE", "UNAVAILABLE", "NOT_WORKING"] as UnitFloorStatus[]).map(
        (s) => {
          return (
            <span
              key={s}
              className="inline-flex items-center gap-1 text-zinc-400"
            >
              {legendMapIcon(visualType, s, compact)}
              {compact ? statusLabels[s].split(" ")[0] : statusLabels[s]}
            </span>
          );
        },
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "min-w-0 w-full",
        compact ? "space-y-2 px-2 py-2 md:space-y-3 md:px-3 md:py-3" : "space-y-4 p-3 md:p-4",
      )}
    >
      <div className={cn("min-w-0 w-full", compact ? "mx-auto w-full" : "mx-auto w-full max-w-3xl")}>
        {!compact && !multiSection && showScreenHeader ? (
          <div className="mb-6 flex flex-col items-center gap-2">
            <div className="flex w-full max-w-md items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-600 to-transparent" />
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-950/80 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">
                <SectionZoneIcon visualType={visualType} className="h-3.5 w-6" />
                {categoryLabel ? `${categoryLabel} · ` : ""}
                {screenLabelFor(visualType, t)}
              </div>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-zinc-600 to-transparent" />
            </div>
            <p className="text-[10px] text-zinc-600">
              {displayOnly
                ? t("updatesLive") ?? "Updates live as bookings start and end"
                : tapHintFor(visualType, t)}
            </p>
          </div>
        ) : !compact && showAreaHeaders ? (
          <p className="mb-4 text-center text-[10px] text-zinc-600">
            {displayOnly
              ? t("liveMapByZone") ?? "Live map by zone and floor"
              : tapHintFor(visualType, t)}
          </p>
        ) : null}

        {compact && multiSection && zoneTabs.length > 1 ? (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {zoneTabs.map((zone) => (
              <button
                key={zone.id}
                type="button"
                onClick={() => setActiveZoneId(zone.id)}
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-medium transition",
                  activeZoneId === zone.id
                    ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                    : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200",
                )}
              >
                {zone.isVip ? (
                  <Crown size={9} className="mr-1 inline text-amber-400/90" />
                ) : null}
                {zone.label}
              </button>
            ))}
          </div>
        ) : null}

        {/* Mobile compact layout */}
        {compact ? (
          <div className="md:hidden">
            {renderFloors(mobileDisplayFloors, "sm", 4)}
            {showMobilePagination
              ? paginationBar(
                  safeMobilePage,
                  mobilePageCount,
                  () => setMobilePage((p) => Math.max(0, p - 1)),
                  () =>
                    setMobilePage((p) =>
                      Math.min(mobilePageCount - 1, p + 1),
                    ),
                )
              : null}
          </div>
        ) : null}

        {/* Desktop / full layout */}
        <div className={compact ? "hidden md:block" : undefined}>
          {renderFloors(displayFloors, compact ? "sm" : "default")}
        </div>
      </div>

      {showDesktopPagination
        ? paginationBar(
            safePage,
            pageCount,
            () => setPage((p) => Math.max(0, p - 1)),
            () => setPage((p) => Math.min(pageCount - 1, p + 1)),
            compact ? "hidden md:flex" : undefined,
          )
        : null}

      {showLegend ? (
        <div className="space-y-2">
          {canWrite && onToggleNotWorking && !displayOnly ? (
            <p className="text-center text-[10px] text-zinc-600">
              {staffStationHint ??
                t("staffStationHint") ?? (
                  <>
                    Tap a free station to book · use{" "}
                    <span className="text-zinc-500">⋮</span> to mark out of
                    service · tap gray stations to restore
                  </>
                )}
            </p>
          ) : null}
          {legend}
        </div>
      ) : null}
    </div>
  );
}

function SeatButton({
  unit,
  nowMs,
  canWrite,
  displayOnly,
  highlightedUnitId,
  visualType = "pc",
  size = "default",
  onBookUnit,
  onEditBooking,
  precomputedStatus = false,
  blockingBooking,
  onInspectBlocked,
  onToggleNotWorking,
  statusLabels = FLOOR_STATUS_LABELS,
  tileLabels = { AVAILABLE: "Free", UNAVAILABLE: "Busy", NOT_WORKING: "Off" },
}: {
  unit: ScheduleUnit;
  nowMs: number;
  canWrite: boolean;
  displayOnly: boolean;
  highlightedUnitId?: string | null;
  visualType?: FloorMapVisualType;
  size?: "default" | "sm";
  onBookUnit?: (unitId: string) => void;
  onEditBooking?: (booking: ScheduleBooking, unitId: string) => void;
  precomputedStatus?: boolean;
  blockingBooking?: ScheduleBooking;
  onInspectBlocked?: (unitId: string, booking: ScheduleBooking) => void;
  onToggleNotWorking?: (unitId: string, notWorking: boolean) => void;
  statusLabels?: Record<UnitFloorStatus, string>;
  /** Short status chip text (Free/Busy/Off) — separate from the longer statusLabels tooltip text. */
  tileLabels?: Record<UnitFloorStatus, string>;
}) {
  const status = precomputedStatus
    ? unit.floorStatus
    : resolveEffectiveFloorStatus(unit, nowMs);
  const live = precomputedStatus
    ? blockingBooking ?? null
    : findLiveBooking(unit, nowMs);
  const interactive = canWrite && !displayOnly;
  const seatNumber = unit.name.replace(/\D/g, "") || unit.name;
  const sm = size === "sm";

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
    ? `${unit.name} · Reserved ${formatTime(live.startsAt)}–${formatTime(live.endsAt)}`
    : `${unit.name}${unit.capacity != null ? ` · ${unit.capacity} seats` : ""} · ${statusLabels[status]}`;

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!interactive}
        onClick={handleClick}
        title={tooltip}
        className={cn(
          "group flex flex-col items-center rounded-lg border border-transparent transition",
          sm ? "w-14 gap-0.5 p-1" : "w-[4.5rem] gap-1 p-1.5",
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
          !interactive && "cursor-default",
          highlightedUnitId === unit.id &&
            "ring-2 ring-sky-400/60 ring-offset-2 ring-offset-zinc-950",
        )}
      >
      <div
        className={cn(
          "rounded-md transition",
          sm ? "p-0.5" : "p-1",
          CHAIR_GLOW[status],
          status === "AVAILABLE" && "group-hover:scale-105",
        )}
      >
        <UnitMapIcon
          visualType={visualType}
          status={status}
          seats={unit.capacity ?? unit.tableGroup?.capacity}
          className={unitMapIconSize(visualType, sm)}
        />
      </div>
      <span
        className={cn(
          "font-semibold text-zinc-200",
          sm ? "text-[9px]" : "text-[10px]",
        )}
      >
        {seatNumber}
      </span>
      {unit.capacity != null && visualType === "dining" ? (
        <span
          className={cn(
            "text-zinc-500",
            sm ? "text-[8px]" : "text-[9px]",
          )}
        >
          {unit.capacity} seats
        </span>
      ) : null}
      <span
        className={cn(
          "flex items-center gap-0.5 font-medium uppercase tracking-wide",
          sm ? "text-[8px]" : "text-[9px]",
          status === "AVAILABLE" && "text-emerald-300/90",
          status === "UNAVAILABLE" && "text-rose-300/90",
          status === "NOT_WORKING" && "text-zinc-500",
        )}
      >
        <span
          className={cn("rounded-full", sm ? "size-0.5" : "size-1", FLOOR_STATUS_DOT[status])}
        />
        {tileLabels[status]}
      </span>
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
