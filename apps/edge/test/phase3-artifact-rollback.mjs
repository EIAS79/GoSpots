import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson, sha256 } from '../src/canonical.js';

const baselineRoot = resolve(process.env.PHASE3_BASELINE_EDGE ?? '');
const candidateRoot = resolve(process.env.PHASE3_CANDIDATE_EDGE ?? '');
const baselineSha = process.env.PHASE3_BASELINE_SHA ?? '';
const candidateSha = process.env.PHASE3_CANDIDATE_SHA ?? '';
if (!baselineRoot || !candidateRoot || !baselineSha || !candidateSha || baselineSha === candidateSha) {
  throw new Error('Distinct packaged baseline/candidate artifacts and SHAs are required');
}

function digest(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }
function event(entityId, label) {
  const payload = { label };
  return { eventId: randomUUID(), sourceDeviceId: 'phase3-artifact-test', operationType: 'CHECK_CREATE', entityId, payload, payloadHash: sha256(canonicalJson(payload)), occurredAt: new Date().toISOString() };
}

assert.notEqual(digest(join(baselineRoot, 'src', 'cloud-client.js')), digest(join(candidateRoot, 'src', 'cloud-client.js')));
const baseline = await import(pathToFileURL(join(baselineRoot, 'src', 'hub.js')));
const candidate = await import(pathToFileURL(join(candidateRoot, 'src', 'hub.js')));
const dir = mkdtempSync(join(tmpdir(), 'gospots-phase3-rollback-'));
const dbPath = join(dir, 'edge.db');
const keyPath = join(dir, 'edge-master.key');
const firstId = randomUUID();
const secondId = randomUUID();
let hub;

try {
  hub = new candidate.EdgeHub({ dbPath, keyPath, pairToken: 'phase3' });
  hub.appendEvent(event(firstId, 'candidate-before-rollback'));
  hub.close();

  hub = new baseline.EdgeHub({ dbPath, keyPath, pairToken: 'phase3' });
  assert.equal(hub.store.getAggregate(firstId).version, 1);
  hub.appendEvent(event(secondId, 'baseline-during-rollback'));
  hub.close();

  hub = new candidate.EdgeHub({ dbPath, keyPath, pairToken: 'phase3' });
  assert.equal(hub.store.getAggregate(firstId).version, 1);
  assert.equal(hub.store.getAggregate(secondId).version, 1);
  assert.equal(hub.store.listEvents(0).length, 2);
  hub.close();
  hub = null;

  console.log(JSON.stringify({ phase: 3, baselineSha, candidateSha, packagedArtifactRollback: true, preservedEvents: 2 }));
} finally {
  try { hub?.close(); } catch { /* already closed */ }
  rmSync(dir, { recursive: true, force: true });
}
