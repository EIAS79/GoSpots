import { Body, Controller, ForbiddenException, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../auth/auth.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import { ApplyOfflineOperationDto } from './dto/offline-operation.dto';
import { OfflineSyncService } from './offline-sync.service';

@ApiTags('offline-sync')
@Controller('offline-sync')
export class OfflineSyncController {
  constructor(
    private readonly offlineSync: OfflineSyncService,
    private readonly flags: FeatureFlagService,
  ) {}

  @Get('status')
  async status(@CurrentUser() actor: JwtAccessPayload) {
    if (!actor.shopId) throw new ForbiddenException();
    return {
      enabled: await this.flags.isFeatureEnabled(actor.shopId, 'offline_lite'),
    };
  }

  @Post('operations')
  applyOperation(
    @CurrentUser() actor: JwtAccessPayload,
    @Body() dto: ApplyOfflineOperationDto,
  ) {
    return this.offlineSync.applyOperation(actor, dto);
  }
}
