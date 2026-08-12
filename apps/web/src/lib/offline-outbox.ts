import { api, ApiError } from "./api";

export type OfflineOperationType =
  | "CHECK_CREATE"
  | "CHECK_UPDATE"
  | "ORDER_CREATE"
  | "SESSION_START"
  | "SESSION_END";
export type OfflineSyncState = "PENDING" | "SYNCING" | "SYNCED" | "CONFLICT" | "FAILED";

export type OfflineNamespace = { userId: string; shopId: string };

export type OfflineOperationRecord = {
  key: string;
  namespace: string;
  operationId: string;
  deviceId: string;
  operationType: OfflineOperationType;
  entityId: string;
  expectedVersion?: number;
  occurredAt: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  createdAt: string;
  syncAttempts: number;
  lastSyncError: string | null;
  lastSyncCode: string | null;
  state: OfflineSyncState;
  syncedAt: string | null;
};

export type OfflineCounts = {
  pending: number;
  conflict: number;
  failed: number;
};

type CacheRecord = {
  key: string;
  namespace: string;
  cacheKey: string;
  value: unknown;
  updatedAt: string;
};

const DB_NAME = "gospots-offline-v1";
const DB_VERSION = 1;
const OUTBOX_STORE = "outbox";
const CACHE_STORE = "cache";
const DEVICE_KEY = "gospots-offline-device-id";
let activeNamespace: OfflineNamespace | null = null;
let syncInFlight: Promise<OfflineCounts> | null = null;

function namespaceKey(value: OfflineNamespace): string {
  return `${value.userId}:${value.shopId}`;
}

export function configureOfflineContext(value: OfflineNamespace | null): void {
  activeNamespace = value && value.userId && value.shopId ? value : null;
}

export function getOfflineContext(): OfflineNamespace | null {
  return activeNamespace;
}

function requireContext(): OfflineNamespace {
  if (!activeNamespace) throw new Error("Offline context is not configured for this venue.");
  return activeNamespace;
}

function browserIdb(): IDBFactory {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB is unavailable in this browser.");
  return indexedDB;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = browserIdb().open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = db.createObjectStore(OUTBOX_STORE, { keyPath: "key" });
        store.createIndex("namespace", "namespace", { unique: false });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const store = db.createObjectStore(CACHE_STORE, { keyPath: "key" });
        store.createIndex("namespace", "namespace", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open offline database."));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

async function inStore<T>(
  name: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(name, mode);
    const result = await run(tx.objectStore(name));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Offline database transaction failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Offline database transaction aborted."));
    });
    return result;
  } finally {
    db.close();
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export async function offlinePayloadHash(payload: Record<string, unknown>): Promise<string> {
  const input = new TextEncoder().encode(canonicalJson(payload));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  throw new Error("This browser does not provide secure UUID generation.");
}

export function offlineDeviceId(): string {
  if (typeof localStorage === "undefined") throw new Error("Offline device storage is unavailable.");
  const existing = localStorage.getItem(DEVICE_KEY)?.trim();
  if (existing) return existing;
  const created = randomUuid();
  localStorage.setItem(DEVICE_KEY, created);
  return created;
}

export async function queueOfflineOperation(input: {
  operationType: OfflineOperationType;
  entityId: string;
  expectedVersion?: number;
  occurredAt?: string;
  payload: Record<string, unknown>;
  operationId?: string;
}): Promise<OfflineOperationRecord> {
  const context = requireContext();
  const namespace = namespaceKey(context);
  const operationId = input.operationId ?? randomUuid();
  const payloadHash = await offlinePayloadHash(input.payload);
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const record: OfflineOperationRecord = {
    key: `${namespace}:${operationId}`,
    namespace,
    operationId,
    deviceId: offlineDeviceId(),
    operationType: input.operationType,
    entityId: input.entityId,
    ...(input.expectedVersion !== undefined ? { expectedVersion: input.expectedVersion } : {}),
    occurredAt,
    payloadHash,
    payload: input.payload,
    createdAt: new Date().toISOString(),
    syncAttempts: 0,
    lastSyncError: null,
    lastSyncCode: null,
    state: "PENDING",
    syncedAt: null,
  };
  await inStore(OUTBOX_STORE, "readwrite", async (store) => {
    const existing = await requestValue(store.get(record.key)) as OfflineOperationRecord | undefined;
    if (existing) {
      const same =
        existing.payloadHash === payloadHash &&
        existing.operationType === record.operationType &&
        existing.entityId === record.entityId &&
        existing.expectedVersion === record.expectedVersion &&
        existing.occurredAt === record.occurredAt;
      if (!same) throw new Error("Offline operation ID already exists with different content.");
      return;
    }
    await requestValue(store.add(record));
  });
  return record;
}

export async function listOfflineOperations(): Promise<OfflineOperationRecord[]> {
  const context = requireContext();
  const namespace = namespaceKey(context);
  return inStore(OUTBOX_STORE, "readonly", async (store) => {
    const rows = (await requestValue(store.index("namespace").getAll(namespace))) as OfflineOperationRecord[];
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  });
}

async function putOperation(record: OfflineOperationRecord): Promise<void> {
  await inStore(OUTBOX_STORE, "readwrite", async (store) => {
    await requestValue(store.put(record));
  });
}

export async function countOfflineOperations(): Promise<OfflineCounts> {
  if (!activeNamespace || typeof indexedDB === "undefined") return { pending: 0, conflict: 0, failed: 0 };
  const rows = await listOfflineOperations();
  return {
    pending: rows.filter((row) => row.state === "PENDING" || row.state === "SYNCING").length,
    conflict: rows.filter((row) => row.state === "CONFLICT").length,
    failed: rows.filter((row) => row.state === "FAILED").length,
  };
}

function syncError(error: unknown): { state: "PENDING" | "CONFLICT" | "FAILED"; code: string | null; message: string } {
  if (error instanceof ApiError) {
    if (error.status === 0) return { state: "PENDING", code: error.code ?? null, message: error.message };
    if (["VERSION_CONFLICT", "STATE_CONFLICT", "IDEMPOTENCY_CONFLICT", "RESOURCE_CONFLICT"].includes(error.code ?? "")) {
      return { state: "CONFLICT", code: error.code ?? null, message: error.message };
    }
    return { state: "FAILED", code: error.code ?? null, message: error.message };
  }
  return { state: "PENDING", code: null, message: error instanceof Error ? error.message : "Offline sync failed." };
}

async function syncOne(row: OfflineOperationRecord): Promise<void> {
  const syncing = { ...row, state: "SYNCING" as const, syncAttempts: row.syncAttempts + 1 };
  await putOperation(syncing);
  try {
    await api("/offline-sync/operations", {
      method: "POST",
      body: JSON.stringify({
        operationId: row.operationId,
        deviceId: row.deviceId,
        operationType: row.operationType,
        entityId: row.entityId,
        ...(row.expectedVersion !== undefined ? { expectedVersion: row.expectedVersion } : {}),
        occurredAt: row.occurredAt,
        payloadHash: row.payloadHash,
        payload: row.payload,
      }),
    });
    await putOperation({
      ...syncing,
      state: "SYNCED",
      lastSyncError: null,
      lastSyncCode: null,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    const result = syncError(error);
    await putOperation({
      ...syncing,
      state: result.state,
      lastSyncError: result.message.slice(0, 500),
      lastSyncCode: result.code,
    });
  }
}

export async function syncOfflineOutbox(): Promise<OfflineCounts> {
  if (syncInFlight) return syncInFlight;
  if (!activeNamespace || typeof navigator === "undefined" || !navigator.onLine) {
    return countOfflineOperations();
  }
  syncInFlight = (async () => {
    const rows = await listOfflineOperations();
    for (const row of rows) {
      if (row.state !== "PENDING" && row.state !== "SYNCING") continue;
      await syncOne(row);
      const latest = await listOfflineOperations();
      const current = latest.find((item) => item.key === row.key);
      if (current?.state === "PENDING") break;
    }
    return countOfflineOperations();
  })().finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

export async function retryOfflineOperation(key: string): Promise<void> {
  const rows = await listOfflineOperations();
  const row = rows.find((item) => item.key === key);
  if (!row) return;
  await putOperation({ ...row, state: "PENDING", lastSyncError: null, lastSyncCode: null });
}

export async function discardOfflineOperation(key: string): Promise<void> {
  const context = requireContext();
  if (!key.startsWith(`${namespaceKey(context)}:`)) throw new Error("Cannot discard another venue's offline operation.");
  await inStore(OUTBOX_STORE, "readwrite", async (store) => {
    await requestValue(store.delete(key));
  });
}

export async function cacheOfflineValue(cacheKey: string, value: unknown): Promise<void> {
  const context = requireContext();
  const namespace = namespaceKey(context);
  const record: CacheRecord = {
    key: `${namespace}:${cacheKey}`,
    namespace,
    cacheKey,
    value,
    updatedAt: new Date().toISOString(),
  };
  await inStore(CACHE_STORE, "readwrite", async (store) => {
    await requestValue(store.put(record));
  });
}

export async function readOfflineValue<T>(cacheKey: string): Promise<T | null> {
  const context = requireContext();
  const namespace = namespaceKey(context);
  return inStore(CACHE_STORE, "readonly", async (store) => {
    const row = (await requestValue(store.get(`${namespace}:${cacheKey}`))) as CacheRecord | undefined;
    return (row?.value as T | undefined) ?? null;
  });
}

async function deleteNamespaceFromStore(storeName: string, namespace: string): Promise<void> {
  await inStore(storeName, "readwrite", async (store) => {
    const index = store.index("namespace");
    const keys = await requestValue(index.getAllKeys(namespace));
    for (const key of keys) await requestValue(store.delete(key));
  });
}

export async function purgeOfflineNamespace(context: OfflineNamespace): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const namespace = namespaceKey(context);
  await deleteNamespaceFromStore(OUTBOX_STORE, namespace);
  await deleteNamespaceFromStore(CACHE_STORE, namespace);
}

export async function purgeAllOfflineData(): Promise<void> {
  activeNamespace = null;
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Unable to clear offline database."));
    request.onblocked = () => resolve();
  });
}
