import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  marketAdjustedCatalogEur,
  monthlyTotal,
  serializeAddOns,
} from '../../common/venue-packs';
import { BillingCatalogService } from './billing-catalog.service';

describe('BillingCatalogService', () => {
  const rates = {
    getRate: jest.fn().mockResolvedValue({
      rate: 1,
      ratesAt: '2026-08-03T00:00:00.000Z',
    }),
    convertAmount: jest.fn((amount: number, rate: number) => amount * rate),
  };

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'STRIPE_PRICE_MAP') return undefined;
      return undefined;
    }),
  } as unknown as ConfigService;

  const svc = new BillingCatalogService(config, rates as never);

  beforeEach(() => {
    rates.getRate.mockClear();
    rates.convertAmount.mockClear();
  });

  it('rejects unknown pack id', async () => {
    await expect(
      svc.quote({
        packId: 'not_a_real_pack',
        addOnIds: ['gaming_suite'],
        currency: 'EUR',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      svc.quote({
        packId: 'not_a_real_pack',
        addOnIds: [],
        currency: 'EUR',
      }),
    ).rejects.toThrow(/Unknown pack id/);
  });

  it('rejects unknown add-on id', async () => {
    await expect(
      svc.quote({
        packId: 'gaming',
        addOnIds: ['gaming_suite', 'not_an_addon'],
        currency: 'EUR',
      }),
    ).rejects.toThrow(/Unknown add-on id/);
  });

  it('computes amount server-side from venue-packs (no client prices)', async () => {
    const addOnIds = ['gaming_suite', 'ops_alerts'] as const;
    const quote = await svc.quote({
      packId: 'gaming',
      addOnIds: [...addOnIds],
      seatQuantity: 0,
      currency: 'EUR',
    });

    const expectedEur = marketAdjustedCatalogEur(
      monthlyTotal('gaming', serializeAddOns([...addOnIds]), 0),
      'EUR',
    );

    // gaming_suite (12) + ops_alerts (5) = 17 EUR before PPP (EUR factor 1)
    expect(expectedEur).toBe(17);
    expect(quote.packId).toBe('gaming');
    expect(quote.currency).toBe('EUR');
    expect(quote.amountEur).toBe(expectedEur);
    expect(quote.amount).toBe(expectedEur);
    expect(quote.amountMinor).toBe(1700);
    expect(rates.getRate).toHaveBeenCalledWith('EUR', 'EUR', {
      forceRefresh: true,
    });
  });

  it('prices team_accounts per seat and requires seatQuantity >= 1', async () => {
    await expect(
      svc.quote({
        packId: 'gaming',
        addOnIds: ['team_accounts'],
        seatQuantity: 0,
        currency: 'EUR',
      }),
    ).rejects.toThrow(/seatQuantity/);

    const quote = await svc.quote({
      packId: 'gaming',
      addOnIds: ['team_accounts'],
      seatQuantity: 3,
      currency: 'EUR',
    });

    const expectedEur = marketAdjustedCatalogEur(
      monthlyTotal('gaming', serializeAddOns(['team_accounts']), 3),
      'EUR',
    );
    expect(quote.amountEur).toBe(expectedEur);
    expect(quote.seatQuantity).toBe(3);
    const seatLine = quote.lineItems.find((l) => l.kind === 'seat');
    expect(seatLine?.quantity).toBe(3);
  });
});
