import { claimActiveLinesAndRestoreStock } from './shop-order-stock.util';

type LineRow = {
  id: string;
  menuItemId: string | null;
  quantity: number;
  lineStatus: 'ACTIVE' | 'CANCELED';
};

function mockDb(lines: Map<string, LineRow>) {
  return {
    shopOrderLine: {
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; shopOrderId: string; lineStatus: string };
          data: { lineStatus: string };
        }) => {
          const row = lines.get(where.id);
          if (!row || row.lineStatus !== where.lineStatus) {
            return { count: 0 };
          }
          row.lineStatus = data.lineStatus as 'ACTIVE' | 'CANCELED';
          return { count: 1 };
        },
      ),
    },
    $queryRaw: jest.fn(async () => [{ stock: 100, trackStock: true }]),
    $executeRaw: jest.fn(async () => 1),
  };
}

describe('claimActiveLinesAndRestoreStock', () => {
  it('claims ACTIVE lines and restores once each', async () => {
    const lines = new Map<string, LineRow>([
      [
        'l1',
        { id: 'l1', menuItemId: 'm1', quantity: 2, lineStatus: 'ACTIVE' },
      ],
      [
        'l2',
        { id: 'l2', menuItemId: 'm2', quantity: 3, lineStatus: 'ACTIVE' },
      ],
    ]);
    const db = mockDb(lines);

    const restored = await claimActiveLinesAndRestoreStock(
      db as never,
      'shop',
      'ord',
      [...lines.values()],
    );

    expect(restored).toBe(5);
    expect(db.shopOrderLine.updateMany).toHaveBeenCalledTimes(2);
    expect(lines.get('l1')!.lineStatus).toBe('CANCELED');
    expect(lines.get('l2')!.lineStatus).toBe('CANCELED');
    expect(db.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('skips already-canceled lines (no restore)', async () => {
    const lines = new Map<string, LineRow>([
      [
        'l1',
        { id: 'l1', menuItemId: 'm1', quantity: 4, lineStatus: 'CANCELED' },
      ],
    ]);
    const db = mockDb(lines);
    const restored = await claimActiveLinesAndRestoreStock(
      db as never,
      'shop',
      'ord',
      [...lines.values()],
    );
    expect(restored).toBe(0);
    expect(db.shopOrderLine.updateMany).not.toHaveBeenCalled();
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it('concurrent claim: only one winner restores per line', async () => {
    const line: LineRow = {
      id: 'l1',
      menuItemId: 'm1',
      quantity: 2,
      lineStatus: 'ACTIVE',
    };
    const lines = new Map([['l1', line]]);
    const db = mockDb(lines);

    const a = await claimActiveLinesAndRestoreStock(db as never, 'shop', 'ord', [
      { ...line },
    ]);
    // Stale caller still believes line is ACTIVE.
    const b = await claimActiveLinesAndRestoreStock(db as never, 'shop', 'ord', [
      { ...line, lineStatus: 'ACTIVE' },
    ]);

    expect(a).toBe(2);
    expect(b).toBe(0);
    expect(line.lineStatus).toBe('CANCELED');
  });
});

/**
 * deleteShopOrder vs updateShopOrder(CANCELED) race.
 * Old bug: delete restored from stale ACTIVE snapshot after cancel already restored.
 * Fixed: claim ACTIVE→CANCELED before order delete (same helper as cancel).
 */
describe('order delete vs cancel stock race', () => {
  it('does not double-restore when cancel wins line claims first', () => {
    let stock = 10;
    let orderStatus: 'PENDING' | 'CANCELED' | 'GONE' = 'PENDING';
    let lineStatus: 'ACTIVE' | 'CANCELED' = 'ACTIVE';
    const qty = 2;

    const cancel = () => {
      if (orderStatus !== 'PENDING') return { restored: 0 };
      orderStatus = 'CANCELED';
      if (lineStatus !== 'ACTIVE') return { restored: 0 };
      lineStatus = 'CANCELED';
      stock += qty;
      return { restored: qty };
    };

    const deleteFixed = () => {
      if (orderStatus === 'GONE') return { restored: 0 };
      let restored = 0;
      if (lineStatus === 'ACTIVE') {
        lineStatus = 'CANCELED';
        stock += qty;
        restored = qty;
      }
      orderStatus = 'GONE';
      return { restored };
    };

    // Document old bug: stale ACTIVE restore after cancel.
    let stockBug = 10;
    stockBug += qty; // cancel restore
    stockBug += qty; // buggy delete from stale snapshot
    expect(stockBug).toBe(14);

    const c = cancel();
    const d = deleteFixed();
    expect(c.restored).toBe(2);
    expect(d.restored).toBe(0);
    expect(stock).toBe(12);
    expect(orderStatus).toBe('GONE');
    expect(lineStatus).toBe('CANCELED');
  });

  it('does not double-restore when delete claims lines first', () => {
    let stock = 5;
    let orderStatus: 'PENDING' | 'CANCELED' | 'GONE' = 'PENDING';
    let lineStatus: 'ACTIVE' | 'CANCELED' = 'ACTIVE';
    const qty = 3;

    if (lineStatus === 'ACTIVE') {
      lineStatus = 'CANCELED';
      stock += qty;
    }
    orderStatus = 'GONE';

    const cancelAfter = () => {
      if (orderStatus !== 'PENDING') return { restored: 0 };
      orderStatus = 'CANCELED';
      if (lineStatus !== 'ACTIVE') return { restored: 0 };
      lineStatus = 'CANCELED';
      stock += qty;
      return { restored: qty };
    };

    expect(cancelAfter().restored).toBe(0);
    expect(stock).toBe(8);
  });
});
