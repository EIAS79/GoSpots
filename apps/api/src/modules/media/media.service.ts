import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertImageUploadFile,
  compressImageForStorage,
  decompressStoredImage,
  isLegacyUploadPath,
  mediaPathForId,
  parseMediaPath,
  type ImageUploadFile,
} from '../../common/image-media.util';

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  async storeFromUpload(
    shopId: string,
    file: ImageUploadFile,
  ): Promise<string> {
    assertImageUploadFile(file);
    const compressed = await compressImageForStorage(file.buffer);
    const row = await this.prisma.storedImage.create({
      data: {
        shopId,
        mime: compressed.mime,
        encoding: compressed.encoding,
        width: compressed.width,
        height: compressed.height,
        byteSize: compressed.byteSize,
        data: Uint8Array.from(compressed.data),
      },
    });
    return mediaPathForId(row.id);
  }

  async deleteByMediaPath(path: string | null | undefined) {
    const id = parseMediaPath(path);
    if (!id) return;
    await this.prisma.storedImage
      .delete({ where: { id } })
      .catch(() => undefined);
  }

  async replaceMediaPath(
    shopId: string,
    oldPath: string | null | undefined,
    file: ImageUploadFile,
  ) {
    const nextPath = await this.storeFromUpload(shopId, file);
    try {
      await this.deleteByMediaPath(oldPath);
    } catch {
      // Keep the new image even if old media cleanup fails.
    }
    return nextPath;
  }

  async getRenderableImage(mediaId: string) {
    const row = await this.prisma.storedImage.findUnique({
      where: { id: mediaId },
    });
    if (!row) throw new NotFoundException('Image not found.');
    const raw = row.data instanceof Buffer ? row.data : Buffer.from(row.data);
    let buffer: Buffer;
    try {
      buffer = decompressStoredImage(raw, row.encoding);
    } catch {
      throw new NotFoundException('Image data is corrupted.');
    }
    if (!buffer?.length) {
      throw new NotFoundException('Image data is empty.');
    }
    return {
      buffer,
      mime: row.mime,
      etag: `"${row.id}-${row.byteSize}"`,
    };
  }

  /** No-op for legacy disk paths; callers keep old URL until re-uploaded. */
  legacyPathStillValid(path: string | null | undefined) {
    return isLegacyUploadPath(path);
  }
}
