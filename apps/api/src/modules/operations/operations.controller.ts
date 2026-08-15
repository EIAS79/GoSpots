import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AttachGuestCheckDto,
  CancelOperationsSessionDto,
  CreateMaintenanceDto,
  CreateOperationsRatePlanDto,
  CreateOperationsWaitlistDto,
  CreateSessionGroupDto,
  ExtendOperationsSessionDto,
  ExpectedOperationsSessionVersionDto,
  MoveOperationsSessionDto,
  OperationsWaitlistActionDto,
  PauseOperationsSessionDto,
  SeatOperationsWaitlistDto,
  StartOperationsSessionDto,
  UpdateOperationsPolicyDto,
  UpdateOperationsRatePlanDto,
} from './dto/operations.dto';
import { LiveOperationsService } from './live-operations.service';
import { OperationsService } from './operations.service';

@ApiTags('operations')
@Controller('operations')
@UseGuards(JwtAuthGuard)
export class OperationsController {
  constructor(
    private readonly operations: OperationsService,
    private readonly live: LiveOperationsService,
  ) {}

  @Get('floor') @RequirePermissions(PERMISSIONS.RESOURCE_READ)
  floor(@CurrentUser() user: JwtAccessPayload) { return this.live.floor(user); }

  @Get('activity') @RequirePermissions(PERMISSIONS.RESOURCE_READ)
  activity(@CurrentUser() user: JwtAccessPayload) { return this.operations.activity(user); }

  @Get('handover') @RequirePermissions(PERMISSIONS.SESSION_READ)
  handover(@CurrentUser() user: JwtAccessPayload) { return this.live.handover(user); }

  @Get('policy') @RequirePermissions(PERMISSIONS.SETTINGS_READ)
  policy(@CurrentUser() user: JwtAccessPayload) { return this.live.getPolicy(user); }

  @Patch('policy') @RequirePermissions(PERMISSIONS.SETTINGS_WRITE)
  updatePolicy(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: UpdateOperationsPolicyDto,
  ) { return this.live.updatePolicy(user, dto); }

  @Get('rate-plans') @RequirePermissions(PERMISSIONS.RESOURCE_READ)
  rates(@CurrentUser() user: JwtAccessPayload) { return this.operations.listRatePlans(user); }

  @Post('rate-plans') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  createRate(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateOperationsRatePlanDto) { return this.operations.createRatePlan(user, dto); }

  @Patch('rate-plans/:id') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  updateRate(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateOperationsRatePlanDto,
  ) { return this.operations.updateRatePlan(user, id, dto); }

  @Post('session-groups') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  createGroup(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateSessionGroupDto) { return this.operations.createGroup(user, dto); }

  @Post('sessions/start') @RequirePermissions(PERMISSIONS.SESSION_WRITE)
  start(@CurrentUser() user: JwtAccessPayload, @Body() dto: StartOperationsSessionDto) { return this.live.start(user, dto); }

  @Post('sessions/:id/pause') @RequirePermissions(PERMISSIONS.SESSION_WRITE)
  pause(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: PauseOperationsSessionDto) { return this.live.pause(user, id, dto); }

  @Post('sessions/:id/resume') @RequirePermissions(PERMISSIONS.SESSION_WRITE)
  resume(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: ExpectedOperationsSessionVersionDto) { return this.live.resume(user, id, dto); }

  @Post('sessions/:id/move') @RequirePermissions(PERMISSIONS.SESSION_WRITE)
  move(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: MoveOperationsSessionDto) { return this.live.move(user, id, dto); }

  @Post('sessions/:id/extend') @RequirePermissions(PERMISSIONS.SESSION_WRITE)
  extend(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: ExtendOperationsSessionDto) { return this.live.extend(user, id, dto); }

  @Post('sessions/:id/finish') @RequirePermissions(PERMISSIONS.SESSION_WRITE)
  finish(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: ExpectedOperationsSessionVersionDto) { return this.live.finish(user, id, dto); }

  @Post('sessions/:id/cancel') @RequirePermissions(PERMISSIONS.SESSION_CANCEL)
  cancel(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: CancelOperationsSessionDto) { return this.live.cancel(user, id, dto); }

  @Post('sessions/:id/guest-check') @RequirePermissions(PERMISSIONS.SESSION_WRITE)
  attach(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: AttachGuestCheckDto) { return this.operations.attachGuestCheck(user, id, dto); }

  @Get('waitlist') @RequirePermissions(PERMISSIONS.SESSION_READ)
  waitlist(@CurrentUser() user: JwtAccessPayload) { return this.live.listWaitlist(user); }

  @Post('waitlist') @RequirePermissions(PERMISSIONS.SESSION_WRITE)
  createWaitlist(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateOperationsWaitlistDto) { return this.live.createWaitlist(user, dto); }

  @Post('waitlist/:id/notify') @RequirePermissions(PERMISSIONS.SESSION_WRITE)
  notifyWaitlist(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: OperationsWaitlistActionDto) { return this.live.notifyWaitlist(user, id, dto); }

  @Post('waitlist/:id/skip') @RequirePermissions(PERMISSIONS.SESSION_WRITE)
  skipWaitlist(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: OperationsWaitlistActionDto) { return this.live.skipWaitlist(user, id, dto); }

  @Post('waitlist/:id/cancel') @RequirePermissions(PERMISSIONS.SESSION_WRITE)
  cancelWaitlist(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: OperationsWaitlistActionDto) { return this.live.cancelWaitlist(user, id, dto); }

  @Post('waitlist/:id/expire') @RequirePermissions(PERMISSIONS.SESSION_WRITE)
  expireWaitlist(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: OperationsWaitlistActionDto) { return this.live.expireWaitlist(user, id, dto); }

  @Post('waitlist/:id/seat') @RequirePermissions(PERMISSIONS.SESSION_WRITE)
  seatWaitlist(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: SeatOperationsWaitlistDto) { return this.live.seatWaitlist(user, id, dto); }

  @Post('maintenance') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  maintenance(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateMaintenanceDto) { return this.live.startMaintenance(user, dto); }

  @Delete('maintenance/:id') @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  finishMaintenance(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) { return this.live.finishMaintenance(user, id); }
}
