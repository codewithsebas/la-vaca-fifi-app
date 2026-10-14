// Service worker de la PWA (sitio y panel): muestra una página propia cuando no hay internet y las notificaciones
// push del equipo. No guarda páginas ni datos, porque disponibilidad, pagos y el panel siempre deben venir frescos del servidor.
// Al cambiar offline.html, sube la versión para que los celulares descarguen la nueva.
const CACHE = "vacafifi-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      // La precarga de navegación pide la página mientras arranca el service worker: no hace más lenta la carga.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

// ── Notificaciones push del equipo (las envía lib/server/push.ts) ──

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Panel de reservas", {
      body: data.body || "",
      icon: "/icons/panel-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag,
      data: { url: data.url || "/admin/notificaciones" },
      lang: "es",
      vibrate: [80, 40, 80],
    }),
  );
});

// Al tocarla: si el panel ya está abierto, lo trae al frente en esa página; si no, lo abre.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/admin", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const panel = windows.find((w) => new URL(w.url).pathname.startsWith("/admin")) || windows[0];
      if (panel) {
        await panel.focus();
        if (panel.url !== url && "navigate" in panel) return panel.navigate(url).catch(() => self.clients.openWindow(url));
        return;
      }
      return self.clients.openWindow(url);
    })(),
  );
});

// El navegador renovó la suscripción: se registra la nueva en el servidor (con la sesión del panel) y se borra la anterior.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const options = event.oldSubscription?.options;
      const sub = event.newSubscription || (options && (await self.registration.pushManager.subscribe(options)));
      if (!sub) return;
      await fetch("/api/admin/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "subscribe", subscription: sub.toJSON(), replaces: event.oldSubscription?.endpoint }),
      });
    })().catch(() => {}),
  );
});

// Solo navegaciones (abrir una página): primero la red; si falla por falta de conexión, la página sin conexión.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) || (await fetch(event.request));
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error();
      }
    })(),
  );
});
