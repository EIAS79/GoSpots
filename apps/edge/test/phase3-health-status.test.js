import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EdgeHub } from '../src/hub.js';

test('Edge status exposes persistent cloud connectivity state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gospots-phase3-status-'));
  const hub = new EdgeHub({ dbPath: join(dir, 'edge.db'), keyPath: join(dir, 'edge-master.key'), pairToken: 'phase3' });
  try {
    hub.store.setMeta('cloudDeviceId', 'phase3-cloud-device');
    hub.store.setMeta('cloudConnectivityState', 'OFFLINE');
    hub.store.setMeta('cloudLastFailureAt', '2026-08-13T12:00:00.000Z');
    hub.store.setMeta('cloudLastError', 'ENETUNREACH');
    assert.deepEqual(hub.status().cloudConnectivity, {
      state: 'OFFLINE',
      lastSuccessAt: null,
      lastFailureAt: '2026-08-13T12:00:00.000Z',
      lastError: 'ENETUNREACH',
    });
  } finally {
    hub.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
