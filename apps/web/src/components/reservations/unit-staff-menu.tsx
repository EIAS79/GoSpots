"use client";

import { CircleDot, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export function UnitStaffMenu({
  unitName,
  isOutOfService,
  onToggleOutOfService,
  className,
}: {
  unitName: string;
  isOutOfService: boolean;
  onToggleOutOfService: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className={cn("absolute right-0 top-0 z-10", className)}>
      <button
        type="button"
        aria-label={`Station actions for ${unitName}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "grid size-5 place-items-center rounded-md bg-zinc-950/80 text-zinc-500 ring-1 ring-white/10 transition hover:text-zinc-200",
          open && "text-zinc-200",
        )}
      >
        <MoreHorizontal size={12} />
      </button>
      {open ? (
        <div className="absolute right-0 top-6 w-44 overflow-hidden rounded-lg border border-white/10 bg-zinc-950/95 p-1 text-xs shadow-xl backdrop-blur">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleOutOfService();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-zinc-300 hover:bg-white/5 hover:text-white"
          >
            <CircleDot size={12} aria-hidden />
            {isOutOfService ? "Restore to service" : "Mark out of service"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
