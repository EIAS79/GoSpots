import test from 'node:test';
import assert from 'node:assert/strict';
import { EdgeHub } from '../src/hub.js';
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

test('Edge print worker reports success exactly after execution', async () => {
  const calls = [];
  const hub = Object.create(EdgeHub.prototype);
  hub.printWorkerRunning = false;
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
