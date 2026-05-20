"use client";

import {
  CalendarClock,
  CircleDot,
  Gamepad2,
  MoreHorizontal,
  Monitor,
  PlayCircle,
  RectangleHorizontal,
  User2,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { cn } from "@/lib/cn";
import {
  getBookingUnitKind,
  getBookingUnitLabels,
  sortScheduleCategories,
} from "@/lib/booking-unit-kind";
import {
  FLOOR_STATUS_DOT,
  FLOOR_STATUS_LABELS,
  type UnitFloorStatus,
} from "@/lib/booking-floor-status";
import {
  countActiveBookings,
  isLiveBooking,
  localDateInput,
} from "@/lib/booking-time";
import type {
  DaySchedule,
  ScheduleBooking,
  ScheduleCategory,
  ScheduleUnit,
} from "@/lib/reservations-client";
import { UnitGridPager } from "@/components/reservations/unit-grid-pager";
import { RESOURCE_TYPE_LABELS, type ResourceType } from "@/lib/resource-types";

const TYPE_ICONS: Partial<
  Record<ResourceType, ComponentType<{ size?: number; className?: string }>>
> = {
  PC: Monitor,
  PLAYSTATION: Gamepad2,
  BILLIARD: CircleDot,
  BOWLING: RectangleHorizontal,
};

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
  // Live = active status AND end time still in the future.
  const live = bookings.filter((b) => isLiveBooking(b, nowMs));
  if (live.length === 0) return null;

  const inUse = live.find(
    (b) =>
      b.status === "CHECKED_IN" &&
      new Date(b.startsAt).getTime() <= nowMs &&
      new Date(b.endsAt).getTime() > nowMs,
  );
  if (inUse) return inUse;

  if (isToday) {
    const upcoming = live
      .filter((b) => new Date(b.endsAt).getTime() > nowMs)
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
    return upcoming[0] ?? null;
  }
  return live[0] ?? null;
}

type ScheduleCommon = {
  canWrite: boolean;
  isToday: boolean;
  nowMs: number;
  onBookUnit: (unitId: string, categoryId: string) => void;
  onToggleNotWorking?: (unitId: string, notWorking: boolean) => Promise<void>;
  onFocusUnit?: (unitId: string, unitName: string) => void;
  onEditBooking?: (booking: ScheduleBooking, unitId: string) => void;
  onEndBookingNow?: (booking: ScheduleBooking, unitId: string) => Promise<void>;
  highlightedUnitId?: string | null;
};

export function GameBookingSchedule({
  schedule,
  onBookUnit,
  onToggleNotWorking,
  onFocusUnit,
  onEditBooking,
  onEndBookingNow,
  highlightedUnitId,
  canWrite,
}: {
  schedule: DaySchedule;
  onBookUnit: (unitId: string, categoryId: string) => void;
  onToggleNotWorking?: (unitId: string, notWorking: boolean) => Promise<void>;
  onFocusUnit?: (unitId: string, unitName: string) => void;
  onEditBooking?: (booking: ScheduleBooking, unitId: string) => void;
  onEndBookingNow?: (booking: ScheduleBooking, unitId: string) => Promise<void>;
  highlightedUnitId?: string | null;
  canWrite: boolean;
}) {
  const isToday = schedule.date === localDateInput();
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Re-tick every 30s so live status, "Available" transitions at endsAt, and
  // booking counts update without a network refetch. Combined with the 15s
  // schedule poll this keeps the floor map effectively realtime.
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isToday]);

  const categories = sortScheduleCategories(
    schedule.categories.map((cat) => ({
      ...cat,
      unitKind: cat.unitKind ?? getBookingUnitKind(cat.type),
      unitLabels:
        cat.unitLabels ?? getBookingUnitLabels(getBookingUnitKind(cat.type)),
    })),
  );

  if (categories.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-6 py-12 text-center text-sm text-zinc-500">
        No games configured yet. Add PC, PlayStation, billiard, or bowling under{" "}
        <span className="text-zinc-400">Games &amp; tables</span>.
      </p>
    );
  }

  const common: ScheduleCommon = {
    canWrite,
    isToday,
    nowMs,
    onBookUnit,
    onToggleNotWorking,
    onFocusUnit,
    onEditBooking,
    onEndBookingNow,
    highlightedUnitId,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {(["AVAILABLE", "UNAVAILABLE", "NOT_WORKING"] as UnitFloorStatus[]).map(
          (s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-950/50 px-2.5 py-1 text-zinc-300"
            >
              <span
                className={cn("size-1.5 rounded-full", FLOOR_STATUS_DOT[s])}
              />
              {FLOOR_STATUS_LABELS[s]}
            </span>
          ),
        )}
        {!isToday ? (
          <span className="text-zinc-500">
            · Schedule for {schedule.date} — &quot;in use&quot; is only computed
            for today
          </span>
        ) : null}
      </div>

      {categories.map((cat) => (
        <CategorySection key={cat.id} category={cat} {...common} />
      ))}
    </div>
  );
}

function CategorySection({
  category: cat,
  ...common
}: { category: ScheduleCategory } & ScheduleCommon) {
  const Icon = TYPE_ICONS[cat.type];
  const free = cat.units.filter((u) => u.floorStatus === "AVAILABLE").length;
  const inUse = cat.units.filter((u) => u.floorStatus === "UNAVAILABLE").length;
  const oos = cat.units.filter((u) => u.floorStatus === "NOT_WORKING").length;
  const labels = cat.unitLabels ?? getBookingUnitLabels(cat.unitKind);

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {Icon ? (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/5 text-emerald-300">
              <Icon size={18} />
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="font-semibold text-white">{cat.name}</h3>
            <p className="text-[11px] text-zinc-500">
              {RESOURCE_TYPE_LABELS[cat.type]} · {cat.units.length}{" "}
              {labels.plural} · default {cat.slotMinutes} min
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            {free} free
          </span>
          {inUse > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/25 bg-rose-500/10 px-2 py-0.5 text-rose-200">
              <span className="size-1.5 rounded-full bg-rose-400" />
              {inUse} in use
            </span>
          ) : null}
          {oos > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-zinc-800/60 px-2 py-0.5 text-zinc-400">
              <span className="size-1.5 rounded-full bg-zinc-500" />
              {oos} OOS
            </span>
          ) : null}
        </div>
      </header>

      {cat.unitKind === "SEAT" ? (
        <SeatGrid units={cat.units} categoryId={cat.id} {...common} />
      ) : cat.unitKind === "TABLE" ? (
        <TableGrid units={cat.units} categoryId={cat.id} {...common} />
      ) : cat.unitKind === "LANE" ? (
        <LaneRow units={cat.units} categoryId={cat.id} {...common} />
      ) : (
        <UnitList units={cat.units} categoryId={cat.id} {...common} />
      )}
    </section>
  );
}

type GridProps = {
  units: ScheduleUnit[];
  categoryId: string;
} & ScheduleCommon;

function unitCardCommon(unit: ScheduleUnit, categoryId: string, p: GridProps) {
  return {
    unit,
    canWrite: p.canWrite,
    isToday: p.isToday,
    nowMs: p.nowMs,
    highlighted: p.highlightedUnitId === unit.id,
    onBook: () => p.onBookUnit(unit.id, categoryId),
    onFocus: p.onFocusUnit ? () => p.onFocusUnit!(unit.id, unit.name) : undefined,
    onEditBooking: p.onEditBooking
      ? (b: ScheduleBooking) => p.onEditBooking!(b, unit.id)
      : undefined,
    onEndBookingNow: p.onEndBookingNow
      ? (b: ScheduleBooking) => p.onEndBookingNow!(b, unit.id)
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

const SEAT_PAGE = 20;
const TABLE_PAGE = 9;
const LIST_PAGE = 15;

function SeatGrid(p: GridProps) {
  return (
    <UnitGridPager
      units={p.units}
      pageSize={SEAT_PAGE}
      compact
      gridClassName="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
    >
      {(unit) => (
        <UnitCard variant="seat" {...unitCardCommon(unit, p.categoryId, p)} />
      )}
    </UnitGridPager>
  );
}

function TableGrid(p: GridProps) {
  return (
    <UnitGridPager
      units={p.units}
      pageSize={TABLE_PAGE}
      gridClassName="grid gap-2.5 p-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {(unit) => (
        <UnitCard variant="table" {...unitCardCommon(unit, p.categoryId, p)} />
      )}
    </UnitGridPager>
  );
}

function LaneRow(p: GridProps) {
  if (p.units.length <= 16) {
    return (
      <ul className="flex gap-2.5 overflow-x-auto p-3 pb-4">
        {p.units.map((unit) => (
          <li key={unit.id} className="w-40 shrink-0">
            <UnitCard
              variant="lane"
              {...unitCardCommon(unit, p.categoryId, p)}
            />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <UnitGridPager units={p.units} pageSize={12} lane>
      {(unit) => (
        <UnitCard variant="lane" {...unitCardCommon(unit, p.categoryId, p)} />
      )}
    </UnitGridPager>
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
  onBook: () => void;
  onFocus?: () => void;
  onEditBooking?: (b: ScheduleBooking) => void;
  onEndBookingNow?: (b: ScheduleBooking) => Promise<void> | void;
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
  onBook,
  onFocus,
  onEditBooking,
  onEndBookingNow,
  onToggleNotWorking,
}: UnitCardProps) {
  // The server-computed floorStatus is the source of truth, but if the
  // booking that made the seat UNAVAILABLE has actually ended by `nowMs`, we
  // optimistically treat the seat as AVAILABLE until the next refetch.
  const serverStatus = unit.floorStatus;
  const hasLiveBlocking = unit.bookings.some(
    (b) =>
      isLiveBooking(b, nowMs) &&
      new Date(b.startsAt).getTime() <= nowMs &&
      new Date(b.endsAt).getTime() > nowMs,
  );
  const status =
    serverStatus === "UNAVAILABLE" && !hasLiveBlocking
      ? "AVAILABLE"
      : serverStatus;
  const bookingCount = countActiveBookings(unit.bookings, nowMs);
  const focus = findActiveOrNext(unit.bookings, isToday, nowMs);
  const extraBookings = Math.max(0, bookingCount - (focus ? 1 : 0));
  const isOOS = status === "NOT_WORKING";
  const isInUse = status === "UNAVAILABLE";
  const compact = variant === "seat";
  const list = variant === "list";
  const activeBooking =
    isInUse && focus?.status === "CHECKED_IN" ? focus : null;

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
        onBook={onBook}
        onFocus={onFocus}
        onEditBooking={onEditBooking}
        onEndBookingNow={onEndBookingNow}
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
              {FLOOR_STATUS_LABELS[status]}
            </p>
          </div>

          {canWrite ? (
            <UnitMenu
              unit={unit}
              status={status}
              hasBookings={bookingCount > 0}
              activeBooking={activeBooking}
              onToggleNotWorking={onToggleNotWorking}
              onFocus={onFocus}
              onEndBookingNow={onEndBookingNow}
            />
          ) : null}
        </header>

        {focus && !isOOS ? (
          <FocusRow
            focus={focus}
            isInUse={isInUse}
            compact={compact}
            extraBookings={extraBookings}
            onFocus={onFocus}
          />
        ) : compact ? null : (
          <p className="text-[11px] text-zinc-600">
            {isOOS ? "Marked for maintenance" : "No bookings today"}
          </p>
        )}

        <div className="mt-auto pt-1">
          <PrimaryAction
            status={status}
            canWrite={canWrite}
            focus={focus}
            compact={compact}
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
  compact,
  extraBookings,
  onFocus,
}: {
  focus: ScheduleBooking;
  isInUse: boolean;
  compact: boolean;
  extraBookings: number;
  onFocus?: () => void;
}) {
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
        {formatTime(focus.startsAt)} – {formatTime(focus.endsAt)}
        {isInUse ? (
          <span className="text-rose-300/90"> · now</span>
        ) : null}
      </p>
      {extraBookings > 0 && onFocus ? (
        <button
          type="button"
          onClick={onFocus}
          className="text-[10px] text-sky-300/80 hover:text-sky-200 hover:underline"
        >
          +{extraBookings} more today
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
  onBook,
  onEditBooking,
  onToggleNotWorking,
}: {
  status: UnitFloorStatus;
  canWrite: boolean;
  focus: ScheduleBooking | null;
  compact: boolean;
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
        Restore to service
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
        Open booking
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
      Book
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
  onBook,
  onFocus,
  onEditBooking,
  onEndBookingNow,
  onToggleNotWorking,
}: {
  unit: ScheduleUnit;
  status: UnitFloorStatus;
  focus: ScheduleBooking | null;
  bookingCount: number;
  canWrite: boolean;
  highlighted?: boolean;
  nowMs: number;
  onBook: () => void;
  onFocus?: () => void;
  onEditBooking?: (b: ScheduleBooking) => void;
  onEndBookingNow?: (b: ScheduleBooking) => Promise<void> | void;
  onToggleNotWorking?: () => void;
}) {
  const activeBooking =
    status === "UNAVAILABLE" &&
    focus?.status === "CHECKED_IN" &&
    isLiveBooking(focus, nowMs)
      ? focus
      : null;
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
          {FLOOR_STATUS_LABELS[status]}
          {focus ? (
            <span className="ml-1.5 text-zinc-500">
              · {focus.guestName} {formatTime(focus.startsAt)}–
              {formatTime(focus.endsAt)}
            </span>
          ) : null}
          {bookingCount > (focus ? 1 : 0) ? (
            <span className="ml-1.5 text-sky-300/80">
              +{bookingCount - (focus ? 1 : 0)} more
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
              onBook={onBook}
              onEditBooking={onEditBooking}
              onToggleNotWorking={onToggleNotWorking}
            />
          </div>
          <UnitMenu
            unit={unit}
            status={status}
            hasBookings={bookingCount > 0}
            activeBooking={activeBooking}
            onToggleNotWorking={onToggleNotWorking}
            onFocus={onFocus}
            onEndBookingNow={onEndBookingNow}
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
  activeBooking,
  onToggleNotWorking,
  onFocus,
  onEndBookingNow,
  inline,
}: {
  unit: ScheduleUnit;
  status: UnitFloorStatus;
  hasBookings: boolean;
  activeBooking?: ScheduleBooking | null;
  onToggleNotWorking?: () => void;
  onFocus?: () => void;
  onEndBookingNow?: (b: ScheduleBooking) => Promise<void> | void;
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

  // Don't show "mark out of service" in menu when it's the only action
  // and would be redundant with the primary button (already handled by Restore).
  const isOOS = status === "NOT_WORKING";
  const showToggle = Boolean(onToggleNotWorking) && !isOOS;
  const showFocus = hasBookings && Boolean(onFocus);
  const showEnd = Boolean(onEndBookingNow && activeBooking);

  if (!showToggle && !showFocus && !showEnd) return null;

  return (
    <div ref={ref} className={cn("relative", inline ? "" : "shrink-0")}>
      <button
        type="button"
        aria-label={`More actions for ${unit.name}`}
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
          {showEnd && activeBooking && onEndBookingNow ? (
            <button
              type="button"
              onClick={() => {
                void onEndBookingNow(activeBooking);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
            >
              <PlayCircle size={12} aria-hidden />
              End session — free seat
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
              View in day schedule
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
              Mark out of service
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
