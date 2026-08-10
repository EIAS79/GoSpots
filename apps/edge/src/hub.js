import { randomBytes, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { hostname } from 'node:os';
import { decryptSecret, encryptSecret, generateCloudKeyPair, loadOrCreateMasterKey, verifyLanSignature } from './crypto.js';
import { EdgeStore } from './store.js';
import { CloudClient } from './cloud-client.js';

export const EDGE_VERSION = '0.1.0';
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export class EdgeHub {
  constructor({ dbPath, keyPath, pairToken, cloudUrl, fetchImpl } = {}) {
    const resolvedDb = dbPath ?? process.env.EDGE_DB_PATH ?? join(process.cwd(), 'data', 'edge.db');
    const resolvedKey = keyPath ?? process.env.EDGE_KEY_PATH ?? join(dirname(resolvedDb), 'edge-master.key');
    this.store = new EdgeStore(resolvedDb);
    this.masterKey = loadOrCreateMasterKey(resolvedKey);
    this.pairToken = pairToken ?? process.env.EDGE_PAIR_TOKEN ?? randomBytes(24).toString('base64url');
    this.listeners = new Set();

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
      privateKeyPem: decryptSecret(encryptedPrivate, this.masterKey),
      publicKeyPem,
      fetchImpl,
    });
  }

  close() { this.store.close(); }
  publicKeyPem() { return this.store.getMeta('cloudPublicKey'); }

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
    if (!nonce || !this.store.consumeNonce(clientId, nonce)) throw new Error('Replayed Edge client nonce');
    const secret = decryptSecret(device.secret_cipher, this.masterKey);
    if (!verifyLanSignature(secret, signature, method, path, body, timestamp, nonce)) throw new Error('Invalid Edge client signature');
    this.store.touchLanDevice(clientId);
    return device;
  }

  appendEvent(event) {
    const saved = this.store.appendEvent(event);
    if (!saved.duplicate) for (const listener of this.listeners) listener(saved);
    return saved;
  }

  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  status() {
    const diagnostics = this.store.diagnostics();
    return {
      service: 'gospots-edge', version: EDGE_VERSION,
      cloudRegistered: Boolean(this.cloud.registeredDeviceId),
      cloudDeviceId: this.cloud.registeredDeviceId,
      shopId: this.store.getMeta('shopId'),
      pendingEvents: diagnostics.events.pending,
      lastSequence: diagnostics.events.lastSequence,
    };
  }

  diagnostics() {
    return {
      ...this.status(),
      ...this.store.diagnostics(),
    };
  }

  async registerCloud(provisioningToken) {
    return this.cloud.register(provisioningToken, EDGE_VERSION, hostname());
  }
}
