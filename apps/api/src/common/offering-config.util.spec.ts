import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateCategoryDto,
  ResourceRateDto,
  UpdateCategoryDto,
} from '../modules/resources/dto/resources.dto';
import {
  isNonNegativeMoney,
  isValidOfferingConfig,
  mapOfferingConfigPrices,
  normalizeOfferingConfigPrices,
  OFFERING_CONFIG_SCHEMA_VERSION,
  prepareOfferingConfigForWrite,
  stampOfferingConfigSchemaVersion,
  validateOfferingConfig,
} from './offering-config.util';
import { CreateMenuItemDto } from '../modules/menu/dto/menu.dto';

describe('offering-config.util', () => {
  describe('isNonNegativeMoney', () => {
    it('accepts finite non-negative numbers', () => {
      expect(isNonNegativeMoney(0)).toBe(true);
      expect(isNonNegativeMoney(12.5)).toBe(true);
    });

    it('rejects NaN, Infinity, negatives, non-money', () => {
      expect(isNonNegativeMoney(Number.NaN)).toBe(false);
      expect(isNonNegativeMoney(Number.POSITIVE_INFINITY)).toBe(false);
      expect(isNonNegativeMoney(-1)).toBe(false);
      expect(isNonNegativeMoney('nope')).toBe(false);
      expect(isNonNegativeMoney({})).toBe(false);
    });

    it('allows null only when requested', () => {
      expect(isNonNegativeMoney(null)).toBe(false);
      expect(isNonNegativeMoney(null, true)).toBe(true);
    });
    it('accepts decimal string price fields', () => {
      expect(isNonNegativeMoney('12.5000')).toBe(true);
      expect(isNonNegativeMoney('0')).toBe(true);
      expect(isNonNegativeMoney('-1')).toBe(false);
    });
  });

  describe('validateOfferingConfig', () => {
    it('accepts nullish and empty object', () => {
      expect(validateOfferingConfig(null)).toBeNull();
      expect(validateOfferingConfig(undefined)).toBeNull();
      expect(validateOfferingConfig({})).toBeNull();
    });

    it('rejects arrays and non-objects', () => {
      expect(validateOfferingConfig([])).toMatch(/plain object/);
      expect(validateOfferingConfig('nope')).toMatch(/plain object/);
    });

    it('accepts dining-style config with noShowMinutes', () => {
      expect(
        validateOfferingConfig({ noShowMinutes: 30 }),
      ).toBeNull();
    });

    it('accepts schemaVersion 1 and rejects unsupported versions', () => {
      expect(
        validateOfferingConfig({
          schemaVersion: OFFERING_CONFIG_SCHEMA_VERSION,
          noShowMinutes: 30,
        }),
      ).toBeNull();
      expect(validateOfferingConfig({ schemaVersion: 2 })).toMatch(
        /schemaVersion/,
      );
      expect(validateOfferingConfig({ schemaVersion: 1.5 })).toMatch(
        /schemaVersion/,
      );
      expect(validateOfferingConfig({ schemaVersion: '1' })).toMatch(
        /schemaVersion/,
      );
    });

    it('rejects invalid noShowMinutes', () => {
      expect(validateOfferingConfig({ noShowMinutes: 2 })).toMatch(
        /noShowMinutes/,
      );
      expect(validateOfferingConfig({ noShowMinutes: 200 })).toMatch(
        /noShowMinutes/,
      );
      expect(validateOfferingConfig({ noShowMinutes: 30.5 })).toMatch(
        /noShowMinutes/,
      );
      expect(validateOfferingConfig({ noShowMinutes: Number.NaN })).toMatch(
        /noShowMinutes/,
      );
    });

    it('accepts valid bowlingModes payload', () => {
      const config = {
        noShowMinutes: 30,
        bowlingModes: [
          {
            id: 'bm_1',
            name: 'Lane · time slot',
            chargeType: 'TIME',
            slotMinutes: 60,
            pricePerPerson: null,
            pricePerGame: null,
            defaultGames: 1,
            minutesPerGame: 60,
            minPlayers: 1,
            maxPlayers: 6,
            rates: [{ label: 'Per hour', durationMinutes: 60, price: 40 }],
          },
          {
            id: 'bm_2',
            name: 'By game',
            chargeType: 'GAME',
            slotMinutes: 60,
            pricePerGame: 12.5,
            pricePerPerson: null,
            defaultGames: 2,
            minutesPerGame: 15,
            minPlayers: 1,
            maxPlayers: 6,
            rates: [],
          },
        ],
      };
      expect(validateOfferingConfig(config)).toBeNull();
      expect(isValidOfferingConfig(config)).toBe(true);
    });

    it('accepts string decimal prices in offeringConfig', () => {
      expect(
        validateOfferingConfig({
          pricePerHour: '10.5000',
          bowlingModes: [
            {
              chargeType: 'TIME',
              rates: [{ label: 'Block', price: '40.0000' }],
            },
          ],
        }),
      ).toBeNull();
    });

    it('rejects garbage price fields', () => {
      expect(
        validateOfferingConfig({ pricePerGame: -5 }),
      ).toMatch(/pricePerGame/);
      expect(
        validateOfferingConfig({ pricePerHour: Number.POSITIVE_INFINITY }),
      ).toMatch(/pricePerHour/);
      expect(
        validateOfferingConfig({ hourlyRate: Number.NaN }),
      ).toMatch(/hourlyRate/);
      expect(
        validateOfferingConfig({ basePrice: 'nope' }),
      ).toMatch(/basePrice/);
    });

    it('rejects invalid bowlingModes shape', () => {
      expect(
        validateOfferingConfig({ bowlingModes: { not: 'array' } }),
      ).toMatch(/bowlingModes must be an array/);
      expect(
        validateOfferingConfig({
          bowlingModes: [{ chargeType: 'MIXED', rates: [] }],
        }),
      ).toMatch(/chargeType/);
      expect(
        validateOfferingConfig({
          bowlingModes: [
            {
              chargeType: 'TIME',
              rates: [{ label: 'Bad', price: -1 }],
            },
          ],
        }),
      ).toMatch(/price/);
      expect(
        validateOfferingConfig({
          bowlingModes: [
            {
              chargeType: 'TIME',
              rates: [{ label: 'Missing price' }],
            },
          ],
        }),
      ).toMatch(/price is required/);
    });

    it('accepts legacy top-level price fields', () => {
      expect(
        validateOfferingConfig({
          pricePerPerson: 8,
          pricePerGame: null,
          defaultGames: 1,
          minPlayers: 1,
          maxPlayers: 6,
        }),
      ).toBeNull();
    });
  });

  describe('normalizeOfferingConfigPrices', () => {
    it('normalizes known price keys to 4dp decimal strings', () => {
      const raw = {
        pricePerHour: 10.999,
        bowlingModes: [
          {
            chargeType: 'TIME',
            pricePerPerson: 5.555,
            rates: [{ label: 'Block', price: 1.234 }],
          },
        ],
      };
      const next = normalizeOfferingConfigPrices(raw) as {
        pricePerHour: string;
        bowlingModes: Array<{
          pricePerPerson: string;
          rates: Array<{ price: string }>;
        }>;
      };
      expect(next).not.toBe(raw);
      expect(next.pricePerHour).toBe('10.9990');
      expect(next.bowlingModes[0].pricePerPerson).toBe('5.5550');
      expect(next.bowlingModes[0].rates[0].price).toBe('1.2340');
    });

    it('returns same reference when already 4dp strings', () => {
      const raw = { pricePerGame: '12.5000' };
      expect(normalizeOfferingConfigPrices(raw)).toBe(raw);
    });

    it('mapOfferingConfigPrices scales via callback', () => {
      const raw = { hourlyRate: 10, nested: { price: 2 } };
      const next = mapOfferingConfigPrices(raw, (n) =>
        typeof n === 'number' ? n * 2 : Number(n) * 2,
      ) as typeof raw;
      expect(next.hourlyRate).toBe(20);
      expect(next.nested.price).toBe(4);
    });
  });

  describe('schemaVersion Phase 0', () => {
    it('stampOfferingConfigSchemaVersion injects version 1 when absent', () => {
      const stamped = stampOfferingConfigSchemaVersion({
        noShowMinutes: 30,
      }) as { schemaVersion: number; noShowMinutes: number };
      expect(stamped.schemaVersion).toBe(1);
      expect(stamped.noShowMinutes).toBe(30);
    });

    it('stamp leaves explicit schemaVersion untouched', () => {
      const raw = { schemaVersion: 2, pricePerHour: 10 };
      expect(stampOfferingConfigSchemaVersion(raw)).toBe(raw);
    });

    it('prepareOfferingConfigForWrite stamps + normalizes prices', () => {
      const next = prepareOfferingConfigForWrite({
        pricePerHour: 10.5,
      }) as { schemaVersion: number; pricePerHour: string };
      expect(next.schemaVersion).toBe(OFFERING_CONFIG_SCHEMA_VERSION);
      expect(next.pricePerHour).toBe('10.5000');
    });

    it('prepare returns nullish unchanged', () => {
      expect(prepareOfferingConfigForWrite(null)).toBeNull();
      expect(prepareOfferingConfigForWrite(undefined)).toBeUndefined();
    });
  });

  describe('DTO integration', () => {
    it('CreateCategoryDto accepts valid offeringConfig', async () => {
      const dto = plainToInstance(CreateCategoryDto, {
        type: 'BOWLING',
        name: 'Lanes',
        offeringConfig: {
          noShowMinutes: 30,
          bowlingModes: [
            {
              chargeType: 'PERSON',
              pricePerPerson: 10,
              rates: [],
            },
          ],
        },
        rates: [{ label: 'Hour', durationMinutes: 60, price: 40 }],
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('CreateCategoryDto rejects garbage offeringConfig', async () => {
      const dto = plainToInstance(CreateCategoryDto, {
        type: 'PC',
        name: 'Arena',
        offeringConfig: { pricePerHour: -1 },
      });
      const errors = await validate(dto);
      const offering = errors.find((e) => e.property === 'offeringConfig');
      expect(offering).toBeDefined();
    });

    it('UpdateCategoryDto rejects non-object offeringConfig', async () => {
      const dto = plainToInstance(UpdateCategoryDto, {
        offeringConfig: ['not', 'an', 'object'],
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'offeringConfig')).toBe(true);
    });

    it('ResourceRateDto rejects non-finite price', async () => {
      const dto = plainToInstance(ResourceRateDto, {
        label: 'Hour',
        price: Number.NaN,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'price')).toBe(true);
    });

    it('CreateMenuItemDto rejects negative price', async () => {
      const dto = plainToInstance(CreateMenuItemDto, {
        name: 'Fries',
        price: -2,
      });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'price')).toBe(true);
    });
  });
});
