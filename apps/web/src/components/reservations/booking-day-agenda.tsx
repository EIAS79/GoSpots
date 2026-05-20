"use client";

import {
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Pencil,
  PlayCircle,
  Search,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { isActiveBookingStatus, isLiveBooking } from "@/lib/booking-time";
import type { ScheduleAgendaItem } from "@/lib/reservations-client";

const PAGE_SIZE = 8;

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Scheduled",
  CHECKED_IN: "In use",
  PENDING: "Pending",
  CANCELED: "Canceled",
  COMPLETED: "Completed",
  NO_SHOW: "No show",
};

type StatusFilter = "all" | "active" | "in_use";

export function BookingDayAgenda({
  items,
  scheduleDate,
  highlightUnitId,
  highlightUnitName,
  canWrite,
  onEdit,
  onCancel,
  onRemove,
  onEndNow,
  onClearUnitFilter,
}: {
  items: ScheduleAgendaItem[];
  scheduleDate: string;
  highlightUnitId?: string | null;
  highlightUnitName?: string | null;
  canWrite: boolean;
  onEdit: (item: ScheduleAgendaItem) => void;
  onCancel: (item: ScheduleAgendaItem) => void;
  onRemove: (item: ScheduleAgendaItem) => void;
  onEndNow?: (item: ScheduleAgendaItem) => void;
  onClearUnitFilter?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [page, setPage] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Tick once a minute so rows whose endsAt just passed drop off without a
  // full schedule refetch. The live-data poll catches up to the server's
  // auto-completion within ~15s; this just makes the UI feel instant.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const activeCount = useMemo(
    () => items.filter((i) => isLiveBooking(i, nowMs)).length,
    [items, nowMs],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter === "active" && !isLiveBooking(item, nowMs)) {
        return false;
      }
      if (
        statusFilter === "in_use" &&
        (item.status !== "CHECKED_IN" || !isLiveBooking(item, nowMs))
      ) {
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
  }, [items, search, statusFilter, highlightUnitId, nowMs]);

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
          {anyEverActive
            ? "All bookings for this day have ended"
            : "No bookings on this day"}
        </p>
        <p className="mt-1 text-xs text-zinc-600">
          Use the floor map below to book a seat, table, or lane.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-zinc-900/40">
      <header className="border-b border-white/5 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white">
              Day schedule
              <span className="ml-2 font-normal text-zinc-500">
                {scheduleDate}
              </span>
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              All bookings for this date — edit, end, cancel, or remove. Tap a
              seat on the floor map to filter this list.
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-sky-400/25 bg-sky-500/10 px-2.5 py-1 text-[11px] font-medium text-sky-200">
            {filtered.length} of {activeCount} booking
            {activeCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="relative flex min-w-[12rem] flex-1 items-center">
            <Search
              size={12}
              className="pointer-events-none absolute left-2.5 text-zinc-500"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by guest, seat, or game…"
              className="w-full rounded-lg border border-white/10 bg-zinc-950/60 py-1.5 pl-7 pr-2 text-[11px] text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-400/40 focus:outline-none"
            />
          </label>
          <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-zinc-950/60 p-0.5 text-[10px]">
            {(
              [
                { id: "active" as const, label: "Active" },
                { id: "in_use" as const, label: "In use" },
                { id: "all" as const, label: "All" },
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
                  aria-label="Clear seat filter"
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
            No bookings match your filters.
          </li>
        ) : (
          visible.map((item) => (
            <AgendaRow
              key={item.id}
              item={item}
              canWrite={canWrite}
              highlighted={item.resourceId === highlightUnitId}
              onEdit={onEdit}
              onCancel={onCancel}
              onRemove={onRemove}
              onEndNow={onEndNow}
            />
          ))
        )}
      </ul>

      {pageCount > 1 ? (
        <footer className="flex items-center justify-between gap-2 border-t border-white/5 px-4 py-2 text-[11px] text-zinc-500">
          <span>
            Showing {safePage * PAGE_SIZE + 1}–
            {Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="grid size-6 place-items-center rounded-md border border-white/10 text-zinc-400 hover:bg-white/5 disabled:opacity-30"
              aria-label="Previous page"
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
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </footer>
      ) : null}
    </section>
  );
}

function AgendaRow({
  item,
  canWrite,
  highlighted,
  onEdit,
  onCancel,
  onRemove,
  onEndNow,
}: {
  item: ScheduleAgendaItem;
  canWrite: boolean;
  highlighted: boolean;
  onEdit: (item: ScheduleAgendaItem) => void;
  onCancel: (item: ScheduleAgendaItem) => void;
  onRemove: (item: ScheduleAgendaItem) => void;
  onEndNow?: (item: ScheduleAgendaItem) => void;
}) {
  const canceled = item.status === "CANCELED";
  const inUse = item.status === "CHECKED_IN";

  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-3 px-4 py-3",
        canceled && "opacity-60",
        highlighted && "bg-emerald-500/[0.04]",
      )}
    >
      <div className="min-w-[4.5rem] shrink-0 text-sm font-medium text-emerald-300/90">
        {formatTime(item.startsAt)}
        <span className="block text-[10px] font-normal text-zinc-500">
          → {formatTime(item.endsAt)}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-white">{item.guestName}</span>
          {item.staffAlert ? (
            <span
              className="inline-flex items-center gap-0.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200"
              title="Team notified"
            >
              <Bell size={10} />
              Alert
            </span>
          ) : null}
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px]",
              inUse
                ? "border-rose-400/30 bg-rose-500/10 text-rose-200"
                : "border-white/10 text-zinc-400",
            )}
          >
            {STATUS_LABEL[item.status] ?? item.status}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">
          {item.unitName ?? "No unit"}
          {item.categoryName ? ` · ${item.categoryName}` : ""}
        </p>
      </div>
      {canWrite ? (
        <div className="flex shrink-0 gap-1">
          {inUse && onEndNow ? (
            <button
              type="button"
              onClick={() => onEndNow(item)}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-200 hover:bg-emerald-500/20"
              title="End the session and free the seat"
            >
              <PlayCircle size={12} />
              End now
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="grid size-8 place-items-center rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          {!canceled ? (
            <button
              type="button"
              onClick={() => onCancel(item)}
              className="grid size-8 place-items-center rounded-lg border border-amber-400/20 text-amber-300 hover:bg-amber-500/10"
              title="Cancel booking"
            >
              <XCircle size={14} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onRemove(item)}
            className="grid size-8 place-items-center rounded-lg border border-rose-400/20 text-rose-300 hover:bg-rose-500/10"
            title="Remove permanently"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ) : null}
    </li>
  );
}
