import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Phase14AnalyticsService } from './phase14-analytics.service';

@ApiTags('analytics-phase14')
@Controller('growth/analytics/phase14')
@UseGuards(JwtAuthGuard)
@RequirePermissions(PERMISSIONS.REPORT_READ)
export class Phase14AnalyticsController {
  constructor(private readonly analytics: Phase14AnalyticsService) {}

  @Get('metrics')
  metrics() {
    return this.analytics.metricDictionary();
  }

  @Get('workspace')
  workspace(
    @CurrentUser() actor: JwtAccessPayload,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    return this.analytics.workspace(actor, fromDate, toDate);
  }

  @Get('reconciliation')
  reconciliation(
    @CurrentUser() actor: JwtAccessPayload,
    @Query('fromDate') fromDate: string,
    @Query('toDate') toDate: string,
  ) {
    return this.analytics.reconciliationOnly(actor, fromDate, toDate);
  }
}
