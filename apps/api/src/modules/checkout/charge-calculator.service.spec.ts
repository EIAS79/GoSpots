import { Prisma } from '@prisma/client';
import type { PlayBillingService } from '../finance/play-billing.service';
import {
  ChargeCalculatorService,
  type CheckoutSourceCheck,
} from './charge-calculator.service';

const NOW = new Date('2026-08-09T20:00:00.000Z');

function baseCheck(): CheckoutSourceCheck {
  return {
    id: 'check-1',
    shopId: 'shop-a',
    version: 7,
    status: 'OPEN',
    currency: 'PLN',
    shop: { currency: 'PLN' },
    shopOrders: [],
    playSessions: [],
    reservations: [],
  };
}

function calculator(reservationAmount = '30.0000', reservationBase = '30.0000') {
  const playBilling = {
    mapPlayBillingRow: jest.fn((reservation: any) => {
      if (!reservation.resource) return null;
      return {
        id: reservation.id,
        source: 'booking',
        guestName: reservation.guestName,
        partySize: reservation.partySize,
        startsAt: reservation.startsAt.toISOString(),
        endsAt: reservation.endsAt.toISOString(),
        status: reservation.status,
        billedAmount: reservation.billedAmount?.toString() ?? null,
        billedAt: reservation.billedAt?.toISOString() ?? null,
        currency: reservation.currency,
        discountPercent: reservation.billingDiscountPercent,
        notes: reservation.notes,
        bucket: 'awaiting_payment',
        isPaid: reservation.billedAt != null,
        resource: {
          id: reservation.resource.id,
          name: reservation.resource.name,
          type: reservation.resource.type,
          categoryName: reservation.resource.category?.name ?? null,
        },
        durationMinutes: 60,
        computedAmount: reservationBase,
        baseAmount: reservationBase,
        amountDue: reservationAmount,
        rateLabel: 'Existing rate',
        breakdown: 'Existing billing calculation',
        collectsPartySize: false,
      };
    }),
  } as unknown as PlayBillingService;
  return new ChargeCalculatorService(playBilling);
}

function reservation() {
  return {
    id: 'res-1',
    status: 'CONFIRMED',
    guestName: 'Reservation guest',
    partySize: 2,
    startsAt: new Date('2026-08-09T19:00:00.000Z'),
    endsAt: new Date('2026-08-09T21:00:00.000Z'),
    billedAmount: null,
    billingBaseAmount: null,
    billingDiscountPercent: 10,
    billedAt: null,
    currency: 'PLN',
    resourceId: 'resource-1',
    notes: null,
    resource: {
      id: 'resource-1',
      name: 'Table 1',
      type: 'BILLIARDS',
      hourlyRate: new Prisma.Decimal('30'),
      category: {
        id: 'category-1',
        name: 'Billiards',
        slotMinutes: 60,
        bookingMode: 'TIME' as const,
        offeringConfig: null,
        rates: [],
      },
    },
  };
}

describe('ChargeCalculatorService', () => {
  it('calculates a session-only check with the existing unpaid discount', () => {
    const check = baseCheck();
    check.playSessions.push({
      id: 'play-1',
      status: 'ACTIVE',
      label: 'Pool table',
      amount: new Prisma.Decimal('100.0000'),
      currency: 'PLN',
      billingDiscountPercent: 10,
      completedAt: null,
      reservationId: null,
    });

    const result = calculator().serialize(calculator().calculate(check, NOW));
    expect(result.subtotal).toBe('90.0000');
    expect(result.lines[0]).toMatchObject({
      sourceType: 'PLAY_SESSION',
      grossAmount: '100.0000',
      discountAmount: '10.0000',
      finalAmount: '90.0000',
    });
  });

  it('calculates an order-only check from active lines plus embedded reservation fee', () => {
    const check = baseCheck();
    check.shopOrders.push({
      id: 'order-1',
      status: 'COMPLETED',
      label: 'Table order',
      total: new Prisma.Decimal('25.5000'),
      tableReserved: true,
      reservationFee: new Prisma.Decimal('5.5000'),
      currency: 'PLN',
      lines: [
        {
          id: 'line-a',
          name: 'Cola',
          quantity: 2,
          unitPrice: new Prisma.Decimal('10.0000'),
          lineStatus: 'ACTIVE',
        },
        {
          id: 'line-canceled',
          name: 'Canceled snack',
          quantity: 1,
          unitPrice: new Prisma.Decimal('99.0000'),
          lineStatus: 'CANCELED',
        },
      ],
    });

    const service = calculator();
    const result = service.serialize(service.calculate(check, NOW));
    expect(result.subtotal).toBe('25.5000');
    expect(result.lines.map((line) => line.lineReference)).toEqual([
      'line-a',
      'reservation-fee',
    ]);
  });

  it('preserves the stored legacy ShopOrder total through a reconciliation snapshot', () => {
    const check = baseCheck();
    check.shopOrders.push({
      id: 'order-1',
      status: 'COMPLETED',
      label: null,
      total: new Prisma.Decimal('10.0100'),
      tableReserved: false,
      reservationFee: null,
      currency: 'PLN',
      lines: [
        {
          id: 'line-a',
          name: 'Legacy rounded line',
          quantity: 1,
          unitPrice: new Prisma.Decimal('10.0000'),
          lineStatus: 'ACTIVE',
        },
      ],
    });

    const service = calculator();
    const result = service.serialize(service.calculate(check, NOW));
    expect(result.subtotal).toBe('10.0100');
    expect(result.lines.at(-1)).toMatchObject({
      lineReference: 'legacy-total-reconciliation',
      finalAmount: '0.0100',
    });
  });

  it('uses the existing play-billing outcome for a reservation-only check', () => {
    const check = baseCheck();
    check.reservations.push(reservation());
    const service = calculator('54.0000', '60.0000');

    const result = service.serialize(service.calculate(check, NOW));
    expect(result.subtotal).toBe('54.0000');
    expect(result.lines[0]).toMatchObject({
      sourceType: 'RESERVATION',
      grossAmount: '60.0000',
      discountAmount: '6.0000',
      finalAmount: '54.0000',
    });
  });

  it('produces a deterministic mixed preview and excludes reservation-linked play', () => {
    const check = baseCheck();
    check.shopOrders.push({
      id: 'order-1',
      status: 'COMPLETED',
      label: null,
      total: new Prisma.Decimal('10'),
      tableReserved: false,
      reservationFee: null,
      currency: 'PLN',
      lines: [
        {
          id: 'line-1',
          name: 'Drink',
          quantity: 1,
          unitPrice: new Prisma.Decimal('10'),
          lineStatus: 'ACTIVE',
        },
      ],
    });
    check.playSessions.push(
      {
        id: 'play-1',
        status: 'COMPLETED',
        label: 'Walk-in',
        amount: new Prisma.Decimal('20'),
        currency: 'PLN',
        billingDiscountPercent: 15,
        completedAt: NOW,
        reservationId: null,
      },
      {
        id: 'play-linked',
        status: 'COMPLETED',
        label: 'Must not double count',
        amount: new Prisma.Decimal('999'),
        currency: 'PLN',
        billingDiscountPercent: 0,
        completedAt: NOW,
        reservationId: 'res-1',
      },
    );
    check.reservations.push(reservation());
    const service = calculator('30.0000', '30.0000');

    const first = service.serialize(service.calculate(check, NOW));
    const second = service.serialize(service.calculate(check, NOW));
    expect(first).toEqual(second);
    expect(first.subtotal).toBe('60.0000');
    expect(first.lines.some((line) => line.sourceId === 'play-linked')).toBe(false);
    expect(first.sourceHash).toHaveLength(64);
  });

  it('handles a zero-amount check', () => {
    const service = calculator();
    const result = service.serialize(service.calculate(baseCheck(), NOW));
    expect(result.subtotal).toBe('0.0000');
    expect(result.total).toBe('0.0000');
    expect(result.lines).toEqual([]);
  });

  it('enforces the invariant sum(snapshot.finalAmount) == subtotal == total', () => {
    const check = baseCheck();
    check.playSessions.push({
      id: 'play-1',
      status: 'ACTIVE',
      label: null,
      amount: new Prisma.Decimal('12.34'),
      currency: 'PLN',
      billingDiscountPercent: 0,
      completedAt: null,
      reservationId: null,
    });
    check.reservations.push(reservation());
    const service = calculator('7.6600', '7.6600');
    const preview = service.calculate(check, NOW);
    const snapshotSum = preview.lines.reduce(
      (sum, line) => sum.add(line.finalAmount),
      new Prisma.Decimal(0),
    );
    expect(snapshotSum.equals(preview.subtotal)).toBe(true);
    expect(preview.subtotal.equals(preview.total)).toBe(true);
    expect(preview.total.equals(preview.amountDue)).toBe(true);
  });

  it('rejects mixed explicit currencies', () => {
    const check = baseCheck();
    check.playSessions.push({
      id: 'play-eur',
      status: 'ACTIVE',
      label: null,
      amount: new Prisma.Decimal('10'),
      currency: 'EUR',
      billingDiscountPercent: 0,
      completedAt: null,
      reservationId: null,
    });
    expect(() => calculator().calculate(check, NOW)).toThrow(
      'more than one currency',
    );
  });

  it('returns a frozen preview value that survives later source edits', () => {
    const check = baseCheck();
    check.shopOrders.push({
      id: 'order-1',
      status: 'COMPLETED',
      label: null,
      total: new Prisma.Decimal('15'),
      tableReserved: false,
      reservationFee: null,
      currency: 'PLN',
      lines: [
        {
          id: 'line-1',
          name: 'Original name',
          quantity: 1,
          unitPrice: new Prisma.Decimal('15'),
          lineStatus: 'ACTIVE',
        },
      ],
    });
    const service = calculator();
    const frozen = service.serialize(service.calculate(check, NOW));

    check.shopOrders[0].lines[0].name = 'Later renamed';
    check.shopOrders[0].lines[0].unitPrice = new Prisma.Decimal('999');

    expect(frozen.lines[0].description).toBe('Original name');
    expect(frozen.lines[0].unitAmount).toBe('15.0000');
    expect(frozen.total).toBe('15.0000');
  });
});
