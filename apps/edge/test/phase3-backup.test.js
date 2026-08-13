import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { canonicalJson, sha256 } from '../src/canonical.js';
import { EdgeHub } from '../src/hub.js';
import { backupEdgeState, restoreEdgeState, verifyEdgeBackup } from '../src/maintenance.js';

function createEvent(entityId, label) {
  const payload = { label };
  return { eventId: randomUUID(), sourceDeviceId: 'phase3-pos', operationType: 'CHECK_CREATE', entityId, payload, payloadHash: sha256(canonicalJson(payload)), occurredAt: new Date().toISOString() };
}

test('verified backup restores SQLite state and encrypted cloud identity', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gospots-phase3-backup-'));
  const dbPath = join(dir, 'edge.db');
  const keyPath = join(dir, 'edge-master.key');
  const backupDir = join(dir, 'backup');
  const beforeId = randomUUID();
  const afterId = randomUUID();
  let hub = new EdgeHub({ dbPath, keyPath, pairToken: 'phase3' });
  const publicKey = hub.publicKeyPem();
  const before = hub.appendEvent(createEvent(beforeId, 'Before backup'));
  await backupEdgeState({ dbPath, keyPath, outDir: backupDir, revision: 'phase3-test' });
  assert.equal(verifyEdgeBackup({ backupDir }).revision, 'phase3-test');
  hub.appendEvent(createEvent(afterId, 'After backup'));
  hub.close();

  restoreEdgeState({ backupDir, dbPath, keyPath });
  hub = new EdgeHub({ dbPath, keyPath, pairToken: 'phase3' });
  try {
    assert.equal(hub.publicKeyPem(), publicKey);
    assert.equal(hub.store.listEvents(0).length, 1);
    assert.equal(hub.store.listEvents(0)[0].eventId, before.eventId);
    assert.equal(hub.store.getAggregate(beforeId).version, 1);
    assert.equal(hub.store.getAggregate(afterId), null);
  } finally {
    hub.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
