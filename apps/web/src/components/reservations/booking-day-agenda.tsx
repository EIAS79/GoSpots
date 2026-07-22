"use client";

import {
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LogIn,
  Pencil,
  PlayCircle,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  isActiveBookingStatus,
  isBookingInProgress,
  isLiveBooking,
  resolveSessionBookingPhase,
  type SessionBookingPhase,
} from "@/lib/booking-time";
import {
  staffDayAgendaLabels,
  staffFloorT,
  type StaffDayAgendaLabels,
} from "@/lib/staff-floor-i18n";
import { useNowMs } from "@/lib/use-now-ms";
import type { ScheduleAgendaItem } from "@/lib/reservations-client";
import { useVenueSettingsOptional } from "@/lib/venue-settings-context";

const PAGE_SIZE = 8;

function formatTime(iso: string, locale?: string) {
  return new Date(iso).toLocaleTimeString(locale || undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

type StatusFilter = "all" | "active" | "in_use";

export function BookingDayAgenda({
  items,
  scheduleDate,
  highlightUnitId,
  highlightUnitName,
  canWrite,
  variant = "gaming",
  onEdit,
  onCancel,
  onRemove,
  onCheckIn,
  onGuestLeft,
  onCollectPayment,
  onClearUnitFilter,
}: {
  items: ScheduleAgendaItem[];
  scheduleDate: string;
  highlightUnitId?: string | null;
  highlightUnitName?: string | null;
  canWrite: boolean;
  variant?: "gaming" | "dining";
  onEdit: (item: ScheduleAgendaItem) => void;
  onCancel: (item: ScheduleAgendaItem) => void;
  onRemove: (item: ScheduleAgendaItem) => void;
  onCheckIn?: (item: ScheduleAgendaItem) => void;
  onGuestLeft?: (item: ScheduleAgendaItem) => void;
  onCollectPayment?: (item: ScheduleAgendaItem) => void;
  onClearUnitFilter?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [page, setPage] = useState(0);
  const nowMs = useNowMs(10_000);
  const isDining = variant === "dining";
  const vs = useVenueSettingsOptional();
  const t = useMemo(
    () => vs?.t ?? staffFloorT(vs?.locale),
    [vs?.t, vs?.locale],
  );
  const labels = useMemo(() => staffDayAgendaLabels(t), [t]);
  const locale = vs?.locale;

  const itemIsLive = (item: ScheduleAgendaItem) => isLiveBooking(item, nowMs);

  const itemInProgress = (item: ScheduleAgendaItem) =>
    isBookingInProgress(item, nowMs);

  const activeCount = useMemo(
    () => items.filter((i) => itemIsLive(i)).length,
    [items, nowMs, isDining],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter === "active" && !itemIsLive(item)) {
        return false;
      }
      if (statusFilter === "in_use" && !itemInProgress(item)) {
        return false;
      }
      if (highlightUnitId && item.resourceId !== highlightUnitId) return false;
      if (q) {
        const hay = `${item.guestName} ${item.unitName ?? ""} ${item.categoryName ?? ""}`
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter, highlightUnitId, nowMs, isDining]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [filtered, safePage],
  );

  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, highlightUnitId, items.length]);

  const anyEverActive = items.some((i) => isActiveBookingStatus(i.status));

  if (activeCount === 0 && !search && statusFilter === "active") {
    return (
      <section className="rounded-xl border border-dashed border-white/15 bg-zinc-900/20 px-4 py-10 text-center">
        <Calendar className="mx-auto mb-2 size-8 text-zinc-600" />
        <p className="text-sm text-zinc-400">
          {anyEverActive ? labels.allEnded : labels.emptyDay}
        </p>
        <p className="mt-1 text-xs text-zinc-600">{labels.emptyHint}</p>
      </section>
    );
  }

  return (
    <section className="min-w-0 w-full rounded-xl border border-white/10 bg-zinc-900/40">
      <header className="border-b border-white/5 px-3 py-3 md:px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">
              {labels.title}
              <span className="ml-2 font-normal text-zinc-500">
                {scheduleDate}
              </span>
            </h3>
            <p className="mt-1 text-xs text-zinc-500">{labels.flowHint}</p>
          </div>
          <span className="shrink-0 self-start rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-200">
            {labels.bookingCount(filtered.length, activeCount)}
          </span>
        </div>

        <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="relative flex min-w-0 flex-1 items-center sm:min-w-[12rem]">
            <Search
              size={12}
              className="pointer-events-none absolute left-2.5 text-zinc-500"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                isDining ? labels.searchDining : labels.searchGaming
              }
              className="w-full rounded-lg border border-white/10 bg-zinc-950/60 py-1.5 pl-7 pr-2 text-[11px] text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-400/40 focus:outline-none"
            />
          </label>
          <div className="flex shrink-0 items-center gap-0.5 self-stretch overflow-x-auto rounded-lg border border-white/10 bg-zinc-950/60 p-0.5 text-[10px] sm:self-auto">
            {(
              [
                { id: "active" as const, label: labels.filterActive },
                {
                  id: "in_use" as const,
                  label: labels.filterInUse,
                },
                { id: "all" as const, label: labels.filterAll },
              ]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={cn(
                  "rounded-md px-2 py-1 transition",
                  statusFilter === opt.id
                    ? "bg-emerald-500/15 text-emerald-200"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {highlightUnitId && highlightUnitName ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-200">
              {highlightUnitName}
              {onClearUnitFilter ? (
                <button
                  type="button"
                  onClick={onClearUnitFilter}
                  aria-label={labels.clearSeatFilter}
                  className="text-zinc-300 hover:text-white"
                >
                  <X size={11} />
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      </header>

      <ul className="divide-y divide-white/5">
        {visible.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-zinc-500">
            {labels.noMatch}
          </li>
        ) : (
          visible.map((item) => (
            <AgendaRow
              key={item.id}
              item={item}
              nowMs={nowMs}
              canWrite={canWrite}
              highlighted={item.resourceId === highlightUnitId}
              labels={labels}
              locale={locale}
              onEdit={onEdit}
              onCancel={onCancel}
              onRemove={onRemove}
              onCheckIn={onCheckIn}
              onGuestLeft={onGuestLeft}
              onCollectPayment={onCollectPayment}
            />
          ))
        )}
      </ul>

      {pageCount > 1 ? (
        <footer className="flex items-center justify-between gap-2 border-t border-white/5 px-4 py-2 text-[11px] text-zinc-500">
          <span>
            {labels.showing(
              safePage * PAGE_SIZE + 1,
              Math.min((safePage + 1) * PAGE_SIZE, filtered.length),
              filtered.length,
            )}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="grid size-6 place-items-center rounded-md border border-white/10 text-zinc-400 hover:bg-white/5 disabled:opacity-30"
              aria-label={labels.prevPage}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="min-w-[3.5rem] text-center text-zinc-400">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              className="grid size-6 place-items-center rounded-md border border-white/10 text-zinc-400 hover:bg-white/5 disabled:opacity-30"
              aria-label={labels.nextPage}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </footer>
      ) : null}
    </section>
  );
}

function sessionPhaseBadgeClass(phase: SessionBookingPhase): string {
  switch (phase) {
    case "waiting":
      return "border-amber-400/25 bg-amber-500/10 text-amber-200";
    case "in_use":
      return "border-rose-400/30 bg-rose-500/10 text-rose-200";
    case "upcoming":
      return "border-sky-400/25 bg-sky-500/10 text-sky-200";
    case "no_show":
      return "border-zinc-500/30 bg-zinc-800/60 text-zinc-500";
    case "completed":
      return "border-white/10 bg-zinc-800/60 text-zinc-400";
    default:
      return "border-white/10 text-zinc-400";
  }
}

function AgendaRow({
  item,
  nowMs,
  canWrite,
  highlighted,
  labels,
  locale,
  onEdit,
  onCancel,
  onRemove,
  onCheckIn,
  onGuestLeft,
  onCollectPayment,
}: {
  item: ScheduleAgendaItem;
  nowMs: number;
  canWrite: boolean;
  highlighted: boolean;
  labels: StaffDayAgendaLabels;
  locale?: string;
  onEdit: (item: ScheduleAgendaItem) => void;
  onCancel: (item: ScheduleAgendaItem) => void;
  onRemove: (item: ScheduleAgendaItem) => void;
  onCheckIn?: (item: ScheduleAgendaItem) => void;
  onGuestLeft?: (item: ScheduleAgendaItem) => void;
  onCollectPayment?: (item: ScheduleAgendaItem) => void;
}) {
  const sessionPhase = resolveSessionBookingPhase(
    item.status,
    item.startsAt,
    item.endsAt,
    nowMs,
  );
  const phaseLabel = labels.phase[sessionPhase];
  const canceled =
    sessionPhase === "canceled" || sessionPhase === "no_show";
  const inProgress = sessionPhase === "in_use";
  const waitingGuest = sessionPhase === "waiting";
  const needsPayment = item.awaitingPayment === true;

  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-3 px-4 py-3",
        canceled && "opacity-60",
        highlighted && "bg-emerald-500/[0.04]",
      )}
    >
      <div className="min-w-[4.5rem] shrink-0 text-sm font-medium text-emerald-300/90">
        {formatTime(item.startsAt, locale)}
        {item.status === "CHECKED_IN" ? (
          <span className="block text-[10px] font-normal text-zinc-500">
            {labels.openSession}
          </span>
        ) : sessionPhase === "waiting" ? (
          <span className="block text-[10px] font-normal text-zinc-500">
            {labels.until(formatTime(item.endsAt, locale))}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-white">{item.guestName}</span>
          {item.partySize > 1 ? (
            <span className="text-[10px] text-zinc-500">
              · {labels.guests(item.partySize)}
            </span>
          ) : null}
          {item.staffAlert ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200"
              title={labels.alertTitle}
            >
              <Bell size={10} />
              {labels.alert}
            </span>
          ) : null}
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px]",
              sessionPhaseBadgeClass(sessionPhase)
            )}
          >
            {phaseLabel}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">
          {item.unitName ?? labels.noUnit}
          {item.categoryName ? ` · ${item.categoryName}` : ""}
        </p>
      </div>
      {canWrite ? (
        <div className="flex shrink-0 flex-wrap gap-1">
          {needsPayment && onCollectPayment ? (
            <button
              type="button"
              onClick={() => onCollectPayment(item)}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20"
              title={labels.collectPaymentTitle}
            >
              <CreditCard size={12} />
              {labels.collectPayment}
            </button>
          ) : null}
          {waitingGuest && onCheckIn ? (
            <button
              type="button"
              onClick={() => onCheckIn(item)}
              className="inline-flex items-center gap-1 rounded-lg border border-sky-400/30 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/20"
              title={labels.checkInTitle}
            >
              <LogIn size={12} />
              {labels.checkIn}
            </button>
          ) : null}
          {inProgress && onGuestLeft ? (
            <button
              type="button"
              onClick={() => onGuestLeft(item)}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20"
              title={labels.guestLeftTitle}
            >
              <PlayCircle size={12} />
              {labels.guestLeft}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="grid size-8 place-items-center rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white"
            title={labels.edit}
          >
            <Pencil size={14} />
          </button>
          {!canceled ? (
            <button
              type="button"
              onClick={() => onCancel(item)}
              className="grid size-8 place-items-center rounded-lg border border-amber-400/20 text-amber-300 hover:bg-amber-500/10"
              title={labels.cancelBooking}
            >
              <XCircle size={14} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(item)}
            className="grid size-8 place-items-center rounded-lg border border-rose-400/20 text-rose-300 hover:bg-rose-500/10"
            title={labels.removePermanently}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : null}
    </li>
  );
}
