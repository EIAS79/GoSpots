import type { ResourceType } from "@prisma/client";

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
