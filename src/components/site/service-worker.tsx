"use client";

import { useEffect } from "react";

// Registra public/sw.js (página sin conexión de la PWA). Solo en producción. En desarrollo se quita el que haya quedado en este
// navegador (de una compilación probada aquí, o de otra app que usó el mismo puerto): sirve los archivos de la aplicación desde
// su caché, así que el navegador seguiría usando código viejo aunque se recargue.
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister().catch(() => {})))
        .catch(() => {});
      caches
        .keys()
        .then((keys) => keys.filter((k) => k.startsWith("vacafifi-")).forEach((k) => caches.delete(k)))
        .catch(() => {});
      return;
    }
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((r) => r.update())
      .catch(() => {});
  }, []);
  return null;
}
