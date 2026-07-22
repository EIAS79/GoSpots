/** Shared vector geometry for the Locora doorway + signal mark */

/** Outer doorway / portal silhouette */
export const LOCORA_DOOR_PATH =
  "M10 50 V14 C10 8.5 14.5 4 20 4 H28 C33.5 4 38 8.5 38 14 V50 H32 V16 C32 13.8 30.2 12 28 12 H20 C17.8 12 16 13.8 16 16 V50 Z";

/** Inner panel (dashboard face) */
export const LOCORA_PANEL_PATH =
  "M18 48 V18 C18 16.9 18.9 16 20 16 H28 C29.1 16 30 16.9 30 18 V48 Z";

/** Soft control grid lines inside the panel */
export const LOCORA_GRID_LINES = [
  "M20.5 22 H27.5",
  "M20.5 26.5 H27.5",
  "M20.5 31 H27.5",
  "M20.5 35.5 H27.5",
  "M20.5 40 H27.5",
  "M23 20 V46",
  "M25.5 20 V46",
] as const;

/** Publish / discovery signal arcs (right side) */
export const LOCORA_SIGNAL_ARCS = [
  "M40 18 A10 10 0 0 1 40 34",
  "M43 14 A15 15 0 0 1 43 38",
  "M46 10 A20 20 0 0 1 46 42",
] as const;

export const LOCORA_VIEW_W = 52;
export const LOCORA_VIEW_H = 54;
