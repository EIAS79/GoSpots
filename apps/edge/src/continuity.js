import { randomUUID } from 'node:crypto';
import { canonicalJson, sha256 } from './canonical.js';
import {
  assertCertifiedEdgeOperation,
  conflictClass,
  NEVER_AUTO_MERGE,
} from './offline-policy.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DRAWER_TRIGGERS = new Set(['CASH_SALE', 'PAID_IN', 'PAID_OUT', 'MANAGER_OPEN', 'TEST']);
const SCAN_TYPES = new Set(['BARCODE', 'QR', 'ACCESS', 'PRODUCT', 'CREDENTIAL']);
const OPERATION_PERMISSIONS = Object.freeze({
  SESSION_START: 'session.write',
  SESSION_PAUSE: 'session.write',
  SESSION_RESUME: 'session.write',
  SESSION_END: 'session.write',
  ORDER_CREATE: 'order.write',
  CHECK_CREATE: 'checkout.write',
  CHECK_UPDATE: 'checkout.write',
  CASH_PAYMENT: 'checkout.write',
});
const ZERO_MINOR_CURRENCIES = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
const THREE_MINOR_CURRENCIES = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);

function nowIso() { return new Date().toISOString(); }
function required(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
}
function positiveInt(value, field) {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer`);
  return value;
}
function currencyScale(currency) {
  const code = required(currency, 'currency').toUpperCase();
  if (ZERO_MINOR_CURRENCIES.has(code)) return 0;
  if (THREE_MINOR_CURRENCIES.has(code)) return 3;
  return 2;
}
function decimalToMinorExact(value, currency) {
  const raw = required(value, 'allocation.amount');
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) throw new Error(`allocation.amount must be a non-negative decimal: ${raw}`);
  const scale = currencyScale(currency);
  const fraction = match[2] ?? '';
  const retained = fraction.slice(0, scale).padEnd(scale, '0');
  const excess = fraction.slice(scale);
  if (/[^0]/.test(excess)) throw new Error(`allocation.amount has precision smaller than ${currency} minor units`);
  return BigInt(match[1]) * (10n ** BigInt(scale)) + BigInt(retained || '0');
}

export class ContinuityEngine {
  constructor(store) {
    this.store = store;
    this.db = store.db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS edge_cache (
        kind TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        version INTEGER,
        payload_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(kind, entity_id)
      );
      CREATE TABLE IF NOT EXISTS local_commands (
        operation_id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL,
        venue_id TEXT NOT NULL,
        local_sequence INTEGER NOT NULL,
        idempotency_key TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        aggregate_version INTEGER,
        payload_hash TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        correlation_id TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'PENDING',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        result_json TEXT,
        UNIQUE(device_id, local_sequence),
        UNIQUE(venue_id, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS idx_local_commands_state_sequence
        ON local_commands(state, local_sequence);
      CREATE TABLE IF NOT EXISTS sync_conflicts (
        id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL UNIQUE,
        conflict_class TEXT NOT NULL,
        code TEXT,
        message TEXT NOT NULL,
        details_json TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolution_json TEXT
      );
      CREATE TABLE IF NOT EXISTS local_cash_ledger (
        operation_id TEXT PRIMARY KEY,
        venue_id TEXT NOT NULL,
        settlement_id TEXT NOT NULL,
        amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
        currency TEXT NOT NULL,
        operator_user_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        cloud_state TEXT NOT NULL DEFAULT 'PENDING'
      );
      CREATE TABLE IF NOT EXISTS scanner_events (
        id TEXT PRIMARY KEY,
        scan_type TEXT NOT NULL,
        value_hash TEXT NOT NULL,
        value TEXT NOT NULL,
        device_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS customer_display_state (
        display_id TEXT PRIMARY KEY,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cash_drawer_events (
        id TEXT PRIMARY KEY,
        trigger TEXT NOT NULL,
        operator_user_id TEXT,
        reason TEXT,
        source_transaction_id TEXT,
        device_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS kds_ticket_state (
        ticket_id TEXT PRIMARY KEY,
        station_id TEXT NOT NULL,
        status TEXT NOT NULL,
        state_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  applySnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('snapshot is required');
    const venue = snapshot.venue;
    if (!venue?.id) throw new Error('snapshot venue is required');
    const registeredShop = this.store.getMeta('shopId');
    if (registeredShop && registeredShop !== venue.id) throw new Error('TENANT_CONFLICT: snapshot belongs to another venue');
    this.store.setMeta('shopId', venue.id);
    this.store.setMeta('snapshotCursor', snapshot.cursor ?? snapshot.generatedAt ?? nowIso());
    this.store.setMeta('snapshotUpdatedAt', nowIso());

    const groups = [
      ['venue', [venue]],
      ['device', snapshot.devices ?? []],
      ['operator', snapshot.operators ?? []],
      ['resource', snapshot.resources ?? []],
      ['rate', snapshot.rates ?? []],
      ['catalog', snapshot.catalog ?? []],
      ['check', snapshot.openChecks ?? []],
      ['session', snapshot.activeSessions ?? []],
      ['kds', snapshot.kdsTickets ?? []],
    ];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const [kind, rows] of groups) {
        this.db.prepare('DELETE FROM edge_cache WHERE kind=?').run(kind);
        for (const row of rows) {
          const id = required(row.id, `${kind}.id`);
          this.db.prepare(`INSERT INTO edge_cache(kind,entity_id,version,payload_json,updated_at)
            VALUES(?,?,?,?,?)`).run(kind, id, Number.isInteger(row.version) ? row.version : null, canonicalJson(row), nowIso());
          if (kind === 'kds') this.upsertKdsTicket(row);
        }
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { venueId: venue.id, cursor: this.store.getMeta('snapshotCursor') };
  }

  cache(kind, entityId) {
    const row = this.db.prepare('SELECT * FROM edge_cache WHERE kind=? AND entity_id=?').get(kind, entityId);
    return row ? { ...JSON.parse(row.payload_json), version: row.version ?? JSON.parse(row.payload_json).version } : null;
  }

  listCache(kind) {
    return this.db.prepare('SELECT payload_json FROM edge_cache WHERE kind=? ORDER BY entity_id').all(kind)
      .map((row) => JSON.parse(row.payload_json));
  }

  createCommand(input) {
    const operationType = required(input.operationType, 'operationType');
    assertCertifiedEdgeOperation(operationType);
    const venueId = required(input.venueId ?? this.store.getMeta('shopId'), 'venueId');
    const registeredShop = this.store.getMeta('shopId');
    if (registeredShop && registeredShop !== venueId) throw new Error('TENANT_CONFLICT: command venue mismatch');
    const operationId = input.operationId ?? randomUUID();
    if (!UUID_RE.test(operationId)) throw new Error('operationId must be a UUID');
    const deviceId = required(input.deviceId, 'deviceId');
    const aggregateType = required(input.aggregateType, 'aggregateType');
    const aggregateId = required(input.aggregateId, 'aggregateId');
    const payload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload) ? input.payload : {};
    const payloadHash = sha256(canonicalJson(payload));
    if (input.payloadHash && String(input.payloadHash).toLowerCase() !== payloadHash) throw new Error('payloadHash does not match payload');
    const occurredAt = input.occurredAt ?? nowIso();
    if (!Number.isFinite(Date.parse(occurredAt))) throw new Error('occurredAt is invalid');
    const correlationId = String(input.correlationId ?? operationId).slice(0, 160);
    const idempotencyKey = String(input.idempotencyKey ?? operationId).slice(0, 160);

    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.db.prepare('SELECT * FROM local_commands WHERE operation_id=?').get(operationId);
      if (existing) {
        const same = existing.payload_hash === payloadHash && existing.operation_type === operationType &&
          existing.aggregate_id === aggregateId && existing.device_id === deviceId;
        if (!same) throw new Error('IDEMPOTENCY_CONFLICT: operationId already used with different content');
        this.db.exec('COMMIT');
        return { ...this.#commandRow(existing), duplicate: true };
      }
      const sequence = Number(this.db.prepare('SELECT COALESCE(MAX(local_sequence),0)+1 AS next FROM local_commands WHERE device_id=?').get(deviceId).next);
      this.#assertOperatorPermission(operationType, payload);
      this.#applyLocalProjection({ operationType, aggregateType, aggregateId, aggregateVersion: input.aggregateVersion, payload, venueId, operationId, occurredAt });
      const row = this.db.prepare(`INSERT INTO local_commands(
          operation_id,device_id,venue_id,local_sequence,idempotency_key,operation_type,
          aggregate_type,aggregate_id,aggregate_version,payload_hash,payload_json,occurred_at,correlation_id
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`).get(
          operationId, deviceId, venueId, sequence, idempotencyKey, operationType,
          aggregateType, aggregateId, input.aggregateVersion ?? null, payloadHash, canonicalJson(payload), occurredAt, correlationId,
        );
      this.db.exec('COMMIT');
      return this.#commandRow(row);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  #assertOperatorPermission(operationType, payload) {
    const requiredPermission = OPERATION_PERMISSIONS[operationType];
    if (!requiredPermission) return;
    const operatorUserId = required(payload.operatorUserId, 'payload.operatorUserId');
    const operator = this.cache('operator', operatorUserId);
    if (!operator || operator.isActive === false) throw new Error('PERMISSION_DENIED: operator is not active in the last-known venue snapshot');
    if (operator.role === 'OWNER') return;
    const permissions = new Set(String(operator.permissions ?? '').split(',').map((value) => value.trim()).filter(Boolean));
    if (!permissions.has('*') && !permissions.has(requiredPermission)) {
      throw new Error(`PERMISSION_DENIED: operator is missing ${requiredPermission}`);
    }
  }

  #applyLocalProjection(command) {
    if (command.operationType === 'SESSION_START') {
      const resourceId = required(command.payload.resourceId, 'payload.resourceId');
      const resource = this.cache('resource', resourceId);
      if (!resource) throw new Error('RESOURCE_CONFLICT: resource is not present in last-known Edge state');
      if (['MAINTENANCE', 'DISABLED'].includes(String(resource.status))) throw new Error(`RESOURCE_CONFLICT: resource is ${resource.status}`);
      const active = this.listCache('session').find((row) => row.resourceId === resourceId && ['ACTIVE', 'PAUSED'].includes(row.status));
      if (active) throw new Error(`RESOURCE_CONFLICT: resource already has session ${active.id}`);
      this.#upsertCache('session', command.aggregateId, 1, {
        id: command.aggregateId, resourceId, status: 'ACTIVE', startedAt: command.occurredAt,
        version: 1, pendingCloud: true, ...command.payload,
      });
      return;
    }
    if (['SESSION_PAUSE', 'SESSION_RESUME', 'SESSION_END'].includes(command.operationType)) {
      const current = this.cache('session', command.aggregateId);
      if (!current) throw new Error('STATE_CONFLICT: session is not present locally');
      if (command.aggregateVersion && current.version !== command.aggregateVersion) {
        throw new Error(`VERSION_CONFLICT: expected ${command.aggregateVersion}, current ${current.version}`);
      }
      const nextStatus = command.operationType === 'SESSION_PAUSE' ? 'PAUSED' : command.operationType === 'SESSION_RESUME' ? 'ACTIVE' : 'FINISHED';
      this.#upsertCache('session', command.aggregateId, Number(current.version ?? 0) + 1, {
        ...current,
        status: nextStatus,
        version: Number(current.version ?? 0) + 1,
        ...(nextStatus === 'PAUSED' ? { pausedAt: command.occurredAt } : {}),
        ...(nextStatus === 'ACTIVE' ? { pausedAt: null } : {}),
        ...(nextStatus === 'FINISHED' ? { finishedAt: command.occurredAt } : {}),
        pendingCloud: true,
      });
      return;
    }
    if (command.operationType === 'CASH_PAYMENT') {
      const amountMinor = positiveInt(command.payload.amountMinor, 'payload.amountMinor');
      const currency = required(command.payload.currency, 'payload.currency').toUpperCase();
      const settlementId = required(command.payload.settlementId, 'payload.settlementId');
      const operatorUserId = required(command.payload.operatorUserId, 'payload.operatorUserId');
      const venue = this.cache('venue', command.venueId);
      if (venue?.currency && String(venue.currency).toUpperCase() !== currency) throw new Error('CURRENCY_CONFLICT: cash currency differs from venue currency');
      if (!Array.isArray(command.payload.allocations) || command.payload.allocations.length === 0) throw new Error('payload.allocations is required');
      const allocatedMinor = command.payload.allocations.reduce((sum, allocation) => {
        if (!allocation || typeof allocation !== 'object' || Array.isArray(allocation)) throw new Error('payload.allocations entries must be objects');
        required(allocation.snapshotId, 'allocation.snapshotId');
        return sum + decimalToMinorExact(allocation.amount, currency);
      }, 0n);
      if (allocatedMinor !== BigInt(amountMinor)) throw new Error('AMOUNT_CONFLICT: cash amountMinor must exactly equal allocation total');
      this.db.prepare(`INSERT INTO local_cash_ledger(operation_id,venue_id,settlement_id,amount_minor,currency,operator_user_id,occurred_at)
        VALUES(?,?,?,?,?,?,?)`).run(command.operationId, command.venueId, settlementId, amountMinor, currency, operatorUserId, command.occurredAt);
      return;
    }
    if (command.operationType === 'ORDER_CREATE') {
      this.#upsertCache('order', command.aggregateId, 1, { id: command.aggregateId, status: 'OPEN', pendingCloud: true, ...command.payload });
      return;
    }
    if (command.operationType === 'CHECK_CREATE') {
      this.#upsertCache('check', command.aggregateId, 1, { id: command.aggregateId, status: 'OPEN', version: 1, pendingCloud: true, ...command.payload });
      return;
    }
    if (command.operationType === 'CHECK_UPDATE') {
      const current = this.cache('check', command.aggregateId);
      if (!current) throw new Error('STATE_CONFLICT: check is not present locally');
      if (command.aggregateVersion && current.version !== command.aggregateVersion) {
        throw new Error(`VERSION_CONFLICT: expected ${command.aggregateVersion}, current ${current.version}`);
      }
      const version = Number(current.version ?? 0) + 1;
      this.#upsertCache('check', command.aggregateId, version, { ...current, ...command.payload, id: command.aggregateId, version, pendingCloud: true });
    }
  }

  #upsertCache(kind, id, version, payload) {
    this.db.prepare(`INSERT INTO edge_cache(kind,entity_id,version,payload_json,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(kind,entity_id) DO UPDATE SET version=excluded.version,payload_json=excluded.payload_json,updated_at=excluded.updated_at`)
      .run(kind, id, version ?? null, canonicalJson(payload), nowIso());
  }

  pendingCommands(limit = 100) {
    return this.db.prepare("SELECT * FROM local_commands WHERE state IN ('PENDING','RETRY') ORDER BY local_sequence ASC LIMIT ?").all(limit).map((row) => this.#commandRow(row));
  }

  markSynced(operationId, result) {
    this.db.prepare("UPDATE local_commands SET state='SYNCED',attempts=attempts+1,last_error=NULL,result_json=? WHERE operation_id=?")
      .run(canonicalJson(result ?? {}), operationId);
    this.db.prepare("UPDATE local_cash_ledger SET cloud_state='SYNCED' WHERE operation_id=?").run(operationId);
  }

  markRetry(operationId, error) {
    this.db.prepare("UPDATE local_commands SET state='RETRY',attempts=attempts+1,last_error=? WHERE operation_id=?")
      .run(String(error ?? '').slice(0, 1000), operationId);
  }

  markConflict(operationId, operationType, code, message, details) {
    const klass = conflictClass(operationType, code);
    this.db.prepare("UPDATE local_commands SET state='CONFLICT',attempts=attempts+1,last_error=? WHERE operation_id=?")
      .run(String(message).slice(0, 1000), operationId);
    this.db.prepare(`INSERT INTO sync_conflicts(id,operation_id,conflict_class,code,message,details_json,created_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(operation_id) DO UPDATE SET conflict_class=excluded.conflict_class,code=excluded.code,message=excluded.message,details_json=excluded.details_json`)
      .run(randomUUID(), operationId, klass, code ?? null, String(message).slice(0, 1000), details ? canonicalJson(details) : null, nowIso());
    return klass;
  }

  conflicts() {
    return this.db.prepare('SELECT * FROM sync_conflicts WHERE resolved_at IS NULL ORDER BY created_at').all().map((row) => ({
      id: row.id, operationId: row.operation_id, conflictClass: row.conflict_class, code: row.code,
      message: row.message, details: row.details_json ? JSON.parse(row.details_json) : null, createdAt: row.created_at,
    }));
  }

  resolveConflict(operationId, resolution) {
    const command = this.db.prepare("SELECT * FROM local_commands WHERE operation_id=? AND state='CONFLICT'").get(operationId);
    if (!command) throw new Error('Conflict not found');
    if (NEVER_AUTO_MERGE.has(command.operation_type) && resolution?.action === 'AUTO_MERGE') {
      throw new Error('FINANCIAL_MANUAL_REVIEW: financial conflicts can never be auto-merged');
    }
    this.db.prepare('UPDATE sync_conflicts SET resolved_at=?,resolution_json=? WHERE operation_id=?')
      .run(nowIso(), canonicalJson(resolution ?? {}), operationId);
    this.db.prepare("UPDATE local_commands SET state='DEAD_LETTER' WHERE operation_id=?").run(operationId);
    return { operationId, state: 'DEAD_LETTER' };
  }

  recordScan({ scanType, value, deviceId, occurredAt = nowIso() }) {
    if (!SCAN_TYPES.has(scanType)) throw new Error(`Unsupported scan type ${scanType}`);
    const raw = required(value, 'value').slice(0, 500);
    const id = randomUUID();
    this.db.prepare('INSERT INTO scanner_events(id,scan_type,value_hash,value,device_id,occurred_at) VALUES(?,?,?,?,?,?)')
      .run(id, scanType, sha256(raw), raw, required(deviceId, 'deviceId'), occurredAt);
    const product = scanType === 'BARCODE' || scanType === 'PRODUCT'
      ? this.listCache('catalog').find((item) => item.barcode === raw || item.sku === raw) ?? null
      : null;
    return { id, scanType, occurredAt, product };
  }

  setCustomerDisplay(displayId, state) {
    this.db.prepare(`INSERT INTO customer_display_state(display_id,state_json,updated_at) VALUES(?,?,?)
      ON CONFLICT(display_id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at`)
      .run(required(displayId, 'displayId'), canonicalJson(state ?? {}), nowIso());
    return { displayId, state };
  }

  getCustomerDisplay(displayId) {
    const row = this.db.prepare('SELECT * FROM customer_display_state WHERE display_id=?').get(displayId);
    return row ? { displayId, state: JSON.parse(row.state_json), updatedAt: row.updated_at } : null;
  }

  openCashDrawer({ trigger, operatorUserId, reason, sourceTransactionId, deviceId, occurredAt = nowIso() }) {
    if (!DRAWER_TRIGGERS.has(trigger)) throw new Error(`Unauthorized cash drawer trigger ${trigger}`);
    if (trigger === 'MANAGER_OPEN' && (!operatorUserId || !String(reason ?? '').trim())) {
      throw new Error('MANAGER_OPEN requires operatorUserId and reason');
    }
    if (['CASH_SALE', 'PAID_IN', 'PAID_OUT'].includes(trigger) && !sourceTransactionId) {
      throw new Error(`${trigger} requires sourceTransactionId`);
    }
    const id = randomUUID();
    this.db.prepare('INSERT INTO cash_drawer_events(id,trigger,operator_user_id,reason,source_transaction_id,device_id,occurred_at) VALUES(?,?,?,?,?,?,?)')
      .run(id, trigger, operatorUserId ?? null, reason ? String(reason).slice(0, 500) : null, sourceTransactionId ?? null, required(deviceId, 'deviceId'), occurredAt);
    return { id, trigger, occurredAt };
  }

  upsertKdsTicket(ticket) {
    if (!ticket?.id || !ticket?.stationId) return null;
    this.db.prepare(`INSERT INTO kds_ticket_state(ticket_id,station_id,status,state_json,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(ticket_id) DO UPDATE SET station_id=excluded.station_id,status=excluded.status,state_json=excluded.state_json,updated_at=excluded.updated_at`)
      .run(ticket.id, ticket.stationId, ticket.status ?? 'NEW', canonicalJson(ticket), ticket.updatedAt ?? nowIso());
    return ticket;
  }

  diagnostics() {
    const commands = this.db.prepare(`SELECT COUNT(*) total,
      SUM(CASE WHEN state IN ('PENDING','RETRY') THEN 1 ELSE 0 END) pending,
      SUM(CASE WHEN state='SYNCED' THEN 1 ELSE 0 END) synced,
      SUM(CASE WHEN state='CONFLICT' THEN 1 ELSE 0 END) conflicts,
      SUM(CASE WHEN state='DEAD_LETTER' THEN 1 ELSE 0 END) dead_letter FROM local_commands`).get();
    const cash = this.db.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN cloud_state='PENDING' THEN 1 ELSE 0 END) pending FROM local_cash_ledger`).get();
    return {
      commands: Object.fromEntries(Object.entries(commands).map(([k, v]) => [k === 'dead_letter' ? 'deadLetter' : k, Number(v ?? 0)])),
      cashLedger: { total: Number(cash.total ?? 0), pending: Number(cash.pending ?? 0) },
      unresolvedConflicts: this.conflicts().length,
      snapshotCursor: this.store.getMeta('snapshotCursor'),
      snapshotUpdatedAt: this.store.getMeta('snapshotUpdatedAt'),
    };
  }

  #commandRow(row) {
    return {
      operationId: row.operation_id,
      deviceId: row.device_id,
      venueId: row.venue_id,
      localSequence: row.local_sequence,
      idempotencyKey: row.idempotency_key,
      operationType: row.operation_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      aggregateVersion: row.aggregate_version ?? undefined,
      payloadHash: row.payload_hash,
      payload: JSON.parse(row.payload_json),
      occurredAt: row.occurred_at,
      correlationId: row.correlation_id,
      state: row.state,
      attempts: row.attempts,
      lastError: row.last_error,
      result: row.result_json ? JSON.parse(row.result_json) : null,
    };
  }
}
