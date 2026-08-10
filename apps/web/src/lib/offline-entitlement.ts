import { api } from "./api";
import { getOfflineContext, type OfflineNamespace } from "./offline-outbox";

const PREFIX = "gospots-offline-lite-enabled:";

function key(context: OfflineNamespace) {
  return `${PREFIX}${context.userId}:${context.shopId}`;
}

export function offlineLiteEnabled(): boolean {
  const context = getOfflineContext();
  if (!context || typeof localStorage === "undefined") return false;
  return localStorage.getItem(key(context)) === "1";
}

export async function refreshOfflineLiteEntitlement(): Promise<boolean> {
  const context = getOfflineContext();
  if (!context || typeof localStorage === "undefined") return false;
  const result = await api<{ enabled: boolean }>("/offline-sync/status");
  localStorage.setItem(key(context), result.enabled ? "1" : "0");
  return result.enabled;
}

export function purgeOfflineLiteEntitlement(context: OfflineNamespace): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(key(context));
}

export function purgeAllOfflineLiteEntitlements(): void {
  if (typeof localStorage === "undefined") return;
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const candidate = localStorage.key(index);
    if (candidate?.startsWith(PREFIX)) localStorage.removeItem(candidate);
  }
}
