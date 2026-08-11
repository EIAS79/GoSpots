import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  CreateConnectorInstallationDto,
  CreateIntegrationCredentialDto,
  CreateIntegrationJobDto,
  CreateWebhookEndpointDto,
  UpdateConnectorInstallationDto,
  UpsertIntegrationMappingDto,
} from './dto/integration.dto';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@Controller('integrations')
@UseGuards(JwtAuthGuard)
@RequirePermissions(PERMISSIONS.SHOP_MANAGE)
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('providers')
  providers(@CurrentUser() user: JwtAccessPayload) {
    return this.integrations.listProviders(user);
  }

  @Get('installations')
  installations(@CurrentUser() user: JwtAccessPayload) {
    return this.integrations.listInstallations(user);
  }

  @Post('installations')
  createInstallation(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateConnectorInstallationDto,
  ) {
    return this.integrations.createInstallation(user, dto);
  }

  @Patch('installations/:id')
  updateInstallation(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateConnectorInstallationDto,
  ) {
    return this.integrations.updateInstallation(user, id, dto);
  }

  @Post('installations/:id/health')
  health(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.integrations.health(user, id);
  }

  @Post('installations/:id/mappings')
  mapping(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpsertIntegrationMappingDto,
  ) {
    return this.integrations.upsertMapping(user, id, dto);
  }

  @Post('installations/:id/jobs')
  enqueue(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: CreateIntegrationJobDto,
  ) {
    return this.integrations.enqueueJob(user, id, dto);
  }

  @Get('jobs')
  jobs(@CurrentUser() user: JwtAccessPayload, @Query('take') take?: string) {
    return this.integrations.listJobs(user, take ? Number(take) : 50);
  }

  @Post('jobs/:id/retry')
  retry(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.integrations.retryJob(user, id);
  }

  @Post('credentials')
  createCredential(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateIntegrationCredentialDto,
  ) {
    return this.integrations.createCredential(user, dto);
  }

  @Post('credentials/:id/revoke')
  revokeCredential(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.integrations.revokeCredential(user, id);
  }

  @Post('webhooks')
  webhook(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateWebhookEndpointDto,
  ) {
    return this.integrations.createWebhookEndpoint(user, dto);
  }
}
