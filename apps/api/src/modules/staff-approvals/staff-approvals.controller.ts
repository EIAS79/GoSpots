import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  ApproveWithManagerDto,
  CreateStaffActionRequestDto,
  ResolveStaffActionRequestDto,
} from './dto/staff-approvals.dto';
import { StaffApprovalsService } from './staff-approvals.service';

@ApiTags('staff-approvals')
@Controller('staff-approvals')
@UseGuards(JwtAuthGuard)
export class StaffApprovalsController {
  constructor(private readonly approvals: StaffApprovalsService) {}

  @Get()
  list(
    @CurrentUser() user: JwtAccessPayload,
    @Query('status') status?: string,
  ) {
    return this.approvals.list(user, status);
  }

  @Post()
  create(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateStaffActionRequestDto,
  ) {
    return this.approvals.create(user, dto);
  }

  @Post(':id/approve')
  approve(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: ResolveStaffActionRequestDto,
    @Headers('x-confirm-password') headerPassword?: string,
  ) {
    return this.approvals.approve(user, id, dto, headerPassword);
  }

  @Post(':id/approve-with-manager')
  approveWithManager(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: ApproveWithManagerDto,
  ) {
    return this.approvals.approveWithManager(user, id, dto);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: ResolveStaffActionRequestDto,
    @Headers('x-confirm-password') headerPassword?: string,
  ) {
    return this.approvals.reject(user, id, dto, headerPassword);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.approvals.cancel(user, id);
  }
}
