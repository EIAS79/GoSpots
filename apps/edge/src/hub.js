import { randomBytes, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { hostname } from 'node:os';
import { decryptSecret, encryptSecret, generateCloudKeyPair, loadOrCreateMasterKey, verifyLanSignature } from './crypto.js';
import { EdgeStore } from './store.js';
import { CloudClient } from './cloud-client.js';
import { cloudConnectivityStatus } from './status-health.js';
import { executePrintJob } from './printer.js';
import { ContinuityEngine } from './continuity.js';
import { OFFLINE_POLICY } from './offline-policy.js';
import { PrintContinuityStore } from './print-continuity.js';

export const EDGE_VERSION = '0.2.0';
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export class EdgeHub {
  constructor({ dbPath, keyPath, pairToken, cloudUrl, fetchImpl, printExecutor = executePrintJob } = {}) {
    const resolvedDb = dbPath ?? process.env.EDGE_DB_PATH ?? join(process.cwd(), 'data', 'edge.db');
    const resolvedKey = keyPath ?? process.env.EDGE_KEY_PATH ?? join(dirname(resolvedDb), 'edge-master.key');
    this.store = new EdgeStore(resolvedDb);
    this.continuity = new ContinuityEngine(this.store);
    this.printContinuity = new PrintContinuityStore(this.store);
    this.masterKey = loadOrCreateMasterKey(resolvedKey);
    this.pairToken = pairToken ?? process.env.EDGE_PAIR_TOKEN ?? randomBytes(24).toString('base64url');
    this.listeners = new Set();
    this.printExecutor = printExecutor;
    this.printWorkerRunning = false;

    let publicKeyPem = this.store.getMeta('cloudPublicKey');
    let encryptedPrivate = this.store.getMeta('cloudPrivateKey');
    if (!publicKeyPem || !encryptedPrivate) {
      const pair = generateCloudKeyPair();
      publicKeyPem = pair.publicKeyPem;
      encryptedPrivate = encryptSecret(pair.privateKeyPem, this.masterKey);
      this.store.setMeta('cloudPublicKey', publicKeyPem);
      this.store.setMeta('cloudPrivateKey', encryptedPrivate);
    }
    this.cloud = new CloudClient({
      baseUrl: cloudUrl ?? process.env.EDGE_CLOUD_URL,
      store: this.store,
      continuity: this.continuity,
      privateKeyPem: decryptSecret(encryptedPrivate, this.masterKey),
      publicKeyPem,
      fetchImpl,
    });
  }

  close() { this.store.close(); }
  publicKeyPem() { return this.store.getMeta('cloudPublicKey'); }
  offlinePolicy() { return OFFLINE_POLICY; }

  registerLanClient(token, label = 'POS') {
    if (!token || token !== this.pairToken) throw new Error('Invalid Edge pairing token');
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    this.store.registerLanDevice(id, String(label).slice(0, 120), encryptSecret(secret, this.masterKey));
    return { clientId: id, secret };
  }

  authenticateLan({ clientId, timestamp, nonce, signature, method, path, body }) {
    const device = this.store.getLanDevice(clientId);
    if (!device || device.revoked_at) throw new Error('Unknown or revoked Edge client');
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed) || Math.abs(Date.now() - parsed) > MAX_CLOCK_SKEW_MS) throw new Error('Stale Edge client timestamp');
    if (!nonce) throw new Error('Missing Edge client nonce');
    const secret = decryptSecret(device.secret_cipher, this.masterKey);
    if (!verifyLanSignature(secret, signature, method, path, body, timestamp, nonce)) throw new Error('Invalid Edge client signature');
    if (!this.store.consumeNonce(clientId, nonce)) throw new Error('Replayed Edge client nonce');
    this.store.touchLanDevice(clientId);
    return device;
  }

  appendEvent(event) {
    const saved = this.store.appendEvent(event);
    if (!saved.duplicate) for (const listener of this.listeners) listener(saved);
    return saved;
  }

  appendCommand(command) {
    const saved = this.continuity.createCommand(command);
    if (!saved.duplicate) {
      for (const listener of this.listeners) listener({ sequence: saved.localSequence, kind: 'continuity-command', ...saved });
    }
    return saved;
  }

  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  status() {
    const diagnostics = this.store.diagnostics();
    const continuity = this.continuity.diagnostics();
    const printing = this.printContinuity.diagnostics();
    return {
      service: 'gospots-edge', version: EDGE_VERSION,
      cloudRegistered: Boolean(this.cloud.registeredDeviceId),
      cloudDeviceId: this.cloud.registeredDeviceId,
      cloudConnectivity: cloudConnectivityStatus(this.cloud),
      shopId: this.store.getMeta('shopId'),
      pendingEvents: diagnostics.events.pending,
      pendingCommands: continuity.commands.pending,
      unresolvedConflicts: continuity.unresolvedConflicts,
      snapshotCursor: continuity.snapshotCursor,
      lastSequence: diagnostics.events.lastSequence,
      printWorkerRunning: this.printWorkerRunning,
      printPendingAck: printing.printedPendingAck + printing.failedPendingAck,
    };
  }

  diagnostics() {
    const legacy = this.store.diagnostics();
    return {
      ...this.status(),
      ...legacy,
      legacyReplay: legacy,
      continuity: this.continuity.diagnostics(),
      printing: this.printContinuity.diagnostics(),
    };
  }

  async registerCloud(provisioningToken) {
    return this.cloud.register(provisioningToken, EDGE_VERSION, hostname());
  }

  async syncAll(limit = 100) {
    const legacy = await this.cloud.syncPending(limit);
    const commands = await this.cloud.syncContinuityPending(limit);
    const snapshot = await this.cloud.pullSnapshot().catch((error) => ({ pulled: false, error: error?.message ?? String(error) }));
    return { legacy, commands, snapshot };
  }

  async #ackStagedPrint(staged) {
    const job = staged.job;
    if (staged.state === 'PRINTED_PENDING_ACK') {
      await this.cloud.completePrintJob(job.id, { status: 'SUCCEEDED' });
      this.printContinuity.markAcknowledged(job.id);
      return { processed: 0, acknowledged: 1, jobId: job.id, priorPhysicalResult: staged.result };
    }
    if (staged.state === 'FAILED_PENDING_ACK') {
      await this.cloud.completePrintJob(job.id, {
        status: 'FAILED',
        errorCode: /UNSUPPORTED/i.test(staged.error ?? '') ? 'UNSUPPORTED_PRINTER_ADAPTER' : 'EDGE_PRINT_FAILED',
        error: String(staged.error ?? 'Edge print failed').slice(0, 1000),
      });
      this.printContinuity.markAcknowledged(job.id);
      return { processed: 0, acknowledgedFailure: 1, jobId: job.id };
    }
    return null;
  }

  async processPrintQueue() {
    if (!this.cloud.registeredDeviceId || this.printWorkerRunning) return { processed: 0, skipped: true };
    this.printWorkerRunning = true;
    try {
      let staged = this.printContinuity.next();
      if (staged && staged.state !== 'CLAIMED') return await this.#ackStagedPrint(staged);

      if (!staged) {
        const claimed = await this.cloud.claimPrintJob();
        const job = claimed?.job;
        if (!job) return { processed: 0 };
        staged = this.printContinuity.stage(job);
      }
      const job = staged.job;

      // Claim was already persisted locally. Failure to update cloud to PRINTING must
      // not force a duplicate physical print after connectivity returns.
      try { await this.cloud.markPrintJobPrinting(job.id); } catch { /* durable local claim is authoritative for physical execution */ }

      try {
        const result = await this.printExecutor(job);
        this.printContinuity.markPrinted(job.id, result);
        try {
          await this.cloud.completePrintJob(job.id, { status: 'SUCCEEDED' });
          this.printContinuity.markAcknowledged(job.id);
          return { processed: 1, succeeded: 1, jobId: job.id, result };
        } catch (error) {
          return { processed: 1, succeeded: 1, pendingAck: true, jobId: job.id, result, ackError: error?.message ?? String(error) };
        }
      } catch (error) {
        const message = error?.message ?? String(error);
        this.printContinuity.markFailed(job.id, message);
        try {
          await this.cloud.completePrintJob(job.id, {
            status: 'FAILED',
            errorCode: /UNSUPPORTED/i.test(message) ? 'UNSUPPORTED_PRINTER_ADAPTER' : 'EDGE_PRINT_FAILED',
            error: String(message).slice(0, 1000),
          });
          this.printContinuity.markAcknowledged(job.id);
        } catch (completionError) {
          return { processed: 1, failed: 1, pendingAck: true, jobId: job.id, error: message, ackError: completionError?.message ?? String(completionError) };
        }
        return { processed: 1, failed: 1, jobId: job.id, error: message };
      }
    } finally {
      this.printWorkerRunning = false;
    }
  }
}
