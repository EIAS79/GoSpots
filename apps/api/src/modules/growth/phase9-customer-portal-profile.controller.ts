import { Body, Controller, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Param } from '@nestjs/common';
import {
  Phase9CustomerPortalProfileService,
  type PortalProfileUpdate,
} from './phase9-customer-portal-profile.service';

@ApiTags('growth-phase9-portal')
@Controller('growth/phase9/portal')
export class Phase9CustomerPortalProfileController {
  constructor(
    private readonly profile: Phase9CustomerPortalProfileService,
  ) {}

  @Put(':token/profile')
  update(
    @Param('token') token: string,
    @Body() dto: PortalProfileUpdate,
  ) {
    return this.profile.update(token, dto);
  }
}
