import { cn } from "@/lib/cn";
import type { UnitFloorStatus } from "@/lib/booking-floor-status";

const CABINET_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-emerald-600/90 stroke-emerald-300",
  UNAVAILABLE: "fill-rose-600/90 stroke-rose-300",
  NOT_WORKING: "fill-zinc-600/80 stroke-zinc-400",
};

const SCREEN_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-sky-400/50",
  UNAVAILABLE: "fill-rose-400/40",
  NOT_WORKING: "fill-zinc-600/50",
};

/** Arcade cabinet icon for floor maps. */
export function ArcadeCabinetIcon({
  status,
  className,
}: {
  status: UnitFloorStatus;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 28 36"
      className={cn("h-9 w-7", className)}
      aria-hidden
    >
      <path
        d="M6 4h16a2 2 0 0 1 2 2v8H4V6a2 2 0 0 1 2-2Z"
        className={cn(CABINET_FILL[status], "stroke-[1.5]")}
      />
      <rect
        x="7"
        y="7"
        width="14"
        height="5"
        rx="0.5"
        className={cn(SCREEN_FILL[status], "stroke-none")}
      />
      <path
        d="M4 14h20v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V14Z"
        className={cn(CABINET_FILL[status], "stroke-[1.5]")}
      />
      <circle cx="10" cy="24" r="2" className={cn(CABINET_FILL[status], "stroke-[1] fill-zinc-950/30")} />
      <circle cx="18" cy="24" r="2" className={cn(CABINET_FILL[status], "stroke-[1] fill-zinc-950/30")} />
      <path
        d="M12 30h4"
        className={cn(CABINET_FILL[status], "stroke-[1.5] fill-none")}
      />
    </svg>
  );
}
