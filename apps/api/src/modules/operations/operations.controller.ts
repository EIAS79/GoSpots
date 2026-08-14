import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AttachGuestCheckDto,
  CreateMaintenanceDto,
  CreateOperationsRatePlanDto,
  CreateSessionGroupDto,
  ExpectedOperationsSessionVersionDto,
  MoveOperationsSessionDto,
  PauseOperationsSessionDto,
  StartOperationsSessionDto,
} from './dto/operations.dto';
import { OperationsService } from './operations.service';

@ApiTags('operations')
@Controller('operations')
@UseGuards(JwtAuthGuard)
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('floor') @RequirePermissions(PERMISSIONS.RESOURCE_READ)
  floor(@CurrentUser() user: JwtAccessPayload) { return this.operations.floor(user); }

  @Get('activity') @RequirePermissions(PERMISSIONS.RESOURCE_READ)
  activity(@CurrentUser() user: JwtAccessPayload) { return this.operations.activity(user); }

  @Get('rate-plans') @RequirePermissions(PERMISSIONS.RESOURCE_READ)
  rates(@CurrentUser() user: JwtAccessPayload) { return this.operations.listRatePlans(user); }

  @Post('rate-plans') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  createRate(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateOperationsRatePlanDto) { return this.operations.createRatePlan(user, dto); }

  @Post('session-groups') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  createGroup(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateSessionGroupDto) { return this.operations.createGroup(user, dto); }

  @Post('sessions/start') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  start(@CurrentUser() user: JwtAccessPayload, @Body() dto: StartOperationsSessionDto) { return this.operations.start(user, dto); }

  @Post('sessions/:id/pause') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  pause(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: PauseOperationsSessionDto) { return this.operations.pause(user, id, dto); }

  @Post('sessions/:id/resume') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  resume(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: ExpectedOperationsSessionVersionDto) { return this.operations.resume(user, id, dto); }

  @Post('sessions/:id/move') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  move(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: MoveOperationsSessionDto) { return this.operations.move(user, id, dto); }

  @Post('sessions/:id/finish') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  finish(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: ExpectedOperationsSessionVersionDto) { return this.operations.finish(user, id, dto); }

  @Post('sessions/:id/guest-check') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  attach(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: AttachGuestCheckDto) { return this.operations.attachGuestCheck(user, id, dto); }

  @Post('maintenance') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  maintenance(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateMaintenanceDto) { return this.operations.startMaintenance(user, dto); }

  @Delete('maintenance/:id') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  finishMaintenance(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) { return this.operations.finishMaintenance(user, id); }
}
