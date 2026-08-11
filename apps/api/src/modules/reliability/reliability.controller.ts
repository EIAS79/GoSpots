import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReliabilityService } from './reliability.service';

@ApiTags('reliability')
@Controller('reliability')
@UseGuards(JwtAuthGuard)
@RequirePermissions(PERMISSIONS.RELIABILITY_READ)
export class ReliabilityController {
  constructor(private readonly reliability: ReliabilityService) {}

  @Get('readiness')
  readiness(@CurrentUser() user: JwtAccessPayload) {
    return this.reliability.readiness(user);
  }
}
