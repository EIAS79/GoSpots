import { api, ApiError } from "./api";
import { offlineLiteEnabled } from "./offline-entitlement";
import { cacheOfflineValue, queueOfflineOperation, readOfflineValue } from "./offline-outbox";

export type OperationsSessionTimer = {
  elapsedSeconds: number;
  remainingSeconds: number | null;
  effectiveScheduledEndAt?: string | null;
  autoExtensionCountProjected: number;
  openPauseSeconds: number;
  alerts: string[];
};

export type OperationsSessionView = {
  id: string;
  status: string;
  startedAt: string;
  pausedAt?: string | null;
  finishedAt?: string | null;
  scheduledEndAt?: string | null;
  billingMode?: string;
  fixedDurationMinutes?: number | null;
  participantCount?: number;
  liveAccruedMinor: number;
  accruedMinor?: number;
  currency: string;
  guestCheckId?: string | null;
  customerId?: string | null;
  membershipId?: string | null;
  notes?: string | null;
  pauseBillingMode?: "STOP_CHARGING" | "CONTINUE_CHARGING";
  moveRatePolicy?: "KEEP_SESSION_RATE" | "REPRICE_TARGET";
  autoExtend?: boolean;
  extensionMinutes?: number;
  warningMinutes?: number[];
  alerts?: string[];
  timer?: OperationsSessionTimer;
  customer?: { id: string; name?: string | null; email?: string | null; phone?: string | null } | null;
  membership?: { id: string; tierId: string; status: string; expiresAt?: string | null } | null;
  openOrderAmountMinor?: number;
  openOrderCount?: number;
  openCheckAmountDueMinor?: number | null;
  openCheckCurrency?: string | null;
  version: number;
};

export type OperationsResourceView = {
  id: string;
  code?: string;
  name: string;
  type: string;
  state: string;
  categoryName?: string | null;
  sectionName?: string | null;
  session?: OperationsSessionView | null;
  maintenance?: {
    id: string;
    reason: string;
    expectedReturnAt?: string | null;
    notes?: string | null;
  } | null;
  nextReservation?: {
    id: string;
    startsAt: string;
    endsAt: string;
    guestName?: string | null;
  } | null;
};

export type OperationsFloorView = { generatedAt: string; resources: OperationsResourceView[] };

const FLOOR_CACHE_KEY = "operations:floor";

function offlineNow() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function requireOfflineLite() {
  if (!offlineLiteEnabled()) {
    throw new Error("Offline Lite is not enabled for this venue. Reconnect before continuing.");
  }
}

function isNetworkFailure(error: unknown) {
  return error instanceof ApiError && error.status === 0;
}

async function cachedFloor(): Promise<OperationsFloorView> {
  const cached = await readOfflineValue<OperationsFloorView>(FLOOR_CACHE_KEY);
  if (!cached) throw new Error("The live floor has not been cached for offline use yet.");
  return cached;
}

async function storeFloor(floor: OperationsFloorView) {
  await cacheOfflineValue(FLOOR_CACHE_KEY, floor);
  return floor;
}

export async function fetchOperationsFloor(): Promise<OperationsFloorView> {
  if (offlineNow()) {
    requireOfflineLite();
    return cachedFloor();
  }
  try {
    const floor = await api<OperationsFloorView>("/operations/floor");
    await storeFloor(floor).catch(() => undefined);
    return floor;
  } catch (error) {
    if (isNetworkFailure(error) && offlineLiteEnabled()) return cachedFloor();
    throw error;
  }
}

export async function startOperationsSession(body: {
  resourceId: string;
  groupId?: string;
  guestCheckId?: string;
  reservationId?: string;
  ratePlanId?: string;
  customerId?: string;
  membershipId?: string;
  packageId?: string;
  notes?: string;
  participantCount?: number;
  gameCount?: number;
}) {
  if (!offlineNow()) {
    return api<OperationsSessionView>("/operations/sessions/start", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }
  requireOfflineLite();
  const floor = await cachedFloor();
  const resource = floor.resources.find((row) => row.id === body.resourceId);
  if (!resource) throw new Error("This resource is not available in the offline floor cache.");
  if (resource.state !== "AVAILABLE" || resource.session || resource.maintenance) {
    throw new Error("This resource is not locally available. Review the floor before starting it.");
  }
  const now = new Date().toISOString();
  const id = globalThis.crypto.randomUUID();
  const currency = floor.resources.find((row) => row.session?.currency)?.session?.currency ?? "";
  const session: OperationsSessionView = {
    id,
    status: "ACTIVE",
    startedAt: now,
    participantCount: body.participantCount ?? 1,
    liveAccruedMinor: 0,
    currency,
    guestCheckId: body.guestCheckId ?? null,
    customerId: body.customerId ?? null,
    membershipId: body.membershipId ?? null,
    notes: body.notes ?? null,
    version: 1,
  };
  await queueOfflineOperation({
    operationType: "SESSION_START",
    entityId: id,
    occurredAt: now,
    payload: body,
  });
  await storeFloor({
    generatedAt: now,
    resources: floor.resources.map((row) =>
      row.id === resource.id ? { ...row, state: "OCCUPIED", session } : row,
    ),
  });
  return session;
}

export async function finishOperationsSession(
  sessionId: string,
  expectedVersion: number,
) {
  if (!offlineNow()) {
    return api<OperationsSessionView>(`/operations/sessions/${sessionId}/finish`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion }),
    });
  }
  requireOfflineLite();
  const floor = await cachedFloor();
  const resource = floor.resources.find((row) => row.session?.id === sessionId);
  const session = resource?.session;
  if (!resource || !session) throw new Error("This session is not available in the offline floor cache.");
  if (session.status !== "ACTIVE" && session.status !== "PAUSED") {
    throw new Error("This session is already finished locally.");
  }
  const now = new Date().toISOString();
  await queueOfflineOperation({
    operationType: "SESSION_END",
    entityId: session.id,
    expectedVersion: session.version,
    occurredAt: now,
    payload: {},
  });
  const finished: OperationsSessionView = {
    ...session,
    status: "FINISHED",
    finishedAt: now,
    version: session.version + 1,
  };
  await storeFloor({
    generatedAt: now,
    resources: floor.resources.map((row) =>
      row.id === resource.id ? { ...row, state: "AVAILABLE", session: null } : row,
    ),
  });
  return finished;
}
