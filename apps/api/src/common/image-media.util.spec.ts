import { BadRequestException } from '@nestjs/common';
import {
  IMAGE_UPLOAD_MAX_BYTES,
  assertImageUploadFile,
  assertSafeMediaId,
  isLegacyUploadPath,
  mediaPathForId,
  parseMediaPath,
  sniffImageMime,
} from './image-media.util';

function png1x1(): Buffer {
  // Minimal valid 1×1 PNG
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

describe('image-media.util', () => {
  describe('sniffImageMime', () => {
    it('detects PNG magic bytes', () => {
      expect(sniffImageMime(png1x1())).toBe('image/png');
    });

    it('detects JPEG magic bytes', () => {
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
      expect(sniffImageMime(jpeg)).toBe('image/jpeg');
    });

    it('rejects non-image / too short buffers', () => {
      expect(sniffImageMime(Buffer.from('not-an-image!!!!'))).toBeNull();
      expect(sniffImageMime(Buffer.from([1, 2, 3]))).toBeNull();
    });

    it('detects WebP RIFF header', () => {
      const webp = Buffer.alloc(12);
      webp.write('RIFF', 0);
      webp.writeUInt32LE(4, 4);
      webp.write('WEBP', 8);
      expect(sniffImageMime(webp)).toBe('image/webp');
    });
  });

  describe('assertImageUploadFile', () => {
    it('accepts allowed MIME + matching magic bytes', () => {
      expect(() =>
        assertImageUploadFile({
          buffer: png1x1(),
          size: png1x1().length,
          mimetype: 'image/png',
        }),
      ).not.toThrow();
    });

    it('rejects when client MIME is allowlisted but body is not an image', () => {
      expect(() =>
        assertImageUploadFile({
          buffer: Buffer.from('<script>alert(1)</script>........'),
          size: 32,
          mimetype: 'image/jpeg',
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects oversize', () => {
      const buf = png1x1();
      expect(() =>
        assertImageUploadFile({
          buffer: buf,
          size: IMAGE_UPLOAD_MAX_BYTES + 1,
          mimetype: 'image/png',
        }),
      ).toThrow(BadRequestException);
    });

    it('rejects disallowed MIME', () => {
      expect(() =>
        assertImageUploadFile({
          buffer: png1x1(),
          size: 10,
          mimetype: 'image/svg+xml',
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('media id / path safety', () => {
    it('accepts cuid-like ids', () => {
      expect(assertSafeMediaId('clxyz0123456789abcdefgh')).toBe(
        'clxyz0123456789abcdefgh',
      );
      expect(mediaPathForId('clxyz0123456789abcdefgh')).toBe(
        '/media/clxyz0123456789abcdefgh',
      );
    });

    it('rejects path traversal and separators', () => {
      expect(() => assertSafeMediaId('../etc/passwd')).toThrow(
        BadRequestException,
      );
      expect(() => assertSafeMediaId('abc/def')).toThrow(BadRequestException);
      expect(() => assertSafeMediaId('..')).toThrow(BadRequestException);
      expect(parseMediaPath('/media/../secret')).toBeNull();
      expect(parseMediaPath('/media/clxyz0123456789abcdefgh')).toBe(
        'clxyz0123456789abcdefgh',
      );
    });

    it('legacy upload paths reject traversal', () => {
      expect(isLegacyUploadPath('/uploads/shop/a.png')).toBe(true);
      expect(isLegacyUploadPath('/uploads/../etc/passwd')).toBe(false);
      expect(isLegacyUploadPath('/media/x')).toBe(false);
    });
  });
});
