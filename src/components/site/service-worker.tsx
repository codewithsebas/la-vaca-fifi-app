"use client";

import { useEffect } from "react";

// Registra public/sw.js (página sin conexión de la PWA). Solo en producción: en desarrollo no interfiere con la recarga en caliente.
// Si en este navegador ya hay un service worker (uno anterior, o el de otra app que usó el mismo puerto en desarrollo), se le
// pide actualizarse de inmediato: así se reemplaza por el nuestro y muestra la página sin conexión de La Vaca Fifí.
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.update().catch(() => {})))
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
