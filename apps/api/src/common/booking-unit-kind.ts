import type { BookingMode, ResourceType } from '@prisma/client';

/** How a game category is booked and shown on the floor schedule. */
export type BookingUnitKind = 'SEAT' | 'TABLE' | 'LANE' | 'UNIT';

/** Primary game types supported in v1 (more can be added later). */
export const FEATURED_GAME_TYPES: ResourceType[] = [
  'PC',
  'PLAYSTATION',
  'BILLIARD',
  'BOWLING',
  'TABLE_TENNIS',
  'FOOSBALL',
  'ARCADE',
];

/** Restaurant / dining floor — one category per venue, layout like gaming. */
export const DINING_TYPES: ResourceType[] = ['DINING'];

export const MENU_OFFERING_TYPES: ResourceType[] = [
  ...FEATURED_GAME_TYPES,
  ...DINING_TYPES,
];

const GAMES_NOTE_RE = /(\d+)\s*games?\b/i;

import {
  bookingCollectsPartySizeFromContext,
  effectiveBillingPartySizeFromContext,
} from './bowling-modes.util';

export function parseBowlingChargeFromNotes(
  notes?: string | null,
): Exclude<BookingMode, 'MIXED'> | null {
  if (!notes) return null;
  if (/per person/i.test(notes)) return 'PERSON';
  if (/\[Bowling · \d+ game/i.test(notes) || GAMES_NOTE_RE.test(notes)) {
    return 'GAME';
  }
  if (/time slot/i.test(notes)) return 'TIME';
  return null;
}

function resolveBowlingChargeMode(
  bookingMode: BookingMode | null | undefined,
  notes?: string | null,
): Exclude<BookingMode, 'MIXED'> {
  if (bookingMode === 'MIXED') {
    return parseBowlingChargeFromNotes(notes) ?? 'TIME';
  }
  return (bookingMode ?? 'TIME') as Exclude<BookingMode, 'MIXED'>;
}

/** PC/PS and billiard: per station/table + time. Bowling: players only when priced per person. */
export function bookingCollectsPartySize(
  type: ResourceType,
  opts?: {
    bookingMode?: BookingMode | null;
    notes?: string | null;
    offeringConfig?: unknown;
    categoryRates?: {
      label: string;
      durationMinutes: number | null;
      price: number;
    }[];
    slotMinutes?: number;
  },
): boolean {
  if (type !== 'BOWLING') return false;
  return bookingCollectsPartySizeFromContext(type, {
    bookingMode: opts?.bookingMode,
    notes: opts?.notes,
    offeringConfig: opts?.offeringConfig,
    categoryRates: opts?.categoryRates,
    slotMinutes: opts?.slotMinutes,
  });
}

export function effectiveBillingPartySize(
  type: ResourceType,
  partySize: number,
  opts?: {
    bookingMode?: BookingMode | null;
    notes?: string | null;
    offeringConfig?: unknown;
    categoryRates?: {
      label: string;
      durationMinutes: number | null;
      price: number;
    }[];
    slotMinutes?: number;
  },
): number {
  return effectiveBillingPartySizeFromContext(type, partySize, {
    bookingMode: opts?.bookingMode,
    notes: opts?.notes,
    offeringConfig: opts?.offeringConfig,
    categoryRates: opts?.categoryRates,
    slotMinutes: opts?.slotMinutes,
  });
}

export function getBookingUnitKind(type: ResourceType): BookingUnitKind {
  switch (type) {
    case 'PC':
    case 'PLAYSTATION':
      return 'SEAT';
    case 'BILLIARD':
    case 'SNOOKER':
    case 'POOL':
    case 'TABLE_TENNIS':
    case 'FOOSBALL':
      return 'TABLE';
    case 'BOWLING':
      return 'LANE';
    case 'DINING':
      return 'TABLE';
    case 'ARCADE':
      return 'SEAT';
    default:
      return 'UNIT';
  }
}

export function getBookingUnitLabels(kind: BookingUnitKind) {
  switch (kind) {
    case 'SEAT':
      return {
        singular: 'seat',
        plural: 'seats',
        selectLabel: 'Seat',
        countLabel: 'Players',
        createCountLabel: 'How many seats to create',
      };
    case 'TABLE':
      return {
        singular: 'table',
        plural: 'tables',
        selectLabel: 'Table',
        countLabel: 'Players',
        createCountLabel: 'How many tables to create',
      };
    case 'LANE':
      return {
        singular: 'lane',
        plural: 'lanes',
        selectLabel: 'Lane',
        countLabel: 'Players',
        createCountLabel: 'How many lanes to create',
      };
    default:
      return {
        singular: 'unit',
        plural: 'units',
        selectLabel: 'Unit',
        countLabel: 'Party size',
        createCountLabel: 'How many units to create',
      };
  }
}

export function defaultUnitNamePrefix(
  type: ResourceType,
  categoryName?: string,
): string {
  const kind = getBookingUnitKind(type);
  if (kind === 'SEAT') {
    if (type === 'PLAYSTATION') return 'Station';
    if (type === 'ARCADE') return 'Cabinet';
    return 'Seat';
  }
  if (kind === 'TABLE') return 'Table';
  if (kind === 'LANE') return 'Lane';
  return categoryName?.trim() || 'Unit';
}

export function featuredTypeSortIndex(type: ResourceType): number {
  const i = FEATURED_GAME_TYPES.indexOf(type);
  return i === -1 ? 100 : i;
}
