import { api, ApiError } from "./api";
import { offlineLiteEnabled } from "./offline-entitlement";
import { cacheOfflineValue, queueOfflineOperation, readOfflineValue } from "./offline-outbox";

export type OfflineOrderLineInput = {
  menuItemId: string;
  variantId?: string;
  modifierIds?: string[];
  quantity: number;
  seat?: number;
};

export type VenueOrderInput = {
  serviceMode: "QUICK_SALE" | "GUEST_CHECK" | "DINING" | "PLAY_SESSION" | "TAKEAWAY" | "PREORDER" | "EVENT";
  guestCheckId?: string;
  operationsSessionId?: string;
  resourceId?: string;
  seat?: number;
  guestLabel?: string;
  lines: OfflineOrderLineInput[];
};

export type OrderingCatalog = {
  items: Array<{ id: string; name: string; price: string | number; sectionId?: string | null }>;
  sections: Array<{ id: string; name: string; sortOrder?: number }>;
  variants: Array<{ id: string; menuItemId: string; name: string; priceDeltaMinor: number }>;
  groups: Array<{ id: string; name: string; required: boolean; minSelect: number; maxSelect: number }>;
  modifiers: Array<{ id: string; groupId: string; name: string; priceDeltaMinor: number }>;
  links: Array<{ menuItemId: string; modifierGroupId: string; sortOrder?: number }>;
};

export type LocalVenueOrder = {
  id: string;
  status: "OPEN";
  pendingServerPricing: boolean;
  createdAt: string;
  input: VenueOrderInput;
};

const CATALOG_CACHE_KEY = "ordering:catalog";
const LOCAL_ORDERS_CACHE_KEY = "ordering:local-orders";

function offlineNow() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function requireOfflineLite() {
  if (!offlineLiteEnabled()) throw new Error("Offline Lite is not enabled for this venue.");
}

function isNetworkFailure(error: unknown) {
  return error instanceof ApiError && error.status === 0;
}

export async function fetchOrderingCatalog(): Promise<OrderingCatalog> {
  if (offlineNow()) {
    requireOfflineLite();
    const cached = await readOfflineValue<OrderingCatalog>(CATALOG_CACHE_KEY);
    if (!cached) throw new Error("The menu has not been cached for offline ordering yet.");
    return cached;
  }
  try {
    const catalog = await api<OrderingCatalog>("/ordering/catalog");
    await cacheOfflineValue(CATALOG_CACHE_KEY, catalog).catch(() => undefined);
    return catalog;
  } catch (error) {
    if (isNetworkFailure(error) && offlineLiteEnabled()) {
      const cached = await readOfflineValue<OrderingCatalog>(CATALOG_CACHE_KEY);
      if (cached) return cached;
    }
    throw error;
  }
}

export async function createVenueOrder(input: VenueOrderInput) {
  if (!offlineNow()) {
    return api("/ordering/orders", { method: "POST", body: JSON.stringify(input) });
  }
  requireOfflineLite();
  if (!input.lines.length) throw new Error("Add at least one order line.");
  const id = globalThis.crypto.randomUUID();
  const occurredAt = new Date().toISOString();
  await queueOfflineOperation({
    operationType: "ORDER_CREATE",
    entityId: id,
    occurredAt,
    payload: input as unknown as Record<string, unknown>,
  });
  const row: LocalVenueOrder = {
    id,
    status: "OPEN",
    pendingServerPricing: true,
    createdAt: occurredAt,
    input,
  };
  const existing = (await readOfflineValue<LocalVenueOrder[]>(LOCAL_ORDERS_CACHE_KEY)) ?? [];
  await cacheOfflineValue(LOCAL_ORDERS_CACHE_KEY, [row, ...existing.filter((candidate) => candidate.id !== id)]);
  return row;
}

export async function readLocalVenueOrders(): Promise<LocalVenueOrder[]> {
  return (await readOfflineValue<LocalVenueOrder[]>(LOCAL_ORDERS_CACHE_KEY)) ?? [];
}
