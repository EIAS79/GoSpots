import { cn } from "@/lib/cn";
import type { UnitFloorStatus } from "@/lib/booking-floor-status";

const TABLE_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-emerald-600/90 stroke-emerald-300",
  UNAVAILABLE: "fill-rose-600/90 stroke-rose-300",
  NOT_WORKING: "fill-zinc-600/80 stroke-zinc-400",
};

const FELT_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-emerald-500/35",
  UNAVAILABLE: "fill-rose-500/35",
  NOT_WORKING: "fill-zinc-700/40",
};

const POCKET_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-zinc-950/90",
  UNAVAILABLE: "fill-zinc-950/90",
  NOT_WORKING: "fill-zinc-900/90",
};

/** Top-down billiard / pool table icon for floor maps and cards. */
export function BilliardTableIcon({
  status,
  className,
}: {
  status: UnitFloorStatus;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 56 32"
      className={cn("h-8 w-14", className)}
      aria-hidden
    >
      <rect
        x="2"
        y="3"
        width="52"
        height="26"
        rx="4"
        className={cn(TABLE_FILL[status], "stroke-[1.5]")}
      />
      <rect
        x="6"
        y="7"
        width="44"
        height="18"
        rx="2"
        className={cn(FELT_FILL[status], "stroke-none")}
      />
      <line
        x1="28"
        y1="7"
        x2="28"
        y2="25"
        className={cn(TABLE_FILL[status], "stroke-[1] fill-none opacity-40")}
      />
      <circle cx="4" cy="4" r="2.5" className={POCKET_FILL[status]} />
      <circle cx="52" cy="4" r="2.5" className={POCKET_FILL[status]} />
      <circle cx="4" cy="28" r="2.5" className={POCKET_FILL[status]} />
      <circle cx="52" cy="28" r="2.5" className={POCKET_FILL[status]} />
      <circle cx="28" cy="4" r="2" className={POCKET_FILL[status]} />
      <circle cx="28" cy="28" r="2" className={POCKET_FILL[status]} />
    </svg>
  );
}
