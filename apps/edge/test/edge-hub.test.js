import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { canonicalJson, sha256 } from '../src/canonical.js';
import { EdgeHub } from '../src/hub.js';
import { signLanRequest } from '../src/crypto.js';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'gospots-edge-'));
  const dbPath = join(dir, 'edge.db');
  const keyPath = join(dir, 'master.key');
  const hub = new EdgeHub({ dbPath, keyPath, pairToken: 'pair-me' });
  return { dir, dbPath, keyPath, hub, close() { try { hub.close(); } finally { rmSync(dir, { recursive: true, force: true }); } } };
}

function event(operationType, entityId, payload, expectedVersion, sourceDeviceId = 'client-a') {
  return {
    eventId: randomUUID(), sourceDeviceId, operationType, entityId,
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
    payload, payloadHash: sha256(canonicalJson(payload)), occurredAt: new Date().toISOString(),
  };
}

test('two authenticated LAN clients share one durable sequence and deterministic versions', () => {
  const f = fixture();
  try {
    const posA = f.hub.registerLanClient('pair-me', 'POS A');
    const posB = f.hub.registerLanClient('pair-me', 'POS B');
    const checkId = 'check-1';

    const createBody = event('CHECK_CREATE', checkId, { label: 'Table 4' }, undefined, posA.clientId);
    const createTimestamp = new Date().toISOString();
    const createNonce = randomUUID();
    const createPath = '/v1/events';
    f.hub.authenticateLan({
      clientId: posA.clientId,
      timestamp: createTimestamp,
      nonce: createNonce,
      signature: signLanRequest(posA.secret, 'POST', createPath, createBody, createTimestamp, createNonce),
      method: 'POST',
      path: createPath,
      body: createBody,
    });
    const created = f.hub.appendEvent(createBody);

    const readTimestamp = new Date().toISOString();
    const readNonce = randomUUID();
    const readPath = '/v1/events?after=0';
    f.hub.authenticateLan({
      clientId: posB.clientId,
      timestamp: readTimestamp,
      nonce: readNonce,
      signature: signLanRequest(posB.secret, 'GET', readPath, {}, readTimestamp, readNonce),
      method: 'GET',
      path: readPath,
      body: {},
    });
    assert.equal(f.hub.store.listEvents(0)[0].eventId, created.eventId);

    const updateBody = event('CHECK_UPDATE', checkId, { note: '2 players' }, 1, posB.clientId);
    const updateTimestamp = new Date().toISOString();
    const updateNonce = randomUUID();
    f.hub.authenticateLan({
      clientId: posB.clientId,
      timestamp: updateTimestamp,
      nonce: updateNonce,
      signature: signLanRequest(posB.secret, 'POST', createPath, updateBody, updateTimestamp, updateNonce),
      method: 'POST',
      path: createPath,
      body: updateBody,
    });
    const updated = f.hub.appendEvent(updateBody);

    assert.equal(created.sequence + 1, updated.sequence);
    assert.equal(f.hub.store.getAggregate(checkId).version, 2);
    assert.throws(() => f.hub.appendEvent(event('CHECK_UPDATE', checkId, { note: 'stale' }, 1, posA.clientId)), /VERSION_CONFLICT/);
    assert.deepEqual(f.hub.store.listEvents(0).map((x) => x.sequence), [created.sequence, updated.sequence]);

    const diagnostics = f.hub.diagnostics();
    assert.equal(diagnostics.lanDevices.active, 2);
    assert.equal(diagnostics.events.total, 2);
    assert.equal(diagnostics.lastSequence, updated.sequence);
  } finally { f.close(); }
});

test('restart retains committed events and aggregate state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gospots-edge-restart-'));
  const dbPath = join(dir, 'edge.db');
  const keyPath = join(dir, 'master.key');
  let hub = new EdgeHub({ dbPath, keyPath, pairToken: 'pair-me' });
  const saved = hub.appendEvent(event('CHECK_CREATE', 'check-restart', { guestName: 'Guest' }));
  hub.close();
  hub = new EdgeHub({ dbPath, keyPath, pairToken: 'pair-me' });
  try {
    assert.equal(hub.store.listEvents(0)[0].eventId, saved.eventId);
    assert.equal(hub.store.getAggregate('check-restart').version, 1);
  } finally { hub.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('event idempotency returns same result and rejects changed replay', () => {
  const f = fixture();
  try {
    const original = event('CHECK_CREATE', 'check-idem', { label: 'A' });
    const first = f.hub.appendEvent(original);
    const second = f.hub.appendEvent(original);
    assert.equal(second.duplicate, true);
    assert.equal(second.sequence, first.sequence);
    assert.throws(() => f.hub.appendEvent({ ...original, payload: { label: 'B' }, payloadHash: sha256(canonicalJson({ label: 'B' })) }), /IDEMPOTENCY_CONFLICT/);
  } finally { f.close(); }
});

test('money and compliance operations are intentionally unsupported locally', () => {
  const f = fixture();
  try {
    assert.throws(() => f.hub.appendEvent(event('PAYMENT_CAPTURE', 'p1', { note: 'no' })), /OFFLINE_UNSUPPORTED/);
    assert.equal(f.hub.store.listEvents(0).length, 0);
  } finally { f.close(); }
});

test('LAN HMAC authentication rejects nonce replay', () => {
  const f = fixture();
  try {
    const registered = f.hub.registerLanClient('pair-me', 'POS 1');
    const body = { ping: true };
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const path = '/v1/test';
    const signature = signLanRequest(registered.secret, 'POST', path, body, timestamp, nonce);
    const auth = { clientId: registered.clientId, timestamp, nonce, signature, method: 'POST', path, body };
    assert.doesNotThrow(() => f.hub.authenticateLan(auth));
    assert.throws(() => f.hub.authenticateLan(auth), /Replayed/);
  } finally { f.close(); }
});

test('cloud reconnect replays each committed event once and keeps stable operation id', async () => {
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options, body: options?.body ? JSON.parse(options.body) : null });
    if (String(url).endsWith('/edge-hub/register')) return new Response(JSON.stringify({ deviceId: 'edge-cloud-1', shopId: 'shop-1' }), { status: 201, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ syncState: 'SYNCED' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const dir = mkdtempSync(join(tmpdir(), 'gospots-edge-cloud-'));
  const hub = new EdgeHub({ dbPath: join(dir, 'edge.db'), keyPath: join(dir, 'key'), pairToken: 'pair', cloudUrl: 'https://cloud.test', fetchImpl: fakeFetch });
  try {
    await hub.registerCloud('one-time-token');
    const saved = hub.appendEvent(event('CHECK_CREATE', 'cloud-check', { label: 'Cloud' }));
    const first = await hub.cloud.syncPending();
    const second = await hub.cloud.syncPending();
    assert.equal(first.synced, 1);
    assert.equal(second.synced, 0);
    const replayCalls = calls.filter((x) => String(x.url).endsWith('/edge-hub/cloud/replay'));
    assert.equal(replayCalls.length, 1);
    assert.equal(replayCalls[0].body.operationId, saved.eventId);
  } finally { hub.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('rejects non-UUID event IDs before they can become unsyncable cloud work', () => {
  const f = fixture();
  try {
    const invalid = event('CHECK_CREATE', 'check-bad-id', { label: 'Bad id' });
    invalid.eventId = 'not-a-uuid';
    assert.throws(() => f.hub.appendEvent(invalid), /eventId must be a UUID/);
    assert.equal(f.hub.store.listEvents(0).length, 0);
  } finally { f.close(); }
});
