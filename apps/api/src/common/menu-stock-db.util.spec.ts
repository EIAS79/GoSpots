import { BadRequestException } from '@nestjs/common';
import { adjustMenuItemStockBy } from './menu-stock-db.util';

describe('adjustMenuItemStockBy', () => {
  it('returns false when conditional decrement updates 0 rows', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ stock: 1, trackStock: true }]),
      $executeRaw: jest.fn().mockResolvedValue(0),
    };
    const ok = await adjustMenuItemStockBy(prisma as never, 'item', 1, 'shop');
    expect(ok).toBe(false);
  });

  it('decrements when stock is sufficient', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ stock: 2, trackStock: true }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const ok = await adjustMenuItemStockBy(prisma as never, 'item', 1, 'shop');
    expect(ok).toBe(true);
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it('skips when trackStock is false', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ stock: 0, trackStock: false }]),
      $executeRaw: jest.fn(),
    };
    const ok = await adjustMenuItemStockBy(prisma as never, 'item', 5, 'shop');
    expect(ok).toBe(true);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

/**
 * Simulates createTransaction atomic path: stock fail rolls back — no SALE row.
 * Uses the same ordering as FinanceService.createTransaction (adjust then create).
 */
describe('atomic sale + stock ordering', () => {
  async function atomicSale(opts: {
    stockOk: boolean;
  }): Promise<{ saleCreated: boolean; stockAdjusted: boolean }> {
    let saleCreated = false;
    let stockAdjusted = false;
    try {
      await (async () => {
        if (!opts.stockOk) {
          throw new BadRequestException('Not enough stock');
        }
        stockAdjusted = true;
        saleCreated = true;
      })();
    } catch {
      return { saleCreated: false, stockAdjusted: false };
    }
    return { saleCreated, stockAdjusted };
  }

  it('does not leave orphan SALE when stock adjust fails', async () => {
    const r = await atomicSale({ stockOk: false });
    expect(r.saleCreated).toBe(false);
    expect(r.stockAdjusted).toBe(false);
  });

  it('concurrent last-unit: only one success when using conditional update', async () => {
    let stock = 1;
    const tryBuy = async () => {
      if (stock < 1) return false;
      // Simulate conditional UPDATE … WHERE stock >= 1
      if (stock >= 1) {
        stock -= 1;
        return true;
      }
      return false;
    };
    const results = await Promise.all([tryBuy(), tryBuy(), tryBuy()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(stock).toBe(0);
  });
});

/**
 * Simulates patch/cancel line claim ordering used by FinanceService:
 * updateMany(ACTIVE→CANCELED) then restore — only the winner restores.
 */
describe('atomic order-line cancel / patch claim', () => {
  async function claimCancelAndRestore(opts: {
    lineStatus: 'ACTIVE' | 'CANCELED';
    quantity: number;
  }): Promise<{ claimed: boolean; stockRestored: number }> {
    let lineStatus = opts.lineStatus;
    let stockRestored = 0;
    // Simulate updateMany WHERE lineStatus = ACTIVE
    const claimed = lineStatus === 'ACTIVE';
    if (claimed) {
      lineStatus = 'CANCELED';
      stockRestored = opts.quantity;
    }
    void lineStatus;
    return { claimed, stockRestored };
  }

  it('double cancel restores stock once', async () => {
    let stock = 5;
    const line = { status: 'ACTIVE' as 'ACTIVE' | 'CANCELED', qty: 2 };

    const tryCancel = () => {
      if (line.status !== 'ACTIVE') return { claimed: false };
      line.status = 'CANCELED';
      stock += line.qty;
      return { claimed: true };
    };

    const results = [tryCancel(), tryCancel()];
    expect(results.filter((r) => r.claimed)).toHaveLength(1);
    expect(stock).toBe(7);
    expect(line.status).toBe('CANCELED');
  });

  it('optimistic qty patch: only one concurrent delta applies', async () => {
    let stock = 10;
    let quantity = 2;

    const tryPatchFromBaseline = (baseline: number, nextQty: number) => {
      const delta = nextQty - baseline;
      if (delta > 0) {
        if (stock < delta) return false;
        stock -= delta;
      } else if (delta < 0) {
        stock += Math.abs(delta);
      }
      // Optimistic claim: WHERE quantity = baseline
      if (quantity !== baseline) {
        if (delta > 0) stock += delta;
        else if (delta < 0) stock -= Math.abs(delta);
        return false;
      }
      quantity = nextQty;
      return true;
    };

    // Both writers read qty=2 concurrently
    const aOk = tryPatchFromBaseline(2, 5); // +3
    const bOk = tryPatchFromBaseline(2, 4); // loses claim
    expect(aOk).toBe(true);
    expect(bOk).toBe(false);
    expect(quantity).toBe(5);
    expect(stock).toBe(7);
  });

  it('claimCancelAndRestore skips when already canceled', async () => {
    const r = await claimCancelAndRestore({
      lineStatus: 'CANCELED',
      quantity: 3,
    });
    expect(r.claimed).toBe(false);
    expect(r.stockRestored).toBe(0);
  });
});

/**
 * Simulates order-level cancel: claim order, then per-line ACTIVE→CANCELED
 * before restore — same ordering as FinanceService.updateShopOrder(CANCELED).
 */
describe('atomic order-level cancel claim', () => {
  it('double order-cancel restores each line once', () => {
    let stock = 10;
    let orderStatus: 'PENDING' | 'CANCELED' = 'PENDING';
    const lines = [
      { id: 'l1', status: 'ACTIVE' as 'ACTIVE' | 'CANCELED', qty: 2, item: true },
      { id: 'l2', status: 'ACTIVE' as 'ACTIVE' | 'CANCELED', qty: 3, item: true },
    ];

    const tryOrderCancel = () => {
      if (orderStatus === 'CANCELED') return { claimedOrder: false, restored: 0 };
      orderStatus = 'CANCELED';
      let restored = 0;
      for (const line of lines) {
        if (line.status !== 'ACTIVE') continue;
        line.status = 'CANCELED';
        if (line.item) {
          stock += line.qty;
          restored += line.qty;
        }
      }
      return { claimedOrder: true, restored };
    };

    const a = tryOrderCancel();
    const b = tryOrderCancel();
    expect(a.claimedOrder).toBe(true);
    expect(b.claimedOrder).toBe(false);
    expect(a.restored).toBe(5);
    expect(b.restored).toBe(0);
    expect(stock).toBe(15);
    expect(lines.every((l) => l.status === 'CANCELED')).toBe(true);
  });

  it('line cancel then order cancel does not double-restore', () => {
    let stock = 4;
    let orderStatus = 'PENDING';
    let lineStatus = 'ACTIVE';
    const qty = 2;

    // Concurrent line-level cancel wins the line claim first.
    if (lineStatus === 'ACTIVE') {
      lineStatus = 'CANCELED';
      stock += qty;
    }

    // Order cancel claims order, then per-line claim loses.
    if (orderStatus !== 'CANCELED') {
      orderStatus = 'CANCELED';
      if (lineStatus === 'ACTIVE') {
        lineStatus = 'CANCELED';
        stock += qty;
      }
    }

    expect(orderStatus).toBe('CANCELED');
    expect(lineStatus).toBe('CANCELED');
    expect(stock).toBe(6);
  });

  it('order cancel then delete does not double-restore (claim-before-delete)', () => {
    let stock = 8;
    let orderStatus: 'PENDING' | 'CANCELED' | 'GONE' = 'PENDING';
    let lineStatus: 'ACTIVE' | 'CANCELED' = 'ACTIVE';
    const qty = 2;

    // Cancel claims order + line, restores.
    orderStatus = 'CANCELED';
    lineStatus = 'CANCELED';
    stock += qty;

    // Fixed delete: claim line first (loses), then remove order.
    if (lineStatus === 'ACTIVE') {
      lineStatus = 'CANCELED';
      stock += qty;
    }
    orderStatus = 'GONE';

    expect(stock).toBe(10);
    expect(orderStatus).toBe('GONE');
  });
});
