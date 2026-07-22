import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  defaultUploadsRoot,
  isLegacyUploadsStaticEnabled,
  isPathInsideRoot,
  legacyUploadsStaticBootWarning,
  resolveLegacyUploadDiskPath,
} from './legacy-uploads.util';

describe('legacy-uploads.util', () => {
  describe('isLegacyUploadsStaticEnabled', () => {
    it('defaults to true when unset/blank', () => {
      expect(isLegacyUploadsStaticEnabled({})).toBe(true);
      expect(isLegacyUploadsStaticEnabled({ LEGACY_UPLOADS_STATIC: '' })).toBe(
        true,
      );
      expect(
        isLegacyUploadsStaticEnabled({ LEGACY_UPLOADS_STATIC: '   ' }),
      ).toBe(true);
    });

    it('disables on false/0/off/no', () => {
      expect(
        isLegacyUploadsStaticEnabled({ LEGACY_UPLOADS_STATIC: 'false' }),
      ).toBe(false);
      expect(isLegacyUploadsStaticEnabled({ LEGACY_UPLOADS_STATIC: '0' })).toBe(
        false,
      );
      expect(
        isLegacyUploadsStaticEnabled({ LEGACY_UPLOADS_STATIC: 'OFF' }),
      ).toBe(false);
      expect(isLegacyUploadsStaticEnabled({ LEGACY_UPLOADS_STATIC: 'no' })).toBe(
        false,
      );
    });

    it('stays enabled on true/1/other', () => {
      expect(
        isLegacyUploadsStaticEnabled({ LEGACY_UPLOADS_STATIC: 'true' }),
      ).toBe(true);
      expect(isLegacyUploadsStaticEnabled({ LEGACY_UPLOADS_STATIC: '1' })).toBe(
        true,
      );
    });
  });

  describe('resolveLegacyUploadDiskPath', () => {
    const root = join(tmpdir(), `locora-uploads-test-${Date.now()}`);

    beforeAll(() => {
      mkdirSync(join(root, 'shop'), { recursive: true });
      writeFileSync(join(root, 'shop', 'a.png'), Buffer.from([1, 2, 3]));
    });

    afterAll(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it('resolves safe relative paths under uploads root', () => {
      const full = resolveLegacyUploadDiskPath('/uploads/shop/a.png', root);
      expect(full).toBe(join(root, 'shop', 'a.png'));
      expect(isPathInsideRoot(full!, root)).toBe(true);
    });

    it('rejects traversal and non-legacy paths', () => {
      expect(
        resolveLegacyUploadDiskPath('/uploads/../etc/passwd', root),
      ).toBeNull();
      expect(resolveLegacyUploadDiskPath('/media/abc', root)).toBeNull();
      expect(resolveLegacyUploadDiskPath('/uploads/', root)).toBeNull();
    });
  });

  describe('boot warning + default root', () => {
    it('mentions inventory + flag in warning', () => {
      const msg = legacyUploadsStaticBootWarning();
      expect(msg).toContain('LEGACY_UPLOADS_STATIC');
      expect(msg).toContain('inventory:legacy-uploads');
    });

    it('defaultUploadsRoot ends with uploads', () => {
      expect(defaultUploadsRoot('/app')).toMatch(/uploads$/);
    });
  });
});
