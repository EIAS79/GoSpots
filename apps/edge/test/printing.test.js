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
    nextAcknowledgement: () => staged && ['PRINTED_PENDING_ACK', 'FAILED_PENDING_ACK'].includes(staged.state) ? staged : null,
    stage: (job) => {
      if (staged) {
        if (staged.job.id !== job.id || JSON.stringify(staged.job) !== JSON.stringify(job)) throw new Error('IDEMPOTENCY_CONFLICT');
        return { ...staged, freshlyStaged: false };
      }
      staged = { jobId: job.id, job, state: 'CLAIMED', result: null, error: null };
      return { ...staged, freshlyStaged: true };
    },
    markDispatchUncertain: () => { staged = { ...staged, state: 'DISPATCH_UNCERTAIN' }; },
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

// Restart window: a printer may have emitted bytes after a durable claim
// but before the physical result could be recorded. Never replay blindly.
for (const state of ['CLAIMED', 'DISPATCH_UNCERTAIN']) {
  test(`Edge print worker treats restored ${state} as manual-review-only, never reprints`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gospots-print-uncertain-'));
    const path = join(dir, 'edge.db');
    try {
      let store = new EdgeStore(path);
      let continuity = new PrintContinuityStore(store);
      continuity.stage({ id: 'uncertain-1', payload: { text: 'Receipt' }, printer: { adapter: 'test' } });
      if (state === 'DISPATCH_UNCERTAIN') continuity.markDispatchUncertain('uncertain-1');
      store.close();

      store = new EdgeStore(path);
      continuity = new PrintContinuityStore(store);
      const calls = [];
      const hub = Object.create(EdgeHub.prototype);
      hub.printWorkerRunning = false;
      hub.printContinuity = continuity;
      hub.printExecutor = async () => { calls.push('PRINTED'); };
      hub.cloud = {
        registeredDeviceId: 'edge-1',
        claimPrintJob: async () => { calls.push('CLAIM'); return { job: null }; },
        markPrintJobPrinting: async () => { calls.push('CLOUD_PRINTING'); },
        completePrintJob: async () => { calls.push('CLOUD_ACK'); },
      };
      const first = await hub.processPrintQueue();
      const second = await hub.processPrintQueue();
      assert.equal(first.manualReviewRequired, true);
      assert.equal(second.manualReviewRequired, true);
      assert.equal(first.reason, 'PHYSICAL_PRINT_OUTCOME_UNKNOWN');
      assert.deepEqual(calls, ['CLAIM', 'CLAIM']);
      assert.equal(continuity.next().state, state);
      const diagnostics = continuity.diagnostics();
      assert.equal(diagnostics.claimed + diagnostics.dispatchUncertain, 1);
      store.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('ambiguous printer disconnect stays pending human review, not FAILED/auto-retry', async () => {
  const completions = [];
  const hub = Object.create(EdgeHub.prototype);
  hub.printWorkerRunning = false;
  hub.printContinuity = memoryPrintContinuity();
  hub.printExecutor = async () => { throw new Error('TCP socket closed after write'); };
  hub.cloud = {
    registeredDeviceId: 'edge-1',
    claimPrintJob: async () => ({ job: { id: 'print-disconnect', payload: { text: 'receipt' } } }),
    markPrintJobPrinting: async () => {},
    completePrintJob: async (...args) => { completions.push(args); },
  };
  const attempt = await hub.processPrintQueue();
  assert.equal(attempt.manualReviewRequired, true);
  assert.equal(hub.printContinuity.next().state, 'DISPATCH_UNCERTAIN');
  assert.equal((await hub.processPrintQueue()).manualReviewRequired, true);
  assert.deepEqual(completions, []);
});

test('successful physical print followed by result-persistence failure never sends FAILED to cloud', async () => {
  const completions = [];
  const continuity = memoryPrintContinuity();
  continuity.markPrinted = () => { throw new Error('local disk write failed'); };
  const hub = Object.create(EdgeHub.prototype);
  hub.printWorkerRunning = false;
  hub.printContinuity = continuity;
  let physicalCount = 0;
  hub.printExecutor = async () => { physicalCount += 1; return { bytes: 12 }; };
  hub.cloud = {
    registeredDeviceId: 'edge-1',
    claimPrintJob: async () => ({ job: { id: 'print-disk-failure', payload: {} } }),
    markPrintJobPrinting: async () => {},
    completePrintJob: async (...args) => { completions.push(args); },
  };
  const result = await hub.processPrintQueue();
  assert.equal(result.manualReviewRequired, true);
  assert.equal(result.reason, 'PHYSICAL_PRINT_OUTCOME_UNKNOWN');
  assert.equal((await hub.processPrintQueue()).manualReviewRequired, true);
  assert.equal(physicalCount, 1);
  assert.deepEqual(completions, []);
});

test('uncertain local job cannot starve unrelated printable cloud job, including after SQLite restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gospots-print-liveness-'));
  const path = join(dir, 'edge.db');
  try {
    let store = new EdgeStore(path);
    let journal = new PrintContinuityStore(store);
    journal.stage({ id: 'uncertain-old', payload: { text: 'Old' } });
    journal.markDispatchUncertain('uncertain-old');
    store.close();

    store = new EdgeStore(path);
    journal = new PrintContinuityStore(store);
    const hub = Object.create(EdgeHub.prototype);
    hub.printWorkerRunning = false;
    hub.printContinuity = journal;
    let prints = 0;
    let claimed = 0;
    hub.printExecutor = async () => { prints += 1; return { bytes: 18 }; };
    hub.cloud = {
      registeredDeviceId: 'edge-1',
      claimPrintJob: async () => {
        claimed += 1;
        return { job: claimed === 1 ? { id: 'unrelated-new', payload: { text: 'New' } } : null };
      },
      markPrintJobPrinting: async () => {},
      completePrintJob: async () => {},
    };
    assert.equal((await hub.processPrintQueue()).succeeded, 1);
    assert.equal(prints, 1);
    assert.equal(journal.next().jobId, 'uncertain-old');
    assert.equal(journal.next().state, 'DISPATCH_UNCERTAIN');
    assert.equal((await hub.processPrintQueue()).manualReviewRequired, true);
    assert.equal(prints, 1);
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('cloud reclaim of already uncertain or acknowledged job IDs never redispatches', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gospots-print-idempotent-'));
  const hub = new EdgeHub({ dbPath: join(dir, 'edge.db'), keyPath: join(dir, 'key') });
  try {
    const journal = hub.printContinuity;
    const uncertain = { id: 'same-id', payload: { text: 'X' } };
    journal.stage(uncertain);
    journal.markDispatchUncertain(uncertain.id);
    let printed = 0;
    hub.printExecutor = async () => { printed += 1; return { bytes: 1 }; };
    let job = uncertain;
    hub.cloud = {
      registeredDeviceId: 'edge-1',
      claimPrintJob: async () => ({ job }),
      markPrintJobPrinting: async () => {},
      completePrintJob: async () => {},
    };
    assert.equal((await hub.processPrintQueue()).manualReviewRequired, true);
    assert.equal(printed, 0);
    job = { id: 'same-id', payload: { text: 'changed' } };
    await assert.rejects(hub.processPrintQueue(), /IDEMPOTENCY_CONFLICT/);
    assert.equal(printed, 0);
    journal.markPrinted('same-id', { bytes: 1 });
    assert.equal((await hub.processPrintQueue()).acknowledged, 1);
    job = uncertain;
    assert.equal((await hub.processPrintQueue()).duplicate, true);
    assert.equal(printed, 0);
    assert.equal(journal.next(), null);
  } finally {
    hub.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pre-dispatch SQLite marker failure prevents any physical printer I/O', async () => {
  const journal = memoryPrintContinuity();
  journal.markDispatchUncertain = () => { throw new Error('simulated SQLite fsync failure'); };
  const hub = Object.create(EdgeHub.prototype);
  hub.printWorkerRunning = false;
  hub.printContinuity = journal;
  let printCount = 0;
  let cloudAckCount = 0;
  hub.printExecutor = async () => { printCount += 1; };
  hub.cloud = {
    registeredDeviceId: 'edge-1',
    claimPrintJob: async () => ({ job: { id: 'pre-dispatch-io-block', payload: {} } }),
    markPrintJobPrinting: async () => {},
    completePrintJob: async () => { cloudAckCount += 1; },
  };
  await assert.rejects(hub.processPrintQueue(), /simulated SQLite fsync failure/);
  assert.equal(printCount, 0);
  assert.equal(cloudAckCount, 0);
  assert.equal(hub.printWorkerRunning, false);
});
