import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { JwtAccessPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateApprovalRequestV2Dto,
  CreateShiftSwapRequestDto,
  DecideApprovalRequestV2Dto,
  DecideShiftSwapRequestDto,
  SetOperatorCredentialDto,
  SwitchOperatorDto,
  UpdateApprovalPolicyDto,
  UpdateStaffEmploymentProfileDto,
  UpdateStaffNotificationRuleDto,
  UpdateWorkforcePolicyDto,
} from './dto/phase10-accountability.dto';
import { Phase10AccountabilityService } from './phase10-accountability.service';

@ApiTags('workforce-phase10')
@Controller('workforce/phase10')
@UseGuards(JwtAuthGuard)
export class Phase10AccountabilityController {
  constructor(private readonly accountability: Phase10AccountabilityService) {}

  @Get('staff')
  staff(@CurrentUser() actor: JwtAccessPayload) {
    return this.accountability.listProfiles(actor);
  }

  @Patch('staff/:membershipId')
  updateStaff(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateStaffEmploymentProfileDto,
  ) {
    return this.accountability.updateProfile(actor, membershipId, dto);
  }

  @Put('operator-credentials')
  credential(
    @CurrentUser() actor: JwtAccessPayload,
    @Body() dto: SetOperatorCredentialDto,
  ) {
    return this.accountability.setOperatorCredential(actor, dto);
  }

  @Post('operator-switch')
  operatorSwitch(
    @CurrentUser() actor: JwtAccessPayload,
    @Body() dto: SwitchOperatorDto,
  ) {
    return this.accountability.switchOperator(actor, dto);
  }

  @Get('approval-policies')
  policies(@CurrentUser() actor: JwtAccessPayload) {
    return this.accountability.listApprovalPolicies(actor);
  }

  @Put('approval-policies')
  policy(
    @CurrentUser() actor: JwtAccessPayload,
    @Body() dto: UpdateApprovalPolicyDto,
  ) {
    return this.accountability.updateApprovalPolicy(actor, dto);
  }

  @Get('approvals')
  approvals(
    @CurrentUser() actor: JwtAccessPayload,
    @Query('status') status?: string,
  ) {
    return this.accountability.listApprovalRequests(actor, status);
  }

  @Post('approvals')
  requestApproval(
    @CurrentUser() actor: JwtAccessPayload,
    @Body() dto: CreateApprovalRequestV2Dto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.accountability.createApprovalRequest(actor, dto, idempotencyKey);
  }

  @Post('approvals/:id/decision')
  decideApproval(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: DecideApprovalRequestV2Dto,
    @Headers('x-confirm-password') headerPassword?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.accountability.decideApprovalRequest(
      actor,
      id,
      dto,
      headerPassword,
      idempotencyKey,
    );
  }

  @Get('notification-rules')
  notificationRules(@CurrentUser() actor: JwtAccessPayload) {
    return this.accountability.listNotificationRules(actor);
  }

  @Put('notification-rules')
  notificationRule(
    @CurrentUser() actor: JwtAccessPayload,
    @Body() dto: UpdateStaffNotificationRuleDto,
  ) {
    return this.accountability.updateNotificationRule(actor, dto);
  }

  @Get('policy')
  workforcePolicy(@CurrentUser() actor: JwtAccessPayload) {
    return this.accountability.getWorkforcePolicy(actor);
  }

  @Put('policy')
  updateWorkforcePolicy(
    @CurrentUser() actor: JwtAccessPayload,
    @Body() dto: UpdateWorkforcePolicyDto,
  ) {
    return this.accountability.updateWorkforcePolicy(actor, dto);
  }

  @Get('shift-swaps')
  shiftSwaps(@CurrentUser() actor: JwtAccessPayload) {
    return this.accountability.listShiftSwaps(actor);
  }

  @Post('shift-swaps')
  shiftSwap(
    @CurrentUser() actor: JwtAccessPayload,
    @Body() dto: CreateShiftSwapRequestDto,
  ) {
    return this.accountability.createShiftSwap(actor, dto);
  }

  @Post('shift-swaps/:id/decision')
  shiftSwapDecision(
    @CurrentUser() actor: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: DecideShiftSwapRequestDto,
  ) {
    return this.accountability.decideShiftSwap(actor, id, dto);
  }

  @Get('accountability')
  accountabilityFeed(
    @CurrentUser() actor: JwtAccessPayload,
    @Query('take') take?: string,
  ) {
    return this.accountability.accountabilityFeed(actor, Number(take ?? 100));
  }

  @Get('performance')
  performance(
    @CurrentUser() actor: JwtAccessPayload,
    @Query('days') days?: string,
  ) {
    return this.accountability.performance(actor, Number(days ?? 30));
  }
}
