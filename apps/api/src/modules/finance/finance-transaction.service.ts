import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { loadShopCurrency } from '../../common/currency-stamp.util';
import { postTransactionCreated } from '../../common/ledger-post.util';
import {
  adjustMenuItemStockBy,
  adjustMenuItemStockByOrThrow,
  fetchMenuItemStockRow,
  resetMenuItemStockForDay,
} from '../../common/menu-stock-db.util';
import { assertMenuStockQty, venueDayKey } from '../../common/menu-stock.util';
import {
  addMoney,
  lineTotal,
  serializeMoney,
  type MoneyInput,
} from '../../common/money.util';
import { loadShopVenueTimeContext } from '../../common/shop-venue-time.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.types';
import { CreateTransactionDto } from './dto/finance.dto';
import {
  assertFinancePerm,
  requireFinanceFeature,
} from './finance-guard.util';

@Injectable()
export class FinanceTransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private serializeTransaction<
    T extends {
      amount: MoneyInput;
      lines: Array<
        { unitPrice: MoneyInput; total: MoneyInput } & Record<string, unknown>
      >;
    },
  >(tx: T) {
    return {
      ...tx,
      amount: serializeMoney(tx.amount),
      lines: tx.lines.map((l) => ({
        ...l,
        unitPrice: serializeMoney(l.unitPrice),
        total: serializeMoney(l.total),
      })),
    };
  }

  async listTransactions(actor: JwtAccessPayload, take = 40) {
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
    const rows = await this.prisma.transaction.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
      take,
      include: { lines: true },
    });
    return rows.map((tx) => this.serializeTransaction(tx));
  }

  async createTransaction(actor: JwtAccessPayload, dto: CreateTransactionDto) {
    assertFinancePerm(actor, 'transaction.write');
    const shopId = actor.shopId!;
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
    const currency = await loadShopCurrency(this.prisma, shopId);
    const { resolvedTimeZone } = await loadShopVenueTimeContext(
      this.prisma,
      shopId,
    );
    const today = venueDayKey(resolvedTimeZone);
    const amount = dto.lines.reduce(
      (s, l) => addMoney(s, lineTotal(l.quantity, l.unitPrice)),
      0,
    );

    // Stock adjust + SALE/REFUND row commit atomically (no orphan sale on stock fail).
    const tx = await this.prisma.$transaction(async (db) => {
      if (dto.kind === 'SALE' || dto.kind === 'REFUND') {
        for (const line of dto.lines) {
          if (!line.menuItemId) continue;
          await resetMenuItemStockForDay(db, line.menuItemId, today, shopId);
          if (dto.kind === 'SALE') {
            const item = await fetchMenuItemStockRow(
              db,
              shopId,
              line.menuItemId,
            );
            if (!item) throw new NotFoundException('Menu item not found');
            assertMenuStockQty(
              item,
              line.quantity,
              `${item.name} is out of stock (${item.stock} left).`,
            );
            await adjustMenuItemStockByOrThrow(
              db,
              line.menuItemId,
              line.quantity,
              shopId,
              `${item.name} is out of stock (${item.stock} left).`,
            );
          } else {
            await adjustMenuItemStockBy(
              db,
              line.menuItemId,
              -line.quantity,
              shopId,
            );
          }
        }
      }

      const created = await db.transaction.create({
        data: {
          shopId,
          kind: dto.kind,
          method: dto.method ?? 'CASH',
          amount,
          currency,
          note: dto.note,
          createdById: actor.sub,
          lines: {
            create: dto.lines.map((l) => ({
              menuItemId: l.menuItemId,
              name: l.name,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              total: lineTotal(l.quantity, l.unitPrice),
            })),
          },
        },
        include: { lines: true },
      });
      await postTransactionCreated(db, {
        shopId,
        transactionId: created.id,
        kind: dto.kind,
        amount: created.amount,
        currency: created.currency ?? currency,
        createdAt: created.createdAt,
        createdById: actor.sub,
      });
      return created;
    });

    await this.audit.record(actor, {
      section: 'finance',
      action: 'finance.transaction.create',
      summary: `Recorded ${dto.kind} ${amount.toFixed(2)} (${dto.method ?? 'CASH'})`,
      meta: {
        transactionId: tx.id,
        kind: dto.kind,
        amount,
        lineCount: dto.lines.length,
      },
    });
    return this.serializeTransaction(tx);
  }
}
