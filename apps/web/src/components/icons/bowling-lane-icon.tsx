import { cn } from "@/lib/cn";
import type { UnitFloorStatus } from "@/lib/booking-floor-status";

const LANE_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-amber-700/90 stroke-emerald-300",
  UNAVAILABLE: "fill-rose-800/90 stroke-rose-300",
  NOT_WORKING: "fill-zinc-700/80 stroke-zinc-400",
};

const GUTTER_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-zinc-900/80",
  UNAVAILABLE: "fill-zinc-950/80",
  NOT_WORKING: "fill-zinc-950/70",
};

const PIN_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-emerald-200/90",
  UNAVAILABLE: "fill-rose-200/90",
  NOT_WORKING: "fill-zinc-400/70",
};

/** Vertical bowling lane — pins at the top, lane running down (alley view). */
export function BowlingLaneIcon({
  status,
  className,
}: {
  status: UnitFloorStatus;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 72"
      className={cn("h-[4.5rem] w-8", className)}
      aria-hidden
    >
      <rect x="1" y="1" width="6" height="70" rx="1" className={GUTTER_FILL[status]} />
      <rect x="25" y="1" width="6" height="70" rx="1" className={GUTTER_FILL[status]} />
      <rect
        x="7"
        y="1"
        width="18"
        height="70"
        rx="1.5"
        className={cn(LANE_FILL[status], "stroke-[1.2]")}
      />
      <line
        x1="16"
        y1="8"
        x2="16"
        y2="66"
        className="stroke-white/15 stroke-[0.8] fill-none"
      />
      <circle cx="16" cy="10" r="2.2" className={PIN_FILL[status]} />
      <circle cx="12.5" cy="14.5" r="2" className={PIN_FILL[status]} />
      <circle cx="19.5" cy="14.5" r="2" className={PIN_FILL[status]} />
      <circle cx="9.5" cy="19" r="1.8" className={PIN_FILL[status]} />
      <circle cx="16" cy="19" r="1.8" className={PIN_FILL[status]} />
      <circle cx="22.5" cy="19" r="1.8" className={PIN_FILL[status]} />
      <circle
        cx="16"
        cy="58"
        r="3.2"
        className={cn(
          status === "AVAILABLE" && "fill-emerald-400/90",
          status === "UNAVAILABLE" && "fill-rose-400/90",
          status === "NOT_WORKING" && "fill-zinc-500/80",
        )}
      />
      <ellipse
        cx="16"
        cy="58"
        rx="3.2"
        ry="1"
        className="fill-black/25"
      />
    </svg>
  );
}
