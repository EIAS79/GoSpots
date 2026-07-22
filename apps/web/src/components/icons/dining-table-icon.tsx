import { cn } from "@/lib/cn";
import type { UnitFloorStatus } from "@/lib/booking-floor-status";

const TABLE_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-emerald-700/95 stroke-emerald-300/90",
  UNAVAILABLE: "fill-rose-700/95 stroke-rose-300/90",
  NOT_WORKING: "fill-zinc-700/90 stroke-zinc-400/80",
};

const TOP_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-emerald-500/25",
  UNAVAILABLE: "fill-rose-500/25",
  NOT_WORKING: "fill-zinc-600/30",
};

const CHAIR_FILL: Record<UnitFloorStatus, string> = {
  AVAILABLE: "fill-emerald-400/85 stroke-emerald-200/70",
  UNAVAILABLE: "fill-rose-400/85 stroke-rose-200/70",
  NOT_WORKING: "fill-zinc-500/80 stroke-zinc-300/60",
};

function clampSeats(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return 4;
  return Math.max(2, Math.min(8, Math.round(n)));
}

/** Chair positions around a round table (angles in degrees, 0 = top). */
function chairAngles(seats: number): number[] {
  if (seats <= 2) return [270, 90];
  if (seats === 3) return [210, 330, 90];
  if (seats === 4) return [0, 90, 180, 270];
  if (seats === 5) return [0, 72, 144, 216, 288];
  if (seats === 6) return [0, 60, 120, 180, 240, 300];
  if (seats === 7) return [0, 51, 103, 154, 206, 257, 309];
  return [0, 45, 90, 135, 180, 225, 270, 315];
}

/**
 * Top-down restaurant table with chairs — distinct from billiard/pool tables.
 */
export function DiningTableIcon({
  status,
  seats = 4,
  className,
}: {
  status: UnitFloorStatus;
  seats?: number | null;
  className?: string;
}) {
  const seatCount = clampSeats(seats);
  const cx = 28;
  const cy = 28;
  const tableR = 10;
  const chairR = 19.5;

  return (
    <svg
      viewBox="0 0 56 56"
      className={cn("h-9 w-9", className)}
      aria-hidden
    >
      {chairAngles(seatCount).map((deg) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        const x = cx + Math.cos(rad) * chairR;
        const y = cy + Math.sin(rad) * chairR;
        return (
          <rect
            key={deg}
            x={x - 3.2}
            y={y - 2.4}
            width="6.4"
            height="4.8"
            rx="1.6"
            transform={`rotate(${deg} ${x} ${y})`}
            className={cn(CHAIR_FILL[status], "stroke-[0.8]")}
          />
        );
      })}
      <circle
        cx={cx}
        cy={cy}
        r={tableR}
        className={cn(TABLE_FILL[status], "stroke-[1.4]")}
      />
      <circle
        cx={cx}
        cy={cy}
        r={tableR - 3.2}
        className={cn(TOP_FILL[status], "stroke-none")}
      />
      {/* Small plate / center mark so it reads as a dining top */}
      <circle
        cx={cx}
        cy={cy}
        r={2.2}
        className={cn(TABLE_FILL[status], "opacity-45 stroke-none")}
      />
    </svg>
  );
}
