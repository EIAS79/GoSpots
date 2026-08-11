import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIntegrationJobDto } from './dto/integration.dto';
import {
  CurrentIntegrationAuth,
  IntegrationApiKeyGuard,
  RequireIntegrationScopes,
} from './integration-api-key.guard';
import type { IntegrationApiAuth } from './integration-api-key.guard';
import { IntegrationsService } from './integrations.service';

function pageSize(raw?: string) {
  const parsed = Number(raw ?? 50);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.trunc(parsed))) : 50;
}

@ApiTags('public-integration-v1')
@Controller('integrations/v1')
@Public()
@UseGuards(IntegrationApiKeyGuard)
export class IntegrationV1Controller {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  @Get('venue')
  @RequireIntegrationScopes('venue.read')
  async venue(@CurrentIntegrationAuth() auth: IntegrationApiAuth) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: auth.shopId },
      select: {
        id: true,
        name: true,
        slug: true,
        currency: true,
        timezone: true,
      },
    });
    return { data: shop };
  }

  @Get('resources')
  @RequireIntegrationScopes('resources.read')
  async resources(
    @CurrentIntegrationAuth() auth: IntegrationApiAuth,
    @Query('take') takeRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const take = pageSize(takeRaw);
    const rows = await this.prisma.resource.findMany({
      where: { shopId: auth.shopId },
      orderBy: { id: 'asc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        categoryId: true,
        sectionId: true,
        name: true,
        type: true,
        status: true,
        capacity: true,
        hourlyRate: true,
        updatedAt: true,
      },
    });
    const hasMore = rows.length > take;
    const data = rows.slice(0, take).map((row) => ({
      ...row,
      hourlyRate: row.hourlyRate.toFixed(4),
      updatedAt: row.updatedAt.toISOString(),
    }));
    return {
      data,
      page: {
        nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null,
        hasMore,
      },
    };
  }

  @Post('installations/:installationId/jobs')
  @RequireIntegrationScopes('integrations.jobs.write')
  enqueue(
    @CurrentIntegrationAuth() auth: IntegrationApiAuth,
    @Param('installationId') installationId: string,
    @Body() dto: CreateIntegrationJobDto,
  ) {
    return this.integrations.enqueueForShop(auth.shopId, installationId, dto, null);
  }
}
