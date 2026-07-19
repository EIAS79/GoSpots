import { cn } from "@/lib/cn";
import type { UnitFloorStatus } from "@/lib/booking-floor-status";

const TABLE_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-emerald-600/90 stroke-emerald-300",
  UNAVAILABLE: "fill-rose-600/90 stroke-rose-300",
  NOT_WORKING: "fill-zinc-600/80 stroke-zinc-400",
};

const FELT_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-emerald-500/30",
  UNAVAILABLE: "fill-rose-500/30",
  NOT_WORKING: "fill-zinc-700/40",
};

/** Top-down ping pong / table tennis table. */
export function PingPongTableIcon({
  status,
  className,
}: {
  status: UnitFloorStatus;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 52 32"
      className={cn("h-8 w-13", className)}
      aria-hidden
    >
      <rect
        x="2"
        y="6"
        width="48"
        height="20"
        rx="2"
        className={cn(TABLE_FILL[status], "stroke-[1.5]")}
      />
      <rect
        x="5"
        y="9"
        width="42"
        height="14"
        rx="1"
        className={cn(FELT_FILL[status], "stroke-none")}
      />
      <line
        x1="26"
        y1="9"
        x2="26"
        y2="23"
        className={cn(TABLE_FILL[status], "stroke-[1] fill-none opacity-50")}
      />
      <line x1="2" y1="16" x2="5" y2="16" className={cn(TABLE_FILL[status], "stroke-[1.5] fill-none")} />
      <line x1="47" y1="16" x2="50" y2="16" className={cn(TABLE_FILL[status], "stroke-[1.5] fill-none")} />
    </svg>
  );
}
