import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "../../common/permissions";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import {
  RequirePermissions,
  ShopRoles,
} from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { JwtAccessPayload } from "../auth/auth.service";
import { CreateLossDto, CreateTransactionDto } from "./dto/finance.dto";
import { BulkOrderIdsDto } from "./dto/bulk-orders.dto";
import {
  AddShopOrderLineDto,
  CreateShopOrderDto,
  PatchShopOrderLineDto,
  UpdateShopOrderDto,
} from "./dto/orders.dto";
import {
  CreatePlaySessionDto,
  UpdatePlaySessionDto,
} from "./dto/play-sessions.dto";
import {
  CancelPlayBillingDto,
  MarkPlayBillingPaidDto,
  PlayBillingQueryDto,
  UpdatePlayBillingDto,
} from "./dto/play-billing.dto";
import { FinanceService } from "./finance.service";

@ApiTags("finance")
@Controller("finance")
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get("transactions")
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  transactions(
    @CurrentUser() user: JwtAccessPayload,
    @Query("take") take?: string,
  ) {
    return this.finance.listTransactions(user, take ? +take : 40);
  }

  @Post("transactions")
  @ShopRoles("OWNER", "MANAGER", "STAFF")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  createTransaction(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.finance.createTransaction(user, dto);
  }

  @Get("sales-by-item")
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  salesByItem(
    @CurrentUser() user: JwtAccessPayload,
    @Query("days") days?: string,
  ) {
    return this.finance.salesByItem(user, days ? +days : 30);
  }

  @Get("losses")
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  losses(
    @CurrentUser() user: JwtAccessPayload,
    @Query("take") take?: string,
  ) {
    return this.finance.listLosses(user, take ? +take : 50);
  }

  @Post("losses")
  @ShopRoles("OWNER", "MANAGER")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  createLoss(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateLossDto,
  ) {
    return this.finance.createLoss(user, dto);
  }

  @Delete("losses/:id")
  @ShopRoles("OWNER", "MANAGER")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  deleteLoss(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
  ) {
    return this.finance.deleteLoss(user, id);
  }

  @Get("analytics")
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  analytics(
    @CurrentUser() user: JwtAccessPayload,
    @Query("days") days?: string,
  ) {
    return this.finance.getFinanceAnalytics(user, days ? +days : 30);
  }

  @Get("orders/top-sellers")
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  topSellers(
    @CurrentUser() user: JwtAccessPayload,
    @Query("days") days?: string,
    @Query("limit") limit?: string,
  ) {
    return this.finance.getTopSellers(
      user,
      days ? +days : 30,
      limit ? +limit : 10,
    );
  }

  @Get("orders")
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  listShopOrders(
    @CurrentUser() user: JwtAccessPayload,
    @Query("status") status?: string,
    @Query("archived") archived?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("q") q?: string,
    @Query("take") take?: string,
  ) {
    const st =
      status === "PENDING" ||
      status === "COMPLETED" ||
      status === "CANCELED" ||
      status === "ALL"
        ? status
        : undefined;
    const arch =
      archived === "only" || archived === "all" || archived === "exclude"
        ? archived
        : "exclude";
    return this.finance.listShopOrders(user, {
      status: st as "PENDING" | "COMPLETED" | "CANCELED" | "ALL" | undefined,
      archived: arch,
      from,
      to,
      q,
      take: take ? +take : 80,
    });
  }

  @Get("play-billing")
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  listPlayBilling(
    @CurrentUser() user: JwtAccessPayload,
    @Query() query: PlayBillingQueryDto,
  ) {
    return this.finance.listPlayBilling(user, {
      tab: query.tab,
      from: query.from,
      to: query.to,
      take: query.take ? +query.take : 200,
    });
  }

  @Patch("play-billing/:reservationId/mark-paid")
  @ShopRoles("OWNER", "MANAGER", "STAFF")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  markPlayBillingPaid(
    @CurrentUser() user: JwtAccessPayload,
    @Param("reservationId") reservationId: string,
    @Body() dto: MarkPlayBillingPaidDto,
  ) {
    return this.finance.markPlayBillingPaid(user, reservationId, dto);
  }

  @Patch("play-billing/:reservationId")
  @ShopRoles("OWNER", "MANAGER", "STAFF")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  updatePlayBilling(
    @CurrentUser() user: JwtAccessPayload,
    @Param("reservationId") reservationId: string,
    @Body() dto: UpdatePlayBillingDto,
  ) {
    return this.finance.updatePlayBilling(user, reservationId, dto);
  }

  @Patch("play-billing/:reservationId/cancel")
  @ShopRoles("OWNER", "MANAGER", "STAFF")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  cancelPlayBilling(
    @CurrentUser() user: JwtAccessPayload,
    @Param("reservationId") reservationId: string,
    @Body() dto: CancelPlayBillingDto,
  ) {
    return this.finance.cancelPlayBilling(user, reservationId, dto);
  }

  @Get("play-sessions")
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  listPlaySessions(
    @CurrentUser() user: JwtAccessPayload,
    @Query("status") status?: string,
    @Query("archived") archived?: string,
    @Query("take") take?: string,
  ) {
    const st =
      status === "ACTIVE" ||
      status === "COMPLETED" ||
      status === "CANCELED" ||
      status === "ALL"
        ? status
        : undefined;
    return this.finance.listPlaySessions(user, {
      status: st as "ACTIVE" | "COMPLETED" | "CANCELED" | "ALL" | undefined,
      archived: archived === "only" ? "only" : "exclude",
      take: take ? +take : 80,
    });
  }

  @Post("play-sessions")
  @ShopRoles("OWNER", "MANAGER", "STAFF")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  createPlaySession(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreatePlaySessionDto,
  ) {
    return this.finance.createPlaySession(user, dto);
  }

  @Patch("play-sessions/:id")
  @ShopRoles("OWNER", "MANAGER", "STAFF")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  updatePlaySession(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
    @Body() dto: UpdatePlaySessionDto,
  ) {
    return this.finance.updatePlaySession(user, id, dto);
  }

  @Patch("orders/bulk/archive")
  @ShopRoles("OWNER", "MANAGER", "STAFF")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  archiveOrders(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: BulkOrderIdsDto,
  ) {
    return this.finance.archiveShopOrders(user, dto);
  }

  @Patch("orders/bulk/unarchive")
  @ShopRoles("OWNER", "MANAGER", "STAFF")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  unarchiveOrders(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: BulkOrderIdsDto,
  ) {
    return this.finance.unarchiveShopOrders(user, dto);
  }

  @Post("orders")
  @ShopRoles("OWNER", "MANAGER", "STAFF")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  createShopOrder(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateShopOrderDto,
  ) {
    return this.finance.createShopOrder(user, dto);
  }

  @Get("orders/:id")
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  getShopOrder(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
  ) {
    return this.finance.getShopOrder(user, id);
  }

  @Delete("orders/:id")
  @ShopRoles("OWNER", "MANAGER")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  deleteShopOrder(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
  ) {
    return this.finance.deleteShopOrder(user, id);
  }

  @Patch("orders/:id")
  @ShopRoles("OWNER", "MANAGER", "STAFF")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  updateShopOrder(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
    @Body() dto: UpdateShopOrderDto,
  ) {
    return this.finance.updateShopOrder(user, id, dto);
  }

  @Post("orders/:id/lines")
  @ShopRoles("OWNER", "MANAGER", "STAFF")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  addShopOrderLine(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
    @Body() dto: AddShopOrderLineDto,
  ) {
    return this.finance.addShopOrderLine(user, id, dto);
  }

  @Patch("orders/:id/lines/:lineId")
  @ShopRoles("OWNER", "MANAGER", "STAFF")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  patchShopOrderLine(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() dto: PatchShopOrderLineDto,
  ) {
    return this.finance.patchShopOrderLine(user, id, lineId, dto);
  }

  @Delete("orders/:id/lines/:lineId")
  @ShopRoles("OWNER", "MANAGER", "STAFF")
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  deleteShopOrderLine(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
  ) {
    return this.finance.deleteShopOrderLine(user, id, lineId);
  }
}
