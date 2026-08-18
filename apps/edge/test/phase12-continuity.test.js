import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EdgeStore } from '../src/store.js';
import { ContinuityEngine } from '../src/continuity.js';
import { conflictClass, offlinePolicy } from '../src/offline-policy.js';

function engine() {
  const store = new EdgeStore(':memory:');
  const continuity = new ContinuityEngine(store);
  continuity.applySnapshot({
    cursor: 'snapshot-1',
    generatedAt: '2026-08-18T20:00:00.000Z',
    venue: { id: 'shop-1', currency: 'PLN', timezone: 'Europe/Warsaw', version: 3 },
    resources: [{ id: 'resource-1', status: 'AVAILABLE', version: 1, name: 'Table 1' }],
    activeSessions: [],
    openChecks: [{ id: 'check-1', status: 'OPEN', version: 4 }],
    catalog: [{ id: 'item-1', name: 'Cola', barcode: '590000000001', priceMinor: 1000 }],
    rates: [], devices: [], kdsTickets: [],
  });
  return { store, continuity };
}

test('Phase 12 policy is explicit and financial mutations are never generic offline operations', () => {
  assert.equal(offlinePolicy('SESSION_START'), 'EDGE_CERTIFIED');
  assert.equal(offlinePolicy('CASH_PAYMENT'), 'EDGE_CERTIFIED_FINANCIAL');
  assert.equal(offlinePolicy('REFUND'), 'ONLINE_ONLY');
  assert.equal(offlinePolicy('FISCAL_ISSUE'), 'ONLINE_ONLY');
  assert.equal(conflictClass('CASH_PAYMENT', 'VERSION_CONFLICT'), 'FINANCIAL_MANUAL_REVIEW');
});

test('command envelope has stable operation, sequence, idempotency, hash and correlation metadata', () => {
  const { store, continuity } = engine();
  try {
    const command = continuity.createCommand({
      operationId: '11111111-1111-4111-8111-111111111111',
      deviceId: 'pos-a', venueId: 'shop-1', operationType: 'SESSION_START',
      aggregateType: 'OperationsSession', aggregateId: '22222222-2222-4222-8222-222222222222',
      payload: { resourceId: 'resource-1' }, correlationId: 'corr-1',
      occurredAt: '2026-08-18T20:01:00.000Z',
    });
    assert.equal(command.localSequence, 1);
    assert.equal(command.idempotencyKey, command.operationId);
    assert.equal(command.correlationId, 'corr-1');
    assert.match(command.payloadHash, /^[0-9a-f]{64}$/);
    assert.equal(continuity.cache('session', command.aggregateId).status, 'ACTIVE');

    const replay = continuity.createCommand({
      operationId: command.operationId,
      deviceId: 'pos-a', venueId: 'shop-1', operationType: 'SESSION_START',
      aggregateType: 'OperationsSession', aggregateId: command.aggregateId,
      payload: { resourceId: 'resource-1' }, correlationId: 'corr-1',
      occurredAt: '2026-08-18T20:01:00.000Z',
    });
    assert.equal(replay.duplicate, true);
    assert.equal(continuity.pendingCommands().length, 1);
  } finally { store.close(); }
});

test('concurrent/stale local resource start is rejected instead of creating duplicate occupancy', () => {
  const { store, continuity } = engine();
  try {
    continuity.createCommand({
      operationId: '33333333-3333-4333-8333-333333333333', deviceId: 'pos-a', venueId: 'shop-1',
      operationType: 'SESSION_START', aggregateType: 'OperationsSession', aggregateId: '44444444-4444-4444-8444-444444444444',
      payload: { resourceId: 'resource-1' }, occurredAt: '2026-08-18T20:01:00.000Z',
    });
    assert.throws(() => continuity.createCommand({
      operationId: '55555555-5555-4555-8555-555555555555', deviceId: 'pos-b', venueId: 'shop-1',
      operationType: 'SESSION_START', aggregateType: 'OperationsSession', aggregateId: '66666666-6666-4666-8666-666666666666',
      payload: { resourceId: 'resource-1' }, occurredAt: '2026-08-18T20:01:01.000Z',
    }), /RESOURCE_CONFLICT/);
  } finally { store.close(); }
});

test('cash payment creates one durable local financial fact and duplicate replay cannot double-apply', () => {
  const { store, continuity } = engine();
  try {
    const input = {
      operationId: '77777777-7777-4777-8777-777777777777', deviceId: 'pos-a', venueId: 'shop-1',
      operationType: 'CASH_PAYMENT', aggregateType: 'CheckSettlement', aggregateId: 'settlement-1', aggregateVersion: 4,
      payload: { settlementId: 'settlement-1', operatorUserId: 'user-1', amountMinor: 2500, currency: 'PLN', allocationKind: 'CUSTOM', allocations: [{ snapshotId: 'snap-1', amount: '25.00' }] },
      occurredAt: '2026-08-18T20:05:00.000Z',
    };
    continuity.createCommand(input);
    const replay = continuity.createCommand(input);
    assert.equal(replay.duplicate, true);
    const row = store.db.prepare('SELECT COUNT(*) count, SUM(amount_minor) total FROM local_cash_ledger').get();
    assert.equal(Number(row.count), 1);
    assert.equal(Number(row.total), 2500);
  } finally { store.close(); }
});

test('financial conflict cannot be auto-merged and remains explicit for operator review', () => {
  const { store, continuity } = engine();
  try {
    const command = continuity.createCommand({
      operationId: '88888888-8888-4888-8888-888888888888', deviceId: 'pos-a', venueId: 'shop-1',
      operationType: 'CASH_PAYMENT', aggregateType: 'CheckSettlement', aggregateId: 'settlement-1', aggregateVersion: 4,
      payload: { settlementId: 'settlement-1', operatorUserId: 'user-1', amountMinor: 2500, currency: 'PLN', allocationKind: 'CUSTOM', allocations: [{ snapshotId: 'snap-1', amount: '25.00' }] },
    });
    const klass = continuity.markConflict(command.operationId, command.operationType, 'VERSION_CONFLICT', 'Settlement changed after local cash payment', { currentVersion: 5 });
    assert.equal(klass, 'FINANCIAL_MANUAL_REVIEW');
    assert.equal(continuity.conflicts()[0].conflictClass, 'FINANCIAL_MANUAL_REVIEW');
    assert.throws(() => continuity.resolveConflict(command.operationId, { action: 'AUTO_MERGE' }), /never be auto-merged/);
  } finally { store.close(); }
});

test('scanner, customer display, cash drawer and KDS state survive in local SQLite', () => {
  const { store, continuity } = engine();
  try {
    const scan = continuity.recordScan({ scanType: 'BARCODE', value: '590000000001', deviceId: 'scanner-1' });
    assert.equal(scan.product.id, 'item-1');
    continuity.setCustomerDisplay('display-1', { totalMinor: 2500, currency: 'PLN' });
    assert.equal(continuity.getCustomerDisplay('display-1').state.totalMinor, 2500);
    assert.throws(() => continuity.openCashDrawer({ trigger: 'MANAGER_OPEN', deviceId: 'drawer-1' }), /requires operatorUserId and reason/);
    assert.equal(continuity.openCashDrawer({ trigger: 'TEST', deviceId: 'drawer-1' }).trigger, 'TEST');
    continuity.upsertKdsTicket({ id: 'ticket-1', stationId: 'bar', status: 'NEW', updatedAt: '2026-08-18T20:10:00.000Z' });
    assert.equal(store.db.prepare('SELECT status FROM kds_ticket_state WHERE ticket_id=?').get('ticket-1').status, 'NEW');
  } finally { store.close(); }
});

test('snapshot rejects another tenant and local state remains venue-bound', () => {
  const { store, continuity } = engine();
  try {
    assert.throws(() => continuity.applySnapshot({ venue: { id: 'shop-2' } }), /TENANT_CONFLICT/);
    assert.throws(() => continuity.createCommand({
      operationId: '99999999-9999-4999-8999-999999999999', deviceId: 'pos-a', venueId: 'shop-2',
      operationType: 'ORDER_CREATE', aggregateType: 'VenueOrder', aggregateId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', payload: { lines: [] },
    }), /TENANT_CONFLICT/);
  } finally { store.close(); }
});
