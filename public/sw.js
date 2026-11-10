// Service worker de la PWA (sitio y panel): la aplicación del panel para abrirla sin internet, una página propia para el
// sitio sin conexión y las notificaciones push del equipo. Nunca guarda respuestas de /api: los datos del panel viven en
// IndexedDB (lib/offline), por usuario, y la disponibilidad y los pagos los sigue decidiendo el servidor.
// Al cambiar offline.html, sube la versión para que los celulares descarguen la nueva.
const CACHE = "vacafifi-offline-v6";
const OFFLINE_URL = "/offline.html";
// Páginas del panel (sin datos privados: esos los pone el navegador) y archivos de la aplicación, con hash e inmutables.
const SHELL = "vacafifi-panel-shell-v1";
const STATIC = "vacafifi-panel-static-v1";
const MEDIA = "vacafifi-panel-media-v1";
const KEEP = [CACHE, SHELL, STATIC, MEDIA];
const MEDIA_LIMIT = 150;
// Lista de archivos de la compilación (scripts/build.mjs).
const ASSETS_URL = "/sw-assets.json";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (!KEEP.includes(key)) await caches.delete(key);
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

// ── Aplicación del panel sin conexión ──

// Rutas con parámetro: todas comparten la misma estructura de página y el componente toma el parámetro de la dirección
// (usePathname). Una sola copia sirve para abrir, sin internet, una reserva que nunca se abrió en este dispositivo.
const TEMPLATES = [
  [/^\/admin\/reservas\/[^/]+$/, "/admin/reservas/VF-00000"],
  [/^\/admin\/clientes\/[^/]+$/, "/admin/clientes/cc-00000"],
  [/^\/admin\/cabanas\/(?!nueva$)[^/]+$/, "/admin/cabanas/plantilla"],
];
const templateOf = (pathname) => TEMPLATES.find(([re]) => re.test(pathname))?.[1] ?? pathname;
const isPanel = (pathname) => pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/vista-previa";

// Abrir una página del panel: primero la red; sin conexión, su copia (o la de su estructura, o el inicio del panel).
async function panelPage(event, url) {
  const key = templateOf(url.pathname);
  try {
    const res = (await event.preloadResponse) || (await fetch(event.request));
    // Solo se guarda si el panel ya se preparó para usarse sin conexión (precacheShell).
    if (res.ok && !res.redirected && (await caches.has(SHELL))) {
      const copy = res.clone();
      event.waitUntil(caches.open(SHELL).then((c) => c.put(key, copy)));
    }
    return res;
  } catch {
    return (
      (await caches.match(key, { cacheName: SHELL })) ||
      (await caches.match("/admin", { cacheName: SHELL })) ||
      (await caches.match(OFFLINE_URL)) ||
      Response.error()
    );
  }
}

// Clave de un archivo de la aplicación: Next pide "%5Bcodigo%5D" y la lista de archivos dice "[codigo]". Sin la consulta.
const staticKey = (url) => new URL(decodeURI(url.pathname), url.origin).href;

async function cacheFirst(cacheName, request, key = request) {
  const hit = await caches.match(key, { cacheName });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const copy = res.clone();
    const cache = await caches.open(cacheName);
    await cache.put(key, copy);
    if (cacheName === MEDIA) {
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MEDIA_LIMIT)).map((k) => cache.delete(k)));
    }
  }
  return res;
}

// Copia nueva si hay internet (íconos, sonido, manifiesto); si no, la guardada.
async function networkFirst(cacheName, request) {
  try {
    const res = await fetch(request);
    if (res.ok) {
      const copy = res.clone();
      await (await caches.open(cacheName)).put(request, copy);
    }
    return res;
  } catch {
    return (await caches.match(request, { cacheName })) || Response.error();
  }
}

// El panel pide prepararse al abrir con sesión (lib/offline/precache.ts): guarda sus páginas y los archivos de esta compilación.
// Los de compilaciones anteriores se borran; si la lista no está disponible, no se toca nada.
async function precacheShell(pages) {
  const shell = await caches.open(SHELL);
  await Promise.all(
    pages.map(async (page) => {
      try {
        const res = await fetch(page, { credentials: "same-origin" });
        if (res.ok && !res.redirected) await shell.put(page, res);
      } catch {}
    }),
  );
  let files = null;
  try {
    const res = await fetch(ASSETS_URL, { cache: "no-store" });
    if (res.ok) files = (await res.json()).files;
  } catch {}
  if (!Array.isArray(files)) return;
  const cache = await caches.open(STATIC);
  const wanted = new Set(files);
  await Promise.all(
    files.map(async (file) => {
      const key = staticKey(new URL(file, self.location.origin));
      if (await cache.match(key)) return;
      try {
        const res = await fetch(file);
        if (res.ok) await cache.put(key, res);
      } catch {}
    }),
  );
  for (const req of await cache.keys()) if (!wanted.has(decodeURI(new URL(req.url).pathname))) await cache.delete(req);
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "vf-precache" || !Array.isArray(event.data.pages)) return;
  const reply = event.ports?.[0];
  const pages = event.data.pages.filter((p) => typeof p === "string" && isPanel(p));
  event.waitUntil(precacheShell(pages).finally(() => reply?.postMessage({ done: true })));
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    if (isPanel(url.pathname)) return event.respondWith(panelPage(event, url));
    // Sitio público: primero la red; si falla por falta de conexión, la página sin conexión.
    return event.respondWith(
      (async () => {
        try {
          return (await event.preloadResponse) || (await fetch(request));
        } catch {
          return (await caches.match(OFFLINE_URL)) || Response.error();
        }
      })(),
    );
  }
  // Solo en un dispositivo preparado para el panel: quien solo visita el sitio público no guarda nada de esto.
  const prepared = (handler) => event.respondWith(caches.has(SHELL).then((yes) => (yes ? handler() : fetch(request))));
  if (url.pathname.startsWith("/_next/static/")) return prepared(() => cacheFirst(STATIC, request, staticKey(url)));
  if (url.pathname.startsWith("/_next/image")) return prepared(() => cacheFirst(MEDIA, request));
  if (url.pathname === "/admin/manifest.webmanifest" || url.pathname === "/favicon.ico" || /^\/(icons|sounds|correo)\//.test(url.pathname))
    return prepared(() => networkFirst(MEDIA, request));
});
