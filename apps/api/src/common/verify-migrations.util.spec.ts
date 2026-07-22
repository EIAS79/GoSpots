import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  compareMigrationSets,
  evaluateGuestTokenHashSpot,
  evaluateMoneyDecimalSpot,
  listMigrationDirNames,
} from './verify-migrations.util';

describe('verify-migrations.util', () => {
  describe('listMigrationDirNames', () => {
    it('returns sorted directory names and ignores files', () => {
      const root = join(
        tmpdir(),
        `verify-mig-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      );
      mkdirSync(root, { recursive: true });
      try {
        mkdirSync(join(root, '20260721020000_mail_outbox'));
        mkdirSync(join(root, '20260720210000_billing_webhook_events'));
        writeFileSync(join(root, 'migration_lock.toml'), 'provider = "postgresql"\n');
        expect(listMigrationDirNames(root)).toEqual([
          '20260720210000_billing_webhook_events',
          '20260721020000_mail_outbox',
        ]);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });

    it('returns [] when root missing', () => {
      expect(listMigrationDirNames(join(tmpdir(), 'no-such-mig-root-xyz'))).toEqual(
        [],
      );
    });
  });

  describe('compareMigrationSets', () => {
    it('ok when every disk folder is applied', () => {
      const diff = compareMigrationSets(
        ['a', 'b'],
        ['b', 'a', 'legacy_extra'],
      );
      expect(diff.ok).toBe(true);
      expect(diff.pendingOnDb).toEqual([]);
      expect(diff.extraOnDb).toEqual(['legacy_extra']);
    });

    it('not ok when disk has pending folders', () => {
      const diff = compareMigrationSets(['a', 'b', 'c'], ['a']);
      expect(diff.ok).toBe(false);
      expect(diff.pendingOnDb).toEqual(['b', 'c']);
    });
  });

  describe('spot evaluations', () => {
    it('money null spot fails when unexpected nulls exist', () => {
      expect(evaluateMoneyDecimalSpot({ unexpectedNullMoneyRows: 0 }).ok).toBe(
        true,
      );
      expect(evaluateMoneyDecimalSpot({ unexpectedNullMoneyRows: 2 }).ok).toBe(
        false,
      );
    });

    it('guest hash spot stays ok (informational) even with leftovers', () => {
      const r = evaluateGuestTokenHashSpot({ plaintextWithoutHash: 3 });
      expect(r.ok).toBe(true);
      expect(r.detail).toContain('3');
    });
  });
});
