import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  CreateSeatingTableGroupDto,
  UpdateSeatingTableGroupDto,
} from './dto/seating-tables.dto';
import { SeatingTablesService } from './seating-tables.service';

@ApiTags('seating-tables')
@Controller('seating-tables')
@UseGuards(JwtAuthGuard)
export class SeatingTablesController {
  constructor(private readonly seating: SeatingTablesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.RESERVATION_READ)
  list(@CurrentUser() user: JwtAccessPayload) {
    return this.seating.list(user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  create(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateSeatingTableGroupDto,
  ) {
    return this.seating.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  update(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateSeatingTableGroupDto,
  ) {
    return this.seating.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.RESERVATION_WRITE)
  delete(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.seating.delete(user, id);
  }
}
