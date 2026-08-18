import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EdgeStore } from '../src/store.js';
import { ContinuityEngine } from '../src/continuity.js';

const cashOperationId = '12345678-1234-4123-8123-123456789012';

function seed(continuity) {
  continuity.applySnapshot({
    cursor: 'cloud-before-outage',
    generatedAt: '2026-08-18T20:00:00.000Z',
    venue: { id: 'shop-outage', currency: 'PLN', timezone: 'Europe/Warsaw', version: 1 },
    devices: [{ id: 'edge-1', type: 'EDGE_HUB', status: 'ACTIVE' }],
    resources: [{ id: 'table-1', name: 'Table 1', status: 'AVAILABLE', version: 1 }],
    rates: [{ id: 'rate-1', resourceId: 'table-1', billingMode: 'HOURLY', hourlyRateMinor: 6000 }],
    catalog: [{ id: 'cola-1', name: 'Cola', barcode: '5901234567890', priceMinor: 1200 }],
    openChecks: [{ id: 'check-1', status: 'OPEN', version: 4, currency: 'PLN' }],
    activeSessions: [],
    kdsTickets: [],
  });
}

test('Phase 12 full venue outage drill survives restart and never duplicates queued cash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gospots-phase12-drill-'));
  const dbPath = join(dir, 'edge.db');
  try {
    let store = new EdgeStore(dbPath);
    let continuity = new ContinuityEngine(store);
    seed(continuity);

    const session = continuity.createCommand({
      operationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      deviceId: 'pos-a', venueId: 'shop-outage', operationType: 'SESSION_START',
      aggregateType: 'OperationsSession', aggregateId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      payload: { resourceId: 'table-1', rateId: 'rate-1', operatorUserId: 'user-a' },
      occurredAt: '2026-08-18T20:05:00.000Z', correlationId: 'shift-outage-1',
    });
    assert.equal(continuity.cache('session', session.aggregateId).status, 'ACTIVE');

    assert.throws(() => continuity.createCommand({
      operationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      deviceId: 'pos-b', venueId: 'shop-outage', operationType: 'SESSION_START',
      aggregateType: 'OperationsSession', aggregateId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      payload: { resourceId: 'table-1', operatorUserId: 'user-b' },
    }), /RESOURCE_CONFLICT/);

    continuity.createCommand({
      operationId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      deviceId: 'pos-a', venueId: 'shop-outage', operationType: 'ORDER_CREATE',
      aggregateType: 'VenueOrder', aggregateId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      payload: { guestCheckId: 'check-1', lines: [{ menuItemId: 'cola-1', quantity: 2 }] },
      occurredAt: '2026-08-18T20:06:00.000Z',
    });

    const cash = {
      operationId: cashOperationId,
      deviceId: 'pos-a', venueId: 'shop-outage', operationType: 'CASH_PAYMENT',
      aggregateType: 'CheckSettlement', aggregateId: 'settlement-1', aggregateVersion: 4,
      payload: {
        settlementId: 'settlement-1', operatorUserId: 'user-a', amountMinor: 2400,
        currency: 'PLN', allocationKind: 'CUSTOM', allocations: [{ snapshotId: 'snap-1', amount: '24.00' }],
      },
      occurredAt: '2026-08-18T20:07:00.000Z', correlationId: 'cash-outage-1',
    };
    continuity.createCommand(cash);
    assert.equal(continuity.pendingCommands().length, 3);
    assert.equal(Number(store.db.prepare('SELECT COUNT(*) count FROM local_cash_ledger').get().count), 1);
    store.close();

    // Simulate Edge host/device restart while WAN remains unavailable.
    store = new EdgeStore(dbPath);
    continuity = new ContinuityEngine(store);
    assert.equal(continuity.pendingCommands().length, 3);
    assert.equal(continuity.cache('session', session.aggregateId).status, 'ACTIVE');
    assert.equal(continuity.cache('order', 'ffffffff-ffff-4fff-8fff-ffffffffffff').pendingCloud, true);

    // User/device retry after restart replays the same durable result; it cannot insert cash again.
    const duplicate = continuity.createCommand(cash);
    assert.equal(duplicate.duplicate, true);
    const localCash = store.db.prepare('SELECT COUNT(*) count, SUM(amount_minor) total FROM local_cash_ledger').get();
    assert.equal(Number(localCash.count), 1);
    assert.equal(Number(localCash.total), 2400);

    // Simulate cloud restoration + acknowledgements, then pull authoritative reconciled state.
    for (const command of continuity.pendingCommands()) continuity.markSynced(command.operationId, { syncState: 'SYNCED' });
    continuity.applySnapshot({
      cursor: 'cloud-after-reconcile',
      generatedAt: '2026-08-18T20:10:00.000Z',
      venue: { id: 'shop-outage', currency: 'PLN', timezone: 'Europe/Warsaw', version: 1 },
      devices: [{ id: 'edge-1', type: 'EDGE_HUB', status: 'ACTIVE' }],
      resources: [{ id: 'table-1', name: 'Table 1', status: 'OCCUPIED', version: 2 }],
      rates: [{ id: 'rate-1', resourceId: 'table-1', billingMode: 'HOURLY', hourlyRateMinor: 6000 }],
      catalog: [{ id: 'cola-1', name: 'Cola', barcode: '5901234567890', priceMinor: 1200 }],
      openChecks: [{ id: 'check-1', status: 'OPEN', version: 5, currency: 'PLN' }],
      activeSessions: [{ id: session.aggregateId, resourceId: 'table-1', status: 'ACTIVE', version: 1 }],
      kdsTickets: [],
    });
    assert.equal(continuity.pendingCommands().length, 0);
    assert.equal(continuity.diagnostics().cashLedger.pending, 0);
    assert.equal(Number(store.db.prepare('SELECT COUNT(*) count FROM local_cash_ledger').get().count), 1);
    assert.equal(continuity.cache('session', session.aggregateId).status, 'ACTIVE');
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('failed local financial command rolls back partial SQLite writes atomically', () => {
  const store = new EdgeStore(':memory:');
  try {
    const continuity = new ContinuityEngine(store);
    seed(continuity);
    assert.throws(() => continuity.createCommand({
      operationId: '13572468-2468-4135-8246-135724681357',
      deviceId: 'pos-a', venueId: 'shop-outage', operationType: 'CASH_PAYMENT',
      aggregateType: 'CheckSettlement', aggregateId: 'settlement-bad', aggregateVersion: 4,
      payload: { settlementId: 'settlement-bad', operatorUserId: 'user-a', amountMinor: 0, currency: 'PLN' },
    }), /amountMinor/);
    assert.equal(Number(store.db.prepare('SELECT COUNT(*) count FROM local_cash_ledger').get().count), 0);
    assert.equal(continuity.pendingCommands().length, 0);
  } finally { store.close(); }
});
