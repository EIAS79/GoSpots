import { DatabaseSync } from 'node:sqlite';
import { canonicalJson, sha256 } from './canonical.js';

const SAFE_OPERATIONS = new Set(['CHECK_CREATE', 'CHECK_UPDATE']);
const SAFE_FIELDS = new Set(['guestName', 'guestEmail', 'guestPhone', 'label', 'note', 'partySize']);

function nowIso() { return new Date().toISOString(); }

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('payload must be an object');
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!SAFE_FIELDS.has(key)) throw new Error(`Offline Edge field is not supported: ${key}`);
    out[key] = value;
  }
  return out;
}

export class EdgeStore {
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lan_devices (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        secret_cipher TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT,
        revoked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS request_nonces (
        device_id TEXT NOT NULL,
        nonce TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        PRIMARY KEY (device_id, nonce)
      );
      CREATE TABLE IF NOT EXISTS aggregates (
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (aggregate_type, aggregate_id)
      );
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        source_device_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        expected_version INTEGER,
        payload_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        result_version INTEGER NOT NULL,
        cloud_state TEXT NOT NULL DEFAULT 'PENDING',
        cloud_attempts INTEGER NOT NULL DEFAULT 0,
        cloud_error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_events_cloud_state_sequence ON events(cloud_state, sequence);
    `);
  }

  close() { this.db.close(); }

  getMeta(key) { return this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null; }
  setMeta(key, value) {
    this.db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
  }

  registerLanDevice(id, label, secretCipher) {
    this.db.prepare('INSERT INTO lan_devices(id,label,secret_cipher,created_at) VALUES(?,?,?,?)').run(id, label, secretCipher, nowIso());
    return { id, label };
  }

  getLanDevice(id) { return this.db.prepare('SELECT * FROM lan_devices WHERE id = ?').get(id) ?? null; }
  touchLanDevice(id) { this.db.prepare('UPDATE lan_devices SET last_seen_at = ? WHERE id = ?').run(nowIso(), id); }

  consumeNonce(deviceId, nonce, ttlMs = 5 * 60_000) {
    const now = Date.now();
    this.db.prepare('DELETE FROM request_nonces WHERE expires_at < ?').run(new Date(now).toISOString());
    try {
      this.db.prepare('INSERT INTO request_nonces(device_id,nonce,expires_at) VALUES(?,?,?)').run(
        deviceId, nonce, new Date(now + ttlMs).toISOString(),
      );
      return true;
    } catch (error) {
      if (String(error?.message ?? '').includes('UNIQUE constraint failed')) return false;
      throw error;
    }
  }

  getAggregate(entityId) {
    const row = this.db.prepare("SELECT * FROM aggregates WHERE aggregate_type='GuestCheck' AND aggregate_id=?").get(entityId);
    return row ? { entityId, version: row.version, state: JSON.parse(row.state_json), updatedAt: row.updated_at } : null;
  }

  listEvents(after = 0, limit = 500) {
    return this.db.prepare('SELECT * FROM events WHERE sequence > ? ORDER BY sequence ASC LIMIT ?').all(after, limit).map(this.#eventRow);
  }

  pendingEvents(limit = 100) {
    return this.db.prepare("SELECT * FROM events WHERE cloud_state='PENDING' ORDER BY sequence ASC LIMIT ?").all(limit).map(this.#eventRow);
  }

  markCloudSynced(eventId) {
    this.db.prepare("UPDATE events SET cloud_state='SYNCED', cloud_attempts=cloud_attempts+1, cloud_error=NULL WHERE event_id=?").run(eventId);
  }

  markCloudConflict(eventId, message) {
    this.db.prepare("UPDATE events SET cloud_state='CONFLICT', cloud_attempts=cloud_attempts+1, cloud_error=? WHERE event_id=?").run(String(message).slice(0, 500), eventId);
  }

  markCloudAttemptFailed(eventId, message) {
    this.db.prepare("UPDATE events SET cloud_attempts=cloud_attempts+1, cloud_error=? WHERE event_id=?").run(String(message).slice(0, 500), eventId);
  }

  appendEvent(input) {
    if (!SAFE_OPERATIONS.has(input.operationType)) throw new Error(`OFFLINE_UNSUPPORTED: ${input.operationType}`);
    const payload = sanitizePayload(input.payload);
    const calculatedHash = sha256(canonicalJson(payload));
    if (calculatedHash !== String(input.payloadHash).toLowerCase()) throw new Error('payloadHash does not match payload');
    const normalized = {
      eventId: String(input.eventId),
      sourceDeviceId: String(input.sourceDeviceId),
      operationType: input.operationType,
      entityId: String(input.entityId),
      expectedVersion: input.expectedVersion ?? null,
      payload,
      payloadHash: calculatedHash,
      occurredAt: input.occurredAt ?? nowIso(),
    };
    const requestHash = sha256(canonicalJson(normalized));

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const duplicate = this.db.prepare('SELECT * FROM events WHERE event_id=?').get(normalized.eventId);
      if (duplicate) {
        const duplicateHash = sha256(canonicalJson({
          eventId: duplicate.event_id,
          sourceDeviceId: duplicate.source_device_id,
          operationType: duplicate.operation_type,
          entityId: duplicate.entity_id,
          expectedVersion: duplicate.expected_version,
          payload: JSON.parse(duplicate.payload_json),
          payloadHash: duplicate.payload_hash,
          occurredAt: duplicate.occurred_at,
        }));
        if (duplicateHash !== requestHash) throw new Error('IDEMPOTENCY_CONFLICT: eventId already used with different content');
        this.db.exec('COMMIT');
        return { ...this.#eventRow(duplicate), duplicate: true };
      }

      const current = this.db.prepare("SELECT * FROM aggregates WHERE aggregate_type='GuestCheck' AND aggregate_id=?").get(normalized.entityId);
      let nextVersion;
      let nextState;
      if (normalized.operationType === 'CHECK_CREATE') {
        if (normalized.expectedVersion !== null) throw new Error('CHECK_CREATE must not include expectedVersion');
        if (current) throw new Error(`STATE_CONFLICT: GuestCheck already exists at version ${current.version}`);
        nextVersion = 1;
        nextState = payload;
      } else {
        if (!Number.isInteger(normalized.expectedVersion) || normalized.expectedVersion < 1) throw new Error('CHECK_UPDATE requires expectedVersion');
        if (!current) throw new Error('STATE_CONFLICT: GuestCheck does not exist locally');
        if (current.version !== normalized.expectedVersion) {
          throw new Error(`VERSION_CONFLICT: expected ${normalized.expectedVersion}, current ${current.version}`);
        }
        nextVersion = current.version + 1;
        nextState = { ...JSON.parse(current.state_json), ...payload };
      }

      this.db.prepare(`INSERT INTO aggregates(aggregate_type,aggregate_id,version,state_json,updated_at)
        VALUES('GuestCheck',?,?,?,?)
        ON CONFLICT(aggregate_type,aggregate_id) DO UPDATE SET version=excluded.version,state_json=excluded.state_json,updated_at=excluded.updated_at`
      ).run(normalized.entityId, nextVersion, canonicalJson(nextState), nowIso());

      const result = this.db.prepare(`INSERT INTO events(event_id,source_device_id,operation_type,entity_id,expected_version,payload_hash,payload_json,occurred_at,result_version)
        VALUES(?,?,?,?,?,?,?,?,?) RETURNING *`).get(
          normalized.eventId, normalized.sourceDeviceId, normalized.operationType, normalized.entityId,
          normalized.expectedVersion, normalized.payloadHash, canonicalJson(payload), normalized.occurredAt, nextVersion,
        );
      this.db.exec('COMMIT');
      return this.#eventRow(result);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  #eventRow(row) {
    return {
      sequence: row.sequence,
      eventId: row.event_id,
      sourceDeviceId: row.source_device_id,
      operationType: row.operation_type,
      entityId: row.entity_id,
      expectedVersion: row.expected_version ?? undefined,
      payloadHash: row.payload_hash,
      payload: JSON.parse(row.payload_json),
      occurredAt: row.occurred_at,
      resultVersion: row.result_version,
      cloudState: row.cloud_state,
      cloudAttempts: row.cloud_attempts,
      cloudError: row.cloud_error,
    };
  }
}
