import { BadRequestException } from '@nestjs/common';
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

export type ImageUploadFile = {
  buffer: Buffer;
  size: number;
  mimetype: string;
};

const MAX_DIMENSION = 1920;
const WEBP_QUALITY = 78;

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
  return `/media/${id}`;
}

export function parseMediaPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  const match = trimmed.match(/^\/?media\/([^/?#]+)$/i);
  return match?.[1] ?? null;
}

export function isLegacyUploadPath(path: string | null | undefined): boolean {
  return !!path && path.startsWith('/uploads/');
}
