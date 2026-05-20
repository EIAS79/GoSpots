import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PERMISSIONS } from "../../common/permissions";
import { requireShopId } from "../../common/tenant";
import type { JwtAccessPayload } from "../auth/auth.service";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../../prisma/prisma.service";
import { assertGalleryImageFile, type GalleryImageUpload } from "./gallery-upload.util";
import { UpdateGalleryItemDto } from "./dto/gallery.dto";
import { MediaService } from "../media/media.service";

@Injectable()
export class GalleryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  private assert(actor: JwtAccessPayload, perm: string) {
    if (!actor.shopId) throw new ForbiddenException();
    const p = actor.perms ?? "";
    if (p !== "*" && !p.split(",").includes(perm)) {
      throw new ForbiddenException(`Missing ${perm}`);
    }
  }

  async list(actor: JwtAccessPayload) {
    this.assert(actor, PERMISSIONS.GALLERY_READ);
    const shopId = requireShopId(actor);
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { coverImage: true },
    });
    if (!shop) throw new NotFoundException();

    const items = await this.prisma.galleryItem.findMany({
      where: { shopId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return { coverImage: shop.coverImage, items };
  }

  async uploadCover(actor: JwtAccessPayload, file: GalleryImageUpload) {
    this.assert(actor, PERMISSIONS.GALLERY_WRITE);
    const shopId = requireShopId(actor);
    assertGalleryImageFile(file);
    const shopBefore = await this.prisma.shop.findUnique({
      where: { id: shopId },
      select: { coverImage: true },
    });
    const imageUrl = await this.media.replaceMediaPath(
      shopId,
      shopBefore?.coverImage,
      file,
    );
    const shop = await this.prisma.shop.update({
      where: { id: shopId },
      data: { coverImage: imageUrl },
      select: { coverImage: true },
    });
    await this.audit.record(actor, {
      section: "gallery",
      action: "gallery.cover.update",
      summary: "Updated venue marketing cover image",
      meta: { imageUrl },
    });
    return shop;
  }

  async uploadGalleryItem(
    actor: JwtAccessPayload,
    file: GalleryImageUpload,
    caption?: string,
  ) {
    this.assert(actor, PERMISSIONS.GALLERY_WRITE);
    const shopId = requireShopId(actor);
    assertGalleryImageFile(file);
    const imageUrl = await this.media.storeFromUpload(shopId, file);
    const maxOrder = await this.prisma.galleryItem.aggregate({
      where: { shopId },
      _max: { sortOrder: true },
    });
    const item = await this.prisma.galleryItem.create({
      data: {
        shopId,
        imageUrl,
        caption: caption?.trim() || null,
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      },
    });
    await this.audit.record(actor, {
      section: "gallery",
      action: "gallery.item.create",
      summary: "Added gallery photo",
      meta: { itemId: item.id },
    });
    return item;
  }

  async updateItem(
    actor: JwtAccessPayload,
    id: string,
    dto: UpdateGalleryItemDto,
  ) {
    this.assert(actor, PERMISSIONS.GALLERY_WRITE);
    const shopId = requireShopId(actor);
    const existing = await this.prisma.galleryItem.findFirst({
      where: { id, shopId },
    });
    if (!existing) throw new NotFoundException();

    return this.prisma.galleryItem.update({
      where: { id },
      data: {
        ...(dto.caption !== undefined && {
          caption: dto.caption?.trim() || null,
        }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async deleteItem(actor: JwtAccessPayload, id: string) {
    this.assert(actor, PERMISSIONS.GALLERY_WRITE);
    const shopId = requireShopId(actor);
    const existing = await this.prisma.galleryItem.findFirst({
      where: { id, shopId },
    });
    if (!existing) throw new NotFoundException();

    await this.media.deleteByMediaPath(existing.imageUrl);
    await this.prisma.galleryItem.delete({ where: { id } });
    await this.audit.record(actor, {
      section: "gallery",
      action: "gallery.item.delete",
      summary: "Removed gallery photo",
      meta: { itemId: id },
    });
    return { ok: true };
  }

  async useAsCover(actor: JwtAccessPayload, id: string) {
    this.assert(actor, PERMISSIONS.GALLERY_WRITE);
    const shopId = requireShopId(actor);
    const item = await this.prisma.galleryItem.findFirst({
      where: { id, shopId },
    });
    if (!item) throw new NotFoundException();

    const shop = await this.prisma.shop.update({
      where: { id: shopId },
      data: { coverImage: item.imageUrl },
      select: { coverImage: true },
    });
    return shop;
  }
}
