import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../auth/auth.service';
import { ApplyOfflineOperationDto } from './dto/offline-operation.dto';
import { OfflineSyncService } from './offline-sync.service';

@ApiTags('offline-sync')
@Controller('offline-sync')
export class OfflineSyncController {
  constructor(private readonly offlineSync: OfflineSyncService) {}

  @Get('status')
  status(@CurrentUser() actor: JwtAccessPayload) {
    return this.offlineSync.status(actor);
  }

  @Post('operations')
  applyOperation(
    @CurrentUser() actor: JwtAccessPayload,
    @Body() dto: ApplyOfflineOperationDto,
  ) {
    return this.offlineSync.applyOperation(actor, dto);
  }
}
