import { PaymentAllocationKind, Prisma } from '@prisma/client';
import { PaymentAllocationService } from './payment-allocation.service';

function snapshot(
  id: string,
  amount: string,
  options: Partial<{
    position: number;
    sourceType: string;
    sourceId: string;
    description: string;
    quantity: number;
    allocatedAmount: string;
  }> = {},
) {
  return {
    id,
    position: options.position ?? (Number(id.replace(/\D/g, '')) || 0),
    sourceType: options.sourceType ?? 'SHOP_ORDER',
    sourceId: options.sourceId ?? `source-${id}`,
    lineReference: id,
    description: options.description ?? `Item ${id}`,
    quantity: options.quantity ?? 1,
    finalAmount: new Prisma.Decimal(amount),
    allocatedAmount: new Prisma.Decimal(options.allocatedAmount ?? 0),
    currency: 'PLN',
  };
}

function total(groups: { amount: string }[]) {
  return groups
    .reduce((sum, group) => sum.add(group.amount), new Prisma.Decimal(0))
    .toFixed(4);
}

describe('PaymentAllocationService', () => {
  const service = new PaymentAllocationService();

  it('splits by line and preserves each remaining charge exactly', () => {
    const result = service.previewGroups(
      PaymentAllocationKind.LINE,
      [
        snapshot('1', '10.0000'),
        snapshot('2', '7.5000', { allocatedAmount: '2.5000' }),
      ],
    );
    expect(result.remainingTotal).toBe('15.0000');
    expect(result.groups.map((group) => group.amount)).toEqual([
      '10.0000',
      '5.0000',
    ]);
  });

  it('groups remaining charges by source without losing money', () => {
    const result = service.previewGroups(PaymentAllocationKind.SOURCE, [
      snapshot('1', '4.0000', { sourceId: 'order-a' }),
      snapshot('2', '6.0000', { sourceId: 'order-a' }),
      snapshot('3', '5.0000', {
        sourceType: 'PLAY_SESSION',
        sourceId: 'play-b',
      }),
    ]);
    expect(result.groups).toHaveLength(2);
    expect(total(result.groups)).toBe('15.0000');
  });

  it('equal split assigns the rounding remainder to the final part', () => {
    const result = service.previewGroups(
      PaymentAllocationKind.EQUAL,
      [snapshot('1', '10.0000')],
      { parts: 3 },
    );
    expect(result.groups.map((group) => group.amount)).toEqual([
      '3.3333',
      '3.3333',
      '3.3334',
    ]);
    expect(total(result.groups)).toBe('10.0000');
  });

  it('creates four exact guest payment groups for the cashier shortcut', () => {
    const result = service.previewGroups(
      PaymentAllocationKind.EQUAL,
      [snapshot('1', '100.0000', { quantity: 4 })],
      { parts: 4 },
    );
    expect(result.groups).toHaveLength(4);
    expect(result.groups.map((group) => group.amount)).toEqual([
      '25.0000',
      '25.0000',
      '25.0000',
      '25.0000',
    ]);
    expect(result.groups.map((group) => group.allocations[0].quantity)).toEqual([
      '1.0000',
      '1.0000',
      '1.0000',
      '1.0000',
    ]);
    expect(total(result.groups)).toBe('100.0000');
  });

  it('calculates percentage, custom, and remaining modes from the current remainder', () => {
    const rows = [snapshot('1', '40.0000'), snapshot('2', '60.0000')];
    expect(
      service.previewGroups(PaymentAllocationKind.PERCENTAGE, rows, {
        percentage: 25,
      }).groups[0].amount,
    ).toBe('25.0000');
    expect(
      service.previewGroups(PaymentAllocationKind.CUSTOM, rows, {
        customAmounts: ['12.3400', '7.6600'],
      }).groups.map((group) => group.amount),
    ).toEqual(['12.3400', '7.6600']);
    expect(
      service.previewGroups(PaymentAllocationKind.REMAINING, rows).groups[0]
        .amount,
    ).toBe('100.0000');
  });

  it('returns fractional quantity when only part of a multi-quantity line is allocated', () => {
    const result = service.previewGroups(
      PaymentAllocationKind.PERCENTAGE,
      [snapshot('1', '40.0000', { quantity: 4 })],
      { percentage: 25 },
    );
    expect(result.groups[0].allocations[0].quantity).toBe('1.0000');
  });

  it('rejects custom over-allocation', () => {
    expect(() =>
      service.previewGroups(
        PaymentAllocationKind.CUSTOM,
        [snapshot('1', '10.0000')],
        { customAmounts: ['6.0000', '5.0000'] },
      ),
    ).toThrow(/exceeds remaining balance/i);
  });

  it('conserves money across many equal split combinations', () => {
    for (let units = 1; units <= 125; units += 1) {
      const amount = new Prisma.Decimal(units)
        .div(7)
        .toDecimalPlaces(4)
        .toFixed(4);
      for (let parts = 2; parts <= 8; parts += 1) {
        const decimal = new Prisma.Decimal(amount);
        if (decimal.div(parts).lt('0.0001')) continue;
        const result = service.previewGroups(
          PaymentAllocationKind.EQUAL,
          [snapshot('1', amount)],
          { parts },
        );
        expect(total(result.groups)).toBe(result.remainingTotal);
        for (const group of result.groups) {
          expect(new Prisma.Decimal(group.amount).gt(0)).toBe(true);
        }
      }
    }
  });
});
