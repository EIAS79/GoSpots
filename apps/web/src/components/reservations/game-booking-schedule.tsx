"use client";

import {
  CalendarClock,
  CircleDot,
  Gamepad2,
  LogIn,
  MoreHorizontal,
  Monitor,
  PlayCircle,
  User2,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useNowMs } from "@/lib/use-now-ms";
import { BilliardTableIcon } from "@/components/icons/billiard-table-icon";
import { BowlingLaneIcon } from "@/components/icons/bowling-lane-icon";
import { ArcadeCabinetIcon } from "@/components/icons/arcade-cabinet-icon";
import { FoosballTableIcon } from "@/components/icons/foosball-table-icon";
import { PingPongTableIcon } from "@/components/icons/ping-pong-table-icon";
import { cn } from "@/lib/cn";
import {
  getBookingUnitKind,
  getBookingUnitLabels,
  sortDiningScheduleCategories,
  sortScheduleCategories,
} from "@/lib/booking-unit-kind";
import {
  FLOOR_STATUS_DOT,
  type UnitFloorStatus,
} from "@/lib/booking-floor-status";
import {
  countActiveBookings,
  isLiveBooking,
  isSessionBlockingBooking,
  localDateInput,
  resolveSessionBookingPhase,
} from "@/lib/booking-time";
import type {
  DaySchedule,
  ScheduleBooking,
  ScheduleCategory,
  ScheduleCategorySection,
  ScheduleUnit,
} from "@/lib/reservations-client";
import { GamingFloorLayoutExplorer } from "@/components/reservations/gaming-floor-layout-explorer";
import {
  BowlingLaneFloorMap,
  type BowlingLaneChromeLabels,
} from "@/components/reservations/bowling-lane-floor-map";
import { UnitGridPager } from "@/components/reservations/unit-grid-pager";
import { getFloorMapVisualType } from "@/lib/gaming-floor-visual";
import type { ResourceType } from "@/lib/resource-types";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";
import {
  staffBoardThemeLabels,
  staffBowlingChromeLabels,
  staffFloorChromeLabels,
  staffFloorStatusLabels,
  staffFloorT,
  staffScheduleActionLabels,
  type StaffBoardThemeLabels,
  type StaffFloorChromeLabels,
  type StaffScheduleActionLabels,
} from "@/lib/staff-floor-i18n";

const TYPE_ICONS: Partial<
  Record<ResourceType, ComponentType<{ size?: number; className?: string }>>
> = {
  PC: Monitor,
  PLAYSTATION: Gamepad2,
  BILLIARD: ({ className }) => (
    <BilliardTableIcon status="AVAILABLE" className={className ?? "h-4 w-7"} />
  ),
  BOWLING: ({ className }) => (
    <BowlingLaneIcon status="AVAILABLE" className={className ?? "h-5 w-3"} />
  ),
  TABLE_TENNIS: ({ className }) => (
    <PingPongTableIcon status="AVAILABLE" className={className ?? "h-4 w-7"} />
  ),
  FOOSBALL: ({ className }) => (
    <FoosballTableIcon status="AVAILABLE" className={className ?? "h-4 w-7"} />
  ),
  ARCADE: ({ className }) => (
    <ArcadeCabinetIcon status="AVAILABLE" className={className ?? "h-4 w-5"} />
  ),
  DINING: UtensilsCrossed,
};

export type ReservationBoardVariant = "gaming" | "dining";

/** Visual-only chip styles; copy comes from `staffBoardThemeLabels`. */
const BOARD_THEME_CHIP: Record<ReservationBoardVariant, string> = {
  gaming: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100",
  dining: "border-amber-400/40 bg-amber-500/15 text-amber-100",
};

function useCompactFloorView() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setCompact(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return compact;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function findActiveOrNext(
  bookings: ScheduleBooking[],
  isToday: boolean,
  nowMs: number = Date.now(),
): ScheduleBooking | null {
  const live = bookings.filter((b) => isLiveBooking(b, nowMs));
  if (live.length === 0) return null;

  const inUse = live.find((b) => b.status === "CHECKED_IN");
  if (inUse) return inUse;

  const waiting = live.find(
    (b) =>
      resolveSessionBookingPhase(b.status, b.startsAt, b.endsAt, nowMs) ===
      "waiting",
  );
  if (waiting) return waiting;

  if (isToday) {
    const upcoming = live
      .filter(
        (b) =>
          resolveSessionBookingPhase(b.status, b.startsAt, b.endsAt, nowMs) ===
          "upcoming",
      )
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
    return upcoming[0] ?? null;
  }
  return live[0] ?? null;
}

type ScheduleCommon = {
  boardVariant: ReservationBoardVariant;
  canWrite: boolean;
  isToday: boolean;
  nowMs: number;
  onBookUnit: (unitId: string, categoryId: string) => void;
  onToggleNotWorking?: (unitId: string, notWorking: boolean) => Promise<void>;
  onFocusUnit?: (unitId: string, unitName: string) => void;
  onEditBooking?: (booking: ScheduleBooking, unitId: string) => void;
  onCheckInBooking?: (booking: ScheduleBooking, unitId: string) => Promise<void>;
  onGuestLeftBooking?: (booking: ScheduleBooking, unitId: string) => Promise<void>;
  highlightedUnitId?: string | null;
  floorChrome: StaffFloorChromeLabels;
  bowlingChrome: BowlingLaneChromeLabels;
  floorStatusLabels: Record<UnitFloorStatus, string>;
  actionLabels: StaffScheduleActionLabels;
};

export function GameBookingSchedule({
  schedule,
  onBookUnit,
  onToggleNotWorking,
  onFocusUnit,
  onEditBooking,
  onCheckInBooking,
  onGuestLeftBooking,
  highlightedUnitId,
  canWrite,
  selectedCategoryId,
  onCategoryChange,
  variant = "gaming",
}: {
  schedule: DaySchedule;
  onBookUnit: (unitId: string, categoryId: string) => void;
  onToggleNotWorking?: (unitId: string, notWorking: boolean) => Promise<void>;
  onFocusUnit?: (unitId: string, unitName: string) => void;
  onEditBooking?: (booking: ScheduleBooking, unitId: string) => void;
  onCheckInBooking?: (booking: ScheduleBooking, unitId: string) => Promise<void>;
  onGuestLeftBooking?: (booking: ScheduleBooking, unitId: string) => Promise<void>;
  highlightedUnitId?: string | null;
  canWrite: boolean;
  selectedCategoryId?: string;
  onCategoryChange?: (categoryId: string) => void;
  variant?: ReservationBoardVariant;
}) {
  const isToday = schedule.date === localDateInput();
  const nowMs = useNowMs(10_000);
  const compactFloor = useCompactFloorView();
  const selectedChip = BOARD_THEME_CHIP[variant];
  const vs = useVenueSettingsOptional();
  const t = useMemo(
    () => vs?.t ?? staffFloorT(vs?.locale),
    [vs?.t, vs?.locale],
  );
  const themeLabels: StaffBoardThemeLabels = useMemo(
    () => staffBoardThemeLabels(t, variant),
    [t, variant],
  );
  const floorChrome = useMemo(() => staffFloorChromeLabels(t), [t]);
  const bowlingChrome = useMemo(() => staffBowlingChromeLabels(t), [t]);
  const floorStatusLabels = useMemo(() => staffFloorStatusLabels(t), [t]);
  const actionLabels = useMemo(() => staffScheduleActionLabels(t), [t]);

  const categories = (variant === "dining"
    ? sortDiningScheduleCategories
    : sortScheduleCategories)(
    schedule.categories.map((cat) => ({
      ...cat,
      unitKind: cat.unitKind ?? getBookingUnitKind(cat.type),
      unitLabels:
        cat.unitLabels ?? getBookingUnitLabels(getBookingUnitKind(cat.type)),
    })),
  );

  const [internalCategoryId, setInternalCategoryId] = useState(
    () => categories[0]?.id ?? "",
  );

  const activeCategoryId =
    selectedCategoryId && categories.some((c) => c.id === selectedCategoryId)
      ? selectedCategoryId
      : internalCategoryId && categories.some((c) => c.id === internalCategoryId)
        ? internalCategoryId
        : categories[0]?.id ?? "";

  useEffect(() => {
    if (!categories.length) return;
    if (!categories.some((c) => c.id === activeCategoryId)) {
      setInternalCategoryId(categories[0].id);
    }
  }, [categories, activeCategoryId]);

  const pickCategory = (id: string) => {
    setInternalCategoryId(id);
    onCategoryChange?.(id);
  };

  const activeCategory = categories.find((c) => c.id === activeCategoryId);

  if (categories.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-6 py-12 text-center text-sm text-zinc-500">
        {themeLabels.emptyTitle}{" "}
        <span className="text-zinc-400">{themeLabels.emptyHint}</span>
      </p>
    );
  }

  const common: ScheduleCommon = {
    boardVariant: variant,
    canWrite,
    isToday,
    nowMs,
    onBookUnit,
    onToggleNotWorking,
    onFocusUnit,
    onEditBooking,
    onCheckInBooking,
    onGuestLeftBooking,
    highlightedUnitId,
    floorChrome,
    bowlingChrome,
    floorStatusLabels,
    actionLabels,
  };

  return (
    <div className="min-w-0 w-full rounded-xl border border-white/10 bg-zinc-900/40">
      {/* Game / dining activity picker */}
      <div className="border-b border-white/10 bg-zinc-950/50 px-3 py-3">
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
          {themeLabels.pickerLabel}
        </p>
        <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.map((cat) => {
            const Icon = TYPE_ICONS[cat.type];
            const free = cat.units.filter(
              (u) => u.floorStatus === "AVAILABLE",
            ).length;
            const selected = cat.id === activeCategoryId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => pickCategory(cat.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left transition",
                  selected
                    ? selectedChip
                    : "border-white/10 bg-zinc-900/60 text-zinc-400 hover:border-white/20 hover:text-zinc-200",
                )}
              >
                {Icon ? (
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-white/5">
                    <Icon size={14} />
                  </span>
                ) : null}
                <span className="min-w-0">
                  <span className="block max-w-[9rem] truncate text-xs font-semibold sm:max-w-[11rem]">
                    {cat.name}
                  </span>
                  <span className="block text-[10px] opacity-75">
                    {actionLabels.freeOfTotal(free, cat.units.length)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeCategory ? (
        <CategorySection
          category={activeCategory}
          compactFloor={compactFloor}
          {...common}
        />
      ) : null}
    </div>
  );
}

function CategorySection({
  category: cat,
  compactFloor,
  ...common
}: { category: ScheduleCategory; compactFloor: boolean } & ScheduleCommon) {
  return (
    <section>
      {cat.unitKind === "SEAT" ? (
        compactFloor ? (
          <UnitList
            units={cat.units}
            categoryId={cat.id}
            categoryLabel={cat.name}
            {...common}
          />
        ) : (
          <SeatGrid
            units={cat.units}
            sections={cat.sections}
            categoryId={cat.id}
            categoryLabel={cat.name}
            categoryType={cat.type}
            {...common}
          />
        )
      ) : cat.unitKind === "TABLE" ? (
        compactFloor ? (
          <UnitList
            units={cat.units}
            categoryId={cat.id}
            categoryLabel={cat.name}
            {...common}
          />
        ) : (
          <TableGrid
            units={cat.units}
            sections={cat.sections}
            categoryId={cat.id}
            categoryLabel={cat.name}
            categoryType={cat.type}
            {...common}
          />
        )
      ) : cat.unitKind === "LANE" ? (
        <LaneGrid
          units={cat.units}
          sections={cat.sections}
          categoryId={cat.id}
          categoryLabel={cat.name}
          {...common}
        />
      ) : (
        <UnitList
          units={cat.units}
          categoryId={cat.id}
          categoryLabel={cat.name}
          {...common}
        />
      )}
    </section>
  );
}

type GridProps = {
  units: ScheduleUnit[];
  sections?: ScheduleCategorySection[];
  categoryId: string;
  categoryLabel: string;
  categoryType?: ResourceType;
} & ScheduleCommon;

function unitCardCommon(unit: ScheduleUnit, categoryId: string, p: GridProps) {
  return {
    unit,
    canWrite: p.canWrite,
    isToday: p.isToday,
    nowMs: p.nowMs,
    highlighted: p.highlightedUnitId === unit.id,
    statusLabels: p.floorStatusLabels,
    actionLabels: p.actionLabels,
    onBook: () => p.onBookUnit(unit.id, categoryId),
    onFocus: p.onFocusUnit ? () => p.onFocusUnit!(unit.id, unit.name) : undefined,
    onEditBooking: p.onEditBooking
      ? (b: ScheduleBooking) => p.onEditBooking!(b, unit.id)
      : undefined,
    onCheckInBooking: p.onCheckInBooking
      ? (b: ScheduleBooking) => p.onCheckInBooking!(b, unit.id)
      : undefined,
    onGuestLeftBooking: p.onGuestLeftBooking
      ? (b: ScheduleBooking) => p.onGuestLeftBooking!(b, unit.id)
      : undefined,
    onToggleNotWorking: p.onToggleNotWorking
      ? () =>
          p.onToggleNotWorking!(
            unit.id,
            unit.floorStatus !== "NOT_WORKING",
          )
      : undefined,
  };
}

const LIST_PAGE = 15;

function SeatGrid(p: GridProps) {
  return (
    <GamingFloorLayoutExplorer
      units={p.units}
      sections={p.sections}
      categoryLabel={p.categoryLabel}
      visualType={p.categoryType ? getFloorMapVisualType(p.categoryType) : "pc"}
      stationsPerPage={12}
      canWrite={p.canWrite}
      nowMs={p.nowMs}
      highlightedUnitId={p.highlightedUnitId}
      onBookUnit={(unitId) => p.onBookUnit(unitId, p.categoryId)}
      onEditBooking={(booking, unitId) => p.onEditBooking?.(booking, unitId)}
      onToggleNotWorking={p.onToggleNotWorking}
      chromeLabels={p.floorChrome}
      guestStatusLabels={p.floorStatusLabels}
    />
  );
}

function TableGrid(p: GridProps) {
  return (
    <GamingFloorLayoutExplorer
      units={p.units}
      sections={p.sections}
      categoryLabel={p.categoryLabel}
      visualType={
        p.categoryType ? getFloorMapVisualType(p.categoryType) : "billiard"
      }
      stationsPerPage={8}
      canWrite={p.canWrite}
      nowMs={p.nowMs}
      highlightedUnitId={p.highlightedUnitId}
      onBookUnit={(unitId) => p.onBookUnit(unitId, p.categoryId)}
      onEditBooking={(booking, unitId) => p.onEditBooking?.(booking, unitId)}
      onToggleNotWorking={p.onToggleNotWorking}
      chromeLabels={p.floorChrome}
      guestStatusLabels={p.floorStatusLabels}
    />
  );
}

function LaneGrid(p: GridProps) {
  return (
    <BowlingLaneFloorMap
      units={p.units}
      sections={p.sections}
      canWrite={p.canWrite}
      nowMs={p.nowMs}
      highlightedUnitId={p.highlightedUnitId}
      onBookUnit={(unitId) => p.onBookUnit(unitId, p.categoryId)}
      onEditBooking={(booking, unitId) => p.onEditBooking?.(booking, unitId)}
      onToggleNotWorking={p.onToggleNotWorking}
      chromeLabels={p.bowlingChrome}
      guestStatusLabels={p.floorStatusLabels}
    />
  );
}

function UnitList(p: GridProps) {
  if (p.units.length <= 16) {
    return (
      <ul className="divide-y divide-white/5">
        {p.units.map((unit) => (
          <li key={unit.id} className="px-4 py-2.5">
            <UnitCard
              variant="list"
              {...unitCardCommon(unit, p.categoryId, p)}
            />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <UnitGridPager
      units={p.units}
      pageSize={LIST_PAGE}
      gridClassName="divide-y divide-white/5"
      itemClassName="px-4 py-2.5"
    >
      {(unit) => (
        <UnitCard variant="list" {...unitCardCommon(unit, p.categoryId, p)} />
      )}
    </UnitGridPager>
  );
}

type UnitCardProps = {
  unit: ScheduleUnit;
  variant: "seat" | "table" | "lane" | "list";
  canWrite: boolean;
  isToday: boolean;
  nowMs: number;
  highlighted?: boolean;
  statusLabels: Record<UnitFloorStatus, string>;
  actionLabels: StaffScheduleActionLabels;
  onBook: () => void;
  onFocus?: () => void;
  onEditBooking?: (b: ScheduleBooking) => void;
  onCheckInBooking?: (b: ScheduleBooking) => Promise<void> | void;
  onGuestLeftBooking?: (b: ScheduleBooking) => Promise<void> | void;
  onToggleNotWorking?: () => void;
};

const ACCENT_BAR: Record<UnitFloorStatus, string> = {
  AVAILABLE: "bg-emerald-400/80",
  UNAVAILABLE: "bg-rose-400/80",
  NOT_WORKING: "bg-zinc-500/60",
};

const STATUS_TEXT: Record<UnitFloorStatus, string> = {
  AVAILABLE: "text-emerald-300/80",
  UNAVAILABLE: "text-rose-300/90",
  NOT_WORKING: "text-zinc-500",
};

function UnitCard({
  unit,
  variant,
  canWrite,
  isToday,
  nowMs,
  highlighted,
  statusLabels,
  actionLabels,
  onBook,
  onFocus,
  onEditBooking,
  onCheckInBooking,
  onGuestLeftBooking,
  onToggleNotWorking,
}: UnitCardProps) {
  const serverStatus = unit.floorStatus;
  const hasLiveBlocking = unit.bookings.some((b) =>
    isSessionBlockingBooking(b, nowMs),
  );
  const status =
    serverStatus === "UNAVAILABLE" && !hasLiveBlocking
      ? "AVAILABLE"
      : serverStatus;
  const bookingCount = unit.bookings.filter((b) => isLiveBooking(b, nowMs)).length;
  const focus = findActiveOrNext(unit.bookings, isToday, nowMs);
  const extraBookings = Math.max(0, bookingCount - (focus ? 1 : 0));
  const isOOS = status === "NOT_WORKING";
  const isInUse = status === "UNAVAILABLE";
  const compact = variant === "seat";
  const list = variant === "list";
  const sessionPhase = focus
    ? resolveSessionBookingPhase(
        focus.status,
        focus.startsAt,
        focus.endsAt,
        nowMs,
      )
    : null;
  const checkInBooking = sessionPhase === "waiting" ? focus : null;
  const guestLeftBooking = focus?.status === "CHECKED_IN" ? focus : null;

  if (list) {
    return (
      <UnitRow
        unit={unit}
        status={status}
        focus={focus}
        bookingCount={bookingCount}
        canWrite={canWrite}
        highlighted={highlighted}
        nowMs={nowMs}
        statusLabels={statusLabels}
        actionLabels={actionLabels}
        onBook={onBook}
        onFocus={onFocus}
        onEditBooking={onEditBooking}
        onCheckInBooking={onCheckInBooking}
        onGuestLeftBooking={onGuestLeftBooking}
        onToggleNotWorking={onToggleNotWorking}
      />
    );
  }

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-lg border bg-zinc-950/70 transition-colors",
        isOOS
          ? "border-zinc-700/60"
          : isInUse
          ? "border-rose-400/25 bg-rose-500/[0.03]"
          : "border-white/10 hover:border-white/20",
        highlighted && "ring-1 ring-sky-400/60",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          ACCENT_BAR[status],
        )}
        aria-hidden
      />
      <div
        className={cn(
          "flex flex-1 flex-col",
          compact ? "gap-1.5 p-2.5 pl-3" : "gap-2 p-3 pl-3.5",
        )}
      >
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate font-semibold text-zinc-50",
                compact ? "text-[13px] leading-tight" : "text-sm",
              )}
              title={unit.name}
            >
              {unit.name}
            </p>
            <p
              className={cn(
                "flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide",
                STATUS_TEXT[status],
              )}
            >
              <span
                className={cn("size-1.5 rounded-full", FLOOR_STATUS_DOT[status])}
                aria-hidden
              />
              {statusLabels[status]}
            </p>
          </div>

          {canWrite ? (
            <UnitMenu
              unit={unit}
              status={status}
              hasBookings={bookingCount > 0}
              checkInBooking={checkInBooking}
              guestLeftBooking={guestLeftBooking}
              actionLabels={actionLabels}
              onToggleNotWorking={onToggleNotWorking}
              onFocus={onFocus}
              onCheckInBooking={onCheckInBooking}
              onGuestLeftBooking={onGuestLeftBooking}
            />
          ) : null}
        </header>

        {focus && !isOOS ? (
          <FocusRow
            focus={focus}
            isInUse={isInUse}
            nowMs={nowMs}
            compact={compact}
            extraBookings={extraBookings}
            actionLabels={actionLabels}
            onFocus={onFocus}
          />
        ) : compact ? null : (
          <p className="text-[11px] text-zinc-600">
            {isOOS
              ? actionLabels.markedMaintenance
              : actionLabels.noBookingsToday}
          </p>
        )}

        <div className="mt-auto pt-1">
          <PrimaryAction
            status={status}
            canWrite={canWrite}
            focus={focus}
            compact={compact}
            actionLabels={actionLabels}
            onBook={onBook}
            onEditBooking={onEditBooking}
            onToggleNotWorking={onToggleNotWorking}
          />
        </div>
      </div>
    </article>
  );
}

function FocusRow({
  focus,
  isInUse,
  nowMs,
  compact,
  extraBookings,
  actionLabels,
  onFocus,
}: {
  focus: ScheduleBooking;
  isInUse: boolean;
  nowMs: number;
  compact: boolean;
  extraBookings: number;
  actionLabels: StaffScheduleActionLabels;
  onFocus?: () => void;
}) {
  const sessionPhase = resolveSessionBookingPhase(
    focus.status,
    focus.startsAt,
    focus.endsAt,
    nowMs,
  );

  return (
    <div className="min-w-0 space-y-0.5">
      <p
        className={cn(
          "flex items-center gap-1 truncate",
          compact ? "text-[11px]" : "text-xs",
        )}
      >
        <User2 size={10} className="shrink-0 text-zinc-500" aria-hidden />
        <span className="truncate font-medium text-zinc-100">
          {focus.guestName}
        </span>
      </p>
      <p
        className={cn(
          "flex items-center gap-1 text-zinc-500",
          compact ? "text-[10px]" : "text-[11px]",
        )}
      >
        <CalendarClock size={10} className="shrink-0" aria-hidden />
        {formatTime(focus.startsAt)}
        {sessionPhase === "waiting" ? (
          <span className="text-amber-300/90"> · waiting</span>
        ) : focus.status === "CHECKED_IN" ? (
          <span className="text-rose-300/90"> · in use</span>
        ) : sessionPhase === "upcoming" ? (
          <span> · upcoming</span>
        ) : isInUse ? (
          <span className="text-rose-300/90"> · now</span>
        ) : null}
      </p>
      {extraBookings > 0 && onFocus ? (
        <button
          type="button"
          onClick={onFocus}
          className="text-[10px] text-sky-300/80 hover:text-sky-200 hover:underline"
        >
          {actionLabels.moreToday(extraBookings)}
        </button>
      ) : null}
    </div>
  );
}

function PrimaryAction({
  status,
  canWrite,
  focus,
  compact,
  actionLabels,
  onBook,
  onEditBooking,
  onToggleNotWorking,
}: {
  status: UnitFloorStatus;
  canWrite: boolean;
  focus: ScheduleBooking | null;
  compact: boolean;
  actionLabels: StaffScheduleActionLabels;
  onBook: () => void;
  onEditBooking?: (b: ScheduleBooking) => void;
  onToggleNotWorking?: () => void;
}) {
  if (!canWrite) return null;

  const base = cn(
    "block w-full rounded-md border text-center font-medium transition",
    compact ? "px-2 py-1.5 text-[11px]" : "px-2.5 py-1.5 text-xs",
  );

  if (status === "NOT_WORKING") {
    return onToggleNotWorking ? (
      <button
        type="button"
        onClick={onToggleNotWorking}
        className={cn(
          base,
          "border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20",
        )}
      >
        {actionLabels.restore}
      </button>
    ) : null;
  }

  if (status === "UNAVAILABLE" && focus && onEditBooking) {
    return (
      <button
        type="button"
        onClick={() => onEditBooking(focus)}
        className={cn(
          base,
          "border-rose-400/30 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20",
        )}
      >
        {actionLabels.openBooking}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onBook}
      className={cn(
        base,
        "border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15 hover:border-emerald-400/50",
      )}
    >
      {actionLabels.book}
    </button>
  );
}

function UnitRow({
  unit,
  status,
  focus,
  bookingCount,
  canWrite,
  highlighted,
  nowMs,
  statusLabels,
  actionLabels,
  onBook,
  onFocus,
  onEditBooking,
  onCheckInBooking,
  onGuestLeftBooking,
  onToggleNotWorking,
}: {
  unit: ScheduleUnit;
  status: UnitFloorStatus;
  focus: ScheduleBooking | null;
  bookingCount: number;
  canWrite: boolean;
  highlighted?: boolean;
  nowMs: number;
  statusLabels: Record<UnitFloorStatus, string>;
  actionLabels: StaffScheduleActionLabels;
  onBook: () => void;
  onFocus?: () => void;
  onEditBooking?: (b: ScheduleBooking) => void;
  onCheckInBooking?: (b: ScheduleBooking) => Promise<void> | void;
  onGuestLeftBooking?: (b: ScheduleBooking) => Promise<void> | void;
  onToggleNotWorking?: () => void;
}) {
  const sessionPhase =
    focus != null
      ? resolveSessionBookingPhase(
          focus.status,
          focus.startsAt,
          focus.endsAt,
          nowMs,
        )
      : null;
  const checkInBooking = sessionPhase === "waiting" ? focus : null;
  const guestLeftBooking = focus?.status === "CHECKED_IN" ? focus : null;

  return (
    <div
      className={cn(
        "group flex flex-wrap items-center gap-3",
        highlighted && "rounded-md bg-sky-500/[0.06] px-2 -mx-2",
      )}
    >
      <span
        className={cn("size-2 shrink-0 rounded-full", FLOOR_STATUS_DOT[status])}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zinc-100">
          {unit.name}
        </p>
        <p className={cn("text-[11px]", STATUS_TEXT[status])}>
          {statusLabels[status]}
          {focus ? (
            <span className="ml-1.5 text-zinc-500">
              · {focus.guestName} {formatTime(focus.startsAt)}
            </span>
          ) : null}
          {bookingCount > (focus ? 1 : 0) ? (
            <span className="ml-1.5 text-sky-300/80">
              {actionLabels.moreCount(bookingCount - (focus ? 1 : 0))}
            </span>
          ) : null}
        </p>
      </div>
      {canWrite ? (
        <div className="flex items-center gap-1.5">
          <div className="w-28">
            <PrimaryAction
              status={status}
              canWrite={canWrite}
              focus={focus}
              compact
              actionLabels={actionLabels}
              onBook={onBook}
              onEditBooking={onEditBooking}
              onToggleNotWorking={onToggleNotWorking}
            />
          </div>
          <UnitMenu
            unit={unit}
            status={status}
            hasBookings={bookingCount > 0}
            checkInBooking={checkInBooking}
            guestLeftBooking={guestLeftBooking}
            actionLabels={actionLabels}
            onToggleNotWorking={onToggleNotWorking}
            onFocus={onFocus}
            onCheckInBooking={onCheckInBooking}
            onGuestLeftBooking={onGuestLeftBooking}
            inline
          />
        </div>
      ) : null}
    </div>
  );
}

function UnitMenu({
  unit,
  status,
  hasBookings,
  checkInBooking,
  guestLeftBooking,
  actionLabels,
  onToggleNotWorking,
  onFocus,
  onCheckInBooking,
  onGuestLeftBooking,
  inline,
}: {
  unit: ScheduleUnit;
  status: UnitFloorStatus;
  hasBookings: boolean;
  checkInBooking?: ScheduleBooking | null;
  guestLeftBooking?: ScheduleBooking | null;
  actionLabels: StaffScheduleActionLabels;
  onToggleNotWorking?: () => void;
  onFocus?: () => void;
  onCheckInBooking?: (b: ScheduleBooking) => Promise<void> | void;
  onGuestLeftBooking?: (b: ScheduleBooking) => Promise<void> | void;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const isOOS = status === "NOT_WORKING";
  const showToggle = Boolean(onToggleNotWorking) && !isOOS;
  const showFocus = hasBookings && Boolean(onFocus);
  const showCheckIn = Boolean(onCheckInBooking && checkInBooking);
  const showGuestLeft = Boolean(onGuestLeftBooking && guestLeftBooking);

  if (!showToggle && !showFocus && !showCheckIn && !showGuestLeft) {
    return null;
  }

  return (
    <div ref={ref} className={cn("relative", inline ? "" : "shrink-0")}>
      <button
        type="button"
        aria-label={actionLabels.moreFor(unit.name)}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "grid size-6 place-items-center rounded-md text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200",
          !inline && "opacity-0 focus:opacity-100 group-hover:opacity-100",
          open && "opacity-100 bg-white/5 text-zinc-200",
        )}
      >
        <MoreHorizontal size={14} />
      </button>
      {open ? (
        <div className="absolute right-0 top-7 z-20 w-48 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/95 p-1 text-xs shadow-xl backdrop-blur">
          {showCheckIn && checkInBooking && onCheckInBooking ? (
            <button
              type="button"
              onClick={() => {
                void onCheckInBooking(checkInBooking);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sky-300 hover:bg-sky-500/10 hover:text-sky-200"
            >
              <LogIn size={12} aria-hidden />
              {actionLabels.checkInGuest}
            </button>
          ) : null}
          {showGuestLeft && guestLeftBooking && onGuestLeftBooking ? (
            <button
              type="button"
              onClick={() => {
                void onGuestLeftBooking(guestLeftBooking);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
            >
              <PlayCircle size={12} aria-hidden />
              {actionLabels.guestLeftFree}
            </button>
          ) : null}
          {showFocus ? (
            <button
              type="button"
              onClick={() => {
                onFocus!();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              <CalendarClock size={12} aria-hidden />
              {actionLabels.viewDaySchedule}
            </button>
          ) : null}
          {showToggle ? (
            <button
              type="button"
              onClick={() => {
                onToggleNotWorking!();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              <CircleDot size={12} aria-hidden />
              {actionLabels.markOutOfService}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
