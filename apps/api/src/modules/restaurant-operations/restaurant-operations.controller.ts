import { Body, Controller, Get, Headers, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import {
  AppendRestaurantOrderDto,
  BarTabDto,
  BootstrapRestaurantOrderDto,
  CombineTablesDto,
  FireCourseDto,
  MenuPresentationDto,
  MenuServiceModePolicyDto,
  ModifierAvailabilityDto,
  PickupStatusDto,
  PrepStationGroupDto,
  PrepStationTimerPolicyDto,
  PrepTicketControlDto,
  PrinterJobResultDto,
  PrinterRouteDto,
  QrTableOrderDto,
  QrTableTokenDto,
  RestaurantLifecycleDto,
  RestaurantLineOpsDto,
  TableTransferDto,
} from './dto/restaurant-operations.dto';
import { RestaurantConfigurationService } from './restaurant-configuration.service';
import { RestaurantOperationsService } from './restaurant-operations.service';
import { RestaurantOrderIntegrityService } from './restaurant-order-integrity-v2.service';

@ApiTags('restaurant-operations')
@Controller('restaurant-operations')
export class RestaurantOperationsController {
  constructor(
    private readonly operations: RestaurantOperationsService,
    private readonly configuration: RestaurantConfigurationService,
    private readonly integrity: RestaurantOrderIntegrityService,
  ) {}

  @Put('menu/service-mode')
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  setServiceMode(@CurrentUser() actor: JwtAccessPayload, @Body() dto: MenuServiceModePolicyDto) {
    return this.configuration.setServiceModePolicy(actor, dto);
  }

  @Put('menu/presentation')
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  setPresentation(@CurrentUser() actor: JwtAccessPayload, @Body() dto: MenuPresentationDto) {
    return this.configuration.setPresentation(actor, dto);
  }

  @Put('menu/modifier-availability')
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  setModifierAvailability(@CurrentUser() actor: JwtAccessPayload, @Body() dto: ModifierAvailabilityDto) {
    return this.configuration.setModifierAvailability(actor, dto);
  }

  @Post('orders/:orderId/bootstrap')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  bootstrap(@CurrentUser() actor: JwtAccessPayload, @Param('orderId') orderId: string, @Body() dto: BootstrapRestaurantOrderDto) {
    return this.operations.bootstrapOrder(actor, orderId, dto);
  }

  @Get('orders/:orderId')
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  getOrder(@CurrentUser() actor: JwtAccessPayload, @Param('orderId') orderId: string) {
    return this.operations.getOrderOps(actor, orderId);
  }

  @Post('orders/:orderId/items')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  appendOrder(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: AppendRestaurantOrderDto,
  ) {
    return this.integrity.appendOrder(actor, orderId, idempotencyKey, dto);
  }

  @Post('orders/:orderId/lifecycle')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  lifecycle(@CurrentUser() actor: JwtAccessPayload, @Param('orderId') orderId: string, @Body() dto: RestaurantLifecycleDto) {
    return this.operations.transitionOrder(actor, orderId, dto);
  }

  @Put('orders/:orderId/lines/:lineId')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  lineOps(@CurrentUser() actor: JwtAccessPayload, @Param('orderId') orderId: string, @Param('lineId') lineId: string, @Body() dto: RestaurantLineOpsDto) {
    return this.operations.setLineOps(actor, orderId, lineId, dto);
  }

  @Post('orders/:orderId/fire')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  fire(@CurrentUser() actor: JwtAccessPayload, @Param('orderId') orderId: string, @Body() dto: FireCourseDto) {
    return this.operations.fireCourse(actor, orderId, dto);
  }

  @Post('orders/:orderId/transfer')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  transfer(@CurrentUser() actor: JwtAccessPayload, @Param('orderId') orderId: string, @Body() dto: TableTransferDto) {
    return this.integrity.transfer(actor, orderId, dto);
  }

  @Post('tables/combine')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  combine(@CurrentUser() actor: JwtAccessPayload, @Body() dto: CombineTablesDto) {
    return this.integrity.combine(actor, dto.sourceOrderId, dto.targetOrderId, dto.reason);
  }

  @Post('orders/:orderId/tab/open')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  openTab(@CurrentUser() actor: JwtAccessPayload, @Param('orderId') orderId: string, @Body() dto: BarTabDto) {
    return this.operations.openTab(actor, orderId, dto);
  }

  @Post('orders/:orderId/tab/close')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  closeTab(@CurrentUser() actor: JwtAccessPayload, @Param('orderId') orderId: string) {
    return this.operations.closeTab(actor, orderId);
  }

  @Get('tabs/unsettled')
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  unsettledTabs(@CurrentUser() actor: JwtAccessPayload) {
    return this.operations.listUnsettledTabs(actor);
  }

  @Put('orders/:orderId/pickup')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  pickup(@CurrentUser() actor: JwtAccessPayload, @Param('orderId') orderId: string, @Body() dto: PickupStatusDto) {
    return this.operations.setPickupStatus(actor, orderId, dto);
  }

  @Post('kds/groups')
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  stationGroup(@CurrentUser() actor: JwtAccessPayload, @Body() dto: PrepStationGroupDto) {
    return this.operations.createStationGroup(actor, dto);
  }

  @Put('kds/timer-policy')
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  timerPolicy(@CurrentUser() actor: JwtAccessPayload, @Body() dto: PrepStationTimerPolicyDto) {
    return this.configuration.setTimerPolicy(actor, dto);
  }

  @Post('kds/tickets/:ticketId/control')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  ticketControl(@CurrentUser() actor: JwtAccessPayload, @Param('ticketId') ticketId: string, @Body() dto: PrepTicketControlDto) {
    return this.operations.controlTicket(actor, ticketId, dto);
  }

  @Get('kds/board')
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  kdsBoard(@CurrentUser() actor: JwtAccessPayload, @Query('stationId') stationId?: string) {
    return this.operations.kdsBoard(actor, stationId);
  }

  @Put('printers/routes')
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  printerRoute(@CurrentUser() actor: JwtAccessPayload, @Body() dto: PrinterRouteDto) {
    return this.operations.configurePrinterRoute(actor, dto);
  }

  @Get('printers/jobs')
  @RequirePermissions(PERMISSIONS.ORDER_READ)
  printerJobs(@CurrentUser() actor: JwtAccessPayload) {
    return this.operations.printerQueue(actor);
  }

  @Post('printers/jobs/:jobId/result')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  printerResult(@CurrentUser() actor: JwtAccessPayload, @Param('jobId') jobId: string, @Body() dto: PrinterJobResultDto) {
    return this.operations.completePrinterJob(actor, jobId, dto);
  }

  @Post('qr/tokens')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  createQrToken(@CurrentUser() actor: JwtAccessPayload, @Body() dto: QrTableTokenDto) {
    return this.operations.createQrToken(actor, dto);
  }

  @Post('qr/tokens/:tokenId/revoke')
  @RequirePermissions(PERMISSIONS.ORDER_WRITE)
  revokeQrToken(@CurrentUser() actor: JwtAccessPayload, @Param('tokenId') tokenId: string) {
    return this.operations.revokeQrToken(actor, tokenId);
  }

  @Public()
  @Get('qr/:token/menu')
  publicMenu(@Param('token') token: string) {
    return this.operations.publicMenu(token);
  }

  @Public()
  @Post('qr/:token/orders')
  publicOrder(
    @Param('token') token: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: QrTableOrderDto,
  ) {
    return this.integrity.createQrOrder(token, idempotencyKey, dto);
  }

  @Public()
  @Get('qr/:token/display')
  publicDisplay(@Param('token') token: string) {
    return this.operations.publicDisplay(token);
  }
}
