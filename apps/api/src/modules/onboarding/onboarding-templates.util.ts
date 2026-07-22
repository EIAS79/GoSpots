import { BookingMode, ResourceType } from '@prisma/client';

export type OnboardingTemplateId =
  | 'billiard_hall'
  | 'console_lounge'
  | 'pc_cafe'
  | 'bowling_center'
  | 'mixed_activity';

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
  packId: 'gaming' | 'mixed';
  categorySlugs: string[];
  categories: TemplateCategorySeed[];
};

/** Five guided seed bundles — mirrors `apps/web/src/lib/onboarding-templates.ts`. */
export const ONBOARDING_TEMPLATES: OnboardingTemplate[] = [
  {
    id: 'billiard_hall',
    packId: 'gaming',
    categorySlugs: ['billiard-hall'],
    categories: [
      {
        type: ResourceType.BILLIARD,
        name: 'Billiard tables',
        unitCount: 6,
        unitNamePrefix: 'Table',
        bookingMode: BookingMode.TIME,
        slotMinutes: 60,
        rates: [{ label: 'Hourly', durationMinutes: 60, price: 12 }],
        offeringConfig: { schemaVersion: 1, pricePerHour: 12 },
      },
      {
        type: ResourceType.PC,
        name: 'Counter station',
        unitCount: 1,
        unitNamePrefix: 'Counter',
        bookingMode: BookingMode.TIME,
        slotMinutes: 60,
        rates: [{ label: 'Hourly', durationMinutes: 60, price: 8 }],
        offeringConfig: { schemaVersion: 1, pricePerHour: 8 },
      },
    ],
  },
  {
    id: 'console_lounge',
    packId: 'gaming',
    categorySlugs: ['gaming-lounge'],
    categories: [
      {
        type: ResourceType.PLAYSTATION,
        name: 'PlayStation',
        unitCount: 4,
        unitNamePrefix: 'PS',
        bookingMode: BookingMode.TIME,
        slotMinutes: 60,
        rates: [{ label: 'Hourly', durationMinutes: 60, price: 15 }],
        offeringConfig: { schemaVersion: 1, pricePerHour: 15 },
      },
      {
        type: ResourceType.PC,
        name: 'PC stations',
        unitCount: 2,
        unitNamePrefix: 'PC',
        bookingMode: BookingMode.TIME,
        slotMinutes: 60,
        rates: [{ label: 'Hourly', durationMinutes: 60, price: 12 }],
        offeringConfig: { schemaVersion: 1, pricePerHour: 12 },
      },
      {
        type: ResourceType.FOOSBALL,
        name: 'Foosball',
        unitCount: 1,
        unitNamePrefix: 'Foosball',
        bookingMode: BookingMode.GAME,
        rates: [{ label: 'Session', durationMinutes: 30, price: 5 }],
        offeringConfig: { schemaVersion: 1, pricePerGame: 5 },
      },
    ],
  },
  {
    id: 'pc_cafe',
    packId: 'gaming',
    categorySlugs: ['gaming-center', 'esports-cafe'],
    categories: [
      {
        type: ResourceType.PC,
        name: 'PC stations',
        unitCount: 12,
        unitNamePrefix: 'PC',
        bookingMode: BookingMode.TIME,
        slotMinutes: 60,
        rates: [{ label: 'Hourly', durationMinutes: 60, price: 10 }],
        offeringConfig: { schemaVersion: 1, pricePerHour: 10 },
      },
    ],
  },
  {
    id: 'bowling_center',
    packId: 'gaming',
    categorySlugs: ['bowling'],
    categories: [
      {
        type: ResourceType.BOWLING,
        name: 'Bowling lanes',
        unitCount: 4,
        unitNamePrefix: 'Lane',
        bookingMode: BookingMode.MIXED,
        slotMinutes: 60,
        rates: [{ label: 'Hourly', durationMinutes: 60, price: 40 }],
        offeringConfig: {
          schemaVersion: 1,
          pricePerHour: 40,
          bowlingModes: [
            {
              name: 'Lane hourly',
              chargeType: 'TIME',
              slotMinutes: 60,
              rates: [{ label: 'Hourly', durationMinutes: 60, price: 40 }],
            },
          ],
        },
      },
    ],
  },
  {
    id: 'mixed_activity',
    packId: 'mixed',
    categorySlugs: ['gaming-lounge', 'billiard-hall', 'arcade'],
    categories: [
      {
        type: ResourceType.BILLIARD,
        name: 'Billiard',
        unitCount: 2,
        unitNamePrefix: 'Table',
        bookingMode: BookingMode.TIME,
        slotMinutes: 60,
        rates: [{ label: 'Hourly', durationMinutes: 60, price: 12 }],
        offeringConfig: { schemaVersion: 1, pricePerHour: 12 },
      },
      {
        type: ResourceType.PLAYSTATION,
        name: 'Consoles',
        unitCount: 2,
        unitNamePrefix: 'PS',
        bookingMode: BookingMode.TIME,
        slotMinutes: 60,
        rates: [{ label: 'Hourly', durationMinutes: 60, price: 15 }],
        offeringConfig: { schemaVersion: 1, pricePerHour: 15 },
      },
      {
        type: ResourceType.ARCADE,
        name: 'Arcade',
        unitCount: 2,
        unitNamePrefix: 'Arcade',
        bookingMode: BookingMode.GAME,
        rates: [{ label: 'Game', price: 3 }],
        offeringConfig: { schemaVersion: 1, pricePerGame: 3 },
      },
    ],
  },
];

export function getOnboardingTemplate(
  id: string | null | undefined,
): OnboardingTemplate | null {
  if (!id) return null;
  return ONBOARDING_TEMPLATES.find((t) => t.id === id) ?? null;
}
