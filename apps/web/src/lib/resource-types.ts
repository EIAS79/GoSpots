export type ResourceType =
  | "BILLIARD"
  | "SNOOKER"
  | "POOL"
  | "DARTS"
  | "PLAYSTATION"
  | "PC"
  | "BOWLING"
  | "MINIGAMES"
  | "SWIMMING_POOL"
  | "TABLE_TENNIS"
  | "ARCADE"
  | "CHESS"
  | "CARDS"
  | "TABLE"
  | "OTHER";

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  BILLIARD: "Billiard",
  SNOOKER: "Snooker",
  POOL: "Pool table",
  DARTS: "Darts",
  PLAYSTATION: "PlayStation",
  PC: "PC gaming",
  BOWLING: "Bowling",
  MINIGAMES: "Minigames",
  SWIMMING_POOL: "Swimming pool",
  TABLE_TENNIS: "Table tennis",
  ARCADE: "Arcade",
  CHESS: "Chess",
  CARDS: "Card games",
  TABLE: "Table / lounge",
  OTHER: "Other",
};

export const RESOURCE_TYPE_OPTIONS = (
  Object.keys(RESOURCE_TYPE_LABELS) as ResourceType[]
).map((value) => ({
  value,
  label: RESOURCE_TYPE_LABELS[value],
}));

export type ResourceStatus =
  | "AVAILABLE"
  | "BUSY"
  | "RESERVED"
  | "MAINTENANCE";

export const RESOURCE_STATUS_LABELS: Record<ResourceStatus, string> = {
  AVAILABLE: "Available",
  BUSY: "In use",
  RESERVED: "Reserved",
  MAINTENANCE: "Maintenance",
};

export const RESOURCE_STATUS_COLORS: Record<ResourceStatus, string> = {
  AVAILABLE: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
  BUSY: "bg-rose-500/15 text-rose-300 border-rose-400/30",
  RESERVED: "bg-amber-500/15 text-amber-200 border-amber-400/30",
  MAINTENANCE: "bg-zinc-700/50 text-zinc-400 border-white/10",
};
