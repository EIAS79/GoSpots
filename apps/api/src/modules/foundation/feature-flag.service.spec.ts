import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import { FeatureFlagService } from './feature-flag.service';

describe('FeatureFlagService', () => {
  function service(rows: Record<string, boolean | undefined>) {
    const prisma = {
      shopFeatureFlag: {
        findUnique: jest.fn(({ where }) => {
          const key = `${where.shopId_feature.shopId}:${where.shopId_feature.feature}`;
          const enabled = rows[key];
          return Promise.resolve(
            enabled === undefined ? null : { enabled },
          );
        }),
      },
    } as unknown as PrismaService;
    const config = {
      get: jest.fn((key: string) =>
        key === 'NODE_ENV' ? 'production' : undefined,
      ),
    } as unknown as ConfigService;
    return new FeatureFlagService(prisma, config);
  }

  it('keeps explicit feature overrides isolated by Shop', async () => {
    const flags = service({
      'shop-a:checkout_v2': true,
      'shop-b:checkout_v2': false,
    });

    await expect(flags.isFeatureEnabled('shop-a', 'checkout_v2')).resolves.toBe(
      true,
    );
    await expect(flags.isFeatureEnabled('shop-b', 'checkout_v2')).resolves.toBe(
      false,
    );
  });

  it('defaults Checkout V2 to enabled when no Shop override exists', async () => {
    await expect(
      service({}).isFeatureEnabled('shop-a', 'checkout_v2'),
    ).resolves.toBe(true);
  });

  it('makes Chunk 04 checkout split a product default with an explicit Shop kill switch', async () => {
    await expect(
      service({}).isFeatureEnabled('shop-a', 'checkout_split'),
    ).resolves.toBe(true);
    await expect(
      service({ 'shop-a:checkout_split': false }).isFeatureEnabled(
        'shop-a',
        'checkout_split',
      ),
    ).resolves.toBe(false);
    await expect(
      service({ 'shop-a:checkout_split': false }).isFeatureEnabled(
        'shop-b',
        'checkout_split',
      ),
    ).resolves.toBe(true);
  });

  it('makes Chunk 05 cash sessions a product default with an isolated Shop kill switch', async () => {
    await expect(
      service({}).isFeatureEnabled('shop-a', 'cash_sessions'),
    ).resolves.toBe(true);
    const flags = service({ 'shop-a:cash_sessions': false });
    await expect(flags.isFeatureEnabled('shop-a', 'cash_sessions')).resolves.toBe(
      false,
    );
    await expect(flags.isFeatureEnabled('shop-b', 'cash_sessions')).resolves.toBe(
      true,
    );
  });

  it('still defaults non-product rollout flags to disabled in production', async () => {
    await expect(
      service({}).isFeatureEnabled('shop-a', 'payments_v1'),
    ).resolves.toBe(false);
  });
});
