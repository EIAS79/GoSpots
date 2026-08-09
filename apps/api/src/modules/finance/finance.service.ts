import {
  Injectable,
} from '@nestjs/common';
import { assertShopFeature } from '../../common/subscription-feature.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateLossDto, CreateTransactionDto } from './dto/finance.dto';
import {
  AddShopOrderLineDto,
  CreateShopOrderDto,
  PatchShopOrderLineDto,
  UpdateShopOrderDto,
} from './dto/orders.dto';
import { BulkOrderIdsDto } from './dto/bulk-orders.dto';
import { FinanceReportsService } from './finance-reports.service';
import { FinanceTransactionService } from './finance-transaction.service';
import { ShopLossService } from './shop-loss.service';
import { ShopOrderService } from './shop-order.service';
import { PlayBillingService } from './play-billing.service';
import { PlaySessionService } from './play-session.service';
import {
  type PlaySessionStatus,
  type ShopOrderStatus,
} from '@prisma/client';
import {
  CreatePlaySessionDto,
  UpdatePlaySessionDto,
} from './dto/play-sessions.dto';
import {
  CancelPlayBillingDto,
  MarkPlayBillingPaidDto,
  UpdatePlayBillingDto,
} from './dto/play-billing.dto';
import type { PlayBillingTabDto } from './dto/play-billing.dto';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly reports: FinanceReportsService,
    private readonly losses: ShopLossService,
    private readonly transactions: FinanceTransactionService,
    private readonly shopOrders: ShopOrderService,
    private readonly playBilling: PlayBillingService,
    private readonly playSessions: PlaySessionService,
  ) {}

  private async requireMenuOrders(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    await assertShopFeature(this.prisma, shopId, 'menu');
    await assertShopFeature(this.prisma, shopId, 'transaction');
  }

  async listTransactions(actor: JwtAccessPayload, take = 40) {
    return this.transactions.listTransactions(actor, take);
  }

  async createTransaction(actor: JwtAccessPayload, dto: CreateTransactionDto) {
    return this.transactions.createTransaction(actor, dto);
  }

  async salesByItem(actor: JwtAccessPayload, days = 30) {
    return this.reports.salesByItem(actor, days);
  }

  async getFinanceAnalytics(actor: JwtAccessPayload, days = 30) {
    return this.reports.getFinanceAnalytics(actor, days);
  }

  async getTopSellers(actor: JwtAccessPayload, days = 30, limit = 10) {
    return this.reports.getTopSellers(actor, days, limit);
  }

  async listShopOrders(
    actor: JwtAccessPayload,
    opts: {
      status?: ShopOrderStatus | 'ALL';
      archived?: 'exclude' | 'only' | 'all';
      from?: string;
      to?: string;
      q?: string;
      take?: number;
    } = {},
  ) {
    await this.requireMenuOrders(actor);
    return this.shopOrders.listShopOrders(actor, opts);
  }

  async archiveShopOrders(actor: JwtAccessPayload, dto: BulkOrderIdsDto) {
    await this.requireMenuOrders(actor);
    return this.shopOrders.archiveShopOrders(actor, dto);
  }

  async unarchiveShopOrders(actor: JwtAccessPayload, dto: BulkOrderIdsDto) {
    await this.requireMenuOrders(actor);
    return this.shopOrders.unarchiveShopOrders(actor, dto);
  }

  async getShopOrder(actor: JwtAccessPayload, id: string) {
    await this.requireMenuOrders(actor);
    return this.shopOrders.getShopOrder(actor, id);
  }

  async createShopOrder(actor: JwtAccessPayload, dto: CreateShopOrderDto) {
    await this.requireMenuOrders(actor);
    return this.shopOrders.createShopOrder(actor, dto);
  }

  async updateShopOrder(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateShopOrderDto,
  ) {
    await this.requireMenuOrders(actor);
    return this.shopOrders.updateShopOrder(actor, id, dto);
  }

  async addShopOrderLine(
    actor: JwtAccessPayload,
    orderId: string,
    dto: AddShopOrderLineDto,
  ) {
    await this.requireMenuOrders(actor);
    return this.shopOrders.addShopOrderLine(actor, orderId, dto);
  }

  async patchShopOrderLine(
    actor: JwtAccessPayload,
    orderId: string,
    lineId: string,
    dto: PatchShopOrderLineDto,
  ) {
    await this.requireMenuOrders(actor);
    return this.shopOrders.patchShopOrderLine(actor, orderId, lineId, dto);
  }

  async deleteShopOrderLine(
    actor: JwtAccessPayload,
    orderId: string,
    lineId: string,
  ) {
    await this.requireMenuOrders(actor);
    return this.shopOrders.deleteShopOrderLine(actor, orderId, lineId);
  }

  async deleteShopOrder(actor: JwtAccessPayload, id: string) {
    await this.requireMenuOrders(actor);
    return this.shopOrders.deleteShopOrder(actor, id);
  }

  async listLosses(actor: JwtAccessPayload, take = 50) {
    return this.losses.listLosses(actor, take);
  }

  async createLoss(actor: JwtAccessPayload, dto: CreateLossDto) {
    return this.losses.createLoss(actor, dto);
  }

  async deleteLoss(actor: JwtAccessPayload, id: string) {
    return this.losses.deleteLoss(actor, id);
  }

  async listPlayBilling(
    actor: JwtAccessPayload,
    opts: {
      tab?: PlayBillingTabDto;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    return this.playBilling.listPlayBilling(actor, opts);
  }

  async markPlayBillingPaid(
    actor: JwtAccessPayload,
    reservationId: string,
    dto: MarkPlayBillingPaidDto,
  ) {
    return this.playBilling.markPlayBillingPaid(actor, reservationId, dto);
  }

  async updatePlayBilling(
    actor: JwtAccessPayload,
    reservationId: string,
    dto: UpdatePlayBillingDto,
  ) {
    return this.playBilling.updatePlayBilling(actor, reservationId, dto);
  }

  async cancelPlayBilling(
    actor: JwtAccessPayload,
    reservationId: string,
    dto: CancelPlayBillingDto,
  ) {
    return this.playBilling.cancelPlayBilling(actor, reservationId, dto);
  }

  async listPlaySessions(
    actor: JwtAccessPayload,
    opts: {
      status?: PlaySessionStatus | 'ALL';
      archived?: 'exclude' | 'only';
      take?: number;
    } = {},
  ) {
    return this.playSessions.listPlaySessions(actor, opts);
  }

  async createPlaySession(actor: JwtAccessPayload, dto: CreatePlaySessionDto) {
    return this.playSessions.createPlaySession(actor, dto);
  }

  async markPlaySessionPaid(
    actor: JwtAccessPayload,
    id: string,
    dto: { amountOverride?: number; discountPercent?: number },
  ) {
    return this.playSessions.markPlaySessionPaid(actor, id, dto);
  }

  async cancelPlaySession(actor: JwtAccessPayload, id: string) {
    return this.playSessions.cancelPlaySession(actor, id);
  }

  async updatePlaySession(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdatePlaySessionDto,
  ) {
    return this.playSessions.updatePlaySession(actor, id, dto);
  }
}
