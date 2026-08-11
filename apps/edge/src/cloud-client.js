import { randomUUID } from 'node:crypto';
import { signCloudRequest } from './crypto.js';

function normalizeApiBase(baseUrl) {
  if (!baseUrl) return null;
  const trimmed = baseUrl.replace(/\/$/, '');
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}

export class CloudClient {
  constructor({ baseUrl, store, privateKeyPem, publicKeyPem, fetchImpl = fetch }) {
    this.baseUrl = normalizeApiBase(baseUrl);
    this.store = store;
    this.privateKeyPem = privateKeyPem;
    this.publicKeyPem = publicKeyPem;
    this.fetch = fetchImpl;
  }

  get registeredDeviceId() { return this.store.getMeta('cloudDeviceId'); }

  async register(provisioningToken, version, hostname) {
    if (!this.baseUrl) throw new Error('EDGE_CLOUD_URL is not configured');
    const body = { provisioningToken, publicKeyPem: this.publicKeyPem, version, hostname };
    const response = await this.fetch(`${this.baseUrl}/edge-hub/register`, {
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
    return this.fetch(`${this.baseUrl}${path}`, {
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

  async claimPrintJob() {
    return this.signedJsonPost('/hardware/edge/print-jobs/claim', {});
  }

  async markPrintJobPrinting(jobId) {
    return this.signedJsonPost(`/hardware/edge/print-jobs/${encodeURIComponent(jobId)}/printing`, {});
  }

  async completePrintJob(jobId, result) {
    return this.signedJsonPost(`/hardware/edge/print-jobs/${encodeURIComponent(jobId)}/complete`, result);
  }

  async heartbeat(version) {
    const response = await this.signedPost('/edge-hub/cloud/heartbeat', { version });
    if (!response.ok) throw new Error(`Cloud heartbeat failed (${response.status})`);
    return response.json();
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
        if (response.status === 409 || response.status === 400 || response.status === 422) {
          this.store.markCloudConflict(
            event.eventId,
            data?.message ?? `Cloud permanently rejected event (HTTP ${response.status})`,
          );
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
