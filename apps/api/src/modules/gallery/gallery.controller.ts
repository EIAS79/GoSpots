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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import { PERMISSIONS } from '../../common/permissions';
import { UpdateGalleryItemDto } from './dto/gallery.dto';
import { GalleryService } from './gallery.service';
import type { GalleryImageUpload } from './gallery-upload.util';

@ApiTags('gallery')
@Controller('gallery')
@UseGuards(JwtAuthGuard)
export class GalleryController {
  constructor(private readonly gallery: GalleryService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.GALLERY_READ)
  list(@CurrentUser() user: JwtAccessPayload) {
    return this.gallery.list(user);
  }

  @Post('cover')
  @RequirePermissions(PERMISSIONS.GALLERY_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadCover(
    @CurrentUser() user: JwtAccessPayload,
    @UploadedFile() file: GalleryImageUpload,
  ) {
    return this.gallery.uploadCover(user, file);
  }

  @Post('items')
  @RequirePermissions(PERMISSIONS.GALLERY_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  uploadItem(
    @CurrentUser() user: JwtAccessPayload,
    @UploadedFile() file: GalleryImageUpload,
    @Body('caption') caption?: string,
  ) {
    return this.gallery.uploadGalleryItem(user, file, caption);
  }

  @Patch('items/:id')
  @RequirePermissions(PERMISSIONS.GALLERY_WRITE)
  updateItem(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateGalleryItemDto,
  ) {
    return this.gallery.updateItem(user, id, dto);
  }

  @Post('items/:id/use-as-cover')
  @RequirePermissions(PERMISSIONS.GALLERY_WRITE)
  useAsCover(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.gallery.useAsCover(user, id);
  }

  @Delete('items/:id')
  @RequirePermissions(PERMISSIONS.GALLERY_WRITE)
  deleteItem(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string) {
    return this.gallery.deleteItem(user, id);
  }
}
