import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrencyRatesService } from './currency-rates.service';
import { ShopService } from './shop.service';

describe('ShopService.repriceCatalogToCurrency (atomic)', () => {
  const shopId = 'shop-1';

  function buildService(opts?: {
    getRate?: jest.Mock;
    convertAmount?: (amount: number, rate: number) => number;
  }) {
    const rates = new CurrencyRatesService();
    const getRate =
      opts?.getRate ??
      jest.fn().mockResolvedValue({
        rate: 2,
        ratesAt: '2026-07-20T00:00:00.000Z',
      });
    rates.getRate = getRate;
    if (opts?.convertAmount) {
      rates.convertAmount = opts.convertAmount;
    }

    const tx = {
      menuItem: { update: jest.fn().mockResolvedValue({}) },
      resourceRate: { update: jest.fn().mockResolvedValue({}) },
      resourceCategory: { update: jest.fn().mockResolvedValue({}) },
      resource: { update: jest.fn().mockResolvedValue({}) },
      shopOrder: { update: jest.fn(), updateMany: jest.fn() },
      transaction: { update: jest.fn(), updateMany: jest.fn() },
      playSession: { update: jest.fn(), updateMany: jest.fn() },
      shopLoss: { update: jest.fn(), updateMany: jest.fn() },
    };

    const prisma = {
      menuItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'm1', name: 'Coffee', price: new Prisma.Decimal('10') },
          { id: 'm2', name: 'Tea', price: new Prisma.Decimal('5.5') },
        ]),
        update: jest.fn(),
      },
      resourceCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            name: 'Pool',
            offeringConfig: { pricePerHour: 20 },
            rates: [
              {
                id: 'rr1',
                label: 'Hour',
                price: new Prisma.Decimal('8'),
              },
            ],
          },
        ]),
        update: jest.fn(),
      },
      resourceRate: { update: jest.fn() },
      resource: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            name: 'Table 1',
            hourlyRate: new Prisma.Decimal('12'),
          },
          {
            id: 'r0',
            name: 'Free table',
            hourlyRate: new Prisma.Decimal('0'),
          },
        ]),
        update: jest.fn(),
      },
      shopOrder: { update: jest.fn(), updateMany: jest.fn() },
      transaction: { update: jest.fn(), updateMany: jest.fn() },
      playSession: { update: jest.fn(), updateMany: jest.fn() },
      shopLoss: { update: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    const service = new ShopService(
      prisma as never,
      {} as never,
      {} as never,
      rates,
    );

    return { service, prisma, tx, rates, getRate };
  }

  it('applies all catalog price updates inside one $transaction', async () => {
    const { service, prisma, tx } = buildService();

    const result = await (
      service as unknown as {
        repriceCatalogToCurrency: (
          shopId: string,
          from: string,
          to: string,
        ) => Promise<{
          rate: number;
          menuItems: number;
          resourceRates: number;
          resources: number;
          offerings: number;
        }>;
      }
    ).repriceCatalogToCurrency(shopId, 'EUR', 'USD');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.update).toHaveBeenCalledTimes(2);
    expect(tx.resourceRate.update).toHaveBeenCalledTimes(1);
    expect(tx.resourceCategory.update).toHaveBeenCalledTimes(1);
    expect(tx.resource.update).toHaveBeenCalledTimes(1);

    // Direct prisma updates must not be used for catalog writes.
    expect(prisma.menuItem.update).not.toHaveBeenCalled();
    expect(prisma.resourceRate.update).not.toHaveBeenCalled();
    expect(prisma.resourceCategory.update).not.toHaveBeenCalled();
    expect(prisma.resource.update).not.toHaveBeenCalled();

    // Historical money rows must never be rewritten.
    expect(tx.shopOrder.update).not.toHaveBeenCalled();
    expect(tx.shopOrder.updateMany).not.toHaveBeenCalled();
    expect(tx.transaction.update).not.toHaveBeenCalled();
    expect(tx.transaction.updateMany).not.toHaveBeenCalled();
    expect(tx.playSession.update).not.toHaveBeenCalled();
    expect(tx.shopLoss.update).not.toHaveBeenCalled();
    expect(prisma.shopOrder.update).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();

    expect(result).toMatchObject({
      rate: 2,
      menuItems: 2,
      resourceRates: 1,
      resources: 1,
      offerings: 1,
    });
  });

  it('rejects missing FX rates before opening a transaction', async () => {
    const getRate = jest
      .fn()
      .mockRejectedValue(
        new BadRequestException('Exchange rate unavailable for EUR → XXX.'),
      );
    const { service, prisma } = buildService({ getRate });

    await expect(
      (
        service as unknown as {
          repriceCatalogToCurrency: (
            shopId: string,
            from: string,
            to: string,
          ) => Promise<unknown>;
        }
      ).repriceCatalogToCurrency(shopId, 'EUR', 'XXX'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.menuItem.findMany).not.toHaveBeenCalled();
  });

  it('rolls back when any in-transaction update fails', async () => {
    const { service, prisma, tx } = buildService();
    tx.resourceRate.update.mockRejectedValueOnce(new Error('db fail'));

    await expect(
      (
        service as unknown as {
          repriceCatalogToCurrency: (
            shopId: string,
            from: string,
            to: string,
          ) => Promise<unknown>;
        }
      ).repriceCatalogToCurrency(shopId, 'EUR', 'USD'),
    ).rejects.toThrow('db fail');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('ShopService.previewCurrencyChange + confirm gate', () => {
  const shopId = 'shop-1';
  const actor = {
    shopId,
    shopRole: 'OWNER',
    sub: 'u1',
    perms: '',
  } as never;

  function buildService() {
    const rates = new CurrencyRatesService();
    rates.getRate = jest.fn().mockResolvedValue({
      rate: 2,
      ratesAt: '2026-07-20T00:00:00.000Z',
    });

    const tx = {
      menuItem: { update: jest.fn().mockResolvedValue({}) },
      resourceRate: { update: jest.fn().mockResolvedValue({}) },
      resourceCategory: { update: jest.fn().mockResolvedValue({}) },
      resource: { update: jest.fn().mockResolvedValue({}) },
    };

    const shopRow = {
      id: shopId,
      name: 'Venue',
      displayName: null,
      slug: 'venue',
      description: null,
      address: null,
      city: null,
      country: null,
      phone: null,
      email: null,
      coverImage: null,
      locale: 'en',
      timezone: 'UTC',
      currency: 'EUR',
      isPublished: false,
      advertiseOnVenuesPage: false,
      reviewsMode: 'ENABLED' as const,
      floorCount: 1,
    };

    const prisma = {
      shop: {
        findUnique: jest.fn().mockResolvedValue(shopRow),
        update: jest.fn().mockResolvedValue({ ...shopRow, currency: 'USD' }),
      },
      shopTag: { findMany: jest.fn().mockResolvedValue([]) },
      menuItem: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'm1', name: 'Coffee', price: new Prisma.Decimal('10') },
        ]),
        update: jest.fn(),
      },
      resourceCategory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'c1',
            name: 'Pool',
            offeringConfig: null,
            rates: [
              {
                id: 'rr1',
                label: 'Hour',
                price: new Prisma.Decimal('8'),
              },
            ],
          },
        ]),
        update: jest.fn(),
      },
      resourceRate: { update: jest.fn() },
      resource: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            name: 'Table 1',
            hourlyRate: new Prisma.Decimal('12'),
          },
        ]),
        update: jest.fn(),
      },
      shopOrder: { update: jest.fn(), updateMany: jest.fn() },
      transaction: { update: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const notifications = {
      recordTeamEvent: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ShopService(
      prisma as never,
      audit as never,
      notifications as never,
      rates,
    );

    return { service, prisma, tx, rates };
  }

  it('preview returns proposed price table without writing', async () => {
    const { service, prisma, tx } = buildService();

    const preview = await service.previewCurrencyChange(actor, {
      currency: 'USD',
    });

    expect(preview).toMatchObject({
      from: 'EUR',
      to: 'USD',
      rate: 2,
      historicalOrdersUntouched: true,
      summary: {
        menuItems: 1,
        resourceRates: 1,
        resources: 1,
        offerings: 0,
      },
    });
    expect(preview.menuItems[0]).toMatchObject({
      id: 'm1',
      name: 'Coffee',
      priceBefore: 10,
      priceAfter: 20,
    });
    expect(preview.resourceRates[0]).toMatchObject({
      id: 'rr1',
      priceBefore: 8,
      priceAfter: 16,
    });
    expect(preview.resources[0]).toMatchObject({
      id: 'r1',
      hourlyRateBefore: 12,
      hourlyRateAfter: 24,
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.menuItem.update).not.toHaveBeenCalled();
    expect(prisma.shop.update).not.toHaveBeenCalled();
    expect(prisma.shopOrder.update).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it('rejects currency change without confirm: true', async () => {
    const { service, prisma } = buildService();

    await expect(
      service.updateSettings(actor, { currency: 'USD' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.shop.update).not.toHaveBeenCalled();
  });

  it('applies currency change when confirm: true', async () => {
    const { service, prisma, tx } = buildService();

    const result = await service.updateSettings(actor, {
      currency: 'USD',
      confirm: true,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.menuItem.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { price: expect.anything() },
    });
    expect(prisma.shop.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currency: 'USD' }),
      }),
    );
    expect(result.currencyConversion).toMatchObject({
      from: 'EUR',
      to: 'USD',
      rate: 2,
      menuItems: 1,
    });
    expect(prisma.shopOrder.update).not.toHaveBeenCalled();
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });
});
