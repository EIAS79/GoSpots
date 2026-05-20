import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiTags } from "@nestjs/swagger";
import { PERMISSIONS } from "../../common/permissions";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { JwtAccessPayload } from "../auth/auth.service";
import {
  AddUnitsDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  UpdateResourceDto,
} from "./dto/resources.dto";
import type { ResourceImageUpload } from "./resources-upload.util";
import { ResourcesService } from "./resources.service";

@ApiTags("resources")
@Controller("resources")
@UseGuards(JwtAuthGuard)
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get("catalog")
  @RequirePermissions(PERMISSIONS.RESOURCE_READ)
  getCatalog(@CurrentUser() user: JwtAccessPayload) {
    return this.resources.getCatalog(user);
  }

  @Get("gaming-menu")
  @RequirePermissions(PERMISSIONS.RESOURCE_READ)
  getGamingMenu(@CurrentUser() user: JwtAccessPayload) {
    return this.resources.getGamingMenu(user);
  }

  @Post("categories")
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  createCategory(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.resources.createCategory(user, dto);
  }

  @Patch("categories/:id")
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  updateCategory(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.resources.updateCategory(user, id, dto);
  }

  @Delete("categories/:id")
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  deleteCategory(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
  ) {
    return this.resources.deleteCategory(user, id);
  }

  @Post("categories/:id/units")
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  addUnits(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
    @Body() dto: AddUnitsDto,
  ) {
    return this.resources.addUnits(user, id, dto);
  }

  @Post("categories/:id/images/:slot")
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadImage(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
    @Param("slot") slot: string,
    @UploadedFile() file: ResourceImageUpload,
  ) {
    const imageSlot = slot === "2" ? "2" : "1";
    return this.resources.uploadCategoryImage(user, id, imageSlot, file);
  }

  @Patch("units/:id")
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  updateUnit(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
    @Body() dto: UpdateResourceDto,
  ) {
    return this.resources.updateResource(user, id, dto);
  }

  @Delete("units/:id")
  @RequirePermissions(PERMISSIONS.RESOURCE_WRITE)
  deleteUnit(@CurrentUser() user: JwtAccessPayload, @Param("id") id: string) {
    return this.resources.deleteResource(user, id);
  }
}
