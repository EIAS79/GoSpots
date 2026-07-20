"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatWindowLabel } from "@/lib/gaming-window-availability";
import { todayDateInput } from "@/lib/seating-event-datetime";

function shiftDate(dateStr: string, delta: number) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + delta);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatScheduleDay(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  const today = todayDateInput();
  const label = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (dateStr === today) return `Today · ${label}`;
  return label;
}

export function GamingFloorMapControls({
  mapLabel,
  scheduleDate,
  onScheduleDateChange,
  windowStartTime,
  windowEndTime,
  onWindowStartTimeChange,
  onWindowEndTimeChange,
  windowError,
  floorTabs,
}: {
  mapLabel?: string;
  scheduleDate: string;
  onScheduleDateChange: (date: string) => void;
  windowStartTime: string;
  windowEndTime: string;
  onWindowStartTimeChange: (time: string) => void;
  onWindowEndTimeChange: (time: string) => void;
  windowError?: string | null;
  floorTabs?: ReactNode;
}) {
  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-background)]/70 px-3 py-2.5">
      {mapLabel ? (
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          {mapLabel}
        </p>
      ) : null}
      <div
        className={cn(
          "flex flex-col gap-3",
          floorTabs ? "lg:flex-row lg:items-start lg:justify-between" : "",
        )}
      >
        {floorTabs ? (
          <div className="min-w-0 flex-1">
            <p className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
              <Layers size={10} className="text-emerald-400/70" />
              Floor
            </p>
            {floorTabs}
          </div>
        ) : null}

        <div
          className={cn(
            "min-w-0 shrink-0",
            floorTabs
              ? "border-t border-[var(--color-border)] pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"
              : "ml-auto w-full sm:w-auto",
          )}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
            <div className="min-w-0">
              <p className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                <CalendarDays size={10} className="text-amber-400/70" />
                Date
              </p>
              <div className="flex max-w-full items-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5">
                <button
                  type="button"
                  onClick={() =>
                    onScheduleDateChange(shiftDate(scheduleDate, -1))
                  }
                  className="rounded-md p-1.5 text-zinc-500 hover:bg-black/5 hover:text-[var(--color-foreground)] dark:hover:bg-white/5 dark:hover:text-white"
                  aria-label="Previous day"
                >
                  <ChevronLeft size={14} />
                </button>
                <label className="flex min-w-0 items-center gap-1.5 px-1 text-[11px] text-[var(--color-foreground)]">
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => onScheduleDateChange(e.target.value)}
                    className="max-w-[9.5rem] min-w-0 bg-transparent text-base font-medium outline-none sm:text-[11px]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    onScheduleDateChange(shiftDate(scheduleDate, 1))
                  }
                  className="rounded-md p-1.5 text-zinc-500 hover:bg-black/5 hover:text-[var(--color-foreground)] dark:hover:bg-white/5 dark:hover:text-white"
                  aria-label="Next day"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-zinc-600">
                {formatScheduleDay(scheduleDate)}
              </p>
            </div>

            <div className="min-w-0">
              <p className="mb-1.5 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
                <Clock size={10} className="text-sky-400/70" />
                Check availability
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                  <span>From</span>
                  <input
                    type="time"
                    value={windowStartTime}
                    onChange={(e) => onWindowStartTimeChange(e.target.value)}
                    className="max-w-[9.5rem] min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-base text-[var(--color-foreground)] outline-none focus:border-sky-400/40 sm:text-[11px]"
                  />
                </label>
                <label className="flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                  <span>To</span>
                  <input
                    type="time"
                    value={windowEndTime}
                    onChange={(e) => onWindowEndTimeChange(e.target.value)}
                    className="max-w-[9.5rem] min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-1 text-base text-[var(--color-foreground)] outline-none focus:border-sky-400/40 sm:text-[11px]"
                  />
                </label>
              </div>
              {windowError ? (
                <p className="mt-1.5 text-[10px] text-rose-300">{windowError}</p>
              ) : (
                <p className="mt-1.5 text-[10px] text-zinc-600">
                  {formatWindowLabel(
                    scheduleDate,
                    windowStartTime,
                    windowEndTime,
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
