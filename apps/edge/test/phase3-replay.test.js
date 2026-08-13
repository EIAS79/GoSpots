import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { canonicalJson, sha256 } from '../src/canonical.js';
import { EdgeHub } from '../src/hub.js';

test('cloud replay includes canonical occurredAt and stable IDs', async () => {
  const replayBodies = [];
  const fakeFetch = async (url, options) => {
    const body = options?.body ? JSON.parse(options.body) : null;
    if (String(url).endsWith('/edge-hub/register')) {
      return new Response(JSON.stringify({ deviceId: 'edge-phase3', shopId: 'shop-phase3' }), { status: 201 });
    }
    if (String(url).endsWith('/edge-hub/cloud/replay')) replayBodies.push(body);
    return new Response(JSON.stringify({ syncState: 'SYNCED' }), { status: 200 });
  };
  const dir = mkdtempSync(join(tmpdir(), 'gospots-phase3-replay-'));
  const hub = new EdgeHub({ dbPath: join(dir, 'edge.db'), keyPath: join(dir, 'key'), pairToken: 'phase3', cloudUrl: 'https://phase3.invalid', fetchImpl: fakeFetch });
  try {
    await hub.registerCloud('token');
    const payload = { label: 'Phase 3' };
    const saved = hub.appendEvent({ eventId: randomUUID(), sourceDeviceId: 'pos-phase3', operationType: 'CHECK_CREATE', entityId: randomUUID(), payload, payloadHash: sha256(canonicalJson(payload)), occurredAt: new Date().toISOString() });
    assert.equal((await hub.cloud.syncPending()).synced, 1);
    assert.equal((await hub.cloud.syncPending()).synced, 0);
    assert.equal(replayBodies.length, 1);
    assert.equal(replayBodies[0].operationId, saved.eventId);
    assert.equal(replayBodies[0].occurredAt, saved.occurredAt);
    assert.equal(new Date(replayBodies[0].occurredAt).toISOString(), replayBodies[0].occurredAt);
    assert.match(replayBodies[0].entityId, /^[0-9a-f-]{36}$/i);
    assert.equal(replayBodies[0].payloadHash.length, 64);
  } finally {
    hub.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
