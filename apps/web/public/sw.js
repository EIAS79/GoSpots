const CACHE_VERSION = "gospots-shell-v1";
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
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/") || url.pathname.startsWith("/api/v1/");
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

  // Never cache credentialed/API data. Offline tenant data lives only in the
  // explicit user+Shop IndexedDB namespace managed by the application.
  if (isApiRequest(url) || request.method !== "GET") return;

  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        return cached || caches.match("/offline") || caches.match("/");
      }),
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
