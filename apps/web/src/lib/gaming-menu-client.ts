import { api } from "./api";
import type { BookingUnitKind } from "./booking-unit-kind";
import type { GamingSectionSummary } from "./gaming-layout-client";
import type { BookingMode } from "./resources-client";
import type { ResourceType } from "./resource-types";
import type { MoneyWire } from "./money";

export type GamingRate = {
  id: string;
  label: string;
  durationMinutes: number | null;
  price: MoneyWire;
  sortOrder: number;
};

export type GamingOffering = {
  id: string;
  type: ResourceType;
  bookingMode: BookingMode;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageUrl2: string | null;
  slotMinutes: number;
  sortOrder: number;
  playstationGames: string[];
  offeringConfig: Record<string, unknown> | null;
  unitKind: BookingUnitKind;
  unitLabels: {
    singular: string;
    plural: string;
    selectLabel: string;
    countLabel: string;
    createCountLabel: string;
  };
  rates: GamingRate[];
  sections: GamingSectionSummary[];
  inventory: {
    total: number;
    availableNow: number;
    reservedNow: number;
    inUseNow: number;
    maintenance: number;
  };
};

export type GamingMenuResponse = {
  offerings: GamingOffering[];
  availableToAdd: ResourceType[];
};

export function fetchGamingMenu() {
  return api<GamingMenuResponse>("/resources/gaming-menu");
}

/** Minutes for a full-day pass (24h) — staff can also leave duration empty for flat rates. */
export const FULL_DAY_DURATION_MINUTES = 24 * 60;

export const GAMING_PRICE_PRESETS: {
  label: string;
  durationMinutes: number | null;
}[] = [
  { label: "Per hour", durationMinutes: 60 },
  { label: "30 minutes", durationMinutes: 30 },
  { label: "45 minutes", durationMinutes: 45 },
  { label: "90 minutes", durationMinutes: 90 },
  { label: "Full day", durationMinutes: FULL_DAY_DURATION_MINUTES },
  { label: "Flat rate", durationMinutes: null },
];

/** How to show duration on price chips (menu cards, public, etc.). */
export function formatGamingRateDuration(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return "";
  if (minutes >= FULL_DAY_DURATION_MINUTES) return " · full day";
  if (minutes % 60 === 0 && minutes >= 60) return ` · ${minutes / 60}h`;
  return ` · ${minutes}m`;
}
