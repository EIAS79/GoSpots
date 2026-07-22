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
import type { GuestCheckStatus } from '@prisma/client';
import { PERMISSIONS } from '../../common/permissions';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  AttachGuestCheckDto,
  CreateGuestCheckDto,
  DetachGuestCheckDto,
  SettleGuestCheckDto,
  UpdateGuestCheckDto,
} from './dto/guest-check.dto';
import { GuestCheckService } from './guest-check.service';

@ApiTags('guest-checks')
@Controller('guest-checks')
@UseGuards(JwtAuthGuard)
export class GuestCheckController {
  constructor(private readonly guestChecks: GuestCheckService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  list(
    @CurrentUser() user: JwtAccessPayload,
    @Query('status') status?: string,
  ) {
    const normalized =
      status === 'ALL' ||
      status === 'OPEN' ||
      status === 'SETTLED' ||
      status === 'VOID'
        ? (status as GuestCheckStatus | 'ALL')
        : 'OPEN';
    return this.guestChecks.list(user, normalized);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ)
  get(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.guestChecks.get(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  create(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateGuestCheckDto,
  ) {
    return this.guestChecks.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  update(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateGuestCheckDto,
  ) {
    return this.guestChecks.update(user, id, dto);
  }

  @Post(':id/void')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  voidCheck(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.guestChecks.void(user, id);
  }

  @Post(':id/settle')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  settle(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: SettleGuestCheckDto,
  ) {
    return this.guestChecks.settle(user, id, dto);
  }

  @Post(':id/attach')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  attach(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: AttachGuestCheckDto,
  ) {
    return this.guestChecks.attach(user, id, dto);
  }

  @Post(':id/detach')
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE)
  detach(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: DetachGuestCheckDto,
  ) {
    return this.guestChecks.detach(user, id, dto);
  }
}
