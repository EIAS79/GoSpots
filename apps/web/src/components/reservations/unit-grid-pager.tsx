"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Above this count, show pages / scroll controls instead of one huge grid. */
const COMPACT_THRESHOLD = 16;

type ViewMode = "pages" | "scroll";

export function UnitGridPager<T extends { id: string }>({
  units,
  pageSize,
  compact,
  lane,
  itemClassName,
  gridClassName,
  children,
}: {
  units: T[];
  pageSize: number;
  compact?: boolean;
  lane?: boolean;
  itemClassName?: string;
  gridClassName?: string;
  children: (unit: T, index: number) => ReactNode;
}) {
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<ViewMode>("pages");

  const usePager = units.length > COMPACT_THRESHOLD;
  const pageCount = Math.max(1, Math.ceil(units.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  const pageUnits = useMemo(() => {
    if (!usePager || mode !== "pages") return units;
    const start = safePage * pageSize;
    return units.slice(start, start + pageSize);
  }, [units, usePager, mode, safePage, pageSize]);

  const rangeLabel = useMemo(() => {
    if (!usePager || mode !== "pages") return null;
    const start = safePage * pageSize + 1;
    const end = Math.min((safePage + 1) * pageSize, units.length);
    return `${start}–${end} of ${units.length}`;
  }, [usePager, mode, safePage, pageSize, units.length]);

  if (!usePager) {
    return (
      <ul className={gridClassName}>
        {units.map((unit, i) => (
          <li key={unit.id} className={itemClassName}>
            {children(unit, i)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="border-t border-white/5">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <p className="text-[11px] text-zinc-500">
          {mode === "pages" ? rangeLabel : `${units.length} total · swipe →`}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <div className="flex rounded-lg bg-zinc-950/80 p-0.5 ring-1 ring-white/10">
            <button
              type="button"
              onClick={() => {
                setMode("pages");
                setPage(0);
              }}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] font-medium",
                mode === "pages"
                  ? "bg-emerald-500/20 text-emerald-100"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              Pages
            </button>
            <button
              type="button"
              onClick={() => setMode("scroll")}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] font-medium",
                mode === "scroll"
                  ? "bg-emerald-500/20 text-emerald-100"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              Scroll
            </button>
          </div>
          {mode === "pages" ? (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={safePage <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="grid size-7 place-items-center rounded-md border border-white/10 text-zinc-400 hover:bg-white/5 disabled:opacity-30"
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="min-w-[4.5rem] text-center text-[10px] text-zinc-400">
                {safePage + 1} / {pageCount}
              </span>
              <button
                type="button"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                className="grid size-7 place-items-center rounded-md border border-white/10 text-zinc-400 hover:bg-white/5 disabled:opacity-30"
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {mode === "scroll" ? (
        <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-smooth p-3 pb-4">
          {units.map((unit, i) => (
            <li
              key={unit.id}
              className={cn(
                "w-[7.25rem] shrink-0 snap-start sm:w-32",
                compact && "w-28 sm:w-[7.5rem]",
                lane && "w-36 sm:w-40",
                itemClassName,
              )}
            >
              {children(unit, i)}
            </li>
          ))}
        </ul>
      ) : (
        <ul className={gridClassName}>
          {pageUnits.map((unit, i) => (
            <li key={unit.id} className={itemClassName}>
              {children(unit, safePage * pageSize + i)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
