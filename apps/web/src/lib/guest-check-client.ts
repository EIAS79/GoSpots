import { api, ApiError } from "./api";
import {
  cacheOfflineValue,
  getOfflineContext,
  queueOfflineOperation,
  readOfflineValue,
} from "./offline-outbox";

export type GuestCheckStatus = "OPEN" | "SETTLED" | "VOID";

export type GuestCheckTotalLine = {
  kind: "MENU" | "PLAY" | "FEE" | "EXCLUDED_PLAY";
  sourceType: "SHOP_ORDER" | "PLAY_SESSION" | "RESERVATION";
  sourceId: string;
  label: string;
  amount: string;
  excluded: boolean;
  reason?: string;
};

export type GuestCheck = {
  id: string;
  shopId: string;
  status: GuestCheckStatus;
  version: number;
  currentSettlementId: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  partySize: number;
  label: string | null;
  note: string | null;
  currency: string | null;
  paymentMethod: string | null;
  openedAt: string;
  settledAt: string | null;
  voidedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  shopOrders: Array<{
    id: string;
    status: string;
    total: string;
    label: string | null;
    reservationFee: string | null;
    guestCount: number;
    createdAt: string;
    completedAt: string | null;
  }>;
  playSessions: Array<{
    id: string;
    status: string;
    amount: string;
    reservationId: string | null;
    label: string | null;
    startedAt: string;
    completedAt: string | null;
  }>;
  reservations: Array<{
    id: string;
    guestName: string;
    billedAmount: string | null;
    billedAt: string | null;
    resourceId: string | null;
    startsAt: string;
    endsAt: string;
    status: string;
  }>;
  runningTotal: string;
  menuTotal: string;
  playTotal: string;
  reservationTotal: string;
  totalLines: GuestCheckTotalLine[];
};

export type GuestCheckListResponse = {
  checks: GuestCheck[];
  canWrite: boolean;
};

type GuestCheckMutation = {
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  partySize?: number;
  label?: string;
  note?: string;
};

const OPEN_CACHE_KEY = "guest-checks:OPEN";

function offlineNow() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function isNetworkFailure(error: unknown) {
  return error instanceof ApiError && error.status === 0;
}

async function cacheOpenChecks(response: GuestCheckListResponse) {
  await cacheOfflineValue(OPEN_CACHE_KEY, response).catch(() => undefined);
  for (const check of response.checks) {
    await cacheOfflineValue(`guest-check:${check.id}`, check).catch(() => undefined);
  }
}

async function cachedOpenChecks(): Promise<GuestCheckListResponse> {
  const cached = await readOfflineValue<GuestCheckListResponse>(OPEN_CACHE_KEY);
  return cached ?? { checks: [], canWrite: true };
}

async function putLocalOpenCheck(check: GuestCheck): Promise<void> {
  await cacheOfflineValue(`guest-check:${check.id}`, check);
  const cached = await cachedOpenChecks();
  const checks = [check, ...cached.checks.filter((row) => row.id !== check.id)];
  await cacheOfflineValue(OPEN_CACHE_KEY, { ...cached, checks });
}

function localCheck(body: GuestCheckMutation): GuestCheck {
  const context = getOfflineContext();
  if (!context) throw new Error("Offline venue context is not ready.");
  const now = new Date().toISOString();
  const id = globalThis.crypto.randomUUID();
  return {
    id,
    shopId: context.shopId,
    status: "OPEN",
    version: 1,
    currentSettlementId: null,
    guestName: body.guestName?.trim() || null,
    guestEmail: body.guestEmail?.trim() || null,
    guestPhone: body.guestPhone?.trim() || null,
    partySize: body.partySize ?? 1,
    label: body.label?.trim() || null,
    note: body.note?.trim() || null,
    currency: null,
    paymentMethod: null,
    openedAt: now,
    settledAt: null,
    voidedAt: null,
    createdById: context.userId,
    createdAt: now,
    updatedAt: now,
    shopOrders: [],
    playSessions: [],
    reservations: [],
    runningTotal: "0.0000",
    menuTotal: "0.0000",
    playTotal: "0.0000",
    reservationTotal: "0.0000",
    totalLines: [],
  };
}

async function createGuestCheckOffline(body: GuestCheckMutation): Promise<GuestCheck> {
  const check = localCheck(body);
  await queueOfflineOperation({
    operationType: "CHECK_CREATE",
    entityId: check.id,
    payload: body,
  });
  await putLocalOpenCheck(check);
  return check;
}

async function updateGuestCheckOffline(id: string, body: GuestCheckMutation): Promise<GuestCheck> {
  const cached = await readOfflineValue<GuestCheck>(`guest-check:${id}`);
  if (!cached) throw new Error("This check is not available in the offline cache.");
  if (cached.status !== "OPEN") throw new Error("This check is no longer open.");
  const expectedVersion = cached.version;
  const next: GuestCheck = {
    ...cached,
    ...(body.guestName !== undefined ? { guestName: body.guestName.trim() || null } : {}),
    ...(body.guestEmail !== undefined ? { guestEmail: body.guestEmail.trim() || null } : {}),
    ...(body.guestPhone !== undefined ? { guestPhone: body.guestPhone.trim() || null } : {}),
    ...(body.partySize !== undefined ? { partySize: body.partySize } : {}),
    ...(body.label !== undefined ? { label: body.label.trim() || null } : {}),
    ...(body.note !== undefined ? { note: body.note.trim() || null } : {}),
    version: expectedVersion + 1,
    currentSettlementId: null,
    updatedAt: new Date().toISOString(),
  };
  await queueOfflineOperation({
    operationType: "CHECK_UPDATE",
    entityId: id,
    expectedVersion,
    payload: body,
  });
  await putLocalOpenCheck(next);
  return next;
}

export async function fetchGuestChecks(status: GuestCheckStatus | "ALL" = "OPEN") {
  const q = status === "OPEN" ? "" : `?status=${status}`;
  if (offlineNow()) {
    if (status !== "OPEN") return { checks: [], canWrite: false } satisfies GuestCheckListResponse;
    return cachedOpenChecks();
  }
  try {
    const response = await api<GuestCheckListResponse>(`/guest-checks${q}`);
    if (status === "OPEN") await cacheOpenChecks(response);
    return response;
  } catch (error) {
    if (status === "OPEN" && isNetworkFailure(error)) return cachedOpenChecks();
    throw error;
  }
}

export async function fetchGuestCheck(id: string) {
  if (offlineNow()) {
    const cached = await readOfflineValue<GuestCheck>(`guest-check:${id}`);
    if (!cached) throw new Error("This check is not available offline.");
    return cached;
  }
  try {
    const check = await api<GuestCheck>(`/guest-checks/${id}`);
    await cacheOfflineValue(`guest-check:${id}`, check).catch(() => undefined);
    return check;
  } catch (error) {
    if (isNetworkFailure(error)) {
      const cached = await readOfflineValue<GuestCheck>(`guest-check:${id}`);
      if (cached) return cached;
    }
    throw error;
  }
}

export async function createGuestCheck(body: GuestCheckMutation) {
  if (offlineNow()) return createGuestCheckOffline(body);
  try {
    const check = await api<GuestCheck>("/guest-checks", {
      method: "POST",
      body: JSON.stringify(body),
    });
    await putLocalOpenCheck(check).catch(() => undefined);
    return check;
  } catch (error) {
    if (isNetworkFailure(error)) return createGuestCheckOffline(body);
    throw error;
  }
}

export async function updateGuestCheck(id: string, body: GuestCheckMutation) {
  if (offlineNow()) return updateGuestCheckOffline(id, body);
  try {
    const check = await api<GuestCheck>(`/guest-checks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    await putLocalOpenCheck(check).catch(() => undefined);
    return check;
  } catch (error) {
    if (isNetworkFailure(error)) return updateGuestCheckOffline(id, body);
    throw error;
  }
}

function requireOnline(label: string) {
  if (offlineNow()) throw new Error(`${label} is unavailable offline. Reconnect before continuing.`);
}

export function voidGuestCheck(id: string) {
  requireOnline("Voiding a check");
  return api<GuestCheck>(`/guest-checks/${id}/void`, { method: "POST" });
}

export function settleGuestCheck(
  id: string,
  body: { paymentMethod?: string; note?: string } = {},
) {
  requireOnline("Final check settlement");
  return api<GuestCheck>(`/guest-checks/${id}/settle`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function attachToGuestCheck(
  id: string,
  body: {
    shopOrderId?: string;
    playSessionId?: string;
    reservationId?: string;
  },
) {
  requireOnline("Attaching cloud activity to a check");
  return api<GuestCheck>(`/guest-checks/${id}/attach`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function detachFromGuestCheck(
  id: string,
  body: {
    shopOrderId?: string;
    playSessionId?: string;
    reservationId?: string;
  },
) {
  requireOnline("Detaching cloud activity from a check");
  return api<GuestCheck>(`/guest-checks/${id}/detach`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
