/* global self, indexedDB */
// Academy scope only. No response caching: authenticated HTML/API/PII stay off disk.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate" || !new URL(event.request.url).pathname.startsWith("/academy-admin")) return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><title>Academy offline</title><body style="background:#020617;color:white;font-family:system-ui;padding:32px"><h1>Academy</h1><p>Sem conexão. Os dados comerciais precisam de acesso à internet.</p><a style="color:#fb923c" href="/academy-admin">Tentar novamente</a></body></html>',
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  )));
});

// A retried network delivery retains the same notification ID. Deduplicate in the
// worker as well as PostgreSQL, including retries after the server lost its ACK.
function claimNotification(id) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("academy-push-v1", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("seen");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("seen", "readwrite");
      const store = tx.objectStore("seen");
      let fresh = false;
      const get = store.get(id);
      get.onsuccess = () => {
        if (!get.result) { fresh = true; store.put(Date.now(), id); }
      };
      tx.oncomplete = () => { db.close(); resolve(fresh); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let message;
    try { message = event.data?.json(); } catch { return; }
    if (!message || typeof message.id !== "string" || typeof message.title !== "string" || typeof message.body !== "string") return;
    if (!await claimNotification(message.id)) return;
    await self.registration.showNotification(message.title, {
      body: message.body, tag: `academy-${message.id}`, renotify: false,
      icon: "/academy-admin/icon-192.png", badge: "/academy-admin/icon-192.png",
      data: { url: "/academy-admin" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).pathname.startsWith("/academy-admin"));
    if (existing) { await existing.navigate("/academy-admin"); return existing.focus(); }
    return self.clients.openWindow("/academy-admin");
  })());
});
