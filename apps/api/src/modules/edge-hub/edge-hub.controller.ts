import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import { ApplyOfflineOperationDto } from '../offline-sync/dto/offline-operation.dto';
import { EdgeHeartbeatDto, RegisterEdgeHubDto } from './dto/edge-hub.dto';
import { EdgeHubService } from './edge-hub.service';
import { EdgeOperatorSnapshotService } from './edge-operator-snapshot.service';

@ApiTags('edge-hub')
@Controller('edge-hub')
export class EdgeHubController {
  constructor(
    private readonly edge: EdgeHubService,
    private readonly operators: EdgeOperatorSnapshotService,
  ) {}

  @Post('devices/:deviceId/provision')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions(PERMISSIONS.SHOP_MANAGE)
  provision(@CurrentUser() actor: JwtAccessPayload, @Param('deviceId') deviceId: string) {
    return this.edge.createProvisioningToken(actor, deviceId);
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterEdgeHubDto) { return this.edge.register(dto); }

  @Public()
  @Post('cloud/heartbeat')
  heartbeat(@Headers() headers: Record<string, string | string[] | undefined>, @Body() dto: EdgeHeartbeatDto) {
    return this.edge.heartbeat(headers, dto);
  }

  @Public()
  @Post('cloud/snapshot')
  snapshot(@Headers() headers: Record<string, string | string[] | undefined>, @Body() body: { cursor?: string | null }) {
    return this.edge.snapshot(headers, body ?? {});
  }

  @Public()
  @Post('cloud/operators')
  async operatorSnapshot(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: { cursor?: string | null },
  ) {
    const { device } = await this.edge.authenticateSignedRequest(headers, 'POST', '/edge-hub/cloud/operators', body ?? {});
    return { operators: await this.operators.snapshot(device.shopId), generatedAt: new Date().toISOString() };
  }

  @Public()
  @Post('cloud/replay')
  replay(@Headers() headers: Record<string, string | string[] | undefined>, @Body() dto: ApplyOfflineOperationDto) {
    return this.edge.replay(headers, dto);
  }
}
