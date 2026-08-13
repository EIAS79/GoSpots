import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { canonicalJson, sha256 } from '../src/canonical.js';
import { EdgeHub } from '../src/hub.js';
import { signLanRequest } from '../src/crypto.js';

function mutation(type, entityId, payload, expectedVersion) {
  return { eventId: randomUUID(), operationType: type, entityId, ...(expectedVersion === undefined ? {} : { expectedVersion }), payload, payloadHash: sha256(canonicalJson(payload)), occurredAt: new Date().toISOString() };
}

function authenticateAndAppend(hub, client, body) {
  const path = '/v1/events';
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  hub.authenticateLan({ clientId: client.clientId, timestamp, nonce, signature: signLanRequest(client.secret, 'POST', path, body, timestamp, nonce), method: 'POST', path, body });
  return hub.appendEvent({ ...body, sourceDeviceId: client.clientId });
}

test('two POS clients survive cloud outage, restart, and converge exactly once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gospots-phase3-outage-'));
  const dbPath = join(dir, 'edge.db');
  const keyPath = join(dir, 'edge-master.key');
  const unreachableFetch = async () => { throw new TypeError('simulated transport ENETUNREACH'); };
  let hub = new EdgeHub({ dbPath, keyPath, pairToken: 'phase3', cloudUrl: 'https://cloud.invalid', fetchImpl: unreachableFetch });
  const posA = hub.registerLanClient('phase3', 'POS A');
  const posB = hub.registerLanClient('phase3', 'POS B');
  hub.store.setMeta('cloudDeviceId', 'phase3-cloud-device');
  const checkA = randomUUID();
  const checkB = randomUUID();
  const a = authenticateAndAppend(hub, posA, mutation('CHECK_CREATE', checkA, { label: 'A' }));
  const b = authenticateAndAppend(hub, posB, mutation('CHECK_CREATE', checkB, { label: 'B' }));
  const c = authenticateAndAppend(hub, posB, mutation('CHECK_UPDATE', checkA, { note: 'shared update' }, 1));
  const duringOutage = await hub.cloud.syncPending();
  assert.equal(duringOutage.synced, 0);
  assert.equal(duringOutage.pending, 3);
  hub.close();

  const replayBodies = [];
  const strictFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(String(url).endsWith('/api/v1/edge-hub/cloud/replay'), true);
    assert.equal(new Date(body.occurredAt).toISOString(), body.occurredAt);
    assert.match(body.operationId, /^[0-9a-f-]{36}$/i);
    assert.match(body.entityId, /^[0-9a-f-]{36}$/i);
    assert.match(body.payloadHash, /^[0-9a-f]{64}$/);
    replayBodies.push(body);
    return new Response(JSON.stringify({ syncState: 'SYNCED' }), { status: 200 });
  };
  hub = new EdgeHub({ dbPath, keyPath, pairToken: 'phase3', cloudUrl: 'https://cloud.invalid', fetchImpl: strictFetch });
  try {
    assert.deepEqual(hub.store.listEvents(0).map((event) => event.eventId), [a.eventId, b.eventId, c.eventId]);
    assert.equal(hub.store.getAggregate(checkA).version, 2);
    assert.equal(hub.store.getAggregate(checkB).version, 1);
    assert.equal((await hub.cloud.syncPending()).synced, 3);
    assert.equal((await hub.cloud.syncPending()).synced, 0);
    assert.equal(replayBodies.length, 3);
    assert.equal(new Set(replayBodies.map((body) => body.operationId)).size, 3);
    assert.equal(hub.status().pendingEvents, 0);
  } finally {
    hub.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
