import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Put,
  Get,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  CreateScheduleExceptionDto,
  PutWeeklyHoursDto,
  UpdateScheduleExceptionDto,
} from './dto/hours.dto';
import { HoursService } from './hours.service';

@ApiTags('hours')
@Controller('hours')
@UseGuards(JwtAuthGuard)
export class HoursController {
  constructor(private readonly hours: HoursService) {}

  @Get()
  getSchedule(@CurrentUser() user: JwtAccessPayload) {
    return this.hours.getSchedule(user);
  }

  @Put('weekly')
  @RequirePermissions(PERMISSIONS.HOURS_WRITE)
  putWeekly(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: PutWeeklyHoursDto,
  ) {
    return this.hours.putWeekly(user, dto);
  }

  @Post('exceptions')
  @RequirePermissions(PERMISSIONS.HOURS_WRITE)
  createException(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateScheduleExceptionDto,
  ) {
    return this.hours.createException(user, dto);
  }

  @Patch('exceptions/:id')
  @RequirePermissions(PERMISSIONS.HOURS_WRITE)
  updateException(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateScheduleExceptionDto,
  ) {
    return this.hours.updateException(user, id, dto);
  }

  @Delete('exceptions/:id')
  @RequirePermissions(PERMISSIONS.HOURS_WRITE)
  deleteException(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.hours.deleteException(user, id);
  }
}
