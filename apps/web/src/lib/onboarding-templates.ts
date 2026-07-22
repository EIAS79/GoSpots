import type { BookingMode } from "./resources-client";
import type { ResourceType } from "./resource-types";

export type OnboardingTemplateId =
  | "billiard_hall"
  | "console_lounge"
  | "pc_cafe"
  | "bowling_center"
  | "mixed_activity";

export type TemplateCategorySeed = {
  type: ResourceType;
  name: string;
  unitCount: number;
  unitNamePrefix: string;
  bookingMode?: BookingMode;
  slotMinutes?: number;
  rates: { label: string; durationMinutes?: number; price: number }[];
  offeringConfig?: Record<string, unknown>;
};

export type OnboardingTemplate = {
  id: OnboardingTemplateId;
  /** Suggested pack — templates do not change subscription pack. */
  packId: "gaming" | "mixed";
  categorySlugs: string[];
  categories: TemplateCategorySeed[];
};

/** Five guided seed bundles (bible #31) — applied via existing resource APIs. */
export const ONBOARDING_TEMPLATES: OnboardingTemplate[] = [
  {
    id: "billiard_hall",
    packId: "gaming",
    categorySlugs: ["billiard-hall"],
    categories: [
      {
        type: "BILLIARD",
        name: "Billiard tables",
        unitCount: 6,
        unitNamePrefix: "Table",
        bookingMode: "TIME",
        slotMinutes: 60,
        rates: [{ label: "Hourly", durationMinutes: 60, price: 12 }],
        offeringConfig: { schemaVersion: 1, pricePerHour: 12 },
      },
      {
        type: "PC",
        name: "Counter station",
        unitCount: 1,
        unitNamePrefix: "Counter",
        bookingMode: "TIME",
        slotMinutes: 60,
        rates: [{ label: "Hourly", durationMinutes: 60, price: 8 }],
        offeringConfig: { schemaVersion: 1, pricePerHour: 8 },
      },
    ],
  },
  {
    id: "console_lounge",
    packId: "gaming",
    categorySlugs: ["gaming-lounge"],
    categories: [
      {
        type: "PLAYSTATION",
        name: "PlayStation",
        unitCount: 4,
        unitNamePrefix: "PS",
        bookingMode: "TIME",
        slotMinutes: 60,
        rates: [{ label: "Hourly", durationMinutes: 60, price: 15 }],
        offeringConfig: { schemaVersion: 1, pricePerHour: 15 },
      },
      {
        type: "PC",
        name: "PC stations",
        unitCount: 2,
        unitNamePrefix: "PC",
        bookingMode: "TIME",
        slotMinutes: 60,
        rates: [{ label: "Hourly", durationMinutes: 60, price: 12 }],
        offeringConfig: { schemaVersion: 1, pricePerHour: 12 },
      },
      {
        type: "FOOSBALL",
        name: "Foosball",
        unitCount: 1,
        unitNamePrefix: "Foosball",
        bookingMode: "GAME",
        rates: [{ label: "Session", durationMinutes: 30, price: 5 }],
        offeringConfig: { schemaVersion: 1, pricePerGame: 5 },
      },
    ],
  },
  {
    id: "pc_cafe",
    packId: "gaming",
    categorySlugs: ["gaming-center", "esports-cafe"],
    categories: [
      {
        type: "PC",
        name: "PC stations",
        unitCount: 12,
        unitNamePrefix: "PC",
        bookingMode: "TIME",
        slotMinutes: 60,
        rates: [{ label: "Hourly", durationMinutes: 60, price: 10 }],
        offeringConfig: { schemaVersion: 1, pricePerHour: 10 },
      },
    ],
  },
  {
    id: "bowling_center",
    packId: "gaming",
    categorySlugs: ["bowling"],
    categories: [
      {
        type: "BOWLING",
        name: "Bowling lanes",
        unitCount: 4,
        unitNamePrefix: "Lane",
        bookingMode: "MIXED",
        slotMinutes: 60,
        rates: [{ label: "Hourly", durationMinutes: 60, price: 40 }],
        offeringConfig: {
          schemaVersion: 1,
          pricePerHour: 40,
          bowlingModes: [
            {
              name: "Lane hourly",
              chargeType: "TIME",
              slotMinutes: 60,
              rates: [{ label: "Hourly", durationMinutes: 60, price: 40 }],
            },
          ],
        },
      },
    ],
  },
  {
    id: "mixed_activity",
    packId: "mixed",
    categorySlugs: ["gaming-lounge", "billiard-hall", "arcade"],
    categories: [
      {
        type: "BILLIARD",
        name: "Billiard",
        unitCount: 2,
        unitNamePrefix: "Table",
        bookingMode: "TIME",
        slotMinutes: 60,
        rates: [{ label: "Hourly", durationMinutes: 60, price: 12 }],
        offeringConfig: { schemaVersion: 1, pricePerHour: 12 },
      },
      {
        type: "PLAYSTATION",
        name: "Consoles",
        unitCount: 2,
        unitNamePrefix: "PS",
        bookingMode: "TIME",
        slotMinutes: 60,
        rates: [{ label: "Hourly", durationMinutes: 60, price: 15 }],
        offeringConfig: { schemaVersion: 1, pricePerHour: 15 },
      },
      {
        type: "ARCADE",
        name: "Arcade",
        unitCount: 2,
        unitNamePrefix: "Arcade",
        bookingMode: "GAME",
        rates: [{ label: "Game", price: 3 }],
        offeringConfig: { schemaVersion: 1, pricePerGame: 3 },
      },
      // Dining tables use section/table-group APIs — add from Dining layout after setup.
    ],
  },
];

export function getOnboardingTemplate(
  id: string | null | undefined,
): OnboardingTemplate | null {
  if (!id) return null;
  return ONBOARDING_TEMPLATES.find((t) => t.id === id) ?? null;
}
