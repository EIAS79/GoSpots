import type { ShopSettings } from "./shop-settings-client";

const PREFIX = "gospots-offline-shop-v1:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Snapshot = {
  savedAt: number;
  userId: string;
  venuePath: string;
  shop: ShopSettings;
};

function key(userId: string, venuePath: string) {
  return `${PREFIX}${userId}:${venuePath}`;
}

function purgeOtherSnapshots(keepKey: string) {
  if (typeof localStorage === "undefined") return;
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const candidate = localStorage.key(index);
    if (candidate?.startsWith(PREFIX) && candidate !== keepKey) {
      localStorage.removeItem(candidate);
    }
  }
}

export function saveOfflineShopSnapshot(
  userId: string,
  venuePath: string,
  shop: ShopSettings,
): void {
  if (typeof localStorage === "undefined") return;
  const storageKey = key(userId, venuePath);
  purgeOtherSnapshots(storageKey);
  const snapshot: Snapshot = {
    savedAt: Date.now(),
    userId,
    venuePath,
    shop,
  };
  localStorage.setItem(storageKey, JSON.stringify(snapshot));
}

export function readOfflineShopSnapshot(
  userId: string,
  venuePath: string,
): ShopSettings | null {
  if (typeof localStorage === "undefined") return null;
  const storageKey = key(userId, venuePath);
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    if (
      parsed.userId !== userId ||
      parsed.venuePath !== venuePath ||
      typeof parsed.savedAt !== "number" ||
      Date.now() - parsed.savedAt > MAX_AGE_MS ||
      !parsed.shop
    ) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return parsed.shop;
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
}

export function purgeOfflineShopSnapshots(): void {
  if (typeof localStorage === "undefined") return;
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const candidate = localStorage.key(index);
    if (candidate?.startsWith(PREFIX)) localStorage.removeItem(candidate);
  }
}
