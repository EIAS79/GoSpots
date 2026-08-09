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

  it('keeps feature rollout isolated by Shop', async () => {
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

  it('defaults a missing production override to disabled', async () => {
    await expect(
      service({}).isFeatureEnabled('shop-a', 'payments_v1'),
    ).resolves.toBe(false);
  });
});
