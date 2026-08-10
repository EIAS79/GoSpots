const CACHE_VERSION = "gospots-shell-v1";
const PRIVATE_NAV_CACHE = "gospots-private-nav-v1";
const SHELL = ["/", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.allSettled(SHELL.map((url) => cache.add(url))).then(() => self.skipWaiting()),
    ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION && key !== PRIVATE_NAV_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "PURGE_PRIVATE_NAV_CACHE") {
    event.waitUntil(caches.delete(PRIVATE_NAV_CACHE));
  }
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/api/v1/");
}

function isDashboardNavigation(url) {
  return url.origin === self.location.origin && url.pathname.startsWith("/dashboard/");
}

function cacheableStatic(request, url) {
  if (request.method !== "GET") return false;
  if (isApiRequest(url)) return false;
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/") ||
      url.pathname === "/favicon.ico")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never cache API responses. Tenant operational data lives in the explicit
  // user+Shop IndexedDB namespace. Only the already-open dashboard HTML shell
  // may be cached, and the app purges that private navigation cache on logout,
  // session revocation and venue switch.
  if (isApiRequest(url) || request.method !== "GET") return;

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok && isDashboardNavigation(url)) {
            const copy = response.clone();
            void caches.open(PRIVATE_NAV_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        } catch {
          const privateCached = isDashboardNavigation(url)
            ? await caches.open(PRIVATE_NAV_CACHE).then((cache) => cache.match(request))
            : undefined;
          return privateCached || (await caches.match("/offline")) || (await caches.match("/"));
        }
      })(),
    );
    return;
  }

  if (!cacheableStatic(request, url)) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          void caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
