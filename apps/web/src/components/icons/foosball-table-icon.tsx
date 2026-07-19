import { cn } from "@/lib/cn";
import type { UnitFloorStatus } from "@/lib/booking-floor-status";

const TABLE_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-emerald-700/90 stroke-emerald-300",
  UNAVAILABLE: "fill-rose-700/90 stroke-rose-300",
  NOT_WORKING: "fill-zinc-600/80 stroke-zinc-400",
};

const FIELD_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-emerald-500/25",
  UNAVAILABLE: "fill-rose-500/25",
  NOT_WORKING: "fill-zinc-700/35",
};

const ROD_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-zinc-300/90",
  UNAVAILABLE: "fill-zinc-400/80",
  NOT_WORKING: "fill-zinc-500/60",
};

/** Top-down baby foot / foosball table. */
export function FoosballTableIcon({
  status,
  className,
}: {
  status: UnitFloorStatus;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 56 34"
      className={cn("h-8 w-14", className)}
      aria-hidden
    >
      <rect
        x="3"
        y="5"
        width="50"
        height="24"
        rx="3"
        className={cn(TABLE_FILL[status], "stroke-[1.5]")}
      />
      <rect
        x="7"
        y="9"
        width="42"
        height="16"
        rx="1.5"
        className={cn(FIELD_FILL[status], "stroke-none")}
      />
      <line x1="28" y1="9" x2="28" y2="25" className={cn(TABLE_FILL[status], "stroke-[1] fill-none opacity-40")} />
      <circle cx="28" cy="17" r="2.2" className={cn(ROD_FILL[status], "stroke-none")} />
      {[11, 17, 23, 33, 39, 45].map((x) => (
        <rect
          key={x}
          x={x - 0.6}
          y="7.5"
          width="1.2"
          height="19"
          rx="0.6"
          className={cn(ROD_FILL[status], "stroke-none")}
        />
      ))}
    </svg>
  );
}
