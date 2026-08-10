const PRIVATE_NAV_CACHE = "gospots-private-nav-v1";

export async function purgeOfflinePrivateNavigationCache(): Promise<void> {
  if (typeof caches !== "undefined") {
    await caches.delete(PRIVATE_NAV_CACHE).catch(() => false);
  }
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.controller?.postMessage({
      type: "PURGE_PRIVATE_NAV_CACHE",
    });
  }
}
