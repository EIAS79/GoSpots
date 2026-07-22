import { Injectable, NotFoundException } from '@nestjs/common';
import { loadShopCurrency } from '../../common/currency-stamp.util';
import { postShopLossCreated } from '../../common/ledger-post.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateLossDto } from './dto/finance.dto';
import {
  assertFinancePerm,
  requireFinanceFeature,
  serializeLoss,
} from './finance-guard.util';

const LARGE_LOSS_NOTIFY_THRESHOLD = 100;

@Injectable()
export class ShopLossService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async listLosses(actor: JwtAccessPayload, take = 50) {
    const shopId = requireShopId(actor);
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
    const rows = await this.prisma.shopLoss.findMany({
      where: { shopId },
      orderBy: { occurredAt: 'desc' },
      take,
    });
    return rows.map((l) => serializeLoss(l));
  }

  async createLoss(actor: JwtAccessPayload, dto: CreateLossDto) {
    assertFinancePerm(actor, 'transaction.write');
    const shopId = actor.shopId!;
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
    const currency = await loadShopCurrency(this.prisma, shopId);
    const loss = await this.prisma.shopLoss.create({
      data: {
        shopId: actor.shopId!,
        amount: dto.amount,
        currency,
        reason: dto.reason,
        category: dto.category,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        createdById: actor.sub,
      },
    });
    await postShopLossCreated(this.prisma, {
      shopId,
      lossId: loss.id,
      amount: loss.amount,
      currency: loss.currency ?? currency,
      occurredAt: loss.occurredAt,
      createdById: actor.sub,
    });
    await this.audit.record(actor, {
      section: 'finance',
      action: 'finance.loss.create',
      summary: `Recorded loss ${dto.amount} — ${dto.category}`,
      meta: { lossId: loss.id, amount: dto.amount, reason: dto.reason },
    });
    if (dto.amount >= LARGE_LOSS_NOTIFY_THRESHOLD) {
      await this.notifications.recordFinanceEvent(shopId, {
        title: 'Large loss recorded',
        body: `${dto.amount.toFixed(2)} — ${dto.category ?? 'uncategorized'}: ${dto.reason}`,
        href: '/finance',
        dedupeKey: `loss_large_${loss.id}`,
      });
    }
    return serializeLoss(loss);
  }

  async deleteLoss(actor: JwtAccessPayload, id: string) {
    assertFinancePerm(actor, 'transaction.write');
    const shopId = actor.shopId!;
    await requireFinanceFeature(this.prisma, shopId, 'transaction');
    const row = await this.prisma.shopLoss.findFirst({
      where: { id, shopId: actor.shopId! },
    });
    if (!row) throw new NotFoundException();
    await this.prisma.shopLoss.delete({ where: { id, shopId: actor.shopId! } });
    await this.audit.record(actor, {
      section: 'finance',
      action: 'finance.loss.delete',
      summary: `Deleted loss record ${row.amount} (${row.category})`,
      meta: { lossId: id },
    });
    return { ok: true };
  }
}
