const CORRETOR_CACHE = "flyimob-corretor-static-v1";
const CORRETOR_STATIC = ["/corretor-offline.html", "/corretor.webmanifest", "/academy-admin/icon-192.png", "/academy-admin/icon-512.png", "/academy-admin/icon-maskable.png"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CORRETOR_CACHE).then(cache => cache.addAll(CORRETOR_STATIC))); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("flyimob-corretor-static-") && key !== CORRETOR_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("message", event => { if (event.data?.type === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/academy-admin")) return;
  // Exact static allowlist only. Never cache APIs, authenticated HTML, documents, videos or RSC.
  if (CORRETOR_STATIC.includes(url.pathname) && !url.search) { event.respondWith(caches.open(CORRETOR_CACHE).then(cache => cache.match(event.request)).then(hit => hit || fetch(event.request))); return; }
  if (event.request.mode === "navigate") event.respondWith(fetch(event.request).catch(() => caches.open(CORRETOR_CACHE).then(cache => cache.match("/corretor-offline.html"))));
});
