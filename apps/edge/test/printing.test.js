import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EdgeHub } from '../src/hub.js';
import { EdgeStore } from '../src/store.js';
import { PrintContinuityStore } from '../src/print-continuity.js';
import { executePrintJob, renderEscPos } from '../src/printer.js';

test('ESC/POS rendering initializes printer, emits text and cuts by default', () => {
  const bytes = renderEscPos({ lines: ['GoSpots', 'Total 42.00 PLN'] });
  assert.deepEqual([...bytes.subarray(0, 2)], [0x1b, 0x40]);
  assert.match(bytes.toString('utf8'), /GoSpots/);
  assert.deepEqual([...bytes.subarray(-3)], [0x1d, 0x56, 0x00]);
});

test('TCP ESC/POS adapter validates routing and writes rendered bytes', async () => {
  const calls = [];
  const result = await executePrintJob({
    payload: { text: 'Receipt', cut: false },
    printer: { adapter: 'tcp-escpos', host: '192.0.2.10', port: 9100 },
  }, {
    tcpWriter: async (host, port, bytes) => {
      calls.push({ host, port, bytes });
      return { bytes: bytes.length };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].host, '192.0.2.10');
  assert.equal(calls[0].port, 9100);
  assert.match(calls[0].bytes.toString('utf8'), /Receipt/);
  assert.equal(result.adapter, 'tcp-escpos');
});

test('unknown printer adapters fail closed', async () => {
  await assert.rejects(
    executePrintJob({ payload: { text: 'x' }, printer: { adapter: 'vendor-secret-driver' } }),
    /UNSUPPORTED/,
  );
});

function memoryPrintContinuity() {
  let staged = null;
  return {
    next: () => staged,
    stage: (job) => (staged = { jobId: job.id, job, state: 'CLAIMED', result: null, error: null }),
    markPrinted: (_id, result) => { staged = { ...staged, state: 'PRINTED_PENDING_ACK', result }; },
    markFailed: (_id, error) => { staged = { ...staged, state: 'FAILED_PENDING_ACK', error }; },
    markAcknowledged: () => { staged = { ...staged, state: 'ACKNOWLEDGED' }; },
    diagnostics: () => ({ total: staged ? 1 : 0, claimed: staged?.state === 'CLAIMED' ? 1 : 0, printedPendingAck: 0, failedPendingAck: 0 }),
  };
}

test('Edge print worker reports success exactly after execution', async () => {
  const calls = [];
  const hub = Object.create(EdgeHub.prototype);
  hub.printWorkerRunning = false;
  hub.printContinuity = memoryPrintContinuity();
  hub.printExecutor = async (job) => { calls.push(['print', job.id]); return { bytes: 12 }; };
  hub.cloud = {
    registeredDeviceId: 'edge-1',
    claimPrintJob: async () => ({ job: { id: 'job-1', payload: { text: 'x' }, printer: { adapter: 'test' } } }),
    markPrintJobPrinting: async (id) => { calls.push(['printing', id]); },
    completePrintJob: async (id, body) => { calls.push(['complete', id, body.status]); },
  };

  const result = await hub.processPrintQueue();
  assert.equal(result.succeeded, 1);
  assert.deepEqual(calls, [
    ['printing', 'job-1'],
    ['print', 'job-1'],
    ['complete', 'job-1', 'SUCCEEDED'],
  ]);
  assert.equal(hub.printWorkerRunning, false);
});

test('Edge print worker reports printer failures for cloud retry semantics', async () => {
  const completions = [];
  const hub = Object.create(EdgeHub.prototype);
  hub.printWorkerRunning = false;
  hub.printContinuity = memoryPrintContinuity();
  hub.printExecutor = async () => { throw new Error('UNSUPPORTED: printer adapter missing'); };
  hub.cloud = {
    registeredDeviceId: 'edge-1',
    claimPrintJob: async () => ({ job: { id: 'job-2', payload: {}, printer: { adapter: 'missing' } } }),
    markPrintJobPrinting: async () => {},
    completePrintJob: async (id, body) => { completions.push({ id, body }); },
  };

  const result = await hub.processPrintQueue();
  assert.equal(result.failed, 1);
  assert.equal(completions[0].body.status, 'FAILED');
  assert.equal(completions[0].body.errorCode, 'UNSUPPORTED_PRINTER_ADAPTER');
});

test('physical print outcome survives Edge restart and is acknowledged without reprinting', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gospots-print-continuity-'));
  const path = join(dir, 'edge.db');
  try {
    let store = new EdgeStore(path);
    let continuity = new PrintContinuityStore(store);
    const job = { id: 'job-restart', payload: { text: 'Receipt' }, printer: { adapter: 'test' } };
    continuity.stage(job);
    continuity.markPrinted(job.id, { bytes: 42 });
    store.close();

    store = new EdgeStore(path);
    continuity = new PrintContinuityStore(store);
    const recovered = continuity.next();
    assert.equal(recovered.state, 'PRINTED_PENDING_ACK');
    assert.deepEqual(recovered.result, { bytes: 42 });
    continuity.markAcknowledged(job.id);
    assert.equal(continuity.next(), null);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('staged print job rejects changed payload for the same job ID', () => {
  const store = new EdgeStore(':memory:');
  try {
    const continuity = new PrintContinuityStore(store);
    continuity.stage({ id: 'job-stable', payload: { text: 'A' }, printer: { adapter: 'test' } });
    assert.throws(() => continuity.stage({ id: 'job-stable', payload: { text: 'B' }, printer: { adapter: 'test' } }), /IDEMPOTENCY_CONFLICT/);
  } finally { store.close(); }
});
