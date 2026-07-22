import { BadRequestException } from '@nestjs/common';
import { memoryStorage } from 'multer';
import type { Options as MulterOptions } from 'multer';
import sharp from 'sharp';
import { gunzipSync, gzipSync } from 'zlib';

export const IMAGE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

export const IMAGE_UPLOAD_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

/** Opaque StoredImage ids (cuid / cuid2-like); reject path separators and traversal. */
const SAFE_MEDIA_ID = /^[a-z0-9_-]{8,64}$/i;

export type ImageUploadFile = {
  buffer: Buffer;
  size: number;
  mimetype: string;
};

const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 78;

/** Detect real image type from magic bytes (do not trust client Content-Type alone). */
export function sniffImageMime(buffer: Buffer): string | null {
  if (!buffer?.length || buffer.length < 12) return null;

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // GIF87a / GIF89a
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return 'image/gif';
  }
  // RIFF....WEBP
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  // ISO BMFF (AVIF): ....ftyp + brand avif/avis
  if (
    buffer.toString('ascii', 4, 8) === 'ftyp' &&
    buffer.length >= 12
  ) {
    const brand = buffer.toString('ascii', 8, 12);
    if (brand === 'avif' || brand === 'avis') {
      return 'image/avif';
    }
  }

  return null;
}

export function assertSafeMediaId(id: string): string {
  const trimmed = id.trim();
  if (
    !SAFE_MEDIA_ID.test(trimmed) ||
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\')
  ) {
    throw new BadRequestException('Invalid media id.');
  }
  return trimmed;
}

export function assertImageUploadFile(
  file: ImageUploadFile | undefined,
  label = 'Image',
) {
  if (!file?.buffer?.length) {
    throw new BadRequestException(`${label} file is required.`);
  }
  if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
    throw new BadRequestException(
      `${label} must be ${IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024)} MB or smaller.`,
    );
  }
  if (!IMAGE_UPLOAD_ALLOWED_MIME.has(file.mimetype)) {
    throw new BadRequestException('Use JPEG, PNG, WebP, GIF, or AVIF.');
  }
  const sniffed = sniffImageMime(file.buffer);
  if (!sniffed || !IMAGE_UPLOAD_ALLOWED_MIME.has(sniffed)) {
    throw new BadRequestException(
      `${label} content is not a valid JPEG, PNG, WebP, GIF, or AVIF.`,
    );
  }
}

/** Shared multer config for all image upload endpoints (memory + size + MIME filter). */
export function imageUploadMulterOptions(): MulterOptions {
  return {
    storage: memoryStorage(),
    limits: { fileSize: IMAGE_UPLOAD_MAX_BYTES, files: 1 },
    fileFilter(_req, file, cb) {
      if (!IMAGE_UPLOAD_ALLOWED_MIME.has(file.mimetype)) {
        cb(new BadRequestException('Use JPEG, PNG, WebP, GIF, or AVIF.'));
        return;
      }
      cb(null, true);
    },
  };
}

export type CompressedImagePayload = {
  data: Buffer;
  mime: string;
  encoding: string;
  width: number;
  height: number;
  byteSize: number;
};

/** Resize, encode WebP, then gzip for compact DB storage. */
export async function compressImageForStorage(
  input: Buffer,
): Promise<CompressedImagePayload> {
  let pipeline = sharp(input, { failOn: 'none', animated: false }).rotate();

  const meta = await pipeline.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
    pipeline = pipeline.resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const webp = await pipeline
    .webp({
      quality: WEBP_QUALITY,
      effort: 6,
      smartSubsample: true,
      nearLossless: false,
    })
    .toBuffer();

  const outMeta = await sharp(webp).metadata();
  const gzipped = gzipSync(webp, { level: 9 });

  return {
    data: gzipped,
    mime: 'image/webp',
    encoding: 'gzip',
    width: outMeta.width ?? 0,
    height: outMeta.height ?? 0,
    byteSize: gzipped.length,
  };
}

/** Decompress DB payload to bytes the browser can render. */
export function decompressStoredImage(data: Buffer, encoding: string): Buffer {
  if (encoding === 'gzip') {
    return gunzipSync(data);
  }
  return data;
}

export function mediaPathForId(id: string) {
  return `/media/${assertSafeMediaId(id)}`;
}

export function parseMediaPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  const match = trimmed.match(/^\/?media\/([^/?#]+)$/i);
  if (!match?.[1]) return null;
  try {
    return assertSafeMediaId(match[1]);
  } catch {
    return null;
  }
}

export function isLegacyUploadPath(path: string | null | undefined): boolean {
  if (!path) return false;
  // Strict prefix only — reject traversal disguised as /uploads/../…
  if (!path.startsWith('/uploads/')) return false;
  if (path.includes('..') || path.includes('\\') || path.includes('\0')) {
    return false;
  }
  return true;
}
