import {
  Body,
  Controller,
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
import { DeviceRegistryService } from './device-registry.service';
import { CreateDeviceDto, UpdateDeviceDto } from './dto/device.dto';

@ApiTags('devices')
@Controller('devices')
@UseGuards(JwtAuthGuard)
@RequirePermissions(PERMISSIONS.SHOP_MANAGE)
export class DeviceController {
  constructor(private readonly devices: DeviceRegistryService) {}

  @Get()
  list(@CurrentUser() user: JwtAccessPayload) {
    return this.devices.list(user);
  }

  @Post()
  create(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateDeviceDto,
  ) {
    return this.devices.create(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    return this.devices.update(user, id, dto);
  }

  @Post(':id/heartbeat')
  heartbeat(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.devices.heartbeat(user, id);
  }
}
