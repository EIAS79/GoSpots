import { randomUUID } from 'node:crypto';
import { signCloudRequest } from './crypto.js';

function normalizeApiBase(baseUrl) {
  if (!baseUrl) return null;
  const trimmed = baseUrl.replace(/\/$/, '');
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}

function errorMessage(error) {
  return String(error?.message ?? error ?? 'Unknown cloud transport error').slice(0, 500);
}

function domainCode(data) {
  return data?.code ?? data?.error?.code ?? data?.details?.code ?? null;
}

export class CloudClient {
  constructor({ baseUrl, store, continuity, privateKeyPem, publicKeyPem, fetchImpl = fetch }) {
    this.baseUrl = normalizeApiBase(baseUrl);
    this.store = store;
    this.continuity = continuity;
    this.privateKeyPem = privateKeyPem;
    this.publicKeyPem = publicKeyPem;
    this.fetch = fetchImpl;
  }

  get registeredDeviceId() { return this.store.getMeta('cloudDeviceId'); }

  markCloudReachable() {
    const now = new Date().toISOString();
    this.store.setMeta('cloudConnectivityState', 'ONLINE');
    this.store.setMeta('cloudLastSuccessAt', now);
    this.store.setMeta('cloudLastError', '');
  }

  markCloudUnreachable(error) {
    const now = new Date().toISOString();
    this.store.setMeta('cloudConnectivityState', 'OFFLINE');
    this.store.setMeta('cloudLastFailureAt', now);
    this.store.setMeta('cloudLastError', errorMessage(error));
  }

  connectivityStatus() {
    if (!this.registeredDeviceId) {
      return { state: 'UNREGISTERED', lastSuccessAt: null, lastFailureAt: null, lastError: null };
    }
    const lastError = this.store.getMeta('cloudLastError');
    return {
      state: this.store.getMeta('cloudConnectivityState') ?? 'UNKNOWN',
      lastSuccessAt: this.store.getMeta('cloudLastSuccessAt'),
      lastFailureAt: this.store.getMeta('cloudLastFailureAt'),
      lastError: lastError || null,
    };
  }

  async fetchWithHealth(url, options) {
    try {
      const response = await this.fetch(url, options);
      this.markCloudReachable();
      return response;
    } catch (error) {
      this.markCloudUnreachable(error);
      throw error;
    }
  }

  async register(provisioningToken, version, hostname) {
    if (!this.baseUrl) throw new Error('EDGE_CLOUD_URL is not configured');
    const body = { provisioningToken, publicKeyPem: this.publicKeyPem, version, hostname };
    const response = await this.fetchWithHealth(`${this.baseUrl}/edge-hub/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message ?? `Cloud registration failed (${response.status})`);
    this.store.setMeta('cloudDeviceId', data.deviceId);
    this.store.setMeta('shopId', data.shopId);
    return data;
  }

  async signedPost(path, body) {
    const deviceId = this.registeredDeviceId;
    if (!deviceId) throw new Error('Edge Hub is not registered with cloud');
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const signature = signCloudRequest(this.privateKeyPem, 'POST', path, body, timestamp, nonce);
    return this.fetchWithHealth(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-edge-device-id': deviceId,
        'x-edge-timestamp': timestamp,
        'x-edge-nonce': nonce,
        'x-edge-signature': signature,
      },
      body: JSON.stringify(body),
    });
  }

  async signedJsonPost(path, body) {
    const response = await this.signedPost(path, body);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message ?? `Cloud request failed (${response.status})`);
    return data;
  }

  claimPrintJob() { return this.signedJsonPost('/hardware/edge/print-jobs/claim', {}); }
  markPrintJobPrinting(jobId) { return this.signedJsonPost(`/hardware/edge/print-jobs/${encodeURIComponent(jobId)}/printing`, {}); }
  completePrintJob(jobId, result) { return this.signedJsonPost(`/hardware/edge/print-jobs/${encodeURIComponent(jobId)}/complete`, result); }

  async heartbeat(version) {
    const response = await this.signedPost('/edge-hub/cloud/heartbeat', { version });
    if (!response.ok) throw new Error(`Cloud heartbeat failed (${response.status})`);
    return response.json();
  }

  async pullSnapshot() {
    if (!this.baseUrl || !this.registeredDeviceId || !this.continuity) return { pulled: false, skipped: true };
    const cursor = this.store.getMeta('snapshotCursor');
    const response = await this.signedPost('/edge-hub/cloud/snapshot', { cursor });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.message ?? `Snapshot pull failed (${response.status})`);
    this.continuity.applySnapshot(data);
    return { pulled: true, cursor: data.cursor, generatedAt: data.generatedAt };
  }

  async syncContinuityPending(limit = 100) {
    if (!this.baseUrl || !this.registeredDeviceId || !this.continuity) return { synced: 0, conflicts: 0, skipped: true };
    let synced = 0;
    let conflicts = 0;
    for (const command of this.continuity.pendingCommands(limit)) {
      const body = {
        operationId: command.operationId,
        deviceId: command.deviceId,
        venueId: command.venueId,
        localSequence: command.localSequence,
        idempotencyKey: command.idempotencyKey,
        operationType: command.operationType,
        aggregateType: command.aggregateType,
        entityId: command.aggregateId,
        ...(command.aggregateVersion === undefined ? {} : { expectedVersion: command.aggregateVersion }),
        occurredAt: command.occurredAt,
        correlationId: command.correlationId,
        payloadHash: command.payloadHash,
        payload: command.payload,
      };
      try {
        const response = await this.signedPost('/edge-hub/cloud/replay', body);
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          this.continuity.markSynced(command.operationId, data);
          synced += 1;
          continue;
        }
        if ([400, 409, 422].includes(response.status)) {
          const code = domainCode(data);
          this.continuity.markConflict(command.operationId, command.operationType, code, data?.message ?? `Cloud rejected command (${response.status})`, data?.details ?? data?.error?.details);
          conflicts += 1;
          continue;
        }
        this.continuity.markRetry(command.operationId, data?.message ?? `HTTP ${response.status}`);
        break;
      } catch (error) {
        this.continuity.markRetry(command.operationId, error?.message ?? error);
        break;
      }
    }
    return { synced, conflicts, pending: this.continuity.pendingCommands(limit).length };
  }

  async syncPending(limit = 100) {
    if (!this.baseUrl || !this.registeredDeviceId) return { synced: 0, skipped: true };
    let synced = 0;
    let conflicts = 0;
    for (const event of this.store.pendingEvents(limit)) {
      const body = {
        operationId: event.eventId,
        deviceId: event.sourceDeviceId,
        operationType: event.operationType,
        entityId: event.entityId,
        ...(event.expectedVersion === undefined ? {} : { expectedVersion: event.expectedVersion }),
        occurredAt: event.occurredAt,
        payloadHash: event.payloadHash,
        payload: event.payload,
      };
      try {
        const response = await this.signedPost('/edge-hub/cloud/replay', body);
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          this.store.markCloudSynced(event.eventId);
          synced += 1;
          continue;
        }
        if ([400, 409, 422].includes(response.status)) {
          this.store.markCloudConflict(event.eventId, data?.message ?? `Cloud permanently rejected event (HTTP ${response.status})`);
          conflicts += 1;
          continue;
        }
        this.store.markCloudAttemptFailed(event.eventId, data?.message ?? `HTTP ${response.status}`);
        break;
      } catch (error) {
        this.store.markCloudAttemptFailed(event.eventId, error?.message ?? error);
        break;
      }
    }
    return { synced, conflicts, pending: this.store.pendingEvents(limit).length };
  }
}
