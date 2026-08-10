import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { EdgeHub } from '../src/hub.js';
import { canonicalJson, sha256 } from '../src/canonical.js';
import { signLanRequest } from '../src/crypto.js';

function makeEvent(entityId, label) {
  const payload = { label };
  return {
    eventId: randomUUID(),
    sourceDeviceId: randomUUID(),
    operationType: 'CHECK_CREATE',
    entityId,
    payload,
    payloadHash: sha256(canonicalJson(payload)),
    occurredAt: new Date().toISOString(),
  };
}

function tempHub(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gospots-edge-review-'));
  const hub = new EdgeHub({
    dbPath: join(dir, 'edge.db'),
    keyPath: join(dir, 'edge.key'),
    pairToken: 'pair-me',
    ...options,
  });
  return { hub, close() { hub.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test('cloud API origin is normalized to the Nest /api/v1 base', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ deviceId: 'edge-cloud-1', shopId: 'shop-1' }), {
      status: 201, headers: { 'content-type': 'application/json' },
    });
  };
  const f = tempHub({ cloudUrl: 'https://cloud.test', fetchImpl: fakeFetch });
  try {
    await f.hub.registerCloud('one-time-token');
    assert.equal(calls[0], 'https://cloud.test/api/v1/edge-hub/register');
  } finally { f.close(); }
});

test('permanent cloud validation rejection is quarantined so later events can sync', async () => {
  let replayCount = 0;
  const fakeFetch = async (url) => {
    if (String(url).endsWith('/edge-hub/register')) {
      return new Response(JSON.stringify({ deviceId: 'edge-cloud-1', shopId: 'shop-1' }), {
        status: 201, headers: { 'content-type': 'application/json' },
      });
    }
    replayCount += 1;
    if (replayCount === 1) {
      return new Response(JSON.stringify({ message: 'validation failed' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ syncState: 'SYNCED' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  const f = tempHub({ cloudUrl: 'https://cloud.test/api/v1', fetchImpl: fakeFetch });
  try {
    await f.hub.registerCloud('one-time-token');
    const first = f.hub.appendEvent(makeEvent('reject-a', 'A'));
    const second = f.hub.appendEvent(makeEvent('reject-b', 'B'));
    const result = await f.hub.cloud.syncPending();
    assert.equal(result.conflicts, 1);
    assert.equal(result.synced, 1);
    const rows = f.hub.store.listEvents(0);
    assert.equal(rows.find((x) => x.eventId === first.eventId).cloudState, 'CONFLICT');
    assert.equal(rows.find((x) => x.eventId === second.eventId).cloudState, 'SYNCED');
  } finally { f.close(); }
});

test('invalid LAN signature does not consume the nonce before verification', () => {
  const f = tempHub();
  try {
    const registered = f.hub.registerLanClient('pair-me', 'POS 1');
    const body = { ping: true };
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const path = '/v1/test';
    assert.throws(() => f.hub.authenticateLan({
      clientId: registered.clientId,
      timestamp,
      nonce,
      signature: Buffer.from('bad').toString('base64'),
      method: 'POST',
      path,
      body,
    }), /Invalid Edge client signature/);
    const signature = signLanRequest(registered.secret, 'POST', path, body, timestamp, nonce);
    assert.doesNotThrow(() => f.hub.authenticateLan({
      clientId: registered.clientId,
      timestamp,
      nonce,
      signature,
      method: 'POST',
      path,
      body,
    }));
  } finally { f.close(); }
});
