/** Floor display status for game units (schedule board). */
export type UnitFloorStatus = "AVAILABLE" | "UNAVAILABLE" | "NOT_WORKING";

export const FLOOR_STATUS_LABELS: Record<UnitFloorStatus, string> = {
  AVAILABLE: "Available",
  UNAVAILABLE: "In use",
  NOT_WORKING: "Out of service",
};

export const FLOOR_STATUS_DOT: Record<UnitFloorStatus, string> = {
  AVAILABLE: "bg-emerald-400",
  UNAVAILABLE: "bg-rose-400",
  NOT_WORKING: "bg-zinc-500",
};

export const FLOOR_STATUS_RING: Record<UnitFloorStatus, string> = {
  AVAILABLE: "ring-emerald-400/30",
  UNAVAILABLE: "ring-rose-400/40",
  NOT_WORKING: "ring-zinc-600/30",
};

export const FLOOR_STATUS_COLORS: Record<UnitFloorStatus, string> = {
  AVAILABLE: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  UNAVAILABLE: "bg-rose-500/15 text-rose-300 border-rose-400/30",
  NOT_WORKING: "bg-zinc-700/50 text-zinc-400 border-white/10",
};
