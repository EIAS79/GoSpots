import {
  BadRequestException,
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
import {
  hashIdempotencyRequest,
  withClientIdempotency,
} from '../../common/idempotency.util';
import { PERMISSIONS } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import { FeatureFlagGuard } from '../foundation/feature-flag.guard';
import { RequireFeature } from '../foundation/require-feature.decorator';
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
@UseGuards(JwtAuthGuard, FeatureFlagGuard)
@RequireFeature('integrations_v1')
@RequirePermissions(PERMISSIONS.SHOP_MANAGE)
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly prisma: PrismaService,
  ) {}

  private shopId(user: JwtAccessPayload): string {
    if (!user.shopId) {
      throw new BadRequestException('Venue context is required.');
    }
    return user.shopId;
  }

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
    return withClientIdempotency(
      this.prisma,
      {
        shopId: this.shopId(user),
        // IntegrationJob's durable uniqueness is scoped to installation as
        // well as Shop. Preserve that namespace in the canonical operation.
        scope: `integrations.jobs.enqueue:${id}`,
        key: dto.idempotencyKey,
        requestHash: hashIdempotencyRequest({ installationId: id, dto }),
      },
      () => this.integrations.enqueueJob(user, id, dto),
    );
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
