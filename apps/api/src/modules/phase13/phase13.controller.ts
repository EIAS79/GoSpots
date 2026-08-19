import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DataImportKind, ShopRole, SystemRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ShopRoles, SystemRoles } from '../auth/decorators/roles.decorator';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  CreateCentralPurchaseOrderDto,
  CreateOrganizationInventoryTransferDto,
  ImportPreviewDto,
  ReceiveOrganizationInventoryTransferDto,
  RotateWebhookSecretDto,
  SystemFeatureFlagUpdateDto,
  SystemSubscriptionUpdateDto,
} from './dto/phase13.dto';
import { Phase13Service } from './phase13.service';

@ApiTags('phase13')
@Controller('phase13')
export class Phase13Controller {
  constructor(private readonly service: Phase13Service) {}

  @Get('organizations/:organizationId/overview')
  organizationOverview(@CurrentUser() actor: JwtAccessPayload, @Param('organizationId') organizationId: string) {
    return this.service.organizationOverview(actor, organizationId);
  }

  @Get('organizations/:organizationId/inventory-transfers')
  listTransfers(@CurrentUser() actor: JwtAccessPayload, @Param('organizationId') organizationId: string) {
    return this.service.listTransfers(actor, organizationId);
  }

  @Post('organizations/:organizationId/inventory-transfers')
  createTransfer(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateOrganizationInventoryTransferDto,
  ) {
    return this.service.createTransfer(actor, organizationId, dto);
  }

  @Post('organizations/:organizationId/inventory-transfers/:transferId/receive')
  receiveTransfer(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('organizationId') organizationId: string,
    @Param('transferId') transferId: string,
    @Body() dto: ReceiveOrganizationInventoryTransferDto,
  ) {
    return this.service.receiveTransfer(actor, organizationId, transferId, dto);
  }

  @Post('organizations/:organizationId/purchase-orders')
  createCentralPurchaseOrder(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateCentralPurchaseOrderDto,
  ) {
    return this.service.createCentralPurchaseOrder(actor, organizationId, dto);
  }

  @Post('imports/preview')
  @ShopRoles(ShopRole.OWNER, ShopRole.MANAGER, ShopRole.INVENTORY)
  previewImport(@CurrentUser() actor: JwtAccessPayload, @Body() dto: ImportPreviewDto) {
    return this.service.previewImport(actor, dto);
  }

  @Post('imports/:jobId/commit')
  @ShopRoles(ShopRole.OWNER, ShopRole.MANAGER)
  commitImport(@CurrentUser() actor: JwtAccessPayload, @Param('jobId') jobId: string) {
    return this.service.commitImport(actor, jobId);
  }

  @Get('exports/:kind')
  @ShopRoles(ShopRole.OWNER, ShopRole.MANAGER, ShopRole.INVENTORY)
  async exportCsv(@CurrentUser() actor: JwtAccessPayload, @Param('kind') kind: DataImportKind) {
    if (!Object.values(DataImportKind).includes(kind)) return { kind, csv: '' };
    return { kind, csv: await this.service.exportCsv(actor, kind) };
  }

  @Get('webhooks/deliveries')
  @ShopRoles(ShopRole.OWNER, ShopRole.MANAGER)
  listWebhookDeliveries(@CurrentUser() actor: JwtAccessPayload, @Query('endpointId') endpointId?: string) {
    return this.service.listWebhookDeliveries(actor, endpointId);
  }

  @Post('webhooks/endpoints/:endpointId/rotate-secret')
  @ShopRoles(ShopRole.OWNER, ShopRole.MANAGER)
  rotateWebhookSecret(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('endpointId') endpointId: string,
    @Body() dto: RotateWebhookSecretDto,
  ) {
    return this.service.rotateWebhookSecret(actor, endpointId, dto.reason);
  }

  @Post('webhooks/deliveries/:deliveryId/replay')
  @ShopRoles(ShopRole.OWNER, ShopRole.MANAGER)
  replayWebhookDelivery(@CurrentUser() actor: JwtAccessPayload, @Param('deliveryId') deliveryId: string) {
    return this.service.replayWebhookDelivery(actor, deliveryId);
  }

  @Get('system/tenants')
  @SystemRoles(SystemRole.SUPER_ADMIN)
  systemTenants(@CurrentUser() actor: JwtAccessPayload, @Query('q') query?: string) {
    return this.service.systemTenants(actor, query);
  }

  @Get('system/tenants/:shopId/diagnostics')
  @SystemRoles(SystemRole.SUPER_ADMIN)
  systemDiagnostics(@CurrentUser() actor: JwtAccessPayload, @Param('shopId') shopId: string) {
    return this.service.systemDiagnostics(actor, shopId);
  }

  @Put('system/tenants/:shopId/subscription')
  @SystemRoles(SystemRole.SUPER_ADMIN)
  updateSystemSubscription(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('shopId') shopId: string,
    @Body() dto: SystemSubscriptionUpdateDto,
  ) {
    return this.service.updateSystemSubscription(actor, shopId, dto);
  }

  @Put('system/tenants/:shopId/feature')
  @SystemRoles(SystemRole.SUPER_ADMIN)
  updateSystemFeatureFlag(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('shopId') shopId: string,
    @Body() dto: SystemFeatureFlagUpdateDto,
  ) {
    return this.service.updateSystemFeatureFlag(actor, shopId, dto);
  }
}
