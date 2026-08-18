import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Phase9ReconciliationService } from './phase9-reconciliation.service';

@ApiTags('growth-phase9')
@Controller('growth/phase9/reconciliation')
@UseGuards(JwtAuthGuard)
export class Phase9ReconciliationController {
  constructor(private readonly reconciliation: Phase9ReconciliationService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MEMBERSHIP_READ)
  reconcile(@CurrentUser() actor: JwtAccessPayload) {
    return this.reconciliation.reconcile(actor);
  }
}
