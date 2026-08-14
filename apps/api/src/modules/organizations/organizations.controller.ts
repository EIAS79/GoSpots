import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  AddOrganizationMemberDto,
  AddOrganizationShopDto,
  CreateOrganizationDto,
  UpdateOrganizationMemberDto,
  UpdateOrganizationSettingsDto,
  UpdateOrganizationShopDto,
} from './dto/organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  list(@CurrentUser() user: JwtAccessPayload) {
    return this.organizations.list(user);
  }

  @Post()
  create(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateOrganizationDto) {
    return this.organizations.create(user, dto);
  }

  @Post(':organizationId/shops')
  addShop(
    @CurrentUser() user: JwtAccessPayload,
    @Param('organizationId') organizationId: string,
    @Body() dto: AddOrganizationShopDto,
  ) {
    return this.organizations.addShop(user, organizationId, dto);
  }

  @Patch(':organizationId/shops/:shopId')
  updateShop(
    @CurrentUser() user: JwtAccessPayload,
    @Param('organizationId') organizationId: string,
    @Param('shopId') shopId: string,
    @Body() dto: UpdateOrganizationShopDto,
  ) {
    return this.organizations.updateShop(user, organizationId, shopId, dto);
  }

  @Patch(':organizationId/settings')
  updateSettings(
    @CurrentUser() user: JwtAccessPayload,
    @Param('organizationId') organizationId: string,
    @Body() dto: UpdateOrganizationSettingsDto,
  ) {
    return this.organizations.updateSettings(user, organizationId, dto);
  }

  @Get(':organizationId/shops/:shopId/resolved-settings')
  resolvedSettings(
    @CurrentUser() user: JwtAccessPayload,
    @Param('organizationId') organizationId: string,
    @Param('shopId') shopId: string,
  ) {
    return this.organizations.resolvedShopSettings(user, organizationId, shopId);
  }

  @Post(':organizationId/members')
  addMember(
    @CurrentUser() user: JwtAccessPayload,
    @Param('organizationId') organizationId: string,
    @Body() dto: AddOrganizationMemberDto,
  ) {
    return this.organizations.addMember(user, organizationId, dto);
  }

  @Patch(':organizationId/members/:memberId')
  updateMember(
    @CurrentUser() user: JwtAccessPayload,
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateOrganizationMemberDto,
  ) {
    return this.organizations.updateMember(user, organizationId, memberId, dto);
  }

  @Get(':organizationId/analytics')
  analytics(
    @CurrentUser() user: JwtAccessPayload,
    @Param('organizationId') organizationId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.organizations.groupAnalytics(user, organizationId, from, to);
  }
}
