import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  CreateStaffEventRequestDto,
  EventRequestQueryDto,
  ReviewEventRequestDto,
} from './dto/event-requests.dto';
import { EventRequestsService } from './event-requests.service';

@ApiTags('event-requests')
@Controller('event-requests')
@UseGuards(JwtAuthGuard)
export class EventRequestsController {
  constructor(private readonly events: EventRequestsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RESERVATION_READ)
  list(
    @CurrentUser() user: JwtAccessPayload,
    @Query() query: EventRequestQueryDto,
  ) {
    return this.events.list(user, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  createStaff(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateStaffEventRequestDto,
  ) {
    return this.events.createStaff(user, dto);
  }

  @Patch(':id/review')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  review(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: ReviewEventRequestDto,
  ) {
    return this.events.review(user, id, dto);
  }

  @Patch(':id/cancel')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  cancel(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.events.cancel(user, id);
  }
}
