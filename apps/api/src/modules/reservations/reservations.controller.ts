import {
  Body,
  Controller,
  Delete,
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
  CreateReservationDto,
  ReservationQueryDto,
  ScheduleQueryDto,
  UpdateReservationDto,
} from './dto/reservations.dto';
import { ReservationsService } from './reservations.service';

@ApiTags('reservations')
@Controller('reservations')
@UseGuards(JwtAuthGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RESERVATION_READ)
  list(
    @CurrentUser() user: JwtAccessPayload,
    @Query() query: ReservationQueryDto,
  ) {
    return this.reservations.list(user, query);
  }

  @Get('schedule')
  @RequirePermissions(PERMISSIONS.RESERVATION_READ)
  schedule(
    @CurrentUser() user: JwtAccessPayload,
    @Query() query: ScheduleQueryDto,
  ) {
    return this.reservations.getSchedule(user, query);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  create(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateReservationDto,
  ) {
    return this.reservations.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  update(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateReservationDto,
  ) {
    return this.reservations.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  delete(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.reservations.delete(user, id);
  }
}
