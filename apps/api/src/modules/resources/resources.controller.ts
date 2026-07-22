import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { imageUploadMulterOptions } from '../../common/image-media.util';
import { PERMISSIONS } from '../../common/permissions';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  AddUnitsDto,
  CreateCategoryDto,
  CreateGamingSectionDto,
  CreateDiningTableGroupDto,
  UpdateCategoryDto,
  UpdateDiningTableGroupDto,
  UpdateGamingSectionDto,
  UpdateResourceDto,
} from './dto/resources.dto';
import type { ResourceImageUpload } from './resources-upload.util';
import { ResourcesService } from './resources.service';

@ApiTags('resources')
@Controller('resources')
@UseGuards(JwtAuthGuard)
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get('catalog')
  @RequirePermissions(PERMISSIONS.RESOURCE_READ)
  getCatalog(@CurrentUser() user: JwtAccessPayload) {
    return this.resources.getCatalog(user);
  }

  @Get('gaming-menu')
  @RequirePermissions(PERMISSIONS.RESOURCE_READ)
  getGamingMenu(@CurrentUser() user: JwtAccessPayload) {
    return this.resources.getGamingMenu(user);
  }

  @Get('dining-menu')
  @RequirePermissions(PERMISSIONS.RESOURCE_READ)
  getDiningMenu(@CurrentUser() user: JwtAccessPayload) {
    return this.resources.getDiningMenu(user);
  }

  @Get('gaming-sections')
  @RequirePermissions(PERMISSIONS.RESOURCE_READ)
  listGamingSections(
    @CurrentUser() user: JwtAccessPayload,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.resources.listGamingSections(user, categoryId);
  }

  @Post('gaming-sections')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  createGamingSection(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateGamingSectionDto,
  ) {
    return this.resources.createGamingSection(user, dto);
  }

  @Patch('gaming-sections/:id')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  updateGamingSection(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateGamingSectionDto,
  ) {
    return this.resources.updateGamingSection(user, id, dto);
  }

  @Delete('gaming-sections/:id')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  deleteGamingSection(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.resources.deleteGamingSection(user, id);
  }

  @Post('gaming-sections/:id/image')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  @UseInterceptors(FileInterceptor('file', imageUploadMulterOptions()))
  uploadGamingSectionImage(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @UploadedFile() file: ResourceImageUpload,
  ) {
    return this.resources.uploadGamingSectionImage(user, id, file);
  }

  @Post('dining-table-groups')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  createDiningTableGroup(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateDiningTableGroupDto,
  ) {
    return this.resources.createDiningTableGroup(user, dto);
  }

  @Patch('dining-table-groups/:id')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  updateDiningTableGroup(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDiningTableGroupDto,
  ) {
    return this.resources.updateDiningTableGroup(user, id, dto);
  }

  @Delete('dining-table-groups/:id')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  deleteDiningTableGroup(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.resources.deleteDiningTableGroup(user, id);
  }

  @Post('dining-table-groups/:id/image')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  @UseInterceptors(FileInterceptor('file', imageUploadMulterOptions()))
  uploadDiningTableGroupImage(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @UploadedFile() file: ResourceImageUpload,
  ) {
    return this.resources.uploadDiningTableGroupImage(user, id, file);
  }

  @Post('categories')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  createCategory(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.resources.createCategory(user, dto);
  }

  @Patch('categories/:id')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  updateCategory(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.resources.updateCategory(user, id, dto);
  }

  @Delete('categories/:id')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  deleteCategory(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.resources.deleteCategory(user, id);
  }

  @Post('categories/:id/units')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  addUnits(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: AddUnitsDto,
  ) {
    return this.resources.addUnits(user, id, dto);
  }

  @Post('categories/:id/images/:slot')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  @UseInterceptors(FileInterceptor('file', imageUploadMulterOptions()))
  uploadImage(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Param('slot') slot: string,
    @UploadedFile() file: ResourceImageUpload,
  ) {
    const imageSlot = slot === '2' ? '2' : '1';
    return this.resources.uploadCategoryImage(user, id, imageSlot, file);
  }

  @Patch('units/:id')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  updateUnit(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateResourceDto,
  ) {
    return this.resources.updateResource(user, id, dto);
  }

  @Delete('units/:id')
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  deleteUnit(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.resources.deleteResource(user, id);
  }
}
