import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiStaffErrorResponses } from '../../common/dto/api-error-responses.decorator';
import {
  hashIdempotencyRequest,
  IDEMPOTENCY_SCOPES,
  isIdempotencyMoneyKeysRequired,
  withClientIdempotency,
} from '../../common/idempotency.util';
import { PERMISSIONS } from '../../common/permissions';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  RequirePermissions,
  ShopRoles,
} from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CreateLossDto, CreateTransactionDto } from './dto/finance.dto';
import { BulkOrderIdsDto } from './dto/bulk-orders.dto';
import {
  AddShopOrderLineDto,
  CreateShopOrderDto,
  PatchShopOrderLineDto,
  UpdateShopOrderDto,
} from './dto/orders.dto';
import {
  CreatePlaySessionDto,
  UpdatePlaySessionDto,
} from './dto/play-sessions.dto';
import {
  CancelPlayBillingDto,
  MarkPlayBillingPaidDto,
  PlayBillingQueryDto,
  UpdatePlayBillingDto,
} from './dto/play-billing.dto';
import { FinanceService } from './finance.service';

@ApiTags('finance')
@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('transactions')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  transactions(
    @CurrentUser() user: JwtAccessPayload,
    @Query('take') take?: string,
  ) {
    return this.finance.listTransactions(user, take ? +take : 40);
  }

  @Post('transactions')
  @ApiStaffErrorResponses()
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  createTransaction(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateTransactionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_TRANSACTION_CREATE,
        key: idempotencyKey,
        requireKey: isIdempotencyMoneyKeysRequired(),
        requestHash: hashIdempotencyRequest(dto),
      },
      () => this.finance.createTransaction(user, dto),
    );
  }

  @Get('sales-by-item')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  salesByItem(
    @CurrentUser() user: JwtAccessPayload,
    @Query('days') days?: string,
  ) {
    return this.finance.salesByItem(user, days ? +days : 30);
  }

  @Get('losses')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  losses(@CurrentUser() user: JwtAccessPayload, @Query('take') take?: string) {
    return this.finance.listLosses(user, take ? +take : 50);
  }

  @Post('losses')
  @ApiStaffErrorResponses()
  @ShopRoles('OWNER', 'MANAGER')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  createLoss(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateLossDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_LOSSES_CREATE,
        key: idempotencyKey,
        requireKey: isIdempotencyMoneyKeysRequired(),
        requestHash: hashIdempotencyRequest(dto),
      },
      () => this.finance.createLoss(user, dto),
    );
  }

  @Delete('losses/:id')
  @ShopRoles('OWNER', 'MANAGER')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  deleteLoss(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_LOSSES_DELETE,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({ id }),
      },
      () => this.finance.deleteLoss(user, id),
    );
  }

  @Get('analytics')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  analytics(
    @CurrentUser() user: JwtAccessPayload,
    @Query('days') days?: string,
  ) {
    return this.finance.getFinanceAnalytics(user, days ? +days : 30);
  }

  @Get('orders/top-sellers')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  topSellers(
    @CurrentUser() user: JwtAccessPayload,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    return this.finance.getTopSellers(
      user,
      days ? +days : 30,
      limit ? +limit : 10,
    );
  }

  @Get('orders')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  listShopOrders(
    @CurrentUser() user: JwtAccessPayload,
    @Query('status') status?: string,
    @Query('archived') archived?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('take') take?: string,
  ) {
    const st =
      status === 'PENDING' ||
      status === 'COMPLETED' ||
      status === 'CANCELED' ||
      status === 'ALL'
        ? status
        : undefined;
    const arch =
      archived === 'only' || archived === 'all' || archived === 'exclude'
        ? archived
        : 'exclude';
    return this.finance.listShopOrders(user, {
      status: st,
      archived: arch,
      from,
      to,
      q,
      take: take ? +take : 80,
    });
  }

  @Get('play-billing')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  listPlayBilling(
    @CurrentUser() user: JwtAccessPayload,
    @Query() query: PlayBillingQueryDto,
  ) {
    return this.finance.listPlayBilling(user, {
      tab: query.tab,
      from: query.from,
      to: query.to,
      page: query.page ? +query.page : 1,
      pageSize: query.pageSize ? +query.pageSize : 10,
    });
  }

  @Patch('play-billing/:reservationId/mark-paid')
  @ApiStaffErrorResponses()
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  markPlayBillingPaid(
    @CurrentUser() user: JwtAccessPayload,
    @Param('reservationId') reservationId: string,
    @Body() dto: MarkPlayBillingPaidDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_PLAY_BILLING_MARK_PAID,
        key: idempotencyKey,
        requireKey: isIdempotencyMoneyKeysRequired(),
        requestHash: hashIdempotencyRequest({ reservationId, ...dto }),
      },
      () => this.finance.markPlayBillingPaid(user, reservationId, dto),
    );
  }

  @Patch('play-billing/:reservationId')
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  updatePlayBilling(
    @CurrentUser() user: JwtAccessPayload,
    @Param('reservationId') reservationId: string,
    @Body() dto: UpdatePlayBillingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_PLAY_BILLING_UPDATE,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({ reservationId, ...dto }),
      },
      () => this.finance.updatePlayBilling(user, reservationId, dto),
    );
  }

  @Patch('play-billing/:reservationId/cancel')
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  cancelPlayBilling(
    @CurrentUser() user: JwtAccessPayload,
    @Param('reservationId') reservationId: string,
    @Body() dto: CancelPlayBillingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_PLAY_BILLING_CANCEL,
        key: idempotencyKey,
        requireKey: isIdempotencyMoneyKeysRequired(),
        requestHash: hashIdempotencyRequest({ reservationId, ...dto }),
      },
      () => this.finance.cancelPlayBilling(user, reservationId, dto),
    );
  }

  @Get('play-sessions')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  listPlaySessions(
    @CurrentUser() user: JwtAccessPayload,
    @Query('status') status?: string,
    @Query('archived') archived?: string,
    @Query('take') take?: string,
  ) {
    const st =
      status === 'ACTIVE' ||
      status === 'COMPLETED' ||
      status === 'CANCELED' ||
      status === 'ALL'
        ? status
        : undefined;
    return this.finance.listPlaySessions(user, {
      status: st,
      archived: archived === 'only' ? 'only' : 'exclude',
      take: take ? +take : 80,
    });
  }

  @Post('play-sessions')
  @ApiStaffErrorResponses()
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  createPlaySession(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreatePlaySessionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_PLAY_SESSIONS_CREATE,
        key: idempotencyKey,
        requireKey: isIdempotencyMoneyKeysRequired(),
        requestHash: hashIdempotencyRequest(dto),
      },
      () => this.finance.createPlaySession(user, dto),
    );
  }

  @Patch('play-sessions/:id')
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  updatePlaySession(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePlaySessionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_PLAY_SESSIONS_UPDATE,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({ id, ...dto }),
      },
      () => this.finance.updatePlaySession(user, id, dto),
    );
  }

  @Patch('play-sessions/:id/mark-paid')
  @ApiStaffErrorResponses()
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  markPlaySessionPaid(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: MarkPlayBillingPaidDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_PLAY_SESSION_MARK_PAID,
        key: idempotencyKey,
        requireKey: isIdempotencyMoneyKeysRequired(),
        requestHash: hashIdempotencyRequest({ id, ...dto }),
      },
      () => this.finance.markPlaySessionPaid(user, id, dto),
    );
  }

  @Patch('play-sessions/:id/cancel')
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  cancelPlaySession(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_PLAY_SESSIONS_CANCEL,
        key: idempotencyKey,
        requireKey: isIdempotencyMoneyKeysRequired(),
        requestHash: hashIdempotencyRequest({ id }),
      },
      () => this.finance.cancelPlaySession(user, id),
    );
  }

  @Patch('orders/bulk/archive')
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  archiveOrders(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: BulkOrderIdsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_ORDERS_BULK_ARCHIVE,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({
          ids: [...dto.ids].sort(),
        }),
      },
      () => this.finance.archiveShopOrders(user, dto),
    );
  }

  @Patch('orders/bulk/unarchive')
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  unarchiveOrders(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: BulkOrderIdsDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_ORDERS_BULK_UNARCHIVE,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({
          ids: [...dto.ids].sort(),
        }),
      },
      () => this.finance.unarchiveShopOrders(user, dto),
    );
  }

  @Post('orders')
  @ApiStaffErrorResponses()
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  createShopOrder(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateShopOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_ORDERS_CREATE,
        key: idempotencyKey,
        requireKey: isIdempotencyMoneyKeysRequired(),
        requestHash: hashIdempotencyRequest(dto),
      },
      () => this.finance.createShopOrder(user, dto),
    );
  }

  @Get('orders/:id')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  getShopOrder(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.finance.getShopOrder(user, id);
  }

  @Delete('orders/:id')
  @ShopRoles('OWNER', 'MANAGER')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  deleteShopOrder(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_ORDERS_DELETE,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({ orderId: id }),
      },
      () => this.finance.deleteShopOrder(user, id),
    );
  }

  @Patch('orders/:id')
  @ApiStaffErrorResponses()
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  updateShopOrder(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateShopOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_ORDERS_UPDATE,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({ orderId: id, ...dto }),
      },
      () => this.finance.updateShopOrder(user, id, dto),
    );
  }

  @Post('orders/:id/lines')
  @ApiStaffErrorResponses()
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  addShopOrderLine(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: AddShopOrderLineDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_ORDERS_LINES_ADD,
        key: idempotencyKey,
        requireKey: isIdempotencyMoneyKeysRequired(),
        requestHash: hashIdempotencyRequest({ orderId: id, ...dto }),
      },
      () => this.finance.addShopOrderLine(user, id, dto),
    );
  }

  @Patch('orders/:id/lines/:lineId')
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  patchShopOrderLine(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: PatchShopOrderLineDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_ORDERS_LINES_PATCH,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({ orderId: id, lineId, ...dto }),
      },
      () => this.finance.patchShopOrderLine(user, id, lineId, dto),
    );
  }

  @Delete('orders/:id/lines/:lineId')
  @ShopRoles('OWNER', 'MANAGER', 'STAFF')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  deleteShopOrderLine(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return withClientIdempotency(
      this.prisma,
      {
        shopId: requireShopId(user),
        scope: IDEMPOTENCY_SCOPES.FINANCE_ORDERS_LINES_DELETE,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({ orderId: id, lineId }),
      },
      () => this.finance.deleteShopOrderLine(user, id, lineId),
    );
  }
}
