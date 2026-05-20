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
import { ApiTags } from "@nestjs/swagger";
import { memoryStorage } from "multer";
import type { MenuImageUpload } from "./menu-upload.util";
import { PERMISSIONS } from "../../common/permissions";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { JwtAccessPayload } from "../auth/auth.service";
import {
  CreateMenuItemDto,
  CreateSectionDto,
  CreateTagDto,
  UpdateMenuItemDto,
  UpdateSectionDto,
} from "./dto/menu.dto";
import { MenuService } from "./menu.service";

@ApiTags("menu")
@Controller("menu")
@UseGuards(JwtAuthGuard)
export class MenuController {
  constructor(private readonly menu: MenuService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MENU_READ)
  getFull(@CurrentUser() user: JwtAccessPayload) {
    return this.menu.getFullMenu(user);
  }

  @Post("sections")
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  createSection(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateSectionDto) {
    return this.menu.createSection(user, dto);
  }

  @Patch("sections/:id")
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  updateSection(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.menu.updateSection(user, id, dto);
  }

  @Delete("sections/:id")
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  deleteSection(@CurrentUser() user: JwtAccessPayload, @Param("id") id: string) {
    return this.menu.deleteSection(user, id);
  }

  @Post("tags")
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  createTag(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateTagDto) {
    return this.menu.createTag(user, dto);
  }

  @Delete("tags/:id")
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  deleteTag(@CurrentUser() user: JwtAccessPayload, @Param("id") id: string) {
    return this.menu.deleteTag(user, id);
  }

  @Post("items")
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  createItem(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateMenuItemDto) {
    return this.menu.createItem(user, dto);
  }

  @Patch("items/:id")
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  updateItem(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menu.updateItem(user, id, dto);
  }

  @Post("items/:id/images/:slot")
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadItemImage(
    @CurrentUser() user: JwtAccessPayload,
    @Param("id") id: string,
    @Param("slot") slot: string,
    @UploadedFile() file: MenuImageUpload,
  ) {
    const imageSlot = slot === "2" ? "2" : "1";
    return this.menu.uploadItemImage(user, id, imageSlot, file);
  }

  @Delete("items/:id")
  @RequirePermissions(PERMISSIONS.MENU_WRITE)
  deleteItem(@CurrentUser() user: JwtAccessPayload, @Param("id") id: string) {
    return this.menu.deleteItem(user, id);
  }
}
