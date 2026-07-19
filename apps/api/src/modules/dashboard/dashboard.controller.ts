import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtAccessPayload } from '../auth/auth.service';
import { UpdateVenuePackDto } from '../auth/dto/auth.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  overview(@CurrentUser() user: JwtAccessPayload) {
    return this.dashboard.overview(user);
  }

  @Get('subscription')
  subscription(@CurrentUser() user: JwtAccessPayload) {
    return this.dashboard.subscription(user);
  }

  @Patch('subscription/pack')
  updatePack(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: UpdateVenuePackDto,
  ) {
    return this.dashboard.updatePack(user, dto);
  }
}
