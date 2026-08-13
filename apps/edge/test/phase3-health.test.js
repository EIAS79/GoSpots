import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { canonicalJson, sha256 } from '../src/canonical.js';
import { EdgeHub } from '../src/hub.js';

function event() {
  const payload = { label: 'health probe' };
  return {
    eventId: randomUUID(),
    sourceDeviceId: 'phase3-pos',
    operationType: 'CHECK_CREATE',
    entityId: randomUUID(),
    payload,
    payloadHash: sha256(canonicalJson(payload)),
    occurredAt: new Date().toISOString(),
  };
}

test('Edge cloud health persists outage and records recovery', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gospots-phase3-health-'));
  const dbPath = join(dir, 'edge.db');
  const keyPath = join(dir, 'edge-master.key');
  let hub = new EdgeHub({
    dbPath,
    keyPath,
    pairToken: 'phase3',
    cloudUrl: 'https://cloud.invalid',
    fetchImpl: async () => { throw new TypeError('simulated ENETUNREACH'); },
  });
  hub.store.setMeta('cloudDeviceId', 'phase3-cloud-device');
  hub.appendEvent(event());

  try {
    await hub.cloud.syncPending();
    assert.equal(hub.cloud.connectivityStatus().state, 'OFFLINE');
    assert.ok(hub.cloud.connectivityStatus().lastFailureAt);
    assert.match(hub.cloud.connectivityStatus().lastError ?? '', /ENETUNREACH/);
  } finally {
    hub.close();
  }

  hub = new EdgeHub({
    dbPath,
    keyPath,
    pairToken: 'phase3',
    cloudUrl: 'https://cloud.invalid',
    fetchImpl: async () => new Response(JSON.stringify({ syncState: 'SYNCED' }), { status: 200 }),
  });
  try {
    assert.equal(hub.cloud.connectivityStatus().state, 'OFFLINE');
    assert.ok(hub.cloud.connectivityStatus().lastFailureAt);
    await hub.cloud.syncPending();
    const recovered = hub.cloud.connectivityStatus();
    assert.equal(recovered.state, 'ONLINE');
    assert.ok(recovered.lastSuccessAt);
    assert.equal(recovered.lastError, null);
    assert.equal(hub.status().pendingEvents, 0);
  } finally {
    hub.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
